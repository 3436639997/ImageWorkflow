# 设置页面优化：默认分开双网关 + API Key 交互修复

## Goal

修复设置页面两个问题：
1. 分析 API 和生图 API 默认应分开显示（双网关模式），并提供"使用同一个 API"的选项来合并
2. API Key 输入框的显示/隐藏交互有 bug

## Requirements

### 1. 默认双网关模式

- `splitMode` 默认为 `true`（分开显示分析接口和生图接口）
- 提供一个开关"分析和生图使用同一个 API"，打开后合并为单网关模式
- 语义反转：当前是"分析接口和生图接口分开配置"（默认关），改为"使用同一个 API"（默认关 = 分开）

### 2. API Key 输入框交互修复

当前问题：
- 未点击"显示"时，输入框是 `readOnly`，无法选中/编辑
- 点了"显示"后能编辑，但再点"隐藏"会把用户刚输入的值替换为 mask 字符串，导致数据丢失

修复方案：
- API Key 输入框始终可编辑（移除 `readOnly`）
- 未显示时用 `type="password"` 隐藏内容，但允许输入新值
- "显示"按钮只切换 `type` 在 `password` 和 `text` 之间
- 用户输入新值后，不再用 mask 覆盖——保留用户输入的实际值
- 只有当值来自后端（`hasValue=true` 且用户未修改）时才显示 mask

## Acceptance Criteria

- [ ] 进入设置页面默认看到分析接口和生图接口两组独立输入框
- [ ] 有"使用同一个 API"开关，打开后合并为单网关
- [ ] API Key 输入框在任何时候都可以直接输入新值
- [ ] 点击显示/隐藏不会丢失用户已输入的内容
- [ ] 保存后重新加载，已保存的 key 正确显示为 mask（password 模式）

## Out of Scope

- 预设管理逻辑变更
- 其他页面修改

## Technical Notes

- 修改文件：`apps/web/src/pages/SettingsPage.tsx`
- 核心变更在 `toggleReveal` 函数和 `InputWithActions` 组件的 `readOnly` 属性
- `splitMode` 初始值和 Switch 标签文案需要调整
