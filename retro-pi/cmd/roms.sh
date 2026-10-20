#!/usr/bin/env bash
# cmd/roms.sh - inventory and organize the game library.
#
# retro-pi never downloads games. These commands only organize files you
# already have.

cmd_roms() {
  local sub="${1:-scan}"
  [[ $# -gt 0 ]] && shift
  case "$sub" in
    scan)    _roms_scan "$@" ;;
    list)    _roms_list "$@" ;;
    add)     _roms_add "$@" ;;
    import)  _roms_import "$@" ;;
    verify)  _roms_verify "$@" ;;
    checksum) _roms_checksum "$@" ;;
    find)    _roms_find "$@" ;;
    -h|--help|help)
      cat >&2 <<'__H__'
retropi roms - inventory and organize your game library

  roms scan                 count games per system and write an inventory
  roms list [system]        list games, optionally for one system
  roms import <archive>     import a collection laid out one folder per console
      --dry-run             show the plan, extract nothing
      --overwrite           replace games that are already present
      --map "Folder=id"     force a folder to a system (repeatable)
  roms add <file>...        file games into the right system folder
      --system <id>         force the target system (needed for .zip/.bin)
      --move                move instead of copy
  roms checksum             record SHA-1 for every game (roms/.checksums)
  roms verify               re-check games against the recorded checksums
  roms find <text>          search the library by name

retro-pi does not download games. Supply your own dumps - see docs/legal.md.
__H__
      ;;
    *) die "roms: unknown subcommand '$sub'" ;;
  esac
}

# _system_files <id> - every file in a system folder matching its extensions.
_system_files() {
  local id="$1" dir ext
  dir="$(system_rom_dir "$id")"
  [[ -d "$dir" ]] || return 0
  for ext in $(sys_list "$id" extensions); do
    find "$dir" -type f -iname "*$ext" 2>/dev/null
  done | sort -u
}

_roms_scan() {
  local out id n total=0 bytes total_bytes=0 inv
  inv="$(build_dir)/inventory.tsv"
  ensure_dir "$(build_dir)"
  [[ "$RETROPI_DRY_RUN" == "1" ]] || printf 'system\tfile\tsize_bytes\n' > "$inv"

  info "scanning $(roms_dir)"
  printf '%s%-14s %7s %12s%s\n' "$C_BOLD" "SYSTEM" "GAMES" "SIZE" "$C_RESET" >&2
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    n=0; bytes=0
    local f sz
    while IFS= read -r f; do
      [[ -n "$f" ]] || continue
      sz="$(_file_size "$f")"
      n=$((n+1)); bytes=$((bytes + sz))
      [[ "$RETROPI_DRY_RUN" == "1" ]] || printf '%s\t%s\t%s\n' "$id" "$f" "$sz" >> "$inv"
    done < <(_system_files "$id")
    total=$((total+n)); total_bytes=$((total_bytes+bytes))
    [[ "$n" -eq 0 ]] && continue
    printf '  %-14s %7d %12s\n' "$id" "$n" "$(_human "$bytes")" >&2
  done < <(systems_enabled)

  hr
  info "$total games, $(_human "$total_bytes") total"
  [[ "$total" -eq 0 ]] && {
    log ""
    log "No games found. Copy files into:"
    log "  $(roms_dir)/<system>/"
    log "then run this again. \`retropi systems list\` shows the folder names."
    return 0
  }
  [[ "$RETROPI_DRY_RUN" == "1" ]] || step "inventory written to $inv"
  return 0
}

_file_size() {
  if [[ "$RETROPI_OS" == "macos" ]]; then
    stat -f %z "$1" 2>/dev/null || printf '0'
  else
    stat -c %s "$1" 2>/dev/null || printf '0'
  fi
}

_human() {
  local b="${1:-0}"
  if   [[ "$b" -ge 1073741824 ]]; then printf '%s GB' "$((b / 1073741824))"
  elif [[ "$b" -ge 1048576 ]];    then printf '%s MB' "$((b / 1048576))"
  elif [[ "$b" -ge 1024 ]];       then printf '%s KB' "$((b / 1024))"
  else printf '%s B' "$b"; fi
}

_roms_list() {
  local ids f n=0
  if [[ $# -gt 0 ]]; then
    ids="$(system_resolve "$1")" || die "unknown system: $1"
  else
    ids="$(systems_enabled)"
  fi
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    local shown=0
    while IFS= read -r f; do
      [[ -n "$f" ]] || continue
      [[ "$shown" == "0" ]] && { printf '%s%s%s\n' "$C_BOLD" "$id" "$C_RESET" >&2; shown=1; }
      printf '  %s  %s\n' "$(printf '%8s' "$(_human "$(_file_size "$f")")")" "$(basename "$f")" >&2
      n=$((n+1))
    done < <(_system_files "$id")
  done <<< "$ids"
  [[ "$n" -eq 0 ]] && info "no games found" || info "$n games"
  return 0
}

# _detect_system <file> - systems whose extension list matches, one per line.
_detect_system() {
  local file="$1" ext id e
  ext=".$(printf '%s' "${file##*.}" | tr '[:upper:]' '[:lower:]')"
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    for e in $(sys_list "$id" extensions); do
      [[ "$e" == "$ext" ]] && { printf '%s\n' "$id"; break; }
    done
  done < <(systems_enabled)
  return 0   # a trailing failed test must not fail the function under `set -e`
}

_roms_add() {
  local force_sys="" move=0 files=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --system) force_sys="${2:-}"; shift ;;
      --move) move=1 ;;
      -*) die "roms add: unknown option $1" ;;
      *) files[${#files[@]}]="$1" ;;
    esac
    shift
  done
  [[ ${#files[@]} -gt 0 ]] || die "roms add: name at least one file"

  local file target id matches count n_ok=0 n_skip=0
  for file in "${files[@]}"; do
    [[ -f "$file" ]] || { warn "not a file: $file"; continue; }

    if [[ -n "$force_sys" ]]; then
      id="$(system_resolve "$force_sys")" || die "unknown system: $force_sys"
    else
      matches="$(_detect_system "$file")"
      count="$(printf '%s' "$matches" | grep -c . || true)"
      if [[ "$count" -eq 0 ]]; then
        warn "$(basename "$file"): no enabled system uses this extension"
        step "specify one: retropi roms add --system <id> \"$file\""
        n_skip=$((n_skip+1)); continue
      elif [[ "$count" -gt 1 ]]; then
        warn "$(basename "$file"): ambiguous, matches: $(printf '%s' "$matches" | tr '\n' ' ')"
        step "specify one: retropi roms add --system <id> \"$file\""
        n_skip=$((n_skip+1)); continue
      fi
      id="$matches"
    fi

    target="$(system_rom_dir "$id")"
    ensure_dir "$target"
    if [[ -e "$target/$(basename "$file")" ]]; then
      warn "already present: $id/$(basename "$file")"
      n_skip=$((n_skip+1)); continue
    fi
    if [[ "$move" == "1" ]]; then
      run mv "$file" "$target/"
    else
      run cp "$file" "$target/"
    fi
    ok "$id <- $(basename "$file")"
    n_ok=$((n_ok+1))
  done

  log ""
  info "added $n_ok, skipped $n_skip"
  [[ "$n_ok" -gt 0 ]] && step "refresh your frontend: ./bin/retropi build"
  return 0
}

# _roms_import - bulk import from an archive organised by console folder.
#
# Folder names carry the system, which matters because extensions often do
# not: .bin and .zip belong to many consoles, and .sg to none of the ones a
# plain extension table would know.
_roms_import() {
  local archive="" dry=0 overwrite=0 forced=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run|-n) dry=1 ;;
      --overwrite)  overwrite=1 ;;
      --map)        forced="$forced ${2:-}"; shift ;;
      -*) die "roms import: unknown option $1" ;;
      *) archive="$1" ;;
    esac
    shift
  done
  [[ -n "$archive" ]] || die "roms import: name an archive"
  [[ -f "$archive" ]] || die "no such file: $archive"
  [[ "$RETROPI_DRY_RUN" == "1" ]] && dry=1

  local helper mapfile plan folder count exts bytes id
  helper="$RETROPI_ROOT/lib/romimport.py"
  mapfile="$RETROPI_STATE/import-map.tsv"
  ensure_dir "$RETROPI_STATE"

  plan="$(python3 "$helper" plan "$archive")" || die "could not read $archive"
  [[ -n "$plan" ]] || die "no importable files in $archive"

  info "planning import from $(basename "$archive")"
  : > "$mapfile"
  local n_known=0 n_unknown=0 total_files=0
  while IFS="$(printf '\t')" read -r folder count exts bytes; do
    [[ -n "$count" ]] || continue
    total_files=$((total_files + count))

    id=""
    # An explicit --map wins over name matching.
    local pair
    for pair in $forced; do
      case "$pair" in
        "$folder="*) id="${pair#*=}" ;;
      esac
    done
    if [[ "$folder" != "(root)" && -z "$id" ]]; then
      id="$(system_match "$folder" 2>/dev/null || printf '')"
    fi

    if [[ -z "$id" ]]; then
      if [[ "$folder" == "(root)" ]]; then
        printf '  %s-%s %-18s %3s files  %s (archive root, not a console)\n' \
          "$C_DIM" "$C_RESET" "$folder" "$count" "$exts" >&2
      else
        printf '  %s?%s %-18s %3s files  %s %sno matching system%s\n' \
          "$C_YELLOW" "$C_RESET" "$folder" "$count" "$exts" "$C_YELLOW" "$C_RESET" >&2
      fi
      n_unknown=$((n_unknown + count))
      continue
    fi
    if ! system_exists "$id"; then
      warn "$folder -> '$id' has no manifest; skipping"
      n_unknown=$((n_unknown + count))
      continue
    fi
    printf '  %s+%s %-18s %3s files  %-10s -> %s\n' \
      "$C_GREEN" "$C_RESET" "$folder" "$count" "$exts" "$id" >&2
    printf '%s\t%s\n' "$folder" "$id" >> "$mapfile"
    n_known=$((n_known + count))
  done <<< "$plan"

  hr
  info "$n_known games map to a system, $n_unknown skipped, $total_files in the archive"
  [[ "$n_unknown" -gt 0 ]] && step "force a folder with: --map \"Folder Name=system_id\""
  [[ "$n_known" -eq 0 ]] && { warn "nothing to import"; return 1; }

  if [[ "$dry" == "0" ]]; then
    confirm "extract $n_known games into $(roms_dir)?" || { info "cancelled"; return 0; }
  fi

  local flags=""
  [[ "$dry" == "1" ]] && flags="--dry-run"
  [[ "$overwrite" == "1" ]] && flags="$flags --overwrite"

  info "extracting"
  local result
  # shellcheck disable=SC2086
  result="$(python3 "$helper" extract "$archive" "$(roms_dir)" "$mapfile" $flags)" \
    || die "extraction failed"

  local verb="imported"
  [[ "$dry" == "1" ]] && verb="would import"
  printf '%s\n' "$result" | awk -F'\t' -v verb="$verb" '
    $3=="added" || $3=="would-add" {added[$1]++}
    $3=="exists"                   {skipped[$1]++}
    END{
      for (s in added)   printf "  %-14s %3d %s\n", s, added[s], verb
      for (s in skipped) printf "  %-14s %3d already present\n", s, skipped[s]
    }' | sort >&2

  hr
  local n_added n_exists
  n_added="$(printf '%s\n' "$result" | grep -cE "	(added|would-add)$" || true)"
  n_exists="$(printf '%s\n' "$result" | grep -cE "	exists$" || true)"
  if [[ "$dry" == "1" ]]; then
    info "dry run: $n_added would be imported, $n_exists already present"
    return 0
  fi
  ok "imported $n_added games ($n_exists already present)"
  step "refresh the frontend: ./bin/retropi build"
  return 0
}

_checksum_file() { printf '%s/.checksums' "$(roms_dir)"; }

_roms_checksum() {
  local out id f n=0
  out="$(_checksum_file)"
  ensure_dir "$(roms_dir)"
  info "computing SHA-1 for every game (this can take a while)"
  [[ "$RETROPI_DRY_RUN" == "1" ]] && return 0
  : > "$out.tmp"
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    while IFS= read -r f; do
      [[ -n "$f" ]] || continue
      printf '%s  %s\n' "$(sha1_of "$f")" "${f#$(roms_dir)/}" >> "$out.tmp"
      n=$((n+1))
    done < <(_system_files "$id")
  done < <(systems_enabled)
  mv "$out.tmp" "$out"
  ok "recorded $n checksums in $out"
  return 0
}

_roms_verify() {
  local db line want path actual n_ok=0 n_bad=0 n_miss=0
  db="$(_checksum_file)"
  [[ -f "$db" ]] || die "no checksum database; run: retropi roms checksum"
  info "verifying against $db"
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    want="${line%% *}"
    path="${line#*  }"
    local full
    full="$(roms_dir)/$path"
    if [[ ! -f "$full" ]]; then
      warn "missing: $path"; n_miss=$((n_miss+1)); continue
    fi
    actual="$(sha1_of "$full")"
    if [[ "$actual" == "$want" ]]; then
      n_ok=$((n_ok+1))
    else
      error "checksum mismatch: $path"; n_bad=$((n_bad+1))
    fi
  done < "$db"
  hr
  info "$n_ok ok, $n_bad corrupted, $n_miss missing"
  [[ "$n_bad" -gt 0 || "$n_miss" -gt 0 ]] && return 1
  return 0
}

_roms_find() {
  [[ $# -gt 0 ]] || die "roms find: give a search term"
  local term="$1" id f n=0
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    while IFS= read -r f; do
      [[ -n "$f" ]] || continue
      case "$(basename "$f" | tr '[:upper:]' '[:lower:]')" in
        *"$(printf '%s' "$term" | tr '[:upper:]' '[:lower:]')"*)
          printf '  %-14s %s\n' "$id" "$(basename "$f")" >&2
          n=$((n+1)) ;;
      esac
    done < <(_system_files "$id")
  done < <(systems_enabled)
  info "$n matches"
  return 0
}
