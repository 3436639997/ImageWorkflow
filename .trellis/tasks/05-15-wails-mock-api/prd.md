# 前端接入 Wails 绑定，替换 mock-api

## Goal

将前端从 `mock-api.ts` 模拟数据切换到通过 Wails 绑定调用真实 Go 后端服务，建立前端 adapter 层模式，使后续功能开发可以直接在 Go 后端实现业务逻辑并自动暴露给前端。

Settings 页面已经完成了这个切换（使用 `settings-client.ts` 调用 Wails 绑定），本任务将这个模式推广到其余 5 个页面。

## What I already know

- Settings 页面已有完整的 adapter 模式：`settings-client.ts` → Wails 绑定 → Go `settings.Service`
- 其余页面（Products/Generate/Outputs/Cache/Logs）全部依赖 `mock-api.ts`
- Wails 绑定自动生成到 `apps/web/src/wailsjs/wailsjs/go/`
- Go 后端目前只有 `settings.Service` 和 `system.Service`
- 老项目有完整的 Python 后端实现可参考（FastAPI routes + services）
- 前端 types 已定义好：Product, SettingItem, OutputFile, CacheItem, Job, JobStatus

## Requirements

### 后端（Go）新增 service — 只读列表

1. **product service** (`internal/product/service.go`)
   - `ListProducts() []Product` — 扫描 `new_products/` 目录，返回产品列表（id、名称推断、图片数、是否有 plan、输出数）
   - `GetProduct(id string) Product` — 单个产品详情（含图片文件名列表）

2. **output service** (`internal/output/service.go`)
   - `ListOutputs(productId string) []OutputFile` — 列出 `output/<id>/` 下的图片文件（filename、kind、size、mtime）

3. **cache service** (`internal/cache/service.go`)
   - `ListCaches() []CacheItem` — 列出 `cache/` 下的 JSON 文件（filename、group、size、mtime）

### 前端 adapter 层

4. 为每个 service 创建对应的 client 文件：
   - `core/product-client.ts` — 调用 Wails 绑定的 product service
   - `core/output-client.ts` — 调用 Wails 绑定的 output service
   - `core/cache-client.ts` — 调用 Wails 绑定的 cache service

5. 页面切换：
   - `ProductsPage` 从 `mockApi.listProducts()` → `productClient.list()`
   - `OutputsPage` 从 `mockApi.listOutputs()` → `outputClient.list()`
   - `CachePage` 从 `mockApi.listCaches()` → `cacheClient.list()`
   - `GeneratePage` 和 `LogsPage` 暂保留 mock（job service 留到 Phase 3）

6. `mock-api.ts` 保留但只被 GeneratePage/LogsPage 引用

### Wails 注册

7. 在 `main.go` 的 `wails.Run()` 中注册新 service 实例到 `Bind` 列表

## Acceptance Criteria

- [ ] `pnpm wails:dev` 启动后，Products 页面展示真实 `new_products/` 目录下的产品文件夹
- [ ] 产品详情能看到真实图片文件数量
- [ ] Outputs 页面展示 `output/<id>/` 下的真实文件列表
- [ ] Cache 页面展示 `cache/` 下的真实 JSON 文件列表
- [ ] Settings 页面保持现有功能不变
- [ ] GeneratePage / LogsPage 继续使用 mock 正常工作
- [ ] 前端 TypeScript 类型检查通过（`pnpm typecheck`）
- [ ] Go 后端编译通过

## Definition of Done

- 所有页面切换到真实后端调用
- Lint / typecheck 通过
- Wails dev 模式可正常启动和交互
- adapter 层模式统一，后续新功能只需在 Go 端实现 service 方法

## Out of Scope

- 产品 CRUD 写入操作（SaveProduct、Upload、Delete）— Phase 2
- Job service（异步任务执行、日志流）— Phase 3
- 生图 pipeline 核心逻辑（风格分析、plan 生成、图片渲染）— Phase 4
- 缓存写入/清除操作 — Phase 5
- manifest xlsx 读写 — Phase 2
- 文件预览（图片 base64 返回）— 后续按需添加

## Technical Notes

- Wails v2 绑定：Go struct 方法自动生成 TS 类型到 `wailsjs/go/`
- 文件路径：`new_products/`、`output/`、`cache/` 相对于项目根目录（Go 端用 `os.Getwd()` 或配置）
- Go 端不需要 image 处理，本阶段只做文件系统扫描和元数据返回
- 参考 `settings.Service` 的模式：struct + exported methods → Wails 自动绑定
- 前端 adapter 参考 `settings-client.ts` 的模式：import 生成的绑定函数 → 封装为 client 对象
- `has_plan` 判断：检查 `cache/generation_plan_<product_id>.json` 是否存在
- `output_count` 判断：计算 `output/<id>/` 下 png/jpg 文件数
- cache group 分类逻辑同老项目：`sage_reference_global_style.json` → global_style，`sage_reference_category_*` → category_style，`generation_plan_*` → generation_plan

## Decision (ADR-lite)

**Context**: 本任务是 5 阶段迁移的第一步，需要决定一次做多少。
**Decision**: 只做只读列表服务（product/output/cache list），不含写入操作和 job service。
**Consequences**: GeneratePage 和 LogsPage 暂时保持 mock 状态，但基础 adapter 模式建立后，后续 Phase 只需增量添加方法。
