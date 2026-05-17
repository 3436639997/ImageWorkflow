# State Management

> How state is organized in `apps/web` (React 19, no Redux, no React Router).

---

## Top-level state

The root [App.tsx](apps/web/src/App.tsx) owns these long-lived states:

```ts
const [topPage, setTopPage] = useState<TopPage>("products")     // products | cache | settings
const [productTab, setProductTab] = useState<ProductTab>("assets")  // assets | generate | outputs | logs
const [products, setProducts] = useState<Product[]>([])
const [selectedId, setSelectedId] = useState("")
```

`topPage` and `productTab` are split — switching between products / cache / settings doesn't reset the inner tab, and switching products keeps you on the current inner tab.

`refreshProducts()` keeps the selection valid: if the previously selected product was deleted, it falls back to the first available product (or "" if none).

No React Router. Wails desktop apps don't need URL routing.

---

## Job event store

Jobs are an event-driven external store ([apps/web/src/core/job-store.ts](apps/web/src/core/job-store.ts)) backed by Wails events:

```
backend Service emits "job:update" → jobStore.upsertJob → useSyncExternalStore
```

Important caveats:
- `ClearCompleted*` removes records on the backend but does NOT emit events for the removed jobs. Frontend MUST call `jobStore.refresh()` after clearing to repopulate.
- Terminal status notifications (success / fail / cancelled toasts) are dispatched once per job in `notifyOnTerminal`, gated by `prev` vs `next` status to avoid double-toasting on hot reloads.

---

## Client-side persistence

LocalStorage is used for small UI preferences only. Conventions:

| Key | Owner | Purpose |
|---|---|---|
| `theme` | ThemeProvider | "light" / "dark" / "system" |
| `products-layout-list-width` | ProductsLayout | resizable column width (220–600px) |

When persisting from a continuous interaction (drag), persist on the boundary event (drag end), not on every move.

---

## React 19 / StrictMode pitfalls in this codebase

### Mutually-recursive `useCallback`

Two callbacks that reference each other create a `react-hooks/immutable-deps`-style problem and a stale-closure trap. Pattern to avoid:

```ts
// DON'T — circular deps; either captures stale values or the linter rejects it
const onMove = useCallback(..., [...])
const stop = useCallback(() => {
  window.removeEventListener("pointermove", onMove)
}, [onMove])
```

Pattern to use — gate behavior on a boolean state and put both listeners inside one effect:

```ts
const [dragging, setDragging] = useState(false)

useEffect(() => {
  if (!dragging) return
  function onPointerMove(e: PointerEvent) { ... setListWidth(...) }
  function onPointerUp() { setDragging(false) }
  window.addEventListener("pointermove", onPointerMove)
  window.addEventListener("pointerup", onPointerUp)
  return () => {
    window.removeEventListener("pointermove", onPointerMove)
    window.removeEventListener("pointerup", onPointerUp)
  }
}, [dragging])
```

This is the pattern in [ProductsLayout.tsx](apps/web/src/pages/products/ProductsLayout.tsx).

### Async load-on-mount pattern

The project tolerates `useEffect(() => { void asyncLoad() }, [dep])` even though it triggers `react-hooks/set-state-in-effect`. The lint rule is reported as a warning we accept, not a hard error. Don't try to convert these to suspense or React Query unless the broader pattern changes.

---

## Cross-cutting providers

Wrap order in [main.tsx](apps/web/src/main.tsx) matters:

```tsx
<ThemeProvider>
  <TooltipProvider>          // shadcn sidebar / button tooltips
    <MessageProvider>        // toasts
      <ConfirmProvider>      // dialog
        <App />
      </ConfirmProvider>
    </MessageProvider>
  </TooltipProvider>
</ThemeProvider>
```

`TooltipProvider` MUST be at root if any shadcn component uses the `tooltip` prop. Symptom of missing it: blank app body + console warning "An error occurred in the `<Tooltip>` component."
