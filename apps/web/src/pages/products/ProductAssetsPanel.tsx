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
  const [detectedColors, setDetectedColors] = useState<string[] | null>(null)
  const [detectedHero, setDetectedHero] = useState<string>("")
  const [editingColors, setEditingColors] = useState(false)
  const [colorsText, setColorsText] = useState("")
  const [heroColor, setHeroColor] = useState("")
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

  async function detectColors() {
    if (!detail) return
    setBusy("detect")
    try {
      const result = await productClient.detectColors(detail.product_id)
      setDetectedColors(result.colors ?? [])
      setDetectedHero(result.hero_color ?? "")
      setColorsText((result.colors ?? []).join("、"))
      setHeroColor(result.hero_color ?? "")
      setEditingColors(true)
      notify.success(`识别到 ${(result.colors ?? []).length} 个颜色`)
    } catch (error) {
      notify.error(toMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function saveDetectedColors() {
    if (!detail) return
    try {
      setBusy("save-colors")
      await productClient.save({
        product_id: detail.product_id,
        name: detail.name,
        category: detail.category,
        description: detail.description,
        keywords: detail.keywords,
        colors_text: colorsText,
        hero_color: heroColor,
        color_image_map: detail.color_image_map,
        detail_image_count: detail.detail_image_count || 2,
        notes: detail.notes,
      })
      setEditingColors(false)
      setDetectedColors(null)
      onChange()
      notify.success("颜色已更新")
    } catch (error) {
      notify.error(toMessage(error))
    } finally {
      setBusy(null)
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

      {/* AI 识别颜色 */}
      {detail.image_count > 0 ? (
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">AI 识别颜色</div>
              <div className="text-xs text-muted-foreground">
                根据已上传的素材图自动识别产品颜色
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void detectColors()}
              disabled={busy === "detect"}
            >
              {busy === "detect" ? "识别中..." : "识别颜色"}
            </Button>
          </div>

          {editingColors && detectedColors !== null ? (
            <div className="mt-3 space-y-3 border-t border-border pt-3">
              <div>
                <div className="mb-1.5 text-xs font-medium">检测到的颜色（可编辑，用顿号或逗号分隔）</div>
                <input
                  type="text"
                  value={colorsText}
                  onChange={(e) => setColorsText(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <div className="mb-1.5 text-xs font-medium">主推颜色</div>
                <input
                  type="text"
                  value={heroColor}
                  onChange={(e) => setHeroColor(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void saveDetectedColors()}
                  disabled={busy === "save-colors"}
                >
                  {busy === "save-colors" ? "保存中..." : "确认并保存"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingColors(false)
                    setDetectedColors(null)
                  }}
                >
                  取消
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

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
