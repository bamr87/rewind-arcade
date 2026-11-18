#!/usr/bin/env bash
# Bulk archive import: folder-per-console archives are flattened into the
# matching roms/<system>/ directory, and existing games are never clobbered.

RI() { python3 "$REPO_ROOT/lib/romimport.py" "$@"; }

setup_sandbox() {
  IMP="$(mktemp -d "${TMPDIR:-/tmp}/retropi-imp.XXXXXX")"
  mkdir -p "$IMP/roms" "$IMP/src"
  # Build a folder-per-console archive with python: the `zip` binary is not a
  # dependency of this project and is absent from the Pi container.
  python3 -c '
import sys, zipfile
with zipfile.ZipFile(sys.argv[1], "w") as z:
    z.writestr("NES/Alpha Probe (USA).nes", b"\x00" * 16)
    z.writestr("NES/Beta Probe (USA).nes", b"\x00" * 16)
    z.writestr("Sega Genesis/Gamma Probe (USA).bin", b"\x00" * 16)
    z.writestr("Nintendo 64/Delta Probe (USA).zip", b"\x00" * 16)
    z.writestr("index.csv", b"not a game")
    z.writestr("__MACOSX/._junk", b"junk")
' "$IMP/src/bundle.zip"
  MAP="$IMP/map.tsv"
  printf 'NES\tnes\nSega Genesis\tmegadrive\nNintendo 64\tn64\n' > "$MAP"
}
teardown_sandbox() { [[ -n "${IMP:-}" ]] && rm -rf "$IMP"; }

test_plan_groups_entries_by_top_folder() {
  local out
  out="$(RI plan "$IMP/src/bundle.zip")"
  assert_contains "$out" "NES"
  assert_contains "$out" "Sega Genesis"
  assert_contains "$out" "(root)"
}

test_plan_ignores_macos_metadata() {
  assert_not_contains "$(RI plan "$IMP/src/bundle.zip")" "__MACOSX"
}

test_extract_flattens_into_the_system_directory() {
  RI extract "$IMP/src/bundle.zip" "$IMP/roms" "$MAP" >/dev/null
  assert_file "$IMP/roms/nes/Alpha Probe (USA).nes"
  assert_file "$IMP/roms/megadrive/Gamma Probe (USA).bin"
  assert_file "$IMP/roms/n64/Delta Probe (USA).zip"
  # The archive's folder structure must NOT be recreated under roms/.
  assert_fails test -d "$IMP/roms/nes/NES"
}

test_root_level_files_are_not_imported() {
  RI extract "$IMP/src/bundle.zip" "$IMP/roms" "$MAP" >/dev/null
  assert_fails test -f "$IMP/roms/index.csv"
}

test_existing_games_are_not_overwritten() {
  mkdir -p "$IMP/roms/nes"
  printf 'MY OWN COPY' > "$IMP/roms/nes/Alpha Probe (USA).nes"
  local out
  out="$(RI extract "$IMP/src/bundle.zip" "$IMP/roms" "$MAP")"
  assert_contains "$out" "exists"
  assert_eq "MY OWN COPY" "$(cat "$IMP/roms/nes/Alpha Probe (USA).nes")"
}

test_overwrite_replaces_when_asked() {
  mkdir -p "$IMP/roms/nes"
  printf 'MY OWN COPY' > "$IMP/roms/nes/Alpha Probe (USA).nes"
  RI extract "$IMP/src/bundle.zip" "$IMP/roms" "$MAP" --overwrite >/dev/null
  assert_ne "MY OWN COPY" "$(cat "$IMP/roms/nes/Alpha Probe (USA).nes")"
}

test_dry_run_writes_nothing() {
  local out
  out="$(RI extract "$IMP/src/bundle.zip" "$IMP/roms" "$MAP" --dry-run)"
  assert_contains "$out" "would-add"
  assert_fails test -f "$IMP/roms/nes/Alpha Probe (USA).nes"
}

test_unmapped_folders_are_reported_not_guessed() {
  printf 'NES\tnes\n' > "$IMP/map-partial.tsv"
  local out
  out="$(RI extract "$IMP/src/bundle.zip" "$IMP/roms" "$IMP/map-partial.tsv")"
  assert_contains "$out" "unmapped"
  assert_fails test -f "$IMP/roms/megadrive/Gamma Probe (USA).bin"
}

test_rejects_a_non_archive() {
  printf 'not a zip' > "$IMP/broken.zip"
  assert_fails RI plan "$IMP/broken.zip"
}

# --- directory collections (an external drive, linked in place) --------------

make_collection() {
  C="$IMP/coll"
  mkdir -p "$C/nintendo/nes/great" "$C/nintendo/nes/good" "$C/nintendo/nes/_duplicates" \
           "$C/sega/mastersystem/rest" "$C/nintendo/snes/great" "$C/_collection"
  printf 'NES1' > "$C/nintendo/nes/great/alpha-probe.nes"
  printf 'NES2' > "$C/nintendo/nes/good/beta-probe.nes"
  printf 'DUPE' > "$C/nintendo/nes/_duplicates/alpha-probe-copy.nes"
  printf 'JUNK' > "$C/nintendo/nes/great/._alpha-probe.nes"
  printf 'SMS1' > "$C/sega/mastersystem/rest/gamma-probe.sms"
  printf 'SG01' > "$C/sega/mastersystem/rest/delta-probe.sg"
  printf 'SNES' > "$C/nintendo/snes/great/epsilon-probe.smc"
  printf 'SAVE' > "$C/nintendo/snes/great/epsilon-probe.srm"
  cat > "$C/_collection/collection.csv" <<'__CSV__'
console,display_name,path,file,rating_bayesian,year,genre,developer,max_players
nes,Alpha Probe: The Return,nintendo/nes/great/alpha-probe.nes,alpha-probe.nes,4.5,1991.0,Action,Probe Soft,2.0
__CSV__
  LMAP="$IMP/link.tsv"
  printf 'dir\tnintendo/nes/great\tnes\ndir\tnintendo/nes/good\tnes\n' > "$LMAP"
  printf 'dir\tsega/mastersystem/rest\tmastersystem\ndir\tnintendo/snes/great\tsnes\n' >> "$LMAP"
  printf 'ext\tnes\t.nes .zip\next\tsnes\t.smc .zip\next\tmastersystem\t.sms .bin .zip\next\tsg1000\t.sg .bin .zip\n' >> "$LMAP"
}

test_plan_dir_holds_back_underscore_and_dot_folders() {
  make_collection
  local out
  out="$(RI plan-dir "$C")"
  assert_contains "$out" "nintendo/nes/great"
  assert_contains "$out" "!nintendo/nes/_duplicates"
  assert_contains "$out" "!_collection"
  assert_not_contains "$out" "._alpha"
}

test_link_places_symlinks_and_never_touches_the_source() {
  make_collection
  RI link "$C" "$IMP/roms" "$LMAP" >/dev/null
  assert_ok test -L "$IMP/roms/nes/alpha-probe.nes"
  assert_eq "NES1" "$(cat "$IMP/roms/nes/alpha-probe.nes")"
  assert_file "$C/nintendo/nes/great/alpha-probe.nes"
  assert_fails test -e "$IMP/roms/nes/alpha-probe-copy.nes"
  assert_fails test -e "$IMP/roms/nes/._alpha-probe.nes"
}

test_link_routes_an_extension_the_folder_system_does_not_take() {
  make_collection
  RI link "$C" "$IMP/roms" "$LMAP" >/dev/null
  assert_ok test -L "$IMP/roms/sg1000/delta-probe.sg"
  assert_ok test -L "$IMP/roms/mastersystem/gamma-probe.sms"
}

test_link_is_a_sync_relinks_moves_and_prunes_removals() {
  make_collection
  RI link "$C" "$IMP/roms" "$LMAP" >/dev/null
  # Re-rated: good/ -> great/. Removed: gamma-probe.
  mv "$C/nintendo/nes/good/beta-probe.nes" "$C/nintendo/nes/great/"
  rm "$C/sega/mastersystem/rest/gamma-probe.sms"
  printf 'mine' > "$IMP/roms/nes/my-own.nes"
  local out
  out="$(RI link "$C" "$IMP/roms" "$LMAP")"
  assert_contains "$out" "beta-probe.nes	relinked"
  assert_contains "$out" "gamma-probe.sms	pruned"
  assert_contains "$out" "alpha-probe.nes	kept"
  assert_eq "NES2" "$(cat "$IMP/roms/nes/beta-probe.nes")"
  assert_fails test -e "$IMP/roms/mastersystem/gamma-probe.sms"
  assert_eq "mine" "$(cat "$IMP/roms/nes/my-own.nes")"
}

test_link_dry_run_changes_nothing() {
  make_collection
  local out
  out="$(RI link "$C" "$IMP/roms" "$LMAP" --dry-run --saves "$IMP/saves")"
  assert_contains "$out" "would-add"
  assert_fails test -e "$IMP/roms/nes"
  assert_fails test -e "$IMP/saves"
}

test_copy_mode_copies_files() {
  make_collection
  RI link "$C" "$IMP/roms" "$LMAP" --copy >/dev/null
  assert_file "$IMP/roms/nes/alpha-probe.nes"
  assert_fails test -L "$IMP/roms/nes/alpha-probe.nes"
}

test_saves_are_copied_once_and_never_overwritten() {
  make_collection
  mkdir -p "$IMP/saves"
  RI link "$C" "$IMP/roms" "$LMAP" --saves "$IMP/saves" >/dev/null
  assert_eq "SAVE" "$(cat "$IMP/saves/epsilon-probe.srm")"
  printf 'NEWER' > "$IMP/saves/epsilon-probe.srm"
  RI link "$C" "$IMP/roms" "$LMAP" --saves "$IMP/saves" >/dev/null
  assert_eq "NEWER" "$(cat "$IMP/saves/epsilon-probe.srm")"
}

test_metadata_csv_becomes_per_system_json() {
  make_collection
  RI link "$C" "$IMP/roms" "$LMAP" --metadata "$C/_collection/collection.csv" \
    --metadata-out "$IMP/meta" >/dev/null
  local json
  json="$(cat "$IMP/meta/nes.json")"
  assert_contains "$json" "Alpha Probe: The Return"
  assert_contains "$json" '"rating": "0.90"'
  assert_contains "$json" '"releasedate": "19910101T000000"'
  assert_contains "$json" '"players": "2"'
}
