package workspace

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

const (
	subProducts = "new_products"
	subOutput   = "output"
	subCache    = "cache"
	subLogs     = "logs"
	manifest    = "product_manifest.xlsx"

	// DefaultDirName is created under the user's Documents folder when no
	// custom workspace has been configured.
	DefaultDirName = "ImageWorkflow"
)

// Resolver owns the absolute path of the current workspace and exposes
// helpers for computing paths to sub-directories. All methods are safe for
// concurrent use.
type Resolver struct {
	mu   sync.RWMutex
	root string
}

// NewResolver returns a resolver pre-populated with the default workspace
// path. The directory is NOT created until SetRoot or EnsureRoot is called.
func NewResolver() *Resolver {
	return &Resolver{root: DefaultRoot()}
}

// DefaultRoot returns the platform-default workspace path,
// `<UserHome>/Documents/ImageWorkflow`. Falls back to the current directory
// if the home directory cannot be determined.
func DefaultRoot() string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		// last-resort: current working directory
		cwd, _ := os.Getwd()
		return filepath.Join(cwd, DefaultDirName)
	}
	return filepath.Join(home, "Documents", DefaultDirName)
}

// Root returns the current workspace root (absolute).
func (r *Resolver) Root() string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.root
}

// SetRoot updates the workspace root. Empty input falls back to DefaultRoot().
// The path must be absolute (or absolutifiable) and writable; the function
// creates the root and standard sub-directories if missing.
func (r *Resolver) SetRoot(path string) error {
	clean := strings.TrimSpace(path)
	if clean == "" {
		clean = DefaultRoot()
	}
	abs, err := filepath.Abs(clean)
	if err != nil {
		return fmt.Errorf("无法解析路径: %w", err)
	}
	if err := r.ensureDir(abs); err != nil {
		return err
	}

	r.mu.Lock()
	r.root = abs
	r.mu.Unlock()
	return r.ensureSubdirs()
}

// EnsureRoot creates the current root and its sub-directories. It is safe
// to call multiple times.
func (r *Resolver) EnsureRoot() error {
	root := r.Root()
	if err := r.ensureDir(root); err != nil {
		return err
	}
	return r.ensureSubdirs()
}

func (r *Resolver) ensureDir(path string) error {
	if err := os.MkdirAll(path, 0o755); err != nil {
		return fmt.Errorf("创建目录失败: %w", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return fmt.Errorf("不是目录: %s", path)
	}
	return nil
}

func (r *Resolver) ensureSubdirs() error {
	for _, sub := range []string{subProducts, subOutput, subCache, subLogs} {
		if err := os.MkdirAll(r.subdir(sub), 0o755); err != nil {
			return fmt.Errorf("创建子目录 %s 失败: %w", sub, err)
		}
	}
	return nil
}

// ProductRoot returns <workspace>/new_products.
func (r *Resolver) ProductRoot() string { return r.subdir(subProducts) }

// ProductFolder returns <workspace>/new_products/<id>.
func (r *Resolver) ProductFolder(id string) string {
	return filepath.Join(r.ProductRoot(), id)
}

// OutputRoot returns <workspace>/output.
func (r *Resolver) OutputRoot() string { return r.subdir(subOutput) }

// OutputFolder returns <workspace>/output/<id>.
func (r *Resolver) OutputFolder(id string) string {
	return filepath.Join(r.OutputRoot(), id)
}

// CacheDir returns <workspace>/cache.
func (r *Resolver) CacheDir() string { return r.subdir(subCache) }

// LogsDir returns <workspace>/logs.
func (r *Resolver) LogsDir() string { return r.subdir(subLogs) }

// JobsFile returns <workspace>/jobs.json.
func (r *Resolver) JobsFile() string {
	return filepath.Join(r.Root(), "jobs.json")
}

// ManifestPath returns <workspace>/product_manifest.xlsx.
func (r *Resolver) ManifestPath() string {
	return filepath.Join(r.Root(), manifest)
}

func (r *Resolver) subdir(name string) string {
	return filepath.Join(r.Root(), name)
}
