import type { CacheItem, Job, OutputFile, Product, SettingItem } from "./types"

function sleep(ms = 180) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

const products: Product[] = [
  { product_id: "P-1001", name: "Linen Shirt", category: "Top", image_count: 6, has_plan: true, output_count: 4 },
  { product_id: "P-1002", name: "Wool Coat", category: "Outer", image_count: 4, has_plan: false, output_count: 0 },
  { product_id: "P-1003", name: "Pleated Skirt", category: "Bottom", image_count: 3, has_plan: true, output_count: 2 },
]

const SETTINGS_STORAGE_KEY = "imageworkflow-settings-v1"

const defaultSettings: SettingItem[] = [
  { key: "ANALYSIS_API_BASE_URL", value: "https://api.example.com/v1", group: "gateway" },
  { key: "ANALYSIS_API_KEY", value: "sk-demo-analysis-key", secret: true, hasValue: true, group: "gateway" },
  { key: "IMAGE_API_BASE_URL", value: "https://api.example.com/v1", group: "gateway" },
  { key: "IMAGE_API_KEY", value: "sk-demo-image-key", secret: true, hasValue: true, group: "gateway" },
  { key: "IMAGE_API_URL", value: "/v1/images/edits", group: "gateway" },
  { key: "IMAGE_GEN_PROVIDER", value: "custom", group: "gateway" },
  { key: "IMAGE_API_FALLBACK_BASE_URLS", value: "", group: "gateway" },
  { key: "ANALYSIS_MODEL", value: "gpt-4.1", group: "model" },
  { key: "IMAGE_MODEL", value: "gpt-image-1", group: "model" },
  { key: "ASPECT_RATIO", value: "1:1", group: "output" },
  { key: "FINAL_IMAGE_SIZE", value: "1536x1536", group: "output" },
  { key: "OUTPUT_DIR", value: "apps/backend/output", group: "output" },
]

function cloneSettings(list: SettingItem[]) {
  return list.map((item) => ({ ...item }))
}

function maskSecret(value: string, hasValue: boolean) {
  if (!hasValue || !value) {
    return ""
  }
  return "*".repeat(Math.max(8, Math.min(value.length, 18)))
}

function toPublicSettings(list: SettingItem[], reveal = false) {
  return list.map((item) => {
    if (!item.secret) {
      return { ...item, hasValue: Boolean(item.value) }
    }

    return {
      ...item,
      hasValue: Boolean(item.value),
      value: reveal ? item.value : maskSecret(item.value, Boolean(item.value)),
    }
  })
}

function loadSettings() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) {
      return cloneSettings(defaultSettings)
    }

    const parsed = JSON.parse(raw) as SettingItem[]
    if (!Array.isArray(parsed)) {
      return cloneSettings(defaultSettings)
    }

    const map = new Map(parsed.map((item) => [item.key, item]))
    return defaultSettings.map((item) => {
      const saved = map.get(item.key)
      return saved ? { ...item, ...saved } : { ...item }
    })
  } catch {
    return cloneSettings(defaultSettings)
  }
}

let settings = loadSettings()

function persistSettings() {
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
}

const outputsByProduct: Record<string, OutputFile[]> = {
  "P-1001": [
    { id: "1", filename: "main.png", kind: "main", size: 219_540, updatedAt: "2026-05-14 17:20" },
    { id: "2", filename: "sku_black.png", kind: "sku", size: 163_202, updatedAt: "2026-05-14 17:21" },
  ],
  "P-1003": [{ id: "3", filename: "detail_1.png", kind: "detail", size: 126_900, updatedAt: "2026-05-14 17:11" }],
}

const caches: CacheItem[] = [
  { filename: "global_style.json", group: "global_style", size: 3332, updatedAt: "2026-05-14 16:58" },
  { filename: "P-1001-plan.json", group: "generation_plan", size: 7481, updatedAt: "2026-05-14 17:07" },
]

let jobs: Job[] = []

export const mockApi = {
  async listProducts() {
    await sleep()
    return [...products]
  },
  async listSettings(reveal = false) {
    await sleep()
    return toPublicSettings(settings, reveal)
  },
  async saveSettings(values: Record<string, string>) {
    await sleep(260)
    settings = settings.map((item) => {
      if (!(item.key in values)) {
        return item
      }

      const nextValue = values[item.key] ?? ""
      return {
        ...item,
        value: nextValue,
        hasValue: item.secret ? Boolean(nextValue) : undefined,
      }
    })
    persistSettings()
    return toPublicSettings(settings, false)
  },
  async testSettings(kind: "analysis" | "image", values: Record<string, string>) {
    await sleep(520)
    const prefix = kind === "analysis" ? "ANALYSIS" : "IMAGE"
    const baseUrl = (values[`${prefix}_API_BASE_URL`] || "").trim()
    const apiKey = (values[`${prefix}_API_KEY`] || "").trim()

    if (!baseUrl || !apiKey) {
      return {
        ok: false,
        status_code: null,
        message: "缺少 Base URL 或 API Key。",
      }
    }

    if (!/^https?:\/\//.test(baseUrl)) {
      return {
        ok: false,
        status_code: 400,
        message: "Base URL 必须以 http:// 或 https:// 开头。",
      }
    }

    return {
      ok: true,
      status_code: 200,
      message: `${kind === "analysis" ? "分析" : "生图"}网关可用，认证通过。`,
    }
  },
  async fetchModels(kind: "analysis" | "image", values: Record<string, string>) {
    await sleep(420)
    const probe = await this.testSettings(kind, values)
    if (!probe.ok) {
      return {
        ok: false,
        models: [],
        message: probe.message,
      }
    }

    return {
      ok: true,
      models:
        kind === "analysis"
          ? ["gpt-4.1", "gpt-4.1-mini", "claude-sonnet-4-5"]
          : ["gpt-image-1", "gpt-image-1-hd", "flux-pro-1.1"],
      message: "模型列表已刷新。",
    }
  },
  async listOutputs(productId: string) {
    await sleep()
    return outputsByProduct[productId] ? [...outputsByProduct[productId]] : []
  },
  async listCaches() {
    await sleep()
    return [...caches]
  },
  async listJobs() {
    await sleep(80)
    return [...jobs]
  },
  async startJob(productId: string, kind: Job["kind"]) {
    await sleep(120)
    const next: Job = {
      job_id: `${Date.now()}`,
      product_id: productId,
      kind,
      status: "running",
      logs: `[start] ${kind} for ${productId}\n[progress] processing...`,
      createdAt: new Date().toISOString(),
    }
    jobs = [next, ...jobs].slice(0, 20)
    window.setTimeout(() => {
      jobs = jobs.map((item) =>
        item.job_id === next.job_id
          ? { ...item, status: "succeeded", logs: `${item.logs}\n[done] success` }
          : item
      )
    }, 1300)
    return next
  },
}
