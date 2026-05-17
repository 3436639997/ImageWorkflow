# ImageWorkflow

A desktop image-generation workflow tool for fashion / promotional product photography. Drop in source product photos, the app analyzes them with a vision model, drafts a generation plan, and renders main / SKU / detail images in batch via an OpenAI-compatible image edit API.

> Originally a Python prototype, now rewritten as a Wails (Go) + React desktop app.

---

## Features

- **Product-centric workflow** — each product is one workspace with four tabs: 素材 (assets) / 生成 (generate) / 结果 (outputs) / 日志 (logs). The selected product stays in context across tabs; no more flipping between separate top-level pages.
- **Two-stage pipeline** — separate analysis step (cheap, plans the shoot) and image rendering step (expensive). Supports running the full pipeline or each stage independently; SKU and detail renders can be re-run individually without re-analyzing.
- **Multi-preset settings** — up to 5 named API presets for analysis / image gateways. Switch presets live; pipeline picks up the active preset on every job.
- **Shared-gateway toggle** — when analysis and image generation use the same upstream, lock both forms to one gateway with a single switch.
- **Resilient renders** — primary base URL plus an ordered list of fallback URLs per gateway; automatic rotation on failure.
- **Per-job cancellation** — long-running calls have a manual 取消 button. Optional total-timeout per job (off by default; user controls).
- **Live log stream** — running jobs surface logs every 1.5 s with elapsed timer; finished jobs persist their full log file. Logs are scoped to the current product by default with a "全部产品" toggle.
- **Light / dark theme** — quick toggle in the sidebar footer.
- **Resizable sidebar / product list** — collapse the app sidebar to icons, or drag the product-list column to any width (220–600px). Both states persist.
- **Local-first storage** — all artifacts (uploaded photos, plans, rendered outputs, logs) live in `~/Documents/ImageWorkflow/`; settings live in `%APPDATA%/imageworkflow/`. No cloud, no telemetry.

---

## Project layout

```
ImageWorkflow/
├─ apps/
│  ├─ backend/                 Wails Go app (entry, services, pipeline)
│  │  └─ internal/
│  │     ├─ pipeline/          analyze / render / generate runners
│  │     ├─ job/               in-memory queue + persistence + events
│  │     ├─ product/           product CRUD + manifest
│  │     ├─ output/            generated image listing / delete
│  │     ├─ cache/             plan / style cache
│  │     ├─ settings/          v2 envelope (multi-preset)
│  │     ├─ workspace/         workspace dir resolver
│  │     ├─ system/            file picker, open folder, file server
│  │     ├─ manifest/          product manifest store
│  │     └─ fileserver/        local HTTP server for image previews
│  └─ web/                     React + Vite + Tailwind frontend
│     └─ src/
│        ├─ App.tsx            top-level router (products / cache / settings)
│        ├─ layout/            app-sidebar + theme toggle
│        ├─ pages/
│        │  ├─ products/       Master-Detail layout + 4 inner tabs
│        │  ├─ GeneratePage.tsx
│        │  ├─ OutputsPage.tsx
│        │  ├─ LogsPage.tsx
│        │  ├─ CachePage.tsx
│        │  └─ SettingsPage.tsx
│        ├─ core/              wails clients + job store + types
│        └─ shared/            confirm dialog, toast, section card
└─ packages/
   └─ ui/                      shadcn/ui components (sidebar, tabs, dialog, ...)
```

---

## Stack

- **Frontend**: React 19, Vite, TypeScript, [shadcn/ui](https://ui.shadcn.com/), Tailwind v4, [hugeicons](https://hugeicons.com/), CodeMirror (cache editor)
- **Backend**: Go 1.24+, [Wails v2](https://wails.io/), excelize (xlsx import), x/image, multipart
- **APIs**: any OpenAI-compatible chat completion endpoint (analysis) + any OpenAI-compatible image edit endpoint (generation)
- **Tooling**: pnpm workspaces + Turborepo

---

## Prerequisites

- Go `>= 1.23`
- Node `>= 20`
- pnpm `>= 9`
- Wails CLI: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`

On Windows the WebView2 runtime is required (preinstalled on Win10 21H2 / Win11).

---

## Getting started

```bash
# install dependencies (pnpm + go mod)
pnpm install

# verify your toolchain
pnpm wails:doctor

# launch the desktop app in dev mode
pnpm wails:dev
```

The dev mode runs Vite at `127.0.0.1:34115`, regenerates wailsjs bindings on Go changes, and hot-reloads the React frontend.

---

## Configuration

On first launch the app creates `~/Documents/ImageWorkflow/` and `%APPDATA%/imageworkflow/settings.json`. Open the **设置** page in the app to fill in:

- **分析接口** — `ANALYSIS_API_BASE_URL`, `ANALYSIS_API_KEY`, `ANALYSIS_MODEL`
- **生图接口** — `IMAGE_API_BASE_URL`, `IMAGE_API_KEY`, `IMAGE_MODEL`, `IMAGE_API_URL` (path)
- **备用网关** (per side) — comma-separated fallback base URLs
- **超时** (optional) — `JOB_TIMEOUT_SECONDS`, `API_REQUEST_TIMEOUT_SECONDS` (`0` disables, default)

Settings live as a v2 envelope: `{ presets[], active_preset_id, global }`. Switching the active preset takes effect on the next job dispatch — no restart needed.

---

## Typical workflow

1. **新建产品** — click 新建 in the product list, fill ID + name + colors + (optional) detail image count.
2. **上传素材** — drag and drop photos into the 素材 tab, or click 选择文件上传.
3. **生成** — switch to 生成 tab and pick one:
   - 分析并生图 — full pipeline (analyze + render).
   - 仅分析 — produce a plan only; check it in the 生图计划 panel before spending API quota on rendering.
   - 按计划生图 — render against an existing plan (主图 + SKU + 细节).
   - 试运行 — local dry-run; no API calls.
4. **结果** — switch to 结果 tab; review main / SKU / detail thumbnails; 重跑全部 or 重跑本组 to redo anything.
5. **日志** — switch to 日志 tab; live log of running tasks, default scoped to current product with a 全部产品 toggle. 清空已完成 wipes finished tasks in the active scope.

Render-only stages refuse to run without an existing plan — the 生成 / 结果 buttons will surface an inline error and the task is **not** queued. Save quota.

---

## Build a release

```bash
pnpm wails:build
```

This builds the frontend, syncs `dist/` into `apps/backend/frontend/dist`, and produces a native binary in `apps/backend/build/bin/`.

---

## Scripts cheat sheet

| Command | What it does |
|---|---|
| `pnpm install` | install workspace + Go dependencies |
| `pnpm wails:doctor` | verify Wails / Go / Node / pnpm |
| `pnpm wails:dev` | desktop app in dev mode (hot reload) |
| `pnpm wails:build` | release build |
| `pnpm --filter web dev` | frontend-only Vite server (no Go bridge — limited) |
| `pnpm --filter web build` | typecheck + production frontend build |
| `pnpm --filter web lint` | ESLint |
| `pnpm --filter web typecheck` | `tsc --noEmit` |

---

## Data locations

| What | Path |
|---|---|
| Workspace (products, outputs, plans, logs) | `~/Documents/ImageWorkflow/` |
| User config | `%APPDATA%/imageworkflow/settings.json` (Windows) |
| Job history | `<workspace>/jobs.json` |
| Per-job logs | `<workspace>/logs/<job_id>.log` |
| Generation plans | `<workspace>/<product>/cache/generation_plan.json` |

To move workspaces, change `WORKSPACE_DIR` in **设置** and restart.

---

## Notes

- This is a single-user desktop app; there is no auth, no multi-user state, no remote storage.
- API keys are stored locally in `settings.json`; treat that file like any credential store.
- Image generation costs real money — prefer 仅分析 + 试运行 first when iterating on a product.
