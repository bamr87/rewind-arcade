#!/usr/bin/env bash
# cmd/sync.sh - move the workspace between machines over rsync.
#
# The usual shape: curate on a Mac, push to the Pi under the TV.
# Saves sync in the other direction, so progress made on the Pi comes back.

cmd_sync() {
  local sub="${1:-}"
  [[ $# -gt 0 ]] && shift
  case "$sub" in
    push)    _sync_run push "$@" ;;
    pull)    _sync_run pull "$@" ;;
    targets) _sync_targets ;;
    ''|-h|--help|help)
      cat >&2 <<'__H__'
retropi sync - mirror the workspace to another machine

  sync targets                list configured targets
  sync push <target> [sets]   send content to the target
  sync pull <target> [sets]   bring content back

  sets: config roms bios saves themes   (default: the target's `include` list)

  --dry-run / -n    show what rsync would transfer, change nothing
  --delete          remove files on the destination that are gone locally

Targets are defined under sync.targets in your config. Example:

  sync:
    targets:
      pi:
        host: retropie.local
        user: pi
        path: /home/pi/RetroPie
        include: [config, roms, bios]

Saves are usually pulled, not pushed:  retropi sync pull pi saves
__H__
      ;;
    *) die "sync: unknown subcommand '$sub'" ;;
  esac
}

_sync_targets() {
  local t host user path
  local found=0
  for t in $(cfg_keys sync.targets); do
    found=1
    host="$(cfg "sync.targets.$t.host" "")"
    user="$(cfg "sync.targets.$t.user" "")"
    path="$(cfg "sync.targets.$t.path" "")"
    printf '%s%s%s\n' "$C_BOLD" "$t" "$C_RESET" >&2
    printf '  %-10s %s@%s\n' "remote" "$user" "$host" >&2
    printf '  %-10s %s\n' "path" "$path" >&2
    printf '  %-10s %s\n' "include" "$(cfg_list "sync.targets.$t.include" | tr '\n' ' ')" >&2
  done
  [[ "$found" == "0" ]] && warn "no targets configured; add sync.targets to config/local.yaml"
  return 0
}

_sync_run() {
  local dir="$1"; shift
  [[ $# -gt 0 ]] || die "sync $dir: name a target (see: retropi sync targets)"
  local target="$1"; shift

  local host user path sets="" delete=0 dry=0
  host="$(cfg "sync.targets.$target.host" "")"
  [[ -n "$host" ]] || die "unknown sync target '$target' (see: retropi sync targets)"
  user="$(cfg "sync.targets.$target.user" "")"
  path="$(cfg "sync.targets.$target.path" "")"
  [[ -n "$path" ]] || die "target '$target' has no path configured"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --delete) delete=1 ;;
      -n|--dry-run) dry=1 ;;
      -*) die "sync: unknown option $1" ;;
      *) sets="$sets $1" ;;
    esac
    shift
  done
  [[ -n "${sets// /}" ]] || sets="$(cfg_list "sync.targets.$target.include" | tr '\n' ' ')"
  [[ -n "${sets// /}" ]] || sets="config"

  need rsync "required for sync"

  local remote="$host"
  [[ -n "$user" ]] && remote="$user@$host"

  local opts="-rlptD --human-readable --partial --progress"
  [[ "$delete" == "1" ]] && opts="$opts --delete"
  [[ "$dry" == "1" || "$RETROPI_DRY_RUN" == "1" ]] && opts="$opts --dry-run"
  local ex
  for ex in $(cfg_list sync.exclude); do
    opts="$opts --exclude=$ex"
  done

  info "$dir $sets <-> $remote:$path"
  local set src dst
  for set in $sets; do
    src=""; dst=""
    case "$set" in
      config)
        src="$RETROPI_ROOT/config/"; dst="$path/retropi-config/" ;;
      roms)   src="$(roms_dir)/";   dst="$path/roms/" ;;
      bios)   src="$(bios_dir)/";   dst="$path/BIOS/" ;;
      saves)  src="$(saves_dir)/";  dst="$path/saves/" ;;
      themes) src="$(themes_dir)/"; dst="$path/themes/" ;;
      *) warn "unknown content set '$set' (config roms bios saves themes)"; continue ;;
    esac
    [[ -d "${src%/}" ]] || { warn "skipping '$set': $src does not exist"; continue; }

    step "$set"
    # shellcheck disable=SC2086
    if [[ "$dir" == "push" ]]; then
      rsync $opts "$src" "$remote:$dst" || warn "rsync failed for '$set'"
    else
      ensure_dir "${src%/}"
      rsync $opts "$remote:$dst" "$src" || warn "rsync failed for '$set'"
    fi
  done

  ok "sync complete"
  [[ "$dir" == "push" ]] && step "on the target, run: ./bin/retropi build"
  return 0
}
