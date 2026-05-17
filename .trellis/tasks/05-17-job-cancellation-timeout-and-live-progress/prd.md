# Job cancellation timeout and live progress

## Goal

修复"任务卡住时整个队列堵塞"的问题。引入：
1. 单次 image/analysis 调用超时（默认 60s）
2. 整个任务总超时（默认 10 分钟）
3. 软取消正在运行的任务（cancel 按钮触发 ctx.cancel）
4. UI 上能看到任务"正在运行 X 秒"提示

## Background

当前问题：
- worker 单串行 → 一个任务卡住所有后续任务排队等
- `image API` HTTP client 用 `5 * time.Minute` 硬超时，期间没法中断
- 「取消」按钮只对 queued 状态生效，running 任务杀不掉
- 用户无从判断「在请求」还是「死锁」

老 Python 项目通过 ThreadPoolExecutor 也有这个问题，但任务量小、响应快没暴露出来。

## Scope

### 1. Job ctx 透传 + Cancel running

- `internal/job/service.go`：每个 running job 持有自己的 `context.CancelFunc`
- `CancelJob(id)` 改为：
  - queued → 标记 cancelled（已有逻辑）
  - running → 调用 cancelFn → runner 收到 `context.Canceled` 并返回 → 状态 cancelled
- `runOne` 时为 job 创建子 context: `ctx, cancel := context.WithCancel(s.ctx)`，存在 service map
- finish 时移除 cancelFn

### 2. 总任务超时

- 加 settings：`JOB_TIMEOUT_SECONDS`（默认 600=10分钟），归到 global 区
- runner 启动时 `ctx, cancel := context.WithTimeout(s.ctx, jobTimeout)`，超时自动 cancel

### 3. 单次 HTTP 请求超时

- `pipeline.ImageClient.HTTP.Timeout` 从 5min → 60s（默认）
- `pipeline.ChatClient.HTTP.Timeout` 同步
- 加 settings：`API_REQUEST_TIMEOUT_SECONDS`（默认 60），归到 global 区
- pipeline 在 NewImageClient/NewChatClient 时取此值

### 4. UI: Cancel 按钮 + 运行计时

LogsPage：
- 任务详情区，running 状态的任务也显示「取消」按钮（之前只 queued 才显示）
- 点击调 `cancelJob(jobId)`，需要 `useConfirm` 二次确认
- 任务正在运行时实时显示「已运行 mm:ss」（每秒更新）

settings：
- 「全局」区加两个数字字段：`API 请求超时（秒）`、`任务总超时（秒）`

### 5. 错误信息友好化

- runner 检测到 `errors.Is(err, context.Canceled)` → 任务状态 cancelled，错误信息「已被取消」
- 检测到 `context.DeadlineExceeded` → 任务状态 failed，错误「超时（已运行 X 秒）」

## Acceptance Criteria

- [ ] 任务运行中点「取消」→ 弹确认 → ctx.cancel → runner 立即返回 → 状态 cancelled
- [ ] image API 60s 没响应自动断开，错误信息明确
- [ ] 总任务时长超过 10 分钟自动 fail，状态 failed，error 提示超时
- [ ] settings 两个超时字段可改且立即生效（下次任务启动用新值）
- [ ] LogsPage running 任务显示已运行秒数（每秒刷新）
- [ ] 取消按钮在 queued 和 running 状态都显示
- [ ] Go 编译 + 前端 build 通过

## Out of Scope

- 多 worker 并行（保持单 worker）
- 取消时清理已下载的部分图片
- 任务恢复（重启后续跑）
- 网络层级的强制断连（依赖 HTTP client + ctx 即可）
- 进度百分比

## Technical Notes

- `http.Client{Timeout: ...}` 是请求总时长上限，包括 dial / write / read body
- 但 `Timeout` 不能被 ctx 覆盖；要让 ctx 可中断，请求要 `http.NewRequestWithContext`（已经在用）
- `multipart.Writer` 的 `Close()` 必须在 `http.NewRequest` 前；当前实现已经是这样
- worker 中 runOne 的 ctx 应是 `context.WithTimeout(serviceCtx, jobTimeout)`
- frontend 计时：LogsPage 加一个 `useState(now)` + `setInterval(1000)`，避免 useEffect deps 抖动

## Decision (ADR-lite)

**Context**：HTTP 卡死如何中断
**Decision**：依赖 ctx + http 内部协议。无需引入 transport hack
**Consequences**：60s 超时是最大止血粒度；如果用户网络很烂可以在设置里调大