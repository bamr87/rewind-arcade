# Rewind Arcade — play, emulate, catalog.
#
# Each pillar has its own interface. These targets are the things you type often.

SHELL := /bin/bash

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@printf '\nRewind Arcade — retro gaming, every format\n\n'
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@printf '\nPillars:  ./bin/retropi --help   ./bin/cartidx --help   npm run dev --prefix arcade\n\n'

# --- play ---------------------------------------------------------------------

.PHONY: play
play: ## Browser arcade (Vite dev server)
	npm run dev --prefix arcade

.PHONY: arcade-build
arcade-build: ## Type-check and build the arcade into arcade/dist/
	npm run build --prefix arcade

.PHONY: arcade-preview
arcade-preview: ## Serve the production arcade build
	npm run preview --prefix arcade

.PHONY: pages-build
pages-build: ## GitHub Pages artifact (vendor EmulatorJS + production build)
	npm run emulatorjs --prefix arcade
	npm run build --prefix arcade

.PHONY: pages
pages: pages-build ## Build the Pages artifact and serve arcade/dist/ (no Vite plugins)
	python3 -m http.server 4173 --bind 127.0.0.1 --directory arcade/dist

# --- emulate ------------------------------------------------------------------

.PHONY: doctor
doctor: ## Audit this machine for RetroArch / cores / frontend
	@./bin/retropi doctor

.PHONY: emulate-install
emulate-install: ## Install RetroArch, cores, and generated frontend config
	@./bin/retropi install

.PHONY: emulate-build
emulate-build: ## Regenerate EmulationStation + RetroArch config
	@./bin/retropi build

.PHONY: systems
systems: ## List emulation systems
	@./bin/retropi systems list

# --- catalog ------------------------------------------------------------------

.PHONY: catalog-status
catalog-status: ## Show catalog libraries and reference data
	@./bin/cartidx status

.PHONY: catalog-systems
catalog-systems: ## List dump-capable catalog systems
	@./bin/cartidx systems

# --- quality ------------------------------------------------------------------

.PHONY: test
test: ## Run emulate + catalog test suites, then the generated-docs checks
	@$(MAKE) -C emulate test
	@$(MAKE) -C catalog test
	@$(MAKE) docs-check

.PHONY: check
check: ## Arcade build + emulate check + catalog check + generated-docs checks
	npm run build --prefix arcade
	@$(MAKE) -C emulate check
	@$(MAKE) -C catalog check
	@$(MAKE) docs-check

# --- docs ---------------------------------------------------------------------

.PHONY: docs
docs: ## Regenerate the systems table and the docs index from their sources
	python3 tools/gen_systems_table.py
	python3 tools/docs_index.py --write

.PHONY: docs-check
docs-check: ## Fail when a generated doc is stale (systems table, docs index)
	python3 tools/gen_systems_table.py --check
	python3 tools/docs_index.py --check

.PHONY: ci
ci: ## Run GitHub workflow jobs on this host (see ./bin/ci --help)
	@./bin/ci

.PHONY: ci-act
ci-act: ## Run workflows in containers via nektos/act
	@./bin/ci --act
