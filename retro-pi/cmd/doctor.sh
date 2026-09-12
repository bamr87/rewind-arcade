#!/usr/bin/env bash
# cmd/doctor.sh - diagnose the machine and say exactly what to do next.

DOC_PASS=0; DOC_WARN=0; DOC_FAIL=0
DOC_HINTS=""

# Note: `((x++))` returns 1 when the result is 0, which trips `set -e`.
_pass() { DOC_PASS=$((DOC_PASS+1)); printf '  %s+%s %s\n' "$C_GREEN" "$C_RESET" "$*" >&2; }
_warn() { DOC_WARN=$((DOC_WARN+1)); printf '  %s!%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
_fail() { DOC_FAIL=$((DOC_FAIL+1)); printf '  %sx%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; }
_hint() { DOC_HINTS="$DOC_HINTS$1"$'\n'; }

_check_tool() {
  local tool="$1" why="$2" hard="${3:-soft}"
  if have "$tool"; then
    _pass "$tool"
  elif [[ "$hard" == "hard" ]]; then
    _fail "$tool missing - $why"
    _hint "  install $tool: $(_install_hint "$tool")"
  else
    _warn "$tool missing - $why"
    _hint "  optional: $(_install_hint "$tool")"
  fi
}

_install_hint() {
  case "$RETROPI_PKG" in
    brew) printf 'brew install %s' "$1" ;;
    apt)  printf 'sudo apt-get install -y %s' "$1" ;;
    *)    printf 'install %s with your package manager' "$1" ;;
  esac
}

cmd_doctor() {
  local strict=0 only_systems="" show_bios=1
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --strict) strict=1 ;;
      --systems) only_systems="${2:-}"; shift ;;
      --no-bios) show_bios=0 ;;
      -h|--help)
        cat >&2 <<'__H__'
retropi doctor - check this machine and report what is missing

  --strict          exit non-zero on warnings as well as failures
  --systems <ids>   limit system checks to a comma separated list
  --no-bios         skip the BIOS audit
__H__
        return 0 ;;
      *) die "doctor: unknown option $1" ;;
    esac
    shift
  done

  hr "host"
  _pass "platform: $(platform_label)"
  _pass "bash: ${BASH_VERSION}"
  if [[ "${BASH_VERSINFO[0]}" -lt 4 ]]; then
    debug "bash 3.2 detected - retro-pi is written to support it"
  fi
  if have python3; then
    _pass "python3: $(python3 -c 'import sys;print(".".join(map(str,sys.version_info[:3])))')"
  else
    _fail "python3 missing - required to read the YAML manifests"
    _hint "  install python3: $(_install_hint python3)"
  fi
  if [[ "$RETROPI_PKG" == "none" ]]; then
    _warn "no supported package manager found (brew/apt/dnf/pacman)"
  else
    _pass "package manager: $RETROPI_PKG"
  fi

  hr "tools"
  _check_tool curl "needed to download cores" hard
  _check_tool unzip "needed to unpack downloaded cores" hard
  _check_tool rsync "needed by \`retropi sync\`" soft
  _check_tool git "needed for updates and themes" soft
  _check_tool 7z "optional, for .7z ROM archives" soft

  hr "configuration"
  if [[ -f "$RETROPI_CONFIG_DEFAULT" ]]; then
    if config_load --force 2>/dev/null; then
      _pass "config parses: $(basename "$RETROPI_CONFIG_DEFAULT")"
    else
      _fail "config failed to parse: $RETROPI_CONFIG_DEFAULT"
    fi
  else
    _fail "missing $RETROPI_CONFIG_DEFAULT"
  fi
  if [[ -f "$RETROPI_CONFIG_LOCAL" ]]; then
    _pass "local overrides: $(basename "$RETROPI_CONFIG_LOCAL")"
  else
    _warn "no config/local.yaml - using defaults for everything"
    _hint "  create machine-local settings: ./bin/retropi config init"
  fi

  local bad=0 f
  for f in "$(systems_dir)"/*.yaml; do
    [[ -e "$f" ]] || continue
    yaml check "$f" >/dev/null 2>&1 || { _fail "manifest does not parse: $f"; bad=1; }
  done
  [[ "$bad" == "0" ]] && _pass "$(system_ids | wc -l | tr -d ' ') system manifests parse cleanly"

  hr "paths"
  local d
  for d in "$(roms_dir)" "$(bios_dir)" "$(saves_dir)"; do
    if [[ -d "$d" ]]; then
      if [[ -w "$d" ]]; then _pass "$d"; else _fail "$d is not writable"; fi
    else
      _warn "$d does not exist yet"
      _hint "  create the directory tree: ./bin/retropi build"
    fi
  done
  if have df; then
    local free
    free="$(df -h "$RETROPI_ROOT" 2>/dev/null | awk 'NR==2{print $4}')"
    [[ -n "$free" ]] && _pass "free space on workspace volume: $free"
  fi

  hr "emulation"
  if have retroarch || [[ "$(retroarch_bin)" != "retroarch" ]]; then
    _pass "retroarch: $(retroarch_bin)"
  else
    _fail "RetroArch not found"
    _hint "  install the emulator stack: ./bin/retropi install"
  fi
  local cdir count
  cdir="$(core_dir)"
  if [[ -d "$cdir" ]]; then
    count="$(find "$cdir" -name "*.$(core_ext)" 2>/dev/null | wc -l | tr -d ' ')"
    if [[ "$count" -gt 0 ]]; then
      _pass "libretro cores installed: $count (in $cdir)"
    else
      _warn "core directory exists but is empty: $cdir"
      _hint "  install cores for your enabled systems: ./bin/retropi cores install"
    fi
  else
    _warn "no core directory yet: $cdir"
    _hint "  install cores for your enabled systems: ./bin/retropi cores install"
  fi
  if buildbot_path >/dev/null 2>&1; then
    _pass "libretro buildbot target: $(buildbot_path)"
  else
    _warn "no libretro buildbot build for $RETROPI_OS/$(retroarch_arch) - build cores from source"
  fi

  # Cores are dlopen()ed into RetroArch, so they must match the RETROARCH
  # binary, not the OS. On Apple Silicon the Homebrew cask is x86_64-only, so
  # an arm64 Mac still needs x86_64 cores. Without this check the mismatch
  # only appears as a dlopen failure when you try to play something.
  local need_arch
  need_arch="$(retroarch_arch)"
  if [[ "$need_arch" != "$RETROPI_ARCH" ]]; then
    _pass "cores must be $need_arch (RetroArch is $need_arch on $RETROPI_ARCH hardware)"
  fi
  if [[ -d "$cdir" && "${count:-0}" -gt 0 ]]; then
    local bad_arch="" cf cname
    while IFS= read -r cf; do
      [[ -n "$cf" ]] || continue
      cname="$(basename "$cf" ".$(core_ext)")"
      core_arch_matches "$cname" || bad_arch="$bad_arch $cname"
    done < <(find "$cdir" -name "*.$(core_ext)" -type f 2>/dev/null)
    if [[ -n "$bad_arch" ]]; then
      _fail "cores built for the wrong architecture (RetroArch needs $need_arch):$bad_arch"
      _hint "  rebuild them for the right architecture: ./bin/retropi cores install --force"
    else
      _pass "installed cores match RetroArch's architecture ($need_arch)"
    fi
  fi

  hr "frontend"
  if es_installed; then
    _pass "frontend installed ($(cfg frontend.kind es-de))"
  else
    _warn "no EmulationStation frontend detected"
    _hint "  install a frontend: ./bin/retropi install --frontend"
  fi
  local escfg
  escfg="$(es_config_dir)"
  if [[ -f "$escfg/es_systems.xml" ]]; then
    _pass "generated frontend config present: $escfg/es_systems.xml"
  else
    _warn "frontend config not generated yet"
    _hint "  generate it: ./bin/retropi build"
  fi

  hr "systems"
  local ids id romdir n missing_core
  if [[ -n "$only_systems" ]]; then
    ids="$(printf '%s' "$only_systems" | tr ',' '\n')"
  else
    ids="$(systems_enabled)"
  fi
  local total_roms=0
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    id="$(system_resolve "$id")" || { _fail "unknown system: $id"; continue; }
    romdir="$(system_rom_dir "$id")"
    n=0
    [[ -d "$romdir" ]] && n="$(_count_roms "$id" "$romdir")"
    total_roms=$((total_roms + n))
    missing_core=""
    local core
    for core in $(system_cores "$id"); do
      core_installed "$core" || missing_core="$missing_core $core"
    done
    if [[ "$n" -gt 0 && -z "$missing_core" ]]; then
      _pass "$(printf '%-14s %3d games, cores ready' "$id" "$n")"
    elif [[ "$n" -gt 0 ]]; then
      _warn "$(printf '%-14s %3d games, missing core(s):%s' "$id" "$n" "$missing_core")"
    elif [[ -z "$missing_core" ]]; then
      _pass "$(printf '%-14s   no games yet, cores ready' "$id")"
    else
      _warn "$(printf '%-14s   no games, missing core(s):%s' "$id" "$missing_core")"
    fi
  done <<< "$ids"
  [[ "$total_roms" -gt 0 ]] && _pass "total games found: $total_roms"
  [[ "$total_roms" -eq 0 ]] && _hint "  add games: copy files into $(roms_dir)/<system>/ then run ./bin/retropi roms scan"

  if [[ "$show_bios" == "1" ]]; then
    hr "bios"
    local reported=0
    while IFS= read -r id; do
      [[ -n "$id" ]] || continue
      id="$(system_resolve "$id")" || continue
      local i total file req
      total="$(sys_count "$id" bios)"
      [[ "$total" == "0" ]] && continue
      i=0
      while [[ "$i" -lt "$total" ]]; do
        file="$(sys_get "$id" "bios.$i.file")"
        req="$(sys_get "$id" "bios.$i.required" false)"
        i=$((i+1))
        [[ -n "$file" ]] || continue
        if _find_bios "$file"; then
          _pass "$(printf '%-14s %s' "$id" "$file")"
        elif [[ "$req" == "true" ]]; then
          _fail "$(printf '%-14s %s missing (required)' "$id" "$file")"
          reported=1
        else
          _warn "$(printf '%-14s %s missing (optional)' "$id" "$file")"
        fi
      done
    done <<< "$ids"
    [[ "$reported" == "1" ]] && _hint "  see which BIOS files are needed: ./bin/retropi bios"
  fi

  hr
  printf '%s%d passed%s, %s%d warnings%s, %s%d failures%s\n' \
    "$C_GREEN" "$DOC_PASS" "$C_RESET" \
    "$C_YELLOW" "$DOC_WARN" "$C_RESET" \
    "$C_RED" "$DOC_FAIL" "$C_RESET" >&2

  if [[ -n "$DOC_HINTS" ]]; then
    log ""
    info "suggested next steps"
    printf '%s' "$DOC_HINTS" | awk '!seen[$0]++' >&2
  fi

  [[ "$DOC_FAIL" -gt 0 ]] && return 1
  [[ "$strict" == "1" && "$DOC_WARN" -gt 0 ]] && return 1
  return 0
}

# _count_roms <id> <dir> - count files matching the system's extensions.
_count_roms() {
  local id="$1" dir="$2" ext n=0
  for ext in $(sys_list "$id" extensions); do
    n=$((n + $(find "$dir" -type f -iname "*$ext" 2>/dev/null | wc -l | tr -d ' ')))
  done
  printf '%s' "$n"
}

# _find_bios <filename> - look in bios/ and one level of subdirectories.
_find_bios() {
  local name="$1" b
  b="$(bios_dir)"
  [[ -f "$b/$name" ]] && return 0
  find "$b" -maxdepth 2 -type f -iname "$name" 2>/dev/null | grep -q . && return 0
  return 1
}
