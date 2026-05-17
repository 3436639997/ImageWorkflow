# Move rerun outputs theme toggle and shrink job list

## Goal

四件事一起做：
1. 把「分图重跑」按钮从 GeneratePage 搬到 OutputsPage 各分组顶部
2. LogsPage 任务列表默认显示 8 个（顶满区域高度，不出现内部滚动）
3. 整体配色从当前 `radix-maia` style 切到 shadcn 经典 `neutral` 主题（明显改观感）
4. 顶部侧边栏「设置」菜单项右侧加日间/夜间切换图标按钮

## Scope

### 1. 搬「重跑」入口

GeneratePage 移除 "分图重跑" 区块（仅保留主动作 4 个按钮）。

OutputsPage 在每个非空分组的 SectionCard `right` 处加「重跑本组」按钮：
- main 组 → 触发 `render-main` job
- sku 组 → 触发 `render-sku` job
- detail 组 → 触发 `render-detail` job
- other 不显示按钮
- 点击需 useConfirm 二次确认（同 GeneratePage 现有模式）
- 触发后 toast「任务已加入队列，可在日志页查看」

OutputsPage 顶部「打开输出文件夹」旁边再加一个「重跑全部」按钮，触发 `render` job。

### 2. 任务列表瘦身到 8

LogsPage：
- 默认显示数从 20 → 8
- 「显示全部 (N)」按钮文案不变
- 列表区高度去掉内部滚动（`max-h-[70vh] overflow-y-auto` 改成自然高度），8 项刚好填满 SectionCard

### 3. 配色换 neutral

- `packages/ui/components.json` 的 `style` 字段保留 `radix-maia`（不改架构），但 `globals.css` 整套 OKLCH 变量替换成 shadcn `neutral` 推荐值
- 更新 light + dark 两套 `:root` / `.dark` 变量
- 同步 `--sidebar-*` 让侧边栏也跟着换
- 不动 chart-* 颜色（不影响业务）

### 4. 主题切换按钮

`apps/web/src/layout/shell.tsx`：
- 在「设置」菜单项右侧（同一行）加一个图标按钮（太阳/月亮）
- 点击在 `light` / `dark` 之间切换（跳过 `system`，保持简单）
- 用现有的 `useTheme()`（`@/components/theme-provider`）
- 图标用 hugeicons 的 `SunIcon` / `MoonIcon`

## Acceptance Criteria

- [ ] GeneratePage 不再有「分图重跑」区块
- [ ] OutputsPage 每个非空分组卡片右上角有「重跑本组」按钮
- [ ] 点击重跑按钮 → 弹确认 → 启动对应 job → toast 提示
- [ ] LogsPage 默认显示 8 个任务，无内部滚动条
- [ ] LogsPage > 8 个任务时显示「显示全部 (N)」按钮
- [ ] 整体配色明显变化（更冷/更标准 shadcn 风格，不再是粉色 destructive）
- [ ] 侧边栏底部「设置」右侧有太阳/月亮图标按钮
- [ ] 点击图标在 light/dark 间切换，整个 app 立即跟随
- [ ] Go 编译 + 前端 build 通过

## Out of Scope

- 自动跟随系统主题（保留 ThemeProvider 内部支持，但 toggle 按钮只在 light/dark 切）
- 主题色定制 UI
- 配色完全沿用官方 shadcn 配色，不引入品牌色

## Technical Notes

- 复用现有 `useConfirm`、`useMessage`、`jobClient` API
- `tailwind.config` 不改（neutral 是默认 base）
- shadcn neutral OKLCH 参考：
  - `--background: oklch(1 0 0)` / dark: `oklch(0.145 0 0)`
  - `--foreground: oklch(0.145 0 0)` / dark: `oklch(0.985 0 0)`
  - `--primary: oklch(0.205 0 0)` / dark: `oklch(0.985 0 0)`
  - `--destructive: oklch(0.577 0.245 27.325)` / dark `oklch(0.396 0.141 25.723)`
  - 等等，按 shadcn 官方文档完整覆盖
