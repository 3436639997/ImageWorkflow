import { useCallback, useEffect, useState } from "react"

import { Button } from "@workspace/ui/components/button"

import { styleClient, type Style } from "../core/style-client"
import { useConfirm } from "../shared/confirm.tsx"
import { useMessage } from "../shared/message.tsx"
import { SectionCard } from "../shared/section"
import { StyleFormDialog } from "./StyleFormDialog"

export function StylesPage() {
  const [styles, setStyles] = useState<Style[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingStyle, setEditingStyle] = useState<Style | null>(null)
  const notify = useMessage()
  const confirm = useConfirm()

  const refresh = useCallback(async () => {
    try {
      const data = await styleClient.list()
      setStyles(data ?? [])
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err))
    }
  }, [notify])

  useEffect(() => {
    void refresh()
  }, [refresh])

  function openCreate() {
    setEditingStyle(null)
    setDialogOpen(true)
  }

  function openEdit(style: Style) {
    setEditingStyle(style)
    setDialogOpen(true)
  }

  async function deleteStyle(style: Style) {
    const ok = await confirm({
      tone: "danger",
      title: "删除风格套？",
      description: `确定删除「${style.name}」？此操作无法撤销。`,
      confirmLabel: "删除",
    })
    if (!ok) return
    try {
      await styleClient.delete(style.id)
      notify.success("已删除")
      void refresh()
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err))
    }
  }

  function handleSaved() {
    setDialogOpen(false)
    setEditingStyle(null)
    void refresh()
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="风格参考"
        description="管理全局风格套，生成时可选择使用"
        right={
          <Button type="button" size="sm" onClick={openCreate}>
            新建风格
          </Button>
        }
      >
        {styles.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            暂无风格套，点右上角「新建风格」开始。
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {styles.map((style) => (
              <div
                key={style.id}
                className="group rounded-lg border border-border p-4 transition-colors hover:bg-muted/30"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold">{style.name}</div>
                  <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => openEdit(style)}
                    >
                      编辑
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => void deleteStyle(style)}
                    >
                      删除
                    </Button>
                  </div>
                </div>
                <div className="line-clamp-3 text-xs text-muted-foreground">
                  {style.prompt || "（无提示词）"}
                </div>
                {style.reference_images && style.reference_images.length > 0 ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {style.reference_images.length} 张参考图
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <StyleFormDialog
        open={dialogOpen}
        mode={editingStyle ? "edit" : "create"}
        initialStyle={editingStyle}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditingStyle(null)
        }}
        onSaved={handleSaved}
      />
    </div>
  )
}
