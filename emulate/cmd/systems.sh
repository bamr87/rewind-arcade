#!/usr/bin/env bash
# cmd/systems.sh - inspect and toggle the supported systems.

cmd_systems() {
  local sub="${1:-list}"
  [[ $# -gt 0 ]] && shift
  case "$sub" in
    list)    _systems_list "$@" ;;
    show)    _systems_show "$@" ;;
    enable)  _systems_toggle enable "$@" ;;
    disable) _systems_toggle disable "$@" ;;
    -h|--help|help)
      cat >&2 <<'__H__'
retropi systems - inspect and toggle systems

  systems list [--all]     list enabled systems (--all: every manifest)
  systems show <id>        full detail for one system
  systems enable <id>...   add systems to config/local.yaml
  systems disable <id>...  remove systems from config/local.yaml

Each system is one file in config/systems/. Add a console by adding a file -
see `retropi extend --help`.
__H__
      ;;
    *) die "systems: unknown subcommand '$sub'" ;;
  esac
}

_systems_list() {
  local all=0 id enabled_list mark name emu n romdir
  [[ "${1:-}" == "--all" ]] && all=1

  enabled_list=" $(systems_enabled | tr '\n' ' ') "
  printf '%s%-14s %-34s %-22s %6s%s\n' "$C_BOLD" "ID" "SYSTEM" "EMULATOR" "GAMES" "$C_RESET" >&2
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    case "$enabled_list" in
      *" $id "*) mark="$C_GREEN*$C_RESET" ;;
      *) [[ "$all" == "1" ]] || continue; mark=" " ;;
    esac
    name="$(sys_get "$id" name "$id")"
    emu="$(default_emulator "$id" 2>/dev/null || printf '%s' "-")"
    romdir="$(system_rom_dir "$id")"
    n=0
    [[ -d "$romdir" ]] && n="$(_count_roms "$id" "$romdir")"
    printf '%s %-14s %-34s %-22s %6s\n' "$mark" "$id" "$name" "$emu" "$n" >&2
  done < <(system_ids)
  log ""
  info "$(systems_enabled | wc -l | tr -d ' ') enabled of $(system_ids | wc -l | tr -d ' ') available ($C_GREEN*$C_RESET = enabled)"
  [[ "$all" == "0" ]] && step "see everything: ./bin/retropi systems list --all"
  return 0
}

_systems_show() {
  [[ $# -gt 0 ]] || die "systems show: name a system"
  local id idx
  id="$(system_resolve "$1")" || die "unknown system: $1"

  hr "$(sys_get "$id" name)"
  printf '  %-14s %s\n' "id"           "$id" >&2
  printf '  %-14s %s\n' "short name"   "$(sys_get "$id" short_name "-")" >&2
  printf '  %-14s %s\n' "manufacturer" "$(sys_get "$id" manufacturer "-")" >&2
  printf '  %-14s %s\n' "year"         "$(sys_get "$id" year "-")" >&2
  printf '  %-14s %s\n' "aliases"      "$(sys_list "$id" aliases | tr '\n' ' ')" >&2
  printf '  %-14s %s\n' "extensions"   "$(sys_list "$id" extensions | tr '\n' ' ')" >&2
  printf '  %-14s %s\n' "rom folder"   "$(system_rom_dir "$id")" >&2
  printf '  %-14s %s\n' "theme"        "$(sys_get "$id" frontend.theme "$id")" >&2

  hr "emulators"
  local def
  def="$(default_emulator "$id" 2>/dev/null || printf '')"
  while IFS= read -r idx; do
    [[ -n "$idx" ]] || continue
    local eid core disp state
    eid="$(emulator_field "$id" "$idx" id)"
    core="$(emulator_field "$id" "$idx" core "-")"
    disp="$(emulator_field "$id" "$idx" display "$eid")"
    if ! emulator_supported "$id" "$idx"; then
      state="${C_DIM}not on this platform${C_RESET}"
    elif core_installed "$core"; then
      state="${C_GREEN}core installed${C_RESET}"
    else
      state="${C_YELLOW}core missing${C_RESET}"
    fi
    [[ "$eid" == "$def" ]] && eid="$eid ${C_BOLD}(default)${C_RESET}"
    printf '  %-26s %-28s %b\n' "$disp" "$core" "$state" >&2
    printf '    %sid: %s%s\n' "$C_DIM" "$eid" "$C_RESET" >&2
  done < <(emulator_indices "$id")

  local total
  total="$(sys_count "$id" bios)"
  if [[ "$total" != "0" ]]; then
    hr "bios"
    local i=0 file req note
    while [[ "$i" -lt "$total" ]]; do
      file="$(sys_get "$id" "bios.$i.file")"
      req="$(sys_get "$id" "bios.$i.required" false)"
      note="$(sys_get "$id" "bios.$i.note" "")"
      i=$((i+1))
      [[ -n "$file" ]] || continue
      local flag="optional"
      [[ "$req" == "true" ]] && flag="REQUIRED"
      printf '  %-26s %-10s %s\n' "$file" "$flag" "$note" >&2
    done
  fi

  local notes
  notes="$(sys_get "$id" notes "")"
  if [[ -n "$notes" ]]; then
    hr "notes"
    printf '  %s\n' "$notes" >&2
  fi

  hr "launch command"
  printf '  %s\n' "$(launch_command "$id" 2>/dev/null || printf 'no emulator available on this platform')" >&2
  return 0
}

# Toggling edits config/local.yaml, which is the file users are meant to own.
_systems_toggle() {
  local action="$1"; shift
  [[ $# -gt 0 ]] || die "systems $action: name at least one system"

  local id resolved current new_list changed=0
  current="$(systems_enabled | tr '\n' ' ')"
  new_list="$current"
  for id in "$@"; do
    resolved="$(system_resolve "$id")" || die "unknown system: $id"
    case " $new_list " in
      *" $resolved "*)
        if [[ "$action" == "disable" ]]; then
          new_list="$(printf '%s' "$new_list" | tr ' ' '\n' | grep -v "^$resolved\$" | tr '\n' ' ')"
          changed=1; step "disabled $resolved"
        else
          debug "$resolved already enabled"
        fi ;;
      *)
        if [[ "$action" == "enable" ]]; then
          new_list="$new_list $resolved"
          changed=1; step "enabled $resolved"
        else
          debug "$resolved already disabled"
        fi ;;
    esac
  done

  [[ "$changed" == "0" ]] && { info "no changes"; return 0; }
  _write_enabled_systems "$new_list"
  ok "updated $(basename "$RETROPI_CONFIG_LOCAL")"
  step "apply the change: ./bin/retropi build"
  return 0
}

# Rewrite only the systems.enabled block in local.yaml, preserving the rest.
_write_enabled_systems() {
  local list="$1"
  [[ -f "$RETROPI_CONFIG_LOCAL" ]] || _config_write_stub
  [[ "$RETROPI_DRY_RUN" == "1" ]] && { step "dry run: systems.enabled ->$list"; return 0; }
  python3 - "$RETROPI_CONFIG_LOCAL" $list <<'__PY__'
import sys
path, items = sys.argv[1], sys.argv[2:]
lines = open(path, encoding="utf-8").read().splitlines()
out, i, replaced = [], 0, False
while i < len(lines):
    line = lines[i]
    if line.rstrip() == "systems:" or line.startswith("systems:"):
        # skip the whole existing systems block
        i += 1
        while i < len(lines) and (not lines[i].strip() or lines[i][:1] in (" ", "\t")):
            i += 1
        out.append("systems:")
        out.append("  enabled:")
        out.extend("    - %s" % s for s in items)
        replaced = True
        continue
    out.append(line)
    i += 1
if not replaced:
    if out and out[-1].strip():
        out.append("")
    out.append("systems:")
    out.append("  enabled:")
    out.extend("    - %s" % s for s in items)
open(path, "w", encoding="utf-8").write("\n".join(out) + "\n")
__PY__
  config_load --force
}

# shellcheck source=./doctor.sh
declare -f _count_roms >/dev/null 2>&1 || . "$RETROPI_ROOT/cmd/doctor.sh"
# shellcheck source=./config.sh
declare -f _config_write_stub >/dev/null 2>&1 || . "$RETROPI_ROOT/cmd/config.sh"
