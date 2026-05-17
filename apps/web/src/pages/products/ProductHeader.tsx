import { Button } from "@workspace/ui/components/button"

import { productClient, type ProductDetail } from "../../core/product-client"
import { systemClient } from "../../core/system-client"
import { useConfirm } from "../../shared/confirm.tsx"
import { useMessage } from "../../shared/message.tsx"
import { toMessage } from "./helpers"

export function ProductHeader({
  detail,
  onEdit,
  onDeleted,
}: {
  detail: ProductDetail
  onEdit: () => void
  onDeleted: () => void
}) {
  const notify = useMessage()
  const confirm = useConfirm()

  async function openFolder() {
    try {
      await systemClient.openProductFolder(detail.product_id)
    } catch (error) {
      notify.error(toMessage(error))
    }
  }

  async function deleteProduct() {
    const ok = await confirm({
      tone: "danger",
      title: "删除产品",
      description: `确定删除产品 ${detail.product_id}？这将同时删除其所有素材图，且无法恢复。`,
      confirmLabel: "删除",
    })
    if (!ok) return
    try {
      await productClient.delete(detail.product_id)
      notify.success("产品已删除")
      onDeleted()
    } catch (error) {
      notify.error(toMessage(error))
    }
  }

  return (
    <div className="sticky top-0 z-10 -mx-5 -mt-5 mb-4 flex h-14 shrink-0 items-center border-b border-border bg-background/95 px-5 backdrop-blur">
      <div className="flex w-full items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold leading-tight">
            <span className="font-mono">{detail.product_id}</span>
            <span className="text-muted-foreground">·</span>
            <span className="truncate">{detail.name || "未命名"}</span>
          </div>
          <div className="mt-0.5 text-xs leading-tight text-muted-foreground">
            {detail.category ? `${detail.category} · ` : ""}
            {detail.image_count} 素材 · {detail.output_count} 输出
            {detail.has_plan ? " · 已分析" : ""}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void openFolder()}>
            打开文件夹
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            编辑
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void deleteProduct()}>
            删除
          </Button>
        </div>
      </div>
    </div>
  )
}
