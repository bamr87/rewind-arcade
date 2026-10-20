#!/usr/bin/env bash
# The generated NES test cartridge must be a structurally valid NROM image,
# since it is what verifies a real setup end to end.

setup_sandbox() {
  FX="$(mktemp -d "${TMPDIR:-/tmp}/retropi-fx.XXXXXX")"
  ROM="$FX/retropi-test.nes"
  python3 "$REPO_ROOT/tests/fixtures/make_test_rom.py" "$ROM" >/dev/null 2>&1
}
teardown_sandbox() { [[ -n "${FX:-}" ]] && rm -rf "$FX"; }

test_rom_is_generated() {
  assert_file "$ROM"
}

test_rom_has_valid_ines_header_and_size() {
  local report
  report="$(python3 -c "
d=open('$ROM','rb').read()
prg,chrb=d[4],d[5]
problems=[]
if d[:4]!=b'NES\x1a': problems.append('magic')
if len(d)!=16+prg*16384+chrb*8192: problems.append('size')
if ((d[6]>>4)|(d[7]&0xF0))!=0: problems.append('mapper')
print(','.join(problems))")"
  assert_eq "" "$report" "invalid iNES image"
}

test_reset_vector_points_into_prg() {
  local reset
  reset="$(python3 -c "
d=open('$ROM','rb').read()
prg=d[16:16+16384]
print(prg[0x3FFC]|(prg[0x3FFD]<<8))")"
  # PRG is mapped at $C000-$FFFF for NROM-128.
  assert_ok test "$reset" -ge 49152
  assert_ok test "$reset" -le 65535
}

test_rom_is_deterministic() {
  local a b
  python3 "$REPO_ROOT/tests/fixtures/make_test_rom.py" "$FX/a.nes" >/dev/null 2>&1
  python3 "$REPO_ROOT/tests/fixtures/make_test_rom.py" "$FX/b.nes" >/dev/null 2>&1
  a="$(shasum -a 256 "$FX/a.nes" 2>/dev/null | awk '{print $1}')"
  b="$(shasum -a 256 "$FX/b.nes" 2>/dev/null | awk '{print $1}')"
  assert_eq "$a" "$b" "generator is not deterministic"
}

test_rom_is_recognized_by_the_nes_manifest() {
  # .nes must be one of the extensions the nes system claims, or `roms add`
  # would not file the fixture correctly.
  assert_contains "$(python3 "$REPO_ROOT/lib/yamlite.py" get \
    "$REPO_ROOT/config/systems/nes.yaml" extensions)" ".nes"
}
