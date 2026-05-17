import {
  DatabaseIcon,
  Moon02Icon,
  PackageIcon,
  Settings02Icon,
  SidebarLeftIcon,
  Sun03Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@workspace/ui/components/sidebar"

import { useTheme } from "@/components/theme-provider"
import type { TopPage } from "../core/types"

const PRIMARY_NAV: Array<{ key: TopPage; label: string; icon: typeof PackageIcon }> = [
  { key: "products", label: "产品", icon: PackageIcon },
  { key: "cache", label: "缓存", icon: DatabaseIcon },
]

export function AppSidebar({
  topPage,
  onChangePage,
}: {
  topPage: TopPage
  onChangePage: (key: TopPage) => void
}) {
  const { theme, setTheme } = useTheme()
  const { state, toggleSidebar } = useSidebar()
  const collapsed = state === "collapsed"

  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"))

  function toggleTheme() {
    setTheme(isDark ? "light" : "dark")
  }

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="px-2 py-2">
        <div className="flex items-center gap-2 px-1">
          {collapsed ? null : (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">ImageWorkflow</div>
              <div className="truncate text-xs text-muted-foreground">本地生图控制台</div>
            </div>
          )}
          <button
            type="button"
            onClick={toggleSidebar}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
            title={collapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            <HugeiconsIcon icon={SidebarLeftIcon} size={18} strokeWidth={1.8} />
          </button>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {PRIMARY_NAV.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    isActive={topPage === item.key}
                    onClick={() => onChangePage(item.key)}
                    tooltip={item.label}
                  >
                    <HugeiconsIcon icon={item.icon} size={18} strokeWidth={1.8} />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={topPage === "settings"}
              onClick={() => onChangePage("settings")}
              tooltip="设置"
            >
              <HugeiconsIcon icon={Settings02Icon} size={18} strokeWidth={1.8} />
              <span>设置</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={toggleTheme}
              tooltip={isDark ? "切换到日间模式" : "切换到夜间模式"}
              aria-label={isDark ? "切换到日间模式" : "切换到夜间模式"}
            >
              <HugeiconsIcon icon={isDark ? Sun03Icon : Moon02Icon} size={18} strokeWidth={1.8} />
              <span>{isDark ? "日间模式" : "夜间模式"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
