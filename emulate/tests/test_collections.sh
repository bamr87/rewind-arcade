#!/usr/bin/env bash
# Custom collections across consoles (lib/collections_gen.py) and the ES-DE
# settings merge they rely on (lib/es_settings.py).

setup_sandbox() {
  CSB="$(mktemp -d "${TMPDIR:-/tmp}/retropi-col.XXXXXX")"
  mkdir -p "$CSB/meta" "$CSB/roms/nes" "$CSB/roms/snes" "$CSB/col"
  : > "$CSB/roms/nes/mario.nes"; : > "$CSB/roms/snes/mario-world.sfc"; : > "$CSB/roms/nes/quiz.nes"
  printf '{"mario.nes": {"genre": "Platform", "tier": "S - classic", "franchise": "Mario",
             "releasedate": "19851013T000000", "players": "2", "esrb": "E - Everyone"},
           "quiz.nes": {"genre": "Quiz", "tier": "D - weak", "releasedate": "19900101T000000"},
           "gone.nes": {"genre": "Platform", "tier": "A - great"}}' > "$CSB/meta/nes.json"
  printf '{"mario-world.sfc": {"genre": "Platform; Action", "tier": "A - great",
             "franchise": "Mario", "releasedate": "19901121T000000", "cooperative": "true"}}' \
    > "$CSB/meta/snes.json"
  printf '<?xml version="1.0"?>\n<bool name="FavoritesFirst" value="true" />\n<string name="CollectionSystemsCustom" value="My Picks" />\n<string name="Theme" value="linear-es-de" />\n' \
    > "$CSB/es_settings.xml"
}
teardown_sandbox() { [[ -n "${CSB:-}" ]] && rm -rf "$CSB"; }

# The shipped definitions, with the genre and series floors lowered for a tiny library.
COL() {
  mkdir -p "$CSB/local"
  printf 'name: "Genre - {value}"\ngroup_by: {field: genre, split: ";"}\nmin: 2\n' > "$CSB/local/genres.yaml"
  printf 'name: "Series - {value}"\ngroup_by: {field: franchise}\nmin: 2\n' > "$CSB/local/series.yaml"
  python3 "$REPO_ROOT/lib/collections_gen.py" "$CSB/meta" "$CSB/roms" "$CSB/col" \
    --defs "$REPO_ROOT/config/collections" --defs "$CSB/local" "$@"
}

test_collections_cut_across_consoles() {
  local out
  out="$(COL 2>/dev/null)"
  assert_contains "$out" "Series - Mario	2"
  assert_contains "$out" "Genre - Platform	2"
  assert_contains "$out" "Top Rated	2"
  assert_contains "$out" "Classics	1"
  assert_contains "$out" "Decade - 1980s	1"
  assert_contains "$out" "Family	1"
  assert_contains "$out" "Co-op	1"
  assert_not_contains "$out" "Genre - Quiz" "below the genre floor"
  assert_eq "$CSB/roms/nes/mario.nes
$CSB/roms/snes/mario-world.sfc" "$(cat "$CSB/col/custom-Series - Mario.cfg")"
  assert_not_contains "$(cat "$CSB/col/custom-Top Rated.cfg")" "gone.nes" "a ROM no longer on disk"
}

test_only_its_own_collections_are_replaced_or_removed() {
  printf '/my/own.nes\n' > "$CSB/col/custom-Classics.cfg"     # the user's, same name
  COL >/dev/null 2>&1
  assert_eq "/my/own.nes" "$(cat "$CSB/col/custom-Classics.cfg")"
  rm "$CSB/roms/snes/mario-world.sfc"
  COL >/dev/null 2>&1
  [[ ! -e "$CSB/col/custom-Series - Mario.cfg" ]] || return 1   # its own, now too small
  [[ -e "$CSB/col/custom-Classics.cfg" ]] || return 1
}

test_collections_are_enabled_beside_the_users_own() {
  COL --settings "$CSB/es_settings.xml" >/dev/null 2>&1
  local s
  s="$(cat "$CSB/es_settings.xml")"
  assert_contains "$s" 'name="CollectionSystemsCustom" value="My Picks,'
  assert_contains "$s" "Series - Mario"
  assert_contains "$s" '<bool name="FavoritesFirst" value="true" />' "other settings kept"
  assert_contains "$s" '<string name="Theme" value="linear-es-de" />'
  assert_not_contains "$s" "<config>" "ES-DE's root-less format kept"
}

test_betas_and_hacks_come_from_tags_names_and_release_type() {
  : > "$CSB/roms/nes/zoop-beta.nes"; : > "$CSB/roms/nes/mappy-hack-unidentified.nes"
  : > "$CSB/roms/nes/alpha.nes"; : > "$CSB/roms/nes/betamax.nes"; : > "$CSB/roms/nes/home.nes"
  printf '{"zoop-beta.nes": {}, "mappy-hack-unidentified.nes": {"ident": "unmatched"},
           "alpha.nes": {"nointro": "Alpha (USA) (Proto)"}, "betamax.nes": {},
           "home.nes": {"release_type": "Homebrew"}}' > "$CSB/meta/nes.json"
  COL >/dev/null 2>&1
  local c
  c="$(cat "$CSB/col/custom-Betas & Hacks.cfg")"
  assert_contains "$c" "zoop-beta.nes"
  assert_contains "$c" "mappy-hack-unidentified.nes"
  assert_contains "$c" "alpha.nes"
  assert_contains "$c" "home.nes"
  assert_not_contains "$c" "betamax.nes" "a word that only starts with beta"
  assert_eq "$CSB/roms/nes/mappy-hack-unidentified.nes" "$(cat "$CSB/col/custom-Unidentified Dumps.cfg")"
}

test_a_definition_file_adds_overrides_or_disables_a_collection() {
  mkdir -p "$CSB/pack" "$CSB/mine"
  printf 'name: "Mario Everything"\nmatch: {field: name, regex: mario}\n' > "$CSB/pack/mario.yaml"
  printf 'enabled: false\n' > "$CSB/mine/family.yaml"
  printf '{"mario.nes": {"name": "Super Mario Bros.", "esrb": "E - Everyone"}}' > "$CSB/meta/nes.json"
  local out
  out="$(python3 "$REPO_ROOT/lib/collections_gen.py" "$CSB/meta" "$CSB/roms" "$CSB/col" \
    --defs "$REPO_ROOT/config/collections" --defs "$CSB/pack" --defs "$CSB/mine" 2>/dev/null)"
  assert_contains "$out" "Mario Everything	1"
  assert_not_contains "$out" "Family" "turned off by a later file of the same name"
  printf 'name: "Broken"\nmatch: {field: name, sounds_like: x}\n' > "$CSB/mine/broken.yaml"
  out="$(python3 "$REPO_ROOT/lib/collections_gen.py" "$CSB/meta" "$CSB/roms" "$CSB/col" \
    --defs "$CSB/mine" 2>&1)" && return 1
  assert_contains "$out" "no test in condition"
}
