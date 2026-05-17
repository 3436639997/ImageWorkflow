# Quick cancel rename outputs split actions and wider dialogs

## Goal

把上一阶段使用反馈对应的 5 个体验问题一并修复：
1. 任务列表项右侧加快捷取消按钮（不进详情页就能取消）
2. 输出图保留源文件名（SKU/detail 用源图文件名 + .png）
3. 「按计划生图」拆成 3 个独立动作（生主图 / 生 SKU / 生细节图），允许部分重跑
4. 任务列表瘦身：默认显示最近 20 + 「显示全部 / 收起」+ 「清空已完成」按钮
5. 所有 Dialog 加宽：`w-[min(1100px,90vw)]`

## Scope

### 1. 列表项快捷取消

`LogsPage` 任务列表项：
- queued 或 running 状态在右侧 Badge 旁加一个小 ×（图标按钮）
- 点击触发 `confirm + cancelJob`，行为同详情区取消
- 其他状态不显示

### 2. 输出图沿用源文件名

`pipeline/render.go`：
- 主图（contact sheet 拼图）：仍用 `main.png`，因为是合成
- SKU 图：用源图 stem + `.png`，如源图 `黑色.jpg` → `黑色.png`，源图 `O1CN01R7YIxN1xJK.jpg` → `O1CN01R7YIxN1xJK.png`
- 细节图：同样用源图 stem，多张都用同一源图时加 `_<idx>` 后缀避免冲突
- 如果 stem 已经存在（与 SKU 重名）则附加 `_detail` / `_main` 后缀
- 移除之前 `safeID` 把中文转下划线的兜底（直接保留 stem，做最小化路径清洗：禁止 `..` 和 `/\\`）

`Outputs` 缩略图分组分类继续按文件名前缀：
- `main.png` / `main.*` → main
- 其他匹配 SKU 颜色名的 → sku（颜色名一致）
- 其他匹配 detail 关键词的 → detail
- 否则 other

为了简化，本次直接以源图为 SKU/detail 文件名时分类逻辑改为：
- 如果文件名 == "main.png"/"main.jpg" → main
- 如果在 plan.SkuImagePlans 的源图列表里 → sku
- 否则 detail

但这样需要前端额外信息，简化版：保留前缀分类不变，**仅改文件名为源图 stem**，文件命名加前缀来保证分类：
- SKU: `sku__<stem>.png`（双下划线分隔，便于 stripPrefix）
- detail: `detail__<stem>.png`
- main: 保持 `main.png`

权衡后选这个方案，**保留分类逻辑同时让用户能识别源图**。

### 3. 拆分生图动作

新增 3 个 job kind:
- `render-main` — 仅生成主图
- `render-sku` — 仅生成所有 SKU
- `render-detail` — 仅生成所有细节图

三个 runner 共享 `render.go` 内部函数，但只跑各自部分。原 `render` runner 保留（跑全部）。

`GeneratePage` 任务动作区：
- 现有 4 个：分析并生图 / 仅分析 / 按计划生图 / 试运行
- 新增第二行：仅主图 / 仅 SKU / 仅细节图（带紧凑视觉提示）
- 共 7 个按钮，分两行排布

### 4. 任务列表瘦身

`LogsPage`：
- 默认显示最近 20 个任务（按 createdAt 倒序）
- 列表底部有「显示全部 (X)」按钮，点击展开剩余
- 顶部「清空已完成」按钮：删除所有 succeeded/failed/cancelled 的任务（保留 queued/running）
- 后端 job service 增加 `ClearCompleted() (count int, err error)`：删除已结束任务及对应日志文件

### 5. Dialog 加宽

`packages/ui/src/components/dialog.tsx` 不动（保留 max-w-lg 默认）。各个调用方的 `<DialogContent>` className 改为：
- ProductsPage 编辑表单：`w-[min(1100px,90vw)] max-w-none`
- CachePage JSON 编辑：`w-[min(1200px,90vw)] max-w-none`（更宽，给 CodeMirror）

## Acceptance Criteria

- [ ] LogsPage 列表项 queued/running 右侧有 × 按钮，点击 → 弹确认 → 取消
- [ ] 渲染产品后 output 目录的 SKU 图文件名是源图名 + .png（带 sku__ 前缀）
- [ ] 渲染产品后 detail 图同上（带 detail__ 前缀）
- [ ] GeneratePage 有 7 个动作按钮，独立的「仅主图 / 仅 SKU / 仅细节图」可单独跑
- [ ] LogsPage 默认只显示最近 20 个；底部有「显示全部 (N)」按钮
- [ ] LogsPage 顶部有「清空已完成」按钮，点击后已结束任务消失，对应日志文件被删
- [ ] 产品编辑 Dialog 在 1280px 屏幕上明显比之前更宽
- [ ] CachePage JSON 编辑 Dialog 同上
- [ ] Go 编译 + 前端 build 通过

## Out of Scope

- 选中多个任务批量取消
- 任务自动清理（依然保留 maxJobs=50 的硬上限，但不按时间清）
- main 图也用源图命名（contact sheet 没源图，保留 main.png）
- 输出图重命名 / 编辑

## Technical Notes

- 列表项小 × 按钮可复用 ProductsPage 的图片删除按钮风格（`absolute right-1 top-1`）
- ClearCompleted 后端：遍历 jobs 数组保留 queued/running，被删的 logPath 文件删除
- 文件名清洗：`filepath.Clean` + 替换 `/\:*?"<>|` 为 `_`（保留中文）
- 拆 runner 时把 `cfg.RenderProduct` 内部按段提出三个函数：`RenderMain` / `RenderSKUs` / `RenderDetails`，原 `RenderProduct` 调用三者
