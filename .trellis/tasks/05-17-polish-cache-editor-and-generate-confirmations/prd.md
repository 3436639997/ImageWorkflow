# Polish cache editor and generate confirmations

## Goal

修四件相关的体验问题：
1. CachePage 编辑 Dialog 太窄、纯文本不易读
2. CachePage 编辑 Dialog 缺少「在系统编辑器打开文件」入口
3. GeneratePage 4 个动作按钮直接发起任务，应该有二次确认
4. analyze runner 在调用失败时仍标记 succeeded（与之前 render 一样的 bug）

## Scope

### 1. JSON 编辑器升级（CachePage）

引入轻量 JSON 高亮编辑器：
- 选用 `react-codemirror` (`@uiw/react-codemirror`) + `@codemirror/lang-json`
  - 维护活跃，单文件 import，对 Vite 友好
  - 提供 JSON 语法高亮、行号、自动缩进
- Dialog 宽度由 `max-w-4xl` 改为 `max-w-5xl`（约 1024px），高度沿用 `max-h-[85vh]`
- 编辑器主题跟随系统/项目主题（light/dark 同步）

### 2. 在系统编辑器打开按钮

CachePage 编辑 Dialog 顶部右侧加「在编辑器打开」按钮：
- 后端新增 `system.OpenInEditor(path string) error`：跨平台用关联程序打开文件（Windows `cmd /c start` / macOS `open` / Linux `xdg-open`）。已有 `OpenInFileManager`，加新方法或扩展即可
- 前端 system-client 增加 `openCacheFile(filename)`，内部传完整 cache 路径
- 后端 cache service 暴露 `OpenInEditor(filename)` 方便前端不用拼路径

### 3. GeneratePage 二次确认

4 个任务动作（分析并生图 / 仅分析 / 按计划生图 / 试运行）点击后用 `useConfirm` 弹出对话框：
- 「试运行」可以不弹（轻量、不调 API），其他 3 个必须弹
- 文案区分动作含义：
  - 「分析并生图」→ 提示会调用分析 + 生图 API，可能消耗配额
  - 「仅分析」→ 只调分析 API
  - 「按计划生图」→ 只调生图 API
- 确认按钮显示主色，取消是 outline

### 4. Analyze runner 失败处理

`runAnalyze` 中：
- 当前实现：分析失败时 fallback plan + 返回 nil error
- 这与用户期望不符：用户点「仅分析」失败应该看到 failed
- 改为：分析失败 → 返回带详细信息的 error，状态置 failed
- 仍保存 fallback plan 供后续 render 用，但 analyze 本身要失败

`runGenerate` 同样调整：当 analyze 阶段失败但已有缓存 plan 时继续；没有缓存就 fail。

## Acceptance Criteria

- [ ] CachePage 编辑 Dialog 宽度 `max-w-5xl`，使用 CodeMirror JSON 编辑器
- [ ] JSON 字段名/字符串/数字有不同颜色，行号显示
- [ ] 编辑器跟随主题（dark mode 时也好看）
- [ ] Dialog 顶部有「在编辑器打开」按钮，点击后系统默认编辑器打开 cache 文件
- [ ] GeneratePage 点击「分析并生图」「仅分析」「按计划生图」会先弹确认 Dialog
- [ ] 「试运行」不弹（直接执行）
- [ ] 「仅分析」失败时 LogsPage 任务状态显示 failed，错误信息可见
- [ ] 已有缓存的 generate 不再因分析阶段失败而中断（fallback 行为不变）
- [ ] Go 编译 + 前端 build 通过

## Out of Scope

- 不替换 GeneratePage 的 plan 预览编辑器（plan 预览仍只读，编辑走 CachePage）
- 不改 ProductsPage 已有的删除确认
- 不增加 Markdown 渲染（plan 是 JSON 不是 MD）

## Technical Notes

- `@uiw/react-codemirror` v4：`<CodeMirror value extensions={[json()]} theme={...} />`
- 主题：`@uiw/codemirror-theme-github` 提供 light/dark 两套，用 ThemeProvider 同步
- `system.OpenInEditor` Windows 注意：`exec.Command("cmd", "/c", "start", "", path)` 第一个空参是窗口标题占位
- 二次确认可用现有 `useConfirm()` API

## Decision (ADR-lite)

**Context**：JSON 编辑器有多种选择（Monaco / CodeMirror / 纯 textarea）
**Decision**：CodeMirror。Monaco 体积大且需要 web worker 配置，CodeMirror 更轻、对 Vite 友好
**Consequences**：bundle 增加 ~200KB（gzip），但显著提升 JSON 编辑体验
