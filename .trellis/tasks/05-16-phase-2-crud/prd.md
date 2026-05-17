# Phase 2: 产品管理 CRUD + 图片上传删除

## Goal

实现产品管理完整闭环：从 xlsx manifest 读写产品元数据、上传/删除产品素材图片、前端预览图片。完成后产品页面可以独立工作，为 Phase 3（异步任务）和 Phase 4（生图 pipeline）打基础。

## Background

老项目（ImageWorkflow）的产品数据保存在 `product_manifest.xlsx` + `new_products/<id>/` 目录，前端通过 FastAPI 的 `/api/files/product/<id>/<name>` 路径预览图片。新项目要把这套搬到 Go + Wails，并且保持 xlsx 兼容（用户可以用 Excel 直接编辑）。

## Requirements

### 1. Go 后端：xlsx manifest 读写

新增 `internal/manifest/service.go`：

- `ListManifestProducts() []Product` — 读 `product_manifest.xlsx` 返回所有产品
- `GetManifestProduct(id) Product` — 读单个产品
- `UpsertManifestProduct(payload)` — 创建或更新产品行
- 兼容老项目的列名：编号文件夹、产品名称、一级类目、产品描述、关键词、颜色、主推颜色、颜色图片映射、细节图数量、备注

依赖：`github.com/xuri/excelize/v2`（Go xlsx 库）

manifest 路径：默认在项目根目录 `product_manifest.xlsx`，可通过设置覆盖

### 2. Go 后端：扩展 product service

`internal/product/service.go` 增加方法：

- `SaveProduct(payload) ProductDetail` — 调用 manifest service 写入 + 创建 `new_products/<id>/` 目录
- `UploadProductImage(id, filename, base64Data)` — 解码 base64，写入 `new_products/<id>/<filename>`
- `DeleteProductImage(id, filename)` — 删除 `new_products/<id>/<filename>`
- 修改 `GetProduct` 和 `ListProducts`：从 manifest 读元数据并合并目录扫描结果

返回的 `Product` 结构补充字段：`name`, `category`, `description`, `keywords`, `colors`, `hero_color`, `color_image_map`, `detail_image_count`, `notes`

### 3. Go 后端：本地 HTTP file server

新增 `internal/fileserver/server.go`：

- 启动一个本地 HTTP server（动态端口，比如 `127.0.0.1:0` 让系统分配）
- 路由 `/product/<id>/<filename>` → 服务 `new_products/<id>/<filename>` 文件
- 路由 `/output/<id>/<filename>` → 服务 `output/<id>/<filename>` 文件
- 启动后通过 `system.Service` 暴露端口给前端，前端用 `http://127.0.0.1:<port>/...` 加载图片
- 严格路径校验，防止 path traversal

### 4. Go 后端：Wails 文件对话框

通过 Wails runtime 实现：

- `system.Service.OpenFileDialog()` — 调用 `runtime.OpenMultipleFilesDialog`，返回选中文件的绝对路径列表
- 前端拿到路径后调用 `UploadProductImage` 把文件读上去（前端读取文件 → base64 → 调用绑定方法）

### 5. 前端：产品列表页面增强

`apps/web/src/pages/ProductsPage.tsx`：

- 列表项显示：产品 ID、名称、图片数、是否有 plan、输出数（已有）
- 详情区显示：完整元数据 + 图片缩略图列表
- 「新建产品」按钮：打开表单填写产品信息 → 保存
- 「编辑产品」按钮：编辑当前选中产品的元数据
- 「上传图片」按钮：支持两种方式：
  - 点击按钮 → 调用 Wails 原生对话框选择多个文件
  - 拖拽文件到区域内（HTML5 drag-and-drop）
- 「删除图片」按钮：每张图缩略图右上角的 ×

### 6. 前端：adapter client 扩展

- `core/product-client.ts` 增加 `save / uploadImage / deleteImage`
- 图片预览 URL 通过 `system.Service.GetFileServerPort()` 拿端口拼接

## Acceptance Criteria

- [ ] 项目根目录有 `product_manifest.xlsx`，可在 Excel 里编辑后被前端正确读取
- [ ] 前端「新建产品」能填表创建一个新产品，xlsx 中能看到新增行
- [ ] 前端「编辑产品」能修改产品元数据并保存
- [ ] 拖拽多张图片到产品详情区，能上传到 `new_products/<id>/`
- [ ] 点击「上传图片」按钮，弹出系统文件选择对话框，能多选并上传
- [ ] 产品详情区能显示图片缩略图（通过本地 HTTP server）
- [ ] 点击图片右上角 × 能删除图片，缩略图列表立刻刷新
- [ ] Go 编译通过，前端 typecheck 通过
- [ ] 老项目的 `product_manifest.xlsx`（如果迁移过来）能被正确读取

## Out of Scope

- Job 异步任务系统（Phase 3）
- 风格分析、generation plan、图片生成（Phase 4）
- 输出文件预览（Phase 5）
- manifest 模板初始化（`init-manifest` 命令，可手动创建 xlsx）
- xlsx 的 schema 校验和迁移工具

## Technical Notes

- Go xlsx 库选 `github.com/xuri/excelize/v2`（社区主流，活跃维护）
- 本地 HTTP server 在 `App.startup` 时启动，`App.shutdown` 时关闭
- 图片预览防缓存：URL 加查询参数 `?t=<mtime>` 或 `?v=<random>`
- path traversal 防护：`filepath.Clean` + `strings.Contains("..")` 检查
- Wails dev 模式下，文件对话框会有 race condition；需要确保在 `domReady` 之后才能调用
- 上传大图建议加进度条，但本阶段先简化为单次同步上传

## Decision (ADR-lite)

**Context**：图片预览有 base64 / 本地 HTTP / 不预览三种方案
**Decision**：本地 HTTP server。base64 大图卡顿，不预览体验差
**Consequences**：多了一个常驻 HTTP server，需处理端口冲突和清理；但获得了高效的图片加载和原生 `<img>` 缓存能力
