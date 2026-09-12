#!/usr/bin/env bash
# platforms/raspberrypi/bootstrap.sh - get a Raspberry Pi ready to run retro-pi.
#
# Targets Raspberry Pi OS (bookworm or trixie) on a Pi 4/5 (arm64) or a Pi 3
# (armhf). Installs through platforms/debian/bootstrap.sh, then adds board advice.
# Safe to re-run.

set -o errexit
set -o nounset
set -o pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../../lib/common.sh
. "$ROOT/lib/common.sh"
# shellcheck source=../../lib/platform.sh
. "$ROOT/lib/platform.sh"

detect_platform
info "retro-pi Raspberry Pi bootstrap"
step "detected: $(platform_label)"

if [[ "$RETROPI_IS_PI" != "1" ]]; then
  warn "this does not look like a Raspberry Pi - platforms/debian/bootstrap.sh is the generic path"
fi

# Packages and RetroArch are the same as any Debian machine.
"$ROOT/platforms/debian/bootstrap.sh" "$@"

# --- performance notes --------------------------------------------------------
log ""
info "performance notes for this board"
case "${RETROPI_PI_MODEL:-}" in
  *"Raspberry Pi 5"*)
    log "  Pi 5: comfortable through PS1/N64. Dreamcast and PSP are workable."
    log "  Prefer the accuracy cores (snes9x, mupen64plus-next, swanstation)." ;;
  *"Raspberry Pi 4"*)
    log "  Pi 4: solid through PS1. N64 and Dreamcast need per-game tuning."
    log "  Make sure you are on the 64-bit OS for the best core builds." ;;
  *"Raspberry Pi 3"*)
    log "  Pi 3: great up to 16-bit. Use the fast cores:"
    log "    ./bin/retropi config set emulators.snes snes9x2010"
    log "    ./bin/retropi config set emulators.psx pcsx-rearmed" ;;
  *)
    log "  Unknown board - run ./bin/retropi doctor after setup." ;;
esac

# --- storage ------------------------------------------------------------------
log ""
if [[ -d /media/pi ]] || [[ -d /media/"$USER" ]]; then
  info "external storage detected under /media"
  log "  Point the ROM library at it instead of the SD card:"
  log "    ./bin/retropi config set paths.roms /media/$USER/<drive>/roms"
fi

log ""
info "bootstrap complete"
log "Next:"
log "  ./bin/retropi install"
log "  ./bin/retropi doctor"
