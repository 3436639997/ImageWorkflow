# Replace native window.confirm with shadcn AlertDialog

## Goal

把所有 `window.confirm` 调用替换为 shadcn 的 `AlertDialog`，让确认弹窗与应用整体设计风格一致。当前 `ProductsPage.tsx` 删除产品和删除图片用了原生 `window.confirm`，弹窗顶部会显示「wails.localhost:34115 显示」，丑且割裂。

## Requirements

### 1. 引入 AlertDialog 组件

通过 shadcn CLI 添加 `alert-dialog` 到 `packages/ui/src/components/`：

```
cd packages/ui && npx shadcn@latest add alert-dialog
```

### 2. 封装 useConfirm Hook

新增 `apps/web/src/shared/confirm.tsx`，提供：
- `<ConfirmProvider>` 包裹 App
- `useConfirm()` 返回 `confirm({ title, description, confirmLabel?, cancelLabel?, tone? })` Promise<boolean>
- 内部由 ConfirmProvider 管理一个全局 AlertDialog 实例

类似已有的 `useMessage()` 模式。

### 3. 包装到 App

`apps/web/src/main.tsx` 在 MessageProvider 内嵌入 ConfirmProvider。

### 4. 替换两处 window.confirm

`ProductsPage.tsx`：
- 删除产品：`if (!window.confirm(...)) return` → `if (!(await confirm({ tone: "danger", title: "删除产品", description: "确定删除产品 X？这将同时删除其所有素材图。", confirmLabel: "删除" }))) return`
- 删除图片：同理

## Acceptance Criteria

- [ ] 删除产品弹出 shadcn 风格 AlertDialog
- [ ] 删除图片同上
- [ ] 弹窗有标题、描述、危险色「删除」按钮、灰色「取消」按钮
- [ ] 不再出现 wails.localhost 浏览器原生 confirm
- [ ] 前端 typecheck + build 通过

## Out of Scope

- 不替换 `notify.error` / `notify.success` / `notify.info`
- 不引入更多确认对话框场景
- 不改非阻塞通知逻辑

## Technical Notes

- `AlertDialog` 与 `Dialog` 的区别：前者用于关键确认，键盘 ESC/外部点击不会关闭
- `confirm` Promise 在用户点击「确定」resolve true，点「取消」/关闭 resolve false
- tone "danger" 把 confirm 按钮变 destructive 红色
