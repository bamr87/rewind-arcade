#!/usr/bin/env bash
# cmd/clean.sh - remove generated state. Never touches ROMs, BIOS or saves.

cmd_clean() {
  local all=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --all) all=1 ;;
      -h|--help)
        cat >&2 <<'__H__'
retropi clean - remove generated files and caches

  (no options)   remove build/ and the parser cache
  --all          also remove downloaded core archives

Never removes ROMs, BIOS files or saves.
__H__
        return 0 ;;
      *) die "clean: unknown option $1" ;;
    esac
    shift
  done

  local d
  for d in "$(build_dir)" "$RETROPI_STATE/systems" "$RETROPI_STATE/config.flat" "$RETROPI_STATE/config.json"; do
    [[ -e "$d" ]] || continue
    run rm -rf "$d"
    ok "removed $d"
  done
  if [[ "$all" == "1" ]]; then
    d="$(downloads_dir)"
    [[ -e "$d" ]] && { run rm -rf "$d"; ok "removed $d"; }
  fi
  info "clean complete (content directories untouched)"
  return 0
}
