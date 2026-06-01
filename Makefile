# ============================================================================
# attendly — developer commands (Go backend + SQLite, React admin, Expo mobile)
# Run `make` or `make help` to see everything.
# ============================================================================

SHELL := /bin/bash
.DEFAULT_GOAL := help
MAKEFLAGS += --no-print-directory

PNPM     ?= pnpm
GO       ?= go
API_DIR  := apps/api
ENV_FILE := $(API_DIR)/.env
API_URL  ?= http://localhost:8787

# Owner-seed defaults (first-boot account) — override on the CLI.
OWNER_EMAIL    ?= owner@attendly.lk
OWNER_NAME     ?= Class Owner
OWNER_PASSWORD ?= changeme123
ORG_NAME       ?= attendly

.PHONY: help up env install backend admin dev \
        test test-go build build-go fmt vet lint tidy \
        docker-build docker-up docker-down docker-logs \
        seed health stop clean

## ---- Help --------------------------------------------------------------

help: ## Show this help
	@echo ""
	@echo "  attendly — make targets"
	@echo ""
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'
	@echo ""

## ---- Setup -------------------------------------------------------------

up: install env tidy ## First-time setup: deps, local env (with dev secrets), Go modules
	@echo ""
	@echo "  Ready. Next:"
	@echo "    make backend   # terminal 1  (Go API on :8787, live logs)"
	@echo "    make admin     # terminal 2  (admin portal on :5173)"
	@echo "    make seed      # once the backend is up, create the owner"
	@echo ""

install: ## Install JS workspace dependencies (admin, mobile, shared)
	$(PNPM) install

env: ## Create $(ENV_FILE) from the example, generating dev secrets if absent
	@if [ ! -f $(ENV_FILE) ]; then \
		cp $(API_DIR)/.env.example $(ENV_FILE); \
		jwt=$$(openssl rand -base64 32 | tr -d '\n'); \
		enc=$$(openssl rand -base64 32 | tr -d '\n'); \
		/usr/bin/sed -i '' "s|^JWT_SECRET=.*|JWT_SECRET=$$jwt|" $(ENV_FILE) 2>/dev/null || sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$$jwt|" $(ENV_FILE); \
		/usr/bin/sed -i '' "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$$enc|" $(ENV_FILE) 2>/dev/null || sed -i "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$$enc|" $(ENV_FILE); \
		echo "Created $(ENV_FILE) with generated dev secrets."; \
	else \
		echo "$(ENV_FILE) already exists — leaving it untouched."; \
	fi

## ---- Run ---------------------------------------------------------------

backend: ## Run the Go API locally on :8787 with live logs
	cd $(API_DIR) && $(GO) run ./cmd/server

admin: ## Run the admin portal (Vite on :5173)
	$(PNPM) --filter @tuition/admin dev

dev: ## Run backend + admin together (Ctrl-C stops both)
	@$(MAKE) -j2 backend admin

## ---- Quality / tests ---------------------------------------------------

test: test-go ## Run all tests (Go race tests + JS typecheck)
	$(PNPM) typecheck

test-go: ## Run Go tests with the race detector
	cd $(API_DIR) && $(GO) test -race ./...

build: build-go ## Build the Go binary + the admin portal
	$(PNPM) --filter @tuition/admin build

build-go: ## Build the static Go server binary into apps/api-go/bin
	cd $(API_DIR) && CGO_ENABLED=0 $(GO) build -trimpath -ldflags="-s -w" -o bin/attendly-api ./cmd/server

fmt: ## gofmt the Go code
	cd $(API_DIR) && $(GO) fmt ./...

vet: ## go vet the Go code
	cd $(API_DIR) && $(GO) vet ./...

lint: ## golangci-lint the Go code (if installed)
	cd $(API_DIR) && golangci-lint run ./... || echo "golangci-lint not installed — skipping"

tidy: ## Tidy + download Go modules
	cd $(API_DIR) && $(GO) mod tidy

## ---- Docker ------------------------------------------------------------

docker-build: ## Build the backend Docker image
	docker compose build

docker-up: env ## Build + start the backend container (:8787)
	docker compose up --build -d
	@echo "Backend container up on $(API_URL)"

docker-down: ## Stop the backend container
	docker compose down

docker-logs: ## Tail backend container logs
	docker compose logs -f backend

## ---- First-boot & checks ----------------------------------------------

seed: ## Seed the first owner via /api/setup (backend must be running)
	@curl -fsS $(API_URL)/api/health >/dev/null 2>&1 || { \
		echo "✗ Backend not reachable at $(API_URL). Start it first: make backend"; exit 1; }
	@curl -fsS -X POST $(API_URL)/api/setup \
		-H 'content-type: application/json' \
		-d '{"email":"$(OWNER_EMAIL)","name":"$(OWNER_NAME)","password":"$(OWNER_PASSWORD)","org_name":"$(ORG_NAME)"}' \
		&& echo "" && echo "Owner seeded: $(OWNER_EMAIL)" \
		|| { echo ""; echo "If 403: an owner already exists — just log in."; exit 1; }

health: ## Ping the backend health endpoint
	@curl -fsS $(API_URL)/api/health && echo ""

## ---- Utilities ---------------------------------------------------------

stop: ## Stop local dev servers
	-@pkill -f "cmd/server" 2>/dev/null || true
	-@pkill -f "attendly-api" 2>/dev/null || true
	-@pkill -f "vite" 2>/dev/null || true
	@echo "Stopped local dev servers."

clean: ## Remove build artifacts and dependencies
	rm -rf node_modules apps/*/node_modules packages/*/node_modules
	rm -rf apps/admin/dist $(API_DIR)/bin .turbo apps/*/.turbo packages/*/.turbo
	@echo "Cleaned. Run 'make up' to restore."
