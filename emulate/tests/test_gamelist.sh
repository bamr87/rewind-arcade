#!/usr/bin/env bash
# gamelist.xml generation: title cleaning and, above all, never destroying
# metadata someone scraped.

GL() { python3 "$REPO_ROOT/lib/gamelist.py" "$@"; }

# _mkzip <archive> <entry>... - build a zip with python3 rather than the `zip`
# binary, which this project does not depend on and which a stock Raspberry Pi
# image does not ship.
_mkzip() {
  local out="$1"; shift
  python3 -c '
import sys, zipfile
with zipfile.ZipFile(sys.argv[1], "w") as z:
    for name in sys.argv[2:]:
        z.writestr(name, b"")
' "$out" "$@"
}

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

test_nested_same_basename_games_are_distinct_and_idempotent() {
  mkdir -p "$GLSB/roms/Europe" "$GLSB/roms/USA/Collection"
  : > "$GLSB/roms/Probe.nes"
  : > "$GLSB/roms/Europe/Probe.nes"
  : > "$GLSB/roms/USA/Collection/Probe.nes"
  : > "$GLSB/roms/USA/Collection/Other.NES"
  : > "$GLSB/roms/USA/Collection/Notes.txt"
  local line content
  line="$(GL nes "$GLSB/roms" "$GLSB/out/gamelist.xml" --ext .nes)"
  assert_eq $'nes\t4\t4\t0\t0' "$line"
  content="$(cat "$GLSB/out/gamelist.xml")"
  assert_contains "$content" '<path>./Europe/Probe.nes</path>'
  assert_contains "$content" '<path>./USA/Collection/Probe.nes</path>'
  assert_contains "$content" '<path>./Probe.nes</path>'
  assert_contains "$content" '<path>./USA/Collection/Other.NES</path>'
  assert_not_contains "$content" 'Notes.txt'
  cp "$GLSB/out/gamelist.xml" "$GLSB/out/before.xml"
  line="$(GL nes "$GLSB/roms" "$GLSB/out/gamelist.xml" --ext .nes)"
  assert_eq $'nes\t4\t0\t4\t0' "$line"
  assert_ok cmp "$GLSB/out/before.xml" "$GLSB/out/gamelist.xml"
}

test_nested_merge_preserves_metadata_and_stale_same_basename() {
  mkdir -p "$GLSB/roms/Europe" "$GLSB/roms/USA"
  : > "$GLSB/roms/Europe/Probe.nes"
  : > "$GLSB/roms/USA/Probe.nes"
  : > "$GLSB/roms/Probe.nes"
  cat > "$GLSB/out/gamelist.xml" <<'__XML__'
<gameList>
  <game id="eu"><path>.//Europe/../Europe/Probe.nes</path><name>European Title</name><desc>Scraped description</desc><image>./media/eu.png</image><rating>0.9</rating><playcount>7</playcount></game>
  <game id="us"><path>USA/./Probe.nes</path><name>American Title</name><favorite>true</favorite></game>
  <game id="stale"><path>./Gone/Probe.nes</path><name>Stale Title</name><desc>Keep this too</desc></game>
  <folder><path>./Europe</path><name>My Folder</name></folder>
</gameList>
__XML__
  cp "$GLSB/out/gamelist.xml" "$GLSB/out/original.xml"
  local line
  line="$(GL nes "$GLSB/roms" "$GLSB/out/gamelist.xml" --ext .nes)"
  assert_eq $'nes\t3\t1\t2\t1' "$line"
  assert_ok python3 - "$GLSB/out/original.xml" "$GLSB/out/gamelist.xml" <<'__PY__'
import sys
import xml.etree.ElementTree as ET

before, after = (ET.parse(path).getroot() for path in sys.argv[1:])
assert len(after.findall('game')) == 4
for original, merged in zip(before, after):
    assert original.tag == merged.tag
    assert original.attrib == merged.attrib
    assert [(e.tag, e.text, e.attrib) for e in original] == [
        (e.tag, e.text, e.attrib) for e in merged]
assert after[-1].findtext('path') == './Probe.nes'
assert after[-1].findtext('name') == 'Probe'
__PY__
  cp "$GLSB/out/gamelist.xml" "$GLSB/out/before.xml"
  line="$(GL nes "$GLSB/roms" "$GLSB/out/gamelist.xml" --ext .nes)"
  assert_eq $'nes\t3\t0\t3\t1' "$line"
  assert_ok cmp "$GLSB/out/before.xml" "$GLSB/out/gamelist.xml"
}

test_absolute_paths_keep_scraped_metadata() {
  mkdir -p "$GLSB/roms/USA"
  : > "$GLSB/roms/Probe.nes"
  : > "$GLSB/roms/USA/Probe.nes"
  local root abs nested
  root="$(cd "$GLSB/roms" && pwd -P)"
  abs="$root/Probe.nes"
  nested="$root/USA/Probe.nes"
  cat > "$GLSB/out/gamelist.xml" <<__XML__
<gameList>
  <game><path>$abs</path><name>My Own Title</name><desc>Scraped description</desc></game>
  <game><path>$nested</path><name>Nested Title</name><desc>Nested scraped</desc></game>
</gameList>
__XML__
  cp "$GLSB/out/gamelist.xml" "$GLSB/out/before.xml"
  local line
  line="$(GL nes "$GLSB/roms" "$GLSB/out/gamelist.xml" --ext .nes)"
  assert_eq $'nes\t2\t0\t2\t0' "$line"
  assert_ok cmp "$GLSB/out/before.xml" "$GLSB/out/gamelist.xml"
}

test_external_absolute_path_does_not_hide_a_local_game() {
  : > "$GLSB/roms/Probe.nes"
  cat > "$GLSB/out/gamelist.xml" <<'__XML__'
<gameList>
  <game><path>/tmp/elsewhere/Probe.nes</path><name>External Title</name><desc>Keep external</desc></game>
</gameList>
__XML__
  local line content
  line="$(GL nes "$GLSB/roms" "$GLSB/out/gamelist.xml" --ext .nes)"
  assert_eq $'nes\t1\t1\t0\t1' "$line"
  content="$(cat "$GLSB/out/gamelist.xml")"
  assert_contains "$content" "Keep external"
  assert_contains "$content" "<path>./Probe.nes</path>"
  assert_contains "$content" "<name>Probe</name>"
}

test_hidden_and_noload_directories_are_not_scanned() {
  mkdir -p "$GLSB/roms/.hidden/deeper" "$GLSB/roms/Visible/.hidden" \
    "$GLSB/roms/Blocked/deeper" "$GLSB/roms/Visible/Blocked/deeper"
  : > "$GLSB/roms/.hidden/deeper/Hidden.nes"
  : > "$GLSB/roms/Visible/.hidden/Hidden.nes"
  : > "$GLSB/roms/Visible/.hidden.nes"
  : > "$GLSB/roms/Blocked/noload.txt"
  : > "$GLSB/roms/Blocked/Blocked.nes"
  : > "$GLSB/roms/Blocked/deeper/Blocked.nes"
  : > "$GLSB/roms/Visible/Blocked/noload.txt"
  : > "$GLSB/roms/Visible/Blocked/deeper/Blocked.nes"
  : > "$GLSB/roms/Visible/Probe.nes"
  local line content
  line="$(GL nes "$GLSB/roms" "$GLSB/out/gamelist.xml" --ext .nes --ext .txt)"
  assert_eq $'nes\t1\t1\t0\t0' "$line"
  content="$(cat "$GLSB/out/gamelist.xml")"
  assert_contains "$content" '<path>./Visible/Probe.nes</path>'
  assert_not_contains "$content" 'hidden'
  assert_not_contains "$content" 'Hidden'
  assert_not_contains "$content" 'Blocked'
  assert_not_contains "$content" 'noload.txt'
}

test_noload_at_rom_root_preserves_existing_entries() {
  : > "$GLSB/roms/Probe.nes"
  GL nes "$GLSB/roms" "$GLSB/out/gamelist.xml" --ext .nes >/dev/null
  cp "$GLSB/out/gamelist.xml" "$GLSB/out/before.xml"
  mkdir -p "$GLSB/roms/Nested"
  : > "$GLSB/roms/Nested/New.nes"
  : > "$GLSB/roms/noload.txt"
  local line
  line="$(GL nes "$GLSB/roms" "$GLSB/out/gamelist.xml" --ext .nes)"
  assert_eq $'nes\t0\t0\t0\t1' "$line"
  assert_ok cmp "$GLSB/out/before.xml" "$GLSB/out/gamelist.xml"
}

test_directory_symlinks_are_not_followed() {
  mkdir -p "$GLSB/roms/Nested" "$GLSB/out/External"
  : > "$GLSB/roms/Nested/Probe.nes"
  : > "$GLSB/out/External/Outside.nes"
  ln -s .. "$GLSB/roms/Nested/loop"
  ln -s Nested "$GLSB/roms/alias"
  ln -s "$GLSB/out/External" "$GLSB/roms/external"
  local line
  line="$(GL nes "$GLSB/roms" "$GLSB/out/gamelist.xml" --ext .nes)"
  assert_eq $'nes\t1\t1\t0\t0' "$line"
  assert_contains "$(cat "$GLSB/out/gamelist.xml")" '<path>./Nested/Probe.nes</path>'
}

# --- titles come from inside single-ROM archives ------------------------------
# An archive is usually named more loosely than the ROM it wraps
# ("some-game.zip" containing "Some Game (USA) (Rev 1).z64").

test_title_comes_from_the_single_entry_inside_a_zip() {
  _mkzip "$GLSB/roms/wrapped.zip" "Cartridge Probe, The (USA) (Rev 1).z64"
  assert_eq "The Cartridge Probe" "$(GL --title-for "$GLSB/roms/wrapped.zip")"
}

test_multi_entry_archive_falls_back_to_the_archive_name() {
  # Two ROMs inside: there is no single obvious title, so do not guess.
  _mkzip "$GLSB/roms/compilation.zip" "First (USA).z64" "Second (USA).z64"
  assert_eq "compilation" "$(GL --title-for "$GLSB/roms/compilation.zip")"
}

test_unreadable_archive_falls_back_instead_of_failing() {
  printf 'not actually a zip' > "$GLSB/roms/broken.zip"
  assert_eq "broken" "$(GL --title-for "$GLSB/roms/broken.zip")"
}

test_non_archive_titles_are_unaffected() {
  : > "$GLSB/roms/Plain Probe (USA).nes"
  assert_eq "Plain Probe" "$(GL --title-for "$GLSB/roms/Plain Probe (USA).nes")"
}

test_gamelist_uses_the_inner_title_for_archives() {
  _mkzip "$GLSB/roms/outer-name.zip" "Inner Title, The (USA).z64"
  GL n64 "$GLSB/roms" "$GLSB/out/archive.xml" --ext .zip >/dev/null
  local content
  content="$(cat "$GLSB/out/archive.xml")"
  assert_contains "$content" "<name>The Inner Title</name>"
  assert_contains "$content" "./outer-name.zip"
}
