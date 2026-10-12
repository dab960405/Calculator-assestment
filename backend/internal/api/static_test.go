package api

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/dante0416/calculator/backend/internal/calculator"
)

const indexHTML = "<!doctype html><title>calc</title>"

func writeFile(t *testing.T, dir, name, content string) {
	t.Helper()
	full := filepath.Join(dir, filepath.FromSlash(name))
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func newStaticSite(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	writeFile(t, dir, "index.html", indexHTML)
	writeFile(t, dir, "assets/index-abc123.js", "console.log('app')")
	writeFile(t, dir, "favicon.svg", "<svg/>")
	return dir
}

// apiStub records whether the API handler was reached.
type apiStub struct{ called bool }

func (s *apiStub) ServeHTTP(w http.ResponseWriter, _ *http.Request) {
	s.called = true
	w.WriteHeader(http.StatusTeapot)
}

func serveStatic(h http.Handler, method, target string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, target, nil))
	return rec
}

func TestWithStaticServesFiles(t *testing.T) {
	h := WithStatic(&apiStub{}, newStaticSite(t))

	tests := []struct {
		name, target, wantBody, wantCache string
	}{
		{"root serves index", "/", indexHTML, cacheNoCache},
		{"hashed asset is immutable", "/assets/index-abc123.js", "console.log('app')", cacheImmutable},
		{"top-level file has no forced cache", "/favicon.svg", "<svg/>", ""},
		{"unknown route falls back to index", "/some/client/route", indexHTML, cacheNoCache},
		{"directory falls back to index", "/assets/", indexHTML, cacheNoCache},
		{"traversal stays inside dir", "/../../etc/passwd", indexHTML, cacheNoCache},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := serveStatic(h, http.MethodGet, tt.target)
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200", rec.Code)
			}
			if got := rec.Body.String(); got != tt.wantBody {
				t.Errorf("body = %q, want %q", got, tt.wantBody)
			}
			if got := rec.Header().Get("Cache-Control"); got != tt.wantCache {
				t.Errorf("Cache-Control = %q, want %q", got, tt.wantCache)
			}
		})
	}
}

func TestWithStaticIndexContentType(t *testing.T) {
	rec := serveStatic(WithStatic(&apiStub{}, newStaticSite(t)), http.MethodGet, "/")
	if got := rec.Header().Get("Content-Type"); !strings.HasPrefix(got, "text/html") {
		t.Errorf("Content-Type = %q, want text/html", got)
	}
}

func TestWithStaticHeadHasNoBody(t *testing.T) {
	rec := serveStatic(WithStatic(&apiStub{}, newStaticSite(t)), http.MethodHead, "/")
	if rec.Code != http.StatusOK || rec.Body.Len() != 0 {
		t.Errorf("HEAD / = %d with %d body bytes, want 200 and empty body", rec.Code, rec.Body.Len())
	}
}

func TestWithStaticMissingFileWithExtensionIs404(t *testing.T) {
	rec := serveStatic(WithStatic(&apiStub{}, newStaticSite(t)), http.MethodGet, "/assets/missing.js")
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", rec.Code)
	}
}

func TestWithStaticRejectsWriteMethods(t *testing.T) {
	stub := &apiStub{}
	rec := serveStatic(WithStatic(stub, newStaticSite(t)), http.MethodPost, "/")
	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", rec.Code)
	}
	if got := rec.Header().Get("Allow"); got != "GET, HEAD" {
		t.Errorf("Allow = %q, want %q", got, "GET, HEAD")
	}
	if stub.called {
		t.Error("API handler should not be called for non-API paths")
	}
}

func TestWithStaticDelegatesAPIPaths(t *testing.T) {
	for _, target := range []string{"/api", "/api/v1/calculate", "/api/v2/unknown", "/healthz"} {
		for _, method := range []string{http.MethodGet, http.MethodPost} {
			t.Run(method+" "+target, func(t *testing.T) {
				stub := &apiStub{}
				rec := serveStatic(WithStatic(stub, newStaticSite(t)), method, target)
				if !stub.called || rec.Code != http.StatusTeapot {
					t.Errorf("API handler not reached (called=%v, status=%d)", stub.called, rec.Code)
				}
			})
		}
	}
}

func TestWithStaticKeepsRealAPIContract(t *testing.T) {
	router := NewRouter(NewHandler(calculator.Calculate, discardLogger()), discardLogger(), "http://localhost:5173")
	h := WithStatic(router, newStaticSite(t))

	rec := doRequest(t, h, http.MethodPost, "/api/v1/calculate", `{"operation":"add","a":2,"b":3}`)
	if rec.Code != http.StatusOK || decodeResult(t, rec) != 5 {
		t.Errorf("POST calculate = %d %s, want 200 with result 5", rec.Code, rec.Body)
	}
	if rec := serveStatic(h, http.MethodGet, "/api/v1/calculate"); rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("GET calculate = %d, want 405 from the API mux, not the SPA fallback", rec.Code)
	}
	if rec := serveStatic(h, http.MethodGet, "/api/v1/nope"); rec.Code != http.StatusNotFound {
		t.Errorf("GET unknown API path = %d, want 404", rec.Code)
	}
}

func TestWithStaticWithoutIndexIs404(t *testing.T) {
	dir := t.TempDir()
	rec := serveStatic(WithStatic(&apiStub{}, dir), http.MethodGet, "/")
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", rec.Code)
	}
}

func TestWithStaticIndexIsDirectoryIs404(t *testing.T) {
	dir := t.TempDir()
	if err := os.Mkdir(filepath.Join(dir, "index.html"), 0o755); err != nil {
		t.Fatal(err)
	}
	rec := serveStatic(WithStatic(&apiStub{}, dir), http.MethodGet, "/")
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", rec.Code)
	}
}
