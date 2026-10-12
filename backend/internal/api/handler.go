// Package api exposes the calculator over HTTP.
package api

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"

	"github.com/dante0416/calculator/backend/internal/calculator"
)

const maxBodyBytes = 1 << 20

// CalculateFunc computes op over a and b. It is injected so the handler can be tested in isolation.
type CalculateFunc func(op calculator.Operation, a, b float64) (float64, error)

// Handler serves the calculator HTTP endpoints.
type Handler struct {
	calculate CalculateFunc
	logger    *slog.Logger
}

// NewHandler builds a Handler with the given calculation function and logger.
func NewHandler(calculate CalculateFunc, logger *slog.Logger) *Handler {
	return &Handler{calculate: calculate, logger: logger}
}

// Calculate handles POST /api/v1/calculate.
func (h *Handler) Calculate(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)

	req, err := decodeRequest(r.Body)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, codeInvalidJSON, messageInvalidJSON)
		return
	}

	op, err := calculator.ParseOperation(req.Operation)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, codeUnknownOperation, messageUnknownOperation)
		return
	}

	a, b, ok := operands(req, op)
	if !ok {
		h.writeError(w, http.StatusBadRequest, codeMissingOperand, messageMissingOperand)
		return
	}

	result, err := h.calculate(op, a, b)
	if err != nil {
		status, code, message := mapDomainError(err)
		if status == http.StatusInternalServerError {
			h.logger.Error("calculation failed", "error", err)
		}
		h.writeError(w, status, code, message)
		return
	}

	h.writeJSON(w, http.StatusOK, calculateResponse{Result: result})
}

// Health handles GET /healthz.
func (h *Handler) Health(w http.ResponseWriter, _ *http.Request) {
	h.writeJSON(w, http.StatusOK, healthResponse{Status: "ok"})
}

func decodeRequest(body io.Reader) (calculateRequest, error) {
	var req calculateRequest
	dec := json.NewDecoder(body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		return calculateRequest{}, err
	}
	var extra json.RawMessage
	if err := dec.Decode(&extra); !errors.Is(err, io.EOF) {
		return calculateRequest{}, errors.New("unexpected content after JSON body")
	}
	return req, nil
}

func operands(req calculateRequest, op calculator.Operation) (a, b float64, ok bool) {
	if req.A == nil {
		return 0, 0, false
	}
	if op.IsUnary() {
		return *req.A, 0, true
	}
	if req.B == nil {
		return 0, 0, false
	}
	return *req.A, *req.B, true
}

func (h *Handler) writeJSON(w http.ResponseWriter, status int, v any) {
	writeJSON(w, status, v, h.logger)
}

func (h *Handler) writeError(w http.ResponseWriter, status int, code, message string) {
	writeError(w, status, code, message, h.logger)
}

func writeJSON(w http.ResponseWriter, status int, v any, logger *slog.Logger) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		logger.Error("failed to encode response", "error", err)
	}
}

func writeError(w http.ResponseWriter, status int, code, message string, logger *slog.Logger) {
	writeJSON(w, status, errorResponse{Error: errorBody{Code: code, Message: message}}, logger)
}
