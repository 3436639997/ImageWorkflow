import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useTheme } from "@/components/theme-provider"
import type { PageKey } from "../core/types"

const PRIMARY_NAV: Array<{ key: PageKey; label: string }> = [
  { key: "products", label: "产品" },
  { key: "generate", label: "生成" },
  { key: "outputs", label: "结果" },
  { key: "cache", label: "缓存" },
  { key: "logs", label: "日志" },
]

const SECONDARY_NAV: Array<{ key: PageKey; label: string }> = [
  { key: "settings", label: "设置" },
]

export function AppShell({
  page,
  onChangePage,
  children,
}: {
  page: PageKey
  onChangePage: (key: PageKey) => void
  children: React.ReactNode
}) {
  const { theme, setTheme } = useTheme()
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"))

  function toggleTheme() {
    setTheme(isDark ? "light" : "dark")
  }

  function renderItem(item: { key: PageKey; label: string }) {
    return (
      <button
        key={item.key}
        type="button"
        onClick={() => onChangePage(item.key)}
        className={[
          "w-full rounded-md px-3 py-2 text-left text-sm",
          page === item.key
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-muted-foreground hover:bg-muted",
        ].join(" ")}
      >
        {item.label}
      </button>
    )
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="flex w-56 flex-col border-r border-border bg-sidebar p-3">
        <div className="mb-4 rounded-lg bg-sidebar-primary/10 p-3">
          <div className="text-sm font-semibold">ImageWorkflow</div>
          <div className="text-xs text-muted-foreground">本地生图控制台</div>
        </div>
        <nav className="flex-1 space-y-1">
          {PRIMARY_NAV.map(renderItem)}
        </nav>
        <nav className="mt-3 space-y-1 border-t border-border pt-3">
          {SECONDARY_NAV.map((item) => (
            <div key={item.key} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onChangePage(item.key)}
                className={[
                  "flex-1 rounded-md px-3 py-2 text-left text-sm",
                  page === item.key
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-muted",
                ].join(" ")}
              >
                {item.label}
              </button>
              <button
                type="button"
                onClick={toggleTheme}
                className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                aria-label={isDark ? "切换到日间模式" : "切换到夜间模式"}
                title={isDark ? "切换到日间模式" : "切换到夜间模式"}
              >
                <HugeiconsIcon icon={isDark ? Sun03Icon : Moon02Icon} size={18} strokeWidth={1.8} />
              </button>
            </div>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-auto p-5">{children}</main>
    </div>
  )
}
