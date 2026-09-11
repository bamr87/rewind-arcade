# retro-pi - convenience targets around ./bin/retropi
#
# The CLI is the real interface; these are the things you type often.

SHELL := /bin/bash
RETROPI := ./bin/retropi

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@printf '\nretro-pi - portable retro gaming workspace\n\n'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
	@printf '\nFull CLI: $(RETROPI) --help\n\n'

# --- setup --------------------------------------------------------------------

.PHONY: doctor
doctor: ## Check this machine and report what is missing
	@$(RETROPI) doctor

.PHONY: install
install: ## Install the emulator stack (RetroArch + cores) and build config
	@$(RETROPI) install

.PHONY: build
build: ## Regenerate frontend + emulator configuration
	@$(RETROPI) build

.PHONY: cores
cores: ## Install libretro cores for the enabled systems
	@$(RETROPI) cores install

.PHONY: setup
setup: install build ## Full first-time setup
	@$(RETROPI) doctor

# --- content ------------------------------------------------------------------

.PHONY: scan
scan: ## Inventory the ROM library
	@$(RETROPI) roms scan

.PHONY: bios
bios: ## Report missing BIOS files
	@$(RETROPI) bios check

.PHONY: systems
systems: ## List systems
	@$(RETROPI) systems list

# --- quality ------------------------------------------------------------------

.PHONY: test
test: ## Run the test suite
	@./tests/run.sh

.PHONY: lint
lint: ## Shellcheck every script
	@command -v shellcheck >/dev/null 2>&1 || { \
	  echo "shellcheck not installed (brew install shellcheck / apt install shellcheck)"; exit 1; }
	@shellcheck -S warning -x -e SC2034 bin/retropi lib/*.sh cmd/*.sh platforms/*/*.sh \
	  && shellcheck -S warning -x tests/run.sh tests/lib/*.sh \
	  && echo "shellcheck: clean"

.PHONY: validate
validate: ## Parse every config and manifest
	@$(RETROPI) config validate

.PHONY: check
check: lint validate test ## Everything CI runs

.PHONY: test-linux
test-linux: ## Run the suite in a Linux container (the Raspberry Pi code path)
	@docker build -q -f docker/Dockerfile -t retropi-test . >/dev/null
	@docker run --rm retropi-test

# --- distribution -------------------------------------------------------------

.PHONY: package
package: ## Build a portable archive in dist/
	@$(RETROPI) package

.PHONY: clean
clean: ## Remove generated files (never touches ROMs, BIOS or saves)
	@$(RETROPI) clean
	@rm -rf dist
