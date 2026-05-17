# Phase 5 cache and output write operations

## Goal

完成 Outputs 和 Cache 页面的写入操作，让用户能查看/管理生成结果和缓存：
- Outputs 页：图片预览（已有）+ 删除单张图、打开输出文件夹
- Cache 页：清除单个/批量缓存、编辑 JSON 内容（plan / style）

之前 Phase 1 只做了只读列表，Phase 5 补全完整 CRUD。

## Scope

### 1. Go 后端：output service 扩展

`internal/output/service.go`：
- `DeleteOutput(productID, filename) error` — 删除 `<workspace>/output/<id>/<filename>`，path traversal 防护
- `OpenOutputFolder(productID) error` — 已经在 system service 有，去重为复用

### 2. Go 后端：cache service 扩展

`internal/cache/service.go`：
- `ClearCaches(filenames []string) (cleared []string, err error)` — 批量删除指定缓存
- `ClearAllCaches(group string) (cleared []string, err error)` — 删除某组（global_style / category_style / generation_plan）
- `WriteCacheFile(filename, content string) error` — 校验是 JSON + 仅 .json 后缀 + 写回

### 3. 前端 adapter 扩展

- `core/output-client.ts` 加 `delete(productId, filename)`
- `core/cache-client.ts` 加 `clear(filenames[])` / `clearGroup(group)` / `write(filename, content)`

### 4. OutputsPage UI

- 每张缩略图 hover 出现「打开」「删除」按钮
- 顶部右侧加「打开输出文件夹」按钮（已有 system.openOutputFolder）
- 删除前用 ConfirmDialog 确认

### 5. CachePage UI

- 每个分组（global_style / category_style / generation_plan / other）右侧加「清空本组」按钮（带确认）
- 每个 cache 项右侧加「编辑」「删除」按钮
- 「编辑」打开 Dialog，textarea 显示 JSON 内容，保存时校验 JSON 合法

## Acceptance Criteria

- [ ] OutputsPage 每张图能 hover 看到删除按钮，点击后弹出确认，确认后图片立即消失
- [ ] OutputsPage 顶部「打开输出文件夹」按钮能打开当前产品的 output 目录
- [ ] CachePage 每组有「清空本组」按钮，点击确认后该组缓存全部消失
- [ ] CachePage 每条缓存能点「编辑」打开 Dialog
- [ ] Dialog 内的 textarea 显示当前 JSON 内容，可编辑
- [ ] 保存时如果 JSON 不合法给出错误提示，合法则覆盖文件并刷新列表
- [ ] 单条缓存能删除，删除前有确认对话框
- [ ] Go 编译 + 前端 build 通过

## Out of Scope

- 撤销/恢复（删除是终态）
- 批量选择多个缓存（只支持 group 级清空）
- 缓存大小统计/趋势图
- 输出图的下载/导出 zip

## Technical Notes

- 复用 Phase 4 已经做的 `useConfirm()` 钩子做删除/清空确认
- Dialog 编辑器复用现有 shadcn `Dialog`，textarea 用 `Textarea` 组件
- 后端写文件使用 `os.WriteFile` + 原子 rename（`.tmp` → 目标）防止半写
- ClearCaches 失败容错：单个失败不阻止其他文件
