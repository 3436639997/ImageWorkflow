# Refactor to product-centric layout with type contract alignment

## Goal

将当前以"功能"分页（产品 / 生成 / 结果 / 缓存 / 日志 / 设置）的扁平 6 项侧边栏，重构为以"产品对象"为中心的 Master-Detail 布局：侧边栏只保留 3 项（产品 / 缓存 / 设置），进入产品后通过内部 tab（素材 / 生成 / 结果 / 日志）完成全部产品相关流程，使产品上下文不丢失、跨页跳转链路缩短。同时一并修正前端类型契约漂移（`Job.kind`、`JobStatus`、`Product` 死代码、`as never` 类型逃逸）。后端不动。

## Requirements

### R1 — 侧边栏简化为 3 项
- 顶部品牌区不变（"ImageWorkflow"）。
- `PRIMARY_NAV` 缩为：产品 / 缓存。
- `SECONDARY_NAV` 保留：设置；右侧的日间/夜间切换按钮位置和现有视觉保持一致。
- 改用 shadcn `Sidebar` 组件体系（`Sidebar` / `SidebarHeader` / `SidebarContent` / `SidebarFooter` / `SidebarMenu`），不再自写 `<aside>`。

### R2 — 产品页变成 Master-Detail
- 路由进入"产品"后展示左右两栏：左 340px 产品列表 + 新建按钮；右侧为"产品工作区"。
- 产品列表保持现有视觉（选中产品 `border-primary bg-primary/5`、`{image_count}图` 计数、空态提示）。
- 右侧顶部为 sticky header：`产品 ID · 名称`，右上角放产品级操作（编辑、删除、打开产品文件夹）。
- header 下方是 4 个内部 tab：素材 / 生成 / 结果 / 日志。

### R3 — 4 个内部 Tab 内容来源
- **素材 tab**：来自现有 `ProductsPage` 的右侧详情面板（图片管理、上传、删除）。原"产品列表"和"新建/编辑/删除产品"操作上移到 R2 的两栏布局里。
- **生成 tab**：现有 `GeneratePage` 几乎不动，去掉"请先在产品页选择产品"的空态（因为现在不可能没产品就进 tab）。
- **结果 tab**：现有 `OutputsPage` 几乎不动，同上去掉"未选择产品"空态。
- **日志 tab**：现有 `LogsPage`，但默认作用域为"当前产品"——只显示 `job.product_id === currentProductId` 的任务，顶部加 `作用域：[● 当前产品] [○ 全部产品]` 切换。

### R4 — Tab 切换状态
- 当前 productId 与 currentTab 都由 `App.tsx` 顶层 state 管理，不丢上下文。
- tab 切换不重置滚动位置时，浏览器默认行为可接受；不需要持久化到 localStorage。
- 切换产品时 tab 保持不变（用户在"日志"tab 切到产品 B，仍然是日志 tab）。

### R5 — 顶层路由简化
- 顶层 `PageKey` 拆为两层：
  - `TopPage = "products" | "cache" | "settings"`
  - `ProductTab = "assets" | "generate" | "outputs" | "logs"`
- 新增 `ProductWorkspace.tsx` 作为产品页右侧容器。
- 不引入 React Router；继续用 `useState` 控制（但要拆出两个 state）。

### R6 — 前端类型契约对齐（同步做掉）
- `core/types.ts` 中的 `Job` / `JobStatus` 是死代码（实际用的是 `core/job-client.ts` 里的，且后者来自 wailsjs 自动生成的 `job.Job`）——删除 `types.ts` 里这两个类型。
- 顺便把 `core/types.ts` 中的 `PageKey` 拆成 R5 的两个新类型。
- `KIND_LABEL` / `STATUS_LABEL` / `STATUS_TONE` 当前在 `LogsPage` / `GeneratePage` / `job-store.ts` 三处重复，集中到 `core/job-meta.ts`，由三处 import。
- `ProductsPage.tsx` 里的 `as never`（[行 147](apps/web/src/pages/ProductsPage.tsx)）通过定义 `ProductCreateInput` 类型替代——前端 mapper：`ProductFormState → product.Product`，不动后端。

### R7 — 不破坏现有功能
- 所有现有按钮、对话框、弹窗、键盘行为保持原样：保存设置、API key 小眼睛、复制图标、shadcn AlertDialog 二次确认、任务 8 条顶满高度、运行中任务 1.5s 拉日志、生图成功/失败弹窗、`重跑全部 / 重跑本组`、日间/夜间切换。
- 后端零改动。

## Out of Scope

- 不做 React Router 接入。
- 不做 i18n。
- 不做"概览" tab（原方案 5 个 tab，本次砍为 4 个；产品信息编辑维持 Dialog 入口）。
- 不重写 `ProductsPage` 内部图片管理逻辑（只搬到"素材"tab）。
- 不动后端任何代码。

## Acceptance Criteria

- [ ] 侧边栏只剩"产品 / 缓存 / 设置 + 主题切换按钮"4 个可见项，使用 shadcn `Sidebar` 组件体系。
- [ ] 进入"产品"后，左侧产品列表 340px、右侧产品工作区；切换产品时 tab 保持不变。
- [ ] 产品工作区顶部 sticky header 显示 `产品 ID · 名称`，并包含编辑 / 删除 / 打开文件夹按钮。
- [ ] 4 个内部 tab（素材 / 生成 / 结果 / 日志）功能等价于原 4 个独立页面。
- [ ] 日志 tab 默认仅显示当前产品的任务，顶部有"全部产品"开关，切换 8 条限制保持不变。
- [ ] `core/types.ts` 中的 `Job`、`JobStatus` 已删除；`PageKey` 已拆为 `TopPage` + `ProductTab`。
- [ ] `KIND_LABEL` / `STATUS_LABEL` / `STATUS_TONE` 单一来源（`core/job-meta.ts`），三处页面 import；旧的本地副本已删。
- [ ] `ProductsPage.tsx` 中的 `as never` 已消除。
- [ ] `pnpm build` 通过；前端 TypeScript 严格通过；Wails dev server 启动后人工验证：建产品 → 上传素材 → 生成 → 看结果 → 看日志全流程在产品工作区内不切顶层导航即可完成。
- [ ] 所有现有 UX 行为（小眼睛、复制弹窗、二次确认、8 条顶满、生图弹窗、主题切换）回归通过。

## Notes

- 涉及组件：`apps/web/src/App.tsx`、`apps/web/src/layout/shell.tsx`（重写或拆为 `app-sidebar.tsx`）、`apps/web/src/pages/*`（拆/搬）、`apps/web/src/core/types.ts`、`apps/web/src/core/job-store.ts`、新增 `apps/web/src/core/job-meta.ts`、新增 `apps/web/src/pages/products/ProductWorkspace.tsx`（容器）。
- 需要 `npx shadcn@latest add sidebar tabs breadcrumb` 添加 3 个 shadcn 组件到 `packages/ui`。
- 后端不动；wailsjs 不需要重新生成。
