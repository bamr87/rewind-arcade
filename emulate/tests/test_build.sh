#!/usr/bin/env bash
# End-to-end: `retropi build` must produce frontend config that parses as XML
# and points at real paths. This is the output an actual frontend consumes.

setup_sandbox() {
  SB="$(mktemp -d "${TMPDIR:-/tmp}/retropi-build.XXXXXX")"
  SB="$(cd "$SB" && pwd -P)"   # -P: bin/retropi resolves its root physically
  # A full working copy so bin/retropi resolves its own root to the sandbox.
  mkdir -p "$SB"
  cp -R "$REPO_ROOT/bin" "$REPO_ROOT/lib" "$REPO_ROOT/cmd" "$REPO_ROOT/config" "$SB/"
  rm -f "$SB/config/local.yaml"
  export RETROPI_CORE_DIR="$SB/cores"
  export RETROPI_SYSTEM_CORE_DIRS=""
  export RETROPI_CONTROLLER_DRIVERS="udev linuxraw"
  export RETROPI_ES_CONFIG="$SB/es"
  export RETROPI_RETROARCH_CONFIG="$SB/ra"
  export RETROPI_RETROARCH_BIN="/usr/bin/true"
  export RETROPI_FRONTEND_BIN="/nonexistent/es-de"
  export RETROPI_ES_CONFIG_HOME="$SB/ES-DE"
  mkdir -p "$SB/cores" "$SB/es" "$SB/ra"
  RP="$SB/bin/retropi"
}
teardown_sandbox() {
  unset RETROPI_CORE_DIR RETROPI_SYSTEM_CORE_DIRS RETROPI_CONTROLLER_DRIVERS RETROPI_ES_CONFIG RETROPI_RETROARCH_CONFIG RETROPI_RETROARCH_BIN
  [[ -n "${SB:-}" ]] && rm -rf "$SB"
}

test_build_creates_rom_directories() {
  "$RP" build --systems nes,snes >/dev/null 2>&1
  assert_dir "$SB/roms/nes"
  assert_dir "$SB/roms/snes"
  assert_file "$SB/roms/nes/_ABOUT.txt"
}

test_build_creates_the_bios_directory() {
  # RetroArch's system_directory points here; doctor used to report it
  # missing straight after a successful build.
  "$RP" build --systems nes >/dev/null 2>&1
  assert_dir "$SB/bios"
}

test_build_writes_esde_exclusive_systems() {
  "$RP" build >/dev/null 2>&1
  assert_file "$SB/build/es_systems.xml"
  # ES-DE's XML dialect permits loadExclusive beside the systemList root.
  assert_ok python3 -c "
import xml.etree.ElementTree as E
text = open('$SB/build/es_systems.xml').read().split('?>', 1)[1]
root = E.fromstring('<config>' + text + '</config>')
assert [child.tag for child in root] == ['loadExclusive', 'systemList']"
}

test_bundled_system_merging_can_be_requested() {
  RETROPI_FRONTEND_LOAD_EXCLUSIVE=false "$RP" build --systems nes >/dev/null 2>&1
  assert_ok python3 -c "import xml.etree.ElementTree as E; E.parse('$SB/build/es_systems.xml')"
  assert_not_contains "$(cat "$SB/build/es_systems.xml")" '<loadExclusive/>'
}

test_disabled_frontend_still_writes_exclusive_esde_systems() {
  RETROPI_FRONTEND_KIND=none "$RP" build --systems nes >/dev/null 2>&1
  assert_contains "$(cat "$SB/build/es_systems.xml")" '<loadExclusive/>'
}

test_legacy_frontend_does_not_receive_esde_directives() {
  RETROPI_FRONTEND_KIND=emulationstation "$RP" build --systems nes >/dev/null 2>&1
  assert_ok python3 -c "import xml.etree.ElementTree as E; E.parse('$SB/build/es_systems.xml')"
  assert_not_contains "$(cat "$SB/build/es_systems.xml")" '<loadExclusive/>'
}

test_generated_xml_covers_every_enabled_system() {
  "$RP" build >/dev/null 2>&1
  local n_xml n_cfg
  n_xml="$(python3 -c "
import xml.etree.ElementTree as E
print(len(E.fromstring(open('$SB/build/es_systems.xml').read().replace('<loadExclusive/>', '')).findall('system')))")"
  n_cfg="$(python3 "$SB/lib/yamlite.py" len "$SB/config/retropi.yaml" systems.enabled)"
  assert_eq "$n_cfg" "$n_xml"
}

test_each_system_entry_has_required_elements() {
  "$RP" build --systems nes,psx >/dev/null 2>&1
  local report
  report="$(python3 -c "
import xml.etree.ElementTree as E
bad=[]
for s in E.fromstring(open('$SB/build/es_systems.xml').read().replace('<loadExclusive/>', '')).findall('system'):
    for tag in ('name','fullname','path','extension','platform','theme'):
        if not (s.findtext(tag) or '').strip():
            bad.append(s.findtext('name')+':'+tag)
    if not s.findall('command'):
        bad.append(s.findtext('name')+':command')
print(','.join(bad))")"
  assert_eq "" "$report" "systems missing required elements"
}

test_rom_paths_in_xml_actually_exist() {
  "$RP" build >/dev/null 2>&1
  local missing
  missing="$(python3 -c "
import os, xml.etree.ElementTree as E
bad=[s.findtext('name') for s in E.fromstring(open('$SB/build/es_systems.xml').read().replace('<loadExclusive/>', '')).findall('system')
     if not os.path.isdir(s.findtext('path'))]
print(','.join(bad))")"
  assert_eq "" "$missing" "es_systems.xml points at directories that do not exist"
}

test_alternate_emulators_become_extra_commands() {
  "$RP" build --systems nes >/dev/null 2>&1
  # nes declares three cores, none platform restricted.
  local n
  n="$(python3 -c "
import xml.etree.ElementTree as E
s=E.fromstring(open('$SB/build/es_systems.xml').read().replace('<loadExclusive/>', '')).find('system')
print(len(s.findall('command')))")"
  assert_eq "3" "$n"
}

test_default_emulator_is_listed_first() {
  "$RP" build --systems psx >/dev/null 2>&1
  local first
  first="$(python3 -c "
import xml.etree.ElementTree as E
s=E.fromstring(open('$SB/build/es_systems.xml').read().replace('<loadExclusive/>', '')).find('system')
print(s.findall('command')[0].get('label'))")"
  assert_eq "SwanStation" "$first"
}

test_xml_escapes_special_characters() {
  # A system whose display name contains & and < must not corrupt the XML.
  cat > "$SB/config/systems/testamp.yaml" <<'__Y__'
id: testamp
name: "Rock & Roll <Racing> Machine"
short_name: "R&R"
manufacturer: "A & B"
year: 1993
aliases: []
frontend:
  platform: testamp
  theme: testamp
extensions: [".zip"]
emulators:
  default: only
  list:
    - id: only
      type: libretro
      core: test_libretro
      display: "Core & Thing"
bios: []
__Y__
  "$RP" build --systems testamp >/dev/null 2>&1
  assert_ok python3 -c "import xml.etree.ElementTree as E; E.fromstring(open('$SB/build/es_systems.xml').read().replace('<loadExclusive/>', ''))"
  local name
  name="$(python3 -c "
import xml.etree.ElementTree as E
print(E.fromstring(open('$SB/build/es_systems.xml').read().replace('<loadExclusive/>', '')).find('system').findtext('fullname'))")"
  assert_eq "Rock & Roll <Racing> Machine" "$name"
}

test_build_installs_into_frontend_dir() {
  "$RP" build --systems nes >/dev/null 2>&1
  assert_file "$SB/es/es_systems.xml"
}

test_no_install_flag_leaves_frontend_untouched() {
  "$RP" build --systems nes --no-install >/dev/null 2>&1
  assert_file "$SB/build/es_systems.xml"
  assert_fails test -f "$SB/es/es_systems.xml"
}

test_build_generates_retroarch_paths() {
  "$RP" build --systems nes >/dev/null 2>&1
  local cfg="$SB/build/retroarch-retropi.cfg"
  assert_file "$cfg"
  assert_contains "$(cat "$cfg")" "savefile_directory"
  assert_contains "$(cat "$cfg")" "system_directory = \"$SB/bios\""
}

test_build_installs_controller_profiles() {
  "$RP" build --systems nes >/dev/null 2>&1
  assert_file "$SB/ra/autoconfig/udev/retropi-xbox360.cfg"
  assert_file "$SB/ra/autoconfig/linuxraw/retropi-xbox360.cfg"
  assert_contains "$(cat "$SB/ra/autoconfig/linuxraw/retropi-xbox360.cfg")" 'input_up_axis = "-7"'
}

test_joypad_driver_and_display_region_reach_retroarch() {
  assert_not_contains "$("$RP" build --systems nes >/dev/null 2>&1; cat "$SB/build/retroarch-retropi.cfg")" "input_joypad_driver"
  assert_fails test -f "$SB/build/retroarch-display.cfg"
  printf 'controls:\n  joypad_driver: linuxraw\ndisplay:\n  region: top-half\n' > "$SB/config/local.yaml"
  "$RP" build --systems nes >/dev/null 2>&1
  assert_contains "$(cat "$SB/build/retroarch-retropi.cfg")" 'input_joypad_driver = "linuxraw"'
  assert_file "$SB/build/retroarch-display.cfg"
  assert_contains "$(cat "$SB/es/es_systems.xml")" "retroarch-display.cfg"
}

test_apply_retroarch_preserves_unrelated_keys() {
  printf 'video_fullscreen = "true"\nsavefile_directory = "/old/path"\nmy_custom = "keepme"\n' \
    > "$SB/ra/retroarch.cfg"
  "$RP" build --systems nes --apply-retroarch >/dev/null 2>&1
  local out
  out="$(cat "$SB/ra/retroarch.cfg")"
  assert_contains "$out" 'my_custom = "keepme"'
  assert_contains "$out" 'video_fullscreen = "true"'
  assert_not_contains "$out" "/old/path"
  assert_contains "$out" "$SB/saves"
}

test_dry_run_writes_nothing() {
  "$RP" --dry-run build --systems nes >/dev/null 2>&1
  assert_fails test -d "$SB/roms/nes"
}
