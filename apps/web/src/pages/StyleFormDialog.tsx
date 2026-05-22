import { useEffect, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"

import { styleClient, type Style } from "../core/style-client"
import { systemClient } from "../core/system-client"
import { useMessage } from "../shared/message.tsx"

export function StyleFormDialog({
  open,
  mode,
  initialStyle,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  mode: "create" | "edit"
  initialStyle: Style | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [name, setName] = useState("")
  const [prompt, setPrompt] = useState("")
  const [description, setDescription] = useState("")
  const [imagePaths, setImagePaths] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const notify = useMessage()

  useEffect(() => {
    if (open) {
      if (initialStyle) {
        setName(initialStyle.name)
        setPrompt(initialStyle.prompt)
      } else {
        setName("")
        setPrompt("")
      }
      setDescription("")
      setImagePaths([])
    }
  }, [open, initialStyle])

  async function handlePickImages() {
    try {
      const paths = await systemClient.openImageFiles()
      if (paths.length > 0) {
        setImagePaths(paths)
        notify.success(`已选择 ${paths.length} 张参考图`)
      }
    } catch {
      // 用户取消
    }
  }

  async function handleGeneratePrompt() {
    if (!description.trim()) {
      notify.error("请先输入风格描述")
      return
    }
    setGenerating(true)
    try {
      const generated = await styleClient.generatePrompt(description, imagePaths)
      setPrompt(generated)
      notify.success("风格提示词已生成，可继续编辑后保存")
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err))
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      notify.error("风格名称必填")
      return
    }
    if (!prompt.trim()) {
      notify.error("风格提示词不能为空")
      return
    }
    setSaving(true)
    try {
      const input = { name: name.trim(), prompt: prompt.trim() }
      if (mode === "create") {
        await styleClient.create(input)
        notify.success("风格套已创建")
      } else if (initialStyle) {
        await styleClient.update(initialStyle.id, input)
        notify.success("风格套已更新")
      }
      onSaved()
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[min(700px,90vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>{mode === "create" ? "新建风格" : "编辑风格"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-5">
            <div>
              <div className="mb-2 text-sm font-medium">
                风格名称 <span className="text-destructive">*</span>
              </div>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：简约白底、暗调氛围"
              />
            </div>

            <div>
              <div className="mb-2 text-sm font-medium">
                风格提示词 <span className="text-destructive">*</span>
              </div>
              <div className="mb-1.5 text-xs text-muted-foreground">
                可以直接输入/粘贴，或在下方输入描述后点「AI 生成」
              </div>
              <Textarea
                rows={8}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="White background, square composition, clean product layout, premium texture..."
                className="font-mono text-xs"
              />
            </div>

            <div className="rounded-lg border border-dashed border-border p-4">
              <div className="mb-2 text-sm font-medium">AI 辅助生成</div>
              <div className="mb-2 text-xs text-muted-foreground">
                输入你想要的风格描述，可选上传参考图片，点击「AI 生成」后会生成提示词填充到上方文本框
              </div>
              <Textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="描述你想要的风格，如：白底简约风格，产品居中，周围留白，强调材质细节..."
              />
              <div className="mt-3 flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handlePickImages()}
                >
                  {imagePaths.length > 0 ? `已选 ${imagePaths.length} 张参考图` : "选择参考图（可选）"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleGeneratePrompt()}
                  disabled={generating || !description.trim()}
                >
                  {generating ? "生成中..." : "AI 生成风格提示词"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
