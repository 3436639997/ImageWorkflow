# Backend Quality Guidelines

> Code quality bar for `apps/backend` (Go + Wails v2).

---

## Verification commands (run before declaring done)

```bash
cd apps/backend
go vet ./...
go build ./...
```

`go test ./...` is encouraged when adding logic; the codebase doesn't yet have full test coverage but new public services should at least have a happy-path test.

---

## Wails service contract

Public methods on a `Service` struct become Wails JS bindings. Conventions:

- Method names are `PascalCase`; they appear verbatim in `wailsjs/go/<pkg>/Service.js`.
- Return errors as the second result; Wails forwards them as JS Promise rejections.
- Pass primitive args (string, int, bool) or simple structs — complex types serialize via JSON; pointers or interface values are fragile.
- Don't add a method just to test something — every binding is part of the surface area and shows up as untyped `arg1` in `Service.d.ts` until the developer wires up a `core/*-client.ts` wrapper.

---

## Pipeline runner safety

Each runner in [internal/pipeline/runner.go](apps/backend/internal/pipeline/runner.go) MUST:

1. Validate prerequisites (e.g. `IMAGE_API_KEY` set, `len(images) > 0`, plan exists for render-only kinds) and return an error early.
2. NOT silently fall back to a degraded path when a prerequisite is missing — the user expects "按计划生图" to use the saved plan or fail loudly. Returning a generated fallback plan masks misconfiguration.
3. Honor `ctx.Done()` between long network calls so manual cancellation is responsive.
4. Write progress lines via the injected `*log.Logger` — these become the user-facing job log.

---

## Job service responsibilities

[internal/job/service.go](apps/backend/internal/job/service.go) is the single owner of:

- The in-flight queue (max 1 running) and the job history (max 50, oldest trimmed).
- Persistence to `<workspace>/jobs.json` (atomic write via `*.tmp` rename).
- `job:update` event emission to the frontend.
- Crash-recovery: jobs left in `running` / `queued` from a previous session are forced to `failed` on `Start()`.

When adding "remove" or "rewrite" type operations on jobs, **also call `s.persist()` after the mutation, then trigger frontend reload** — there is no "remove" event, so silent removals leave the frontend stale (frontend's `jobStore.refresh()` is the standard re-sync path).

Cancellation: `CancelJob` for a `running` job calls the per-job `context.CancelFunc` stored in `s.running[jobID]`. The runner is responsible for noticing `ctx.Err()` and the `finish()` step maps `context.Canceled` → `cancelled`, `context.DeadlineExceeded` → `failed`.

---

## Settings v2 envelope

[internal/settings/service.go](apps/backend/internal/settings/service.go) stores a versioned envelope:

```json
{
  "version": 2,
  "active_preset_id": "default",
  "presets": [
    { "id": "default", "label": "...", "items": [...] }
  ],
  "global": { "JOB_TIMEOUT_SECONDS": "0", ... }
}
```

When adding a new setting key:
- If it's per-preset (gateway URL, model, key) → put it in `presets[].items`.
- If it's app-wide (workspace dir, timeouts, theme) → put it in `global`.
- Read all settings via `ResolveAll()` at the boundary (e.g. inside `pipeline.resolveConfig`); don't scatter direct access.

---

## Forbidden patterns

- Don't `os.Exit` from a service. Return errors.
- Don't store paths as relative strings — always go through `workspace.Resolver` for canonical absolute paths.
- Don't rely on cwd. The Wails launcher sets cwd unpredictably.
- Don't log to `stdout`/`stderr` directly inside a runner; use the injected logger so output lands in the job's log file.

---

## Code review checklist

- New Wails service method has a matching frontend wrapper in `core/*-client.ts`.
- New persistent state has a `persist()` call after every mutation path.
- New error returned from a runner is user-facing — phrase in 中文 with actionable next step.
- `go vet ./...` passes.
