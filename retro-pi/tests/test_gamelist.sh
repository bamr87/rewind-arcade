#!/usr/bin/env bash
# gamelist.xml generation: title cleaning and, above all, never destroying
# metadata someone scraped.

GL() { python3 "$REPO_ROOT/lib/gamelist.py" "$@"; }

setup_sandbox() {
  GLSB="$(mktemp -d "${TMPDIR:-/tmp}/retropi-gl.XXXXXX")"
  mkdir -p "$GLSB/roms" "$GLSB/out"
}
teardown_sandbox() { [[ -n "${GLSB:-}" ]] && rm -rf "$GLSB"; }

test_region_and_dump_tags_are_stripped() {
  assert_eq "Backdrop Cycler" "$(GL --clean-name 'Backdrop Cycler (USA).nes')"
  assert_eq "Backdrop Cycler" "$(GL --clean-name 'Backdrop Cycler (World) (Rev A) [!].nes')"
  assert_eq "Palette Probe"   "$(GL --clean-name 'Palette_Probe (Japan) (En,Fr,De) [T+Eng1.0].sfc')"
}

test_trailing_article_is_moved_to_the_front() {
  assert_eq "The Backdrop Cycler" "$(GL --clean-name 'Backdrop Cycler, The (USA).nes')"
  assert_eq "A Test Cartridge"    "$(GL --clean-name 'Test Cartridge, A (USA).nes')"
}

test_abbreviation_periods_survive() {
  # Regression: stripping trailing punctuation ate the dot in "Bros."
  assert_eq "Scroll Test Bros." "$(GL --clean-name 'Scroll Test Bros. (USA).nes')"
  assert_eq "Dr. Sprite"        "$(GL --clean-name 'Dr. Sprite (World).nes')"
}

test_hyphenated_titles_are_untouched() {
  assert_eq "Pac-Like"  "$(GL --clean-name 'Pac-Like (USA).nes')"
  assert_eq "R-Shooter" "$(GL --clean-name 'R-Shooter (Japan).pce')"
}

test_untagged_name_is_left_alone() {
  assert_eq "Plain" "$(GL --clean-name 'Plain.nes')"
}

test_gamelist_is_generated_with_paths_and_names() {
  : > "$GLSB/roms/Backdrop Cycler, The (USA).nes"
  GL nes "$GLSB/roms" "$GLSB/out/gamelist.xml" --ext .nes >/dev/null
  assert_file "$GLSB/out/gamelist.xml"
  local content
  content="$(cat "$GLSB/out/gamelist.xml")"
  assert_contains "$content" "<name>The Backdrop Cycler</name>"
  assert_contains "$content" "./Backdrop Cycler, The (USA).nes"
  assert_contains "$content" "<sortname>Backdrop Cycler, The</sortname>"
}

test_existing_scraped_metadata_is_preserved() {
  # The whole point of merging: a scraped description must survive a rebuild.
  : > "$GLSB/roms/Probe (USA).nes"
  mkdir -p "$GLSB/out"
  cat > "$GLSB/out/gamelist.xml" <<'__XML__'
<?xml version="1.0"?>
<gameList>
  <game>
    <path>./Probe (USA).nes</path>
    <name>My Own Title</name>
    <desc>A description I scraped earlier.</desc>
    <rating>0.9</rating>
  </game>
</gameList>
__XML__
  GL nes "$GLSB/roms" "$GLSB/out/gamelist.xml" --ext .nes >/dev/null
  local content
  content="$(cat "$GLSB/out/gamelist.xml")"
  assert_contains "$content" "A description I scraped earlier."
  assert_contains "$content" "My Own Title"
  assert_not_contains "$content" "<name>Probe</name>"
}

test_only_new_games_are_added() {
  : > "$GLSB/roms/One (USA).nes"
  GL nes "$GLSB/roms" "$GLSB/out/gamelist.xml" --ext .nes >/dev/null
  : > "$GLSB/roms/Two (USA).nes"
  local line
  line="$(GL nes "$GLSB/roms" "$GLSB/out/gamelist.xml" --ext .nes)"
  # system<TAB>total<TAB>added<TAB>kept<TAB>missing
  assert_eq "2" "$(printf '%s' "$line" | cut -f2)"
  assert_eq "1" "$(printf '%s' "$line" | cut -f3)"
  assert_eq "1" "$(printf '%s' "$line" | cut -f4)"
}

test_entries_for_deleted_files_are_reported_not_removed() {
  : > "$GLSB/roms/Gone (USA).nes"
  GL nes "$GLSB/roms" "$GLSB/out/gamelist.xml" --ext .nes >/dev/null
  rm "$GLSB/roms/Gone (USA).nes"
  local line
  line="$(GL nes "$GLSB/roms" "$GLSB/out/gamelist.xml" --ext .nes)"
  assert_eq "1" "$(printf '%s' "$line" | cut -f5)" "stale entry not reported"
  assert_contains "$(cat "$GLSB/out/gamelist.xml")" "Gone (USA).nes"
}

test_only_declared_extensions_are_listed() {
  : > "$GLSB/roms/Yes (USA).nes"
  : > "$GLSB/roms/No (USA).txt"
  : > "$GLSB/roms/_ABOUT.txt"
  GL nes "$GLSB/roms" "$GLSB/out/gamelist.xml" --ext .nes >/dev/null
  local content
  content="$(cat "$GLSB/out/gamelist.xml")"
  assert_contains "$content" "Yes (USA).nes"
  assert_not_contains "$content" "No (USA).txt"
  assert_not_contains "$content" "_ABOUT"
}

test_generated_gamelist_is_valid_xml() {
  : > "$GLSB/roms/Valid & Ampersand (USA).nes"
  GL nes "$GLSB/roms" "$GLSB/out/gamelist.xml" --ext .nes >/dev/null
  assert_ok python3 -c "import xml.etree.ElementTree as E; E.parse('$GLSB/out/gamelist.xml')"
}
