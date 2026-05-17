import type { JobKind, JobStatus } from "./job-client"

export const JOB_KIND_LABEL: Record<string, string> = {
  generate: "分析并生图",
  analyze: "仅分析",
  render: "按计划生图",
  "render-main": "仅主图",
  "render-sku": "仅 SKU",
  "render-detail": "仅细节图",
  "dry-run": "试运行",
} satisfies Record<JobKind, string>

export const JOB_STATUS_LABEL: Record<string, string> = {
  queued: "排队中",
  running: "运行中",
  succeeded: "完成",
  failed: "失败",
  cancelled: "已取消",
} satisfies Record<JobStatus, string>

export type StatusTone = "default" | "success" | "warning" | "destructive"

export const JOB_STATUS_TONE: Record<string, StatusTone> = {
  queued: "warning",
  running: "warning",
  succeeded: "success",
  failed: "destructive",
  cancelled: "default",
} satisfies Record<JobStatus, StatusTone>

export const TERMINAL_JOB_STATUSES: readonly string[] = ["succeeded", "failed", "cancelled"] satisfies readonly JobStatus[]
