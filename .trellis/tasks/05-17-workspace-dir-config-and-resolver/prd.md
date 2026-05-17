# Workspace dir config and resolver

## Goal

引入「工作目录」(workspace) 概念，作为所有用户数据（产品素材、生成输出、缓存、manifest）的根。解决当前所有 Go 服务用相对路径（依赖 cwd）导致 Wails dev/build 模式下找不到数据的问题。

老项目把数据放在 git 仓库根目录，简单但绑定开发路径；新方案让数据放在用户文档目录下，桌面 app 启动后能稳定找到。

## Background

当前问题：
- `apps/backend/internal/product/service.go` 用 `"new_products"` 相对路径
- `apps/backend/internal/output/service.go` 用 `"output"`
- `apps/backend/internal/cache/service.go` 用 `"cache"`
- `apps/backend/internal/manifest/service.go` 用 `"product_manifest.xlsx"`
- `apps/backend/internal/fileserver/server.go` 同上

Wails dev 启动后程序的 cwd 是 `apps/backend/build/bin/bin/`，所以这些相对路径全部失效，用户在项目根目录放的数据看不到。

## Requirements

### 1. workspace 概念

引入新设置项 `WORKSPACE_DIR`：
- 默认值：`<UserHome>/Documents/Fashion-AI`（Windows: `C:\Users\xxx\Documents\Fashion-AI`，macOS: `~/Documents/Fashion-AI`）
- 子目录约定：
  - `<workspace>/new_products/<id>/` — 产品素材
  - `<workspace>/output/<id>/` — 生成结果
  - `<workspace>/cache/` — 风格/plan 缓存
  - `<workspace>/product_manifest.xlsx` — 产品清单

### 2. Go 后端：workspace resolver

新增 `internal/workspace/resolver.go`：
- `type Resolver struct` 持有当前 workspace 绝对路径
- `NewResolver()` 返回默认 resolver（使用 `os.UserHomeDir()` + `"Documents/Fashion-AI"`）
- `SetRoot(path string) error` — 校验路径合法（绝对路径、可写、可创建）→ 设置当前根，自动创建缺失的子目录
- `Root() string` — 返回当前根
- `ProductFolder(id) string`、`OutputFolder(id) string`、`CacheDir() string`、`ManifestPath() string` — 计算子路径
- 所有方法返回**绝对路径**

### 3. 后端服务改造

让 `product`、`output`、`cache`、`manifest`、`fileserver` 通过 resolver 获取路径，不再硬编码相对路径：
- 各 service 构造函数接收 `*workspace.Resolver`
- 所有 `os.ReadDir` / `os.Stat` / xlsx 路径都改用 resolver 方法
- `fileserver` 的根目录在 `Start` 时从 resolver 读取

### 4. Settings 集成

`internal/settings/service.go`：
- 加新字段 `WORKSPACE_DIR`，默认值由 resolver 提供
- 加载设置后，如果 `WORKSPACE_DIR` 非空则调 `resolver.SetRoot`
- 新增方法 `SaveSettings` 时若 `WORKSPACE_DIR` 变更，需要通知 resolver 同步（简单做法：直接调用 resolver.SetRoot 然后 fileserver 重启或重新读路径）

### 5. 启动顺序

`app.go startup()`：
1. 创建 `workspace.Resolver`
2. 加载 `settings`
3. 用 settings 里的 `WORKSPACE_DIR` 调 `resolver.SetRoot`
4. 启动 fileserver（基于 resolver 路径）

resolver 必须在所有 service 之前 ready。

### 6. 前端：设置页加「工作目录」卡片

`apps/web/src/pages/SettingsPage.tsx`：
- 在保存设置卡片下方新增一个「工作目录」`SectionCard`
- 包含：
  - 路径只读显示 + 「打开」按钮（调 `system.OpenInFileManager`）
  - 「选择目录...」按钮 → 调用 Wails `OpenDirectoryDialog` 让用户选新目录
  - 「重置默认」按钮
  - 子目录列表展示（new_products/ output/ cache/ + manifest.xlsx）
- 改完路径后保存设置 → 触发列表刷新

新增 Go 方法 `system.Service.PickDirectory()` → 调 `wruntime.OpenDirectoryDialog`

### 7. 数据迁移（可选友好提示）

切换 workspace 后老数据不会自动搬过去。第一版只显示提示，让用户自己手动迁移（点「打开」按钮直接进文件夹）。不在本任务做自动迁移工具。

## Acceptance Criteria

- [ ] 全新安装：app 第一次启动时自动创建 `~/Documents/Fashion-AI/` 及子目录
- [ ] 设置里能看到「工作目录」卡片，显示当前路径
- [ ] 「打开」按钮能直接打开当前 workspace
- [ ] 「选择目录...」能选新位置，保存后所有数据读写都切换过去
- [ ] 「重置默认」能恢复到 `~/Documents/Fashion-AI/`
- [ ] 产品页能列出 workspace 下 `new_products/` 的所有产品文件夹
- [ ] 上传图片落到正确的 `<workspace>/new_products/<id>/`
- [ ] file server 能正确服务 `<workspace>/new_products/...` 下的图片
- [ ] xlsx manifest 在 `<workspace>/product_manifest.xlsx`
- [ ] Go 编译通过 + 前端 typecheck/build 通过

## Out of Scope

- 数据迁移工具（自动从老路径搬数据）
- multi-workspace 切换 UI（用户得改设置）
- 监听 workspace 目录变化自动刷新（保留 manual 刷新）
- Windows 路径权限的精细处理（默认信任 Documents 目录）

## Technical Notes

- 路径用 `filepath.Abs` + `filepath.Clean`
- `os.UserHomeDir()` 是 Go 标准库，跨平台
- `os.MkdirAll(workspace, 0o755)` 自动创建目录树
- Wails `OpenDirectoryDialog`：`wruntime.OpenDirectoryDialog(ctx, wruntime.OpenDialogOptions{Title: "选择工作目录"})`
- settings 当前 OUTPUT_DIR 字段含义会变：从「输出根」变成「输出子目录名」（默认仍是 "output"），或者直接废弃改用 workspace 推导。**决策**：废弃 OUTPUT_DIR 单独配置，固定用 `<workspace>/output/`，简化逻辑

## Decision (ADR-lite)

**Context**：用户数据放哪
**Decision**：用「工作目录」概念，默认 `~/Documents/Fashion-AI/`，所有用户数据都在它下面。Settings 在 `%APPDATA%`，资源路径全部 resolver 推导。
**Consequences**：所有 service 构造函数变了（接收 resolver），但代码更清晰，并且彻底解决 cwd 依赖问题。OUTPUT_DIR 设置项移除，UI 简化。
