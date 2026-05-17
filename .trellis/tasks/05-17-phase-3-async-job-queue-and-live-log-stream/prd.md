# Phase 3 async job queue and live log stream

## Goal

引入异步任务系统：用户从 GeneratePage 发起的「分析 / 渲染 / 完整生成 / 试运行」操作不会阻塞 UI，任务在 Go 后端 goroutine 里执行，状态和日志通过 Wails event 推送给前端。LogsPage 实时查看任务进度。

为 Phase 4（生图 pipeline）打基础——pipeline 的具体实现是 Phase 4 的事，本阶段只搭框架，用 stub 业务逻辑。

## Background

老项目 (`backend/services/job_service.py`) 用 ThreadPoolExecutor 跑任务，线程本地 stdout 重定向到日志文件。Go 版本要做的等价功能：
- goroutine 串行执行任务
- 业务函数 print 到任务专属 logger（不串到全局 stdout）
- 任务状态变化通过 Wails event 推送
- 前端订阅 event 实时更新

## Requirements

### 1. Go 后端：job service

新增 `internal/job/service.go`：

**数据结构**：
```go
type Status string // "queued" | "running" | "succeeded" | "failed" | "cancelled"

type Job struct {
    JobID      string
    Kind       string  // "generate" | "analyze" | "render" | "dry-run"
    ProductID  string
    Options    map[string]any
    Status     Status
    CreatedAt  string
    StartedAt  string
    FinishedAt string
    Error      string
    Result     map[string]any
    LogPath    string  // 绝对路径
}
```

**API**：
- `StartJob(kind, productID, options) (*Job, error)` — 入队任务，立即返回 job 元数据
- `GetJob(jobID) (*Job, error)` — 查询单个任务
- `ListJobs() []*Job` — 列出所有（最近 N 个，比如 50）
- `JobLogs(jobID) (string, error)` — 读日志文件全文
- `CancelJob(jobID) error` — 取消（只能取消 queued 状态的，running 中不强杀）

**实现**：
- 1 个 worker goroutine 通过 channel 接收 job
- 每个 job 用专属 `*log.Logger` 写到 `<workspace>/logs/<jobID>.log`
- 业务函数（runner）签名：`func(ctx context.Context, j *Job, logger *log.Logger) (map[string]any, error)`
- 状态转换发 Wails event：`runtime.EventsEmit(ctx, "job:update", job)`

### 2. Job 持久化

`<workspace>/jobs.json`：保存所有 job 元数据（不含日志，日志在单独文件）。
- 加载：app 启动时读取，未完成的任务标记为 "failed"（重启视为中断）
- 保存：每次状态变化时 atomic 写入（写到 `.tmp` 再 rename）
- 容量：保留最近 50 个，更老的 JOB ID + 日志一起删除

### 3. Job runner 注册

job service 持有一个 `runners map[string]Runner`，由外部注册：
```go
job.Register("dry-run", dryRunRunner)
job.Register("generate", generateRunner)
// ...
```

本阶段实现 4 个 stub runner，每个：
- 写几行 logger 输出
- sleep 1-2s 模拟工作
- 返回 stub result，比如 `{"ok": true, "stub": true}`

Phase 4 会用真实 pipeline 替换。

### 4. Wails 集成

- `internal/job/service.go` 暴露 `StartJob`、`GetJob`、`ListJobs`、`JobLogs`、`CancelJob` 给前端
- app.go 启动时 `job.NewService(ctx, workspace)` + 注册 runner + 加载已有 jobs
- shutdown 时优雅停止 worker（取消 context）

### 5. 前端：job-client

`apps/web/src/core/job-client.ts`：
- `start(kind, productID, options)` / `get(jobID)` / `list()` / `logs(jobID)` / `cancel(jobID)`
- 监听 Wails event `job:update`，外部订阅

新增 `apps/web/src/core/job-store.ts`（已存在但当前没用，重写）：
- 管理本地 job 列表 state
- 启动时 `client.list()` + 监听 `job:update` 事件实时更新
- 暴露 `useJobStore()` hook 给页面用

### 6. GeneratePage 接入

- 4 个动作按钮（generate / analyze / render / dry-run）→ 点击后调 `client.start(kind, productID, options)`
- 不再用 mock-api
- 启动后跳转到日志页或直接在当前页显示运行中状态

### 7. LogsPage 接入

- 列出最近 jobs（按 createdAt 倒序）
- 点击单个 job：显示日志（实时更新）
- Job 列表项展示状态徽章（queued/running/succeeded/failed），可滚动
- 实时性：监听 `job:update` 自动刷新

## Acceptance Criteria

- [ ] 在 GeneratePage 选中产品后点 dry-run，立即返回，按钮显示「运行中」状态
- [ ] LogsPage 能看到新建的 job，状态会从 running 变 succeeded
- [ ] 点击 job 能看到完整日志（包括 stub runner 写的几行）
- [ ] 启动多个 job：第二个排队 (queued)，第一个完成后才开始执行
- [ ] App 重启后能看到历史 jobs，未完成的标记为 failed
- [ ] 删除最老的 job 后，对应日志文件也被清除
- [ ] Go 编译 + 前端 typecheck/build 全部通过

## Out of Scope

- Phase 4：风格分析 / generation plan / 真实生图调用
- Phase 5：cache 编辑 / output 删除等写入操作
- 取消 running 任务的强制中断（只支持取消 queued）
- 任务进度百分比（只有 status，没有 progress）
- Job 详情页面跳转动画或 URL 路由
- 多 worker 并行

## Technical Notes

- Wails event：`wruntime.EventsEmit(ctx, eventName, data...)` / 前端 `EventsOn(name, fn)`
- 任务专属 logger：`log.New(io.MultiWriter(file, jobBuffer), "", log.LstdFlags)`
- 业务函数 stdout 路由：本阶段不重定向 stdout（老项目用 thread-local stream，Go 难做）。直接传 `*log.Logger` 给 runner，让它显式调用
- jobs.json atomic 写：`os.WriteFile(tmp, ...) + os.Rename(tmp, dest)`
- 日志文件路径：`<workspace>/logs/<jobID>.log`
- workspace 加 `LogsDir()` 方法

## Decision (ADR-lite)

**Context**：业务函数怎么把进度告诉日志？老项目用 thread-local 重定向 stdout
**Decision**：传 `*log.Logger` 给 runner，要求显式调用。简单，类型安全，不用搞 stdout hijack
**Consequences**：runner 需要把 `print` 全替换为 `logger.Printf`，但代码更清晰
