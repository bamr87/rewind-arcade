#!/usr/bin/env bash
# lib/config.sh - layered configuration.
#
# Precedence (low to high):
#   config/retropi.yaml      committed defaults
#   config/local.yaml        this machine, gitignored
#   RETROPI_CONFIG=<file>    explicit override
#   RETROPI_<KEY> env vars   e.g. RETROPI_PATHS_ROMS
#
# The merged tree is flattened once into $RETROPI_STATE/config.flat and read
# with grep, so a command doing 50 lookups spawns python once, not 50 times.
# Written for bash 3.2 (macOS system bash): no associative arrays.

RETROPI_YAML="${RETROPI_YAML:-}"

# repo root = parent of lib/
retropi_root() {
  if [[ -n "${RETROPI_ROOT:-}" ]]; then printf '%s' "$RETROPI_ROOT"; return; fi
  local src="${BASH_SOURCE[0]}" dir
  dir="$(cd "$(dirname "$src")/.." && pwd)"
  printf '%s' "$dir"
}

config_init() {
  RETROPI_ROOT="$(retropi_root)"
  RETROPI_STATE="${RETROPI_STATE:-$RETROPI_ROOT/.retropi}"
  RETROPI_YAML="$RETROPI_ROOT/lib/yamlite.py"
  RETROPI_CONFIG_DEFAULT="$RETROPI_ROOT/config/retropi.yaml"
  RETROPI_CONFIG_LOCAL="${RETROPI_CONFIG_LOCAL:-$RETROPI_ROOT/config/local.yaml}"
  RETROPI_FLAT="$RETROPI_STATE/config.flat"
  export RETROPI_ROOT RETROPI_STATE RETROPI_YAML RETROPI_FLAT
}

# yaml <args...> - invoke the parser.
yaml() { python3 "$RETROPI_YAML" "$@"; }

# config_sources - the config files that exist, in merge order.
config_sources() {
  local f
  [[ -f "$RETROPI_CONFIG_DEFAULT" ]] && printf '%s\n' "$RETROPI_CONFIG_DEFAULT"
  [[ -f "$RETROPI_CONFIG_LOCAL" ]] && printf '%s\n' "$RETROPI_CONFIG_LOCAL"
  for f in ${RETROPI_CONFIG:-}; do [[ -f "$f" ]] && printf '%s\n' "$f"; done
  return 0
}

# config_load [--force] - build the flat cache when stale.
# config_load takes an optional --force flag. The callers that pass it live in
# cmd/*.sh, which shellcheck does not see when it checks this file, so SC2120
# ("references arguments, but none are ever passed") is a false positive here.
# shellcheck disable=SC2120
config_load() {
  local force="${1:-}"
  local sources stale=0 src
  sources="$(config_sources)"
  [[ -n "$sources" ]] || die "no config found; expected $RETROPI_CONFIG_DEFAULT"

  if [[ "$force" == "--force" || ! -f "$RETROPI_FLAT" ]]; then
    stale=1
  else
    while IFS= read -r src; do
      [[ -n "$src" ]] || continue
      [[ "$src" -nt "$RETROPI_FLAT" ]] && stale=1
    done <<< "$sources"
  fi

  if [[ "$stale" == "1" ]]; then
    mkdir -p "$RETROPI_STATE"
    debug "rebuilding config cache: $RETROPI_FLAT"
    # `flat` deep-merges every source itself, so a local.yaml list REPLACES
    # the default list rather than appending to it.
    # shellcheck disable=SC2086
    yaml flat $sources > "$RETROPI_FLAT.tmp" || die "failed to parse config"
    mv "$RETROPI_FLAT.tmp" "$RETROPI_FLAT"
  fi
}

# _env_override <dotted.key> - RETROPI_PATHS_ROMS style lookup.
_env_override() {
  local key="$1" var
  var="RETROPI_$(printf '%s' "$key" | tr '[:lower:].' '[:upper:]_')"
  eval "printf '%s' \"\${$var:-}\""
}

# cfg <dotted.key> [default] - one configuration value.
cfg() {
  local key="$1" default="${2-}" val
  val="$(_env_override "$key")"
  if [[ -n "$val" ]]; then printf '%s' "$val"; return 0; fi
  [[ -f "$RETROPI_FLAT" ]] || config_load
  # last match wins: later sources are appended after earlier ones
  val="$(grep -- "^${key}=" "$RETROPI_FLAT" 2>/dev/null | tail -1 | cut -d= -f2-)" || true
  if [[ -z "$val" ]]; then printf '%s' "$default"; else printf '%s' "$val"; fi
}

# cfg_list <dotted.key> - values of a list, one per line.
cfg_list() {
  local key="$1"
  [[ -f "$RETROPI_FLAT" ]] || config_load
  grep -- "^${key}\.[0-9]\{1,\}=" "$RETROPI_FLAT" 2>/dev/null \
    | sed "s/^${key//./\\.}\.//" \
    | sort -t= -k1,1n \
    | cut -d= -f2- || true
}

# cfg_keys <dotted.key> - immediate child keys of a mapping.
cfg_keys() {
  local key="$1"
  [[ -f "$RETROPI_FLAT" ]] || config_load
  grep -- "^${key}\." "$RETROPI_FLAT" 2>/dev/null \
    | sed "s/^${key//./\\.}\.//" \
    | cut -d. -f1 \
    | cut -d= -f1 \
    | awk '!seen[$0]++' || true
}

# --- resolved paths -----------------------------------------------------------
# A configured path may be relative (to the repo) or absolute (an external
# drive, a network mount). path_of() normalizes both.

path_of() {
  local key="$1" default="$2" val
  val="$(cfg "paths.$key" "$default")"
  case "$val" in
    /*|~*) abspath "$val" ;;
    *)     abspath "$RETROPI_ROOT/$val" ;;
  esac
}

roms_dir()        { path_of roms roms; }
bios_dir()        { path_of bios bios; }
saves_dir()       { path_of saves saves; }
screenshots_dir() { path_of screenshots screenshots; }
themes_dir()      { path_of themes themes; }
build_dir()       { path_of build build; }
downloads_dir()   { path_of downloads .retropi/downloads; }
