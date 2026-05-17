# Phase 4 generation pipeline core: style analysis plan and render

## Goal

把老项目（ImageWorkflow, Python）的生图 pipeline 迁移到新项目（Fashion-AI, Go）。完成后 4 个 stub runner 替换为真实实现：
1. **dry-run** — 校验产品 manifest + 素材图，不调用任何远端 API
2. **analyze** — 调用 vision API 分析参考图风格 + 产品 generation plan，写入 cache
3. **render** — 复用现有 plan，调用 image edit API 生成主图 / SKU 图 / 细节图
4. **generate** — analyze + render 完整流水线

## Scope

### 1. Go 后端：核心模块

**`internal/pipeline/openai.go`**
- 通用 OpenAI 兼容 chat completion 调用（多图 base64 + 文本）
- 处理 base URL 的 `/v1` 自动补全（沿用 settings 已有逻辑）

**`internal/pipeline/imageapi.go`**
- HTTP client 调 image edit endpoint（multipart/form-data 上传源图 + prompt + size + b64_json）
- `ImageAPIRequest{ baseURL, apiKey, model, prompt, image, size, fallbackURLs[] }`
- 网关失败时按 `IMAGE_API_FALLBACK_BASE_URLS` 轮询
- 解析返回的 b64_json 或 url（url 时再下载）

**`internal/pipeline/sage_rules.go`**
- 把老项目 `SAGE_GENERATION_RULES`、`SAGE_MAIN_IMAGE_PROMPT`、fallback prompt、prompt 拼接函数（`buildMainPrompt` / `buildSkuPrompt` / `buildDetailPrompt`）翻译为 Go 常量与函数

**`internal/pipeline/style.go`**
- `AnalyzeStyle(ctx, client, images, instructions)` — 调用 chat completion API（多图 base64），返回 ≤100 词的风格 prompt
- 用于全局 Sage 风格 + 每个 category 风格
- 缓存：`<workspace>/cache/sage_reference_global_style.json` 和 `cache/sage_reference_category_<safe_name>.json`，按文件快照（文件名+大小+mtime）失效

**`internal/pipeline/plan.go`**
- `GenerationPlan` Go struct（hero_color、colors、main_image_plan、sku_image_plans[]、detail_image_plans[]、texture_direction、generation_notes）
- `BuildSnapshot(spec, productImages, globalStyle, categoryStyle) Snapshot` — 用于失效判断
- `LoadCachedPlan / SavePlan` — `<workspace>/cache/generation_plan_<id>.json`
- `AnalyzePlan(ctx, client, productImages, instructions)` — vision API 分析 + 解析 JSON
- `Normalize(rawPlan, spec, assignments, hero)` — 合法化 + 填充缺省
- `Fallback(spec, assignments, hero)` — 网络失败时的兜底

**`internal/pipeline/render.go`**
- `RenderProduct(ctx, cfg, spec, plan, productImages, logger)` — 主图（contact sheet 拼图）、每个 SKU 图、每张 detail
- 子函数：
  - `makeContactSheet(assignments, hero)` — Go `image` + `image/draw` 拼接
  - `finalizeImage(img, targetSize)` — resize 到 FINAL_IMAGE_SIZE（用 `golang.org/x/image/draw` 高质量 resize）
  - `writeOutputManifest(spec, generated)` → `<workspace>/output/<id>/manifest.json`

**`internal/pipeline/runner.go`**
- `Config` 结构整合 settings + workspace + manifest
- 4 个 runner（实现 `job.Runner` 签名）：
  - `DryRunRunner` — 校验产品/图片，不调 API
  - `AnalyzeRunner` — 全局风格 → category 风格 → plan，写入 cache
  - `RenderRunner` — load plan → 渲染所有图
  - `GenerateRunner` — analyze + render 串联
- 通过 `*log.Logger` 输出进度日志
- 导出 `RegisterRunners(jb *job.Service, settings, ws, manifest)`

### 2. Settings 集成

读取 `settings.GetSettings(reveal=true)` 获取（拿真实 key）：
- `ANALYSIS_API_BASE_URL` / `ANALYSIS_API_KEY` / `ANALYSIS_MODEL`
- `IMAGE_API_BASE_URL` / `IMAGE_API_KEY` / `IMAGE_API_URL` / `IMAGE_MODEL` / `IMAGE_API_FALLBACK_BASE_URLS`
- `ASPECT_RATIO` / `FINAL_IMAGE_SIZE`

settings 增加一个 helper `ResolveAll() map[string]string`（不返回 SettingItem）方便 pipeline 用。

### 3. 替换 stub runners

`app.go` 不再调 `RegisterStubRunners`，改为：
```go
pipeline.RegisterRunners(jb, settings, ws, mf)
```

### 4. 前端

Phase 4 后端切换不需要前端 UI 大改：
- GeneratePage 已经能发起任务
- LogsPage 已经能看实时日志
- Outputs 页会自动显示 `<workspace>/output/<id>/` 下的真实生成图
- 在 GeneratePage 增加「当前 plan」预览：显示已 analyze 的 plan JSON（折叠区，便于调试）

### 5. 错误处理

- API key 缺失 → runner 立即失败，日志写出友好提示，task 状态变 failed
- 网络失败/JSON 解析失败 → 重试一次，仍失败则 fallback 到 stub 风格 prompt（不阻塞流程）
- plan 解析失败 → 用 `Fallback(...)` 计划继续渲染
- 单个 SKU/detail 渲染失败 → 标记后继续，最终 manifest 反映实际生成的文件
- 参考图缺失（`<workspace>/images/`）→ 用 fallback 风格 prompt，不报错

## Acceptance Criteria

- [ ] dry-run 任务执行后日志显示「素材图 N 张 / hero color X / 颜色 [...]」检查输出
- [ ] analyze 任务执行后 `<workspace>/cache/` 出现 global/category style 缓存 + `generation_plan_<id>.json`
- [ ] render 任务执行后 `<workspace>/output/<id>/` 出现 main.png / sku_<color>.png / detail_N.png 文件
- [ ] generate 任务串联 analyze + render
- [ ] 任务日志详细显示每一步（"分析全局风格..."、"调用 image API..."、"保存 sku_black.png" 等）
- [ ] API key 缺失或网络失败时 runner 不崩溃，给出清晰错误信息
- [ ] 已分析过的产品再次 analyze（无变化）时，提示「使用缓存」，不重复调 API
- [ ] Outputs 页能看到生成的图片缩略图（通过本地 file server）
- [ ] Go 编译 + 前端 build 通过

## Out of Scope

- Phase 5：cache 编辑 UI / output 删除按钮
- Plan 编辑器（手动改 plan JSON 的 UI）
- 进度百分比 / progress bar
- 多产品批量生成（只支持单产品）
- size chart 生成（老项目 `build_size_chart` 不迁移）
- 取消正在运行的任务（仍只能取消 queued）
- 老项目 milvus / similarity search / embeddings（Sage mainline 已废弃）
- UnsharpMask 后处理（Go 没有现成实现，本阶段简化为 resize 不锐化）

## Technical Notes

- Go 图像处理：标准库 `image` + `image/jpeg` + `image/png` + `golang.org/x/image/draw`（高质量 resize）
- contact sheet：自己用 Go draw 拼，支持 1-3 列
- Multipart upload：`mime/multipart` 标准库
- JSON 解码：`json.Unmarshal`，处理可能带 markdown fence 的输出（剥离 ```json ... ```）
- 日志：runner 显式调 `logger.Printf`，不重定向 stdout

## Decision (ADR-lite)

**Context**：Python pipeline 的 PIL 操作（contain、UnsharpMask、TrueType 字体）在 Go 不直接对应
**Decision**：标准库 `image` + `golang.org/x/image/draw`。UnsharpMask 暂跳过；contact sheet 用简单平铺
**Consequences**：后处理质感比老项目略弱，但生成核心流程一致；Phase 5 或后续可以补回锐化

## Implementation Order

1. `pipeline/openai.go` — HTTP chat completion 基础设施
2. `pipeline/imageapi.go` — multipart image edit
3. `pipeline/sage_rules.go` — 常量和 prompt 模板
4. `pipeline/style.go` — 全局/类目风格分析 + cache
5. `pipeline/plan.go` — generation plan 结构 + cache + 分析 + 解析 + fallback
6. `pipeline/render.go` — contact sheet + 调用 image API + 保存 + manifest
7. `pipeline/runner.go` — 4 个 runner + Config + RegisterRunners
8. settings 加 `ResolveAll()` helper
9. `app.go` 切换注册
10. 前端：GeneratePage 增加 plan 预览
