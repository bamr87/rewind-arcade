#!/usr/bin/env bash
# lib/common.sh - logging, error handling, and shared helpers.
# Sourced by bin/retropi and every cmd/*.sh. Never executed directly.

# --- strict mode (callers may already have set these) -------------------------
set -o errexit
set -o nounset
set -o pipefail

# --- colors (disabled when not a tty or NO_COLOR is set) ----------------------
if [[ -t 2 && -z "${NO_COLOR:-}" ]]; then
  C_RESET=$'\033[0m'; C_DIM=$'\033[2m'; C_BOLD=$'\033[1m'
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
  C_BLUE=$'\033[34m'; C_CYAN=$'\033[36m'
else
  C_RESET=''; C_DIM=''; C_BOLD=''
  C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''; C_CYAN=''
fi

RETROPI_VERBOSE="${RETROPI_VERBOSE:-0}"
RETROPI_DRY_RUN="${RETROPI_DRY_RUN:-0}"
RETROPI_ASSUME_YES="${RETROPI_ASSUME_YES:-0}"

log()     { printf '%s\n' "$*" >&2; }
info()    { printf '%s==>%s %s\n' "$C_BLUE$C_BOLD" "$C_RESET" "$*" >&2; }
step()    { printf '%s  ->%s %s\n' "$C_CYAN" "$C_RESET" "$*" >&2; }
ok()      { printf '%s  ok%s %s\n' "$C_GREEN" "$C_RESET" "$*" >&2; }
warn()    { printf '%swarn%s %s\n' "$C_YELLOW$C_BOLD" "$C_RESET" "$*" >&2; }
error()   { printf '%serror%s %s\n' "$C_RED$C_BOLD" "$C_RESET" "$*" >&2; }
debug()   { [[ "$RETROPI_VERBOSE" == "1" ]] && printf '%sdebug%s %s\n' "$C_DIM" "$C_RESET" "$*" >&2 || true; }
die()     { error "$*"; exit 1; }

# hr <title> - a section rule that survives narrow terminals.
hr() {
  local title="${1:-}"
  local width=72
  if [[ -n "$title" ]]; then
    printf '%s%s %s%s\n' "$C_DIM" "$(printf '%.0s-' $(seq 1 4))" "$title" "$C_RESET" >&2
  else
    printf '%s%s%s\n' "$C_DIM" "$(printf '%.0s-' $(seq 1 $width))" "$C_RESET" >&2
  fi
}

# run <cmd...> - execute, honoring --dry-run and --verbose.
run() {
  if [[ "$RETROPI_DRY_RUN" == "1" ]]; then
    printf '%s  dry%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2
    return 0
  fi
  debug "exec: $*"
  "$@"
}

# have <cmd> - true when a command exists on PATH.
have() { command -v "$1" >/dev/null 2>&1; }

# need <cmd> [hint] - hard requirement with an actionable message.
need() {
  have "$1" && return 0
  die "required command not found: $1${2:+ ($2)}"
}

# confirm <prompt> - yes/no gate; auto-yes under --yes or non-interactive CI.
confirm() {
  local prompt="$1" reply
  [[ "$RETROPI_ASSUME_YES" == "1" ]] && return 0
  if [[ ! -t 0 ]]; then
    warn "non-interactive shell and --yes not given; assuming NO for: $prompt"
    return 1
  fi
  printf '%s? %s [y/N] ' "$C_YELLOW$C_BOLD$C_RESET" "$prompt" >&2
  read -r reply
  [[ "$reply" =~ ^[Yy] ]]
}

# --- path helpers -------------------------------------------------------------

# abspath <path> - resolve without requiring the file to exist (no realpath dep).
abspath() {
  local p="$1"
  case "$p" in
    /*) ;;
    ~*) p="${p/#\~/$HOME}" ;;
    *)  p="$PWD/$p" ;;
  esac
  # collapse /./ and /../ textually
  local out=() part
  local IFS=/
  for part in $p; do
    case "$part" in
      ''|.) ;;
      ..) [[ ${#out[@]} -gt 0 ]] && unset 'out[${#out[@]}-1]' ;;
      *) out+=("$part") ;;
    esac
  done
  # bash 3.2 errors on ${arr[*]} for an empty array under `set -u`.
  if [[ ${#out[@]} -eq 0 ]]; then
    printf '/\n'
  else
    printf '/%s\n' "${out[*]}"
  fi
}

# ensure_dir <dir...> - mkdir -p with dry-run support.
ensure_dir() {
  local d
  for d in "$@"; do
    [[ -d "$d" ]] && continue
    run mkdir -p "$d"
  done
}

# --- checksum helpers (md5/sha1 differ across macOS and Linux) ----------------

md5_of() {
  local f="$1"
  if have md5sum; then md5sum "$f" | awk '{print $1}'
  elif have md5; then md5 -q "$f"
  else die "no md5 tool available"; fi
}

sha1_of() {
  local f="$1"
  if have sha1sum; then sha1sum "$f" | awk '{print $1}'
  elif have shasum; then shasum -a 1 "$f" | awk '{print $1}'
  else die "no sha1 tool available"; fi
}

sha256_of() {
  local f="$1"
  if have sha256sum; then sha256sum "$f" | awk '{print $1}'
  elif have shasum; then shasum -a 256 "$f" | awk '{print $1}'
  else die "no sha256 tool available"; fi
}

# --- download -----------------------------------------------------------------

# fetch <url> <dest> - curl or wget, resumable, atomic via .part file.
fetch() {
  local url="$1" dest="$2"
  ensure_dir "$(dirname "$dest")"
  if [[ "$RETROPI_DRY_RUN" == "1" ]]; then
    printf '%s  dry%s fetch %s -> %s\n' "$C_YELLOW" "$C_RESET" "$url" "$dest" >&2
    return 0
  fi
  if have curl; then
    curl -fL -sS --retry 3 --connect-timeout 20 -o "$dest.part" "$url" || return 1
  elif have wget; then
    wget -q -O "$dest.part" "$url" || return 1
  else
    die "need curl or wget to download"
  fi
  mv "$dest.part" "$dest"
}

# --- misc ---------------------------------------------------------------------

# xml_escape <string> - make a value safe for es_systems.xml.
#
# Uses sed rather than ${var//pat/repl}: since bash 5.2 an unquoted `&` in a
# replacement expands to the matched text, so "${s//</&lt;}" yields "<lt;" on
# a Raspberry Pi (bash 5.x) while working fine on macOS (bash 3.2). sed behaves
# the same everywhere, with `\&` meaning a literal ampersand.
xml_escape() {
  printf '%s' "$1" | sed -e 's/&/\&amp;/g' \
                         -e 's/</\&lt;/g' \
                         -e 's/>/\&gt;/g' \
                         -e 's/"/\&quot;/g' \
                         -e "s/'/\&apos;/g"
}

# backup_file <path> - timestamped copy beside the original, printed to stderr.
backup_file() {
  local f="$1"
  [[ -e "$f" ]] || return 0
  local bak
  bak="$f.bak.$(date +%Y%m%d%H%M%S)"
  run cp -p "$f" "$bak"
  step "backed up $f -> $bak"
}
