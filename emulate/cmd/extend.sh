#!/usr/bin/env bash
# cmd/extend.sh - scaffold new systems and extension packs.
#
# Adding a console is meant to be a five minute job: generate a manifest,
# fill in the core name, run build. No code changes.

cmd_extend() {
  local sub="${1:-}"
  [[ $# -gt 0 ]] && shift
  case "$sub" in
    system) _extend_system "$@" ;;
    pack)   _extend_pack "$@" ;;
    list)   _extend_list ;;
    ''|-h|--help|help)
      cat >&2 <<'__H__'
retropi extend - add new systems and packs

  extend system <id>     scaffold config/systems/<id>.yaml
      --name "..."       full display name
      --core <core>      libretro core name (e.g. stella_libretro)
      --ext ".a26,.bin"  comma separated file extensions
  extend pack <name>     scaffold an extension pack in packages/
  extend list            list installed extension packs

A system is one YAML file. After scaffolding:
  1. edit config/systems/<id>.yaml
  2. ./bin/retropi systems enable <id>
  3. ./bin/retropi build
__H__
      ;;
    *) die "extend: unknown subcommand '$sub'" ;;
  esac
}

_extend_system() {
  [[ $# -gt 0 ]] || die "extend system: give an id (lowercase, no spaces)"
  local id="$1"; shift
  local name="" core="" exts="" year="" maker=""

  case "$id" in
    *[!a-z0-9_-]*) die "system id must be lowercase letters, digits, - or _: $id" ;;
  esac

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --name) name="${2:-}"; shift ;;
      --core) core="${2:-}"; shift ;;
      --ext)  exts="${2:-}"; shift ;;
      --year) year="${2:-}"; shift ;;
      --manufacturer) maker="${2:-}"; shift ;;
      *) die "extend system: unknown option $1" ;;
    esac
    shift
  done

  local file
  file="$(systems_dir)/$id.yaml"
  [[ -e "$file" ]] && die "$file already exists"

  [[ -n "$name" ]] || name="$id"
  [[ -n "$core" ]] || core="CHANGEME_libretro"
  [[ -n "$exts" ]] || exts=".zip"
  [[ -n "$year" ]] || year="1990"
  [[ -n "$maker" ]] || maker="Unknown"

  local ext_yaml="" e
  for e in $(printf '%s' "$exts" | tr ',' ' '); do
    case "$e" in .*) ;; *) e=".$e" ;; esac
    ext_yaml="$ext_yaml, \"$e\""
  done
  ext_yaml="[${ext_yaml#, }]"

  if [[ "$RETROPI_DRY_RUN" == "1" ]]; then
    step "dry run: would create $file"
    return 0
  fi

  cat > "$file" <<__SYS__
# $name - retro-pi system manifest
# Scaffolded by \`retropi extend system $id\`. Fill in the CHANGEME values.
id: $id
name: "$name"
short_name: "$name"
manufacturer: "$maker"
year: $year
aliases: []

frontend:
  # Must match a platform your theme and scraper know about.
  platform: $id
  theme: $id

# File types the frontend will show for this system.
extensions: $ext_yaml

emulators:
  default: default
  list:
    - id: default
      type: libretro
      core: $core
      display: "$name core"
      # Restrict to platforms where this core is usable, or omit for all:
      # platforms: [macos, linux, pi]

    # A standalone (non-libretro) emulator looks like this:
    # - id: standalone
    #   type: standalone
    #   display: "Some Emulator"
    #   command: '/Applications/Foo.app/Contents/MacOS/Foo %ROM%'
    #   platforms: [macos]

# Firmware this system needs. retro-pi checks presence, never downloads.
bios: []

notes: >-
  Replace this with anything a future you should know: which core is fastest
  on a Pi, which file format to prefer, known quirks.
__SYS__

  ok "created $file"
  log ""
  log "Next steps:"
  log "  1. set the real core name in $file"
  log "     (browse available cores: https://buildbot.libretro.com/nightly/$(buildbot_path 2>/dev/null || printf '<platform>')/latest/)"
  log "  2. ./bin/retropi systems enable $id"
  log "  3. ./bin/retropi cores install --system $id"
  log "  4. ./bin/retropi build"
  return 0
}

_extend_pack() {
  [[ $# -gt 0 ]] || die "extend pack: give a pack name"
  local pack="$1" dir
  dir="$RETROPI_ROOT/packages/$pack"
  [[ -e "$dir" ]] && die "$dir already exists"
  [[ "$RETROPI_DRY_RUN" == "1" ]] && { step "dry run: would create $dir"; return 0; }

  ensure_dir "$dir/systems"
  cat > "$dir/pack.yaml" <<__PACK__
# retro-pi extension pack
name: $pack
description: "What this pack adds"
version: 0.1.0
author: ""

# Systems this pack contributes. Each name maps to systems/<name>.yaml here;
# \`retropi extend install $pack\` copies them into config/systems/.
provides: []
__PACK__
  cat > "$dir/README.md" <<__README__
# $pack

An extension pack for retro-pi.

## What is in here

- \`pack.yaml\` - pack metadata
- \`systems/\` - system manifests, same schema as \`config/systems/\`

## Install

\`\`\`sh
cp packages/$pack/systems/*.yaml config/systems/
./bin/retropi systems enable <id>
./bin/retropi build
\`\`\`
__README__
  ok "created $dir"
  step "add system manifests under $dir/systems/"
  return 0
}

_extend_list() {
  local d n=0
  for d in "$RETROPI_ROOT"/packages/*/; do
    [[ -d "$d" ]] || continue
    [[ -f "$d/pack.yaml" ]] || continue
    n=$((n+1))
    printf '%s%s%s\n' "$C_BOLD" "$(basename "$d")" "$C_RESET" >&2
    printf '  %s\n' "$(yaml get "$d/pack.yaml" description '')" >&2
    printf '  %sprovides: %s%s\n' "$C_DIM" "$(yaml get "$d/pack.yaml" provides '' | tr '\n' ' ')" "$C_RESET" >&2
  done
  [[ "$n" -eq 0 ]] && info "no extension packs installed"
  return 0
}
