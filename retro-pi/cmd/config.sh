#!/usr/bin/env bash
# cmd/config.sh - read, write and initialize configuration.

cmd_config() {
  local sub="${1:-show}"
  [[ $# -gt 0 ]] && shift
  case "$sub" in
    init)   _config_init "$@" ;;
    get)    _config_get "$@" ;;
    set)    _config_set "$@" ;;
    show)   _config_show "$@" ;;
    path)   _config_path ;;
    edit)   _config_edit ;;
    validate) _config_validate ;;
    -h|--help|help)
      cat >&2 <<'__H__'
retropi config - read and write configuration

  config init            create config/local.yaml for this machine
  config show            print the fully merged configuration
  config get <key>       read one value (dotted key, e.g. paths.roms)
  config set <key> <val> write a value into config/local.yaml
  config path            print the config file locations
  config edit            open config/local.yaml in $EDITOR
  config validate        parse every config and manifest

Precedence: config/retropi.yaml < config/local.yaml < RETROPI_* env vars.
Env override example: RETROPI_PATHS_ROMS=/Volumes/Games/roms
__H__
      ;;
    *) die "config: unknown subcommand '$sub'" ;;
  esac
}

_config_path() {
  printf 'defaults : %s\n' "$RETROPI_CONFIG_DEFAULT"
  printf 'local    : %s%s\n' "$RETROPI_CONFIG_LOCAL" \
    "$([[ -f "$RETROPI_CONFIG_LOCAL" ]] || printf '  (not created yet)')"
  printf 'cache    : %s\n' "$RETROPI_FLAT"
  printf 'systems  : %s\n' "$(systems_dir)"
}

_config_write_stub() {
  [[ -f "$RETROPI_CONFIG_LOCAL" ]] && return 0
  ensure_dir "$(dirname "$RETROPI_CONFIG_LOCAL")"
  [[ "$RETROPI_DRY_RUN" == "1" ]] && return 0
  cat > "$RETROPI_CONFIG_LOCAL" <<'__STUB__'
# ==============================================================================
# retro-pi - machine-local configuration
# ==============================================================================
# This file is gitignored: it is yours, and it overrides config/retropi.yaml.
# Only list what you want to change - anything absent falls back to the default.
#
#   paths:
#     roms: /Volumes/Games/roms      # an external drive
#
#   systems:
#     enabled: [nes, snes, megadrive]
#
#   emulators:
#     snes: snes9x2010               # override the default core per system
# ==============================================================================
__STUB__
}

_config_init() {
  local force=0
  [[ "${1:-}" == "--force" ]] && force=1
  if [[ -f "$RETROPI_CONFIG_LOCAL" && "$force" == "0" ]]; then
    warn "$RETROPI_CONFIG_LOCAL already exists (use --force to overwrite)"
    return 0
  fi
  [[ "$force" == "1" ]] && backup_file "$RETROPI_CONFIG_LOCAL"
  [[ "$force" == "1" ]] && rm -f "$RETROPI_CONFIG_LOCAL"
  _config_write_stub
  ok "created $RETROPI_CONFIG_LOCAL"
  step "edit it: ./bin/retropi config edit"
  return 0
}

_config_get() {
  [[ $# -gt 0 ]] || die "config get: name a key (e.g. paths.roms)"
  local val
  val="$(cfg "$1" "")"
  if [[ -z "$val" ]]; then
    val="$(cfg_list "$1")"
    [[ -n "$val" ]] || { warn "no value for '$1'"; return 1; }
  fi
  printf '%s\n' "$val"
}

_config_set() {
  [[ $# -ge 2 ]] || die "config set: usage: config set <key> <value>"
  local key="$1" val="$2"
  _config_write_stub
  [[ "$RETROPI_DRY_RUN" == "1" ]] && { step "dry run: $key = $val"; return 0; }
  python3 - "$RETROPI_CONFIG_LOCAL" "$key" "$val" <<'__PY__'
import sys
path, key, value = sys.argv[1], sys.argv[2], sys.argv[3]
parts = key.split(".")
lines = open(path, encoding="utf-8").read().splitlines()

# Walk the existing tree, tracking indentation, to replace in place.
def find_path(lines, parts):
    depth, start = 0, 0
    for pi, part in enumerate(parts):
        want = "  " * pi + part + ":"
        found = -1
        for i in range(start, len(lines)):
            line = lines[i]
            if line.startswith("#") or not line.strip():
                continue
            indent = len(line) - len(line.lstrip())
            if indent < pi * 2 and i > start:
                break
            if indent == pi * 2 and line.strip().startswith(part + ":"):
                found = i
                break
        if found < 0:
            return pi, start
        if pi == len(parts) - 1:
            return len(parts), found
        start = found + 1
    return len(parts), start

matched, idx = find_path(lines, parts)
rendered = value if value.startswith(("[", "{", '"')) else '"%s"' % value
if value in ("true", "false") or value.replace(".", "", 1).isdigit():
    rendered = value

if matched == len(parts):
    lines[idx] = "  " * (len(parts) - 1) + parts[-1] + ": " + rendered
else:
    block = []
    for pi in range(matched, len(parts) - 1):
        block.append("  " * pi + parts[pi] + ":")
    block.append("  " * (len(parts) - 1) + parts[-1] + ": " + rendered)
    if matched == 0:
        if lines and lines[-1].strip():
            lines.append("")
        lines.extend(block)
    else:
        lines[idx + 1 : idx + 1] = block

open(path, "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("%s = %s" % (key, value))
__PY__
  config_load --force
  ok "set $key in $(basename "$RETROPI_CONFIG_LOCAL")"
  return 0
}

_config_show() {
  local raw=0
  [[ "${1:-}" == "--raw" ]] && raw=1
  config_load --force
  if [[ "$raw" == "1" ]]; then
    cat "$RETROPI_FLAT"
    return 0
  fi
  hr "sources"
  config_sources | sed 's/^/  /' >&2
  hr "merged values"
  sed 's/^/  /' "$RETROPI_FLAT" >&2
  hr "resolved paths"
  printf '  %-14s %s\n' roms "$(roms_dir)" >&2
  printf '  %-14s %s\n' bios "$(bios_dir)" >&2
  printf '  %-14s %s\n' saves "$(saves_dir)" >&2
  printf '  %-14s %s\n' build "$(build_dir)" >&2
  printf '  %-14s %s\n' cores "$(core_dir)" >&2
  printf '  %-14s %s\n' frontend "$(es_config_dir)" >&2
  return 0
}

_config_edit() {
  _config_write_stub
  local ed="${EDITOR:-${VISUAL:-}}"
  [[ -n "$ed" ]] || ed="$(have nano && printf 'nano' || printf 'vi')"
  run "$ed" "$RETROPI_CONFIG_LOCAL"
}

_config_validate() {
  local bad=0 f
  for f in $(config_sources); do
    if yaml check "$f" >/dev/null 2>&1; then
      ok "$f"
    else
      error "$f"
      yaml check "$f" || true
      bad=1
    fi
  done
  for f in "$(systems_dir)"/*.yaml; do
    [[ -e "$f" ]] || continue
    if yaml check "$f" >/dev/null 2>&1; then
      ok "$(basename "$f")"
    else
      error "$(basename "$f")"
      yaml check "$f" || true
      bad=1
    fi
  done
  [[ "$bad" == "0" ]] && info "all configuration parses cleanly"
  return "$bad"
}
