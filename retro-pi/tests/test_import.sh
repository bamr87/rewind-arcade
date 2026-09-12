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
