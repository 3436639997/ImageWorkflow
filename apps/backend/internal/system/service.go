package system

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"ImageWorkflow/apps/backend/internal/fileserver"
	"ImageWorkflow/apps/backend/internal/workspace"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type Service struct {
	ctx        context.Context
	fileServer *fileserver.Server
	workspace  *workspace.Resolver
}

type RuntimeInfo struct {
	GoVersion      string `json:"goVersion"`
	GOOS           string `json:"goos"`
	GOARCH         string `json:"goarch"`
	FileServerPort int    `json:"fileServerPort"`
}

func NewService(fs *fileserver.Server, ws *workspace.Resolver) *Service {
	return &Service{fileServer: fs, workspace: ws}
}

// SetContext is called from App.startup so we can use Wails runtime helpers.
func (s *Service) SetContext(ctx context.Context) {
	s.ctx = ctx
}

func (s *Service) RuntimeInfo() RuntimeInfo {
	port := 0
	if s.fileServer != nil {
		port = s.fileServer.Port()
	}
	return RuntimeInfo{
		GoVersion:      runtime.Version(),
		GOOS:           runtime.GOOS,
		GOARCH:         runtime.GOARCH,
		FileServerPort: port,
	}
}

func (s *Service) GetFileServerPort() int {
	if s.fileServer == nil {
		return 0
	}
	return s.fileServer.Port()
}

// OpenImageFiles shows a native multi-select file dialog and returns the
// absolute paths chosen by the user.
func (s *Service) OpenImageFiles() ([]string, error) {
	if s.ctx == nil {
		return []string{}, nil
	}
	paths, err := wruntime.OpenMultipleFilesDialog(s.ctx, wruntime.OpenDialogOptions{
		Title: "选择产品图片",
		Filters: []wruntime.FileFilter{
			{
				DisplayName: "图片 (*.jpg;*.jpeg;*.png;*.webp;*.bmp)",
				Pattern:     "*.jpg;*.jpeg;*.png;*.webp;*.bmp",
			},
		},
	})
	if err != nil {
		return nil, err
	}
	if paths == nil {
		paths = []string{}
	}
	return paths, nil
}

// PickDirectory shows a native folder picker dialog and returns the chosen
// absolute path (empty string if user cancels).
func (s *Service) PickDirectory(title string) (string, error) {
	if s.ctx == nil {
		return "", nil
	}
	if strings.TrimSpace(title) == "" {
		title = "选择目录"
	}
	return wruntime.OpenDirectoryDialog(s.ctx, wruntime.OpenDialogOptions{
		Title: title,
	})
}

// OpenProductFolder opens <workspace>/new_products/<id> in the system file
// manager. Creates the directory if missing.
func (s *Service) OpenProductFolder(productID string) error {
	id := strings.TrimSpace(productID)
	if id == "" {
		return fmt.Errorf("product_id is required")
	}
	if s.workspace == nil {
		return fmt.Errorf("workspace not initialized")
	}
	return s.OpenInFileManager(s.workspace.ProductFolder(id))
}

// OpenOutputFolder opens <workspace>/output/<id> in the system file manager.
func (s *Service) OpenOutputFolder(productID string) error {
	id := strings.TrimSpace(productID)
	if id == "" {
		return fmt.Errorf("product_id is required")
	}
	if s.workspace == nil {
		return fmt.Errorf("workspace not initialized")
	}
	return s.OpenInFileManager(s.workspace.OutputFolder(id))
}

// OpenWorkspace opens the current workspace root in the system file manager.
func (s *Service) OpenWorkspace() error {
	if s.workspace == nil {
		return fmt.Errorf("workspace not initialized")
	}
	return s.OpenInFileManager(s.workspace.Root())
}

// OpenInFileManager opens the given path in the system file manager.
// If the directory does not exist, it is created first.
// Path is resolved against the current working directory.
func (s *Service) OpenInFileManager(path string) error {
	path = strings.TrimSpace(path)
	if path == "" {
		return fmt.Errorf("路径不能为空")
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return fmt.Errorf("路径解析失败: %w", err)
	}

	info, err := os.Stat(abs)
	if err != nil {
		if !os.IsNotExist(err) {
			return err
		}
		if err := os.MkdirAll(abs, 0o755); err != nil {
			return fmt.Errorf("创建目录失败: %w", err)
		}
		info, err = os.Stat(abs)
		if err != nil {
			return err
		}
	}
	if !info.IsDir() {
		abs = filepath.Dir(abs)
	}

	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("explorer", abs)
	case "darwin":
		cmd = exec.Command("open", abs)
	default:
		cmd = exec.Command("xdg-open", abs)
	}
	// `explorer` returns exit code 1 even on success; ignore non-fatal errors
	// from Start, only error on actual launch failure.
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("启动文件管理器失败: %w", err)
	}
	return nil
}

// OpenInEditor opens the given file with the OS-default associated editor.
// Same dispatch as OpenInFileManager but expects a file path; the OS will
// route .json to the user's preferred editor (VS Code, Notepad, etc.).
func (s *Service) OpenInEditor(path string) error {
	path = strings.TrimSpace(path)
	if path == "" {
		return fmt.Errorf("路径不能为空")
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return fmt.Errorf("路径解析失败: %w", err)
	}
	if _, err := os.Stat(abs); err != nil {
		return fmt.Errorf("文件不存在: %s", abs)
	}

	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		// "" is a placeholder for the window title required by `start`.
		cmd = exec.Command("cmd", "/c", "start", "", abs)
	case "darwin":
		cmd = exec.Command("open", abs)
	default:
		cmd = exec.Command("xdg-open", abs)
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("启动编辑器失败: %w", err)
	}
	return nil
}
