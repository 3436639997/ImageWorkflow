import { useEffect, useMemo, useState } from "react"

import { CopyIcon, EyeIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Combobox, type ComboboxOption } from "@workspace/ui/components/combobox"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Separator } from "@workspace/ui/components/separator"
import { Switch } from "@workspace/ui/components/switch"

import { settingsClient, type PresetMeta } from "../core/settings-client"
import { systemClient } from "../core/system-client"
import type { SettingItem } from "../core/types"
import { useConfirm } from "../shared/confirm.tsx"
import { useMessage } from "../shared/message.tsx"
import { SectionCard } from "../shared/section"

type ProbeState = {
  status: "idle" | "probing" | "ok" | "fail"
  message: string
  modelCount?: number
}

const SECRET_KEYS = ["ANALYSIS_API_KEY", "IMAGE_API_KEY"] as const
const MAX_PRESETS = 5

function isMaskedSecret(value: string) {
  return /^\*+$/.test(value)
}

export function SettingsPage() {
  const [items, setItems] = useState<SettingItem[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [initialValues, setInitialValues] = useState<Record<string, string>>({})
  const [secretCache, setSecretCache] = useState<Record<string, string>>({})
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [splitMode, setSplitMode] = useState(true)
  const [presets, setPresets] = useState<PresetMeta[]>([])
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameLabel, setRenameLabel] = useState("")
  const [analysisProbe, setAnalysisProbe] = useState<ProbeState>({ status: "idle", message: "" })
  const [imageProbe, setImageProbe] = useState<ProbeState>({ status: "idle", message: "" })
  const [analysisModels, setAnalysisModels] = useState<string[]>([])
  const [imageModels, setImageModels] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const notify = useMessage()
  const confirm = useConfirm()

  const itemMap = useMemo(
    () => Object.fromEntries(items.map((item) => [item.key, item])),
    [items]
  )

  const dirty = useMemo(
    () => JSON.stringify(values) !== JSON.stringify(initialValues),
    [values, initialValues]
  )

  const activePresetId = useMemo(
    () => presets.find((p) => p.is_active)?.id ?? "",
    [presets]
  )

  const analysisModelOptions = useMemo<ComboboxOption[]>(
    () => analysisModels.map((model) => ({ value: model })),
    [analysisModels]
  )
  const imageModelOptions = useMemo<ComboboxOption[]>(
    () => imageModels.map((model) => ({ value: model })),
    [imageModels]
  )

  function applyItems(nextItems: SettingItem[]) {
    const nextValues = toValueMap(nextItems)
    setItems(nextItems)
    setValues(nextValues)
    setInitialValues(nextValues)
    setRevealed({})
    setSecretCache({})
    setAnalysisProbe({ status: "idle", message: "" })
    setImageProbe({ status: "idle", message: "" })
    setAnalysisModels([])
    setImageModels([])
  }

  async function loadSettings() {
    setLoading(true)
    try {
      const [nextItems, nextPresets] = await Promise.all([
        settingsClient.list(false),
        settingsClient.listPresets(),
      ])
      applyItems(nextItems)
      setPresets(nextPresets)
    } catch (error) {
      notify.error(toMessage(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function update(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  async function switchPreset(id: string) {
    if (id === activePresetId) return
    if (dirty) {
      const ok = await confirm({
        tone: "danger",
        title: "切换预设？",
        description: "当前预设有未保存的修改，切换会丢弃这些修改。",
        confirmLabel: "切换",
      })
      if (!ok) return
    }
    try {
      setBusyAction("switch")
      const nextItems = await settingsClient.setActivePreset(id)
      const nextPresets = await settingsClient.listPresets()
      applyItems(nextItems)
      setPresets(nextPresets)
      notify.success("已切换预设")
    } catch (error) {
      notify.error(toMessage(error))
    } finally {
      setBusyAction(null)
    }
  }

  async function createPreset() {
    if (presets.length >= MAX_PRESETS) {
      notify.error(`最多 ${MAX_PRESETS} 个预设`)
      return
    }
    try {
      setBusyAction("create-preset")
      const nextPresets = await settingsClient.createPreset(
        `预设 ${presets.length + 1}`
      )
      setPresets(nextPresets)
      notify.success("已新建预设")
    } catch (error) {
      notify.error(toMessage(error))
    } finally {
      setBusyAction(null)
    }
  }

  function startRename(id: string, label: string) {
    setRenamingId(id)
    setRenameLabel(label)
  }

  async function confirmRename() {
    if (!renamingId) return
    const label = renameLabel.trim()
    if (!label) {
      setRenamingId(null)
      return
    }
    try {
      const nextPresets = await settingsClient.renamePreset(renamingId, label)
      setPresets(nextPresets)
    } catch (error) {
      notify.error(toMessage(error))
    } finally {
      setRenamingId(null)
    }
  }

  async function deletePreset(id: string) {
    if (id === activePresetId) {
      notify.error("不能删除当前正在使用的预设")
      return
    }
    if (presets.length <= 1) {
      notify.error("至少保留一个预设")
      return
    }
    const target = presets.find((p) => p.id === id)
    const ok = await confirm({
      tone: "danger",
      title: "删除预设",
      description: `确定删除「${target?.label ?? id}」？此操作无法撤销。`,
      confirmLabel: "删除",
    })
    if (!ok) return
    try {
      const nextPresets = await settingsClient.deletePreset(id)
      setPresets(nextPresets)
      notify.success("已删除")
    } catch (error) {
      notify.error(toMessage(error))
    }
  }

  async function ensureSecretValues(keys: string[]) {
    const pending = keys.filter(
      (key) =>
        itemMap[key]?.secret &&
        itemMap[key]?.hasValue &&
        !revealed[key] &&
        !secretCache[key]
    )
    if (pending.length === 0) return secretCache

    const revealedItems = await settingsClient.list(true)
    const revealedMap = toValueMap(revealedItems)
    const nextCache = { ...secretCache }
    for (const key of pending) {
      nextCache[key] = revealedMap[key] ?? ""
    }
    setSecretCache(nextCache)
    return nextCache
  }

  async function toggleReveal(key: string) {
    if (revealed[key]) {
      setRevealed((current) => ({ ...current, [key]: false }))
      return
    }
    const currentValue = values[key] || ""
    if (currentValue && !isMaskedSecret(currentValue)) {
      setRevealed((current) => ({ ...current, [key]: true }))
      return
    }
    try {
      const cache = await ensureSecretValues([key])
      const actual = cache[key] || ""
      setValues((current) => ({ ...current, [key]: actual }))
      setRevealed((current) => ({ ...current, [key]: true }))
    } catch (error) {
      notify.error(toMessage(error))
    }
  }

  async function copyValue(key: string) {
    try {
      let cache = secretCache
      if (itemMap[key]?.secret && !revealed[key]) {
        cache = await ensureSecretValues([key])
      }
      const value = itemMap[key]?.secret && !revealed[key] ? cache[key] || "" : values[key] || ""
      if (!value) {
        notify.info("没有可复制的内容")
        return
      }
      await window.navigator.clipboard.writeText(value)
      notify.success("已复制到剪贴板")
    } catch (error) {
      notify.error(toMessage(error))
    }
  }

  function buildResolvedValues(cacheOverride?: Record<string, string>) {
    const next = { ...values }
    const cache = cacheOverride || secretCache
    for (const key of SECRET_KEYS) {
      if (itemMap[key]?.secret && !revealed[key] && isMaskedSecret(next[key] || "")) {
        next[key] = cache[key] || ""
      }
    }
    if (!splitMode) {
      next.IMAGE_API_BASE_URL = next.ANALYSIS_API_BASE_URL || ""
      next.IMAGE_API_KEY = next.ANALYSIS_API_KEY || ""
      next.IMAGE_API_FALLBACK_BASE_URLS = next.ANALYSIS_API_FALLBACK_BASE_URLS || ""
      next.IMAGE_GEN_PROVIDER = next.ANALYSIS_GEN_PROVIDER || ""
      // IMAGE_MODEL 不同步：分析和生图通常用不同模型
    }
    return next
  }

  async function saveSettingsAction() {
    try {
      setBusyAction("save")
      const cache = await ensureSecretValues(SECRET_KEYS as unknown as string[])
      const payload = buildSavePayloadWithCache(cache)
      if (Object.keys(payload).length === 0) {
        notify.info("没有需要保存的变更。")
        return
      }
      const nextItems = await settingsClient.save(payload)
      const nextValues = toValueMap(nextItems)
      setItems(nextItems)
      setValues(nextValues)
      setInitialValues(nextValues)
      setRevealed({})
      setSecretCache({})
      notify.success("设置已保存。")
    } catch (error) {
      notify.error(toMessage(error))
    } finally {
      setBusyAction(null)
    }
  }

  async function testConnection(kind: "analysis" | "image") {
    const setter = kind === "analysis" ? setAnalysisProbe : setImageProbe
    try {
      setBusyAction(`probe:${kind}`)
      setter({ status: "probing", message: "" })
      const cache = await ensureSecretValues([kind === "analysis" ? "ANALYSIS_API_KEY" : "IMAGE_API_KEY"])
      const result = await settingsClient.test(kind, buildResolvedValues(cache))
      setter({
        status: result.ok ? "ok" : "fail",
        message: result.message,
        modelCount: result.modelCount,
      })
      if (result.ok) notify.success(result.message)
      else notify.error(result.message)
    } catch (error) {
      setter({ status: "fail", message: toMessage(error) })
      notify.error(toMessage(error))
    } finally {
      setBusyAction(null)
    }
  }

  async function refreshModels(kind: "analysis" | "image") {
    try {
      setBusyAction(`models:${kind}`)
      const cache = await ensureSecretValues([kind === "analysis" ? "ANALYSIS_API_KEY" : "IMAGE_API_KEY"])
      const result = await settingsClient.fetchModels(kind, buildResolvedValues(cache))
      if (kind === "analysis") setAnalysisModels(result.models)
      else setImageModels(result.models)
      if (result.ok) notify.success(result.message)
      else notify.error(result.message)
    } catch (error) {
      notify.error(toMessage(error))
    } finally {
      setBusyAction(null)
    }
  }

  async function pickWorkspace() {
    try {
      const path = await systemClient.pickDirectory("选择工作目录")
      if (!path) return
      update("WORKSPACE_DIR", path)
      notify.info("已选择新工作目录，请点「保存设置」生效。")
    } catch (error) {
      notify.error(toMessage(error))
    }
  }

  function resetWorkspaceToDefault() {
    update("WORKSPACE_DIR", "")
    notify.info("已恢复默认工作目录，请点「保存设置」生效。")
  }

  async function openWorkspace() {
    try {
      await systemClient.openWorkspace()
    } catch (error) {
      notify.error(toMessage(error))
    }
  }

  function buildSavePayloadWithCache(cache: Record<string, string>) {
    const resolved = buildResolvedValues(cache)
    const payload: Record<string, string> = {}
    for (const [key, value] of Object.entries(resolved)) {
      if (value === initialValues[key]) continue
      if (itemMap[key]?.secret && !revealed[key] && isMaskedSecret(values[key] || "")) continue
      payload[key] = value
    }
    return payload
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <SectionCard title="设置" description="正在加载配置。">
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            正在加载设置...
          </div>
        </SectionCard>
      ) : null}

      {!loading ? (
        <SectionCard
          title="设置"
          right={
            <div className="flex items-center gap-2">
              <StatusPill tone={dirty ? "warn" : "ok"} label={dirty ? "未保存" : "已同步"} />
              <Button type="button" variant="outline" size="sm" onClick={() => void loadSettings()}>
                恢复
              </Button>
              <Button type="button" size="sm" onClick={() => void saveSettingsAction()} disabled={!dirty || busyAction === "save"}>
                {busyAction === "save" ? "保存中..." : "保存设置"}
              </Button>
            </div>
          }
        >
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-sm font-medium">网关预设</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    切换预设会立即生效，所有任务都会使用当前激活预设的配置（最多 {MAX_PRESETS} 个）。
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void createPreset()}
                  disabled={presets.length >= MAX_PRESETS || busyAction === "create-preset"}
                >
                  + 新建预设
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {presets.map((preset) =>
                  renamingId === preset.id ? (
                    <Input
                      key={preset.id}
                      autoFocus
                      value={renameLabel}
                      onChange={(e) => setRenameLabel(e.target.value)}
                      onBlur={() => void confirmRename()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void confirmRename()
                        if (e.key === "Escape") setRenamingId(null)
                      }}
                      className="h-8 w-40 rounded-full"
                    />
                  ) : (
                    <div key={preset.id} className="group relative inline-flex">
                      <Button
                        type="button"
                        variant={preset.is_active ? "default" : "outline"}
                        size="sm"
                        className="rounded-full"
                        onClick={() => void switchPreset(preset.id)}
                        onDoubleClick={() => startRename(preset.id, preset.label)}
                        disabled={busyAction === "switch"}
                      >
                        {preset.label}
                      </Button>
                      <div className="absolute -right-1 -top-1 hidden gap-0.5 group-hover:flex">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            startRename(preset.id, preset.label)
                          }}
                          className="flex size-5 items-center justify-center rounded-full border border-border bg-background text-xs leading-none shadow-sm hover:bg-muted"
                          title="重命名"
                          aria-label="重命名"
                        >
                          ✎
                        </button>
                        {presets.length > 1 && !preset.is_active ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              void deletePreset(preset.id)
                            }}
                            className="flex size-5 items-center justify-center rounded-full border border-border bg-background text-xs leading-none shadow-sm hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
                            title="删除"
                            aria-label="删除"
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>

            <Separator />

            <div className="space-y-5">
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="分析接口地址">
                    <InputWithActions
                      value={values.ANALYSIS_API_BASE_URL || ""}
                      onChange={(value) => update("ANALYSIS_API_BASE_URL", value)}
                      placeholder="https://api.example.com/v1"
                      actions={[
                        {
                          label: "复制",
                          icon: CopyIcon,
                          onClick: () => void copyValue("ANALYSIS_API_BASE_URL"),
                        },
                      ]}
                    />
                  </Field>
                  <Field label="分析 API Key">
                    <InputWithActions
                      value={values.ANALYSIS_API_KEY || ""}
                      onChange={(value) => update("ANALYSIS_API_KEY", value)}
                      placeholder="sk-..."
                      type={revealed.ANALYSIS_API_KEY ? "text" : "password"}
                      mono
                      actions={[
                        {
                          label: revealed.ANALYSIS_API_KEY ? "隐藏" : "显示",
                          icon: revealed.ANALYSIS_API_KEY ? ViewOffSlashIcon : EyeIcon,
                          onClick: () => void toggleReveal("ANALYSIS_API_KEY"),
                        },
                        {
                          label: "复制",
                          icon: CopyIcon,
                          onClick: () => void copyValue("ANALYSIS_API_KEY"),
                        },
                      ]}
                    />
                  </Field>
                  <Field label="分析备用 Base URL" hint="逗号分隔，主网关失败时按顺序回退。">
                    <TextInput value={values.ANALYSIS_API_FALLBACK_BASE_URLS || ""} onChange={(value) => update("ANALYSIS_API_FALLBACK_BASE_URLS", value)} placeholder="https://backup.example.com/v1" />
                  </Field>
                  <Field label="分析渠道标签">
                    <TextInput value={values.ANALYSIS_GEN_PROVIDER || ""} onChange={(value) => update("ANALYSIS_GEN_PROVIDER", value)} placeholder="custom" />
                  </Field>
                  <Field label="分析模型" hint="用于 plan 分析，可手输或从网关刷新。">
                    <Combobox
                      value={values.ANALYSIS_MODEL || ""}
                      onValueChange={(value) => update("ANALYSIS_MODEL", value)}
                      options={analysisModelOptions}
                      placeholder="输入模型名或从列表选择"
                      emptyLabel="先测试连接并刷新模型"
                    />
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <InlineStatus
                        label="模型缓存"
                        tone={analysisModels.length ? "success" : "neutral"}
                        value={analysisModels.length ? `${analysisModels.length} 个已加载` : "尚未加载"}
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => void refreshModels("analysis")}>
                        {busyAction === "models:analysis" ? "刷新中..." : "刷新"}
                      </Button>
                    </div>
                  </Field>
                </div>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <InlineStatus
                    label="分析网关"
                    tone={analysisProbe.status === "fail" ? "error" : analysisProbe.status === "ok" ? "success" : "neutral"}
                    value={probeText(analysisProbe)}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => void testConnection("analysis")}>
                    {busyAction === "probe:analysis" ? "测试中..." : "测试分析网关"}
                  </Button>
                </div>

                <Separator />

                <fieldset className={!splitMode ? "opacity-90" : ""}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="生图接口地址">
                      <InputWithActions
                        value={!splitMode ? values.ANALYSIS_API_BASE_URL || "" : values.IMAGE_API_BASE_URL || ""}
                        onChange={(value) => update("IMAGE_API_BASE_URL", value)}
                        placeholder="https://api.example.com/v1"
                        readOnly={!splitMode}
                        actions={[
                          {
                            label: "复制",
                            icon: CopyIcon,
                            onClick: () => void copyValue("IMAGE_API_BASE_URL"),
                          },
                        ]}
                      />
                    </Field>
                    <Field label="生图 API Key">
                      <InputWithActions
                        value={!splitMode ? values.ANALYSIS_API_KEY || "" : values.IMAGE_API_KEY || ""}
                        onChange={(value) => update("IMAGE_API_KEY", value)}
                        placeholder="sk-..."
                        type={revealed.IMAGE_API_KEY ? "text" : "password"}
                        mono
                        readOnly={!splitMode}
                        actions={[
                          {
                            label: revealed.IMAGE_API_KEY ? "隐藏" : "显示",
                            icon: revealed.IMAGE_API_KEY ? ViewOffSlashIcon : EyeIcon,
                            onClick: () => void toggleReveal("IMAGE_API_KEY"),
                          },
                          {
                            label: "复制",
                            icon: CopyIcon,
                            onClick: () => void copyValue("IMAGE_API_KEY"),
                          },
                        ]}
                      />
                    </Field>
                    <Field label="生图备用 Base URL" hint="逗号分隔，主网关失败时按顺序回退。">
                      <TextInput
                        value={!splitMode ? values.ANALYSIS_API_FALLBACK_BASE_URLS || "" : values.IMAGE_API_FALLBACK_BASE_URLS || ""}
                        onChange={(value) => update("IMAGE_API_FALLBACK_BASE_URLS", value)}
                        placeholder="https://backup.example.com/v1"
                        readOnly={!splitMode}
                      />
                    </Field>
                    <Field label="生图渠道标签">
                      <TextInput
                        value={!splitMode ? values.ANALYSIS_GEN_PROVIDER || "" : values.IMAGE_GEN_PROVIDER || ""}
                        onChange={(value) => update("IMAGE_GEN_PROVIDER", value)}
                        placeholder="custom"
                        readOnly={!splitMode}
                      />
                    </Field>
                    <Field label="生图模型" hint="用于最终主图 / SKU / 细节图生成。">
                      <Combobox
                        value={values.IMAGE_MODEL || ""}
                        onValueChange={(value) => update("IMAGE_MODEL", value)}
                        options={imageModelOptions}
                        placeholder="输入模型名或从列表选择"
                        emptyLabel="先测试连接并刷新模型"
                      />
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <InlineStatus
                          label="模型缓存"
                          tone={imageModels.length ? "success" : "neutral"}
                          value={imageModels.length ? `${imageModels.length} 个已加载` : "尚未加载"}
                        />
                        <Button type="button" variant="outline" size="sm" onClick={() => void refreshModels("image")}>
                          {busyAction === "models:image" ? "刷新中..." : "刷新"}
                        </Button>
                      </div>
                    </Field>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                    <InlineStatus
                      label="生图网关"
                      tone={imageProbe.status === "fail" ? "error" : imageProbe.status === "ok" ? "success" : "neutral"}
                      value={probeText(imageProbe)}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => void testConnection("image")}>
                      {busyAction === "probe:image" ? "测试中..." : "测试生图网关"}
                    </Button>
                  </div>
                </fieldset>

                <div className="flex items-center gap-3 rounded-lg bg-muted/30 px-3 py-2">
                  <Switch checked={!splitMode} onCheckedChange={(checked) => setSplitMode(!checked)} />
                  <span className="text-sm text-foreground">分析和生图使用同一个 API</span>
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="生图路径" hint="相对 Base URL，通常是 `/v1/images/edits`。">
                  <TextInput value={values.IMAGE_API_URL || ""} onChange={(value) => update("IMAGE_API_URL", value)} placeholder="/v1/images/edits" />
                </Field>
                <Field label="画幅比例">
                  <FixedSelect
                    value={values.ASPECT_RATIO || ""}
                    onChange={(value) => update("ASPECT_RATIO", value)}
                    options={["1:1", "4:5", "3:4", "16:9"]}
                    placeholder="选择画幅比例"
                  />
                </Field>
                <Field label="最终尺寸" className="md:col-span-2">
                  <FixedSelect
                    value={values.FINAL_IMAGE_SIZE || ""}
                    onChange={(value) => update("FINAL_IMAGE_SIZE", value)}
                    options={["1024x1024", "1536x1536", "2048x2048"]}
                    placeholder="选择最终尺寸"
                  />
                </Field>
              </div>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {!loading ? (
        <SectionCard
          title="工作目录"
          description="所有产品素材、缓存与生成结果都保存在此目录下。修改后请点保存设置生效。"
          right={
            <Button type="button" variant="outline" size="sm" onClick={() => void openWorkspace()}>
              打开
            </Button>
          }
        >
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={values.WORKSPACE_DIR || ""}
                readOnly
                className="font-mono"
                placeholder="点击「选择目录」设置工作目录"
              />
              <Button type="button" variant="outline" onClick={() => void pickWorkspace()}>
                选择目录
              </Button>
              <Button type="button" variant="outline" onClick={resetWorkspaceToDefault}>
                重置默认
              </Button>
            </div>
            <div className="rounded-lg border border-border bg-muted/15 p-3 text-xs text-muted-foreground">
              <div className="mb-1 font-medium text-foreground">子目录约定</div>
              <ul className="space-y-0.5">
                <li>· <span className="font-mono">new_products/&lt;id&gt;/</span> — 产品素材图</li>
                <li>· <span className="font-mono">output/&lt;id&gt;/</span> — 生成结果</li>
                <li>· <span className="font-mono">cache/</span> — 风格分析与生成计划缓存</li>
                <li>· <span className="font-mono">product_manifest.xlsx</span> — 产品清单</li>
              </ul>
            </div>

            <Separator />

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="API 请求超时（秒）" hint="0 = 不限时（默认）。设为 60 表示单次 API 调用最多等 60 秒。">
                <Input
                  type="number"
                  min={0}
                  max={1800}
                  value={values.API_REQUEST_TIMEOUT_SECONDS || ""}
                  onChange={(e) => update("API_REQUEST_TIMEOUT_SECONDS", e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="任务总超时（秒）" hint="0 = 不限时（默认），由用户在日志页手动取消。设为 600 表示 10 分钟自动 fail。">
                <Input
                  type="number"
                  min={0}
                  max={7200}
                  value={values.JOB_TIMEOUT_SECONDS || ""}
                  onChange={(e) => update("JOB_TIMEOUT_SECONDS", e.target.value)}
                  placeholder="0"
                />
              </Field>
            </div>
          </div>
        </SectionCard>
      ) : null}
    </div>
  )
}

function toValueMap(items: SettingItem[]) {
  return Object.fromEntries(items.map((item) => [item.key, item.value]))
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <div className="mb-2 flex min-h-6 items-baseline gap-2">
        <div className="shrink-0 text-[15px] font-medium">{label}</div>
        {hint ? (
          <div className="text-[11px] text-muted-foreground">{hint}</div>
        ) : (
          <div className="text-[11px] text-transparent select-none">.</div>
        )}
      </div>
      {children}
    </div>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  readOnly = false,
  mono = false,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  type?: "text" | "password"
  readOnly?: boolean
  mono?: boolean
}) {
  return (
    <Input
      className={mono ? "font-mono" : undefined}
      type={type}
      value={value}
      readOnly={readOnly}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function FixedSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

type InputAction = {
  label: string
  onClick: () => void
  icon?: typeof CopyIcon
}

function IconActionButton({ label, onClick, icon }: InputAction) {
  if (icon) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-9 shrink-0"
        onClick={onClick}
        title={label}
        aria-label={label}
      >
        <HugeiconsIcon icon={icon} size={16} strokeWidth={2} />
      </Button>
    )
  }
  return (
    <Button type="button" variant="outline" onClick={onClick}>
      {label}
    </Button>
  )
}

function InputWithActions({
  value,
  onChange,
  placeholder,
  actions,
  type,
  readOnly,
  mono,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  actions: InputAction[]
  type?: "text" | "password"
  readOnly?: boolean
  mono?: boolean
}) {
  return (
    <div className="flex gap-2">
      <TextInput
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        type={type}
        readOnly={readOnly}
        mono={mono}
      />
      {actions.map((action) => (
        <IconActionButton key={action.label} {...action} />
      ))}
    </div>
  )
}

function StatusPill({ tone, label }: { tone: "ok" | "warn"; label: string }) {
  return (
    <Badge variant={tone === "ok" ? "success" : "warning"}>
      {label}
    </Badge>
  )
}

function InlineStatus({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "neutral" | "success" | "error"
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={[
          "inline-block size-2 rounded-full",
          tone === "success"
            ? "bg-emerald-500"
            : tone === "error"
              ? "bg-destructive"
              : "bg-muted-foreground/60",
        ].join(" ")}
      />
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-foreground">{value}</span>
    </div>
  )
}

function probeText(state: ProbeState) {
  if (state.status === "ok") {
    return state.modelCount ? `已连通，${state.modelCount} 个模型` : "已连通"
  }
  if (state.status === "fail") {
    return state.message || "连接失败"
  }
  if (state.status === "probing") {
    return "测试中"
  }
  return "未测试"
}
