# 多套可选风格参考管理与生成时选择

## Goal

允许用户管理多套风格参考图（全局 + 类目），并在生成时选择使用哪套风格（或不使用）。

## 现状

**后端已实现**：
- `pipeline/style.go` 的 `LoadOrAnalyzeGlobalStyle` / `LoadOrAnalyzeCategoryStyle` 从固定目录读参考图：
  - 全局：`<workspace>/images/`
  - 类目：`<workspace>/images/<category>/`
- 如果目录为空或不存在，fallback 到硬编码的 `FallbackGlobalStylePrompt()` / `FallbackCategoryStylePrompt(category)`
- 分析结果缓存到 `<workspace>/cache/sage_reference_global_style.json` 和 `sage_reference_category_<category>.json`

**前端缺失**：
- 没有 UI 让用户上传/管理这些参考图
- 没有 UI 让用户在生成时选择使用哪套风格

## 用户需求

用户希望：
1. 能创建多套全局风格（如「简约白底」、「暗调氛围」、「户外场景」）
2. 每套风格的核心是**一段文本提示词**，可以通过三种方式创建：
   - 直接输入/粘贴文本
   - 上传参考图 + 文字描述 → AI 生成提示词草稿 → 用户编辑后保存
   - 在外部 AI（ChatGPT / Claude）调好后粘贴
3. 生成时可以选择使用哪套全局风格（或不使用，fallback 到硬编码）

**类目风格暂不做**（v1 scope 外）：
- 类目不是必选的，只在某些情况下需要
- 先验证全局风格的流程，类目风格 v2 再加

## 设计决策

### 1. 风格套数据结构

**存储方案**：JSON 元数据文件 + 图片目录

```
<workspace>/
  styles/
    styles.json          # 元数据索引
    images/
      style-001/         # 风格套 ID 对应的参考图目录
        ref1.jpg
        ref2.jpg
      style-002/
        ...
```

**styles.json 结构**：

```json
{
  "styles": [
    {
      "id": "style-001",
      "name": "简约白底",
      "prompt": "White background, square composition...",
      "reference_images": ["ref1.jpg", "ref2.jpg"],
      "created_at": "2026-05-19T14:30:00Z"
    },
    {
      "id": "style-002",
      "name": "暗调氛围",
      "prompt": "...",
      "reference_images": [],
      "created_at": "2026-05-19T14:35:00Z"
    }
  ]
}
```

### 2. 前端 UI 位置

**新增顶级页面「风格参考」**（侧边栏第 4 项，在"产品 / 缓存 / 设置"之后）。

理由：
- 风格管理是独立的资源类型，不属于"缓存"（缓存是生成计划的临时数据）
- 与"产品"、"设置"平级，符合用户心智模型

### 3. 创建/编辑风格套 UI

**列表页**：
- 全局风格列表（卡片式）
- 每个风格套卡片显示：名称、提示词预览（前 100 字）、参考图缩略图（如有）
- 操作：新建、编辑、删除

**创建/编辑 Dialog**：
- 风格名称（必填）
- 风格提示词（大文本框，可编辑）
- 参考图片（可选，多张上传，拖拽排序）
- 两个按钮：
  - **"AI 生成风格提示词"**：调后端 → ANALYSIS_API 分析 → 填充到文本框
  - **"保存"**：保存当前文本框内容 + 元数据

### 4. 生成时选择风格套 UI

在「生成」tab 的"按计划生图"/"分析并生图"按钮上方，增加一个可折叠的"风格选择"面板：

```
┌─ 风格选择 ────────────────────────┐
│ 全局风格：[下拉选择] 简约白底 ▼    │
│ （下拉选项包含"不使用"）           │
└────────────────────────────────┘
```

- 默认折叠，显示当前选中的风格名称
- 展开后显示下拉框
- 选择后自动保存到 localStorage（per-product，key: `product-${productId}-style-selection`）
- 如果当前产品没有保存过选择，使用"默认风格"（从设置页读取）

### 5. 设置页增加"默认风格"配置

在「设置」页的"生成配置"区域，增加一个下拉框：

```
默认风格：[下拉选择] 简约白底 ▼
```

- 选项：不使用 / 所有已创建的风格套
- 保存到 `settings.json` 的 `global` 区域（key: `DEFAULT_STYLE_ID`）
- 新产品第一次打开"生成" tab 时，如果 localStorage 没有记录，使用这个默认值

## Requirements

### 后端

1. **新增 style service**：
   - `ListStyles() []Style`
   - `GetStyle(id) Style`
   - `CreateStyle(input StyleInput) Style`
   - `UpdateStyle(id, input StyleInput) Style`
   - `DeleteStyle(id)`
   - `GenerateStylePrompt(description, images) string` — 调 ANALYSIS_API 生成提示词

2. **修改 pipeline**：
   - `LoadOrAnalyzeGlobalStyle` 改为 `LoadStylePrompt(styleID string) (string, error)`
   - `runAnalyzeStage` / `runGenerateStage` 接受 `globalStyleID` 参数
   - 如果 styleID 为空，fallback 到硬编码 `FallbackGlobalStylePrompt()`
   - 如果 styleID 不为空但找不到对应风格套，返回错误

3. **Wails 绑定**：
   - 暴露 style service 的所有方法

4. **修改 settings service**：
   - 在 `global` 区域增加 `DEFAULT_STYLE_ID` 字段（默认值 `""`，表示"不使用"）

### 前端

1. **新增"风格参考"页**：
   - 路由：`topPage === "styles"`
   - 全局风格列表（卡片式）
   - 新建/编辑 Dialog（含 AI 生成按钮）

2. **修改"生成"tab**：
   - 增加"风格选择"面板（可折叠）
   - 一个下拉框：全局风格（含"不使用"选项）
   - 选择后保存到 localStorage（key: `product-${productId}-style-selection`）
   - 如果 localStorage 没有记录，读取设置页的"默认风格"

3. **修改"设置"页**：
   - 在"生成配置"区域增加"默认风格"下拉框
   - 保存到 `settings.json` 的 `global.DEFAULT_STYLE_ID`

4. **修改 job 调度**：
   - `jobClient.start(kind, productId, { globalStyleID })`
   - 后端 runner 读取这个参数

## Acceptance Criteria

- [ ] 用户可以在"风格参考"页创建全局风格套（输入名称 + 提示词 + 可选参考图）
- [ ] 用户可以点"AI 生成风格提示词"，上传参考图 + 文字描述，AI 返回提示词草稿填充到文本框
- [ ] 用户可以编辑、删除已有风格套
- [ ] 用户在"设置"页可以设置"默认风格"
- [ ] 用户在"生成"tab 可以选择全局风格（或选"不使用"）
- [ ] 新产品第一次打开"生成" tab 时，自动使用"默认风格"
- [ ] 选择后的风格套 ID 传给后端，后端使用对应的提示词生成图片
- [ ] 如果选择"不使用"，后端 fallback 到硬编码提示词
- [ ] 风格选择状态按产品持久化到 localStorage

## Out of Scope

- 类目风格套管理 — v2 再做
- 迭代修正（"AI 生成后，用户补充修正意见，AI 再调整"）— v2 再做
- 风格套的导入/导出 — v2 再做
- 风格套的预览效果（用风格套生成一张测试图）— v2 再做

## Open Questions

无（已明确）
