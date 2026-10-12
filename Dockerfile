# syntax=docker/dockerfile:1

# Single image: the Go server answers /api/* and /healthz and serves the built
# frontend from STATIC_DIR for every other path (same origin, so no CORS needed).

ARG NODE_VERSION=24
ARG GO_VERSION=1.24

# ---- 1. Frontend: install exact deps from the lockfile and build static assets ----
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-alpine AS frontend
WORKDIR /src/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

COPY frontend/ ./
# Empty base URL: the browser calls /api/v1/calculate on the same origin.
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

# ---- 2. Backend: static, stripped binary (stdlib only, no go.sum needed) ----
FROM --platform=$BUILDPLATFORM golang:${GO_VERSION}-alpine AS backend
WORKDIR /src/backend

COPY backend/ ./
ARG TARGETOS
ARG TARGETARCH
RUN --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# ---- 3. Runtime: distroless static, no shell or package manager, non-root ----
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app

COPY --from=backend /out/server /app/server
COPY --from=frontend /src/frontend/dist /app/public

ENV PORT=8080 \
    STATIC_DIR=/app/public \
    CORS_ALLOWED_ORIGIN=http://localhost:8080

EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app/server"]
