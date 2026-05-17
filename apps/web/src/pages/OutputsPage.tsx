import { useEffect, useMemo, useState } from "react"

import { Button } from "@workspace/ui/components/button"

import { jobClient, type JobKind } from "../core/job-client"
import { outputClient } from "../core/output-client"
import { systemClient } from "../core/system-client"
import type { OutputFile, Product } from "../core/types"
import { useConfirm } from "../shared/confirm.tsx"
import { useMessage } from "../shared/message.tsx"
import { SectionCard } from "../shared/section"

const KIND_LABEL: Record<OutputFile["kind"], string> = {
  main: "主图",
  sku: "SKU 图",
  detail: "细节图",
  other: "其他",
}

const RERUN_KIND: Partial<Record<OutputFile["kind"], JobKind>> = {
  main: "render-main",
  sku: "render-sku",
  detail: "render-detail",
}

const RERUN_DESC: Partial<Record<OutputFile["kind"], string>> = {
  main: "只渲染主图（main.png），覆盖已有主图。",
  sku: "只渲染所有 SKU 图，覆盖已有 SKU。",
  detail: "只渲染所有细节图，覆盖已有细节图。",
}

export function OutputsPage({ selectedId, products }: { selectedId: string; products: Product[] }) {
  const [files, setFiles] = useState<OutputFile[]>([])
  const [filePort, setFilePort] = useState(0)
  const notify = useMessage()
  const confirm = useConfirm()

  useEffect(() => {
    void systemClient.getFileServerPort().then(setFilePort)
  }, [])

  const refresh = useMemo(
    () => async () => {
      if (!selectedId) {
        setFiles([])
        return
      }
      try {
        const data = await outputClient.list(selectedId)
        setFiles(data)
      } catch (err) {
        notify.error(err instanceof Error ? err.message : String(err))
      }
    },
    [selectedId, notify]
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  const grouped = useMemo(() => {
    return {
      main: files.filter((item) => item.kind === "main"),
      sku: files.filter((item) => item.kind === "sku"),
      detail: files.filter((item) => item.kind === "detail"),
      other: files.filter((item) => item.kind === "other"),
    }
  }, [files])

  const selected = products.find((item) => item.product_id === selectedId)

  async function deleteFile(file: OutputFile) {
    const ok = await confirm({
      tone: "danger",
      title: "删除生成图",
      description: `确定删除 ${file.filename}？此操作无法撤销。`,
      confirmLabel: "删除",
    })
    if (!ok) return
    try {
      await outputClient.delete(selectedId, file.filename)
      notify.success("已删除")
      await refresh()
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function openOutputFolder() {
    if (!selectedId) return
    try {
      await systemClient.openOutputFolder(selectedId)
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function rerunGroup(kind: OutputFile["kind"], label: string) {
    if (!selectedId) return
    const jobKind = RERUN_KIND[kind]
    if (!jobKind) return
    const ok = await confirm({
      title: `重跑 ${label}？`,
      description: `${RERUN_DESC[kind] ?? ""}\n产品：${selectedId}`,
      confirmLabel: "开始",
    })
    if (!ok) return
    try {
      await jobClient.start(jobKind, selectedId)
      notify.success("任务已加入队列，可在「日志」页查看进度")
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function rerunAll() {
    if (!selectedId) return
    const ok = await confirm({
      title: "重跑全部图？",
      description: `将根据现有 plan 调用生图 API 渲染所有图（主图 + SKU + 细节图），可能消耗配额。\n产品：${selectedId}`,
      confirmLabel: "开始",
    })
    if (!ok) return
    try {
      await jobClient.start("render", selectedId)
      notify.success("任务已加入队列，可在「日志」页查看进度")
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err))
    }
  }

  const imageBaseURL = filePort ? `http://127.0.0.1:${filePort}/output` : ""

  return (
    <div className="space-y-4">
      <SectionCard
        title="结果工作台"
        description={selected ? `当前产品：${selected.product_id} / ${selected.name || "未命名"}` : "未选择产品"}
        right={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void rerunAll()}
              disabled={!selectedId}
            >
              重跑全部
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void openOutputFolder()}
              disabled={!selectedId}
            >
              打开输出文件夹
            </Button>
          </div>
        }
      >
        <div className="text-sm text-muted-foreground">
          {selected
            ? `共 ${files.length} 张生成图`
            : "请先在产品页选择产品"}
        </div>
      </SectionCard>

      {(["main", "sku", "detail", "other"] as const).map((kind) => (
        <SectionCard
          key={kind}
          title={KIND_LABEL[kind]}
          description={`共 ${grouped[kind].length} 张`}
          right={
            RERUN_KIND[kind] ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void rerunGroup(kind, KIND_LABEL[kind])}
                disabled={!selectedId}
              >
                重跑本组
              </Button>
            ) : null
          }
        >
          {grouped[kind].length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              暂无该分组图片
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {grouped[kind].map((file) => (
                <div
                  key={file.id}
                  className="group relative overflow-hidden rounded-lg border border-border bg-muted/30"
                >
                  <img
                    src={`${imageBaseURL}/${selectedId}/${encodeURIComponent(file.filename)}`}
                    alt={file.filename}
                    className="aspect-square w-full object-cover"
                    loading="lazy"
                  />
                  <button
                    type="button"
                    onClick={() => void deleteFile(file)}
                    className="absolute right-1 top-1 hidden size-6 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground hover:bg-destructive/90 group-hover:flex"
                    aria-label="删除生成图"
                  >
                    ×
                  </button>
                  <div className="px-2 py-1.5 text-xs">
                    <div className="truncate font-medium">{file.filename}</div>
                    <div className="text-muted-foreground">
                      {Math.ceil(file.size / 1024)} KB · {file.updatedAt}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      ))}
    </div>
  )
}