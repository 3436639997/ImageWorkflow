package pipeline

import (
	"context"
	"encoding/json"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"ImageWorkflow/apps/backend/internal/job"
	"ImageWorkflow/apps/backend/internal/manifest"
	"ImageWorkflow/apps/backend/internal/settings"
	"ImageWorkflow/apps/backend/internal/workspace"
)

// Config bundles the data each pipeline runner needs.
type Config struct {
	Workspace *workspace.Resolver
	Manifest  *manifest.Service
	Settings  *settings.Service

	// Resolved on each run from settings:
	AnalysisBaseURL  string
	AnalysisAPIKey   string
	AnalysisModel    string
	ImageBaseURL     string
	ImageAPIKey      string
	ImageModel       string
	ImageAPIURL      string
	ImageFallbacks   []string
	AspectRatio      string
	FinalSize        int
	RequestTimeout   time.Duration

	Mock bool // dry-run / test mode: no API calls, copy/letterbox source

	// Style loader for loading style prompts by ID
	StyleLoader StyleLoader
}

// NewImageClient builds an image-edit client from the resolved config.
func (c Config) NewImageClient() *ImageClient {
	cli := NewImageClient(c.ImageBaseURL, c.ImageAPIKey, c.ImageModel, c.ImageAPIURL, c.ImageFallbacks)
	if c.RequestTimeout > 0 {
		cli.HTTP.Timeout = c.RequestTimeout
	}
	return cli
}

// NewChatClient builds an analysis chat client from the resolved config.
func (c Config) NewChatClient() *ChatClient {
	cli := NewChatClient(c.AnalysisBaseURL, c.AnalysisAPIKey, c.AnalysisModel)
	if c.RequestTimeout > 0 {
		cli.HTTP.Timeout = c.RequestTimeout
	}
	return cli
}

// resolveConfig snapshots the current settings into a Config (with secrets revealed).
func resolveConfig(ws *workspace.Resolver, mf *manifest.Service, set *settings.Service) (Config, error) {
	values, err := set.ResolveAll()
	if err != nil {
		return Config{}, err
	}
	finalSize := 1536
	if v := strings.TrimSpace(values["FINAL_IMAGE_SIZE"]); v != "" {
		// FINAL_IMAGE_SIZE in settings is "1024x1024"-style; pick the larger dim.
		if dim := parseSquareDim(v); dim > 0 {
			finalSize = dim
		}
	}
	fallbacks := splitList(values["IMAGE_API_FALLBACK_BASE_URLS"])
	// 0 (or unset) means no per-request timeout; rely on user cancel.
	var requestTimeout time.Duration
	if v := strings.TrimSpace(values["API_REQUEST_TIMEOUT_SECONDS"]); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			requestTimeout = time.Duration(n) * time.Second
		}
	}
	cfg := Config{
		Workspace:       ws,
		Manifest:        mf,
		Settings:        set,
		AnalysisBaseURL: values["ANALYSIS_API_BASE_URL"],
		AnalysisAPIKey:  values["ANALYSIS_API_KEY"],
		AnalysisModel:   values["ANALYSIS_MODEL"],
		ImageBaseURL:    values["IMAGE_API_BASE_URL"],
		ImageAPIKey:     values["IMAGE_API_KEY"],
		ImageModel:      values["IMAGE_MODEL"],
		ImageAPIURL:     values["IMAGE_API_URL"],
		ImageFallbacks:  fallbacks,
		AspectRatio:     values["ASPECT_RATIO"],
		FinalSize:       finalSize,
		RequestTimeout:  requestTimeout,
	}
	return cfg, nil
}

func parseSquareDim(s string) int {
	if i := strings.IndexAny(s, "xX"); i > 0 {
		s = s[:i]
	}
	n, _ := strconv.Atoi(strings.TrimSpace(s))
	return n
}

func splitList(s string) []string {
	parts := strings.FieldsFunc(s, func(r rune) bool {
		return r == ',' || r == ';' || r == '\n' || r == '；' || r == '，'
	})
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// RegisterRunners registers the pipeline runners on the job service.
func RegisterRunners(jb *job.Service, set *settings.Service, ws *workspace.Resolver, mf *manifest.Service, styleLoader StyleLoader) {
	jb.Register("dry-run", makeRunner(set, ws, mf, styleLoader, runDryRun))
	jb.Register("analyze", makeRunner(set, ws, mf, styleLoader, runAnalyze))
	jb.Register("render", makeRunner(set, ws, mf, styleLoader, runRender))
	jb.Register("generate", makeRunner(set, ws, mf, styleLoader, runGenerate))
	jb.Register("render-main", makeRunner(set, ws, mf, styleLoader, runRenderMain))
	jb.Register("render-sku", makeRunner(set, ws, mf, styleLoader, runRenderSKU))
	jb.Register("render-detail", makeRunner(set, ws, mf, styleLoader, runRenderDetail))
}

func makeRunner(set *settings.Service, ws *workspace.Resolver, mf *manifest.Service, styleLoader StyleLoader, fn func(context.Context, Config, ProductSpec, []string, string, *log.Logger) (map[string]interface{}, error)) job.Runner {
	return func(ctx context.Context, j *job.Job, logger *log.Logger) (map[string]interface{}, error) {
		cfg, err := resolveConfig(ws, mf, set)
		if err != nil {
			return nil, fmt.Errorf("加载设置失败: %w", err)
		}
		cfg.StyleLoader = styleLoader
		row, err := mf.GetRow(j.ProductID)
		if err != nil {
			return nil, fmt.Errorf("读取产品 manifest 失败: %w", err)
		}
		if row == nil {
			row = &manifest.ManifestRow{ProductID: j.ProductID, DetailImageCount: 2}
		}
		spec := SpecFromManifest(*row)
		images, err := listProductImages(ws, j.ProductID)
		if err != nil {
			return nil, err
		}
		if len(images) == 0 {
			return nil, fmt.Errorf("产品 %s 下没有素材图，请先在产品页上传图片", j.ProductID)
		}
		// Extract globalStyleID from job options
		globalStyleID := ""
		if j.Options != nil {
			if id, ok := j.Options["global_style_id"].(string); ok {
				globalStyleID = id
			}
		}
		return fn(ctx, cfg, spec, images, globalStyleID, logger)
	}
}

func listProductImages(ws *workspace.Resolver, productID string) ([]string, error) {
	folder := ws.ProductFolder(productID)
	entries, err := os.ReadDir(folder)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var out []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(e.Name()))
		switch ext {
		case ".jpg", ".jpeg", ".png", ".webp", ".bmp":
			out = append(out, filepath.Join(folder, e.Name()))
		}
	}
	sort.Strings(out)
	return out, nil
}

// --- Runner implementations ---

func runDryRun(ctx context.Context, cfg Config, spec ProductSpec, images []string, globalStyleID string, logger *log.Logger) (map[string]interface{}, error) {
	logger.Printf("[dry-run] 产品 ID: %s", spec.ProductID)
	logger.Printf("[dry-run] 名称: %s / 类目: %s", spec.Name, spec.Category)
	colors := spec.Colors()
	logger.Printf("[dry-run] 颜色: %s", strings.Join(colors, ", "))
	logger.Printf("[dry-run] 主推: %s", ChooseHeroColor(spec, colors))
	logger.Printf("[dry-run] 素材图 %d 张:", len(images))
	for _, p := range images {
		st, _ := os.Stat(p)
		size := int64(0)
		if st != nil {
			size = st.Size()
		}
		logger.Printf("  - %s (%d bytes)", filepath.Base(p), size)
	}
	assignments := AssignImagesToColors(spec, images)
	for _, a := range assignments {
		logger.Printf("  ↳ %s → %s", a.Color, filepath.Base(a.Path))
	}
	logger.Printf("[dry-run] 分析模型: %s @ %s", cfg.AnalysisModel, cfg.AnalysisBaseURL)
	logger.Printf("[dry-run] 生图模型: %s @ %s", cfg.ImageModel, cfg.ImageBaseURL)
	logger.Printf("[dry-run] 输出尺寸: %dx%d (%s)", cfg.FinalSize, cfg.FinalSize, cfg.AspectRatio)
	if globalStyleID != "" {
		logger.Printf("[dry-run] 全局风格 ID: %s", globalStyleID)
	}
	return map[string]interface{}{
		"ok":           true,
		"images":       len(images),
		"colors":       colors,
		"hero_color":   ChooseHeroColor(spec, colors),
		"product_id":   spec.ProductID,
		"workspace":    cfg.Workspace.Root(),
	}, nil
}

func runAnalyze(ctx context.Context, cfg Config, spec ProductSpec, images []string, globalStyleID string, logger *log.Logger) (map[string]interface{}, error) {
	if cfg.AnalysisAPIKey == "" {
		return nil, fmt.Errorf("ANALYSIS_API_KEY 未配置，无法分析")
	}
	chatClient := cfg.NewChatClient()

	logger.Printf("[analyze] 加载全局参考风格...")
	var globalStyle string
	var err error
	if cfg.StyleLoader != nil {
		globalStyle, err = LoadStylePrompt(cfg.Workspace, cfg.StyleLoader, globalStyleID)
		if err != nil {
			logger.Printf("[analyze] 加载风格套失败: %v，使用 fallback", err)
			globalStyle = FallbackGlobalStylePrompt()
		} else if globalStyleID != "" {
			logger.Printf("[analyze] 使用风格套 %s", globalStyleID)
		} else {
			logger.Printf("[analyze] 使用 fallback 风格")
		}
	} else {
		globalStyle, err = LoadOrAnalyzeGlobalStyle(ctx, cfg.Workspace, chatClient, loadImageFile)
		if err != nil {
			logger.Printf("[analyze] 全局风格 fallback: %v", err)
		} else {
			logger.Printf("[analyze] 全局风格 OK (%d 字符)", len(globalStyle))
		}
	}

	logger.Printf("[analyze] 加载类目参考风格 (%s)...", spec.Category)
	categoryStyle, err := LoadOrAnalyzeCategoryStyle(ctx, cfg.Workspace, chatClient, loadImageFile, spec.Category)
	if err != nil {
		logger.Printf("[analyze] 类目风格 fallback: %v", err)
	}

	assignments := AssignImagesToColors(spec, images)
	hero := ChooseHeroColor(spec, spec.Colors())

	snapshot, err := BuildSnapshot(spec, images, globalStyle, categoryStyle)
	if err != nil {
		return nil, err
	}
	if cached := LoadCachedPlan(cfg.Workspace, spec.ProductID, snapshot); cached != nil {
		logger.Printf("[analyze] 使用缓存的 generation plan")
		return map[string]interface{}{"ok": true, "cached": true, "plan_path": PlanCachePath(cfg.Workspace, spec.ProductID)}, nil
	}

	instructions := BuildPlanInstructions(spec, assignments, globalStyle, categoryStyle)

	logger.Printf("[analyze] 分析产品图，生成 generation plan...")
	imgs, err := openImages(images)
	if err != nil {
		return nil, err
	}
	rawPlan, err := AnalyzePlan(ctx, chatClient, imgs, instructions)
	if err != nil {
		// Save a fallback plan so subsequent renders can still run, but the
		// analyze task itself surfaces the error to the user.
		fallback := Fallback(spec, assignments, hero)
		_ = SavePlan(cfg.Workspace, spec.ProductID, snapshot, fallback)
		logger.Printf("[analyze] 已写入 fallback plan: %s", PlanCachePath(cfg.Workspace, spec.ProductID))
		return nil, fmt.Errorf("分析失败: %w", err)
	}
	plan := Normalize(rawPlan, spec, assignments, hero)
	if err := SavePlan(cfg.Workspace, spec.ProductID, snapshot, plan); err != nil {
		return nil, err
	}
	logger.Printf("[analyze] generation plan 已保存: %s", PlanCachePath(cfg.Workspace, spec.ProductID))
	return map[string]interface{}{"ok": true, "plan_path": PlanCachePath(cfg.Workspace, spec.ProductID)}, nil
}

func runRender(ctx context.Context, cfg Config, spec ProductSpec, images []string, globalStyleID string, logger *log.Logger) (map[string]interface{}, error) {
	return runRenderStage(ctx, cfg, spec, images, globalStyleID, StageAll, logger)
}

func runRenderMain(ctx context.Context, cfg Config, spec ProductSpec, images []string, globalStyleID string, logger *log.Logger) (map[string]interface{}, error) {
	return runRenderStage(ctx, cfg, spec, images, globalStyleID, StageMain, logger)
}

func runRenderSKU(ctx context.Context, cfg Config, spec ProductSpec, images []string, globalStyleID string, logger *log.Logger) (map[string]interface{}, error) {
	return runRenderStage(ctx, cfg, spec, images, globalStyleID, StageSkus, logger)
}

func runRenderDetail(ctx context.Context, cfg Config, spec ProductSpec, images []string, globalStyleID string, logger *log.Logger) (map[string]interface{}, error) {
	return runRenderStage(ctx, cfg, spec, images, globalStyleID, StageDetails, logger)
}

func runRenderStage(ctx context.Context, cfg Config, spec ProductSpec, images []string, globalStyleID string, stage RenderStage, logger *log.Logger) (map[string]interface{}, error) {
	if cfg.ImageAPIKey == "" {
		return nil, fmt.Errorf("IMAGE_API_KEY 未配置，无法渲染")
	}

	plan := loadAnyPlan(cfg.Workspace, spec.ProductID)
	if plan == nil {
		return nil, fmt.Errorf("未找到 generation plan，请先执行「仅分析」或「分析并生图」生成 plan")
	}

	globalStyle := FallbackGlobalStylePrompt()
	categoryStyle := FallbackCategoryStylePrompt(spec.Category)

	result, err := cfg.RenderStage(ctx, spec, *plan, images, globalStyle, categoryStyle, stage, logger)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"ok":        true,
		"stage":     stageLabel(stage),
		"generated": result.Generated,
		"skipped":   result.Skipped,
	}, nil
}

func runGenerate(ctx context.Context, cfg Config, spec ProductSpec, images []string, globalStyleID string, logger *log.Logger) (map[string]interface{}, error) {
	if cfg.ImageAPIKey == "" {
		return nil, fmt.Errorf("IMAGE_API_KEY 未配置")
	}
	if cfg.AnalysisAPIKey == "" {
		return nil, fmt.Errorf("ANALYSIS_API_KEY 未配置")
	}

	chatClient := cfg.NewChatClient()

	logger.Printf("[generate] 阶段 1/3: 加载/分析风格...")
	var globalStyle string
	var err error
	if cfg.StyleLoader != nil {
		globalStyle, err = LoadStylePrompt(cfg.Workspace, cfg.StyleLoader, globalStyleID)
		if err != nil {
			logger.Printf("[generate] 加载风格套失败: %v，使用 fallback", err)
			globalStyle = FallbackGlobalStylePrompt()
		} else if globalStyleID != "" {
			logger.Printf("[generate] 使用风格套 %s", globalStyleID)
		} else {
			logger.Printf("[generate] 使用 fallback 风格")
		}
	} else {
		globalStyle, err = LoadOrAnalyzeGlobalStyle(ctx, cfg.Workspace, chatClient, loadImageFile)
		if err != nil {
			logger.Printf("[generate] 全局风格 fallback: %v", err)
		}
	}
	categoryStyle, err := LoadOrAnalyzeCategoryStyle(ctx, cfg.Workspace, chatClient, loadImageFile, spec.Category)
	if err != nil {
		logger.Printf("[generate] 类目风格 fallback: %v", err)
	}

	assignments := AssignImagesToColors(spec, images)
	hero := ChooseHeroColor(spec, spec.Colors())

	logger.Printf("[generate] 阶段 2/3: 生成 generation plan...")
	snapshot, err := BuildSnapshot(spec, images, globalStyle, categoryStyle)
	if err != nil {
		return nil, err
	}
	var plan GenerationPlan
	if cached := LoadCachedPlan(cfg.Workspace, spec.ProductID, snapshot); cached != nil {
		logger.Printf("[generate] 命中 plan 缓存")
		plan = *cached
	} else {
		instructions := BuildPlanInstructions(spec, assignments, globalStyle, categoryStyle)
		imgs, err := openImages(images)
		if err != nil {
			return nil, err
		}
		raw, err := AnalyzePlan(ctx, chatClient, imgs, instructions)
		if err != nil {
			logger.Printf("[generate] 分析失败，使用 fallback plan: %v", err)
			plan = Fallback(spec, assignments, hero)
		} else {
			plan = Normalize(raw, spec, assignments, hero)
		}
		_ = SavePlan(cfg.Workspace, spec.ProductID, snapshot, plan)
	}

	logger.Printf("[generate] 阶段 3/3: 渲染图片...")
	result, err := cfg.RenderProduct(ctx, spec, plan, images, globalStyle, categoryStyle, logger)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"ok":        true,
		"generated": result.Generated,
		"skipped":   result.Skipped,
		"plan_path": PlanCachePath(cfg.Workspace, spec.ProductID),
	}, nil
}

func openImages(paths []string) ([]image.Image, error) {
	out := make([]image.Image, 0, len(paths))
	for _, p := range paths {
		img, err := loadImageFile(p)
		if err != nil {
			return nil, fmt.Errorf("读图失败 %s: %w", filepath.Base(p), err)
		}
		out = append(out, img)
	}
	return out, nil
}

// loadAnyPlan reads whatever plan envelope exists on disk regardless of snapshot.
func loadAnyPlan(ws *workspace.Resolver, productID string) *GenerationPlan {
	data, err := os.ReadFile(PlanCachePath(ws, productID))
	if err != nil {
		return nil
	}
	var env planEnvelope
	if err := json.Unmarshal(data, &env); err != nil {
		return nil
	}
	plan := env.Plan
	return &plan
}
