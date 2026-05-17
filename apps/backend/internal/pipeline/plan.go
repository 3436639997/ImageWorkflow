package pipeline

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"image"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"ImageWorkflow/apps/backend/internal/workspace"
)

const PlanSchemaVersion = "imageworkflow-generation-plan-v1"

// MainImagePlan, SkuImagePlan, DetailImagePlan mirror the JSON the analysis
// model is asked to produce (and the legacy ImageWorkflow plan shape).
type MainImagePlan struct {
	LayoutType  string   `json:"layout_type"`
	Composition string   `json:"composition"`
	MustShow    []string `json:"must_show"`
	Avoid       []string `json:"avoid"`
}

type SkuImagePlan struct {
	Color       string `json:"color"`
	SourceImage string `json:"source_image"`
	Composition string `json:"composition"`
}

type DetailImagePlan struct {
	Filename    string `json:"filename"`
	SourceImage string `json:"source_image"`
	Focus       string `json:"focus"`
	Composition string `json:"composition"`
}

type GenerationPlan struct {
	ProductID        string            `json:"product_id"`
	HeroColor        string            `json:"hero_color"`
	Colors           []string          `json:"colors"`
	MainImagePlan    MainImagePlan     `json:"main_image_plan"`
	SkuImagePlans    []SkuImagePlan    `json:"sku_image_plans"`
	DetailImagePlans []DetailImagePlan `json:"detail_image_plans"`
	TextureDirection string            `json:"texture_direction"`
	GenerationNotes  string            `json:"generation_notes"`
}

type Snapshot struct {
	Schema         string   `json:"schema"`
	Digest         string   `json:"digest"`
	ImageCount     int      `json:"image_count"`
	ImageTotalSize int64    `json:"image_total_size"`
	ImageNames     []string `json:"image_names"`
}

type planEnvelope struct {
	Snapshot Snapshot       `json:"snapshot"`
	Plan     GenerationPlan `json:"plan"`
}

// CachePath returns <workspace>/cache/generation_plan_<safe_id>.json
func PlanCachePath(ws *workspace.Resolver, productID string) string {
	return filepath.Join(ws.CacheDir(), "generation_plan_"+safeID(productID)+".json")
}

func safeID(id string) string {
	out := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			return r
		}
		return '_'
	}, strings.ToLower(strings.TrimSpace(id)))
	parts := strings.FieldsFunc(out, func(r rune) bool { return r == '_' })
	if len(parts) == 0 {
		return "product"
	}
	return strings.Join(parts, "_")
}

// ColorAssignment links a color variant with the source image used for it.
type ColorAssignment struct {
	Color string
	Path  string // absolute path to the source image
}

// AssignImagesToColors picks one image per color, preferring filenames that
// contain the color (case-insensitive) over remaining images.
func AssignImagesToColors(spec ProductSpec, imagePaths []string) []ColorAssignment {
	colors := spec.Colors()
	if len(colors) == 0 {
		out := make([]ColorAssignment, 0, len(imagePaths))
		for i, p := range imagePaths {
			out = append(out, ColorAssignment{Color: fmt.Sprintf("variant_%d", i+1), Path: p})
		}
		return out
	}
	used := map[string]bool{}
	out := make([]ColorAssignment, 0, len(colors))
	for idx, color := range colors {
		var chosen string
		key := strings.ToLower(color)
		for _, p := range imagePaths {
			if used[p] {
				continue
			}
			stem := strings.ToLower(strings.TrimSuffix(filepath.Base(p), filepath.Ext(p)))
			if strings.Contains(stem, key) {
				chosen = p
				break
			}
		}
		if chosen == "" {
			for _, p := range imagePaths {
				if !used[p] {
					chosen = p
					break
				}
			}
		}
		if chosen == "" && len(imagePaths) > 0 {
			chosen = imagePaths[min(idx, len(imagePaths)-1)]
		}
		if chosen != "" {
			used[chosen] = true
			out = append(out, ColorAssignment{Color: color, Path: chosen})
		}
	}
	return out
}

// ChooseHeroColor returns spec.HeroColor if present in colors, else the first.
func ChooseHeroColor(spec ProductSpec, colors []string) string {
	if spec.HeroColor != "" {
		for _, c := range colors {
			if strings.EqualFold(c, spec.HeroColor) {
				return spec.HeroColor
			}
		}
	}
	if len(colors) > 0 {
		return colors[0]
	}
	return ""
}

// BuildSnapshot computes a stable digest of all inputs that influence the plan.
func BuildSnapshot(spec ProductSpec, productImagePaths []string, globalStyle, categoryStyle string) (Snapshot, error) {
	type imgItem struct {
		Name string `json:"name"`
		Size int64  `json:"size"`
	}
	items := make([]imgItem, 0, len(productImagePaths))
	totalSize := int64(0)
	names := make([]string, 0, len(productImagePaths))
	for _, p := range productImagePaths {
		st, err := os.Stat(p)
		if err != nil {
			return Snapshot{}, err
		}
		items = append(items, imgItem{Name: filepath.Base(p), Size: st.Size()})
		totalSize += st.Size()
		names = append(names, filepath.Base(p))
	}

	digestSrc := struct {
		Schema        string      `json:"schema"`
		Spec          interface{} `json:"spec"`
		Images        []imgItem   `json:"images"`
		GlobalStyle   string      `json:"global_style"`
		CategoryStyle string      `json:"category_style"`
		Rules         string      `json:"rules"`
	}{
		Schema:        PlanSchemaVersion,
		Spec:          spec.ManifestRow,
		Images:        items,
		GlobalStyle:   globalStyle,
		CategoryStyle: categoryStyle,
		Rules:         SageGenerationRules,
	}
	raw, err := json.Marshal(digestSrc)
	if err != nil {
		return Snapshot{}, err
	}
	sum := sha256.Sum256(raw)
	return Snapshot{
		Schema:         PlanSchemaVersion,
		Digest:         hex.EncodeToString(sum[:]),
		ImageCount:     len(productImagePaths),
		ImageTotalSize: totalSize,
		ImageNames:     names,
	}, nil
}

// LoadCachedPlan returns the cached plan if its snapshot equals the input.
func LoadCachedPlan(ws *workspace.Resolver, productID string, snapshot Snapshot) *GenerationPlan {
	data, err := os.ReadFile(PlanCachePath(ws, productID))
	if err != nil {
		return nil
	}
	var env planEnvelope
	if err := json.Unmarshal(data, &env); err != nil {
		return nil
	}
	if env.Snapshot.Digest != snapshot.Digest {
		return nil
	}
	plan := env.Plan
	return &plan
}

// SavePlan writes the plan envelope to cache.
func SavePlan(ws *workspace.Resolver, productID string, snapshot Snapshot, plan GenerationPlan) error {
	if err := os.MkdirAll(ws.CacheDir(), 0o755); err != nil {
		return err
	}
	env := planEnvelope{Snapshot: snapshot, Plan: plan}
	data, err := json.MarshalIndent(env, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(PlanCachePath(ws, productID), data, 0o644)
}

// BuildPlanInstructions assembles the user-message text the analysis model
// receives along with the product images.
func BuildPlanInstructions(spec ProductSpec, assignments []ColorAssignment, globalStyle, categoryStyle string) string {
	colorLines := make([]string, 0, len(assignments))
	for _, a := range assignments {
		colorLines = append(colorLines, fmt.Sprintf("- %s: %s", a.Color, filepath.Base(a.Path)))
	}
	return strings.TrimSpace(fmt.Sprintf(`为这个产品生成一份 Sage 生图计划，只返回严格 JSON。
除 product_id、字段名、文件名、layout_type 这类必要标识外，composition、must_show、avoid、focus、texture_direction、generation_notes 等内容优先使用中文，便于后续人工编辑和生图控制。

Fixed Sage rules:
%s

Product data:
%s

Color/source candidates:
%s

Global reference style:
%s

Category reference style:
%s

Return JSON with these keys:
product_id, hero_color, colors, main_image_plan, sku_image_plans, detail_image_plans, texture_direction, generation_notes.
sku_image_plans must include every color exactly once. detail_image_plans must contain 1 to 3 items.
Do not include markdown fences or explanation.`, SageGenerationRules, spec.PromptNote(), strings.Join(colorLines, "\n"), globalStyle, categoryStyle))
}

// AnalyzePlan calls the analysis model to produce a generation plan.
func AnalyzePlan(ctx context.Context, client *ChatClient, images []image.Image, instructions string) (*GenerationPlan, error) {
	text, err := client.AnalyzeWithImages(ctx, images, instructions)
	if err != nil {
		return nil, err
	}
	cleaned := stripCodeFences(text)
	var raw map[string]interface{}
	if err := json.Unmarshal([]byte(cleaned), &raw); err != nil {
		// try to find the first {...} block
		start := strings.Index(cleaned, "{")
		end := strings.LastIndex(cleaned, "}")
		if start < 0 || end <= start {
			return nil, fmt.Errorf("无法解析 plan JSON: %w (raw: %s)", err, truncate(cleaned, 200))
		}
		if err := json.Unmarshal([]byte(cleaned[start:end+1]), &raw); err != nil {
			return nil, fmt.Errorf("plan JSON 仍然无效: %w", err)
		}
	}
	plan := &GenerationPlan{}
	planJSON, _ := json.Marshal(raw)
	if err := json.Unmarshal(planJSON, plan); err != nil {
		return nil, fmt.Errorf("plan 字段映射失败: %w", err)
	}
	return plan, nil
}

func stripCodeFences(s string) string {
	t := strings.TrimSpace(s)
	if strings.HasPrefix(t, "```") {
		// drop first fence line
		nl := strings.IndexByte(t, '\n')
		if nl > 0 {
			t = t[nl+1:]
		}
		// drop trailing fence
		if i := strings.LastIndex(t, "```"); i >= 0 {
			t = t[:i]
		}
	}
	return strings.TrimSpace(t)
}

// Normalize fills in defaults and clamps fields against the assignments.
func Normalize(raw *GenerationPlan, spec ProductSpec, assignments []ColorAssignment, heroColor string) GenerationPlan {
	colors := make([]string, 0, len(assignments))
	for _, a := range assignments {
		colors = append(colors, a.Color)
	}
	if raw == nil {
		return Fallback(spec, assignments, heroColor)
	}
	hero := strings.TrimSpace(raw.HeroColor)
	if hero == "" {
		hero = heroColor
	}
	if !containsCI(colors, hero) {
		hero = heroColor
		if !containsCI(colors, hero) && len(colors) > 0 {
			hero = colors[0]
		}
	}
	out := GenerationPlan{
		ProductID: spec.ProductID,
		HeroColor: hero,
		Colors:    colors,
		MainImagePlan: MainImagePlan{
			LayoutType:  defaultIfEmpty(raw.MainImagePlan.LayoutType, "hero_with_color_variants"),
			Composition: defaultIfEmpty(raw.MainImagePlan.Composition, "使用主推色作为最大主体，其他颜色作为较小辅助视图整齐排布，白底清爽，层次明确。"),
			MustShow:    defaultIfEmptyList(raw.MainImagePlan.MustShow, []string{"全部颜色", "纯白背景", "主次清楚", "材质质感"}),
			Avoid:       defaultIfEmptyList(raw.MainImagePlan.Avoid, []string{"文字", "道具", "生活场景", "假 logo", "额外颜色"}),
		},
		SkuImagePlans:    normalizeSkus(raw.SkuImagePlans, assignments),
		DetailImagePlans: normalizeDetails(raw.DetailImagePlans, spec, assignments),
		TextureDirection: defaultIfEmpty(raw.TextureDirection, DefaultTextureDirection()),
		GenerationNotes:  defaultIfEmpty(raw.GenerationNotes, "保持欧美促销品平台常见的干净、真实、有质感的商品图风格。"),
	}
	return out
}

// Fallback returns a deterministic plan used when the analysis call fails.
func Fallback(spec ProductSpec, assignments []ColorAssignment, heroColor string) GenerationPlan {
	colors := make([]string, 0, len(assignments))
	for _, a := range assignments {
		colors = append(colors, a.Color)
	}
	hero := heroColor
	if !containsCI(colors, hero) && len(colors) > 0 {
		hero = colors[0]
	}
	skus := make([]SkuImagePlan, 0, len(assignments))
	for _, a := range assignments {
		skus = append(skus, SkuImagePlan{
			Color:       a.Color,
			SourceImage: filepath.Base(a.Path),
			Composition: "单个颜色单独居中展示，纯白背景，产品占画面 75%-85%，保留自然阴影和清晰材质。",
		})
	}
	count := spec.EffectiveDetailCount()
	focuses := []string{
		"材质纹理、表面质感、缝线、边缘厚度或结构细节",
		"功能结构、开合方式、手柄、印刷位或核心卖点细节",
		"质量细节近景；必要时可搭配一个小的完整产品辅助视图",
	}
	details := make([]DetailImagePlan, 0, count)
	for i := 0; i < count; i++ {
		var src string
		if len(assignments) > 0 {
			src = filepath.Base(assignments[min(i, len(assignments)-1)].Path)
		}
		details = append(details, DetailImagePlan{
			Filename:    fmt.Sprintf("detail_%d.png", i+1),
			SourceImage: src,
			Focus:       focuses[min(i, len(focuses)-1)],
			Composition: "干净的产品细节近景；不强制白底，可使用简单浅色背景或轻微承托来突出质感，但不能变成生活场景。",
		})
	}
	return GenerationPlan{
		ProductID: spec.ProductID,
		HeroColor: hero,
		Colors:    colors,
		MainImagePlan: MainImagePlan{
			LayoutType:  "hero_with_color_variants",
			Composition: "使用主推色作为最大主体，其他颜色作为较小辅助视图整齐排布，纯白背景，主次清楚，不要拥挤。",
			MustShow:    []string{"全部颜色", "纯白背景", "主次清楚", "材质质感"},
			Avoid:       []string{"文字", "道具", "生活场景", "假 logo", "额外颜色"},
		},
		SkuImagePlans:    skus,
		DetailImagePlans: details,
		TextureDirection: DefaultTextureDirection(),
		GenerationNotes:  "保持欧美促销品平台常见的干净、真实、有质感的商品图风格。",
	}
}

func normalizeSkus(raw []SkuImagePlan, assignments []ColorAssignment) []SkuImagePlan {
	byColor := map[string]SkuImagePlan{}
	for _, s := range raw {
		byColor[strings.ToLower(s.Color)] = s
	}
	out := make([]SkuImagePlan, 0, len(assignments))
	for _, a := range assignments {
		key := strings.ToLower(a.Color)
		s, ok := byColor[key]
		if !ok {
			s = SkuImagePlan{}
		}
		s.Color = a.Color
		if strings.TrimSpace(s.SourceImage) == "" {
			s.SourceImage = filepath.Base(a.Path)
		}
		if strings.TrimSpace(s.Composition) == "" {
			s.Composition = "单个颜色单独居中展示，纯白背景，产品占画面 75%-85%，保留自然阴影和清晰材质。"
		}
		out = append(out, s)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Color < out[j].Color })
	return out
}

func normalizeDetails(raw []DetailImagePlan, spec ProductSpec, assignments []ColorAssignment) []DetailImagePlan {
	count := spec.EffectiveDetailCount()
	if len(raw) > count {
		raw = raw[:count]
	}
	for len(raw) < count {
		raw = append(raw, DetailImagePlan{})
	}
	for i := range raw {
		if strings.TrimSpace(raw[i].Filename) == "" {
			raw[i].Filename = fmt.Sprintf("detail_%d.png", i+1)
		}
		if strings.TrimSpace(raw[i].SourceImage) == "" && len(assignments) > 0 {
			raw[i].SourceImage = filepath.Base(assignments[min(i, len(assignments)-1)].Path)
		}
		if strings.TrimSpace(raw[i].Composition) == "" {
			raw[i].Composition = "干净的产品细节近景；不强制白底，可使用简单浅色背景或轻微承托来突出质感，但不能变成生活场景。"
		}
	}
	return raw
}

func containsCI(list []string, value string) bool {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		return false
	}
	for _, item := range list {
		if strings.ToLower(strings.TrimSpace(item)) == value {
			return true
		}
	}
	return false
}

func defaultIfEmpty(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func defaultIfEmptyList(value []string, fallback []string) []string {
	out := make([]string, 0, len(value))
	for _, v := range value {
		v = strings.TrimSpace(v)
		if v != "" {
			out = append(out, v)
		}
	}
	if len(out) == 0 {
		return fallback
	}
	return out
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
