#!/usr/bin/env bash
# Parser tests. The built-in parser must agree with PyYAML exactly, because
# macOS usually has PyYAML and a stock Raspberry Pi usually does not - a
# divergence would mean the same manifest behaving differently per machine.

YAMLITE="$REPO_ROOT/lib/yamlite.py"

setup_sandbox() {
  TMPY="$(mktemp -d "${TMPDIR:-/tmp}/retropi-yaml.XXXXXX")"
}
teardown_sandbox() { [[ -n "${TMPY:-}" ]] && rm -rf "$TMPY"; }

_write() { printf '%s\n' "$2" > "$TMPY/$1"; }

# get() with both backends
_get_both() {
  local file="$1" key="$2" a b
  a="$(RETROPI_YAML_PURE=1 python3 "$YAMLITE" get "$file" "$key" 2>&1)"
  b="$(RETROPI_YAML_PURE=0 python3 "$YAMLITE" get "$file" "$key" 2>&1)"
  assert_eq "$a" "$b" "backends disagree on '$key'"
  printf '%s' "$a"
}

test_scalars_and_nesting() {
  _write t.yaml 'name: Sony PlayStation
frontend:
  theme: psx
  deep:
    value: 42'
  assert_eq "Sony PlayStation" "$(_get_both "$TMPY/t.yaml" name)"
  assert_eq "psx" "$(_get_both "$TMPY/t.yaml" frontend.theme)"
  assert_eq "42" "$(_get_both "$TMPY/t.yaml" frontend.deep.value)"
}

test_flow_and_block_sequences() {
  _write t.yaml 'flow: [".a", ".b", ".c"]
block:
  - one
  - two'
  assert_eq ".a
.b
.c" "$(_get_both "$TMPY/t.yaml" flow)"
  assert_eq "one
two" "$(_get_both "$TMPY/t.yaml" block)"
}

test_list_of_mappings_indexing() {
  _write t.yaml 'emulators:
  list:
    - id: first
      core: a_libretro
    - id: second
      core: b_libretro'
  assert_eq "second" "$(_get_both "$TMPY/t.yaml" emulators.list.1.id)"
  assert_eq "a_libretro" "$(_get_both "$TMPY/t.yaml" emulators.list.0.core)"
  assert_eq "2" "$(python3 "$YAMLITE" len "$TMPY/t.yaml" emulators.list)"
}

test_quoted_hash_is_not_a_comment() {
  _write t.yaml 'display: "Beetle PSX # HW"
after: kept  # this one IS a comment'
  assert_eq "Beetle PSX # HW" "$(_get_both "$TMPY/t.yaml" display)"
  assert_eq "kept" "$(_get_both "$TMPY/t.yaml" after)"
}

test_block_scalars_match_pyyaml() {
  _write t.yaml 'literal: |
  line one
  line two

  after blank
folded: >
  wrapped text
  joined

  second para
strip: |-
  no trailing
keep: |+
  kept

clip: >-
  folded stripped
after: still-parsed'
  local a b
  a="$(RETROPI_YAML_PURE=1 python3 "$YAMLITE" json "$TMPY/t.yaml")"
  b="$(RETROPI_YAML_PURE=0 python3 "$YAMLITE" json "$TMPY/t.yaml")"
  assert_eq "$a" "$b" "block scalar handling diverges from PyYAML"
  assert_eq "still-parsed" "$(_get_both "$TMPY/t.yaml" after)"
}

test_hash_inside_block_scalar_is_content() {
  _write t.yaml 'script: |
  #!/bin/sh
  echo hi
next: value'
  assert_contains "$(_get_both "$TMPY/t.yaml" script)" "#!/bin/sh"
  assert_eq "value" "$(_get_both "$TMPY/t.yaml" next)"
}

test_booleans_and_null() {
  _write t.yaml 'yes_val: true
no_val: false
nothing:
number: 1994'
  assert_eq "true" "$(_get_both "$TMPY/t.yaml" yes_val)"
  assert_eq "false" "$(_get_both "$TMPY/t.yaml" no_val)"
  assert_eq "" "$(_get_both "$TMPY/t.yaml" nothing)"
  assert_eq "1994" "$(_get_both "$TMPY/t.yaml" number)"
}

test_default_when_key_missing() {
  _write t.yaml 'a: 1'
  assert_eq "FALLBACK" "$(python3 "$YAMLITE" get "$TMPY/t.yaml" no.such.key FALLBACK)"
}

test_has_reports_presence() {
  _write t.yaml 'present: x
empty:'
  assert_ok    python3 "$YAMLITE" has "$TMPY/t.yaml" present
  assert_fails python3 "$YAMLITE" has "$TMPY/t.yaml" empty
  assert_fails python3 "$YAMLITE" has "$TMPY/t.yaml" absent
}

test_flat_deep_merges_sources() {
  # A later file must REPLACE a list, not append to it - this is what makes
  # `systems.enabled` in local.yaml override the default instead of extending.
  _write base.yaml 'systems:
  enabled: [nes, snes, psx]
paths:
  roms: roms
  bios: bios'
  _write over.yaml 'systems:
  enabled: [gb]
paths:
  roms: /external/roms'
  local out
  out="$(python3 "$YAMLITE" flat "$TMPY/base.yaml" "$TMPY/over.yaml")"
  assert_contains "$out" "systems.enabled.0=gb"
  assert_not_contains "$out" "systems.enabled.1="
  assert_contains "$out" "paths.roms=/external/roms"
  assert_contains "$out" "paths.bios=bios"   # untouched key survives
}

test_tab_indentation_is_rejected() {
  printf 'a:\n\tb: 1\n' > "$TMPY/tab.yaml"
  assert_fails env RETROPI_YAML_PURE=1 python3 "$YAMLITE" check "$TMPY/tab.yaml"
}

test_every_shipped_manifest_parses_identically() {
  local f a b
  for f in "$REPO_ROOT"/config/systems/*.yaml "$REPO_ROOT/config/retropi.yaml"; do
    a="$(RETROPI_YAML_PURE=1 python3 "$YAMLITE" json "$f" 2>&1)"
    b="$(RETROPI_YAML_PURE=0 python3 "$YAMLITE" json "$f" 2>&1)"
    assert_eq "$a" "$b" "parsers disagree on $(basename "$f")" || return 1
  done
}
