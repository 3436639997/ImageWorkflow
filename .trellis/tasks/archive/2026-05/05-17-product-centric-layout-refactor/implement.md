# Implementation plan

## 顺序总览

1. **类型对齐预热**（最稳，独立可验证）
2. **添加 shadcn 组件**（外部依赖）
3. **新建容器组件**（不动现有页面，先有壳）
4. **拆 ProductsPage → 子组件**（最大改动）
5. **接入 LogsPage 作用域**
6. **替换 App + Shell**（切到新架构）
7. **删除旧文件 + 全流程验证**

每个阶段结束执行 `pnpm --filter web build` 必须通过；阶段 6 后做完整 dev 启动 + 浏览器验证。

---

## 步骤详细

### Step 1 — 前端类型契约对齐

- [ ] 1.1 修改 `apps/web/src/core/types.ts`：
  - 删除 `Job` / `JobStatus`
  - 把 `PageKey` 删除，新增 `TopPage` / `ProductTab`
- [ ] 1.2 新建 `apps/web/src/core/job-meta.ts`，导出 `JOB_KIND_LABEL` / `JOB_STATUS_LABEL` / `JOB_STATUS_TONE`
- [ ] 1.3 修改 `apps/web/src/core/job-store.ts`：从 `core/job-meta.ts` 导入，删除本地 `KIND_LABEL`
- [ ] 1.4 修改 `apps/web/src/pages/LogsPage.tsx` / `GeneratePage.tsx`：从 `core/job-meta.ts` 导入，删除本地 `KIND_LABEL` / `STATUS_LABEL` / `STATUS_TONE`
- [ ] 1.5 修改 `apps/web/src/core/product-client.ts`：新增 `ProductCreateInput`，`save` 改为接 `ProductCreateInput`
- [ ] 1.6 修改 `apps/web/src/pages/ProductsPage.tsx`：调用 `productClient.save` 时移除 `as never`，传 `ProductCreateInput`
- [ ] 1.7 验证：`pnpm --filter web build` 通过

### Step 2 — 添加 shadcn Sidebar / Tabs

- [ ] 2.1 在 `packages/ui/` 下：`npx shadcn@latest add sidebar tabs`
  - 注意 components.json 配置，确保装到 `packages/ui/src/components/`
- [ ] 2.2 检查 `packages/ui/src/components/sidebar.tsx` / `tabs.tsx` 文件已生成
- [ ] 2.3 检查 sidebar 依赖（`react-resizable-panels` 等）已自动加到 `packages/ui/package.json`
- [ ] 2.4 验证：`pnpm install` 完成；`pnpm --filter web build` 通过

### Step 3 — 新建产品容器骨架（不接入）

- [ ] 3.1 新建 `apps/web/src/pages/products/` 目录
- [ ] 3.2 新建 `ProductsLayout.tsx`：左右两栏 grid，左侧 placeholder、右侧 placeholder
- [ ] 3.3 新建 `ProductWorkspace.tsx`：sticky header placeholder + Tabs 骨架（4 个 tab，内容暂时各放 div）
- [ ] 3.4 新建 `ProductHeader.tsx`：接收 `detail` props，渲染 sticky header
- [ ] 3.5 新建 `ProductListPanel.tsx`：从 `ProductsPage.tsx` 拷贝产品列表逻辑（保留 `onSelect` 回调）
- [ ] 3.6 新建 `ProductFormDialog.tsx`：从 `ProductsPage.tsx` 抽出 form state + dialog
- [ ] 3.7 新建 `ProductAssetsPanel.tsx`：从 `ProductsPage.tsx` 抽出 `detail` 加载 + 图片网格 + 上传/删除/拖拽

### Step 4 — 接入 ProductWorkspace 内的 4 个 Tab

- [ ] 4.1 `ProductWorkspace.tsx` 的 `assets` tab 渲染 `<ProductAssetsPanel detail={...} onChange={...} />`
- [ ] 4.2 `generate` tab 渲染 `<GeneratePage products={...} selectedId={...} />`（无修改）
- [ ] 4.3 `outputs` tab 渲染 `<OutputsPage products={...} selectedId={...} />`（无修改）
- [ ] 4.4 `logs` tab 渲染 `<LogsPage productId={selectedId} />`（下一步实现 productId 过滤）

### Step 5 — LogsPage 作用域开关

- [ ] 5.1 修改 `LogsPage.tsx`：新增 `productId?: string` prop
- [ ] 5.2 新增 `scope: "current" | "all"` state，默认 `productId ? "current" : "all"`
- [ ] 5.3 列表渲染源改为 `filteredJobs`（按 scope 过滤）
- [ ] 5.4 顶部加作用域切换 UI（segmented buttons）；当 `productId` 为空时隐藏开关（保持原全局视图）
- [ ] 5.5 8 条 / 全部展开逻辑作用在 `filteredJobs` 上
- [ ] 5.6 自动选中第一个 job 的逻辑改为：选中 `filteredJobs[0]`

### Step 6 — 替换 AppShell + App

- [ ] 6.1 新建 `apps/web/src/layout/app-sidebar.tsx`：用 shadcn Sidebar 重写，内含产品/缓存/设置 + 主题切换
- [ ] 6.2 重写 `apps/web/src/App.tsx`：
  - state: `topPage` / `productTab` / `selectedId` / `products`
  - `topPage === "products"` → `<ProductsLayout ... />`
  - `topPage === "cache"` → `<CachePage />`
  - `topPage === "settings"` → `<SettingsPage />`
- [ ] 6.3 `shell.tsx` 替换为 `<SidebarProvider><AppSidebar /><SidebarInset>{children}</SidebarInset></SidebarProvider>` 包装
- [ ] 6.4 验证：`pnpm --filter web build` 通过

### Step 7 — 清理 + 验证

- [ ] 7.1 删除 `apps/web/src/pages/ProductsPage.tsx`
- [ ] 7.2 检查没有遗留 import 旧 `ProductsPage` 的地方（grep）
- [ ] 7.3 `pnpm --filter web build` + tsc 通过
- [ ] 7.4 启动 Wails dev，浏览器验证（见下"验证清单"）
- [ ] 7.5 `git diff` 自查：是否引入了 prd 之外的改动

## 验证清单

启动后人工 + preview 工具验证以下场景：

1. 侧边栏只剩 3 个可见项 + 主题切换按钮
2. 进入产品页：左侧产品列表 + 右侧空态提示（未选时）
3. 选中 39 → 切到"素材"显示图片网格 → 切到"生成"显示动作按钮 → 切到"结果"显示生成图 → 切到"日志"显示该产品任务
4. 切换产品到 40：4 个 tab header 中的产品名跟着变；当前 tab 不变
5. 日志 tab：作用域切到"全部产品"显示更多任务；切回"当前产品"减少
6. 切换日间/夜间模式生效
7. 顶层切到"缓存" / "设置"页正常打开
8. 现有所有交互保持：
   - API key 小眼睛
   - 复制图标 + toast
   - shadcn AlertDialog 二次确认
   - 任务 8 条顶满
   - 重跑全部 / 重跑本组
   - 生图成功/失败弹窗
   - 编辑/新建产品 dialog
   - 拖拽上传
   - 缓存编辑 dialog 宽度

## 验证命令

```bash
pnpm install
pnpm --filter web build
cd apps/backend && wails dev
```

## 回滚点

每个 Step 末尾建议 commit。如果 Step 6 后发现严重问题，回退到 Step 5 末尾的 commit 即可（旧 ProductsPage 还没删）。Step 7.1 之后才不可逆地删除旧文件。

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| shadcn Sidebar 在 monorepo 装错位置 | 先看 packages/ui/components.json 确认 path，再 add |
| `tabs` 组件 import 路径冲突 | 检查 packages/ui/src/components 是否已有 tabs（截止现在没有） |
| ProductsPage 里有未发现的副作用 | Step 4 完成后立刻 build + dev 跑一次，再删旧文件 |
| LogsPage 作为顶层时（未来）需要 scope 默认 all | productId 可选 + 默认逻辑已覆盖 |
| `as never` 删除后 wailsjs 类型严格 | 用 `product.Product.createFrom()` 或显式构造 |
