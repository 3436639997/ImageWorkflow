package pipeline

import (
	"fmt"
	"strings"
)

const SageGenerationRules = `分析模型只允许生成"生图计划"，不能改变产品本身。
最高优先级：保持产品形状、结构、颜色、材质类型、logo 或印刷位置、缝线、拉链、五金件、开口和功能细节一致。
主图：1:1 纯白背景，体现所有颜色，主推色明确，主次清楚，画面不能乱，不能出现文字。
SKU 图：每个颜色单独一张，纯白背景，只出现该颜色，禁止混入其他颜色。
细节图：1-3 张，不强制白底；可以使用干净浅背景或轻微承托，但不能变成生活场景。
细节图可重点表现：材质纹理、缝线、边缘厚度、拉链、卡扣、开口、印刷位、内部结构、容量感或关键功能细节。
禁止：额外颜色、假 logo、假文字、包装、礼盒、道具、手、模特、复杂桌面场景、植物、虚构尺寸、虚构重量、虚构功能。
质感方向：突出真实材质纹理、边缘厚度、自然阴影、轻微高光和清晰轮廓，避免 AI 磨皮、塑料感和平面贴纸感。
不确定时，选择保守、干净、适合欧美促销品平台的商品图构图。`

const SageMainImagePrompt = `Generate a premium international marketplace hero image on a clean pure white background. Keep the exact product identity, shape, colors, logo placement, seams, material texture, surface finish, and functional details faithful to the input image. Make the product feel suitable for US and European promotional-product buyers. Keep the composition clean, square, sharp, and not busy. No lifestyle background, no unrelated props, no fake branding, and no unrelated design changes.`

func FallbackGlobalStylePrompt() string {
	return "Pure white square Sage promotional-product image, crisp product cutouts, balanced whitespace, clean collage layout, all color variants shown clearly, premium material texture, minimal detail panels, and no clutter."
}

func FallbackCategoryStylePrompt(category string) string {
	if strings.TrimSpace(category) == "" {
		return ""
	}
	return fmt.Sprintf("For the %s category, preserve exact product structure and material finish, use close detail crops only when useful, and keep a clean white-background promotional-product presentation.", category)
}

func DefaultTextureDirection() string {
	return "突出真实材质纹理、边缘厚度、自然阴影、轻微高光和清晰轮廓，避免 AI 磨皮、塑料感和平面贴纸感。"
}

// joinPromptParts joins non-empty parts with single spaces, like the
// `join_prompt_parts` helper from the legacy project.
func joinPromptParts(parts ...string) string {
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return strings.Join(out, " ")
}

// BuildMainPrompt assembles the prompt for the hero/main image rendering.
func BuildMainPrompt(spec ProductSpec, globalStyle, categoryStyle, heroColor string, colors []string, plan GenerationPlan) string {
	main := plan.MainImagePlan
	return joinPromptParts(
		SageMainImagePrompt,
		"Create one 1:1 Sage promotional marketplace main image on a pure white background.",
		"Show every product color variant clearly in the same image, with the hero color most prominent.",
		ifNonEmpty("Hero color: %s.", heroColor),
		ifNonEmpty("All colors to show: %s.", strings.Join(colors, ", ")),
		ifNonEmpty("Product-specific composition: %s", main.Composition),
		ifNonEmpty("Must show: %s.", strings.Join(main.MustShow, ", ")),
		ifNonEmpty("Avoid: %s.", strings.Join(main.Avoid, ", ")),
		ifNonEmpty("Texture direction: %s", plan.TextureDirection),
		ifNonEmpty("Generation notes: %s", plan.GenerationNotes),
		"Keep the image simple, premium, sharp, texture-focused, and not cluttered.",
		"Do not add extra colors, fake logos, text, lifestyle scenery, props, packaging, hands, models, or unrelated accessories.",
		ifNonEmpty("Product data: %s", spec.PromptNote()),
		ifNonEmpty("Global reference style: %s", globalStyle),
		ifNonEmpty("Category reference style: %s", categoryStyle),
	)
}

// BuildSkuPrompt assembles the prompt for a single-color SKU image.
func BuildSkuPrompt(spec ProductSpec, globalStyle, categoryStyle, color string, plan GenerationPlan, sku SkuImagePlan) string {
	return joinPromptParts(
		SageMainImagePrompt,
		"Create one isolated SKU image on a pure white background.",
		fmt.Sprintf("Show only the %s color variant. Preserve the exact product color, structure, material, seams, hardware, logo or imprint placement.", color),
		"This SKU image must not include any other color variant.",
		ifNonEmpty("Product-specific SKU composition: %s", sku.Composition),
		ifNonEmpty("Texture direction: %s", plan.TextureDirection),
		"Use centered e-commerce framing with strong material texture, natural contact shadow, crisp edges, and 75%-85% frame coverage.",
		"No text, no props, no other colors, no lifestyle scene, no packaging, no hands, no models, and no extra accessories.",
		ifNonEmpty("Product data: %s", spec.PromptNote()),
		ifNonEmpty("Global reference style: %s", globalStyle),
		ifNonEmpty("Category reference style: %s", categoryStyle),
	)
}

// BuildDetailPrompt assembles the prompt for a single detail image.
func BuildDetailPrompt(spec ProductSpec, globalStyle, categoryStyle string, idx int, plan GenerationPlan, detail DetailImagePlan) string {
	defaultFocuses := []string{
		"material texture, surface finish, stitching, seams, or construction",
		"functional structure, closure, handle, imprint area, or key product feature",
		"close-up quality detail with a small supporting full-product view if useful",
	}
	focus := detail.Focus
	if strings.TrimSpace(focus) == "" {
		i := idx - 1
		if i < 0 {
			i = 0
		}
		if i > len(defaultFocuses)-1 {
			i = len(defaultFocuses) - 1
		}
		focus = defaultFocuses[i]
	}
	return joinPromptParts(
		SageMainImagePrompt,
		"Create one clean Sage product detail image. A pure white background is not required for detail images.",
		"A clean light background, subtle surface, or minimal support is allowed only if it improves material and structure clarity.",
		fmt.Sprintf("Focus on %s.", focus),
		ifNonEmpty("Product-specific detail composition: %s", detail.Composition),
		ifNonEmpty("Texture direction: %s", plan.TextureDirection),
		"Keep product identity and color faithful to the input. Make the detail useful for a promo-product buyer.",
		"Do not make the layout busy. No fake branding, no fake text, no packaging, no hands, no models, no complex props, and no lifestyle scene.",
		ifNonEmpty("Product data: %s", spec.PromptNote()),
		ifNonEmpty("Global reference style: %s", globalStyle),
		ifNonEmpty("Category reference style: %s", categoryStyle),
	)
}

func ifNonEmpty(format, value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	return fmt.Sprintf(format, value)
}
