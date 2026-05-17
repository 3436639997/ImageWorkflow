package job

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"ImageWorkflow/apps/backend/internal/workspace"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// Status describes the lifecycle of a job.
type Status string

const (
	StatusQueued    Status = "queued"
	StatusRunning   Status = "running"
	StatusSucceeded Status = "succeeded"
	StatusFailed    Status = "failed"
	StatusCancelled Status = "cancelled"
)

// Job is the public payload describing a single job.
type Job struct {
	JobID      string                 `json:"job_id"`
	Kind       string                 `json:"kind"`
	ProductID  string                 `json:"product_id"`
	Options    map[string]interface{} `json:"options,omitempty"`
	Status     Status                 `json:"status"`
	CreatedAt  string                 `json:"created_at"`
	StartedAt  string                 `json:"started_at,omitempty"`
	FinishedAt string                 `json:"finished_at,omitempty"`
	Error      string                 `json:"error,omitempty"`
	Result     map[string]interface{} `json:"result,omitempty"`
	LogPath    string                 `json:"log_path,omitempty"`
}

// Runner executes a single job. The logger writes to the job's log file.
// Implementations should call logger.Printf / logger.Println for progress.
type Runner func(ctx context.Context, j *Job, logger *log.Logger) (map[string]interface{}, error)

const (
	jobsFileVersion = 1
	maxJobs         = 50
	eventName       = "job:update"
)

type persistEnvelope struct {
	Version int    `json:"version"`
	Jobs    []*Job `json:"jobs"`
}

// Service owns the job queue, history, and runners. A single worker
// goroutine processes the queue serially.
type Service struct {
	mu        sync.Mutex
	workspace *workspace.Resolver
	jobs      []*Job
	queue     chan string
	runners   map[string]Runner

	// running maps jobID → cancelFn for the in-flight job. At most 1 entry.
	running map[string]context.CancelFunc

	// jobTimeoutFn returns the per-job total timeout, looked up live from
	// settings on each runOne so config changes take effect without restart.
	jobTimeoutFn func() time.Duration

	ctx        context.Context
	cancelFn   context.CancelFunc
	workerDone chan struct{}

	emitCtx context.Context
}

// NewService constructs the service backed by `workspace`. Runners must be
// registered via Register() before Start().
func NewService(ws *workspace.Resolver) *Service {
	return &Service{
		workspace: ws,
		queue:     make(chan string, 64),
		runners:   map[string]Runner{},
		running:   map[string]context.CancelFunc{},
		// Default 10 minutes; can be overridden via SetJobTimeoutFn.
		jobTimeoutFn: func() time.Duration { return 10 * time.Minute },
	}
}

// SetJobTimeoutFn injects a callback that returns the per-job total timeout.
// Called on each job start, so settings updates take effect immediately.
func (s *Service) SetJobTimeoutFn(fn func() time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if fn != nil {
		s.jobTimeoutFn = fn
	}
}

// Register attaches a runner for a job kind. Must be called before Start().
func (s *Service) Register(kind string, runner Runner) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.runners[kind] = runner
}

// SetEmitContext stores the Wails app context, used to push events to the
// frontend whenever a job changes state. Call this from App.startup.
func (s *Service) SetEmitContext(ctx context.Context) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.emitCtx = ctx
}

// Start loads persisted history, marks any "running"/"queued" jobs as
// failed (since the previous session was interrupted), and spawns the
// worker goroutine.
func (s *Service) Start() error {
	if err := s.loadJobs(); err != nil {
		return err
	}

	s.mu.Lock()
	for _, j := range s.jobs {
		if j.Status == StatusRunning || j.Status == StatusQueued {
			j.Status = StatusFailed
			j.Error = "app 重启时被中断"
			if j.FinishedAt == "" {
				j.FinishedAt = nowISO()
			}
		}
	}
	s.mu.Unlock()

	if err := s.persist(); err != nil {
		return err
	}

	ctx, cancel := context.WithCancel(context.Background())
	s.ctx = ctx
	s.cancelFn = cancel
	s.workerDone = make(chan struct{})

	go s.worker()
	return nil
}

// Stop cancels the worker context and waits for the worker to exit.
func (s *Service) Stop() {
	if s.cancelFn != nil {
		s.cancelFn()
	}
	if s.workerDone != nil {
		<-s.workerDone
	}
}

// StartJob enqueues a new job and immediately returns the metadata.
func (s *Service) StartJob(kind string, productID string, options map[string]interface{}) (*Job, error) {
	if kind == "" {
		return nil, fmt.Errorf("kind is required")
	}
	s.mu.Lock()
	if _, ok := s.runners[kind]; !ok {
		s.mu.Unlock()
		return nil, fmt.Errorf("unknown job kind: %s", kind)
	}

	id := newJobID()
	j := &Job{
		JobID:     id,
		Kind:      kind,
		ProductID: productID,
		Options:   options,
		Status:    StatusQueued,
		CreatedAt: nowISO(),
		LogPath:   filepath.Join(s.workspace.LogsDir(), id+".log"),
	}
	s.jobs = append([]*Job{j}, s.jobs...)
	s.trimLocked()
	s.mu.Unlock()

	if err := s.persist(); err != nil {
		return nil, err
	}
	s.emit(j)

	select {
	case s.queue <- id:
	default:
		// queue full — should never happen with cap 64 but be defensive
		s.markFailed(id, "队列已满")
	}
	return s.cloneOf(id), nil
}

// GetJob returns a copy of the job by id, or nil if not found.
func (s *Service) GetJob(jobID string) (*Job, error) {
	j := s.cloneOf(jobID)
	if j == nil {
		return nil, fmt.Errorf("job not found: %s", jobID)
	}
	return j, nil
}

// ListJobs returns a snapshot of all jobs newest-first.
func (s *Service) ListJobs() ([]*Job, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]*Job, 0, len(s.jobs))
	for _, j := range s.jobs {
		c := *j
		out = append(out, &c)
	}
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].CreatedAt > out[j].CreatedAt
	})
	return out, nil
}

// JobLogs reads the log file for a job. Returns empty string if missing.
func (s *Service) JobLogs(jobID string) (string, error) {
	j := s.cloneOf(jobID)
	if j == nil {
		return "", fmt.Errorf("job not found: %s", jobID)
	}
	if j.LogPath == "" {
		return "", nil
	}
	data, err := os.ReadFile(j.LogPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	return string(data), nil
}

// ClearCompleted removes all jobs whose status is not queued/running. Their
// log files are deleted as well. Returns the number of removed jobs.
func (s *Service) ClearCompleted() (int, error) {
	return s.ClearCompletedFor("")
}

// ClearCompletedFor removes finished jobs scoped to a productID. When
// productID is empty, every finished job is removed (legacy behavior).
// Queued/running jobs are always preserved.
func (s *Service) ClearCompletedFor(productID string) (int, error) {
	s.mu.Lock()
	keep := s.jobs[:0]
	removed := 0
	var dropped []*Job
	for _, j := range s.jobs {
		isFinished := j.Status != StatusQueued && j.Status != StatusRunning
		matchesScope := productID == "" || j.ProductID == productID
		if isFinished && matchesScope {
			dropped = append(dropped, j)
			removed++
		} else {
			keep = append(keep, j)
		}
	}
	s.jobs = keep
	s.mu.Unlock()

	for _, j := range dropped {
		if j.LogPath != "" {
			_ = os.Remove(j.LogPath)
		}
	}
	if err := s.persist(); err != nil {
		return removed, err
	}
	return removed, nil
}

// CancelJob cancels a job. Queued jobs are marked cancelled immediately;
// running jobs receive a context cancellation and the runner is expected to
// stop on the next ctx check.
func (s *Service) CancelJob(jobID string) error {
	s.mu.Lock()
	var target *Job
	for _, j := range s.jobs {
		if j.JobID == jobID {
			target = j
			break
		}
	}
	if target == nil {
		s.mu.Unlock()
		return fmt.Errorf("job not found: %s", jobID)
	}
	switch target.Status {
	case StatusQueued:
		target.Status = StatusCancelled
		target.FinishedAt = nowISO()
		clone := *target
		s.mu.Unlock()
		_ = s.persist()
		s.emit(&clone)
		return nil
	case StatusRunning:
		cancel := s.running[jobID]
		s.mu.Unlock()
		if cancel != nil {
			cancel() // runner ctx fires; finish() will mark cancelled
		}
		return nil
	default:
		s.mu.Unlock()
		return fmt.Errorf("任务已结束，无法取消")
	}
}

func (s *Service) worker() {
	defer close(s.workerDone)
	for {
		select {
		case <-s.ctx.Done():
			return
		case id, ok := <-s.queue:
			if !ok {
				return
			}
			s.runOne(id)
		}
	}
}

func (s *Service) runOne(jobID string) {
	s.mu.Lock()
	var target *Job
	for _, j := range s.jobs {
		if j.JobID == jobID {
			target = j
			break
		}
	}
	if target == nil {
		s.mu.Unlock()
		return
	}
	// Skip if cancelled while queued.
	if target.Status == StatusCancelled {
		s.mu.Unlock()
		return
	}
	target.Status = StatusRunning
	target.StartedAt = nowISO()
	runner := s.runners[target.Kind]
	clone := *target
	logPath := target.LogPath
	timeoutFn := s.jobTimeoutFn
	s.mu.Unlock()

	_ = s.persist()
	s.emit(&clone)

	if runner == nil {
		s.finish(jobID, nil, fmt.Errorf("no runner registered for kind %q", clone.Kind))
		return
	}

	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		s.finish(jobID, nil, fmt.Errorf("打开日志失败: %w", err))
		return
	}
	defer logFile.Close()

	logger := log.New(logFile, "", log.LstdFlags)
	logger.Printf("[start] kind=%s product=%s", clone.Kind, clone.ProductID)

	// Per-job ctx with optional timeout + manual cancel for soft-cancel from
	// frontend. timeout <= 0 means no timeout (user must cancel manually).
	var jobCtx context.Context
	var cancel context.CancelFunc
	if timeoutFn != nil {
		if d := timeoutFn(); d > 0 {
			jobCtx, cancel = context.WithTimeout(s.ctx, d)
		}
	}
	if jobCtx == nil {
		jobCtx, cancel = context.WithCancel(s.ctx)
	}
	s.mu.Lock()
	s.running[jobID] = cancel
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		delete(s.running, jobID)
		s.mu.Unlock()
		cancel()
	}()

	result, runErr := runner(jobCtx, &clone, logger)
	if runErr != nil {
		logger.Printf("[fail] %v", runErr)
	} else {
		logger.Printf("[done] succeeded")
	}
	s.finish(jobID, result, runErr)
}

func (s *Service) finish(jobID string, result map[string]interface{}, runErr error) {
	s.mu.Lock()
	var target *Job
	for _, j := range s.jobs {
		if j.JobID == jobID {
			target = j
			break
		}
	}
	if target == nil {
		s.mu.Unlock()
		return
	}
	if runErr != nil {
		switch {
		case errors.Is(runErr, context.Canceled):
			target.Status = StatusCancelled
			target.Error = "已被取消"
		case errors.Is(runErr, context.DeadlineExceeded):
			target.Status = StatusFailed
			target.Error = "任务超时（请在设置中调整任务总超时）"
		default:
			target.Status = StatusFailed
			target.Error = runErr.Error()
		}
	} else {
		target.Status = StatusSucceeded
		target.Result = result
	}
	target.FinishedAt = nowISO()
	clone := *target
	s.mu.Unlock()

	_ = s.persist()
	s.emit(&clone)
}

func (s *Service) markFailed(jobID, reason string) {
	s.mu.Lock()
	var target *Job
	for _, j := range s.jobs {
		if j.JobID == jobID {
			target = j
			break
		}
	}
	if target == nil {
		s.mu.Unlock()
		return
	}
	target.Status = StatusFailed
	target.Error = reason
	target.FinishedAt = nowISO()
	clone := *target
	s.mu.Unlock()

	_ = s.persist()
	s.emit(&clone)
}

// trimLocked enforces maxJobs by dropping the oldest jobs and their logs.
func (s *Service) trimLocked() {
	if len(s.jobs) <= maxJobs {
		return
	}
	for _, j := range s.jobs[maxJobs:] {
		if j.LogPath != "" {
			_ = os.Remove(j.LogPath)
		}
	}
	s.jobs = s.jobs[:maxJobs]
}

func (s *Service) cloneOf(jobID string) *Job {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, j := range s.jobs {
		if j.JobID == jobID {
			c := *j
			return &c
		}
	}
	return nil
}

func (s *Service) emit(j *Job) {
	s.mu.Lock()
	ctx := s.emitCtx
	s.mu.Unlock()
	if ctx == nil {
		return
	}
	wruntime.EventsEmit(ctx, eventName, j)
}

func (s *Service) loadJobs() error {
	path := s.workspace.JobsFile()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if len(data) == 0 {
		return nil
	}
	var env persistEnvelope
	if err := json.Unmarshal(data, &env); err != nil {
		return fmt.Errorf("jobs.json 损坏: %w", err)
	}
	s.mu.Lock()
	s.jobs = env.Jobs
	s.mu.Unlock()
	return nil
}

func (s *Service) persist() error {
	s.mu.Lock()
	env := persistEnvelope{Version: jobsFileVersion, Jobs: s.jobs}
	s.mu.Unlock()

	data, err := json.MarshalIndent(env, "", "  ")
	if err != nil {
		return err
	}
	dest := s.workspace.JobsFile()
	tmp := dest + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, dest)
}

func nowISO() string {
	return time.Now().Format(time.RFC3339)
}

func newJobID() string {
	b := make([]byte, 6)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}