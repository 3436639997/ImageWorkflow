import { useEffect, useMemo, useState } from "react"

import { Badge } from "@workspace/ui/components/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { Button } from "@workspace/ui/components/button"

import { cacheClient } from "../core/cache-client"
import { jobClient, type JobKind } from "../core/job-client"
import { useJobStore } from "../core/job-store"
import type { Product } from "../core/types"
import { useConfirm } from "../shared/confirm.tsx"
import { useMessage } from "../shared/message.tsx"
import { SectionCard } from "../shared/section"

const PRIMARY_ACTIONS: Array<{ key: JobKind; label: string; desc: string }> = [
  { key: "generate", label: "分析并生图", desc: "完整流程：分析 + 渲染" },
  { key: "analyze", label: "仅分析", desc: "只生成 plan，不出图" },
  { key: "render", label: "按计划生图", desc: "复用现有 plan 渲染所有图" },
  { key: "dry-run", label: "试运行", desc: "校验不调用远端 API" },
]

const ACTIONS = PRIMARY_ACTIONS

const STATUS_TONE: Record<string, "default" | "success" | "warning" | "destructive"> = {
  queued: "warning",
  running: "warning",
  succeeded: "success",
  failed: "destructive",
  cancelled: "default",
}

const STATUS_LABEL: Record<string, string> = {
  queued: "排队中",
  running: "运行中",
  succeeded: "完成",
  failed: "失败",
  cancelled: "已取消",
}

export function GeneratePage({
  products,
  selectedId,
}: {
  products: Product[]
  selectedId: string
}) {
  const [pendingKind, setPendingKind] = useState<JobKind | null>(null)
  const [planText, setPlanText] = useState<string>("")
  const [planOpen, setPlanOpen] = useState(false)
  const notify = useMessage()
  const confirm = useConfirm()
  const { jobs } = useJobStore()

  const selected = useMemo(
    () => products.find((item) => item.product_id === selectedId),
    [products, selectedId]
  )

  const productJobs = useMemo(
    () => jobs.filter((j) => j.product_id === selectedId).slice(0, 5),
    [jobs, selectedId]
  )

  // Refresh plan whenever selection changes or a job for this product completes.
  const lastSucceededAt = useMemo(() => {
    const completed = productJobs.find(
      (j) => j.status === "succeeded" && (j.kind === "analyze" || j.kind === "generate")
    )
    return completed?.finished_at ?? ""
  }, [productJobs])

  useEffect(() => {
    if (!selectedId) {
      setPlanText("")
      return
    }
    let cancelled = false
    cacheClient
      .planFor(selectedId)
      .then((text) => {
        if (!cancelled) setPlanText(text || "")
      })
      .catch(() => {
        if (!cancelled) setPlanText("")
      })
    return () => {
      cancelled = true
    }
  }, [selectedId, lastSucceededAt])

  async function run(kind: JobKind) {
    if (!selectedId) {
      notify.error("请先在产品页选择产品")
      return
    }
    if (kind !== "dry-run") {
      const meta = ACTIONS.find((a) => a.key === kind)
      const ok = await confirm({
        title: `执行「${meta?.label ?? kind}」?`,
        description: `${confirmDescription(kind)}\n产品：${selectedId}`,
        confirmLabel: "开始",
      })
      if (!ok) return
    }
    try {
      setPendingKind(kind)
      await jobClient.start(kind, selectedId)
      notify.success("任务已加入队列，可在「日志」页查看进度")
    } catch (error) {
      notify.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPendingKind(null)
    }
  }

  function confirmDescription(kind: JobKind): string {
    switch (kind) {
      case "generate":
        return "将依次调用分析 API + 生图 API，可能消耗 token / 配额。"
      case "analyze":
        return "将调用分析 API 生成 generation plan，可能消耗 token。"
      case "render":
        return "将根据现有 plan 调用生图 API 渲染所有图，可能消耗配额。"
      case "render-main":
        return "只渲染主图（main.png），覆盖已有主图。"
      case "render-sku":
        return "只渲染所有 SKU 图，覆盖已有 SKU。"
      case "render-detail":
        return "只渲染所有细节图，覆盖已有细节图。"
      default:
        return ""
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <SectionCard title="任务动作" description="选择需要执行的操作">
        <div className="space-y-2">
          {PRIMARY_ACTIONS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => void run(item.key)}
              disabled={!selectedId || pendingKind !== null}
              className="w-full rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="text-sm font-medium">{item.label}</div>
              <div className="text-xs text-muted-foreground">{item.desc}</div>
            </button>
          ))}
        </div>
      </SectionCard>

      <div className="space-y-4">
        <SectionCard title="选中产品" description="任务将针对当前产品执行">
          {selected ? (
            <div className="grid gap-3 md:grid-cols-3">
              <Info label="产品 ID" value={selected.product_id} />
              <Info label="名称" value={selected.name || "-"} />
              <Info label="素材图" value={`${selected.image_count} 张`} />
            </div>
          ) : (
            <Empty text="请先在产品页选择产品" />
          )}
        </SectionCard>

        <SectionCard title="近期任务" description="该产品最近 5 个任务记录">
          {productJobs.length === 0 ? (
            <Empty text="暂无任务，点左侧按钮发起任务" />
          ) : (
            <div className="space-y-2">
              {productJobs.map((job) => (
                <div
                  key={job.job_id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {job.job_id.slice(0, 8)}
                      </span>
                      <span className="text-sm font-medium">{labelOf(job.kind)}</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {job.created_at}
                      {job.error ? ` · ${job.error}` : ""}
                    </div>
                  </div>
                  <Badge variant={STATUS_TONE[job.status] ?? "default"}>
                    {STATUS_LABEL[job.status] ?? job.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="生图计划"
          description={planText ? "已存在 plan，可作为渲染依据" : "尚未分析"}
          right={
            planText ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPlanOpen((v) => !v)}
              >
                {planOpen ? "收起" : "展开"}
              </Button>
            ) : null
          }
        >
          {planText ? (
            <Collapsible open={planOpen} onOpenChange={setPlanOpen}>
              <CollapsibleTrigger asChild>
                <div className="cursor-pointer text-xs text-muted-foreground">
                  {planOpen ? "" : "点击或按右上「展开」查看完整 JSON"}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <pre className="max-h-[60vh] overflow-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">
                  {prettifyJSON(planText)}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          ) : (
            <Empty text="还没生成 plan，先运行「仅分析」或「分析并生图」。" />
          )}
        </SectionCard>
      </div>
    </div>
  )
}

function prettifyJSON(text: string) {
  try {
    const parsed = JSON.parse(text)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return text
  }
}

function labelOf(kind: string) {
  const found = ACTIONS.find((a) => a.key === kind)
  return found ? found.label : kind
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
      {text}
    </div>
  )
}
