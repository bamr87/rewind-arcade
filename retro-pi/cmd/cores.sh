#!/usr/bin/env bash
# cmd/cores.sh - manage libretro cores.
#
# Cores come from the libretro buildbot as zipped shared objects matched to the
# host. The same command works on macOS (.dylib) and the Pi (.so) because
# lib/platform.sh resolves the target.

cmd_cores() {
  local sub="${1:-list}"
  [[ $# -gt 0 ]] && shift
  case "$sub" in
    list)    _cores_list "$@" ;;
    install) _cores_install "$@" ;;
    update)  _cores_update "$@" ;;
    remove)  _cores_remove "$@" ;;
    dir)     printf '%s\n' "$(core_dir)" ;;
    -h|--help|help)
      cat >&2 <<'__H__'
retropi cores - manage libretro cores

  cores list                    show every core your enabled systems need
  cores install                 install all missing cores for enabled systems
  cores install <core>...       install specific cores by name
  cores install --system <id>   install the cores for one system
  cores install --all           install cores for every available system
  cores update                  re-download every installed core
  cores remove <core>...        delete cores
  cores dir                     print the core directory

Cores are fetched from the libretro buildbot for your platform.
__H__
      ;;
    *) die "cores: unknown subcommand '$sub' (try: retropi cores --help)" ;;
  esac
}

# required_cores [--all|--system id] - core names this machine should have.
_required_cores() {
  local mode="${1:-enabled}" want="${2:-}" ids id
  case "$mode" in
    all)    ids="$(system_ids)" ;;
    system) ids="$(printf '%s' "$want" | tr ',' '\n')" ;;
    *)      ids="$(systems_enabled)" ;;
  esac
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    id="$(system_resolve "$id")" || { warn "unknown system: $id"; continue; }
    system_cores "$id"
  done <<< "$ids" | sort -u
}

_cores_list() {
  local mode="enabled" want="" core n_have=0 n_miss=0 n_bad=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --all) mode="all" ;;
      --system) mode="system"; want="${2:-}"; shift ;;
      *) die "cores list: unknown option $1" ;;
    esac
    shift
  done

  info "core directory: $(core_dir)"
  local d
  while IFS= read -r d; do
    [[ "$d" == "$(core_dir)" ]] || step "also searched: $d"
  done < <(core_search_dirs)
  while IFS= read -r core; do
    [[ -n "$core" ]] || continue
    if core_installed "$core"; then
      if core_arch_matches "$core"; then
        printf '  %s+%s %-34s %s\n' "$C_GREEN" "$C_RESET" "$core" "$(_core_size "$core")" >&2
        n_have=$((n_have+1))
      else
        printf '  %sx%s %-34s %swrong architecture (need %s)%s\n' \
          "$C_RED" "$C_RESET" "$core" "$C_RED" "$(retroarch_arch)" "$C_RESET" >&2
        n_bad=$((n_bad+1))
      fi
    else
      printf '  %s-%s %-34s %smissing%s\n' "$C_YELLOW" "$C_RESET" "$core" "$C_DIM" "$C_RESET" >&2
      n_miss=$((n_miss+1))
    fi
  done < <(_required_cores "$mode" "$want")

  log ""
  info "$n_have installed, $n_miss missing, $n_bad wrong architecture"
  [[ "$n_miss" -gt 0 ]] && step "install them: ./bin/retropi cores install"
  [[ "$n_bad" -gt 0 ]] && step "fix architecture: ./bin/retropi cores install --force"
  return 0
}

_core_size() {
  local f
  f="$(core_path "$1")"
  [[ -f "$f" ]] || return 0
  if have du; then du -h "$f" 2>/dev/null | awk '{print $1}'; fi
}

_cores_install() {
  local mode="enabled" want="" explicit=() force=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --all) mode="all" ;;
      --system) mode="system"; want="${2:-}"; shift ;;
      --force) force=1 ;;
      -*) die "cores install: unknown option $1" ;;
      *) explicit[${#explicit[@]}]="$1" ;;
    esac
    shift
  done

  local list
  if [[ ${#explicit[@]} -gt 0 ]]; then
    list="$(printf '%s\n' "${explicit[@]}")"
  else
    list="$(_required_cores "$mode" "$want")"
  fi
  [[ -n "$list" ]] || die "no cores to install"

  buildbot_path >/dev/null 2>&1 || \
    die "no libretro buildbot build for $RETROPI_OS/$RETROPI_ARCH; build cores from source or install via your package manager"

  need unzip "required to unpack cores"
  local dest
  dest="$(core_dir)"
  ensure_dir "$dest" "$(downloads_dir)"

  local core n_ok=0 n_skip=0 n_fail=0 failed=""
  while IFS= read -r core; do
    [[ -n "$core" ]] || continue
    if [[ "$force" == "0" ]] && core_installed "$core"; then
      debug "already installed: $core"
      n_skip=$((n_skip+1))
      continue
    fi
    if _fetch_core "$core" "$dest"; then
      n_ok=$((n_ok+1))
    else
      n_fail=$((n_fail+1)); failed="$failed $core"
    fi
  done <<< "$list"

  log ""
  info "installed $n_ok, already present $n_skip, failed $n_fail"
  if [[ "$n_fail" -gt 0 ]]; then
    warn "failed cores:$failed"
    step "some cores are not built for every platform; check https://buildbot.libretro.com/nightly/$(buildbot_path)/latest/"
    return 1
  fi
  return 0
}

# _fetch_core <core> <dest_dir>
_fetch_core() {
  local core="$1" dest="$2" url zip tmp
  url="$(core_download_url "$core")" || return 1
  zip="$(downloads_dir)/$core.$(core_ext).zip"
  step "downloading $core"
  if ! fetch "$url" "$zip"; then
    warn "download failed: $url"
    return 1
  fi
  [[ "$RETROPI_DRY_RUN" == "1" ]] && return 0

  tmp="$(mktemp -d "${TMPDIR:-/tmp}/retropi-core.XXXXXX")"
  if ! unzip -qo "$zip" -d "$tmp" 2>/dev/null; then
    warn "could not unpack $zip"
    rm -rf "$tmp"
    return 1
  fi
  local found
  found="$(find "$tmp" -name "*.$(core_ext)" -type f 2>/dev/null | head -1)"
  if [[ -z "$found" ]]; then
    warn "no .$(core_ext) inside $zip"
    rm -rf "$tmp"
    return 1
  fi
  mv "$found" "$dest/$core.$(core_ext)"
  rm -rf "$tmp"
  ok "$core"
  return 0
}

_cores_update() {
  local dest core list=""
  dest="$(core_dir)"
  [[ -d "$dest" ]] || die "no cores installed yet"
  while IFS= read -r core; do
    [[ -n "$core" ]] || continue
    list="$list$core"$'\n'
  done < <(find "$dest" -name "*.$(core_ext)" -type f -exec basename {} ".$(core_ext)" \; 2>/dev/null | sort)
  [[ -n "$list" ]] || die "no cores installed yet"
  info "updating $(printf '%s' "$list" | grep -c .) cores"
  printf '%s' "$list" | while IFS= read -r core; do
    [[ -n "$core" ]] || continue
    _fetch_core "$core" "$dest" || warn "update failed: $core"
  done
  return 0
}

_cores_remove() {
  [[ $# -gt 0 ]] || die "cores remove: name at least one core"
  local core f
  for core in "$@"; do
    f="$(core_path "$core")"
    if [[ -f "$f" ]] && ! core_managed "$core"; then
      warn "$core is provided by the system ($f); remove it with your package manager"
    elif [[ -f "$f" ]]; then
      run rm -f "$f"
      ok "removed $core"
    else
      warn "not installed: $core"
    fi
  done
  return 0
}
