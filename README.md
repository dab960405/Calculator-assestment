# Calculator

Calculadora web full-stack:

- **Backend** en Go (`/backend`), solo librería estándar. Expone `POST /api/v1/calculate` y `GET /healthz`, y es la única fuente de verdad de las reglas de cálculo.
- **Frontend** en React + TypeScript + Vite (`/frontend`), sin dependencias de runtime aparte de React. Valida la sintaxis de los números, llama a la API y muestra el resultado o un mensaje de error accionable.

Operaciones: `add`, `subtract`, `multiply`, `divide`, `power`, `sqrt` y `percentage` (`a` por ciento de `b`, es decir `a * b / 100`).

## Contenido

- [Arquitectura](#arquitectura)
- [Requisitos](#requisitos)
- [Cómo ejecutarlo](#cómo-ejecutarlo)
- [Variables de entorno](#variables-de-entorno)
- [Referencia de la API](#referencia-de-la-api)
- [Docker](#docker)
- [Testing & Coverage](#testing--coverage)
- [Design decisions & assumptions](#design-decisions--assumptions)

## Arquitectura

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

Regla de dependencias: `api` importa `calculator`; `calculator` no conoce HTTP, JSON ni logging. En el frontend, `domain/` y `api/` no importan React.

```
backend/
├── cmd/server/main.go           # cableado, http.Server con timeouts, graceful shutdown
└── internal/
    ├── calculator/              # lógica pura + errores de dominio (centinelas)
    ├── api/                     # DTOs, handlers, mapeo de errores, middlewares, router, static
    └── config/                  # variables de entorno con valores por defecto
frontend/src/
├── api/                         # tipos del contrato, cliente fetch, mensajes por código
├── domain/                      # catálogo de operaciones, validación, formateo
├── hooks/useCalculator.ts       # estado de la petición (unión discriminada)
├── components/                  # formulario, selector, inputs, panel de resultado
└── styles/index.css
```

## Requisitos

| Herramienta | Versión mínima | Probado con | Motivo |
| --- | --- | --- | --- |
| Go | 1.22 | 1.24.9 | Patrones de ruta con método (`"POST /api/v1/calculate"`) en `http.ServeMux` |
| Node.js | 22.12 | 24.16.0 | Requisito de Vite 8 / Vitest 5 (`^22.12.0 \|\| ^24 \|\| >=26`) |
| npm | el que trae Node | 11.x | `npm ci` con `package-lock.json` |
| Docker (opcional) | 23+ con BuildKit | — | `RUN --mount=type=cache` y `--platform=$BUILDPLATFORM` |
| make (opcional) | cualquiera | GNU Make | Atajos del `Makefile` |

## Cómo ejecutarlo

### Backend solo (API en :8080)

```bash
cd backend
go run ./cmd/server
# o compilado:
go build -o bin/server ./cmd/server && ./bin/server
```

`Ctrl+C` (o `SIGTERM`) hace un apagado ordenado con un margen de 10 s.

### Frontend solo (Vite en :5173)

```bash
cd frontend
npm ci
npm run dev
```

En desarrollo, Vite redirige `/api` a `http://localhost:8080`, así que no hace falta CORS. Si el backend está apagado, la UI muestra el mensaje de red ("Can't reach the server…").

### Juntos

**Opción A: desarrollo con recarga en caliente (dos terminales).**

```bash
# terminal 1
cd backend && go run ./cmd/server
# terminal 2
cd frontend && npm run dev     # abrir http://localhost:5173
```

**Opción B: un solo proceso, como en producción.** El binario de Go sirve el build estático y la API en el mismo origen:

```bash
make run
# equivale a:
cd frontend && npm ci && npm run build
cd ../backend && STATIC_DIR=../frontend/dist CORS_ALLOWED_ORIGIN=http://localhost:8080 go run ./cmd/server
# abrir http://localhost:8080
```

**Opción C: Docker** (ver [Docker](#docker)).

> El `package.json` de la raíz solo existe para la vista previa de v0 (arranca Vite en el puerto 3000). No es necesario para el flujo normal.

## Variables de entorno

### Backend (`backend/internal/config`)

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `PORT` | `8080` | Puerto de escucha. |
| `CORS_ALLOWED_ORIGIN` | `http://localhost:5173` | Valor exacto de `Access-Control-Allow-Origin`. Nunca es `*` fijo. Solo importa si el frontend se sirve desde otro origen. |
| `STATIC_DIR` | vacío | Si se define, el servidor sirve el frontend compilado desde esa carpeta (SPA con fallback a `index.html`). Vacío: solo API. |

### Frontend (`frontend/.env.example`, se lee en tiempo de build)

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `VITE_API_BASE_URL` | vacío | Prefijo de la URL de la API. Vacío = mismo origen (proxy de Vite en dev, o el servidor Go con `STATIC_DIR`). Para un backend en otro dominio: `VITE_API_BASE_URL=https://api.example.com` y `CORS_ALLOWED_ORIGIN` con el origen del frontend. |

## Referencia de la API

Base: `http://localhost:8080`. Todas las respuestas de la API son `Content-Type: application/json`.

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

| Campo | Tipo | Obligatorio | Notas |
| --- | --- | --- | --- |
| `operation` | string | sí | `add`, `subtract`, `multiply`, `divide`, `power`, `sqrt`, `percentage` |
| `a` | number | sí | Número JSON (no string). |
| `b` | number | sí, salvo en `sqrt` | En `sqrt` se ignora. |

Se rechazan campos desconocidos, contenido extra después del objeto JSON y cuerpos de más de 1 MiB.

**Respuesta exitosa: `200 OK`**

```json
{ "result": 2.5 }
```

**Respuesta de error**: siempre con esta forma. El `code` es estable (lo consume el frontend); el `message` es solo informativo.

```json
{ "error": { "code": "DIVISION_BY_ZERO", "message": "Division by zero is not allowed." } }
```

| HTTP | `code` | Cuándo |
| --- | --- | --- |
| 400 | `INVALID_JSON` | JSON malformado o vacío, tipos incorrectos, campos desconocidos, contenido extra, número fuera de rango, cuerpo > 1 MiB |
| 400 | `UNKNOWN_OPERATION` | `operation` vacío o no soportado |
| 400 | `MISSING_OPERAND` | Falta `a`, o falta `b` en una operación binaria |
| 422 | `DIVISION_BY_ZERO` | `divide` con `b == 0` |
| 422 | `NEGATIVE_SQRT` | `sqrt` con `a < 0` |
| 422 | `INVALID_RESULT` | El resultado es `NaN` o `±Inf` (p. ej. `0^-1`, `(-8)^0.5`, overflow) |
| 500 | `INTERNAL_ERROR` | Error no previsto o panic recuperado (mensaje genérico; el detalle solo va al log) |

`400` = la petición no cumple el contrato. `422` = la petición es válida pero el cálculo no tiene un resultado representable.

### Ejemplos verificados

Ejecutados contra el binario real (`CGO_ENABLED=0`, `STATIC_DIR=frontend/dist`, el mismo modo que la imagen Docker). Se muestran el status, `Content-Type` y el cuerpo; se omiten `Date`, `Content-Length` y las cabeceras CORS.

**Éxito**

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

Más casos, con el mismo comando y otro `-d`:

| Body | Status | Respuesta |
| --- | --- | --- |
| `{"operation":"add","a":2,"b":3}` | 200 | `{"result":5}` |
| `{"operation":"sqrt","a":9}` | 200 | `{"result":3}` |
| `{"operation":"percentage","a":15,"b":200}` | 200 | `{"result":30}` |
| `{"operation":"add","a":0.1,"b":0.2}` | 200 | `{"result":0.30000000000000004}` (la UI muestra `0.3`) |

**División por cero**

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

**Input inválido: tipo incorrecto**

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

**Input inválido: falta un operando**

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

**Input inválido: operación no soportada**

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

Resto de casos comprobados con el mismo comando:

| Body | Status | `code` |
| --- | --- | --- |
| `{"operation":"sqrt","a":-4}` | 422 | `NEGATIVE_SQRT` |
| `{"operation":"power","a":0,"b":-1}` | 422 | `INVALID_RESULT` |
| `{"operation":"add","a":1,"b":2,"extra":true}` | 400 | `INVALID_JSON` |
| `{` | 400 | `INVALID_JSON` |
| cuerpo vacío | 400 | `INVALID_JSON` |

**Preflight CORS**

```bash
curl -i -X OPTIONS http://localhost:8080/api/v1/calculate \
  -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: POST'
```

```
HTTP/1.1 204 No Content
Access-Control-Allow-Headers: Content-Type
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Origin: <valor de CORS_ALLOWED_ORIGIN>
Vary: Origin
```

**Frontend estático (solo con `STATIC_DIR`)**: `GET /` y cualquier ruta sin extensión (`/some/route`) devuelven `index.html` con `Cache-Control: no-cache`; `GET /assets/index-<hash>.js` devuelve `text/javascript` con `Cache-Control: public, max-age=31536000, immutable`.

## Docker

Un único contenedor sirve la API y el frontend estático en el mismo origen (puerto 8080).

```bash
docker build -t calculator .            # o: make docker-build
docker run --rm -p 8080:8080 calculator # o: make docker-run
# o con compose:
docker compose up --build

curl -i http://localhost:8080/healthz
open http://localhost:8080
```

El `Dockerfile` tiene tres etapas:

1. **frontend** (`node:24-alpine`): `npm ci` sobre el lockfile y `npm run build` (incluye `tsc -b`). `VITE_API_BASE_URL` es un `--build-arg` vacío por defecto (mismo origen).
2. **backend** (`golang:1.24-alpine`): binario estático `CGO_ENABLED=0 -trimpath -ldflags="-s -w"` (~6 MB). Ambas etapas de build usan `--platform=$BUILDPLATFORM` y `TARGETOS/TARGETARCH`, así que `docker buildx build --platform linux/arm64,linux/amd64 .` cruza compilación sin emulación.
3. **runtime** (`gcr.io/distroless/static-debian12:nonroot`): solo el binario y `dist/` en `/app/public`. Sin shell ni gestor de paquetes, usuario no root, `STATIC_DIR=/app/public`.

`docker-compose.yml` añade endurecimiento: sistema de archivos `read_only`, `cap_drop: [ALL]` y `no-new-privileges`. El servidor no escribe en disco, así que funciona sin volúmenes.

`.dockerignore` deja fuera `node_modules`, `dist`, coverage, `.git` y cualquier `.env*` (salvo `frontend/.env.example`), para que el contexto sea pequeño y no se cuelen secretos.

**Estado de la verificación:** el entorno donde se preparó esta entrega **no tiene Docker** (ni Podman/Buildah), así que **la imagen no se construyó ni se ejecutó**. Lo que sí se verificó:

- `hadolint` sobre el `Dockerfile`: sin avisos.
- `docker-compose.yml` parsea como YAML válido.
- Cada etapa, reproducida a mano sobre una copia limpia del contexto (solo lo que permite `.dockerignore`): `npm ci && npm run build` correcto; `go build` con `CGO_ENABLED=0` correcto para `linux/amd64` y `linux/arm64`.
- El binario estático, arrancado con las mismas variables que la imagen (`PORT`, `STATIC_DIR`), respondió a todos los ejemplos de esta página, sirvió `index.html`, el fallback SPA y los assets, y se apagó de forma ordenada con `SIGTERM`.

La imagen no declara `HEALTHCHECK`: distroless no trae `curl` ni `wget`. Usa `GET /healthz` desde el orquestador (liveness/readiness en Kubernetes, health check del balanceador).

## Testing & Coverage

### Comandos

| Objetivo | Comando |
| --- | --- |
| Todos los tests | `make test` |
| Solo backend | `make test-backend` → `cd backend && go test ./... -race` |
| Solo frontend | `make test-frontend` → `cd frontend && npm test` |
| Reportes de cobertura (ambos) | `make coverage` |

Backend, a mano:

```bash
cd backend
gofmt -l .                     # sin salida
go vet ./...                   # sin avisos
go test ./... -race -coverprofile=coverage.out
go tool cover -func=coverage.out
go tool cover -html=coverage.out -o coverage.html
```

Frontend, a mano:

```bash
cd frontend
npm test               # vitest run
npm run test:watch     # vitest en modo watch
npm run test:coverage  # vitest run --coverage (text, html y lcov en frontend/coverage/)
npm run lint           # oxlint, incluye los tests
npm run build          # tsc -b también type-checkea los tests
```

`make coverage` deja los resúmenes versionados en `coverage/backend.txt` (salida de `go tool cover -func`) y `coverage/frontend.txt` (tabla de texto de Vitest). Los artefactos pesados (`backend/coverage.out`, `backend/coverage.html`, `frontend/coverage/`) están en `.gitignore`.

### Resultado actual

Backend: 3 paquetes con tests, todos en verde con `-race`; `gofmt` y `go vet` limpios. Frontend: 11 archivos y 168 tests en verde; `lint` y `build` sin errores.

| Paquete / archivo | Cobertura |
| --- | --- |
| `backend/internal/calculator` | 100% statements |
| `backend/internal/api` (incluye `static.go`) | 100% statements |
| `backend/internal/config` | 100% statements |
| `backend/cmd/server` | 0% (ver abajo) |
| **Total backend** | **84.3%** |
| `frontend/src/domain/*` (validation, format, operations) | 100% líneas / ramas |
| `frontend/src/api/*` (calculatorClient, errorMessages) | 100% líneas / ramas |
| `frontend/src/hooks/useCalculator.ts` | 100% líneas / ramas |
| `frontend/src/components/*` | 100% líneas / ramas |
| `frontend/src/App.tsx` | 100% |
| **Total frontend** | **100% líneas, 100% ramas** |

Vitest falla si `src/api`, `src/domain` o `src/hooks` bajan del 85% (`coverage.thresholds` en `vite.config.ts`).

### Qué queda sin cubrir y por qué

- `backend/cmd/server/main.go` (`main`, `run`, `newServer`, `shutdown`): solo cablea config, logger, router y `http.Server` con apagado ordenado por señal. Probarlo requiere levantar un proceso real y enviarle señales, lo que da poco valor frente a su coste. Todo lo que hace el servidor se prueba a través de `api.NewRouter` y `api.WithStatic`, que son exactamente los handlers que usa `main`. El arranque real y el apagado con `SIGTERM` se verificaron a mano (ver [Docker](#docker)).
- `frontend/src/main.tsx` (montaje de React) y `src/api/types.ts` (solo tipos) están excluidos de la cobertura: no tienen lógica ejecutable.

### Decisiones de testing

- **Solo librería estándar en Go** (`testing`, `net/http/httptest`), sin dependencias nuevas. Los tests son table-driven y los errores se comprueban con `errors.Is` contra los errores centinela del dominio, también cuando vienen envueltos con `%w`.
- **¿Por qué `httptest`?** Ejecuta el `http.Handler` real (router + middlewares) en memoria, sin abrir puertos. Así los tests son rápidos, deterministas y aptos para `-race`, y prueban el contrato HTTP completo: status, `Content-Type`, cuerpo JSON y cabeceras CORS.
- **Handler aislado del cálculo:** `NewHandler` recibe una `CalculateFunc`. Los tests usan `calculator.Calculate` real para el contrato de punta a punta, y stubs para forzar rutas difíciles de alcanzar (error inesperado → 500 registrado sin filtrar detalles; fallo de codificación JSON).
- **Middlewares probados por separado y en cadena:** CORS (preflight 204 sin llamar al siguiente handler, origen configurado y no reflejado), Recover (panic → 500 JSON y stack en el log), Logging (una línea JSON con método, ruta, status y duración, incluido el 200 implícito) y el orden de `chain`. Los logs se capturan en un buffer con mutex para que `-race` no dé falsos positivos.
- **Static sobre un directorio temporal** (`t.TempDir()`): archivos existentes, caché inmutable en `/assets/`, fallback SPA, 404 para assets inexistentes, path traversal contenido y que `/api/*` y `/healthz` lleguen siempre a la API (sus 404/405 no se tapan con `index.html`).
- **Floats:** `0.1+0.2` se verifica como la suma IEEE-754 cruda (`0.30000000000000004`) en el backend, y como `0.3` tras `formatResult` en el frontend. Redondear para mostrar es responsabilidad del frontend.
- **¿Por qué mockear `fetch`?** El cliente es la frontera de red. Con `vi.stubGlobal('fetch', …)` se prueban, sin servidor, éxito, errores 4xx/5xx con el JSON de error, respuestas no JSON (p. ej. un 502 HTML de un proxy), error de red, timeout de 8 s con fake timers y cancelación por el llamador. El mock respeta `AbortSignal` como el `fetch` real.
- **Hook y componentes mockean `calculate`, no `fetch`:** así los tests de `useCalculator` y `CalculatorForm` controlan con promesas diferidas el orden exacto de loading → success/error, y no dependen de detalles HTTP que ya cubre el test del cliente.
- **Testing Library por rol y label:** las consultas usan `getByRole`, `getByLabelText` y la descripción accesible (`aria-describedby`), nunca clases CSS, con `user-event` para la interacción real (tecleo, clic, Enter, flechas en los radios).
- **Los tests se compilan con la app:** están dentro de `src/`, así que `npm run build` (`tsc -b`) y `npm run lint` también los verifican.

### Hallazgos (comportamiento actual, sin cambios)

Los tests documentan estos comportamientos tal como están:

1. **405 y 404 no siguen el contrato JSON de error.** Los genera `http.ServeMux` como `text/plain` (`Method Not Allowed`, con cabecera `Allow: POST`), no como `{"error":{...}}`. Verificado también con `curl` (`GET /api/v1/calculate` → 405).
2. **No se valida el `Content-Type` de la petición.** Un `POST` con `text/plain` y JSON válido devuelve 200.
3. **Un body de más de 1 MiB devuelve 400 `INVALID_JSON`**, no 413.
4. **Un body `null` devuelve 400 `UNKNOWN_OPERATION`**, no `INVALID_JSON`.
5. **Caso latente en `useCalculator`:** si `calculate` rechazara con un `AbortError` sin que el hook hubiera abortado, el estado se quedaría en `loading`. Hoy es inalcanzable, porque el cliente solo propaga `AbortError` cuando el llamador abortó; cualquier otro caso lo convierte en `TIMEOUT` o `NETWORK_ERROR`.

## Design decisions & assumptions

### Separación en capas

- **Backend:** `calculator` (dominio puro) → `api` (transporte HTTP) → `cmd/server` (composición). `calculator.Calculate` no tiene estado, E/S ni logging, así que se prueba con tablas de entrada/salida sin mocks. `api.Handler` recibe la función de cálculo por inyección (`CalculateFunc`), lo que permite sustituirla en tests sin interfaces artificiales. `main` solo ensambla piezas.
- **Frontend:** `domain/` (funciones puras: catálogo, validación, formato) y `api/` (único lugar que conoce `fetch` y `Response`) no dependen de React. `useCalculator` encapsula el ciclo de vida de la petición (loading, aborto, doble envío) y los componentes solo renderizan estado. `operations.ts` es el catálogo único: etiquetas, símbolos y aridad salen de ahí, así que añadir una operación no obliga a tocar varios componentes.

### Uso de `float64`

- JSON no distingue enteros de decimales y JavaScript representa todo número como IEEE-754 doble precisión. Usar `float64` en Go hace que el valor sea **el mismo bit a bit** a ambos lados del cable, sin conversiones ni pérdidas en la frontera.
- Consecuencias asumidas: los enteros son exactos hasta 2^53, hay ~15-17 dígitos significativos y aparece el ruido binario típico (`0.1 + 0.2 = 0.30000000000000004`). El backend devuelve el valor crudo (es el resultado correcto en IEEE-754) y el frontend redondea **solo para mostrar** con `Number(n.toPrecision(12))`.
- `NaN` e `±Inf` no se pueden serializar en JSON, por eso `Calculate` valida siempre el resultado y devuelve `ErrInvalidResult` (422) en lugar de dejar que `encoding/json` falle con un 500.
- Alternativa descartada: decimal de precisión arbitraria (`math/big` o una librería). Daría resultados exactos en base 10, pero el contrato JSON → JS seguiría pasando por `number`, complica `pow`/`sqrt` y se sale de "solo librería estándar" o del alcance.

### Manejo de errores con códigos estables

- El dominio expone errores centinela (`ErrDivisionByZero`, …); `api.mapDomainError` es el **único** sitio que los traduce a status + `code` + `message`, usando `errors.Is` (resiste envoltorios con `%w`).
- El frontend decide qué mostrar por el `code`, nunca por el `message` ni por el status. Así se pueden reescribir los mensajes del servidor, traducirlos o cambiar un status sin romper la UI. El cliente añade sus propios códigos (`NETWORK_ERROR`, `TIMEOUT`, `UNEXPECTED_RESPONSE`) para fallos que nunca llegan a ser una respuesta del contrato, como un 502 HTML de un proxy.
- Errores no previstos y panics: 500 `INTERNAL_ERROR` con mensaje genérico; el detalle y el stack solo van al log estructurado (`slog` JSON), nunca al cliente.
- 400 frente a 422: 400 cuando la petición no cumple el contrato (forma), 422 cuando es válida pero matemáticamente no tiene resultado representable (dominio).

### Validación en ambos lados

- **Cliente: solo sintaxis.** `parseOperand` acepta únicamente números decimales o en notación científica (rechaza `abc`, `1,5`, `Infinity`, `NaN`, `0x10`) y valores no finitos. Da feedback inmediato junto al campo, sin ir a la red.
- **Servidor: todo.** Decodificación estricta (campos desconocidos, contenido extra, tipos, límite de 1 MiB), presencia de operandos según la aridad y reglas de dominio. El servidor nunca confía en que el cliente haya validado: la API también la usan `curl` u otros clientes.
- Las reglas de dominio (división por cero, raíz negativa, resultado no finito) **no** se duplican en el cliente: hay una sola fuente de verdad y no pueden divergir.

### Por qué la lógica va en el backend

- Una sola implementación auditable y testeada de las reglas, compartible por cualquier cliente futuro (móvil, CLI, otra web).
- La UI no necesita saber qué combinaciones son inválidas: muestra lo que dice el servidor según el `code`.
- Coste asumido: cada cálculo es un viaje de red. Para una calculadora es despreciable, y el cliente lo gestiona con un timeout de 8 s, cancelación y protección contra doble envío.

### Despliegue en un solo contenedor

- Con `STATIC_DIR`, el mismo binario sirve frontend y API en **un único origen**: no hace falta CORS ni un proxy aparte, y hay una sola imagen que versionar.
- `WithStatic` se aplica fuera del router de la API y deja pasar `/api/*` y `/healthz` intactos, para que los 404/405 de la API no se conviertan en `index.html`. Las rutas sin extensión hacen fallback a `index.html` (SPA); los assets inexistentes dan 404 para no responder un `.js` con HTML.
- Imagen final distroless `nonroot`: superficie mínima, sin shell, ~6 MB de binario más el `dist/`.

### Trade-offs y supuestos

- **Sin framework HTTP ni de estado:** más código explícito (decodificación, middlewares, unión discriminada en el hook) a cambio de cero dependencias y control total del contrato.
- **Un endpoint genérico** (`/calculate` con `operation`) en lugar de uno por operación: el contrato y el cliente son más simples, a costa de validar `operation` en tiempo de ejecución.
- **`percentage` = `a * b / 100`** ("a por ciento de b"), tal como dice el enunciado; es una de varias interpretaciones posibles de "porcentaje".
- **`sqrt` ignora `b`** si se envía, en vez de rechazarlo, para que el cliente pueda mandar siempre la misma forma.
- **CORS con un único origen configurable**, no una lista: suficiente para un frontend; con varios orígenes habría que validar `Origin` contra una lista.
- **405/404 en `text/plain`**, no en el formato de error del contrato (ver Hallazgos). Se dejó así porque no forma parte de los códigos que consume el frontend.
- **Sin `HEALTHCHECK` en la imagen** a cambio de una imagen distroless sin herramientas; el chequeo se delega al orquestador vía `/healthz`.
- **Sin persistencia, autenticación ni rate limiting:** fuera del alcance de una calculadora sin estado.
