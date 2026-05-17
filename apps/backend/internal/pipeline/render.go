package pipeline

import (
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"image/png"
	"log"
	"os"
	"path/filepath"
	"strings"

	xdraw "golang.org/x/image/draw"
)

// ProductRenderResult lists the files generated for a single render run.
type ProductRenderResult struct {
	ProductID string   `json:"product_id"`
	HeroColor string   `json:"hero_color"`
	Colors    []string `json:"colors"`
	Generated []string `json:"generated"`
	Skipped   []string `json:"skipped"`
}

// RenderStage indicates which subset of outputs to render.
type RenderStage int

const (
	StageAll RenderStage = iota
	StageMain
	StageSkus
	StageDetails
)

// RenderProduct executes the full render pipeline (main image + each SKU +
// each detail image) using the given plan and saves the outputs to
// <workspace>/output/<productID>/.
func (cfg Config) RenderProduct(
	ctx context.Context,
	spec ProductSpec,
	plan GenerationPlan,
	productImagePaths []string,
	globalStyle, categoryStyle string,
	logger *log.Logger,
) (ProductRenderResult, error) {
	return cfg.RenderStage(ctx, spec, plan, productImagePaths, globalStyle, categoryStyle, StageAll, logger)
}

// RenderStage runs only a subset of the pipeline. Use StageAll to mirror
// RenderProduct.
func (cfg Config) RenderStage(
	ctx context.Context,
	spec ProductSpec,
	plan GenerationPlan,
	productImagePaths []string,
	globalStyle, categoryStyle string,
	stage RenderStage,
	logger *log.Logger,
) (ProductRenderResult, error) {
	outDir := cfg.Workspace.OutputFolder(spec.ProductID)
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return ProductRenderResult{}, err
	}

	assignments := AssignImagesToColors(spec, productImagePaths)
	colors := plan.Colors
	if len(colors) == 0 {
		for _, a := range assignments {
			colors = append(colors, a.Color)
		}
	}
	hero := plan.HeroColor
	if hero == "" {
		hero = ChooseHeroColor(spec, colors)
	}

	result := ProductRenderResult{ProductID: spec.ProductID, HeroColor: hero, Colors: colors}
	imageClient := cfg.NewImageClient()
	size := imageAPISize(cfg.AspectRatio)
	pathsByName := map[string]string{}
	for _, p := range productImagePaths {
		pathsByName[strings.ToLower(filepath.Base(p))] = p
	}

	if stage == StageAll || stage == StageMain {
		cfg.renderMain(ctx, imageClient, spec, plan, assignments, hero, colors, globalStyle, categoryStyle, size, outDir, &result, logger)
	}
	if stage == StageAll || stage == StageSkus {
		cfg.renderSKUs(ctx, imageClient, spec, plan, assignments, pathsByName, globalStyle, categoryStyle, size, outDir, &result, logger)
	}
	if stage == StageAll || stage == StageDetails {
		cfg.renderDetails(ctx, imageClient, spec, plan, assignments, pathsByName, globalStyle, categoryStyle, size, outDir, &result, logger)
	}

	// Output manifest (only update what we produced; merge with prior on partial runs).
	manifestPath := filepath.Join(outDir, "manifest.json")
	manifestBody, _ := json.MarshalIndent(map[string]interface{}{
		"product_id":      spec.ProductID,
		"folder_id":       spec.FolderID(),
		"colors":          colors,
		"hero_color":      hero,
		"stage":           stageLabel(stage),
		"generated_count": len(result.Generated),
		"generated":       result.Generated,
		"skipped":         result.Skipped,
	}, "", "  ")
	if err := os.WriteFile(manifestPath, manifestBody, 0o644); err != nil {
		logger.Printf("[render] 写入 manifest.json 失败: %v", err)
	}

	logger.Printf("[render] 完成，生成 %d 张，跳过 %d 张", len(result.Generated), len(result.Skipped))
	if len(result.Generated) == 0 {
		return result, fmt.Errorf("没有任何图片生成成功，跳过 %d 张（请检查 API 配额或网关配置）", len(result.Skipped))
	}
	return result, nil
}

func stageLabel(s RenderStage) string {
	switch s {
	case StageMain:
		return "main"
	case StageSkus:
		return "skus"
	case StageDetails:
		return "details"
	default:
		return "all"
	}
}

func (cfg Config) renderMain(
	ctx context.Context,
	client *ImageClient,
	spec ProductSpec,
	plan GenerationPlan,
	assignments []ColorAssignment,
	hero string,
	colors []string,
	globalStyle, categoryStyle, size, outDir string,
	result *ProductRenderResult,
	logger *log.Logger,
) {
	logger.Printf("[render] 拼接主图素材...")
	contact := makeContactSheet(assignments, hero)
	mainPrompt := BuildMainPrompt(spec, globalStyle, categoryStyle, hero, colors, plan)
	if file, err := cfg.runImageTask(ctx, client, contact, mainPrompt, size, outDir, "main.png", logger); err != nil {
		logger.Printf("[render] 主图失败: %v", err)
		result.Skipped = append(result.Skipped, "main.png")
	} else {
		result.Generated = append(result.Generated, file)
	}
}

func (cfg Config) renderSKUs(
	ctx context.Context,
	client *ImageClient,
	spec ProductSpec,
	plan GenerationPlan,
	assignments []ColorAssignment,
	pathsByName map[string]string,
	globalStyle, categoryStyle, size, outDir string,
	result *ProductRenderResult,
	logger *log.Logger,
) {
	used := map[string]int{}
	for _, sku := range plan.SkuImagePlans {
		src := pickSourcePath(sku.SourceImage, pathsByName, assignments, sku.Color)
		if src == "" {
			logger.Printf("[render] sku %s 没有可用素材，跳过", sku.Color)
			continue
		}
		img, err := loadImageFile(src)
		if err != nil {
			logger.Printf("[render] sku %s 读图失败: %v", sku.Color, err)
			continue
		}
		prompt := BuildSkuPrompt(spec, globalStyle, categoryStyle, sku.Color, plan, sku)
		fname := skuFilenameFromSource(src, used)
		if file, err := cfg.runImageTask(ctx, client, img, prompt, size, outDir, fname, logger); err != nil {
			logger.Printf("[render] sku %s 失败: %v", sku.Color, err)
			result.Skipped = append(result.Skipped, fname)
		} else {
			result.Generated = append(result.Generated, file)
		}
	}
}

func (cfg Config) renderDetails(
	ctx context.Context,
	client *ImageClient,
	spec ProductSpec,
	plan GenerationPlan,
	assignments []ColorAssignment,
	pathsByName map[string]string,
	globalStyle, categoryStyle, size, outDir string,
	result *ProductRenderResult,
	logger *log.Logger,
) {
	used := map[string]int{}
	for i, detail := range plan.DetailImagePlans {
		src := pickSourcePath(detail.SourceImage, pathsByName, assignments, "")
		if src == "" {
			logger.Printf("[render] detail %d 没有可用素材，跳过", i+1)
			continue
		}
		img, err := loadImageFile(src)
		if err != nil {
			logger.Printf("[render] detail %d 读图失败: %v", i+1, err)
			continue
		}
		prompt := BuildDetailPrompt(spec, globalStyle, categoryStyle, i+1, plan, detail)
		fname := detailFilenameFromSource(src, used)
		if file, err := cfg.runImageTask(ctx, client, img, prompt, size, outDir, fname, logger); err != nil {
			logger.Printf("[render] detail %d 失败: %v", i+1, err)
			result.Skipped = append(result.Skipped, fname)
		} else {
			result.Generated = append(result.Generated, file)
		}
	}
}

// skuFilenameFromSource returns "sku__<stem>.png" with collision suffix.
func skuFilenameFromSource(srcPath string, used map[string]int) string {
	stem := cleanFilenameStem(srcPath)
	return uniquePNG("sku__"+stem, used)
}

func detailFilenameFromSource(srcPath string, used map[string]int) string {
	stem := cleanFilenameStem(srcPath)
	return uniquePNG("detail__"+stem, used)
}

func uniquePNG(base string, used map[string]int) string {
	idx := used[base]
	used[base] = idx + 1
	if idx == 0 {
		return base + ".png"
	}
	return fmt.Sprintf("%s_%d.png", base, idx+1)
}

// cleanFilenameStem returns the source file's stem with characters that are
// illegal on common filesystems replaced with "_". Chinese characters are
// preserved.
func cleanFilenameStem(srcPath string) string {
	base := filepath.Base(srcPath)
	stem := strings.TrimSuffix(base, filepath.Ext(base))
	stem = strings.ReplaceAll(stem, "..", "_")
	bad := []rune{'/', '\\', ':', '*', '?', '"', '<', '>', '|'}
	for _, r := range bad {
		stem = strings.ReplaceAll(stem, string(r), "_")
	}
	stem = strings.TrimSpace(stem)
	if stem == "" {
		stem = "image"
	}
	return stem
}

func (cfg Config) runImageTask(
	ctx context.Context,
	client *ImageClient,
	source image.Image,
	prompt string,
	size string,
	outDir string,
	filename string,
	logger *log.Logger,
) (string, error) {
	logger.Printf("[render] 调用 image API: %s", filename)
	if cfg.Mock {
		final := finalizeImage(source, cfg.FinalSize)
		return savePNG(filepath.Join(outDir, filename), final)
	}
	gen, err := client.EditImage(ctx, source, prompt, size)
	if err != nil {
		return "", err
	}
	final := finalizeImage(gen, cfg.FinalSize)
	return savePNG(filepath.Join(outDir, filename), final)
}

func savePNG(path string, img image.Image) (string, error) {
	f, err := os.Create(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	if err := png.Encode(f, img); err != nil {
		return "", err
	}
	return path, nil
}

// finalizeImage scales source to fit within target x target on a white square
// canvas (letterboxing, like the legacy ImageOps.contain).
func finalizeImage(source image.Image, target int) image.Image {
	if target <= 0 {
		target = 1536
	}
	srcBounds := source.Bounds()
	sw, sh := srcBounds.Dx(), srcBounds.Dy()
	if sw == 0 || sh == 0 {
		return source
	}
	scale := float64(target) / float64(maxInt(sw, sh))
	w := int(float64(sw) * scale)
	h := int(float64(sh) * scale)
	if w < 1 {
		w = 1
	}
	if h < 1 {
		h = 1
	}
	resized := image.NewRGBA(image.Rect(0, 0, w, h))
	xdraw.CatmullRom.Scale(resized, resized.Bounds(), source, srcBounds, xdraw.Over, nil)

	canvas := image.NewRGBA(image.Rect(0, 0, target, target))
	draw.Draw(canvas, canvas.Bounds(), &image.Uniform{C: color.White}, image.Point{}, draw.Src)
	x := (target - w) / 2
	y := (target - h) / 2
	draw.Draw(canvas, image.Rect(x, y, x+w, y+h), resized, image.Point{}, draw.Over)
	return canvas
}

// makeContactSheet tiles assignment images on a 3-column white grid, used as
// the source image for the main hero render.
func makeContactSheet(assignments []ColorAssignment, hero string) image.Image {
	if len(assignments) == 0 {
		canvas := image.NewRGBA(image.Rect(0, 0, 1024, 1024))
		draw.Draw(canvas, canvas.Bounds(), &image.Uniform{C: color.White}, image.Point{}, draw.Src)
		return canvas
	}
	tile := 520
	margin := 80
	cols := 3
	if len(assignments) < cols {
		cols = len(assignments)
	}
	if cols < 1 {
		cols = 1
	}
	rows := (len(assignments) + cols - 1) / cols
	w := cols*tile + 2*margin
	h := rows*(tile+60) + 2*margin
	canvas := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.Draw(canvas, canvas.Bounds(), &image.Uniform{C: color.White}, image.Point{}, draw.Src)

	for idx, a := range assignments {
		col := idx % cols
		row := idx / cols
		boxX := margin + col*tile
		boxY := margin + row*(tile+60)

		img, err := loadImageFile(a.Path)
		if err != nil {
			continue
		}
		fitted := containImage(img, tile, tile)
		fb := fitted.Bounds()
		offX := boxX + (tile-fb.Dx())/2
		offY := boxY + (tile-fb.Dy())/2
		draw.Draw(canvas, image.Rect(offX, offY, offX+fb.Dx(), offY+fb.Dy()), fitted, image.Point{}, draw.Over)
		_ = hero // hero color is encoded in the prompt; visual labels removed for simplicity
	}
	return canvas
}

func containImage(src image.Image, maxW, maxH int) image.Image {
	sb := src.Bounds()
	sw, sh := sb.Dx(), sb.Dy()
	if sw == 0 || sh == 0 {
		return src
	}
	rw := float64(maxW) / float64(sw)
	rh := float64(maxH) / float64(sh)
	r := rw
	if rh < r {
		r = rh
	}
	if r >= 1 {
		return src
	}
	w := int(float64(sw) * r)
	h := int(float64(sh) * r)
	dst := image.NewRGBA(image.Rect(0, 0, w, h))
	xdraw.CatmullRom.Scale(dst, dst.Bounds(), src, sb, xdraw.Over, nil)
	return dst
}

func loadImageFile(path string) (image.Image, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	img, _, err := image.Decode(f)
	if err != nil {
		// some webp/bmp may not be decodable by stdlib; try jpeg explicitly
		if _, err2 := f.Seek(0, 0); err2 == nil {
			if img2, err2 := jpeg.Decode(f); err2 == nil {
				return img2, nil
			}
		}
		return nil, fmt.Errorf("解码图片失败 %s: %w", path, err)
	}
	return img, nil
}

func pickSourcePath(want string, byName map[string]string, assignments []ColorAssignment, color string) string {
	if want = strings.TrimSpace(want); want != "" {
		if p, ok := byName[strings.ToLower(want)]; ok {
			return p
		}
	}
	if color != "" {
		key := strings.ToLower(color)
		for _, a := range assignments {
			if strings.ToLower(a.Color) == key {
				return a.Path
			}
		}
	}
	if len(assignments) > 0 {
		return assignments[0].Path
	}
	return ""
}

func imageAPISize(aspect string) string {
	switch strings.TrimSpace(aspect) {
	case "1:1":
		return "1024x1024"
	case "3:4", "9:16":
		return "1024x1536"
	case "4:3", "16:9":
		return "1536x1024"
	default:
		return "1024x1024"
	}
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
