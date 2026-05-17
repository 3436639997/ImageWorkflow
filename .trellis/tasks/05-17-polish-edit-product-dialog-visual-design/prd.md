# Polish edit product dialog visual design

## Goal

修复产品「新建/编辑」Dialog 的视觉问题：太窄、字段标签和 hint 排版混乱（hint 挤在标签旁边、过长会换行折断）、整体层次感弱。把不常用字段折叠到「高级」区，让默认表单清爽。

## Background

当前问题：
- `DialogContent` 用 `max-w-3xl`，在 1024px 屏幕显得很挤
- `FormField` 把 hint 放在 label 同一行（`flex items-baseline gap-2`），长 hint 会让 label 文字换行（如「颜色 → 图片映射」截成两行）
- 「颜色 → 图片映射」「备注」这种高级字段干扰主流程
- 行距统一 `mb-1.5`、字号无明显层级

## Requirements

### 1. Dialog 宽度

`DialogContent` 改用 `max-w-4xl`（约 896px）。在 1024px+ 屏幕舒展，1024px 以下仍可缩。

### 2. FormField 排版

- label 一行只显示主标签 + 红色 *（不再挤 hint）
- hint 放在 input 下方，作 helper text
- label 字号：`text-sm font-medium`
- hint 字号：`text-xs text-muted-foreground` + `mt-1.5`
- label 与 input 间距：`mb-2`

### 3. 表单分组重组

**基本信息**（默认显示）
- 产品 ID（必填）| 产品名称
- 一级类目 | 关键词
- 主推颜色 | 所有颜色
- 细节图数量（左列单格，右列空 / 或保留为只读说明）

**描述**（默认显示）
- 产品描述（textarea）

**高级**（默认折叠，`Collapsible`）
- 颜色 → 图片映射
- 备注

### 4. 小细节

- 顶部 `DialogDescription` 当前文案（"产品 ID 即文件夹名..."）适合作为 hint 放在产品 ID 字段下方，而不是 Dialog 顶部说明
- DialogContent 滚动时 footer 不要随内容滚出（保留 `sticky bottom-0` 行为或父级 flex 处理）

## Acceptance Criteria

- [ ] Dialog 在 1280px 屏幕显得宽松不拥挤
- [ ] 「颜色 → 图片映射」字段名不再换行
- [ ] hint 永远在 input 下方，不与 label 同行
- [ ] 「颜色 → 图片映射」和「备注」默认折叠在「高级」区，需点击展开
- [ ] 所有字段标签字号、间距统一
- [ ] 编辑/新建模式视觉一致
- [ ] 前端 typecheck + build 通过

## Out of Scope

- 不改产品列表 / 详情区
- 不改 Dialog 颜色 / 主题（保持 shadcn 默认）
- 不引入新 shadcn 组件（除非已有的 Collapsible 不够用）

## Technical Notes

- 用项目已有的 `Collapsible` (`@workspace/ui/components/collapsible`)
- 标题/标签视觉参考设置页 SettingsPage 的 `FormSection` 同款风格
