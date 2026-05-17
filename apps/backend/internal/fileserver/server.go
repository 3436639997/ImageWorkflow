package fileserver

import (
	"fmt"
	"net"
	"net/http"
	"path/filepath"
	"strings"
	"sync"

	"ImageWorkflow/apps/backend/internal/workspace"
)

// Server hosts product/output image files over a local HTTP endpoint
// so the frontend can load them via <img src="http://127.0.0.1:<port>/...">.
type Server struct {
	mu       sync.Mutex
	port     int
	listener net.Listener
	server   *http.Server

	workspace *workspace.Resolver
}

func NewServer(ws *workspace.Resolver) *Server {
	return &Server{workspace: ws}
}

// Start opens a TCP listener on a random port and serves files from the
// configured directories. It returns the chosen port.
func (s *Server) Start() (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.server != nil {
		return s.port, nil
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, fmt.Errorf("无法启动文件服务: %w", err)
	}
	addr := listener.Addr().(*net.TCPAddr)

	mux := http.NewServeMux()
	mux.HandleFunc("/product/", s.handleSubpath(func() string { return s.workspace.ProductRoot() }, "/product/"))
	mux.HandleFunc("/output/", s.handleSubpath(func() string { return s.workspace.OutputRoot() }, "/output/"))

	server := &http.Server{Handler: mux}
	go func() {
		_ = server.Serve(listener)
	}()

	s.listener = listener
	s.server = server
	s.port = addr.Port
	return s.port, nil
}

func (s *Server) Port() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.port
}

func (s *Server) Stop() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.server == nil {
		return nil
	}
	err := s.server.Close()
	s.server = nil
	s.listener = nil
	s.port = 0
	return err
}

func (s *Server) handleSubpath(rootFn func() string, prefix string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Strip prefix and split into <id>/<filename>
		rel := strings.TrimPrefix(r.URL.Path, prefix)
		parts := strings.SplitN(rel, "/", 2)
		if len(parts) != 2 {
			http.Error(w, "invalid path", http.StatusBadRequest)
			return
		}
		id := strings.TrimSpace(parts[0])
		name := strings.TrimSpace(parts[1])
		if id == "" || name == "" {
			http.Error(w, "invalid path", http.StatusBadRequest)
			return
		}
		// Block path traversal.
		if strings.Contains(id, "..") || strings.Contains(name, "..") ||
			strings.ContainsAny(id, `/\`) || strings.ContainsAny(name, `/\`) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}

		filePath := filepath.Join(rootFn(), id, name)
		// Allow caching by mtime; frontend appends ?t=<mtime> for cache busting.
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Cache-Control", "public, max-age=600")
		http.ServeFile(w, r, filePath)
	}
}
