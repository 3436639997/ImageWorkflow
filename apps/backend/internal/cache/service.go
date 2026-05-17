package cache

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"ImageWorkflow/apps/backend/internal/workspace"
)

type CacheItem struct {
	Filename  string `json:"filename"`
	Group     string `json:"group"`
	Size      int64  `json:"size"`
	UpdatedAt string `json:"updatedAt"`
}

type Service struct {
	workspace *workspace.Resolver
}

func NewService(ws *workspace.Resolver) *Service {
	return &Service{workspace: ws}
}

func (s *Service) ListCaches() ([]CacheItem, error) {
	entries, err := os.ReadDir(s.workspace.CacheDir())
	if err != nil {
		if os.IsNotExist(err) {
			return []CacheItem{}, nil
		}
		return nil, err
	}

	var items []CacheItem
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(entry.Name()))
		if ext != ".json" {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		items = append(items, CacheItem{
			Filename:  entry.Name(),
			Group:     classifyCache(entry.Name()),
			Size:      info.Size(),
			UpdatedAt: info.ModTime().Format(time.DateTime),
		})
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].Filename < items[j].Filename
	})

	if items == nil {
		items = []CacheItem{}
	}
	return items, nil
}

func classifyCache(filename string) string {
	if filename == "sage_reference_global_style.json" {
		return "global_style"
	}
	if strings.HasPrefix(filename, "sage_reference_category_") {
		return "category_style"
	}
	if strings.HasPrefix(filename, "generation_plan_") {
		return "generation_plan"
	}
	return "other"
}

// ReadCacheFile returns the textual content of a cache file. Empty string is
// returned with a nil error when the file is missing.
func (s *Service) ReadCacheFile(filename string) (string, error) {
	name := strings.TrimSpace(filename)
	if name == "" || strings.Contains(name, "..") || strings.ContainsAny(name, `/\`) {
		return "", fmt.Errorf("非法的缓存文件名")
	}
	if !strings.HasSuffix(strings.ToLower(name), ".json") {
		return "", fmt.Errorf("仅支持读取 JSON 缓存")
	}
	path := filepath.Join(s.workspace.CacheDir(), name)
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	return string(data), nil
}

// PlanFor returns the content of generation_plan_<id>.json, or empty string.
func (s *Service) PlanFor(productID string) (string, error) {
	id := strings.ToLower(strings.TrimSpace(productID))
	if id == "" {
		return "", nil
	}
	safe := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			return r
		}
		return '_'
	}, id)
	parts := strings.FieldsFunc(safe, func(r rune) bool { return r == '_' })
	if len(parts) == 0 {
		return "", nil
	}
	name := "generation_plan_" + strings.Join(parts, "_") + ".json"
	return s.ReadCacheFile(name)
}

// validCacheName ensures the filename is safe and ends with .json.
func validCacheName(name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("缓存文件名不能为空")
	}
	if strings.Contains(name, "..") || strings.ContainsAny(name, `/\`) {
		return fmt.Errorf("非法的缓存文件名")
	}
	if !strings.HasSuffix(strings.ToLower(name), ".json") {
		return fmt.Errorf("仅支持 .json 缓存")
	}
	return nil
}

// ClearCaches deletes the given cache files. Returns the names that were
// actually removed; missing files are skipped silently.
func (s *Service) ClearCaches(filenames []string) ([]string, error) {
	cleared := []string{}
	for _, raw := range filenames {
		name := strings.TrimSpace(raw)
		if err := validCacheName(name); err != nil {
			continue
		}
		path := filepath.Join(s.workspace.CacheDir(), name)
		if err := os.Remove(path); err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return cleared, err
		}
		cleared = append(cleared, name)
	}
	return cleared, nil
}

// ClearGroup deletes every cache file belonging to the given group.
func (s *Service) ClearGroup(group string) ([]string, error) {
	items, err := s.ListCaches()
	if err != nil {
		return nil, err
	}
	want := strings.TrimSpace(group)
	names := make([]string, 0, len(items))
	for _, item := range items {
		if want == "" || item.Group == want {
			names = append(names, item.Filename)
		}
	}
	return s.ClearCaches(names)
}

// WriteCacheFile validates that `content` is JSON and writes it to the named
// cache file (atomic replace via temp + rename).
func (s *Service) WriteCacheFile(filename, content string) error {
	if err := validCacheName(filename); err != nil {
		return err
	}
	if !json.Valid([]byte(content)) {
		return fmt.Errorf("不是合法的 JSON")
	}
	if err := os.MkdirAll(s.workspace.CacheDir(), 0o755); err != nil {
		return err
	}
	dest := filepath.Join(s.workspace.CacheDir(), filename)
	tmp := dest + ".tmp"
	if err := os.WriteFile(tmp, []byte(content), 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, dest)
}

// CacheFilePath returns the absolute path of the named cache file. Returns
// an error for missing files or unsafe names.
func (s *Service) CacheFilePath(filename string) (string, error) {
	if err := validCacheName(filename); err != nil {
		return "", err
	}
	path := filepath.Join(s.workspace.CacheDir(), filename)
	if _, err := os.Stat(path); err != nil {
		return "", err
	}
	return path, nil
}
