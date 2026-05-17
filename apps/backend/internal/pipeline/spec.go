package pipeline

import (
	"fmt"
	"strings"

	"ImageWorkflow/apps/backend/internal/manifest"
)

// ProductSpec is a thin wrapper around manifest.ManifestRow with helper
// methods used by the pipeline (prompt note, color list parsing).
type ProductSpec struct {
	manifest.ManifestRow
}

func SpecFromManifest(row manifest.ManifestRow) ProductSpec {
	return ProductSpec{ManifestRow: row}
}

// FolderID returns the directory name. Same as ProductID for our schema.
func (s ProductSpec) FolderID() string {
	return s.ProductID
}

// Colors splits ColorsText on common separators (English/Chinese commas, semicolons, slashes).
func (s ProductSpec) Colors() []string {
	if s.ColorsText == "" {
		return nil
	}
	tmp := s.ColorsText
	for _, sep := range []string{"，", "、", ";", "/", " "} {
		tmp = strings.ReplaceAll(tmp, sep, ",")
	}
	parts := strings.Split(tmp, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// PromptNote builds a one-line product summary used inside prompts.
func (s ProductSpec) PromptNote() string {
	bits := []string{}
	if s.Name != "" {
		bits = append(bits, "name="+s.Name)
	}
	if s.Category != "" {
		bits = append(bits, "category="+s.Category)
	}
	if s.HeroColor != "" {
		bits = append(bits, "hero="+s.HeroColor)
	}
	if colors := s.Colors(); len(colors) > 0 {
		bits = append(bits, "colors="+strings.Join(colors, "/"))
	}
	if s.Description != "" {
		bits = append(bits, "desc="+s.Description)
	}
	if s.Keywords != "" {
		bits = append(bits, "keywords="+s.Keywords)
	}
	if len(bits) == 0 {
		return s.ProductID
	}
	return fmt.Sprintf("%s (%s)", s.ProductID, strings.Join(bits, "; "))
}

// EffectiveDetailCount returns DetailImageCount clamped to [1, 3].
func (s ProductSpec) EffectiveDetailCount() int {
	n := s.DetailImageCount
	if n <= 0 {
		n = 2
	}
	if n > 3 {
		n = 3
	}
	return n
}
