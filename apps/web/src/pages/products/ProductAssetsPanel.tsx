import { useEffect, useMemo, useState } from "react"

import { Button } from "@workspace/ui/components/button"

import { productClient, type ProductDetail } from "../../core/product-client"
import { systemClient } from "../../core/system-client"
import { useConfirm } from "../../shared/confirm.tsx"
import { useMessage } from "../../shared/message.tsx"
import { readAsBase64, toMessage } from "./helpers"
import { Empty, Info } from "./shared"

export function ProductAssetsPanel({
  detail,
  onChange,
}: {
  detail: ProductDetail | null
  onChange: () => void
}) {
  const [filePort, setFilePort] = useState(0)
  const [dragActive, setDragActive] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const notify = useMessage()
  const confirm = useConfirm()

  useEffect(() => {
    void systemClient.getFileServerPort().then(setFilePort)
  }, [])

  async function uploadFromDialog() {
    if (!detail) return
    try {
      const paths = await systemClient.openImageFiles()
      if (paths.length === 0) return
      setBusy("upload")
      for (const path of paths) {
        await productClient.uploadImageFromPath(detail.product_id, path)
      }
      notify.success(`已上传 ${paths.length} 张图片`)
      onChange()
    } catch (error) {
      notify.error(toMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function uploadFromDrop(files: FileList) {
    if (!detail) return
    try {
      setBusy("upload")
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue
        const data = await readAsBase64(file)
        await productClient.uploadImage(detail.product_id, file.name, data)
      }
      notify.success(`已上传 ${files.length} 张图片`)
      onChange()
    } catch (error) {
      notify.error(toMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function deleteImage(filename: string) {
    if (!detail) return
    const ok = await confirm({
      tone: "danger",
      title: "删除图片",
      description: `确定删除图片 ${filename}？此操作无法撤销。`,
      confirmLabel: "删除",
    })
    if (!ok) return
    try {
      await productClient.deleteImage(detail.product_id, filename)
      onChange()
    } catch (error) {
      notify.error(toMessage(error))
    }
  }

  const imageBaseURL = useMemo(
    () => (filePort ? `http://127.0.0.1:${filePort}/product` : ""),
    [filePort]
  )

  if (!detail) {
    return <Empty text="加载中..." />
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        <Info label="名称" value={detail.name || "-"} />
        <Info label="类目" value={detail.category || "-"} />
        <Info label="颜色" value={detail.colors_text || "-"} />
        <Info label="主推颜色" value={detail.hero_color || "-"} />
        <Info label="素材图" value={`${detail.image_count} 张`} />
        <Info label="产出图" value={`${detail.output_count} 张`} />
      </div>

      {detail.description ? <Info label="描述" value={detail.description} /> : null}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-medium">素材图片</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void uploadFromDialog()}
            disabled={busy === "upload"}
          >
            {busy === "upload" ? "上传中..." : "选择文件上传"}
          </Button>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragActive(true)
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragActive(false)
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              void uploadFromDrop(e.dataTransfer.files)
            }
          }}
          className={[
            "rounded-lg border-2 border-dashed p-4 transition-colors",
            dragActive ? "border-primary bg-primary/5" : "border-border",
          ].join(" ")}
        >
          {detail.images && detail.images.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {detail.images.map((img) => (
                <div
                  key={img.filename}
                  className="group relative overflow-hidden rounded-lg border border-border bg-muted/30"
                >
                  <img
                    src={`${imageBaseURL}/${detail.product_id}/${encodeURIComponent(img.filename)}`}
                    alt={img.filename}
                    className="aspect-square w-full object-cover"
                    loading="lazy"
                  />
                  <button
                    type="button"
                    onClick={() => void deleteImage(img.filename)}
                    className="absolute right-1 top-1 hidden size-6 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground hover:bg-destructive/90 group-hover:flex"
                    aria-label="删除图片"
                  >
                    ×
                  </button>
                  <div className="truncate px-2 py-1 text-xs">{img.filename}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-muted-foreground">
              拖拽图片到这里，或点击「选择文件上传」
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
