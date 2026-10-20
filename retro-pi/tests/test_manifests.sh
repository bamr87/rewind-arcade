#!/usr/bin/env bash
# Schema tests: every shipped system manifest must be complete and coherent.
# These catch typos that would otherwise surface as a silent no-op in the
# frontend (a system with no command, a core that does not exist upstream).

YAMLITE="$REPO_ROOT/lib/yamlite.py"

setup_sandbox() { :; }
teardown_sandbox() { :; }

_y() { python3 "$YAMLITE" "$@"; }

_manifests() { find "$REPO_ROOT/config/systems" -name '*.yaml' | sort; }

test_required_fields_present() {
  local f id
  while IFS= read -r f; do
    id="$(basename "$f" .yaml)"
    assert_eq "$id" "$(_y get "$f" id)" "id must match filename: $f" || return 1
    assert_ne "" "$(_y get "$f" name '')" "missing name: $f" || return 1
    assert_ne "" "$(_y get "$f" frontend.platform '')" "missing frontend.platform: $f" || return 1
    assert_ne "0" "$(_y len "$f" extensions)" "no extensions: $f" || return 1
  done < <(_manifests)
}

test_extensions_start_with_dot() {
  local f ext
  while IFS= read -r f; do
    while IFS= read -r ext; do
      [[ -n "$ext" ]] || continue
      case "$ext" in
        .*) ;;
        *) assert_eq ".$ext" "$ext" "extension missing leading dot in $(basename "$f"): $ext"; return 1 ;;
      esac
    done < <(_y get "$f" extensions)
  done < <(_manifests)
}

test_default_emulator_exists_in_list() {
  local f def n i found
  while IFS= read -r f; do
    def="$(_y get "$f" emulators.default '')"
    assert_ne "" "$def" "no default emulator: $(basename "$f")" || return 1
    n="$(_y len "$f" emulators.list)"
    found=0
    i=0
    while [[ "$i" -lt "$n" ]]; do
      [[ "$(_y get "$f" "emulators.list.$i.id" '')" == "$def" ]] && found=1
      i=$((i+1))
    done
    assert_eq "1" "$found" "default '$def' not in emulators.list of $(basename "$f")" || return 1
  done < <(_manifests)
}

test_libretro_entries_declare_a_core() {
  local f n i type core
  while IFS= read -r f; do
    n="$(_y len "$f" emulators.list)"
    i=0
    while [[ "$i" -lt "$n" ]]; do
      type="$(_y get "$f" "emulators.list.$i.type" libretro)"
      core="$(_y get "$f" "emulators.list.$i.core" '')"
      if [[ "$type" == "libretro" ]]; then
        assert_ne "" "$core" "libretro entry $i in $(basename "$f") has no core" || return 1
        case "$core" in
          *_libretro) ;;
          *) assert_contains "$core" "_libretro" "core name looks wrong in $(basename "$f"): $core"; return 1 ;;
        esac
      fi
      i=$((i+1))
    done
  done < <(_manifests)
}

test_bios_entries_are_well_formed() {
  local f n i file req
  while IFS= read -r f; do
    n="$(_y len "$f" bios)"
    i=0
    while [[ "$i" -lt "$n" ]]; do
      file="$(_y get "$f" "bios.$i.file" '')"
      req="$(_y get "$f" "bios.$i.required" '')"
      assert_ne "" "$file" "bios entry $i in $(basename "$f") has no file" || return 1
      case "$req" in
        true|false) ;;
        *) assert_eq "true|false" "$req" "bios.$i.required must be boolean in $(basename "$f")"; return 1 ;;
      esac
      i=$((i+1))
    done
  done < <(_manifests)
}

test_system_ids_are_filesystem_safe() {
  local f id
  while IFS= read -r f; do
    id="$(basename "$f" .yaml)"
    case "$id" in
      *[!a-z0-9_-]*) assert_eq "safe" "$id" "system id has unsafe characters: $id"; return 1 ;;
    esac
  done < <(_manifests)
}

test_no_duplicate_aliases_across_systems() {
  local f id alias seen=""
  while IFS= read -r f; do
    id="$(basename "$f" .yaml)"
    while IFS= read -r alias; do
      [[ -n "$alias" ]] || continue
      assert_not_contains "$seen" " $alias " "alias '$alias' is claimed twice (in $id)" || return 1
      seen="$seen $alias "
    done < <(_y get "$f" aliases)
  done < <(_manifests)
}

test_enabled_systems_all_have_manifests() {
  local id
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    assert_file "$REPO_ROOT/config/systems/$id.yaml" "config enables '$id' but no manifest exists" || return 1
  done < <(_y get "$REPO_ROOT/config/retropi.yaml" systems.enabled)
}
