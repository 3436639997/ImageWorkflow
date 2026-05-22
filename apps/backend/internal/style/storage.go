package style

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// stylesFile represents the structure of styles.json.
type stylesFile struct {
	Styles []Style `json:"styles"`
}

// storage handles reading and writing styles.json with thread-safety.
type storage struct {
	mu   sync.RWMutex
	path string
}

func newStorage(workspaceRoot string) *storage {
	return &storage{
		path: filepath.Join(workspaceRoot, "styles", "styles.json"),
	}
}

// load reads styles.json. Returns empty slice if file doesn't exist.
func (s *storage) load() ([]Style, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return []Style{}, nil
		}
		return nil, fmt.Errorf("读取 styles.json 失败: %w", err)
	}

	var file stylesFile
	if err := json.Unmarshal(data, &file); err != nil {
		return nil, fmt.Errorf("解析 styles.json 失败: %w", err)
	}

	if file.Styles == nil {
		file.Styles = []Style{}
	}
	return file.Styles, nil
}

// save writes styles to styles.json.
func (s *storage) save(styles []Style) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Ensure directory exists
	dir := filepath.Dir(s.path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("创建 styles 目录失败: %w", err)
	}

	if styles == nil {
		styles = []Style{}
	}

	file := stylesFile{Styles: styles}
	data, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化 styles.json 失败: %w", err)
	}

	if err := os.WriteFile(s.path, data, 0o644); err != nil {
		return fmt.Errorf("写入 styles.json 失败: %w", err)
	}

	return nil
}
