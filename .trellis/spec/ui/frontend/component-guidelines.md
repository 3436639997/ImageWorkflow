# Component Guidelines

> How components are built in `apps/web` (React 19 + shadcn/ui + Tailwind v4).

---

## File organization rules (react-refresh hard requirement)

A `.tsx` file under `apps/web/src/pages/` that exports a component MUST NOT also export non-component values (helpers, types, constants). The lint rule `react-refresh/only-export-components` is enforced.

Wrong:
```tsx
// Component + helper in one file → react-refresh fails
export function Foo() { ... }
export function readBase64(file: File) { ... }
```

Right — split:
```
ProductFormDialog.tsx     → component only
product-form.ts           → ProductFormState, EMPTY_PRODUCT_FORM, detailToForm
helpers.ts                → readAsBase64, toMessage
shared.tsx                → small render-only helpers (Info, Empty, FormField)
```

Convention in `apps/web/src/pages/products/`:
- Components in `*.tsx`
- Pure data shapes / form constants in `*-form.ts`
- Cross-component DOM/IO helpers in `helpers.ts`

---

## Master-Detail container pattern

The product workspace ([apps/web/src/pages/products/ProductsLayout.tsx](apps/web/src/pages/products/ProductsLayout.tsx)) is the canonical pattern for any "select an entity, then operate on it" view in this app:

```
ProductsLayout (owns resizer, list-width persistence)
├─ ProductListPanel        (left, navigation only — no detail loading)
└─ ProductWorkspace        (right, owns `detail` state + 4 inner Tabs)
   ├─ ProductHeader        (sticky top, action buttons for the entity)
   └─ Tabs / TabsContent
      ├─ ProductAssetsPanel (receives `detail` as prop, never loads it)
      ├─ GeneratePage
      ├─ OutputsPage
      └─ LogsPage
```

Rules:
- Detail loading happens **only at the workspace container layer**. Inner panels accept `detail` (or `productId`) via props and never call `productClient.get(id)` themselves. This prevents duplicate API calls and keeps a single source of truth.
- Mutations inside panels (upload image, delete image) call `onChange()` so the container reloads `detail` and the parent product list.
- The container owns layout state that should persist (column width, last active tab) — children stay pure.

---

## shadcn/ui composition

- Always wrap the app root with `<TooltipProvider>` (in `apps/web/src/main.tsx`). Many shadcn components (notably `SidebarMenuButton` with `tooltip` prop) require it; absence shows up as a runtime "An error occurred in the `<Tooltip>` component" warning and a blank panel.
- `Sidebar` integration:
  - Use `SidebarProvider` + `<AppSidebar />` + `<SidebarInset>{children}</SidebarInset>` at the top level.
  - Do NOT wrap with another `flex h-screen` outside `SidebarProvider`. The provider already lays out a row flex with `min-h-svh`; the visible sidebar chrome is `position: fixed` and depends on a sibling `sidebar-gap` div for layout. Adding an extra wrapper breaks layout (shows blank).
  - Use `collapsible="icon"` for desktop. Provide `tooltip` prop on `SidebarMenuButton` so collapsed icons reveal labels on hover.

---

## Layout sticky header alignment

When a left navigation panel sits next to a content panel that has its own sticky header, both headers must use the same fixed height so their bottom borders align across the divider:

```tsx
// both panels
<div className="flex h-14 shrink-0 items-center border-b border-border px-3">
  ...
</div>
```

Don't rely on matching `py-N` because `font-mono` headlines have a slightly different line-height than `font-sans` and will misalign by 1–2px.

---

## Form / dialog conventions

- Wide product forms use `DialogContent` with `w-[min(1100px,90vw)] max-w-none sm:max-w-none` to override shadcn's responsive `sm:max-w-md`.
- Confirm-style dialogs go through `useConfirm()` ([apps/web/src/shared/confirm.tsx](apps/web/src/shared/confirm.tsx)) which returns a Promise<boolean>. Never use `window.confirm`.
- Toasts go through `useMessage()` ([apps/web/src/shared/message.tsx](apps/web/src/shared/message.tsx)).

---

## Common mistakes

- **Adding a render-* job button without a pre-flight `has_plan` check.** It causes a useless failed job in the queue. Always:
  ```tsx
  if (!selected?.has_plan) {
    notify.error("当前产品还没有 generation plan，请先执行「仅分析」或「分析并生图」")
    return
  }
  ```
- **Loading detail in two panels at once.** Push detail state up to the container; children take it as a prop.
- **Forgetting `min-w-0` on flex children that contain `truncate` text.** Default `min-width: auto` on flex items defeats truncation and lets long error strings stretch the row. Always pair `truncate` with `min-w-0 flex-1` on the parent.
