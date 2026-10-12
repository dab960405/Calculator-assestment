# Calculator

Full-stack web calculator:

- **Backend** in Go (`/backend`), standard library only. It exposes `POST /api/v1/calculate` and `GET /healthz`, and is the single source of truth for the calculation rules.
- **Frontend** in React + TypeScript + Vite (`/frontend`), with no runtime dependencies other than React. It validates number syntax, calls the API and shows the result or an actionable error message.

Operations: `add`, `subtract`, `multiply`, `divide`, `power`, `sqrt` and `percentage` (`a` percent of `b`, i.e. `a * b / 100`).

## Contents

- [Architecture](#architecture)
- [Requirements](#requirements)
- [How to run](#how-to-run)
- [Environment variables](#environment-variables)
- [API reference](#api-reference)
- [Docker](#docker)
- [Testing & Coverage](#testing--coverage)
- [Design decisions & assumptions](#design-decisions--assumptions)

## Architecture

```
                    ┌──────────────────────── Browser ────────────────────────┐
                    │  React UI                                               │
                    │  components/ ──► hooks/useCalculator ──► api/client     │
                    │       │                                      │ fetch    │
                    │  domain/ (validation, format, operations)    │          │
                    └──────────────────────────────────────────────┼──────────┘
                                                                   │ POST /api/v1/calculate
                                                                   │ {"operation","a","b"}
                    ┌──────────────────────── Go server ───────────▼──────────┐
                    │  Recover ─► Logging ─► CORS ─► ServeMux                 │
                    │                                   │                     │
                    │                     api.Handler (decode, validate,      │
                    │                     map errors → HTTP)                  │
                    │                                   │ CalculateFunc       │
                    │                     calculator.Calculate (pure logic)   │
                    │                                                         │
                    │  WithStatic (only if STATIC_DIR is set):                │
                    │  /api/*, /healthz → API     everything else → dist/     │
                    └─────────────────────────────────────────────────────────┘
```

Dependency rule: `api` imports `calculator`; `calculator` knows nothing about HTTP, JSON or logging. In the frontend, `domain/` and `api/` do not import React.

```
backend/
├── cmd/server/main.go           # wiring, http.Server with timeouts, graceful shutdown
└── internal/
    ├── calculator/              # pure logic + domain errors (sentinels)
    ├── api/                     # DTOs, handlers, error mapping, middlewares, router, static
    └── config/                  # environment variables with defaults
frontend/src/
├── api/                         # contract types, fetch client, messages per code
├── domain/                      # operation catalog, validation, formatting
├── hooks/useCalculator.ts       # request state (discriminated union)
├── components/                  # form, selector, inputs, result panel
└── styles/index.css
```

## Requirements

| Tool | Minimum version | Tested with | Reason |
| --- | --- | --- | --- |
| Go | 1.24 | 1.24.9 | Method-aware route patterns (`"POST /api/v1/calculate"`) in `http.ServeMux` |
| Node.js | 22.12 | 24.16.0 | Requirement of Vite 8 / Vitest 5 (`^22.12.0 \|\| ^24 \|\| >=26`) |
| npm | the one bundled with Node | 11.x | `npm ci` with `package-lock.json` |
| Docker (optional) | 23+ with BuildKit | — | `RUN --mount=type=cache` and `--platform=$BUILDPLATFORM` |
| make (optional) | any | GNU Make | `Makefile` shortcuts |

## How to run

### Backend only (API on :8080)

```bash
cd backend
go run ./cmd/server
# or compiled:
go build -o bin/server ./cmd/server && ./bin/server
```

`Ctrl+C` (or `SIGTERM`) triggers a graceful shutdown with a 10 s grace period.

### Frontend only (Vite on :5173)

```bash
cd frontend
npm ci
npm run dev
```

In development, Vite proxies `/api` to `http://localhost:8080`, so CORS is not needed. If the backend is down, the UI shows the network message ("Can't reach the server…").

### Both together

**Option A: development with hot reload (two terminals).**

```bash
# terminal 1
cd backend && go run ./cmd/server
# terminal 2
cd frontend && npm run dev     # open http://localhost:5173
```

**Option B: a single process, as in production.** The Go binary serves the static build and the API on the same origin:

```bash
make run
# equivalent to:
cd frontend && npm ci && npm run build
cd ../backend && STATIC_DIR=../frontend/dist CORS_ALLOWED_ORIGIN=http://localhost:8080 go run ./cmd/server
# open http://localhost:8080
```

**Option C: Docker** (see [Docker](#docker)).

## Environment variables

### Backend (`backend/internal/config`)

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8080` | Listening port. |
| `CORS_ALLOWED_ORIGIN` | `http://localhost:5173` | Exact value of `Access-Control-Allow-Origin`. Never a hardcoded `*`. Only matters if the frontend is served from a different origin. |
| `STATIC_DIR` | empty | If set, the server serves the built frontend from that folder (SPA with fallback to `index.html`). Empty: API only. |

### Frontend (`frontend/.env.example`, read at build time)

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_BASE_URL` | empty | Prefix of the API URL. Empty = same origin (Vite proxy in dev, or the Go server with `STATIC_DIR`). For a backend on another domain: `VITE_API_BASE_URL=https://api.example.com` and set `CORS_ALLOWED_ORIGIN` to the frontend's origin. |

## API reference

Base: `http://localhost:8080`. All API responses are `Content-Type: application/json`.

### `GET /healthz`

```bash
curl -i http://localhost:8080/healthz
```

```
HTTP/1.1 200 OK
Content-Type: application/json

{"status":"ok"}
```

### `POST /api/v1/calculate`

**Request**

```json
{ "operation": "divide", "a": 10, "b": 4 }
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `operation` | string | yes | `add`, `subtract`, `multiply`, `divide`, `power`, `sqrt`, `percentage` |
| `a` | number | yes | JSON number (not a string). |
| `b` | number | yes, except for `sqrt` | Ignored for `sqrt`. |

Unknown fields, extra content after the JSON object and bodies larger than 1 MiB are rejected.

**Success response: `200 OK`**

```json
{ "result": 2.5 }
```

**Error response**: always this shape. The `code` is stable (the frontend consumes it); the `message` is informational only.

```json
{ "error": { "code": "DIVISION_BY_ZERO", "message": "Division by zero is not allowed." } }
```

| HTTP | `code` | When |
| --- | --- | --- |
| 400 | `INVALID_JSON` | Malformed or empty JSON, wrong types, unknown fields, extra content, number out of range, body > 1 MiB |
| 400 | `UNKNOWN_OPERATION` | `operation` empty or unsupported |
| 400 | `MISSING_OPERAND` | `a` is missing, or `b` is missing in a binary operation |
| 422 | `DIVISION_BY_ZERO` | `divide` with `b == 0` |
| 422 | `NEGATIVE_SQRT` | `sqrt` with `a < 0` |
| 422 | `INVALID_RESULT` | The result is `NaN` or `±Inf` (e.g. `0^-1`, `(-8)^0.5`, overflow) |
| 500 | `INTERNAL_ERROR` | Unexpected error or recovered panic (generic message; details go only to the log) |

`400` = the request does not follow the contract. `422` = the request is valid but the calculation has no representable result.

### Verified examples

Executed against the real binary (`CGO_ENABLED=0`, `STATIC_DIR=frontend/dist`, the same mode as the Docker image). Status, `Content-Type` and body are shown; `Date`, `Content-Length` and CORS headers are omitted.

**Success**

```bash
curl -i -X POST http://localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"divide","a":10,"b":4}'
```

```
HTTP/1.1 200 OK
Content-Type: application/json

{"result":2.5}
```

More cases, with the same command and a different `-d`:

| Body | Status | Response |
| --- | --- | --- |
| `{"operation":"add","a":2,"b":3}` | 200 | `{"result":5}` |
| `{"operation":"sqrt","a":9}` | 200 | `{"result":3}` |
| `{"operation":"percentage","a":15,"b":200}` | 200 | `{"result":30}` |
| `{"operation":"add","a":0.1,"b":0.2}` | 200 | `{"result":0.30000000000000004}` (the UI shows `0.3`) |

**Division by zero**

```bash
curl -i -X POST http://localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"divide","a":1,"b":0}'
```

```
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/json

{"error":{"code":"DIVISION_BY_ZERO","message":"Division by zero is not allowed."}}
```

**Invalid input: wrong type**

```bash
curl -i -X POST http://localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"add","a":"x","b":2}'
```

```
HTTP/1.1 400 Bad Request
Content-Type: application/json

{"error":{"code":"INVALID_JSON","message":"Request body must be valid JSON matching the API contract."}}
```

**Invalid input: missing operand**

```bash
curl -i -X POST http://localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"add","a":1}'
```

```
HTTP/1.1 400 Bad Request
Content-Type: application/json

{"error":{"code":"MISSING_OPERAND","message":"A required operand is missing."}}
```

**Invalid input: unsupported operation**

```bash
curl -i -X POST http://localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"foo","a":1,"b":2}'
```

```
HTTP/1.1 400 Bad Request
Content-Type: application/json

{"error":{"code":"UNKNOWN_OPERATION","message":"The operation is missing or not supported."}}
```

Remaining cases checked with the same command:

| Body | Status | `code` |
| --- | --- | --- |
| `{"operation":"sqrt","a":-4}` | 422 | `NEGATIVE_SQRT` |
| `{"operation":"power","a":0,"b":-1}` | 422 | `INVALID_RESULT` |
| `{"operation":"add","a":1,"b":2,"extra":true}` | 400 | `INVALID_JSON` |
| `{` | 400 | `INVALID_JSON` |
| empty body | 400 | `INVALID_JSON` |

**CORS preflight**

```bash
curl -i -X OPTIONS http://localhost:8080/api/v1/calculate \
  -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: POST'
```

```
HTTP/1.1 204 No Content
Access-Control-Allow-Headers: Content-Type
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Origin: <value of CORS_ALLOWED_ORIGIN>
Vary: Origin
```

**Static frontend (only with `STATIC_DIR`)**: `GET /` and any path without an extension (`/some/route`) return `index.html` with `Cache-Control: no-cache`; `GET /assets/index-<hash>.js` returns `text/javascript` with `Cache-Control: public, max-age=31536000, immutable`.

## Docker

A single container serves the API and the static frontend on the same origin (port 8080).

```bash
docker build -t calculator .            # or: make docker-build
docker run --rm -p 8080:8080 calculator # or: make docker-run
# or with compose:
docker compose up --build

curl -i http://localhost:8080/healthz
open http://localhost:8080
```

The `Dockerfile` has three stages:

1. **frontend** (`node:24-alpine`): `npm ci` against the lockfile and `npm run build` (includes `tsc -b`). `VITE_API_BASE_URL` is a `--build-arg`, empty by default (same origin).
2. **backend** (`golang:1.24-alpine`): static binary `CGO_ENABLED=0 -trimpath -ldflags="-s -w"` (~6 MB). Both build stages use `--platform=$BUILDPLATFORM` and `TARGETOS/TARGETARCH`, so `docker buildx build --platform linux/arm64,linux/amd64 .` cross-compiles without emulation.
3. **runtime** (`gcr.io/distroless/static-debian12:nonroot`): only the binary and `dist/` in `/app/public`. No shell or package manager, non-root user, `STATIC_DIR=/app/public`.

`docker-compose.yml` adds hardening: `read_only` filesystem, `cap_drop: [ALL]` and `no-new-privileges`. The server does not write to disk, so it works without volumes.

`.dockerignore` leaves out `node_modules`, `dist`, coverage, `.git` and any `.env*` (except `frontend/.env.example`), so the build context stays small and no secrets leak in.

**Verification status:** the environment where this delivery was prepared **has no Docker** (nor Podman/Buildah), so **the image was not built or run**. What was verified:

- `hadolint` on the `Dockerfile`: no warnings.
- `docker-compose.yml` parses as valid YAML.
- Each stage, reproduced by hand on a clean copy of the context (only what `.dockerignore` allows): `npm ci && npm run build` succeeds; `go build` with `CGO_ENABLED=0` succeeds for `linux/amd64` and `linux/arm64`.
- The static binary, started with the same variables as the image (`PORT`, `STATIC_DIR`), answered every example on this page, served `index.html`, the SPA fallback and the assets, and shut down gracefully on `SIGTERM`.

The image declares no `HEALTHCHECK`: distroless ships neither `curl` nor `wget`. Use `GET /healthz` from the orchestrator (liveness/readiness in Kubernetes, the load balancer's health check).

## Testing & Coverage

### Commands

| Goal | Command |
| --- | --- |
| All tests | `make test` |
| Backend only | `make test-backend` → `cd backend && go test ./... -race` |
| Frontend only | `make test-frontend` → `cd frontend && npm test` |
| Coverage reports (both) | `make coverage` |

Backend, by hand:

```bash
cd backend
gofmt -l .                     # no output
go vet ./...                   # no warnings
go test ./... -race -coverprofile=coverage.out
go tool cover -func=coverage.out
go tool cover -html=coverage.out -o coverage.html
```

Frontend, by hand:

```bash
cd frontend
npm test               # vitest run
npm run test:watch     # vitest in watch mode
npm run test:coverage  # vitest run --coverage (text, html and lcov in frontend/coverage/)
npm run lint           # oxlint, includes the tests
npm run build          # tsc -b also type-checks the tests
```

`make coverage` leaves the committed summaries in `coverage/backend.txt` (output of `go tool cover -func`) and `coverage/frontend.txt` (Vitest text table). The heavy artifacts (`backend/coverage.out`, `backend/coverage.html`, `frontend/coverage/`) are in `.gitignore`.

### Current results

Backend: 3 packages with tests, all green with `-race`; `gofmt` and `go vet` clean. Frontend: 11 files and 168 tests green; `lint` and `build` with no errors.

| Package / file | Coverage |
| --- | --- |
| `backend/internal/calculator` | 100% statements |
| `backend/internal/api` (includes `static.go`) | 100% statements |
| `backend/internal/config` | 100% statements |
| `backend/cmd/server` | 0% (see below) |
| **Backend total** | **84.3%** |
| `frontend/src/domain/*` (validation, format, operations) | 100% lines / branches |
| `frontend/src/api/*` (calculatorClient, errorMessages) | 100% lines / branches |
| `frontend/src/hooks/useCalculator.ts` | 100% lines / branches |
| `frontend/src/components/*` | 100% lines / branches |
| `frontend/src/App.tsx` | 100% |
| **Frontend total** | **100% lines, 100% branches** |

Vitest fails if `src/api`, `src/domain` or `src/hooks` drop below 85% (`coverage.thresholds` in `vite.config.ts`).

### What is not covered and why

- `backend/cmd/server/main.go` (`main`, `run`, `newServer`, `shutdown`): it only wires config, logger, router and `http.Server` with signal-driven graceful shutdown. Testing it requires starting a real process and sending it signals, which is poor value for its cost. Everything the server does is tested through `api.NewRouter` and `api.WithStatic`, which are exactly the handlers `main` uses. The real startup and the `SIGTERM` shutdown were verified by hand (see [Docker](#docker)).
- `frontend/src/main.tsx` (React mounting) and `src/api/types.ts` (types only) are excluded from coverage: they contain no executable logic.

### Testing decisions

- **Standard library only in Go** (`testing`, `net/http/httptest`), no new dependencies. Tests are table-driven and errors are checked with `errors.Is` against the domain's sentinel errors, also when wrapped with `%w`.
- **Why `httptest`?** It runs the real `http.Handler` (router + middlewares) in memory, without opening ports. Tests are fast, deterministic and `-race`-friendly, and they exercise the complete HTTP contract: status, `Content-Type`, JSON body and CORS headers.
- **Handler isolated from the calculation:** `NewHandler` receives a `CalculateFunc`. Tests use the real `calculator.Calculate` for the end-to-end contract, and stubs to force hard-to-reach paths (unexpected error → logged 500 without leaking details; JSON encoding failure).
- **Middlewares tested separately and chained:** CORS (preflight 204 without calling the next handler, configured origin and not reflected), Recover (panic → JSON 500 and stack in the log), Logging (one JSON line with method, path, status and duration, including the implicit 200) and the order of `chain`. Logs are captured in a mutex-protected buffer so `-race` gives no false positives.
- **Static over a temporary directory** (`t.TempDir()`): existing files, immutable cache under `/assets/`, SPA fallback, 404 for missing assets, contained path traversal, and `/api/*` and `/healthz` always reaching the API (their 404/405 are not masked by `index.html`).
- **Floats:** `0.1+0.2` is verified as the raw IEEE-754 sum (`0.30000000000000004`) in the backend, and as `0.3` after `formatResult` in the frontend. Rounding for display is the frontend's responsibility.
- **Why mock `fetch`?** The client is the network boundary. With `vi.stubGlobal('fetch', …)` the tests cover, without a server, success, 4xx/5xx errors with the error JSON, non-JSON responses (e.g. an HTML 502 from a proxy), network errors, the 8 s timeout with fake timers, and cancellation by the caller. The mock honors `AbortSignal` like the real `fetch`.
- **Hook and components mock `calculate`, not `fetch`:** this way the `useCalculator` and `CalculatorForm` tests use deferred promises to control the exact order of loading → success/error, and do not depend on HTTP details already covered by the client test.
- **Testing Library by role and label:** queries use `getByRole`, `getByLabelText` and the accessible description (`aria-describedby`), never CSS classes, with `user-event` for real interaction (typing, click, Enter, arrow keys on the radios).
- **Tests are compiled with the app:** they live inside `src/`, so `npm run build` (`tsc -b`) and `npm run lint` verify them too.

### Findings (current behavior, unchanged)

The tests document these behaviors as they are:

1. **405 and 404 do not follow the JSON error contract.** They are generated by `http.ServeMux` as `text/plain` (`Method Not Allowed`, with an `Allow: POST` header), not as `{"error":{...}}`. Also verified with `curl` (`GET /api/v1/calculate` → 405).
2. **The request `Content-Type` is not validated.** A `POST` with `text/plain` and valid JSON returns 200.
3. **A body larger than 1 MiB returns 400 `INVALID_JSON`**, not 413.
4. **A `null` body returns 400 `UNKNOWN_OPERATION`**, not `INVALID_JSON`.
5. **Latent case in `useCalculator`:** if `calculate` rejected with an `AbortError` without the hook having aborted, the state would stay at `loading`. Today it is unreachable, because the client only propagates `AbortError` when the caller aborted; any other case is converted to `TIMEOUT` or `NETWORK_ERROR`.

## Design decisions & assumptions

### Layer separation

- **Backend:** `calculator` (pure domain) → `api` (HTTP transport) → `cmd/server` (composition). `calculator.Calculate` has no state, I/O or logging, so it is tested with input/output tables and no mocks. `api.Handler` receives the calculation function by injection (`CalculateFunc`), which lets tests replace it without artificial interfaces. `main` only assembles pieces.
- **Frontend:** `domain/` (pure functions: catalog, validation, formatting) and `api/` (the only place that knows `fetch` and `Response`) do not depend on React. `useCalculator` encapsulates the request lifecycle (loading, abort, double submit) and components only render state. `operations.ts` is the single catalog: labels, symbols and arity come from there, so adding an operation does not require touching several components.

### Use of `float64`

- JSON does not distinguish integers from decimals and JavaScript represents every number as an IEEE-754 double. Using `float64` in Go makes the value **bit-for-bit identical** on both sides of the wire, with no conversions or loss at the boundary.
- Accepted consequences: integers are exact up to 2^53, there are ~15-17 significant digits and the typical binary noise appears (`0.1 + 0.2 = 0.30000000000000004`). The backend returns the raw value (it is the correct IEEE-754 result) and the frontend rounds **only for display** with `Number(n.toPrecision(12))`.
- `NaN` and `±Inf` cannot be serialized in JSON, which is why `Calculate` always validates the result and returns `ErrInvalidResult` (422) instead of letting `encoding/json` fail with a 500.
- Discarded alternative: arbitrary-precision decimals (`math/big` or a library). It would give exact base-10 results, but the JSON → JS contract would still go through `number`, it complicates `pow`/`sqrt` and it goes beyond "standard library only" or the scope.

### Error handling with stable codes

- The domain exposes sentinel errors (`ErrDivisionByZero`, …); `api.mapDomainError` is the **only** place that translates them to status + `code` + `message`, using `errors.Is` (robust to `%w` wrapping).
- The frontend decides what to show by the `code`, never by the `message` or the status. This way server messages can be rewritten, translated, or a status changed without breaking the UI. The client adds its own codes (`NETWORK_ERROR`, `TIMEOUT`, `UNEXPECTED_RESPONSE`) for failures that never become a contract response, such as an HTML 502 from a proxy.
- Unexpected errors and panics: 500 `INTERNAL_ERROR` with a generic message; the detail and stack go only to the structured log (`slog` JSON), never to the client.
- 400 versus 422: 400 when the request does not follow the contract (shape), 422 when it is valid but mathematically has no representable result (domain).

### Validation on both sides

- **Client: syntax only.** `parseOperand` accepts only decimal numbers or scientific notation (it rejects `abc`, `1,5`, `Infinity`, `NaN`, `0x10`) and non-finite values. It gives immediate feedback next to the field, without going to the network.
- **Server: everything.** Strict decoding (unknown fields, extra content, types, 1 MiB limit), presence of operands according to arity, and domain rules. The server never trusts that the client validated: the API is also used by `curl` or other clients.
- Domain rules (division by zero, negative root, non-finite result) are **not** duplicated in the client: there is a single source of truth and they cannot diverge.

### Why the logic lives in the backend

- A single auditable, tested implementation of the rules, shareable by any future client (mobile, CLI, another web app).
- The UI does not need to know which combinations are invalid: it shows what the server says according to the `code`.
- Accepted cost: each calculation is a network round trip. For a calculator it is negligible, and the client handles it with an 8 s timeout, cancellation and double-submit protection.

### Single-container deployment

- With `STATIC_DIR`, the same binary serves frontend and API on a **single origin**: no CORS or separate proxy is needed, and there is one image to version.
- `WithStatic` is applied outside the API router and lets `/api/*` and `/healthz` through untouched, so the API's 404/405 do not turn into `index.html`. Paths without an extension fall back to `index.html` (SPA); missing assets give 404 so a `.js` request is never answered with HTML.
- Final `nonroot` distroless image: minimal surface, no shell, ~6 MB binary plus `dist/`.

### Trade-offs and assumptions

- **No HTTP or state framework:** more explicit code (decoding, middlewares, the discriminated union in the hook) in exchange for zero dependencies and full control of the contract.
- **One generic endpoint** (`/calculate` with `operation`) instead of one per operation: the contract and the client are simpler, at the cost of validating `operation` at runtime.
- **`percentage` = `a * b / 100`** ("a percent of b"), as the brief states; it is one of several possible interpretations of "percentage".
- **`sqrt` ignores `b`** if it is sent, instead of rejecting it, so the client can always send the same shape.
- **CORS with a single configurable origin**, not a list: enough for one frontend; with several origins, `Origin` would have to be validated against a list.
- **405/404 as `text/plain`**, not in the contract's error format (see Findings). They were left as is because they are not among the codes the frontend consumes.
- **No `HEALTHCHECK` in the image**, in exchange for a distroless image with no tools; the check is delegated to the orchestrator via `/healthz`.
- **No persistence, authentication or rate limiting:** out of scope for a stateless calculator.
