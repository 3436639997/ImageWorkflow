**ImageWorkflow** is a full-stack monorepo project structured with engineering best practices. It enforces modularity, type safety, separation of concerns, and reusable components across frontend, backend, and shared modules.

```
ImageWorkflow/
├─ apps/
│  ├─ web/           # Frontend React + TypeScript + Vite
│  └─ backend/       # Backend Go + Wails
├─ packages/
│  └─ ui/            # Shared components, primitives, hooks, types, and utilities
├─ node_modules/
├─ package.json
├─ pnpm-workspace.yaml
└─ turbo.json
```

---

## Architectural Principles

### 1. Layered Separation

* **Framework / Shared Layer** (`packages/ui`):

  * Provides primitives (Input, Button, Card, Switch, Badge, Toast, etc.) and hooks.
  * Exposes global capabilities (notifications, logging, configuration, state management).
  * Enforces design tokens and styling conventions.
* **Page / Orchestration Layer**:

  * Composes shared components to build pages.
  * Handles state orchestration and interaction flows.
  * Calls services via adapters/hooks; does not manipulate DOM or backend directly.
* **Frontend Service / Adapter Layer**:

  * Encapsulates backend communication, type-safe adapters.
  * Provides stable API surface for page components.
* **Backend Service Layer**:

  * Implements domain logic, persistence, async tasks, external API integration.
  * Exposes clean, type-safe APIs for frontend consumption.
  * Should remain decoupled from presentation/UI concerns.

---

### 2. Global Capabilities

* Cross-cutting features (e.g., notifications, configuration, logging) are **implemented once in the framework layer**.
* Pages or non-component code consume these via standard interfaces/hooks (e.g., `useMessage()`, `message.success/error/info()`).
* No page-level ad hoc implementations for global features.
* All global UI elements should use the shared primitives or official component frameworks (shadcn/sonner).

---

### 3. Component and UI Guidelines

* **shadcn/ui is the sole component framework.** All UI primitives must come from shadcn/ui (Radix-based).
* Project configuration (`packages/ui/components.json`):
  * Style: `radix-maia`
  * Base color: `neutral`
  * Icon library: `hugeicons` (NOT lucide)
  * CSS variables: enabled
  * Tailwind CSS v4
* When a new component is needed, **first add it via shadcn CLI** (`npx shadcn@latest add <component>`) into `packages/ui/src/components/`, then import from `@workspace/ui/components/*`.
* Prefer **official or shared primitives** over custom implementations.
* All new components must be added to `packages/ui` first if they are reusable.
* Components must adhere to design tokens, theme variables, and consistent styling.
* Pages only assemble components; they do not define base styles or primitives.
* For interactive elements (buttons, inputs, dialogs, toasts, popovers):

  * Use shared components or framework-provided primitives.
  * Do not hardcode styles in page components.
* **Do not introduce alternative component libraries** (e.g., MUI, Ant Design, Chakra). Stick to shadcn/ui + Radix + Tailwind.

---

### 4. Backend / Frontend Contracts

* Frontend and backend communicate via **type-safe adapters**.
* Backend services expose domain logic only; no UI logic in backend.
* Frontend pages call backend through service adapters or hooks.
* Data structures are shared or mirrored between frontend TypeScript types and Go structs for consistency.

---

### 5. Asynchronous and Task Handling

* All long-running or async tasks reside in backend services.
* Frontend pages should never directly execute blocking tasks.
* Backend uses goroutines/channels for concurrency; frontend receives results through bound APIs/events.

---

### 6. Development Workflow

* **Single-source build and linting**: monorepo scripts enforce lint/build/test across all apps.
* **Hot reload**: frontend dev server and Wails backend dev mode should work concurrently.
* **One-command dev/start**: root `pnpm run dev` starts frontend and backend together.
* **CI/CD compliance**: builds, tests, and linting must pass for any commit.

---

### 7. Best Practice Rules for Agent or Developer

1. **Always check official framework/component documentation** before implementing any UI/behavior.
2. **Do not blind custom implementations** if a shared primitive or framework-provided component exists.
3. **Use framework-level abstractions for global capabilities**; pages only call the interface.
4. **Follow strict typing and modular design** across frontend and backend.
5. **All reusable logic or UI must live in `packages/ui`**; page-specific logic only orchestrates state.
6. **Maintain separation of concerns**:

   * Presentation: components + theme
   * Orchestration: pages + state
   * Business logic: backend services
   * Cross-cutting: framework-level hooks/services
7. **Ensure any new feature integrates with hot reload, lint, build, and type safety** before committing.

---

### 8. Future Expansion Guidance

* Any new page, component, or backend service must conform to the layered principles.
* Global capabilities must be exposed via framework-level interfaces, not ad hoc page implementations.
* New UI elements must either use `packages/ui` or extend it consistently.
* Agent or developer should **never hardcode styles, duplicate primitives, or bypass service adapters**.
<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->
