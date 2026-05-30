# ============================================================================
# ClassDesk (attendly) — developer commands
# Run `make` or `make help` to see everything.
# ============================================================================

SHELL := /bin/bash
.DEFAULT_GOAL := help
MAKEFLAGS += --no-print-directory

# Tools / config (override on the CLI, e.g. `make seed OWNER_EMAIL=me@x.lk`)
PNPM      ?= pnpm
WRANGLER  ?= npx wrangler
D1_NAME   ?= tuition-db
API_DIR   := apps/api
API_URL   ?= http://localhost:8787

# Owner-seed defaults (first-boot account)
OWNER_EMAIL    ?= owner@vidya.lk
OWNER_NAME     ?= Class Owner
OWNER_PASSWORD ?= changeme123
ORG_NAME       ?= ClassDesk

.PHONY: help up install env migrate migrate-remote reset-db \
        backend api admin dev seed health \
        typecheck build lint stop clean

## ---- Help --------------------------------------------------------------

help: ## Show this help
	@echo ""
	@echo "  ClassDesk — make targets"
	@echo ""
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
	@echo ""

## ---- Setup -------------------------------------------------------------

up: install env migrate ## First-time setup: install deps, create env, migrate local DB
	@echo ""
	@echo "  Setup complete. Next:"
	@echo "    make backend     # terminal 1  (API on :8787)"
	@echo "    make admin       # terminal 2  (portal on :5173)"
	@echo "    make seed        # once, to create the owner account"
	@echo "    open http://localhost:5173"
	@echo ""

install: ## Install all workspace dependencies
	$(PNPM) install

env: ## Create apps/api/.dev.vars from the example if it doesn't exist
	@if [ ! -f $(API_DIR)/.dev.vars ]; then \
		cp $(API_DIR)/.dev.vars.example $(API_DIR)/.dev.vars; \
		echo "Created $(API_DIR)/.dev.vars — set JWT_SECRET / ENCRYPTION_KEY before production."; \
	else \
		echo "$(API_DIR)/.dev.vars already exists — leaving it untouched."; \
	fi

## ---- Database ----------------------------------------------------------

migrate: ## Apply D1 migrations to the LOCAL database
	cd $(API_DIR) && $(WRANGLER) d1 migrations apply $(D1_NAME) --local

migrate-remote: ## Apply D1 migrations to the REMOTE (production) database
	cd $(API_DIR) && $(WRANGLER) d1 migrations apply $(D1_NAME) --remote

reset-db: ## Wipe the local D1 state and re-apply migrations (destructive)
	rm -rf $(API_DIR)/.wrangler/state/v3/d1
	cd $(API_DIR) && $(WRANGLER) d1 migrations apply $(D1_NAME) --local
	@echo "Local DB reset. Run 'make seed' to recreate the owner."

## ---- Run ---------------------------------------------------------------

backend: ## Run the API worker (Cloudflare Worker on :8787)
	$(PNPM) --filter @tuition/api dev

api: backend ## Alias for 'backend'

admin: ## Run the admin portal (Vite on :5173)
	$(PNPM) --filter @tuition/admin dev

dev: ## Run backend + admin together (Ctrl-C stops both)
	@$(MAKE) -j2 backend admin

## ---- First-boot & checks ----------------------------------------------

seed: ## Seed the first owner via /api/setup (needs backend running; override OWNER_* vars)
	curl -fsS -X POST $(API_URL)/api/setup \
		-H 'content-type: application/json' \
		-d '{"email":"$(OWNER_EMAIL)","name":"$(OWNER_NAME)","password":"$(OWNER_PASSWORD)","org_name":"$(ORG_NAME)"}' \
		&& echo "" && echo "Owner seeded: $(OWNER_EMAIL) (password: $(OWNER_PASSWORD))"

health: ## Ping the backend health endpoint
	@curl -fsS $(API_URL)/api/health && echo ""

## ---- Quality -----------------------------------------------------------

typecheck: ## Typecheck every workspace (turbo)
	$(PNPM) typecheck

build: ## Production build of every workspace (turbo)
	$(PNPM) build

lint: ## Lint every workspace (turbo)
	$(PNPM) lint

## ---- Utilities ---------------------------------------------------------

stop: ## Stop local dev servers (wrangler + vite)
	-@pkill -f "wrangler dev" 2>/dev/null || true
	-@pkill -f "vite" 2>/dev/null || true
	@echo "Stopped local dev servers."

clean: ## Remove build artifacts and all node_modules
	rm -rf node_modules apps/*/node_modules packages/*/node_modules
	rm -rf apps/admin/dist apps/*/dist .turbo apps/*/.turbo packages/*/.turbo
	find . -name '*.tsbuildinfo' -not -path '*/node_modules/*' -delete
	@echo "Cleaned. Run 'make install' to restore dependencies."
