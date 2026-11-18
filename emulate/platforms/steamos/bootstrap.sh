#!/usr/bin/env bash
# platforms/steamos/bootstrap.sh - set retro-pi up on SteamOS, beside Steam.
#
# SteamOS keeps its root filesystem read-only, so nothing here uses pacman:
# RetroArch and ES-DE are AppImages in ~/Applications, and Game Mode reaches
# them through non-Steam shortcuts. Safe to re-run.
#
#   platforms/steamos/bootstrap.sh                # check tools, write launchers
#   platforms/steamos/bootstrap.sh --steam        # also add them to Steam
#   platforms/steamos/bootstrap.sh --controllers  # Bluetooth Xbox pads (sudo)

set -o errexit
set -o nounset
set -o pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../../lib/common.sh
. "$ROOT/lib/common.sh"
# shellcheck source=../../lib/platform.sh
. "$ROOT/lib/platform.sh"

add_to_steam=0
controllers=0
for arg in "$@"; do
  case "$arg" in
    --steam) add_to_steam=1 ;;
    --controllers) controllers=1 ;;
    -h|--help) sed -n '2,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown option: $arg" ;;
  esac
done

detect_platform
info "retro-pi SteamOS bootstrap"
step "detected: $(platform_label)"
[[ "$RETROPI_IS_STEAMOS" == "1" ]] || \
  die "this script is for SteamOS; on Debian use platforms/debian/bootstrap.sh"

# --- tools ----------------------------------------------------------------------
# All of these ship in the SteamOS image; a missing one cannot be installed
# without unlocking the root filesystem, so report rather than install.
missing=""
for tool in python3 curl unzip 7z file rsync git; do
  have "$tool" || missing="$missing $tool"
done
[[ -z "$missing" ]] || die "missing from this SteamOS image:$missing"
ok "tools present: python3 curl unzip 7z file rsync git"

ensure_dir "$HOME/Applications"

# --- launchers ------------------------------------------------------------------
# Desktop entries are what SteamOS's "Add to Steam" takes, and they also put
# the frontend in the desktop-mode menu.
apps="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ensure_dir "$apps"
retropi="$(cd "$ROOT/../bin" 2>/dev/null && pwd)/retropi"
[[ -x "$retropi" ]] || retropi="$ROOT/bin/retropi"
arcade_url="${RETROPI_ARCADE_URL:-https://bamr87.github.io/rewind-arcade/}"

# write_desktop <file> <name> <comment> <exec> <icon>
write_desktop() {
  [[ "$RETROPI_DRY_RUN" == "1" ]] && { step "dry run: would write $1"; return 0; }
  cat > "$1" <<__D__
[Desktop Entry]
Type=Application
Name=$2
Comment=$3
Exec=$4
Icon=$5
Terminal=false
Categories=Game;Emulator;
__D__
  chmod +x "$1"
  ok "launcher: $1"
}

esde_desktop="$apps/rewind-arcade-es-de.desktop"
write_desktop "$esde_desktop" "Rewind Arcade" \
  "ES-DE game library (RetroArch + libretro cores)" \
  "$retropi frontend launch" "applications-games"

browser_desktop=""
if flatpak info org.mozilla.firefox >/dev/null 2>&1; then
  browser_desktop="$apps/rewind-arcade-browser.desktop"
  write_desktop "$browser_desktop" "Rewind Arcade (Browser)" \
    "Original browser recreations, full screen" \
    "flatpak run org.mozilla.firefox --kiosk $arcade_url" "applications-games"
else
  warn "Firefox Flatpak not found; skipping the browser arcade launcher"
fi

# --- Steam ----------------------------------------------------------------------
# steamos-add-to-steam is SteamOS's own "Add to Steam": it asks the running
# Steam client to add the shortcut, so shortcuts.vdf is never edited behind it.
# steam_has <name> - true when a shortcut with exactly this AppName exists.
# shortcuts.vdf is binary VDF: \x01AppName\x00<name>\x00. Matching the bare
# string would let "Rewind Arcade (Browser)" stand in for "Rewind Arcade".
# Steam writes the file a moment after an add, so a re-run straight after
# --steam can still duplicate; wait a few seconds between runs.
steam_has() {
  local f
  for f in "$HOME"/.local/share/Steam/userdata/*/config/shortcuts.vdf; do
    [[ -f "$f" ]] || continue
    python3 - "$f" "$1" <<'__PY__' && return 0
import re, sys
data = open(sys.argv[1], "rb").read()
want = sys.argv[2].encode()
names = re.findall(rb"\x01appname\x00([^\x00]*)\x00", data, re.I)
sys.exit(0 if want in names else 1)
__PY__
  done
  return 1
}

if [[ "$add_to_steam" == "1" ]]; then
  have steamos-add-to-steam || die "steamos-add-to-steam not found"
  pgrep -x steam >/dev/null 2>&1 || die "Steam is not running; start it, then re-run with --steam"
  for d in "$esde_desktop" $browser_desktop; do
    name="$(sed -n 's/^Name=//p' "$d" | head -1)"
    if steam_has "$name"; then
      ok "already in Steam: $name"
    else
      run steamos-add-to-steam "$d"
      ok "added to Steam: $name"
    fi
  done
fi

# --- controllers ------------------------------------------------------------------
# The one step that writes outside $HOME: a udev hwdb override in /etc, which
# SteamOS keeps across OS updates. See xbox-bluetooth-joystick.hwdb for why.
if [[ "$controllers" == "1" ]]; then
  hwdb_src="$ROOT/platforms/steamos/xbox-bluetooth-joystick.hwdb"
  hwdb_dest="/etc/udev/hwdb.d/70-retropi-xbox-bluetooth.hwdb"
  if cmp -s "$hwdb_src" "$hwdb_dest" 2>/dev/null; then
    ok "controller override already installed: $hwdb_dest"
  else
    step "installing $hwdb_dest (needs your password)"
    run sudo install -D -m 0644 "$hwdb_src" "$hwdb_dest"
    run sudo systemd-hwdb update
    ok "installed $hwdb_dest"
  fi
  run sudo udevadm trigger --subsystem-match=input --action=change
  step "if a pad is still not seen, switch it off and on again"
fi

log ""
info "bootstrap complete"
log "Next:"
log "  ./bin/retropi install      # RetroArch + ES-DE AppImages, cores, config"
log "  ./bin/retropi doctor"
[[ "$add_to_steam" == "1" ]] || log "  platforms/steamos/bootstrap.sh --steam   # Game Mode shortcuts"
[[ "$controllers" == "1" ]] || log "  platforms/steamos/bootstrap.sh --controllers   # Xbox pads over Bluetooth"
