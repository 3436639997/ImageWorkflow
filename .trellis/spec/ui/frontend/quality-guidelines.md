# Quality Guidelines

> Frontend quality bar for `apps/web`.

---

## Verification commands (run before declaring done)

```bash
pnpm --filter web exec tsc --noEmit       # type check
pnpm --filter web build                   # full build (includes tsc -b + vite build)
pnpm --filter web lint                    # ESLint
```

`pnpm wails:dev` is the integration smoke test — open the desktop window and exercise the touched flow. Pure Vite preview (`pnpm --filter web dev`) is OK for layout/structure verification but cannot exercise `wailsjs` bridge calls (they will hang or fail).

---

## Lint baseline

The repo carries some warnings that pre-date this guide and aren't worth fighting:

- `react-hooks/set-state-in-effect` — used by `App.tsx` / `OutputsPage.tsx` / `ProductWorkspace.tsx` for "load on mount" patterns. Accepted as-is.
- `react-hooks/exhaustive-deps` — `LogsPage` polling effects deliberately omit `notify` and `selected` to avoid restart loops.

Don't introduce **new** instances of these rules; do match the existing pattern when extending the same files.

The `react-refresh/only-export-components` rule is a hard error, not a warning. Files under `apps/web/src/pages/` must split components from helpers/types/constants.

---

## Pre-flight checks for queue dispatchers

Before calling `jobClient.start(kind, productId)` for a render-* kind, the UI MUST verify `selected?.has_plan === true` and toast an error otherwise. Failing to pre-flight enqueues a guaranteed-fail job, wastes the user's mental space, and clutters the log list.

The backend ([apps/backend/internal/pipeline/runner.go](apps/backend/internal/pipeline/runner.go)) returns "未找到 generation plan" for missing plan in render-* kinds — this is a defense-in-depth, not the user-facing barrier.

---

## Tailwind / shadcn discipline

- Don't add a new `radix-*` component to `packages/ui` by writing it from scratch — use `cd packages/ui && yes | npx shadcn@4.6.0 add <component>`. (Latest shadcn CLI's registry may not be reachable from this network; pin to 4.6.0.)
- After running `shadcn add`, **always diff the project**. The CLI will silently overwrite `button.tsx` / `input.tsx` / `separator.tsx` with the upstream styles when a new component depends on them. Restore project-customized versions:
  ```bash
  git diff packages/ui/src/components
  git checkout -- packages/ui/src/components/input.tsx packages/ui/src/components/separator.tsx  # if they changed
  ```
  `button.tsx`'s only diff is a removed eslint-disable comment, which is harmless.

---

## Truncation pitfall

Long error strings stretch flex rows beyond viewport unless the parent row uses `min-w-0 flex-1` on the truncating child:

```tsx
// ❌ truncate ineffective — flex item defaults to min-width: auto
<div className="flex">
  <div className="min-w-0">
    <div className="truncate">{job.error}</div>
  </div>
  <Badge>{status}</Badge>
</div>

// ✅
<div className="flex">
  <div className="min-w-0 flex-1">
    <div className="truncate">{job.error}</div>
  </div>
  <Badge className="shrink-0">{status}</Badge>
</div>
```

---

## Don't reach into wailsjs from components

Components import from `core/*-client.ts`, never from `wailsjs/`. Single boundary makes it possible to mock or replace bridge calls without touching the UI.
