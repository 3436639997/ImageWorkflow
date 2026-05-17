package output

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"ImageWorkflow/apps/backend/internal/workspace"
)

var outputImageExts = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".webp": true,
}

type OutputFile struct {
	ID        string `json:"id"`
	Filename  string `json:"filename"`
	Kind      string `json:"kind"`
	Size      int64  `json:"size"`
	UpdatedAt string `json:"updatedAt"`
}

type Service struct {
	workspace *workspace.Resolver
}

func NewService(ws *workspace.Resolver) *Service {
	return &Service{workspace: ws}
}

func (s *Service) ListOutputs(productID string) ([]OutputFile, error) {
	folder := s.workspace.OutputFolder(productID)
	entries, err := os.ReadDir(folder)
	if err != nil {
		if os.IsNotExist(err) {
			return []OutputFile{}, nil
		}
		return nil, err
	}

	var files []OutputFile
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(entry.Name()))
		if !outputImageExts[ext] {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		files = append(files, OutputFile{
			ID:        productID + "/" + entry.Name(),
			Filename:  entry.Name(),
			Kind:      classifyOutput(entry.Name()),
			Size:      info.Size(),
			UpdatedAt: info.ModTime().Format(time.DateTime),
		})
	}

	sort.Slice(files, func(i, j int) bool {
		return files[i].Filename < files[j].Filename
	})

	if files == nil {
		files = []OutputFile{}
	}
	return files, nil
}

func classifyOutput(filename string) string {
	lower := strings.ToLower(filename)
	if lower == "main.png" || lower == "main.jpg" {
		return "main"
	}
	if strings.HasPrefix(lower, "sku_") {
		return "sku"
	}
	if strings.HasPrefix(lower, "detail_") {
		return "detail"
	}
	return "other"
}

// DeleteOutput removes <workspace>/output/<id>/<filename>. Path traversal is
// blocked. Returns nil if the file is already missing.
func (s *Service) DeleteOutput(productID, filename string) error {
	id := strings.TrimSpace(productID)
	name := strings.TrimSpace(filename)
	if id == "" || name == "" {
		return fmt.Errorf("product_id 和 filename 不能为空")
	}
	if strings.Contains(id, "..") || strings.ContainsAny(id, `/\`) ||
		strings.Contains(name, "..") || strings.ContainsAny(name, `/\`) {
		return fmt.Errorf("非法路径")
	}
	path := filepath.Join(s.workspace.OutputFolder(id), name)
	if _, err := os.Stat(path); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	return os.Remove(path)
}
