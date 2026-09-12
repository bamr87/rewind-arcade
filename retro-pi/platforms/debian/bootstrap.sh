#!/usr/bin/env bash
# platforms/debian/bootstrap.sh - get a Debian-family machine ready to run retro-pi.
#
# Targets Debian 12 (bookworm) and 13 (trixie), and what is built on them:
# Raspberry Pi OS, Ubuntu, Linux Mint. Safe to re-run.
#
#   platforms/debian/bootstrap.sh              # desktop machine
#   platforms/debian/bootstrap.sh --headless   # server: also a virtual display

set -o errexit
set -o nounset
set -o pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../../lib/common.sh
. "$ROOT/lib/common.sh"
# shellcheck source=../../lib/platform.sh
. "$ROOT/lib/platform.sh"

headless=0
for arg in "$@"; do
  case "$arg" in
    --headless) headless=1 ;;
    -h|--help) sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown option: $arg" ;;
  esac
done

detect_platform
info "retro-pi Debian bootstrap"
step "detected: $(platform_label) ${RETROPI_DISTRO:+($RETROPI_DISTRO)}"

[[ "$RETROPI_OS" == "linux" ]] || \
  die "this script is for Debian-family Linux; on a Mac use platforms/macos/bootstrap.sh"
have apt-get || \
  die "expected apt-get (Debian, Ubuntu, Raspberry Pi OS). Install dependencies manually and run ./bin/retropi doctor"

# --- packages -----------------------------------------------------------------
step "updating package lists"
run sudo apt-get update

# `file` lets retro-pi check that a core matches RetroArch's architecture.
# p7zip-full still exists on trixie as a transitional package for 7zip.
step "installing dependencies"
run sudo apt-get install -y --no-install-recommends \
  python3 curl unzip rsync git p7zip-full ca-certificates file

# --- RetroArch ----------------------------------------------------------------
if [[ -x /opt/retropie/emulators/retroarch/bin/retroarch ]]; then
  ok "RetroPie's RetroArch detected - using it"
elif have retroarch; then
  ok "RetroArch already installed: $(command -v retroarch)"
else
  step "installing RetroArch from apt"
  run sudo apt-get install -y retroarch || {
    warn "apt could not install retroarch."
    log ""
    log "Options:"
    log "  * RetroPie-Setup (full stack):  https://retropie.org.uk/docs/Manual-Installation/"
    log "  * build RetroArch from source:  https://docs.libretro.com/development/retroarch/compilation/linux-and-bsd/"
  }
fi

# --- display ------------------------------------------------------------------
if [[ "$headless" == "1" ]]; then
  step "installing a virtual display for headless runs"
  run sudo apt-get install -y --no-install-recommends xvfb xauth
elif ! platform_has_display; then
  log ""
  warn "no display in this shell (normal over SSH or on a server)"
  log "  Games need a desktop session. To test without one, re-run with --headless,"
  log "  then: tools/run-rom.sh nes --headless --frames 120 --screenshot /tmp/shot.png"
fi

log ""
info "bootstrap complete"
log "Next:"
log "  ./bin/retropi install"
log "  ./bin/retropi doctor"
