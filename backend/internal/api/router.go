package api

import (
	"log/slog"
	"net/http"
)

// NewRouter registers the API routes and wraps them with Recover, Logging and CORS (outermost first).
func NewRouter(h *Handler, logger *slog.Logger, corsOrigin string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/calculate", h.Calculate)
	mux.HandleFunc("GET /healthz", h.Health)

	return chain(mux, Recover(logger), Logging(logger), CORS(corsOrigin))
}

// chain applies middlewares so the first one is the outermost.
func chain(handler http.Handler, middlewares ...Middleware) http.Handler {
	for i := len(middlewares) - 1; i >= 0; i-- {
		handler = middlewares[i](handler)
	}
	return handler
}
