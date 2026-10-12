package api

import (
	"errors"
	"fmt"
	"math"
	"net/http"
	"strings"
	"testing"

	"github.com/dante0416/calculator/backend/internal/calculator"
)

const calculatePath = "/api/v1/calculate"

func newTestRouter() http.Handler {
	logger := discardLogger()
	return NewRouter(NewHandler(calculator.Calculate, logger), logger, "http://localhost:5173")
}

func TestCalculateSuccess(t *testing.T) {
	tests := []struct {
		name string
		body string
		want float64
	}{
		{name: "add", body: `{"operation":"add","a":2,"b":3}`, want: 5},
		{name: "subtract", body: `{"operation":"subtract","a":2,"b":3}`, want: -1},
		{name: "multiply", body: `{"operation":"multiply","a":-4,"b":2.5}`, want: -10},
		{name: "divide", body: `{"operation":"divide","a":10,"b":4}`, want: 2.5},
		{name: "power", body: `{"operation":"power","a":2,"b":8}`, want: 256},
		{name: "sqrt without b", body: `{"operation":"sqrt","a":9}`, want: 3},
		{name: "sqrt ignores b", body: `{"operation":"sqrt","a":16,"b":-1}`, want: 4},
		{name: "percentage", body: `{"operation":"percentage","a":15,"b":200}`, want: 30},
		{name: "zero operands are present", body: `{"operation":"add","a":0,"b":0}`, want: 0},
		{name: "scientific notation", body: `{"operation":"multiply","a":1e3,"b":2E-1}`, want: 200},
		{name: "fields in any order", body: `{"b":1,"a":2,"operation":"subtract"}`, want: 1},
		{name: "trailing whitespace", body: "{\"operation\":\"add\",\"a\":1,\"b\":1}\n  \t", want: 2},
	}

	router := newTestRouter()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := doRequest(t, router, http.MethodPost, calculatePath, tt.body)
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200 (body %q)", rec.Code, rec.Body.String())
			}
			assertJSONContentType(t, rec)
			if got := decodeResult(t, rec); got != tt.want {
				t.Errorf("result = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCalculateFloatPrecision(t *testing.T) {
	rec := doRequest(t, newTestRouter(), http.MethodPost, calculatePath, `{"operation":"add","a":0.1,"b":0.2}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	// The API returns the raw IEEE-754 sum; rounding for display is the frontend's job.
	// Variables are used because Go folds the constant expression 0.1+0.2 exactly to 0.3.
	a, b := 0.1, 0.2
	if got, want := decodeResult(t, rec), a+b; got != want {
		t.Errorf("result = %v, want %v", got, want)
	}
}

func TestCalculateClientErrors(t *testing.T) {
	tests := []struct {
		name     string
		body     string
		status   int
		wantCode string
	}{
		{name: "empty body", body: "", status: http.StatusBadRequest, wantCode: codeInvalidJSON},
		{name: "whitespace body", body: "   ", status: http.StatusBadRequest, wantCode: codeInvalidJSON},
		{name: "malformed JSON", body: `{`, status: http.StatusBadRequest, wantCode: codeInvalidJSON},
		{name: "not an object", body: `[1,2]`, status: http.StatusBadRequest, wantCode: codeInvalidJSON},
		{name: "null literal", body: `null`, status: http.StatusBadRequest, wantCode: codeUnknownOperation},
		{name: "a as string", body: `{"operation":"add","a":"1","b":2}`, status: http.StatusBadRequest, wantCode: codeInvalidJSON},
		{name: "b as bool", body: `{"operation":"add","a":1,"b":true}`, status: http.StatusBadRequest, wantCode: codeInvalidJSON},
		{name: "operation as number", body: `{"operation":1,"a":1,"b":2}`, status: http.StatusBadRequest, wantCode: codeInvalidJSON},
		{name: "unknown field", body: `{"operation":"add","a":1,"b":2,"extra":true}`, status: http.StatusBadRequest, wantCode: codeInvalidJSON},
		{name: "two JSON values", body: `{"operation":"add","a":1,"b":2}{}`, status: http.StatusBadRequest, wantCode: codeInvalidJSON},
		{name: "trailing garbage", body: `{"operation":"add","a":1,"b":2} x`, status: http.StatusBadRequest, wantCode: codeInvalidJSON},
		{name: "number out of float64 range", body: `{"operation":"add","a":1e400,"b":2}`, status: http.StatusBadRequest, wantCode: codeInvalidJSON},
		{name: "missing operation", body: `{"a":1,"b":2}`, status: http.StatusBadRequest, wantCode: codeUnknownOperation},
		{name: "unknown operation", body: `{"operation":"modulo","a":1,"b":2}`, status: http.StatusBadRequest, wantCode: codeUnknownOperation},
		{name: "missing a", body: `{"operation":"add","b":2}`, status: http.StatusBadRequest, wantCode: codeMissingOperand},
		{name: "missing b", body: `{"operation":"add","a":1}`, status: http.StatusBadRequest, wantCode: codeMissingOperand},
		{name: "null a", body: `{"operation":"add","a":null,"b":2}`, status: http.StatusBadRequest, wantCode: codeMissingOperand},
		{name: "sqrt missing a", body: `{"operation":"sqrt"}`, status: http.StatusBadRequest, wantCode: codeMissingOperand},
		{name: "division by zero", body: `{"operation":"divide","a":1,"b":0}`, status: http.StatusUnprocessableEntity, wantCode: codeDivisionByZero},
		{name: "negative sqrt", body: `{"operation":"sqrt","a":-4}`, status: http.StatusUnprocessableEntity, wantCode: codeNegativeSqrt},
		{name: "infinite result", body: `{"operation":"power","a":0,"b":-1}`, status: http.StatusUnprocessableEntity, wantCode: codeInvalidResult},
		{name: "NaN result", body: `{"operation":"power","a":-8,"b":0.5}`, status: http.StatusUnprocessableEntity, wantCode: codeInvalidResult},
		{name: "overflow result", body: `{"operation":"multiply","a":1e200,"b":1e200}`, status: http.StatusUnprocessableEntity, wantCode: codeInvalidResult},
	}

	router := newTestRouter()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := doRequest(t, router, http.MethodPost, calculatePath, tt.body)
			if rec.Code != tt.status {
				t.Fatalf("status = %d, want %d (body %q)", rec.Code, tt.status, rec.Body.String())
			}
			assertJSONContentType(t, rec)
			if got := decodeError(t, rec); got.Code != tt.wantCode {
				t.Errorf("code = %q, want %q", got.Code, tt.wantCode)
			}
		})
	}
}

func TestCalculateBodyTooLarge(t *testing.T) {
	padding := strings.Repeat(" ", maxBodyBytes)
	body := `{"operation":"add","a":1,"b":2}` + padding

	rec := doRequest(t, newTestRouter(), http.MethodPost, calculatePath, body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if got := decodeError(t, rec); got.Code != codeInvalidJSON {
		t.Errorf("code = %q, want %q", got.Code, codeInvalidJSON)
	}
}

func TestCalculateBodyJustUnderLimit(t *testing.T) {
	payload := `{"operation":"add","a":1,"b":2}`
	body := payload + strings.Repeat(" ", maxBodyBytes-len(payload))

	rec := doRequest(t, newTestRouter(), http.MethodPost, calculatePath, body)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 for a body of exactly %d bytes", rec.Code, maxBodyBytes)
	}
}

func TestCalculateAcceptsAnyRequestContentType(t *testing.T) {
	router := newTestRouter()
	for _, ct := range []string{"", "text/plain", "application/json; charset=utf-8"} {
		t.Run(fmt.Sprintf("content-type=%q", ct), func(t *testing.T) {
			req := newPost(`{"operation":"add","a":1,"b":2}`)
			if ct == "" {
				req.Header.Del("Content-Type")
			} else {
				req.Header.Set("Content-Type", ct)
			}
			rec := serve(router, req)
			if rec.Code != http.StatusOK {
				t.Errorf("status = %d, want 200", rec.Code)
			}
		})
	}
}

func TestMethodNotAllowed(t *testing.T) {
	router := newTestRouter()
	for _, method := range []string{http.MethodGet, http.MethodPut, http.MethodDelete, http.MethodPatch} {
		t.Run(method, func(t *testing.T) {
			rec := doRequest(t, router, method, calculatePath, "")
			if rec.Code != http.StatusMethodNotAllowed {
				t.Fatalf("status = %d, want 405", rec.Code)
			}
			if got := rec.Header().Get("Allow"); !strings.Contains(got, http.MethodPost) {
				t.Errorf("Allow = %q, want it to list POST", got)
			}
		})
	}
}

func TestUnknownRoute(t *testing.T) {
	rec := doRequest(t, newTestRouter(), http.MethodPost, "/api/v1/unknown", `{}`)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", rec.Code)
	}
}

func TestHealth(t *testing.T) {
	router := newTestRouter()

	rec := doRequest(t, router, http.MethodGet, "/healthz", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	assertJSONContentType(t, rec)
	if got := strings.TrimSpace(rec.Body.String()); got != `{"status":"ok"}` {
		t.Errorf("body = %s, want {\"status\":\"ok\"}", got)
	}

	if rec := doRequest(t, router, http.MethodPost, "/healthz", ""); rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("POST /healthz status = %d, want 405", rec.Code)
	}
}

func TestCalculateUsesInjectedFunction(t *testing.T) {
	var gotOp calculator.Operation
	var gotA, gotB float64
	stub := func(op calculator.Operation, a, b float64) (float64, error) {
		gotOp, gotA, gotB = op, a, b
		return 42, nil
	}
	router := NewRouter(NewHandler(stub, discardLogger()), discardLogger(), "*")

	rec := doRequest(t, router, http.MethodPost, calculatePath, `{"operation":"sqrt","a":7,"b":99}`)
	if rec.Code != http.StatusOK || decodeResult(t, rec) != 42 {
		t.Fatalf("unexpected response %d %s", rec.Code, rec.Body.String())
	}
	if gotOp != calculator.Sqrt || gotA != 7 || gotB != 0 {
		t.Errorf("stub called with (%q, %v, %v), want (sqrt, 7, 0): b must be dropped for unary operations", gotOp, gotA, gotB)
	}
}

func TestCalculateUnexpectedErrorIsLoggedAs500(t *testing.T) {
	logger, logs := newTestLogger()
	stub := func(calculator.Operation, float64, float64) (float64, error) {
		return 0, errors.New("database exploded")
	}
	router := NewRouter(NewHandler(stub, logger), logger, "*")

	rec := doRequest(t, router, http.MethodPost, calculatePath, `{"operation":"add","a":1,"b":2}`)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	body := decodeError(t, rec)
	if body.Code != codeInternalError {
		t.Errorf("code = %q, want %q", body.Code, codeInternalError)
	}
	if strings.Contains(body.Message, "database exploded") {
		t.Error("internal error details leaked into the response")
	}
	if !strings.Contains(logs.String(), "database exploded") {
		t.Error("internal error was not logged")
	}
}

func TestCalculateDomainErrorsAreNotLogged(t *testing.T) {
	logger, logs := newTestLogger()
	h := NewHandler(calculator.Calculate, logger)

	rec := serve(httpHandlerFunc(h.Calculate), newPost(`{"operation":"divide","a":1,"b":0}`))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
	if strings.Contains(logs.String(), "calculation failed") {
		t.Error("expected domain errors not to be logged as failures")
	}
}

func TestEncodeFailureIsLogged(t *testing.T) {
	logger, logs := newTestLogger()
	// NaN cannot be encoded as JSON, which exercises the encoder error branch.
	stub := func(calculator.Operation, float64, float64) (float64, error) { return math.NaN(), nil }
	h := NewHandler(stub, logger)

	rec := serve(httpHandlerFunc(h.Calculate), newPost(`{"operation":"add","a":1,"b":2}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (headers are written before encoding)", rec.Code)
	}
	if !strings.Contains(logs.String(), "failed to encode response") {
		t.Error("encode failure was not logged")
	}
}

func TestMapDomainError(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   string
	}{
		{"division by zero", calculator.ErrDivisionByZero, http.StatusUnprocessableEntity, codeDivisionByZero},
		{"negative sqrt", calculator.ErrNegativeSqrt, http.StatusUnprocessableEntity, codeNegativeSqrt},
		{"invalid result", calculator.ErrInvalidResult, http.StatusUnprocessableEntity, codeInvalidResult},
		{"unknown operation", calculator.ErrUnknownOperation, http.StatusBadRequest, codeUnknownOperation},
		{"wrapped error", fmt.Errorf("context: %w", calculator.ErrDivisionByZero), http.StatusUnprocessableEntity, codeDivisionByZero},
		{"unrelated error", errors.New("boom"), http.StatusInternalServerError, codeInternalError},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			status, code, message := mapDomainError(tt.err)
			if status != tt.wantStatus || code != tt.wantCode {
				t.Errorf("mapDomainError(%v) = (%d, %q), want (%d, %q)", tt.err, status, code, tt.wantStatus, tt.wantCode)
			}
			if message == "" {
				t.Error("message must not be empty")
			}
		})
	}
}
