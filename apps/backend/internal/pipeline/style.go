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

const (
	globalStyleCacheFile = "sage_reference_global_style.json"
	categoryStylePrefix  = "sage_reference_category_"
)

type styleCacheEnvelope struct {
	Snapshot styleSnapshot `json:"snapshot"`
	Prompt   string        `json:"prompt"`
}

type styleSnapshot struct {
	Names  []string `json:"names"`
	Total  int64    `json:"total_size"`
	Latest int64    `json:"latest_mtime"`
	Hash   string   `json:"hash"`
}

// referenceImagesDir resolves the directory holding Sage reference images.
// Layout convention: <workspace>/images/                 (global)
//                   <workspace>/images/<safe_category>/ (per-category)
func referenceImagesDir(ws *workspace.Resolver, category string) string {
	root := filepath.Join(ws.Root(), "images")
	if category == "" {
		return root
	}
	return filepath.Join(root, safeID(category))
}

func discoverReferenceImages(dir string) ([]string, error) {
	out := []string{}
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return out, nil
	}
	err := filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			return nil
		}
		ext := strings.ToLower(filepath.Ext(d.Name()))
		switch ext {
		case ".jpg", ".jpeg", ".png", ".webp", ".bmp":
			out = append(out, path)
		}
		return nil
	})
	sort.Strings(out)
	return out, err
}

func buildStyleSnapshot(paths []string) styleSnapshot {
	names := make([]string, 0, len(paths))
	var total, latest int64
	for _, p := range paths {
		st, err := os.Stat(p)
		if err != nil {
			continue
		}
		names = append(names, filepath.Base(p))
		total += st.Size()
		if mt := st.ModTime().Unix(); mt > latest {
			latest = mt
		}
	}
	sort.Strings(names)
	hash := sha256.Sum256([]byte(strings.Join(names, "|")))
	return styleSnapshot{
		Names:  names,
		Total:  total,
		Latest: latest,
		Hash:   hex.EncodeToString(hash[:]),
	}
}

func loadStyleCache(path string) *styleCacheEnvelope {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var env styleCacheEnvelope
	if err := json.Unmarshal(data, &env); err != nil {
		return nil
	}
	return &env
}

func saveStyleCache(path string, env styleCacheEnvelope) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(env, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

// AnalyzeStyle calls the chat client with the given images and instructions
// and returns a concise prompt. Used for global + category style.
func AnalyzeStyle(ctx context.Context, client *ChatClient, images []image.Image, instructions string) (string, error) {
	prompt := strings.TrimSpace(fmt.Sprintf(`These are Sage promotional-product reference images.

Analyze their common visual style in these dimensions:
1. White-background layout and square composition
2. Product scale, spacing, and collage structure
3. Material texture, detail crops, and product clarity
4. Color-variant presentation and overall marketplace polish

Then, based on this analysis, write ONE concise image generation prompt
(under 100 words) that captures this Sage product-image style. Output ONLY the prompt, nothing else.

%s`, instructions))
	return client.AnalyzeWithImages(ctx, images, prompt)
}

// LoadOrAnalyzeGlobalStyle returns the cached prompt if reference images are
// unchanged. On miss it calls the analysis API; on failure it falls back to
// the canned prompt.
func LoadOrAnalyzeGlobalStyle(ctx context.Context, ws *workspace.Resolver, client *ChatClient, openImage func(string) (image.Image, error)) (string, error) {
	dir := referenceImagesDir(ws, "")
	paths, err := discoverReferenceImages(dir)
	if err != nil {
		return FallbackGlobalStylePrompt(), nil
	}
	if len(paths) == 0 {
		return FallbackGlobalStylePrompt(), nil
	}

	cachePath := filepath.Join(ws.CacheDir(), globalStyleCacheFile)
	snapshot := buildStyleSnapshot(paths)
	if cached := loadStyleCache(cachePath); cached != nil && cached.Snapshot.Hash == snapshot.Hash {
		return cached.Prompt, nil
	}

	imgs := make([]image.Image, 0, len(paths))
	for _, p := range paths {
		img, err := openImage(p)
		if err != nil {
			continue
		}
		imgs = append(imgs, img)
	}
	if len(imgs) == 0 {
		return FallbackGlobalStylePrompt(), nil
	}

	prompt, err := AnalyzeStyle(ctx, client, imgs, "Focus on Sage and promotional-product main image layout: white background, square collage structure, all-color presentation, detail panels, spacing, and clean premium product texture. Do not describe fashion models.")
	if err != nil {
		return FallbackGlobalStylePrompt(), err
	}
	_ = saveStyleCache(cachePath, styleCacheEnvelope{Snapshot: snapshot, Prompt: prompt})
	return prompt, nil
}

// LoadOrAnalyzeCategoryStyle is the per-category counterpart.
func LoadOrAnalyzeCategoryStyle(ctx context.Context, ws *workspace.Resolver, client *ChatClient, openImage func(string) (image.Image, error), category string) (string, error) {
	if strings.TrimSpace(category) == "" {
		return "", nil
	}
	dir := referenceImagesDir(ws, category)
	paths, err := discoverReferenceImages(dir)
	if err != nil || len(paths) == 0 {
		return FallbackCategoryStylePrompt(category), nil
	}

	cachePath := filepath.Join(ws.CacheDir(), categoryStylePrefix+safeID(category)+".json")
	snapshot := buildStyleSnapshot(paths)
	if cached := loadStyleCache(cachePath); cached != nil && cached.Snapshot.Hash == snapshot.Hash {
		return cached.Prompt, nil
	}

	imgs := make([]image.Image, 0, len(paths))
	for _, p := range paths {
		img, err := openImage(p)
		if err != nil {
			continue
		}
		imgs = append(imgs, img)
	}
	if len(imgs) == 0 {
		return FallbackCategoryStylePrompt(category), nil
	}

	prompt, err := AnalyzeStyle(ctx, client, imgs, fmt.Sprintf("Focus on '%s' product material quality, useful detail crops, product structure, and clean white-background layout.", category))
	if err != nil {
		return FallbackCategoryStylePrompt(category), err
	}
	_ = saveStyleCache(cachePath, styleCacheEnvelope{Snapshot: snapshot, Prompt: prompt})
	return prompt, nil
}
