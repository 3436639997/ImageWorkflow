import { Button } from "@workspace/ui/components/button"

import type { Product } from "../../core/types"
import { systemClient } from "../../core/system-client"
import { useMessage } from "../../shared/message.tsx"
import { toMessage } from "./helpers"

export function ProductListPanel({
  products,
  selectedId,
  onSelect,
  onCreate,
}: {
  products: Product[]
  selectedId: string
  onSelect: (id: string) => void
  onCreate: () => void
}) {
  const notify = useMessage()

  async function openFolder() {
    if (!selectedId) return
    try {
      await systemClient.openProductFolder(selectedId)
    } catch (error) {
      notify.error(toMessage(error))
    }
  }

  return (
    <aside className="flex h-full flex-col border-r border-border bg-card">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight">产品列表</div>
          <div className="text-xs leading-tight text-muted-foreground">{products.length} 项</div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void openFolder()}
            disabled={!selectedId}
            title="打开当前产品文件夹"
          >
            打开
          </Button>
          <Button type="button" size="sm" onClick={onCreate}>
            新建
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {products.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            暂无产品，点右上角「新建」开始。
          </div>
        ) : (
          <div className="space-y-2">
            {products.map((item) => (
              <button
                key={item.product_id}
                type="button"
                onClick={() => onSelect(item.product_id)}
                className={[
                  "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                  item.product_id === selectedId
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{item.product_id}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {item.name || "未命名"}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">{item.image_count}图</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
