import { useEffect, useMemo, useState } from "react"

import { json } from "@codemirror/lang-json"
import { githubDark, githubLight } from "@uiw/codemirror-theme-github"
import CodeMirror from "@uiw/react-codemirror"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"

import { cacheClient } from "../core/cache-client"
import { systemClient } from "../core/system-client"
import type { CacheItem } from "../core/types"
import { useTheme } from "@/components/theme-provider"
import { useConfirm } from "../shared/confirm.tsx"
import { useMessage } from "../shared/message.tsx"
import { SectionCard } from "../shared/section"

const GROUP_LABEL: Record<CacheItem["group"], string> = {
  global_style: "全局风格",
  category_style: "类目风格",
  generation_plan: "生图计划",
  other: "其他",
}

const GROUP_ORDER: CacheItem["group"][] = [
  "global_style",
  "category_style",
  "generation_plan",
  "other",
]

export function CachePage() {
  const [items, setItems] = useState<CacheItem[]>([])
  const [editing, setEditing] = useState<{ filename: string; content: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const notify = useMessage()
  const confirm = useConfirm()
  const { theme } = useTheme()
  const editorTheme = useMemo(() => {
    const isDark =
      theme === "dark" ||
      (theme === "system" && document.documentElement.classList.contains("dark"))
    return isDark ? githubDark : githubLight
  }, [theme])

  async function refresh() {
    try {
      const list = await cacheClient.list()
      setItems(list)
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const groups = useMemo(() => {
    return {
      global_style: items.filter((item) => item.group === "global_style"),
      category_style: items.filter((item) => item.group === "category_style"),
      generation_plan: items.filter((item) => item.group === "generation_plan"),
      other: items.filter((item) => item.group === "other"),
    }
  }, [items])

  async function deleteOne(item: CacheItem) {
    const ok = await confirm({
      tone: "danger",
      title: "删除缓存",
      description: `确定删除 ${item.filename}？`,
      confirmLabel: "删除",
    })
    if (!ok) return
    try {
      await cacheClient.clear([item.filename])
      notify.success("已删除")
      await refresh()
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function clearGroup(group: CacheItem["group"]) {
    const list = groups[group]
    if (!list.length) return
    const ok = await confirm({
      tone: "danger",
      title: `清空 ${GROUP_LABEL[group]}`,
      description: `确定清空 ${list.length} 个缓存文件？`,
      confirmLabel: "清空",
    })
    if (!ok) return
    try {
      const cleared = await cacheClient.clearGroup(group)
      notify.success(`已清除 ${cleared.length} 个文件`)
      await refresh()
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function startEdit(item: CacheItem) {
    try {
      const content = await cacheClient.read(item.filename)
      setEditing({ filename: item.filename, content: prettify(content) })
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function openInEditor(filename: string) {
    try {
      const path = await cacheClient.pathOf(filename)
      await systemClient.openInEditor(path)
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function saveEdit() {
    if (!editing) return
    try {
      JSON.parse(editing.content)
    } catch (err) {
      notify.error("JSON 格式不合法：" + (err instanceof Error ? err.message : String(err)))
      return
    }
    try {
      setBusy(true)
      await cacheClient.write(editing.filename, editing.content)
      notify.success("已保存")
      setEditing(null)
      await refresh()
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <SectionCard title="缓存概览" description="按组管理缓存条目">
        <div className="text-sm text-muted-foreground">总计 {items.length} 项</div>
      </SectionCard>

      {GROUP_ORDER.map((group) => {
        const rows = groups[group]
        return (
          <SectionCard
            key={group}
            title={GROUP_LABEL[group]}
            description={`${rows.length} 项`}
            right={
              rows.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void clearGroup(group)}
                >
                  清空本组
                </Button>
              ) : null
            }
          >
            {rows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                暂无条目
              </div>
            ) : (
              <div className="space-y-2">
                {rows.map((item) => (
                  <div
                    key={item.filename}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium font-mono">
                        {item.filename}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {Math.ceil(item.size / 1024)} KB · {item.updatedAt}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void startEdit(item)}
                      >
                        编辑
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void deleteOne(item)}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        )
      })}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="flex max-h-[85vh] w-[min(1200px,90vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
          <DialogHeader className="border-b border-border px-6 py-4">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="font-mono text-sm">{editing?.filename}</DialogTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => editing && void openInEditor(editing.filename)}
              >
                在编辑器打开
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <CodeMirror
              value={editing?.content ?? ""}
              onChange={(value) =>
                setEditing((current) =>
                  current ? { ...current, content: value } : current
                )
              }
              extensions={[json()]}
              theme={editorTheme}
              basicSetup={{
                lineNumbers: true,
                highlightActiveLine: true,
                bracketMatching: true,
                closeBrackets: true,
                indentOnInput: true,
                tabSize: 2,
              }}
              height="60vh"
              className="overflow-hidden rounded-lg border border-border text-sm"
            />
          </div>

          <DialogFooter className="border-t border-border px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button type="button" onClick={() => void saveEdit()} disabled={busy}>
              {busy ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function prettify(text: string) {
  if (!text) return ""
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}