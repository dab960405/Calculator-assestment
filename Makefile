GO ?= go
NPM ?= npm
COVERAGE_DIR := coverage

IMAGE ?= calculator:latest

.PHONY: test test-backend test-frontend coverage coverage-backend coverage-frontend run docker-build docker-run

## run: build the frontend and serve it plus the API from a single Go process on :8080
run:
	cd frontend && $(NPM) ci && $(NPM) run build
	cd backend && STATIC_DIR=../frontend/dist CORS_ALLOWED_ORIGIN=http://localhost:8080 $(GO) run ./cmd/server

## docker-build: build the single-container image
docker-build:
	docker build -t $(IMAGE) .

## docker-run: run the image on :8080
docker-run:
	docker run --rm -p 8080:8080 $(IMAGE)

## test: run backend and frontend unit tests
test: test-backend test-frontend

## test-backend: run Go tests with the race detector
test-backend:
	cd backend && $(GO) test ./... -race

## test-frontend: run Vitest once
test-frontend:
	cd frontend && $(NPM) test

## coverage: generate backend and frontend coverage reports into ./coverage
coverage: coverage-backend coverage-frontend

coverage-backend:
	mkdir -p $(COVERAGE_DIR)
	cd backend && $(GO) test ./... -race -coverprofile=coverage.out
	cd backend && $(GO) tool cover -func=coverage.out > ../$(COVERAGE_DIR)/backend.txt
	cd backend && $(GO) tool cover -html=coverage.out -o coverage.html
	cat $(COVERAGE_DIR)/backend.txt

coverage-frontend:
	mkdir -p $(COVERAGE_DIR)
	cd frontend && $(NPM) run test:coverage
	cp frontend/coverage/coverage-summary.txt $(COVERAGE_DIR)/frontend.txt
