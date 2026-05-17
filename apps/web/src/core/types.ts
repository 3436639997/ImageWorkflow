export type PageKey = "settings" | "products" | "generate" | "outputs" | "cache" | "logs"

export type Product = {
  product_id: string
  name: string
  category: string
  image_count: number
  has_plan: boolean
  output_count: number
}

export type SettingItem = {
  key: string
  value: string
  secret?: boolean
  hasValue?: boolean
  group?: string
}

export type OutputFile = {
  id: string
  filename: string
  kind: "main" | "sku" | "detail" | "other"
  size: number
  updatedAt: string
}

export type CacheItem = {
  filename: string
  group: "global_style" | "category_style" | "generation_plan" | "other"
  size: number
  updatedAt: string
}

export type JobStatus = "queued" | "running" | "succeeded" | "failed"

export type Job = {
  job_id: string
  product_id: string
  kind: "generate" | "analyze" | "render" | "dry-run"
  status: JobStatus
  logs: string
  error?: string
  createdAt: string
}
