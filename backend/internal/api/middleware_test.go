package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type httpHandlerFunc = http.HandlerFunc

func newPost(body string) *http.Request {
	req := httptest.NewRequest(http.MethodPost, calculatePath, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	return req
}

func serve(h http.Handler, req *http.Request) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestCORS(t *testing.T) {
	const origin = "http://localhost:5173"
	nextCalled := false
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		nextCalled = true
		w.WriteHeader(http.StatusTeapot)
	})
	h := CORS(origin)(next)

	tests := []struct {
		name         string
		method       string
		wantStatus   int
		wantNextCall bool
	}{
		{name: "preflight short-circuits", method: http.MethodOptions, wantStatus: http.StatusNoContent, wantNextCall: false},
		{name: "POST passes through", method: http.MethodPost, wantStatus: http.StatusTeapot, wantNextCall: true},
		{name: "GET passes through", method: http.MethodGet, wantStatus: http.StatusTeapot, wantNextCall: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			nextCalled = false
			req := httptest.NewRequest(tt.method, calculatePath, nil)
			req.Header.Set("Origin", origin)
			rec := serve(h, req)

			if rec.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			if nextCalled != tt.wantNextCall {
				t.Errorf("next called = %v, want %v", nextCalled, tt.wantNextCall)
			}
			wantHeaders := map[string]string{
				"Access-Control-Allow-Origin":  origin,
				"Access-Control-Allow-Methods": "POST, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type",
				"Vary":                         "Origin",
			}
			for key, want := range wantHeaders {
				if got := rec.Header().Get(key); got != want {
					t.Errorf("%s = %q, want %q", key, got, want)
				}
			}
		})
	}
}

func TestCORSUsesConfiguredOriginOnly(t *testing.T) {
	h := CORS("https://app.example.com")(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	req := httptest.NewRequest(http.MethodPost, calculatePath, nil)
	req.Header.Set("Origin", "https://evil.example.com")

	rec := serve(h, req)
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://app.example.com" {
		t.Errorf("Access-Control-Allow-Origin = %q, want the configured origin (not reflected)", got)
	}
}

func TestCORSPreflightThroughRouter(t *testing.T) {
	req := httptest.NewRequest(http.MethodOptions, calculatePath, nil)
	req.Header.Set("Origin", "http://localhost:5173")
	req.Header.Set("Access-Control-Request-Method", http.MethodPost)

	rec := serve(newTestRouter(), req)
	if rec.Code != http.StatusNoContent {
		t.Errorf("status = %d, want 204", rec.Code)
	}
	if rec.Body.Len() != 0 {
		t.Errorf("preflight body = %q, want empty", rec.Body.String())
	}
}

func TestCORSHeadersOnErrorResponses(t *testing.T) {
	rec := serve(newTestRouter(), newPost(`{`))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") == "" {
		t.Error("error responses must include CORS headers so the browser can read them")
	}
}

func TestRecover(t *testing.T) {
	logger, logs := newTestLogger()
	panicking := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("kaboom") })

	rec := serve(Recover(logger)(panicking), newPost(""))
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	assertJSONContentType(t, rec)
	if got := decodeError(t, rec); got.Code != codeInternalError || strings.Contains(got.Message, "kaboom") {
		t.Errorf("error body = %+v, want INTERNAL_ERROR without panic details", got)
	}
	out := logs.String()
	if !strings.Contains(out, "panic recovered") || !strings.Contains(out, "kaboom") {
		t.Errorf("panic was not logged with its value: %s", out)
	}
	if !strings.Contains(out, "stack") {
		t.Error("panic log entry is missing the stack trace")
	}
}

func TestRecoverPassesThroughWithoutPanic(t *testing.T) {
	logger, logs := newTestLogger()
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusAccepted) })

	rec := serve(Recover(logger)(ok), newPost(""))
	if rec.Code != http.StatusAccepted {
		t.Errorf("status = %d, want 202", rec.Code)
	}
	if logs.String() != "" {
		t.Errorf("unexpected log output: %s", logs.String())
	}
}

func TestLogging(t *testing.T) {
	tests := []struct {
		name       string
		handler    http.HandlerFunc
		wantStatus float64
	}{
		{
			name:       "explicit status",
			handler:    func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusUnprocessableEntity) },
			wantStatus: http.StatusUnprocessableEntity,
		},
		{
			name:       "implicit 200 when WriteHeader is not called",
			handler:    func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("ok")) },
			wantStatus: http.StatusOK,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			logger, logs := newTestLogger()
			rec := serve(Logging(logger)(tt.handler), newPost(""))

			if float64(rec.Code) != tt.wantStatus {
				t.Errorf("response status = %d, want %v (recorder must forward the status)", rec.Code, tt.wantStatus)
			}
			var entry map[string]any
			if err := json.Unmarshal([]byte(logs.String()), &entry); err != nil {
				t.Fatalf("expected exactly one JSON log line, got %q: %v", logs.String(), err)
			}
			if entry["msg"] != "request" || entry["method"] != http.MethodPost || entry["path"] != calculatePath {
				t.Errorf("unexpected log entry: %v", entry)
			}
			if entry["status"] != tt.wantStatus {
				t.Errorf("logged status = %v, want %v", entry["status"], tt.wantStatus)
			}
			if _, ok := entry["duration"]; !ok {
				t.Error("log entry is missing duration")
			}
		})
	}
}

func TestRouterRecoversPanicsInsideLoggingAndCORS(t *testing.T) {
	logger, logs := newTestLogger()
	h := chain(
		http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("deep") }),
		Recover(logger), Logging(logger), CORS("*"),
	)

	rec := serve(h, newPost(""))
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	if !strings.Contains(logs.String(), "panic recovered") {
		t.Error("expected the outermost Recover to catch the panic")
	}
}

func TestChainOrder(t *testing.T) {
	var order []string
	mark := func(name string) Middleware {
		return func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				order = append(order, name)
				next.ServeHTTP(w, r)
			})
		}
	}
	h := chain(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { order = append(order, "handler") }),
		mark("first"), mark("second"), mark("third"))

	serve(h, newPost(""))
	if got := strings.Join(order, ","); got != "first,second,third,handler" {
		t.Errorf("order = %s, want first,second,third,handler", got)
	}
}
