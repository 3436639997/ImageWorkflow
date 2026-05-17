import { useEffect, useMemo, useRef, useState } from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"

import { jobClient, type Job } from "../core/job-client"
import { JOB_KIND_LABEL, JOB_STATUS_LABEL, JOB_STATUS_TONE } from "../core/job-meta"
import { jobStore, useJobStore } from "../core/job-store"
import { useConfirm } from "../shared/confirm.tsx"
import { useMessage } from "../shared/message.tsx"
import { SectionCard } from "../shared/section"

export function LogsPage({ productId }: { productId?: string } = {}) {
  const { jobs, loaded } = useJobStore()
  const [selectedId, setSelectedId] = useState<string>("")
  const [showAll, setShowAll] = useState(false)
  const [scope, setScope] = useState<"current" | "all">(productId ? "current" : "all")
  const [logText, setLogText] = useState<string>("")
  const [busy, setBusy] = useState(false)
  const notify = useMessage()
  const confirm = useConfirm()
  const [now, setNow] = useState(() => Date.now())

  // When the bound product changes, reset scope to follow it.
  useEffect(() => {
    setScope(productId ? "current" : "all")
  }, [productId])

  const filteredJobs = useMemo(() => {
    if (!productId || scope === "all") return jobs
    return jobs.filter((j) => j.product_id === productId)
  }, [jobs, productId, scope])

  // Auto-select first visible job when current selection is filtered out.
  useEffect(() => {
    if (filteredJobs.length === 0) {
      if (selectedId) setSelectedId("")
      return
    }
    if (!selectedId || !filteredJobs.some((j) => j.job_id === selectedId)) {
      setSelectedId(filteredJobs[0].job_id)
    }
  }, [filteredJobs, selectedId])

  const selected = useMemo(
    () => jobs.find((j) => j.job_id === selectedId) ?? null,
    [jobs, selectedId]
  )

  // Load logs when selection changes
  useEffect(() => {
    if (!selected) {
      setLogText("")
      return
    }
    let cancelled = false
    setBusy(true)
    jobClient
      .logs(selected.job_id)
      .then((text) => {
        if (!cancelled) setLogText(text)
      })
      .catch((err) => {
        if (!cancelled) notify.error(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  // Auto-refresh logs while job is running (every 1.5s)
  const intervalRef = useRef<number | null>(null)
  useEffect(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (selected && selected.status === "running") {
      intervalRef.current = window.setInterval(async () => {
        try {
          const text = await jobClient.logs(selected.job_id)
          setLogText(text)
        } catch {
          // ignore intermittent errors
        }
      }, 1500)
    }
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [selected?.job_id, selected?.status])

  // Tick once a second so running jobs show a live elapsed counter.
  useEffect(() => {
    if (!selected || selected.status !== "running") return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [selected?.status, selected?.job_id])

  // Refresh log once when status flips to a terminal state
  useEffect(() => {
    if (!selected) return
    if (selected.status === "succeeded" || selected.status === "failed") {
      void jobClient.logs(selected.job_id).then(setLogText).catch(() => {})
    }
  }, [selected?.status, selected?.job_id])

  async function cancelJob(job: Job) {
    const isRunning = job.status === "running"
    const ok = await confirm({
      tone: "danger",
      title: isRunning ? "取消运行中的任务？" : "取消排队中的任务？",
      description: isRunning
        ? "中断正在执行的任务，已完成的部分图不会回滚。"
        : "从队列中移除该任务。",
      confirmLabel: "取消任务",
      cancelLabel: "保留",
    })
    if (!ok) return
    try {
      await jobClient.cancel(job.job_id)
      notify.info("已发送取消请求")
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function clearCompleted() {
    const candidates = jobs.filter((j) => {
      const finished = j.status !== "queued" && j.status !== "running"
      const inScope = !productId || scope === "all" || j.product_id === productId
      return finished && inScope
    })
    if (candidates.length === 0) {
      notify.info("没有已完成的任务可清空")
      return
    }
    const scopeLabel = productId && scope === "current" ? "当前产品" : "全部产品"
    const ok = await confirm({
      tone: "danger",
      title: "清空已完成任务？",
      description: `将删除 ${scopeLabel}下 ${candidates.length} 个已完成 / 失败 / 取消的任务及其日志。运行中和排队中的任务保留。`,
      confirmLabel: "清空",
    })
    if (!ok) return
    try {
      const targetProductId = productId && scope === "current" ? productId : ""
      const removed = await jobClient.clearCompletedFor(targetProductId)
      await jobStore.refresh()
      notify.success(`已清空 ${removed} 个任务`)
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err))
    }
  }

  const visibleJobs = useMemo(() => {
    if (showAll) return filteredJobs
    return filteredJobs.slice(0, 8)
  }, [filteredJobs, showAll])

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <SectionCard
        title="任务列表"
        description={
          productId
            ? scope === "current"
              ? `当前产品 ${filteredJobs.length} 个任务`
              : `全部 ${jobs.length} 个任务`
            : `共 ${jobs.length} 个任务，最新优先`
        }
        right={
          jobs.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void clearCompleted()}
            >
              清空已完成
            </Button>
          ) : null
        }
      >
        {productId ? (
          <div className="mb-3 inline-flex rounded-lg border border-border p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setScope("current")}
              className={[
                "rounded-md px-3 py-1 transition-colors",
                scope === "current"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              ].join(" ")}
            >
              当前产品
            </button>
            <button
              type="button"
              onClick={() => setScope("all")}
              className={[
                "rounded-md px-3 py-1 transition-colors",
                scope === "all"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              ].join(" ")}
            >
              全部产品
            </button>
          </div>
        ) : null}
        {!loaded ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            加载中...
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            {productId && scope === "current"
              ? "当前产品暂无任务，去「生成」tab 发起一个吧。"
              : "暂无任务，去「生成」tab 发起一个吧。"}
          </div>
        ) : (
          <div className="space-y-1.5">
            {visibleJobs.map((job) => {
              const cancellable = job.status === "queued" || job.status === "running"
              return (
                <div
                  key={job.job_id}
                  onClick={() => setSelectedId(job.job_id)}
                  className={[
                    "group relative w-full cursor-pointer rounded-lg border px-3 py-2 transition-colors",
                    job.job_id === selectedId
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {JOB_KIND_LABEL[job.kind] ?? job.kind}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {job.job_id.slice(0, 8)}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {job.product_id || "-"} · {fmtTime(job.created_at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant={JOB_STATUS_TONE[job.status] ?? "default"}>
                        {JOB_STATUS_LABEL[job.status] ?? job.status}
                      </Badge>
                      {cancellable ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            void cancelJob(job)
                          }}
                          className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs leading-none hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
                          title="取消任务"
                          aria-label="取消任务"
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })}
            {!showAll && filteredJobs.length > 8 ? (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="w-full rounded-lg border border-dashed border-border px-3 py-2 text-center text-xs text-muted-foreground hover:bg-muted/50"
              >
                显示全部（{filteredJobs.length - 8} 个更早的任务）
              </button>
            ) : null}
            {showAll && filteredJobs.length > 8 ? (
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className="w-full rounded-lg border border-dashed border-border px-3 py-2 text-center text-xs text-muted-foreground hover:bg-muted/50"
              >
                收起（只显示最近 8 个）
              </button>
            ) : null}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="任务详情"
        description={selected ? `${selected.job_id}` : "请从左侧选择任务"}
        right={
          selected && (selected.status === "queued" || selected.status === "running") ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void cancelJob(selected)}>
              {selected.status === "running" ? "取消运行" : "取消"}
            </Button>
          ) : null
        }
      >
        {!selected ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            请从左侧选择任务查看详情
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Info label="动作" value={JOB_KIND_LABEL[selected.kind] ?? selected.kind} />
              <Info label="产品" value={selected.product_id || "-"} />
              <Info label="状态" value={JOB_STATUS_LABEL[selected.status] ?? selected.status} />
              <Info label="创建于" value={fmtTime(selected.created_at)} />
              <Info label="开始于" value={fmtTime(selected.started_at)} />
              <Info label="结束于" value={fmtTime(selected.finished_at)} />
            </div>

            {selected.error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {selected.error}
              </div>
            ) : null}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium">日志输出</div>
                {busy ? (
                  <div className="text-xs text-muted-foreground">读取中...</div>
                ) : selected.status === "running" ? (
                  <div className="text-xs text-muted-foreground">
                    已运行 {formatElapsed(selected.started_at, now)} · 每 1.5s 刷新
                  </div>
                ) : null}
              </div>
              <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs leading-relaxed font-mono">
                {logText || "（暂无日志）"}
              </pre>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm">{value || "-"}</div>
    </div>
  )
}

function fmtTime(iso: string | undefined) {
  if (!iso) return "-"
  // RFC3339 → friendlier 'YYYY-MM-DD HH:mm:ss'
  return iso.replace("T", " ").replace(/\+.*$|Z$/, "").slice(0, 19)
}

function formatElapsed(startedAt: string | undefined, now: number): string {
  if (!startedAt) return "0s"
  const startMs = Date.parse(startedAt)
  if (isNaN(startMs)) return "0s"
  const seconds = Math.max(0, Math.floor((now - startMs) / 1000))
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}
