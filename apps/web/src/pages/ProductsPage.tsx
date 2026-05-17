import { useEffect, useMemo, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Separator } from "@workspace/ui/components/separator"
import { Textarea } from "@workspace/ui/components/textarea"

import { productClient, type ProductDetail } from "../core/product-client"
import { systemClient } from "../core/system-client"
import type { Product } from "../core/types"
import { useConfirm } from "../shared/confirm.tsx"
import { useMessage } from "../shared/message.tsx"
import { SectionCard } from "../shared/section"

type ProductFormState = {
  product_id: string
  name: string
  category: string
  description: string
  keywords: string
  colors_text: string
  hero_color: string
  color_image_map: string
  detail_image_count: number
  notes: string
}

const EMPTY_FORM: ProductFormState = {
  product_id: "",
  name: "",
  category: "",
  description: "",
  keywords: "",
  colors_text: "",
  hero_color: "",
  color_image_map: "",
  detail_image_count: 2,
  notes: "",
}

export function ProductsPage({
  products,
  selectedId,
  onSelect,
  onProductsChange,
}: {
  products: Product[]
  selectedId: string
  onSelect: (id: string) => void
  onProductsChange?: () => void
}) {
  const [detail, setDetail] = useState<ProductDetail | null>(null)
  const [filePort, setFilePort] = useState(0)
  const [dragActive, setDragActive] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<"create" | "edit">("create")
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const notify = useMessage()
  const confirm = useConfirm()

  useEffect(() => {
    void systemClient.getFileServerPort().then(setFilePort)
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    void loadDetail(selectedId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  async function loadDetail(id: string) {
    try {
      const data = await productClient.get(id)
      setDetail(data)
    } catch (error) {
      notify.error(toMessage(error))
    }
  }

  function refresh() {
    onProductsChange?.()
    if (selectedId) void loadDetail(selectedId)
  }

  function openCreate() {
    setForm(EMPTY_FORM)
    setFormMode("create")
    setFormOpen(true)
  }

  function openEdit() {
    if (!detail) return
    setForm({
      product_id: detail.product_id,
      name: detail.name,
      category: detail.category,
      description: detail.description,
      keywords: detail.keywords,
      colors_text: detail.colors_text,
      hero_color: detail.hero_color,
      color_image_map: detail.color_image_map,
      detail_image_count: detail.detail_image_count || 2,
      notes: detail.notes,
    })
    setFormMode("edit")
    setFormOpen(true)
  }

  async function submitForm() {
    if (!form.product_id.trim()) {
      notify.error("产品 ID 必填")
      return
    }
    try {
      setBusy("save")
      await productClient.save({
        product_id: form.product_id.trim(),
        name: form.name,
        category: form.category,
        description: form.description,
        keywords: form.keywords,
        colors_text: form.colors_text,
        hero_color: form.hero_color,
        color_image_map: form.color_image_map,
        detail_image_count: form.detail_image_count || 2,
        notes: form.notes,
        image_count: 0,
        has_plan: false,
        output_count: 0,
      } as never)
      notify.success(formMode === "create" ? "产品已创建" : "产品已更新")
      setFormOpen(false)
      onSelect(form.product_id.trim())
      refresh()
    } catch (error) {
      notify.error(toMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function deleteProduct() {
    if (!detail) return
    const ok = await confirm({
      tone: "danger",
      title: "删除产品",
      description: `确定删除产品 ${detail.product_id}？这将同时删除其所有素材图，且无法恢复。`,
      confirmLabel: "删除",
    })
    if (!ok) return
    try {
      setBusy("delete")
      await productClient.delete(detail.product_id)
      notify.success("产品已删除")
      refresh()
      onSelect("")
    } catch (error) {
      notify.error(toMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function openFolder() {
    if (!selectedId) return
    try {
      await systemClient.openProductFolder(selectedId)
    } catch (error) {
      notify.error(toMessage(error))
    }
  }

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
      refresh()
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
      refresh()
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
      refresh()
    } catch (error) {
      notify.error(toMessage(error))
    }
  }

  const imageBaseURL = useMemo(
    () => (filePort ? `http://127.0.0.1:${filePort}/product` : ""),
    [filePort]
  )

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <SectionCard
        title="产品列表"
        description="选择产品并进入后续流程。"
        right={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void openFolder()}
              disabled={!selectedId}
            >
              打开文件夹
            </Button>
            <Button type="button" size="sm" onClick={openCreate}>
              新建产品
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          {products.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              暂无产品，点右上角「新建产品」开始。
            </div>
          ) : (
            products.map((item) => (
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
                  <div className="text-xs text-muted-foreground">
                    {item.image_count}图
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="产品详情"
        description={detail ? `当前产品：${detail.product_id}` : "请先从左侧选择或新建产品。"}
        right={
          detail ? (
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={openEdit}>
                编辑
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void deleteProduct()}
                disabled={busy === "delete"}
              >
                删除
              </Button>
            </div>
          ) : null
        }
      >
        {!detail ? (
          <Empty text="请先从左侧选择或新建产品" />
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              <Info label="名称" value={detail.name || "-"} />
              <Info label="类目" value={detail.category || "-"} />
              <Info label="颜色" value={detail.colors_text || "-"} />
              <Info label="主推颜色" value={detail.hero_color || "-"} />
              <Info label="素材图" value={`${detail.image_count} 张`} />
              <Info label="产出图" value={`${detail.output_count} 张`} />
            </div>

            {detail.description ? (
              <Info label="描述" value={detail.description} />
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
        )}
      </SectionCard>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="flex max-h-[85vh] w-[min(1100px,90vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>{formMode === "create" ? "新建产品" : "编辑产品"}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="space-y-6">
              <FormSection title="基本信息" description="产品的标识与分类">
                <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
                  <FormField
                    label="产品 ID"
                    required
                    hint="即文件夹名，将创建在 new_products/<id>/ 下"
                  >
                    <Input
                      value={form.product_id}
                      onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                      placeholder="P-1001"
                      disabled={formMode === "edit"}
                      className="font-mono"
                    />
                  </FormField>
                  <FormField label="产品名称">
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Linen Shirt"
                    />
                  </FormField>
                  <FormField label="一级类目">
                    <Input
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      placeholder="Top / Outer / Bottom"
                    />
                  </FormField>
                  <FormField label="关键词">
                    <Input
                      value={form.keywords}
                      onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                      placeholder="linen, summer, casual"
                    />
                  </FormField>
                  <FormField label="主推颜色">
                    <Input
                      value={form.hero_color}
                      onChange={(e) => setForm({ ...form, hero_color: e.target.value })}
                      placeholder="black"
                    />
                  </FormField>
                  <FormField label="所有颜色" hint="多个颜色用 、或 , 分隔">
                    <Input
                      value={form.colors_text}
                      onChange={(e) => setForm({ ...form, colors_text: e.target.value })}
                      placeholder="black, white, beige"
                    />
                  </FormField>
                  <FormField label="细节图数量" hint="生成结果中包含的细节图张数（1~3）">
                    <Input
                      type="number"
                      min={1}
                      max={3}
                      value={form.detail_image_count}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          detail_image_count: Number(e.target.value) || 2,
                        })
                      }
                    />
                  </FormField>
                </div>
              </FormSection>

              <Separator />

              <FormSection title="产品描述" description="详细说明（可选）">
                <FormField label="产品描述">
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={4}
                    placeholder="材质、卖点、目标人群..."
                  />
                </FormField>
              </FormSection>

              <Separator />

              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">高级设置</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      颜色映射与备注（不常用）
                    </div>
                  </div>
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="outline" size="sm">
                      {advancedOpen ? "收起" : "展开"}
                    </Button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent className="pt-4">
                  <div className="space-y-4">
                    <FormField
                      label="颜色 → 图片映射"
                      hint='JSON 格式，指定每个颜色变体对应的素材图。例：{"black": "img1.jpg"}'
                    >
                      <Input
                        value={form.color_image_map}
                        onChange={(e) =>
                          setForm({ ...form, color_image_map: e.target.value })
                        }
                        placeholder='{"black": "img1.jpg"}'
                        className="font-mono"
                      />
                    </FormField>
                    <FormField label="备注">
                      <Textarea
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        rows={2}
                      />
                    </FormField>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>

          <DialogFooter className="border-t border-border px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={() => void submitForm()} disabled={busy === "save"}>
              {busy === "save" ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
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

function FormSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-3">
        <div className="text-sm font-semibold">{title}</div>
        {description ? (
          <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {children}
    </div>
  )
}

function FormField({
  label,
  required,
  hint,
  children,
  className,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <div className="mb-2 text-sm font-medium">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </div>
      {children}
      {hint ? (
        <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  )
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const idx = result.indexOf(",")
      resolve(idx >= 0 ? result.slice(idx + 1) : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
