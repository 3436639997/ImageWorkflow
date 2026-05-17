import { useEffect, useState } from "react"

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

import { productClient } from "../../core/product-client"
import { useMessage } from "../../shared/message.tsx"
import { toMessage } from "./helpers"
import type { ProductFormMode, ProductFormState } from "./product-form"
import { FormField, FormSection } from "./shared"

export function ProductFormDialog({
  open,
  mode,
  initialForm,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  mode: ProductFormMode
  initialForm: ProductFormState
  onOpenChange: (open: boolean) => void
  onSaved: (savedId: string) => void
}) {
  const [form, setForm] = useState<ProductFormState>(initialForm)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const notify = useMessage()

  // Sync the form whenever the dialog opens with a fresh `initialForm`.
  useEffect(() => {
    if (open) setForm(initialForm)
  }, [open, initialForm])

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
  }

  async function submitForm() {
    if (!form.product_id.trim()) {
      notify.error("产品 ID 必填")
      return
    }
    try {
      setBusy(true)
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
      })
      notify.success(mode === "create" ? "产品已创建" : "产品已更新")
      onSaved(form.product_id.trim())
    } catch (error) {
      notify.error(toMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[min(1100px,90vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>{mode === "create" ? "新建产品" : "编辑产品"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-6">
            <FormSection title="基本信息" description="产品的标识与分类">
              <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
                <FormField label="产品 ID" required hint="即文件夹名，将创建在 new_products/<id>/ 下">
                  <Input
                    value={form.product_id}
                    onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                    placeholder="P-1001"
                    disabled={mode === "edit"}
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
                      onChange={(e) => setForm({ ...form, color_image_map: e.target.value })}
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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={() => void submitForm()} disabled={busy}>
            {busy ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
