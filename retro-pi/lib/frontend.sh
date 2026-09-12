#!/usr/bin/env bash
# lib/frontend.sh - EmulationStation as a managed part of the framework.
#
# Two frontends read the same es_systems.xml contract:
#
#   es-de             ES-DE (EmulationStation Desktop Edition), macOS + Linux
#   emulationstation  RetroPie's EmulationStation, Raspberry Pi
#
# This file is the ONLY place that knows where either one keeps its files,
# what it is called, or how to install it - the same role lib/platform.sh
# plays for the operating system. Paths are PROBED rather than hardcoded,
# because ES-DE moved its home from ~/.emulationstation to ~/ES-DE in 3.0 and
# RetroPie keeps everything under /opt/retropie.

RETROPI_FE_KIND=""
RETROPI_FE_BIN=""
RETROPI_FE_HOME=""
RETROPI_FE_FLAVOR=""
RETROPI_FE_VERSION=""
_FE_DETECTING=0

# --- discovery ----------------------------------------------------------------

# _fe_app_candidates - possible frontend executables, best first.
_fe_app_candidates() {
  case "$RETROPI_OS" in
    macos)
      printf '%s\n' "/Applications/ES-DE.app/Contents/MacOS/ES-DE"
      printf '%s\n' "$HOME/Applications/ES-DE.app/Contents/MacOS/ES-DE"
      ;;
    *)
      printf '%s\n' "$HOME/Applications/ES-DE.AppImage"
      printf '%s\n' "$HOME/.local/bin/ES-DE.AppImage"
      printf '%s\n' "/opt/retropie/supplementary/emulationstation/emulationstation"
      ;;
  esac
  have es-de && command -v es-de
  have emulationstation && command -v emulationstation
  return 0
}

# _fe_home_candidates - existing config homes, best first. Used only when no
# frontend is installed to derive the answer from.
_fe_home_candidates() {
  printf '%s\n' "$HOME/ES-DE"                                  # ES-DE >= 3.0
  printf '%s\n' "$HOME/.emulationstation"                      # ES-DE 2.x, RetroPie
  printf '%s\n' "/opt/retropie/configs/all/emulationstation"   # RetroPie
  return 0
}

# frontend_detect - resolve kind, binary and home. Safe to call repeatedly.
#
# Guarded against re-entry: resolving the home calls frontend_version, which
# calls frontend_installed, which lazily detects. Without the guard those call
# each other until the process crawls (a `frontend dirs` took 25 seconds).
frontend_detect() {
  [[ "${_FE_DETECTING:-0}" == "1" ]] && return 0
  _FE_DETECTING=1
  local c
  RETROPI_FE_BIN=""
  RETROPI_FE_HOME=""
  RETROPI_FE_FLAVOR="none"
  RETROPI_FE_VERSION=""

  if [[ -n "${RETROPI_FRONTEND_BIN:-}" ]]; then
    # An explicit binary is authoritative. If it is not executable we report
    # "not installed" rather than quietly running some other frontend the user
    # did not ask for.
    [[ -x "$RETROPI_FRONTEND_BIN" ]] && RETROPI_FE_BIN="$RETROPI_FRONTEND_BIN"
  else
    while IFS= read -r c; do
      [[ -n "$c" ]] || continue
      if [[ -x "$c" ]]; then RETROPI_FE_BIN="$c"; break; fi
    done < <(_fe_app_candidates)
  fi

  case "$RETROPI_FE_BIN" in
    *ES-DE*|*es-de*) RETROPI_FE_FLAVOR="es-de" ;;
    *emulationstation*) RETROPI_FE_FLAVOR="emulationstation" ;;
    *) RETROPI_FE_FLAVOR="none" ;;
  esac

  # An explicit override wins outright, even before it exists on disk -- it is
  # a destination, not a discovery hint.
  if [[ -n "${RETROPI_ES_CONFIG_HOME:-}" ]]; then
    RETROPI_FE_HOME="$RETROPI_ES_CONFIG_HOME"
  elif [[ "$RETROPI_FE_FLAVOR" != "none" ]]; then
    # An installed frontend decides its own layout: ES-DE 3.x reads
    # <home>/ES-DE and will NEVER look at a ~/.emulationstation left behind by
    # an older version (or by us). Probing for whatever exists would write our
    # config where the frontend cannot see it.
    RETROPI_FE_HOME="$(frontend_default_home)"
  else
    while IFS= read -r c; do
      [[ -n "$c" ]] || continue
      if [[ -d "$c" ]]; then RETROPI_FE_HOME="$c"; break; fi
    done < <(_fe_home_candidates)
    [[ -n "$RETROPI_FE_HOME" ]] || RETROPI_FE_HOME="$(frontend_default_home)"
  fi

  RETROPI_FE_KIND="$(cfg frontend.kind es-de)"
  export RETROPI_FE_KIND RETROPI_FE_BIN RETROPI_FE_HOME RETROPI_FE_FLAVOR RETROPI_FE_VERSION
  _FE_DETECTING=0
}

frontend_default_home() {
  case "$RETROPI_FE_FLAVOR" in
    es-de)
      # ES-DE 3.0 moved the application data directory from ~/.emulationstation
      # to <home>/ES-DE. Verified against 3.4.1, which creates it on first run.
      local major
      major="$(frontend_version 2>/dev/null | sed -n 's/^ES-DE \([0-9][0-9]*\).*/\1/p')"
      if [[ -n "$major" && "$major" -lt 3 ]]; then
        printf '%s' "$HOME/.emulationstation"
      else
        printf '%s' "$HOME/ES-DE"
      fi
      ;;
    emulationstation)
      if [[ -d /opt/retropie/configs/all/emulationstation ]]; then
        printf '%s' "/opt/retropie/configs/all/emulationstation"
      else
        printf '%s' "$HOME/.emulationstation"
      fi
      ;;
    *)
      # Nothing installed: assume the layout of the configured kind.
      if [[ -d /opt/retropie/configs/all/emulationstation ]]; then
        printf '%s' "/opt/retropie/configs/all/emulationstation"
      elif [[ "$(cfg frontend.kind es-de)" == "emulationstation" ]]; then
        printf '%s' "$HOME/.emulationstation"
      else
        printf '%s' "$HOME/ES-DE"
      fi
      ;;
  esac
}

# _fe_ensure - detect on first use, so callers never depend on call order.
# A no-op while detection is already in flight.
_fe_ensure() {
  [[ "${_FE_DETECTING:-0}" == "1" ]] && return 0
  [[ -n "$RETROPI_FE_HOME" ]] || frontend_detect
  return 0
}

frontend_installed() { _fe_ensure; [[ -n "$RETROPI_FE_BIN" && -x "$RETROPI_FE_BIN" ]]; }
frontend_bin()       { _fe_ensure; printf '%s' "$RETROPI_FE_BIN"; }
frontend_home()      { _fe_ensure; printf '%s' "$RETROPI_FE_HOME"; }
frontend_flavor()    { _fe_ensure; printf '%s' "$RETROPI_FE_FLAVOR"; }

# frontend_version - best effort; ES-DE prints it, RetroPie ES does not always.
#
# Cached: this is called during path resolution, and spawning the frontend once
# per lookup is both slow and risky. Every subprocess gets </dev/null, because
# a GUI binary that blocks on stdin leaves the reading end of the pipe open
# forever -- which hung the test suite until it was fixed.
frontend_version() {
  [[ -n "${RETROPI_FE_VERSION:-}" ]] && { printf '%s' "$RETROPI_FE_VERSION"; return 0; }
  frontend_installed || return 1
  local v
  v="$("$RETROPI_FE_BIN" --version 2>/dev/null </dev/null | head -1 | tr -d '\r')" || true
  [[ -n "$v" ]] && { RETROPI_FE_VERSION="$v"; printf '%s' "$v"; return 0; }
  # macOS app bundles carry it in Info.plist
  local plist="${RETROPI_FE_BIN%/Contents/MacOS/*}/Contents/Info.plist"
  if [[ -f "$plist" ]] && have defaults; then
    v="$(defaults read "${plist%.plist}" CFBundleShortVersionString 2>/dev/null </dev/null || true)"
    [[ -n "$v" ]] && { RETROPI_FE_VERSION="ES-DE $v"; printf '%s' "$RETROPI_FE_VERSION"; return 0; }
  fi
  printf 'unknown'
}

# --- managed directories ------------------------------------------------------
# Both frontends use the same layout beneath their home.

frontend_custom_systems_dir() { printf '%s/custom_systems' "$(frontend_home)"; }
frontend_gamelists_dir()      { printf '%s/gamelists' "$(frontend_home)"; }
frontend_themes_dir()         { printf '%s/themes' "$(frontend_home)"; }
# ES-DE 3.x keeps es_settings.xml in <home>/settings/; RetroPie's
# EmulationStation keeps it at the root of its home.
frontend_settings_file() {
  local home
  home="$(frontend_home)"
  if [[ -d "$home/settings" || "$(frontend_flavor)" == "es-de" ]]; then
    printf '%s/settings/es_settings.xml' "$home"
  else
    printf '%s/es_settings.xml' "$home"
  fi
}

# es_config_dir - where es_systems.xml is installed.
# RetroPie's EmulationStation reads es_systems.xml from its home directly;
# ES-DE wants it under custom_systems/ so it merges with the bundled set.
es_config_dir() {
  if [[ -n "${RETROPI_ES_CONFIG:-}" ]]; then printf '%s' "$RETROPI_ES_CONFIG"; return; fi
  if [[ "$(frontend_flavor)" == "emulationstation" ]]; then
    frontend_home
  else
    frontend_custom_systems_dir
  fi
}

es_installed() { frontend_installed; }

# --- install ------------------------------------------------------------------
# ES-DE publishes per-platform assets on GitLab. Asset URLs are opaque IDs, so
# they are resolved through the releases API rather than constructed.

ESDE_API="${RETROPI_ESDE_API:-https://gitlab.com/api/v4/projects/es-de%2Femulationstation-de/releases}"

# frontend_asset_pattern - the release asset matching this machine.
frontend_asset_pattern() {
  case "$RETROPI_OS:$RETROPI_ARCH" in
    macos:arm64)               printf 'arm64.dmg' ;;
    macos:x86_64)              printf 'x64.dmg' ;;
    linux:aarch64|linux:arm64) printf 'aarch64.AppImage' ;;
    linux:x86_64)              printf 'x64.AppImage' ;;
    *) return 1 ;;
  esac
}

# frontend_resolve_asset - print "<name>\t<url>" for this platform's download.
frontend_resolve_asset() {
  local pattern
  pattern="$(frontend_asset_pattern)" || return 1
  need python3 "required to read the ES-DE release index"
  local json
  json="$(_fe_fetch "$ESDE_API?per_page=1")" || return 1
  printf '%s' "$json" | python3 -c '
import json, sys
pattern = sys.argv[1]
try:
    releases = json.load(sys.stdin)
except Exception:
    sys.exit(1)
if not releases:
    sys.exit(1)
rel = releases[0]
for link in rel.get("assets", {}).get("links", []):
    name = link.get("name", "")
    # SteamDeck and Portable builds share the x64 suffix; take the plain one.
    if name.endswith(pattern) and "SteamDeck" not in name and "Portable" not in name:
        print("%s\t%s\t%s" % (name, link.get("url", ""), rel.get("tag_name", "")))
        sys.exit(0)
sys.exit(1)
' "$pattern"
}

_fe_fetch() {
  if have curl; then curl -fsSL --max-time 45 "$1"
  elif have wget; then wget -qO- "$1"
  else die "need curl or wget"; fi
}

# frontend_install - download and install ES-DE for this platform.
frontend_install() {
  local force="${1:-0}"
  if frontend_installed && [[ "$force" != "1" ]]; then
    ok "frontend already installed: $(frontend_bin)"
    return 0
  fi

  if [[ "$RETROPI_OS" == "linux" && -x /opt/retropie/supplementary/emulationstation/emulationstation ]]; then
    ok "RetroPie's EmulationStation is already present; using it"
    return 0
  fi

  local asset name url tag
  asset="$(frontend_resolve_asset)" || {
    warn "no ES-DE build published for $RETROPI_OS/$RETROPI_ARCH"
    log ""
    log "Install a frontend manually, then re-run \`retropi build\`:"
    log "  https://es-de.org/"
    return 1
  }
  name="$(printf '%s' "$asset" | cut -f1)"
  url="$(printf '%s' "$asset" | cut -f2)"
  tag="$(printf '%s' "$asset" | cut -f3)"

  info "installing ES-DE $tag ($name)"
  local dl
  dl="$(downloads_dir)/$name"
  if [[ -f "$dl" ]]; then
    step "using cached download: $dl"
  else
    step "downloading $name"
    fetch "$url" "$dl" || { error "download failed: $url"; return 1; }
  fi
  [[ "$RETROPI_DRY_RUN" == "1" ]] && { step "dry run: would install $dl"; return 0; }

  case "$name" in
    *.dmg)      _fe_install_dmg "$dl" ;;
    *.AppImage) _fe_install_appimage "$dl" ;;
    *) die "do not know how to install $name" ;;
  esac
}

_fe_install_dmg() {
  local dest
  step "mounting $(basename "$1")"
  dest="$(install_app_from_dmg "$1")" || return 1
  ok "installed $dest"
  frontend_detect
}

_fe_install_appimage() {
  local img="$1" dest
  dest="$HOME/Applications/ES-DE.AppImage"
  ensure_dir "$HOME/Applications"
  step "installing $(basename "$img") to $dest"
  cp "$img" "$dest"
  chmod +x "$dest"
  ok "installed $dest"
  # Only newer AppImage runtimes run without libfuse2 (ES-DE 3.4 does, on a
  # Debian 13 box with just fuse3), so try it rather than guess.
  if [[ "$RETROPI_DRY_RUN" != "1" ]] && ! "$dest" --version </dev/null >/dev/null 2>&1; then
    warn "the AppImage does not start; it most likely needs FUSE"
    step "install it: $(pkg_install_hint "$(appimage_fuse_package)")"
    step "or run without FUSE: $dest --appimage-extract-and-run"
  fi
  frontend_detect
}

# --- launch -------------------------------------------------------------------

frontend_launch() {
  frontend_installed || die "no frontend installed; run: ./bin/retropi frontend install"
  local bin
  bin="$(frontend_bin)"
  info "launching $(frontend_flavor): $bin"
  [[ "$RETROPI_DRY_RUN" == "1" ]] && { step "dry run: would exec $bin"; return 0; }
  "$bin" "$@"
}
