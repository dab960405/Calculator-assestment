# Development Instructions: Full-Stack Calculator (Go + React/TypeScript)

**Full project scope:** application code, unit tests, coverage report, Docker packaging, documentation and delivery.

---

## 0. Role and objective

Act as a senior full-stack engineer. Deliver a complete, review-ready web calculator made of:

- a **Go backend** (REST API, standard library only), and
- a **React + TypeScript frontend** (Vite) that consumes that API,
- plus **unit tests and a coverage report**, **Docker packaging**, **documentation** and a **prompt log**.

Priorities, in this order: **correctness, clarity, maintainability**. Do not add extra features. The whole architecture must be testable (dependency injection, pure logic separated from I/O).

### Why this ordering and these constraints

The deliverable will be evaluated on clean design, readable idiomatic code, test coverage and documentation, not on feature count. When a case is not covered by this document, choose the simplest option consistent with these goals and report it (see section 10).

### Scope by phase

| Phase | Content |
|-------|---------|
| 1 | Backend (sections 1 and 2) |
| 2 | Frontend (section 3) |
| 3 | Tests and coverage (section 4) |
| 4 | Docker (section 5) |
| 5 | Documentation and prompt log (section 6) |
| 6 | Repository hygiene and final review (section 7) |

**In phases 1 and 2 do not create** tests, a Dockerfile, a README or prompt files, and do not install testing libraries. Each phase is executed and verified before moving to the next (see section 8).

### General conventions

- Code, comments, identifiers, error messages and UI text: **English**. README and PROMPTS.md: **English**.
- Every file has one clear responsibility.
- No dead code, no `TODO`, no debugging `console.log` or `fmt.Println`.
- Small, descriptive commits if you use git (`type: description`, e.g. `feat:`, `test:`, `docs:`, `chore:`).
- **Never claim something works without having run it.** If something cannot be run in your environment (e.g. no Docker daemon), say so explicitly.

### Final repository structure

```
/
├── backend/
├── frontend/
├── coverage/            # text coverage summaries (committed)
│   ├── backend.txt
│   └── frontend.txt
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── Makefile
├── README.md
├── PROMPTS.md
└── .gitignore           # Go binaries, node_modules, dist, .env, coverage artifacts
```

---

## 1. API contract (source of truth)

Backend and frontend must follow this contract exactly.

### 1.1 Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/calculate` | Runs an operation |
| `GET` | `/healthz` | Returns `200` with `{"status":"ok"}` |

### 1.2 Supported operations

| `operation` | Operands | Semantics |
|-------------|----------|-----------|
| `add` | `a`, `b` | `a + b` |
| `subtract` | `a`, `b` | `a - b` |
| `multiply` | `a`, `b` | `a * b` |
| `divide` | `a`, `b` | `a / b` (error if `b == 0`) |
| `power` | `a`, `b` | `a` raised to `b` |
| `sqrt` | `a` (unary, `b` is ignored) | square root of `a` (error if `a < 0`) |
| `percentage` | `a`, `b` | `a` percent of `b`, i.e. `a * b / 100` (e.g. `a=15, b=200` gives `30`) |

### 1.3 Request

```json
{ "operation": "divide", "a": 10, "b": 4 }
```

- `operation`: required string.
- `a`: required JSON number.
- `b`: required JSON number except for `sqrt`.
- Unknown fields and bodies with extra content after the JSON are rejected.

### 1.4 Success response (`200 OK`)

```json
{ "result": 2.5 }
```

### 1.5 Error response

Always this shape, with `Content-Type: application/json`:

```json
{ "error": { "code": "DIVISION_BY_ZERO", "message": "Division by zero is not allowed." } }
```

| HTTP | `code` | When |
|------|--------|------|
| 400 | `INVALID_JSON` | Malformed JSON, wrong types, unknown fields, out-of-range number, body > 1 MiB |
| 400 | `UNKNOWN_OPERATION` | `operation` empty or unsupported |
| 400 | `MISSING_OPERAND` | `a` is missing, or `b` is missing in a binary operation |
| 422 | `DIVISION_BY_ZERO` | `divide` with `b == 0` |
| 422 | `NEGATIVE_SQRT` | `sqrt` with `a < 0` |
| 422 | `INVALID_RESULT` | Result is `NaN` or `±Inf` (e.g. `0^-1`, `(-8)^0.5`, overflow) |
| 500 | `INTERNAL_ERROR` | Any unexpected error or recovered panic (generic message, no internal details) |

`code` values are **stable** (the frontend consumes them); `message` values are informational only.

---

## 2. Backend (Go)

### 2.1 Technical requirements

- Go **1.22 or higher** (required for method-aware route patterns: `"POST /path"`). `go.mod` declares `go 1.24`, aligned with the Docker image.
- **Standard library only**: `net/http`, `encoding/json`, `log/slog`, `math`, `errors`, `context`, `os/signal`. No frameworks or external dependencies.
- Module: `go mod init github.com/<user>/calculator/backend`.

### 2.2 Structure

```
backend/
├── go.mod
├── cmd/server/main.go
└── internal/
    ├── calculator/
    │   ├── calculator.go      # pure logic
    │   └── errors.go          # domain errors
    ├── api/
    │   ├── dto.go             # JSON request/response types
    │   ├── handler.go         # HTTP handlers
    │   ├── errors.go          # domain error -> HTTP mapping
    │   ├── middleware.go      # recover, logging, CORS
    │   ├── router.go          # routes + middleware composition
    │   └── static.go          # serves the built frontend (phase 4)
    └── config/
        └── config.go          # environment variables
```

Dependency rule: `api` imports `calculator`; `calculator` **imports nothing** from `api` or `net/http`.

### 2.3 `calculator` package

`errors.go`: exported sentinel errors.

```go
var (
    ErrDivisionByZero   = errors.New("division by zero")
    ErrNegativeSqrt     = errors.New("square root of a negative number")
    ErrUnknownOperation = errors.New("unknown operation")
    ErrInvalidResult    = errors.New("result is not a finite number")
)
```

`calculator.go`:

```go
type Operation string

const (
    Add        Operation = "add"
    Subtract   Operation = "subtract"
    Multiply   Operation = "multiply"
    Divide     Operation = "divide"
    Power      Operation = "power"
    Sqrt       Operation = "sqrt"
    Percentage Operation = "percentage"
)

// ParseOperation validates a raw string and returns ErrUnknownOperation if unsupported.
func ParseOperation(s string) (Operation, error)

// IsUnary reports whether the operation only uses operand a.
func (o Operation) IsUnary() bool

// Calculate runs op over a and b. For unary operations b is ignored.
func Calculate(op Operation, a, b float64) (float64, error)
```

Implementation rules for `Calculate`:

1. `switch` on `op`; `default` returns `ErrUnknownOperation`.
2. `divide`: if `b == 0` return `ErrDivisionByZero`.
3. `sqrt`: if `a < 0` return `ErrNegativeSqrt`; use `math.Sqrt`.
4. `power`: `math.Pow(a, b)`.
5. `percentage`: `a * b / 100`. Document the semantics in the constant's comment.
6. **Mandatory final validation** for every operation: if the result is `NaN` or `±Inf` (`math.IsNaN`, `math.IsInf`), return `0, ErrInvalidResult`. This is critical: `encoding/json` cannot serialize those values.
7. The function must be pure: no global state, no logging, no I/O.
8. Doc comments (`// Name ...`) on every exported identifier.

### 2.4 `api` package

`dto.go`:

```go
// Pointers distinguish "field missing" from "field is 0".
type calculateRequest struct {
    Operation string   `json:"operation"`
    A         *float64 `json:"a"`
    B         *float64 `json:"b"`
}

type calculateResponse struct {
    Result float64 `json:"result"`
}

type errorBody struct {
    Code    string `json:"code"`
    Message string `json:"message"`
}

type errorResponse struct {
    Error errorBody `json:"error"`
}
```

`handler.go`: the handler receives the logic by injection; it does not import the function directly.

```go
type CalculateFunc func(op calculator.Operation, a, b float64) (float64, error)

type Handler struct {
    calculate CalculateFunc
    logger    *slog.Logger
}

func NewHandler(calculate CalculateFunc, logger *slog.Logger) *Handler
```

Flow of `Calculate(w, r)`:

1. Limit the body: `r.Body = http.MaxBytesReader(w, r.Body, 1<<20)`.
2. Decode with `json.NewDecoder` and `DisallowUnknownFields()`. Any error yields `400 INVALID_JSON`.
3. After decoding, attempt a second read: if it is not `io.EOF`, respond `400 INVALID_JSON` (extra content).
4. `calculator.ParseOperation(req.Operation)`: an error yields `400 UNKNOWN_OPERATION`.
5. If `req.A == nil`, or `req.B == nil` and the operation is not unary, respond `400 MISSING_OPERAND`. For unary operations use `b = 0` internally.
6. Call `h.calculate(...)`. On error, map it (see `errors.go`).
7. Respond `200` with `calculateResponse`.

Helpers:

- `writeJSON(w, status, v)`: sets `Content-Type: application/json`, writes the status and encodes. If encoding fails, log the error.
- `writeError(w, status, code, message)`: builds `errorResponse` and uses `writeJSON`.

Also `Health(w, r)`, which responds `{"status":"ok"}`.

`errors.go`: one function that centralizes the mapping:

```go
func mapDomainError(err error) (status int, code, message string)
```

Use `errors.Is` against the `calculator` sentinels:

| Domain error | Status | Code |
|--------------|--------|------|
| `ErrDivisionByZero` | 422 | `DIVISION_BY_ZERO` |
| `ErrNegativeSqrt` | 422 | `NEGATIVE_SQRT` |
| `ErrInvalidResult` | 422 | `INVALID_RESULT` |
| `ErrUnknownOperation` | 400 | `UNKNOWN_OPERATION` |
| anything else | 500 | `INTERNAL_ERROR` (generic message; the real error is logged) |

`middleware.go`: three middlewares with signature `func(http.Handler) http.Handler`:

1. `Recover(logger)`: catches panics, logs with stack trace and responds `500 INTERNAL_ERROR` as JSON.
2. `Logging(logger)`: one `slog` line per request with method, path, status, duration. Requires a wrapping `ResponseWriter` that captures the status (including the implicit `200`).
3. `CORS(allowedOrigin string)`: adds `Access-Control-Allow-Origin` (configured value, **never a hardcoded `*`**), `Access-Control-Allow-Methods: POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type`. Responds `204` to `OPTIONS` (preflight) requests without calling the next handler.

`router.go`:

```go
func NewRouter(h *Handler, logger *slog.Logger, corsOrigin string) http.Handler
```

- `mux := http.NewServeMux()`.
- `mux.HandleFunc("POST /api/v1/calculate", h.Calculate)`.
- `mux.HandleFunc("GET /healthz", h.Health)`.
- Middleware order (outermost to innermost): `Recover` → `Logging` → `CORS` → `mux`.

### 2.5 `config` package

```go
type Config struct {
    Port       string // env PORT, default "8080"
    CORSOrigin string // env CORS_ALLOWED_ORIGIN, default "http://localhost:5173"
    StaticDir  string // env STATIC_DIR, default "" (empty = do not serve the frontend)
}

func Load() Config
```

No external libraries: `os.Getenv` with defaults.

### 2.6 `cmd/server/main.go`

1. Create a `slog` logger with a JSON handler to stdout.
2. `config.Load()`.
3. Assemble: `api.NewHandler(calculator.Calculate, logger)` and `api.NewRouter(...)`. If `StaticDir` is not empty, compose with `api.WithStatic` (see 2.7).
4. `http.Server` with explicit timeouts: `ReadHeaderTimeout: 5s`, `ReadTimeout: 10s`, `WriteTimeout: 10s`, `IdleTimeout: 60s`.
5. Start in a goroutine; wait for a signal with `signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)`.
6. **Graceful shutdown**: `server.Shutdown` with a 10 s context.
7. If `ListenAndServe` fails with an error other than `http.ErrServerClosed`, log it and exit with code 1.
8. Keep `main` short: all logic in small functions (e.g. `run() error`).

### 2.7 Serving the frontend from the backend (for Docker, phase 4)

`static.go` exposes `WithStatic(next http.Handler, dir string) http.Handler`:

- `/api/*` and `/healthz` **always** take priority and never fall through to the frontend.
- For any other `GET`/`HEAD` path: serve the file if it exists in `dir`; otherwise serve `index.html` (SPA fallback).
- Protect against path traversal (`..`, absolute paths); methods other than `GET`/`HEAD` on non-API paths return `405`.
- In production (same origin) CORS is not needed. In development the Vite proxy keeps working.

### 2.8 Go code quality

- `gofmt` clean, `go vet ./...` with no warnings.
- No mutable global variables.
- Errors are returned, never ignored; wrap with `fmt.Errorf("...: %w", err)`.
- No `panic` in application code.
- Short functions and descriptive names; package names lowercase and single-word.
- Error messages sent to the client never expose internal details.

---

## 3. Frontend (React + TypeScript)

### 3.1 Technical requirements

- Create with: `npm create vite@latest frontend -- --template react-ts`.
- TypeScript in **strict** mode (`"strict": true`, plus `noUncheckedIndexedAccess`).
- Function components with hooks. Local state with `useState` / `useReducer`; no Redux or state libraries.
- **No additional runtime dependencies**: no axios (use `fetch`), no UI libraries, no Tailwind, no form libraries. Plain CSS with variables.
- Forbidden: `any`, non-null assertions (`!`), `@ts-ignore`, default exports except `App`.
- Use the template's linter; it must pass with no errors.
- **A single package manager: npm**, with a single `package-lock.json` in `frontend/`.

### 3.2 Structure

```
frontend/
├── index.html
├── vite.config.ts
├── .env.example
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── api/
    │   ├── types.ts               # contract types
    │   ├── calculatorClient.ts    # HTTP calls
    │   └── errorMessages.ts       # code -> user-facing text
    ├── domain/
    │   ├── operations.ts          # operation catalog
    │   ├── validation.ts          # input validation
    │   └── format.ts              # result formatting
    ├── hooks/
    │   └── useCalculator.ts       # request state
    ├── components/
    │   ├── CalculatorForm.tsx
    │   ├── OperationSelector.tsx
    │   ├── OperandInput.tsx
    │   └── ResultPanel.tsx
    └── styles/
        └── index.css
```

### 3.3 `api` layer

`types.ts`: mirror the contract from section 1.

```ts
export type OperationId =
  | 'add' | 'subtract' | 'multiply' | 'divide'
  | 'power' | 'sqrt' | 'percentage';

export interface CalculateRequest { operation: OperationId; a: number; b?: number }
export interface CalculateResponse { result: number }

export type ApiErrorCode =
  | 'INVALID_JSON' | 'UNKNOWN_OPERATION' | 'MISSING_OPERAND'
  | 'DIVISION_BY_ZERO' | 'NEGATIVE_SQRT' | 'INVALID_RESULT'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR' | 'TIMEOUT' | 'UNEXPECTED_RESPONSE';
```

`calculatorClient.ts`:

- Function `calculate(req: CalculateRequest, signal?: AbortSignal): Promise<number>`.
- Base URL: `import.meta.env.VITE_API_BASE_URL ?? ''`, plus `/api/v1/calculate`.
- `fetch` with `POST` and header `Content-Type: application/json`.
- 8 s timeout via `AbortController` (combined with the external `signal` if present).
- `ApiError extends Error` class with `code: ApiErrorCode` and `status?: number`.
- Result handling:
  - `ok` response: return `result`.
  - Non-`ok` response with contract JSON: throw `ApiError` with the server's `code` and `message`.
  - Non-`ok` response without valid JSON (e.g. a 502 from a proxy) or a body with an unexpected shape: `ApiError('UNEXPECTED_RESPONSE')`.
  - Network failure: `ApiError('NETWORK_ERROR')`.
  - Timeout: `ApiError('TIMEOUT')`.
  - Manual cancellation via `signal`: rethrow the `AbortError` so the hook ignores it.
- Never expose `fetch` or `Response` outside this file.

`errorMessages.ts`: function `getUserMessage(error: ApiError): string` with clear, actionable messages:

| `code` | Message |
|--------|---------|
| `DIVISION_BY_ZERO` | "You can't divide by zero. Change the second number." |
| `NEGATIVE_SQRT` | "Square root needs a number that is zero or greater." |
| `INVALID_RESULT` | "That calculation doesn't produce a valid number. Try different values." |
| `NETWORK_ERROR` | "Can't reach the server. Check your connection and try again." |
| `TIMEOUT` | "The server took too long to answer. Try again." |
| others | generic English message (server `message` only as a fallback) |

### 3.4 `domain` layer (pure functions, no React)

`operations.ts`: single catalog, the UI's source of truth.

```ts
export interface OperationDef {
  id: OperationId;
  label: string;            // "Add"
  symbol: string;           // "+"
  operandLabels: [string] | [string, string]; // also defines whether it is unary
}
```

Suggested operand labels: `add/subtract/multiply/divide` → "First number" / "Second number"; `power` → "Base" / "Exponent"; `percentage` → "Percentage" / "Of"; `sqrt` → only "Number". Also export `isUnary(def)` and `getOperation(id)`.

`validation.ts`:

```ts
export type ParseResult =
  | { ok: true; value: number }
  | { ok: false; message: string };

export function parseOperand(raw: string): ParseResult;
```

Rules:

- Trim whitespace. Empty yields "Enter a number.".
- Accept only the format `^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$` (rejects `abc`, `1,5`, `Infinity`, `NaN`, `0x10`).
- Convert with `Number()` and check `Number.isFinite`; otherwise "That number is too large.".
- **Client-side validation is syntactic only.** Do not replicate domain rules (division by zero, negative square root): the backend decides those and they are shown via `errorMessages.ts`. This keeps the server the single source of truth.

Optional but recommended: `validateForm(operation, rawA, rawB)` returning `{ a?: string; b?: string }` with per-field errors, ignoring `b` for unary operations.

`format.ts`: `formatResult(n: number): string` removes floating-point noise (`0.1 + 0.2` must display `0.3`) using `Number(n.toPrecision(12))` and returns the value as text (rely on `String`'s automatic exponential notation for extreme magnitudes).

### 3.5 `useCalculator` hook

State as a discriminated union:

```ts
type CalcState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; result: number }
  | { status: 'error'; error: ApiError };
```

Contract:

```ts
function useCalculator(): {
  state: CalcState;
  submit: (req: CalculateRequest) => Promise<void>;
  reset: () => void;
}
```

Rules:

- While `status === 'loading'`, ignore new `submit` calls (prevents double submission).
- Keep an `AbortController` in a `ref`; abort it on `reset` and on unmount.
- Ignore `AbortError` (not a user-facing error).
- Convert any non-`ApiError` into `ApiError('UNEXPECTED_RESPONSE')`.

### 3.6 Components

- **`App.tsx`**: title, short description and `<CalculatorForm />`. No logic.
- **`CalculatorForm.tsx`** (container):
  - State: selected operation (default `add`), `rawA`, `rawB`, per-field errors.
  - Use `<form noValidate onSubmit>`; submit with **Enter** or the "Calculate" button.
  - On submit: validate; if there are errors, show them and focus the first invalid field; otherwise call `submit`.
  - When the operation or any input changes: clear the previous result/error (`reset`) and the edited field's error.
  - When a unary operation is chosen: hide the second input and discard its error.
  - Button disabled and labeled "Calculating…" during `loading`.
- **`OperationSelector.tsx`**: group of real `<input type="radio">` inside a `<fieldset>` with `<legend>`, styled as buttons (native keyboard accessibility). Shows symbol and name.
- **`OperandInput.tsx`**: associated `<label>`, `<input type="text" inputMode="decimal" autoComplete="off">`; the error message is linked with `aria-describedby` and the field gets `aria-invalid`.
- **`ResultPanel.tsx`**: `role="status"` with `aria-live="polite"` for the result (formatted with `formatResult`); server errors use `role="alert"` and `getUserMessage`. In `idle` it shows helper text, not an empty panel.

### 3.7 UI, styles and responsive design

- Plain CSS in `styles/index.css`, using **CSS variables** for color, spacing, radii and typography. No `!important`.
- **Mobile-first**: a centered single column with `max-width` of ~28rem; from ~640 px up, more padding and slightly larger type.
- Touch targets of at least 44×44 px. Minimum 16 px font size in inputs (prevents automatic zoom on iOS).
- Typography: system font stack (no external fonts).
- Visual direction: restrained and distinctive, with **a single accent color** and good contrast (WCAG AA). Avoid a generic template look (identical cards with equal shadows, decorative gradients). The numeric result is the protagonist: large, legible and clearly aligned.
- Keyboard focus is always visible. Respect `prefers-reduced-motion` and, if simple, `prefers-color-scheme: dark`.
- No decorative animations; only brief transitions responding to user actions.
- UI text in English, sentence case, with clear verbs ("Calculate").

### 3.8 Configuration

`vite.config.ts`: development proxy to avoid CORS locally:

```ts
server: { proxy: { '/api': 'http://localhost:8080' } }
```

`.env.example`:

```
# Leave empty in development (Vite proxies /api to the backend).
VITE_API_BASE_URL=
```

Define the `dev`, `build`, `lint` and `preview` scripts in `package.json` (the template's).

---

## 4. Unit tests and coverage report (phase 3)

**Rule:** tests must not change the application's behavior. If you find a bug or something that prevents testing, report it and make the minimal change, stating it in the delivery (point 4 of section 10).

### 4.1 Backend (Go, standard library only)

- *Table-driven* tests with `testing` and `net/http/httptest`. No new dependencies. Run with `-race`.
- **`calculator`**: all 7 operations and edge cases: division by zero, negative square root, unknown operation, `NaN`/`Inf`, overflow, `0.1+0.2`, negatives, very large and very small magnitudes, `0^-1`, `(-8)^0.5`, `ParseOperation` and `IsUnary`. Verify errors with `errors.Is`.
- **`api`** (handlers and router with `httptest`): `200` with correct JSON; `400` for each stable code; malformed JSON; empty body; extra content after the JSON; unknown fields; wrong types; missing fields; body > 1 MiB; method not allowed; `Content-Type`; domain-error mapping and generic `500` with no internal details (inject a fake `CalculateFunc`); `GET /healthz`.
- **Middleware**: `CORS` (preflight `204` without calling the next handler, configured origin and not reflected), `Recover` (panic → JSON `500` and stack in the log), `Logging` (one JSON line with method, path, status and duration, including the implicit `200`) and chain order. Capture logs in a mutex-protected buffer to avoid `-race` false positives.
- **`static`**: existing file, fallback to `index.html`, priority of `/api` and `/healthz`, path traversal, disallowed methods.
- **`config`**: defaults and environment-variable overrides.
- Target: **≥ 85%** coverage in `calculator` and `api`. `cmd/server` may stay uncovered if justified (it only wires dependencies).

### 4.2 Frontend (Vitest + React Testing Library)

- devDependencies: `vitest`, `@vitest/coverage-v8`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`.
- Configure `test` in `vite.config.ts` (`jsdom` environment, `setupFiles`, `v8` coverage provider, reporters `text`, `html`, `lcov` and `text-summary`; `include` in `src/`; `exclude` `main.tsx`, `vite-env.d.ts`, types and test files).
- Scripts in `package.json`: `test`, `test:watch`, `test:coverage`.
- What to test:
  - `domain/validation.ts`: empty, non-numeric, decimals, negatives, scientific notation, whitespace, `Infinity`, decimal comma, hex, overflow to `Infinity`.
  - `domain/format.ts` and `domain/operations.ts`.
  - `api/calculatorClient.ts` with mocked `fetch`: success, 4xx/5xx with contract JSON, non-JSON response, unexpected shape, network error, timeout, cancellation via `signal`.
  - `api/errorMessages.ts`: every code and the generic case.
  - `hooks/useCalculator.ts` with `renderHook`: `idle → loading → success/error`, double `submit` ignored, `reset`, abort on unmount, non-`ApiError` converted.
  - Components and `App`: rendering, real interaction with `user-event`, validation messages next to the field, focus on the first invalid field, hiding `b` for `sqrt`, button disabled during `loading`, result and error in the panel. Query by **role/label**, not by CSS classes.
- Target: **≥ 85%** line coverage in `src/domain`, `src/api` and `src/hooks`, and reasonable in components.
- `npm run build` (`tsc -b`) and `npm run lint` must keep passing with the tests included.

### 4.3 Coverage report

- Backend commands:
  - `go test ./... -race -coverprofile=coverage.out`
  - `go tool cover -func=coverage.out`
  - `go tool cover -html=coverage.out -o coverage.html`
- Frontend command: `npm run test:coverage`.
- **Makefile** at the root with targets `test-backend`, `test-frontend`, `test` (both) and `coverage` (generates both reports).
- Save summaries to `coverage/backend.txt` and `coverage/frontend.txt` (**committed**). Heavy artifacts (`coverage.out`, `coverage.html`, `frontend/coverage/`) go in `.gitignore`.
- Show the **real output** of the commands and a summary table file/package → coverage %, plus a list of what was left uncovered and why.

---

## 5. Docker packaging (phase 4)

- **Multi-stage `Dockerfile`** at the root:
  1. **Frontend**: Node LTS image (alpine); `npm ci` from `package-lock.json`; `npm run build` with an empty `VITE_API_BASE_URL` (same origin).
  2. **Backend**: `golang` 1.24 image (alpine); static binary (`CGO_ENABLED=0`, `-trimpath`, `-ldflags="-s -w"`), built for `TARGETOS/TARGETARCH`.
  3. **Runtime**: minimal image (distroless `static`, `nonroot`), no shell or package manager; copies the binary and the frontend `dist/`; `ENV PORT=8080 STATIC_DIR=/app/public`; `EXPOSE 8080`; `USER nonroot`.
- A single container: the Go server serves the API and the frontend on port 8080 from the same origin (section 2.7).
- **`.dockerignore`**: `.git`, `node_modules`, `dist`, coverage artifacts, `.env*` (except `.env.example`), documentation and editor files.
- **`docker-compose.yml`**: one service with `build`, port `8080:8080`, environment variables, `read_only: true`, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`, `restart: unless-stopped`.
- **Health check**: the minimal image has no `curl` or `wget`, so no `HEALTHCHECK` is defined in the image; document that the platform should probe `GET /healthz`.
- Makefile targets: `docker-build`, `docker-run` and `run` (frontend + API in a single process, without Docker).
- **Verification**: if a Docker daemon is available, run `docker compose up --build` and `curl -i http://localhost:8080/healthz` and show the output. If not, **say so explicitly**, run `hadolint`, validate the compose YAML, reproduce each build stage by hand on a clean copy containing only what `.dockerignore` allows, and test the binary with the same variables the image uses.

---

## 6. Documentation and prompt log (phase 5)

### 6.1 `README.md` (English)

It must include, in this order:

1. Short description and features.
2. Architecture (simple ASCII diagram of layers and the request → response flow).
3. Requirements (Go and Node versions).
4. How to run: backend only, frontend only, and together (`make run`).
5. Environment variables (backend and frontend).
6. **API reference**: endpoints, request/response, error-code table, and **real `curl` examples** that you execute and verify: success, division by zero, negative square root, invalid result, missing operand, unknown operation, wrong type, extra field, empty/malformed JSON, `/healthz`, CORS preflight and static frontend.
7. Docker: build, run, health check, and what was verified and what was not.
8. **Testing & Coverage**: exact commands, current results (table), what remains uncovered and why, testing decisions (`httptest`, mocked `fetch`, why role/label queries, etc.).
9. **Design decisions & assumptions**: layering and dependency injection; why `float64` (and why `0.1+0.2` returns `0.30000000000000004` from the API while the UI shows `0.3`); stable error codes; syntactic validation on the client and domain validation on the server; why the logic lives in the backend; single-container deployment; trade-offs, known limits and next steps.
10. A "How AI was used" section, written honestly: what was specified and decided by the author, what was generated, and what was reviewed and corrected.
11. Link to `PROMPTS.md`.

Do not leave references to external templates or sandboxes in the README.

### 6.2 `PROMPTS.md` (English)

- List the prompts used, in order: (1) this development instructions document, (2) the tests and coverage prompt, (3) the documentation/Docker/hygiene prompt, and (4) later corrective adjustments.
- For each: scope, expected outcome and verification gate.
- State which AI tool was used.
- If you include a consolidated prompt, label it as "later reference", not as the literal history.

---

## 7. Repository hygiene and final review (phase 6)

- Root `.gitignore`: `node_modules/`, `dist/`, `*.tsbuildinfo`, Go binaries, `.env*` (except `.env.example`), logs, editor/OS files, `backend/coverage.out`, `backend/coverage.html`, `frontend/coverage/`, `docker-compose.override.yml`. **Do not** ignore `package-lock.json` or `coverage/*.txt`.
- **A single lockfile** (`frontend/package-lock.json`); no `pnpm-lock.yaml` or `yarn.lock`. If a root `package.json` exists, it only delegates to `frontend/` via `npm --prefix`.
- No leftover template or sandbox files or references; no `node_modules`, binaries or build artifacts in the repository.
- `go.mod` (`go 1.24`) aligned with the Docker image.
- **Clean-clone test**: clone into a new directory, follow the README to the letter, run the tests and the application.
- **Self-review as a code reviewer**: list of risks, known limitations and future improvements.

---

## 8. Recommended work order (with verification gates)

Each phase ends with its commands executed, their output shown and failures fixed **before** moving to the next one.

1. **Backend: domain.** `go mod init`, `calculator` package (errors and `Calculate`).
2. **Backend: API.** `config`, `api` (dto, errors, handler, middleware, router) and `main`.
   *Gate:* `curl` verification (section 9.1) and static checks (9.2).
3. **Frontend: base.** Create with Vite, enable strict TypeScript, clean the template (remove logos, CSS and sample assets).
4. **Frontend: logic.** `api/`, then `domain/`, then the hook.
5. **Frontend: UI.** Components and styles.
   *Gate:* end-to-end manual test (9.3).
6. **Tests and coverage** (section 4).
   *Gate:* everything green, coverage targets met, summaries in `/coverage`.
7. **Serve the frontend from Go, and Docker** (sections 2.7 and 5).
   *Gate:* container build and run, or an explicit statement that it could not be verified.
8. **Documentation and `PROMPTS.md`** (section 6).
   *Gate:* every `curl` example in the README has actually been run.
9. **Hygiene and final review** (section 7).

---

## 9. Acceptance criteria

### 9.1 Backend: manual verification

```bash
cd backend && go run ./cmd/server
```

| Request | Expected response |
|---------|-------------------|
| `{"operation":"add","a":2,"b":3}` | `200` `{"result":5}` |
| `{"operation":"divide","a":10,"b":4}` | `200` `{"result":2.5}` |
| `{"operation":"sqrt","a":9}` | `200` `{"result":3}` |
| `{"operation":"percentage","a":15,"b":200}` | `200` `{"result":30}` |
| `{"operation":"divide","a":1,"b":0}` | `422` `DIVISION_BY_ZERO` |
| `{"operation":"sqrt","a":-4}` | `422` `NEGATIVE_SQRT` |
| `{"operation":"power","a":0,"b":-1}` | `422` `INVALID_RESULT` |
| `{"operation":"add","a":1}` | `400` `MISSING_OPERAND` |
| `{"operation":"foo","a":1,"b":2}` | `400` `UNKNOWN_OPERATION` |
| `{"operation":"add","a":"x","b":2}` | `400` `INVALID_JSON` |
| `{"operation":"add","a":1,"b":2,"extra":true}` | `400` `INVALID_JSON` |
| empty body or `{` | `400` `INVALID_JSON` |

Example command:

```bash
curl -i -X POST http://localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"divide","a":10,"b":4}'
```

Also: `GET /healthz` returns `200`; an `OPTIONS` with an allowed `Origin` returns `204` with the CORS headers; `Ctrl+C` / `SIGTERM` shuts the server down gracefully.

### 9.2 Static checks

```bash
# backend
gofmt -l .        # no output
go vet ./...      # no warnings
go build ./...    # compiles

# frontend
npm run lint      # no errors
npm run build     # tsc + vite build with no errors
```

### 9.3 Frontend: manual verification (backend running)

- All 7 operations show the correct result on screen.
- `0.1 + 0.2` shows `0.3`.
- An empty field, `abc` or `1,5` show an error next to the field and do not call the API.
- `10 ÷ 0` shows the division-by-zero message that comes from the backend.
- `√` of a negative number shows the corresponding message.
- Choosing `sqrt` hides the second field.
- With the backend stopped, the network message is shown, with no console errors.
- Enter submits the form; clicking quickly several times does not fire multiple requests.
- Fully keyboard-navigable with visible focus; tested at 360 px width with no horizontal scroll.

### 9.4 Tests and coverage

- `make test` passes for the backend (with `-race`) and the frontend.
- Coverage ≥ 85% in `calculator`, `api`, `domain`, frontend `api/` and `hooks`; summaries committed in `/coverage`.
- `npm run lint` and `npm run build` stay green with the tests included.

### 9.5 Docker and documentation

- `docker compose up --build` brings the app up at `http://localhost:8080` (or the declared alternative verification, see section 5).
- The README covers the 11 items in 6.1 and all its `curl` examples were executed.
- `PROMPTS.md` exists and is linked from the README.
- Repository is clean according to section 7.

---

## 10. Expected delivery from you

At the end of each phase (and at the end of the project), reply with:

1. The final file tree of `backend/`, `frontend/` and the repository root.
2. The exact commands to run each part (backend, frontend, together, tests, coverage, Docker).
3. The **real output** of the commands in sections 9.2 and 9.4 (and of Docker, if it could be run).
4. Any deviation from these instructions and its reason, and everything that could **not** be verified.

If something is ambiguous, choose the simplest option consistent with this document and say so in point 4. Do not ask for confirmation on every detail.