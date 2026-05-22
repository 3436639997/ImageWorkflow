package main

import (
	"context"
	"log"
	"strconv"
	"strings"
	"time"

	"ImageWorkflow/apps/backend/internal/cache"
	"ImageWorkflow/apps/backend/internal/fileserver"
	"ImageWorkflow/apps/backend/internal/job"
	"ImageWorkflow/apps/backend/internal/manifest"
	"ImageWorkflow/apps/backend/internal/output"
	"ImageWorkflow/apps/backend/internal/pipeline"
	"ImageWorkflow/apps/backend/internal/product"
	"ImageWorkflow/apps/backend/internal/settings"
	"ImageWorkflow/apps/backend/internal/style"
	"ImageWorkflow/apps/backend/internal/system"
	"ImageWorkflow/apps/backend/internal/workspace"
)

type App struct {
	ctx        context.Context
	system     *system.Service
	settings   *settings.Service
	product    *product.Service
	output     *output.Service
	cache      *cache.Service
	manifest   *manifest.Service
	job        *job.Service
	style      *style.Service
	fileServer *fileserver.Server
	workspace  *workspace.Resolver
}

func NewApp() *App {
	ws := workspace.NewResolver()
	fs := fileserver.NewServer(ws)
	mf := manifest.NewService(ws)
	jb := job.NewService(ws)
	set := settings.NewService(ws)
	// Resolve job timeout from settings on every job start. 0 (or unset) =
	// no timeout, the user must cancel manually from the UI.
	jb.SetJobTimeoutFn(func() time.Duration {
		values, err := set.ResolveAll()
		if err != nil {
			return 0
		}
		s := strings.TrimSpace(values["JOB_TIMEOUT_SECONDS"])
		n, err := strconv.Atoi(s)
		if err != nil || n <= 0 {
			return 0
		}
		return time.Duration(n) * time.Second
	})
	styleService := style.NewService(ws, set)
	styleLoader := style.NewStyleLoaderAdapter(styleService)
	pipeline.RegisterRunners(jb, set, ws, mf, styleLoader)
	return &App{
		workspace:  ws,
		system:     system.NewService(fs, ws),
		settings:   set,
		product:    product.NewService(ws, mf, set),
		output:     output.NewService(ws),
		cache:      cache.NewService(ws),
		manifest:   mf,
		job:        jb,
		style:      styleService,
		fileServer: fs,
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.system.SetContext(ctx)
	a.job.SetEmitContext(ctx)

	// Apply persisted WORKSPACE_DIR (or default) to the resolver before
	// any service tries to read paths.
	if err := a.settings.ApplyToWorkspace(); err != nil {
		log.Printf("apply workspace failed: %v", err)
	}

	if err := a.job.Start(); err != nil {
		log.Printf("job service start failed: %v", err)
	}

	if _, err := a.fileServer.Start(); err != nil {
		log.Printf("file server start failed: %v", err)
	}
}

func (a *App) domReady(ctx context.Context) {
}

func (a *App) beforeClose(ctx context.Context) bool {
	return false
}

func (a *App) shutdown(ctx context.Context) {
	if a.job != nil {
		a.job.Stop()
	}
	if a.fileServer != nil {
		_ = a.fileServer.Stop()
	}
}

func (a *App) Ping() string {
	return "pong"
}
