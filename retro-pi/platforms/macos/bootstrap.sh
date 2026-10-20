#!/usr/bin/env bash
# platforms/macos/bootstrap.sh - get a Mac ready to run retro-pi.
#
# Safe to re-run: every step checks before it acts.

set -o errexit
set -o nounset
set -o pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../../lib/common.sh
. "$ROOT/lib/common.sh"

info "retro-pi macOS bootstrap"

if [[ "$(uname -s)" != "Darwin" ]]; then
  die "this script is for macOS; on a Raspberry Pi use platforms/raspberrypi/bootstrap.sh"
fi

# --- Homebrew -----------------------------------------------------------------
if ! have brew; then
  warn "Homebrew is not installed."
  log ""
  log "Install it first (it is the package manager everything else uses):"
  log '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
  log ""
  die "re-run this script once Homebrew is available"
fi
ok "Homebrew: $(brew --version | head -1)"

# --- command line tools -------------------------------------------------------
step "installing command line dependencies"
for pkg in coreutils rsync p7zip; do
  if brew list --versions "$pkg" >/dev/null 2>&1; then
    debug "$pkg already installed"
  else
    run brew install "$pkg"
  fi
done

# --- RetroArch ----------------------------------------------------------------
if [[ -d /Applications/RetroArch.app ]] || have retroarch; then
  ok "RetroArch already installed"
else
  step "installing RetroArch"
  run brew install --cask retroarch
fi

# --- frontend -----------------------------------------------------------------
if [[ -d /Applications/ES-DE.app ]]; then
  ok "ES-DE already installed"
else
  warn "ES-DE is not in Homebrew and must be installed by hand:"
  log "  1. download the macOS build from https://es-de.org/#Downloads"
  log "  2. drag ES-DE.app to /Applications"
  log "  3. launch it once so it creates ~/.emulationstation"
fi

log ""
info "bootstrap complete"
log "Next:"
log "  ./bin/retropi doctor"
log "  ./bin/retropi install"
