# Design — Product-centric layout refactor

## 架构概览

### 路由状态

将单个 `page: PageKey` 替换为两个独立 state：

```ts
// core/types.ts
export type TopPage = "products" | "cache" | "settings"
export type ProductTab = "assets" | "generate" | "outputs" | "logs"
```

`App.tsx` 持有：
- `topPage: TopPage`（默认 `"products"`）
- `productTab: ProductTab`（默认 `"assets"`）
- `selectedId: string`
- `products: Product[]`

### 组件树

```
App
└─ AppShell (shadcn Sidebar + SidebarInset)
   ├─ AppSidebar
   │   ├─ SidebarHeader     → 品牌 "ImageWorkflow"
   │   ├─ SidebarContent
   │   │   └─ SidebarMenu   → 产品 / 缓存
   │   └─ SidebarFooter
   │       └─ 设置按钮 + 主题切换按钮（保持现有视觉）
   └─ SidebarInset
      └─ <main>
          topPage === "products" → ProductsLayout
                                   ├─ ProductListPanel  (左 340px)
                                   └─ ProductWorkspace  (右)
                                       ├─ ProductHeader (sticky, 标题 + 操作)
                                       └─ Tabs
                                           ├─ TabsList: 素材/生成/结果/日志
                                           └─ TabsContent
                                               - assets   → ProductAssetsPanel
                                               - generate → GeneratePage
                                               - outputs  → OutputsPage
                                               - logs     → LogsPage(productId, scope)
          topPage === "cache"    → CachePage
          topPage === "settings" → SettingsPage
```

### 文件改动

#### 新增
- `apps/web/src/layout/app-sidebar.tsx` — shadcn Sidebar 组合
- `apps/web/src/pages/products/ProductsLayout.tsx` — 左右两栏容器
- `apps/web/src/pages/products/ProductListPanel.tsx` — 左侧产品列表（含新建/打开文件夹按钮）
- `apps/web/src/pages/products/ProductWorkspace.tsx` — 右侧 header + tab 容器
- `apps/web/src/pages/products/ProductHeader.tsx` — sticky header（产品名 + 编辑/删除/打开文件夹）
- `apps/web/src/pages/products/ProductAssetsPanel.tsx` — 从 `ProductsPage` 抽出的图片管理
- `apps/web/src/pages/products/ProductFormDialog.tsx` — 编辑/新建对话框（从 `ProductsPage` 抽出）
- `apps/web/src/core/job-meta.ts` — `JOB_KIND_LABEL` / `JOB_STATUS_LABEL` / `JOB_STATUS_TONE` 集中导出
- `packages/ui/src/components/sidebar.tsx` — `npx shadcn add sidebar`
- `packages/ui/src/components/tabs.tsx` — `npx shadcn add tabs`

#### 改动
- `apps/web/src/App.tsx` — 顶层 state 拆两层、根据 topPage 路由
- `apps/web/src/layout/shell.tsx` — 重写为 shadcn Sidebar 组合（或直接被 app-sidebar 替代后删除）
- `apps/web/src/core/types.ts` — 删除 `Job` / `JobStatus`，拆 `PageKey` → `TopPage` + `ProductTab`
- `apps/web/src/pages/LogsPage.tsx` — 接受 `productId?: string` + `scope: "current" | "all"`，默认按 productId 过滤；保留独立运行（cache/settings 顶层不渲染 LogsPage）
- `apps/web/src/pages/GeneratePage.tsx` — 用 `core/job-meta.ts`
- `apps/web/src/core/job-store.ts` — 用 `core/job-meta.ts`
- `apps/web/src/core/product-client.ts` — `save` 接受 `ProductCreateInput`（不含派生字段），内部组装为 `product.Product`

#### 删除
- `apps/web/src/pages/ProductsPage.tsx` — 拆解后删除（内容分散到 products/* 子组件）
- 三处重复的 `KIND_LABEL` / `STATUS_LABEL` / `STATUS_TONE` 局部定义

### 类型契约

```ts
// core/types.ts (修改后)
export type TopPage = "products" | "cache" | "settings"
export type ProductTab = "assets" | "generate" | "outputs" | "logs"

export type Product = { ... }              // 不变
export type SettingItem = { ... }          // 不变
export type OutputFile = { ... }           // 不变
export type CacheItem = { ... }            // 不变
// Job / JobStatus 删除（统一从 core/job-client.ts import）
```

```ts
// core/job-meta.ts (新增)
import type { JobKind, JobStatus } from "./job-client"

export const JOB_KIND_LABEL: Record<JobKind, string> = {
  generate: "分析并生图",
  analyze: "仅分析",
  render: "按计划生图",
  "render-main": "仅主图",
  "render-sku": "仅 SKU",
  "render-detail": "仅细节图",
  "dry-run": "试运行",
}

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  queued: "排队中",
  running: "运行中",
  succeeded: "完成",
  failed: "失败",
  cancelled: "已取消",
}

export const JOB_STATUS_TONE: Record<JobStatus, "default" | "success" | "warning" | "destructive"> = {
  queued: "warning",
  running: "warning",
  succeeded: "success",
  failed: "destructive",
  cancelled: "default",
}
```

```ts
// core/product-client.ts 新增 ProductCreateInput
import { product } from "../wailsjs/wailsjs/go/models"

export type ProductCreateInput = {
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

export const productClient = {
  save(input: ProductCreateInput): Promise<ProductDetail> {
    const payload = product.Product.createFrom?.({
      ...input,
      image_count: 0,   // 后端忽略派生字段（保持现状）
      has_plan: false,
      output_count: 0,
    }) ?? ({ ...input, image_count: 0, has_plan: false, output_count: 0 } as product.Product)
    return SaveProduct(payload)
  },
  // ...其余不变
}
```

### LogsPage 作用域开关

```tsx
type Props = { productId?: string }  // 顶层从 ProductWorkspace 传入

const [scope, setScope] = useState<"current" | "all">(productId ? "current" : "all")
const filteredJobs = useMemo(() => {
  if (scope === "all" || !productId) return jobs
  return jobs.filter((j) => j.product_id === productId)
}, [jobs, productId, scope])
```

顶部新增小工具栏：
```
作用域：[● 当前产品]  [○ 全部产品]   清空已完成 →
```

任务列表 8 条顶满逻辑保持，作用在 `filteredJobs` 上。

### Sticky Product Header

```tsx
<div className="sticky top-0 z-10 -mx-5 mb-4 border-b border-border bg-background/95 px-5 py-3 backdrop-blur">
  <div className="flex items-center justify-between gap-3">
    <div className="min-w-0">
      <div className="flex items-center gap-2 text-base font-semibold">
        <span className="font-mono">{detail.product_id}</span>
        <span className="text-muted-foreground">·</span>
        <span className="truncate">{detail.name || "未命名"}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        {detail.image_count} 素材 · {detail.output_count} 输出
        {detail.has_plan ? " · 已分析" : ""}
      </div>
    </div>
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={openFolder}>打开产品文件夹</Button>
      <Button size="sm" variant="outline" onClick={openEdit}>编辑</Button>
      <Button size="sm" variant="destructive" onClick={deleteProduct}>删除</Button>
    </div>
  </div>
</div>
```

### 边界与权衡

- **不做 router**：顶部状态用 useState 即可，刷新会回到默认 tab（用户已习惯，且 Wails 桌面端不存在 URL 分享需求）。
- **shadcn Sidebar 默认是 offcanvas 可折叠**：本项目 PC 桌面端固定显示即可，使用 `collapsible="none"`，避免引入折叠状态。
- **Tabs 组件 vs 自写 button[]**：用 shadcn `Tabs`，更符合规范、accessibility 自带。
- **空态**：未选产品时 `ProductWorkspace` 渲染居中提示"先在左侧选择或新建产品"，4 个 tab 按钮 disabled。
- **LogsPage 作为顶层独立页时**：本次重构后 LogsPage 不再独立顶层路由，但保留组件可独立运行，便于将来需要时再次接入。
- **风险点**：ProductsPage 内部 effect 以 `selectedId` 为依赖加载 detail，搬到 `ProductAssetsPanel` 后行为应一致；要确保 `onProductsChange` 回调链路完整。

### 测试策略

- TypeScript 严格 build：`pnpm --filter web build` 通过。
- Wails dev：`wails dev` 启动后用 preview 工具验证：
  1. 进入产品页能看到左右两栏
  2. 选中 39 → 切到生成 tab → 切到结果 tab → 切到日志 tab，header 一直显示 39
  3. 在日志 tab 上切换"作用域"，列表数量随之变
  4. 缓存 / 设置 顶层切换正常
  5. 主题切换按钮可用
  6. 现有所有现有按钮（小眼睛、复制弹窗、二次确认、重跑等）行为不变
