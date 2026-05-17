# Type Safety

> Conventions for TypeScript types in `apps/web`.

---

## Source of truth: Wails-generated models

`apps/web/src/wailsjs/wailsjs/go/models.ts` is auto-generated from Go structs by `wails generate module` (runs automatically in `wails dev`). Don't hand-edit it.

These exported namespaces are the canonical types:
- `product.Product`, `product.ProductDetail`, `product.ProductImage`
- `job.Job`
- `output.OutputFile`
- `cache.CacheItem`
- `settings.{ModelResult, PresetMeta, ProbeResult, SettingItem}`

Frontend layer:
- `core/job-client.ts` re-exports `Job` and defines `JobKind` / `JobStatus` literal unions (since Go strings are loose).
- `core/product-client.ts` re-exports `ProductDetail` / `ProductImage` and defines `ProductCreateInput`.
- `core/types.ts` holds **only** lightweight UI shapes (Product summary, OutputFile, CacheItem, SettingItem) and route enums.

---

## Type duplication is an anti-signal

If a type appears in two places, one is wrong. Common past mistakes:
- Old `core/types.ts` had a homemade `Job` type that drifted from `job.Job` — was deleted.
- `KIND_LABEL` / `STATUS_LABEL` / `STATUS_TONE` maps duplicated across `LogsPage` / `GeneratePage` / `job-store.ts`. Single source: [core/job-meta.ts](apps/web/src/core/job-meta.ts).

When adding a new label/tone map: put it in `core/job-meta.ts` (or the closest neighbor), export it, import it from every page.

---

## Input vs output type pairs

Backend Wails methods often expose a single struct that mixes input and derived fields, e.g. `product.Product` has `image_count` / `has_plan` / `output_count` which are derived (read-only) but appear on the input parameter to `SaveProduct`.

Don't make the form component fabricate zeros. Instead, define a `*CreateInput` type at the client layer and assemble in the client:

```ts
// core/product-client.ts
export type ProductCreateInput = {
  product_id: string
  name: string
  // ... only fields the user controls
}

save(input: ProductCreateInput): Promise<ProductDetail> {
  const payload = product.Product.createFrom({
    ...input,
    image_count: 0,
    has_plan: false,
    output_count: 0,
  })
  return SaveProduct(payload)
}
```

This eliminates `as never` / `as any` escapes in callers.

---

## `Record<UnionKey, V>` indexed by string

The wailsjs `Job.kind` / `Job.status` come back as `string` (Go is loose). When you keep your map types tight:

```ts
export const JOB_KIND_LABEL: Record<JobKind, string> = { ... }
const label = JOB_KIND_LABEL[job.kind]   // ❌ TS7053 — string isn't assignable to JobKind
```

Two acceptable workarounds:

1. Loosen the map's index, keep the value list complete via `satisfies`:
   ```ts
   export const JOB_KIND_LABEL: Record<string, string> = { ... } satisfies Record<JobKind, string>
   ```

2. Cast at the call site: `JOB_KIND_LABEL[job.kind as JobKind] ?? job.kind`.

This codebase uses option 1 (see [core/job-meta.ts](apps/web/src/core/job-meta.ts)). The `satisfies` clause keeps the literal-key safety while letting reads tolerate any string.

---

## Route enums

Don't reuse a single `PageKey` enum across two layers. Split:

```ts
export type TopPage = "products" | "cache" | "settings"
export type ProductTab = "assets" | "generate" | "outputs" | "logs"
```

Top-level page is independent from inner-tab. Combining them as `"products.assets" | ...` is also acceptable, but only if the app actually never has another inner-tab dimension.

---

## Wails binding regen

After adding a new exported method to a Go service:
1. `wails dev` watches `apps/backend/` and regenerates `wailsjs/go/<pkg>/Service.{js,d.ts}` automatically.
2. Add a thin wrapper in the matching `core/<x>-client.ts`. Do not call wailsjs imports directly from React components — always go through the client wrapper so types stay localized.
