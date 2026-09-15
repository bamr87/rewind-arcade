#!/usr/bin/env bash
# cmd/bios.sh - report which BIOS files each system needs.
#
# retro-pi never downloads BIOS images. They are copyrighted firmware; dump
# them from hardware you own. See docs/legal.md.

cmd_bios() {
  local sub="${1:-check}"
  [[ $# -gt 0 ]] && shift
  case "$sub" in
    check|list) _bios_check "$@" ;;
    where)      printf '%s\n' "$(bios_dir)" ;;
    -h|--help|help)
      cat >&2 <<'__H__'
retropi bios - audit BIOS/firmware files

  bios check [--all]   report required and optional BIOS per system
  bios where           print the BIOS directory

Place files in the BIOS directory (flat, or one subdirectory deep).
retro-pi does not and will not download BIOS images - see docs/legal.md.
__H__
      ;;
    *) die "bios: unknown subcommand '$sub'" ;;
  esac
}

_bios_check() {
  local ids id total i file md5 req note found path
  local n_ok=0 n_req=0 n_opt=0
  if [[ "${1:-}" == "--all" ]]; then ids="$(system_ids)"; else ids="$(systems_enabled)"; fi

  ensure_dir "$(bios_dir)"
  info "BIOS directory: $(bios_dir)"

  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    id="$(system_resolve "$id")" || continue
    total="$(sys_count "$id" bios)"
    [[ "$total" == "0" ]] && continue

    local header=0
    i=0
    while [[ "$i" -lt "$total" ]]; do
      file="$(sys_get "$id" "bios.$i.file")"
      md5="$(sys_get "$id" "bios.$i.md5" "")"
      req="$(sys_get "$id" "bios.$i.required" false)"
      note="$(sys_get "$id" "bios.$i.note" "")"
      i=$((i+1))
      [[ -n "$file" ]] || continue
      [[ "$header" == "0" ]] && { printf '%s%s%s\n' "$C_BOLD" "$id" "$C_RESET" >&2; header=1; }

      path="$(_bios_path "$file")" && found=1 || found=0
      if [[ "$found" == "1" ]]; then
        if [[ -n "$md5" ]]; then
          if [[ "$(md5_of "$path")" == "$md5" ]]; then
            printf '  %s+%s %-24s verified\n' "$C_GREEN" "$C_RESET" "$file" >&2
          else
            printf '  %s!%s %-24s present but MD5 differs (wrong region or bad dump)\n' \
              "$C_YELLOW" "$C_RESET" "$file" >&2
          fi
        else
          printf '  %s+%s %-24s present\n' "$C_GREEN" "$C_RESET" "$file" >&2
        fi
        n_ok=$((n_ok+1))
      elif [[ "$req" == "true" ]]; then
        printf '  %sx%s %-24s MISSING - required. %s\n' "$C_RED" "$C_RESET" "$file" "$note" >&2
        n_req=$((n_req+1))
      else
        printf '  %s-%s %-24s missing - optional. %s\n' "$C_DIM" "$C_RESET" "$file" "$note" >&2
        n_opt=$((n_opt+1))
      fi
    done
  done <<< "$ids"

  hr
  info "$n_ok present, $n_req required missing, $n_opt optional missing"
  if [[ "$n_req" -gt 0 ]]; then
    log ""
    log "Required BIOS files are firmware dumps from the original hardware."
    log "retro-pi does not distribute them. Copy yours into:"
    log "  $(bios_dir)/"
    return 1
  fi
  return 0
}

# _bios_path <name> - print the path if found (flat or one level deep).
_bios_path() {
  local name="$1" b hit
  b="$(bios_dir)"
  if [[ -f "$b/$name" ]]; then printf '%s' "$b/$name"; return 0; fi
  hit="$(find "$b" -maxdepth 2 -type f -iname "$name" 2>/dev/null | head -1)"
  [[ -n "$hit" ]] && { printf '%s' "$hit"; return 0; }
  return 1
}
