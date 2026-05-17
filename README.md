# ImageWorkflow

Wails + React(Vite) + Turbo monorepo 初始化骨架。

## 目录

- `apps/backend`: Wails(Golang) 桌面端后端与应用入口
- `apps/web`: React + Vite 前端
- `packages/ui`: 共享 UI 组件

## 前置要求

- Go `>=1.23`（建议与本机 Wails 兼容版本）
- Node `>=20`
- pnpm `>=9`
- 已安装 Wails CLI：`go install github.com/wailsapp/wails/v2/cmd/wails@latest`

## 启动命令

- 安装依赖：`pnpm install`
- 环境检查：`pnpm wails:doctor`
- 桌面开发模式：`pnpm wails:dev`
- 打包桌面应用：`pnpm wails:build`

## 命令说明

- `wails:dev`
  - 启动 Wails 开发模式
  - 前端使用 Vite 外部 dev server（`127.0.0.1:34115`）
  - 自动生成前端调用绑定到 `apps/web/src/wailsjs`

- `wails:build`
  - 先执行前端构建并同步到 `apps/backend/frontend/dist`
  - 再执行 Wails 构建（输出到 `apps/backend/build/bin`）
