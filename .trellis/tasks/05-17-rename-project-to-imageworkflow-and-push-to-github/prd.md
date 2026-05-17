# Rename project to ImageWorkflow and push to github

## Goal

把整个项目从 Fashion-AI 改名为 ImageWorkflow，并推送到 GitHub `3436639997/ImageWorkflow`（公开仓库）。

## Scope

### 1. 字符串替换（全局）

按大小写敏感替换：
- `Fashion-AI` → `ImageWorkflow`（项目代号、目录名）
- `Fashion AI` → `ImageWorkflow`（产品显示名，含侧边栏 logo）
- `fashion-ai` → `imageworkflow`（kebab-case，主要是 wails outputfilename、windows app id）

涉及文件：
- `package.json` (root + apps/web + packages/ui)
- `apps/backend/wails.json` (`name`, `outputfilename`)
- `apps/backend/go.mod` (module path `Fashion-AI/apps/backend` → `ImageWorkflow/apps/backend`)
- 所有 Go `.go` 文件的 `import "Fashion-AI/apps/backend/..."` → `ImageWorkflow/apps/backend/...`
- `apps/web/src/wailsjs/wailsjs/go/*` 自动生成（regenerate 后会同步）
- `README.md` 标题
- `apps/web/src/layout/shell.tsx` 「Fashion AI」侧边栏文案
- `apps/backend/internal/workspace/resolver.go` 默认目录 `DefaultDirName = "Fashion-AI"` → `"ImageWorkflow"`
- `apps/backend/internal/settings/service.go` 配置目录 `filepath.Join(configDir, "fashion-ai", ...)` → `"imageworkflow"`
- `.trellis/tasks/...` 历史 PRD 不动（避免大批历史改动）

### 2. 文件夹重命名

- 项目根目录：`C:\Users\tangyishao\Documents\codex project\Fashion-AI\` → `ImageWorkflow\`
- Workspace 数据目录：`C:\Users\tangyishao\Documents\Fashion-AI\` → `C:\Users\tangyishao\Documents\ImageWorkflow\`
- 用户配置目录：`%APPDATA%\fashion-ai\settings.json` → `%APPDATA%\imageworkflow\settings.json`（迁移已存配置）
- 操作流程：先停 wails dev → 重命名 → 改 settings.json 中的 `WORKSPACE_DIR` 字段（指向新路径）→ 重启

### 3. 重新生成绑定 + 验证

- `wails generate module` 重新生成 ts bindings
- `go build ./...` 通过
- `pnpm --filter web build` 通过
- 启动桌面 app，验证：
  - 侧边栏显示「ImageWorkflow」
  - 设置页 workspace 显示新路径
  - 产品列表能看到原来的 39/40
  - 重启后状态正确

### 4. Git 初始化 + 推送

- 检查/创建 `.gitignore`：忽略 `node_modules/`、`apps/backend/build/`、`apps/web/dist/`、`apps/backend/frontend/dist/`、`*.log`、`.trellis/.backup-*`
- 在新目录运行：
  ```
  git init
  git add .
  git commit -m "Initial commit: rename Fashion-AI to ImageWorkflow"
  gh repo create 3436639997/ImageWorkflow --public --source=. --push
  ```

## Acceptance Criteria

- [ ] 项目根目录已重命名为 `ImageWorkflow`
- [ ] Workspace 数据目录已重命名为 `~/Documents/ImageWorkflow/`
- [ ] `apps/backend/wails.json` 中 name 是 ImageWorkflow，outputfilename 是 imageworkflow
- [ ] go.mod module = `ImageWorkflow/apps/backend`
- [ ] 所有 .go 文件 import 路径已更新
- [ ] Wails 生成的 ts bindings 已 regenerate
- [ ] 前端侧边栏显示「ImageWorkflow」
- [ ] 默认 workspace 路径推导为 `~/Documents/ImageWorkflow/`
- [ ] settings 配置文件路径为 `%APPDATA%\imageworkflow\settings.json`，原数据已迁移
- [ ] Go + frontend 构建通过
- [ ] 桌面 app 能启动，原产品 39/40 仍能看到
- [ ] git 初始化成功，已推送到 `https://github.com/3436639997/ImageWorkflow`

## Out of Scope

- `.trellis/tasks/` 历史 PRD 文档不替换字符串
- 不改 git commit history（项目可能从未 git init 过）
- 不改 ChromeDriver / 浏览器窗口标题（Wails 自动跟 wails.json 走）
- 不发布 release / build 二进制

## Technical Notes

- Windows 路径用 `git mv` / `os.Rename` 都需要 wails 进程关闭，否则 `EBUSY`
- `gh repo create --source=. --push` 一次性创建 + 推送
- Go module rename 后必须 regenerate wails bindings，否则前端 import 路径错
- settings.json 迁移：手动 `move %APPDATA%\fashion-ai %APPDATA%\imageworkflow`；如果用户改过 WORKSPACE_DIR 指向 Fashion-AI 路径，会失效，需要在 settings 文件里 sed 替换
