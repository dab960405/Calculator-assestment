package api

import (
	"net/http"
	"path"
	"strings"
)

const (
	cacheImmutable = "public, max-age=31536000, immutable"
	cacheNoCache   = "no-cache"
)

// WithStatic serves the built frontend from dir for every path outside the API and
// delegates /api/* and /healthz to apiHandler unchanged, so API status codes (including
// the mux's 404/405) are not masked by the SPA fallback.
//
// Existing files are served as-is; Vite's hashed files under /assets/ are cached forever.
// Unknown extensionless paths fall back to index.html; unknown paths with an extension
// return 404 so a missing script is not answered with HTML.
func WithStatic(apiHandler http.Handler, dir string) http.Handler {
	root := http.Dir(dir)
	files := http.FileServer(root)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isAPIPath(r.URL.Path) {
			apiHandler.ServeHTTP(w, r)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
			return
		}

		clean := path.Clean("/" + r.URL.Path)
		if clean != "/" && isFile(root, clean) {
			if strings.HasPrefix(clean, "/assets/") {
				w.Header().Set("Cache-Control", cacheImmutable)
			}
			files.ServeHTTP(w, r)
			return
		}
		if path.Ext(clean) != "" {
			http.NotFound(w, r)
			return
		}

		w.Header().Set("Cache-Control", cacheNoCache)
		serveIndex(w, r, root)
	})
}

func isAPIPath(p string) bool {
	return p == "/healthz" || p == "/api" || strings.HasPrefix(p, "/api/")
}

func isFile(root http.FileSystem, name string) bool {
	f, err := root.Open(name)
	if err != nil {
		return false
	}
	defer f.Close()
	info, err := f.Stat()
	return err == nil && !info.IsDir()
}

func serveIndex(w http.ResponseWriter, r *http.Request, root http.FileSystem) {
	f, err := root.Open("/index.html")
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}
	http.ServeContent(w, r, "index.html", info.ModTime(), f)
}
