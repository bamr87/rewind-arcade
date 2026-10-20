#!/usr/bin/env bash
# The RETROPI_* variables set below are read by the sourced lib/*.sh code,
# which shellcheck cannot follow from here (SC2034 false positives).
# shellcheck disable=SC2034
# Configuration layering: defaults < local.yaml < RETROPI_* env vars.

setup_sandbox() {
  SB="$(mktemp -d "${TMPDIR:-/tmp}/retropi-cfg.XXXXXX")"
  SB="$(cd "$SB" && pwd)"   # normalize: $TMPDIR may end in a slash
  mkdir -p "$SB/config" "$SB/lib" "$SB/.retropi"
  cp -R "$REPO_ROOT/config/systems" "$SB/config/systems"
  cp "$REPO_ROOT/config/retropi.yaml" "$SB/config/retropi.yaml"
  cp "$REPO_ROOT/lib/yamlite.py" "$SB/lib/yamlite.py"

  export RETROPI_ROOT="$SB"
  export RETROPI_STATE="$SB/.retropi"
  export RETROPI_CONFIG_LOCAL="$SB/config/local.yaml"
  # shellcheck source=/dev/null
  . "$REPO_ROOT/lib/common.sh"
  # shellcheck source=/dev/null
  . "$REPO_ROOT/lib/platform.sh"
  # shellcheck source=/dev/null
  . "$REPO_ROOT/lib/config.sh"
  config_init
  RETROPI_ROOT="$SB"
  RETROPI_STATE="$SB/.retropi"
  RETROPI_CONFIG_DEFAULT="$SB/config/retropi.yaml"
  RETROPI_CONFIG_LOCAL="$SB/config/local.yaml"
  RETROPI_FLAT="$SB/.retropi/config.flat"
  RETROPI_YAML="$SB/lib/yamlite.py"
  detect_platform
}
teardown_sandbox() { [[ -n "${SB:-}" ]] && rm -rf "$SB"; }

test_defaults_are_readable() {
  config_load --force
  assert_eq "es-de" "$(cfg frontend.kind)"
  assert_eq "retroarch" "$(cfg emulation.backend)"
}

test_missing_key_returns_default() {
  config_load --force
  assert_eq "fallback" "$(cfg does.not.exist fallback)"
  assert_eq "" "$(cfg does.not.exist)"
}

test_local_overrides_default() {
  printf 'frontend:\n  kind: emulationstation\n' > "$RETROPI_CONFIG_LOCAL"
  config_load --force
  assert_eq "emulationstation" "$(cfg frontend.kind)"
  # a key the override did not mention must survive
  assert_eq "retroarch" "$(cfg emulation.backend)"
}

test_local_list_replaces_rather_than_appends() {
  printf 'systems:\n  enabled: [nes, gb]\n' > "$RETROPI_CONFIG_LOCAL"
  config_load --force
  assert_eq "nes
gb" "$(cfg_list systems.enabled)"
}

test_env_var_beats_everything() {
  printf 'frontend:\n  kind: emulationstation\n' > "$RETROPI_CONFIG_LOCAL"
  config_load --force
  assert_eq "from-env" "$(RETROPI_FRONTEND_KIND=from-env cfg frontend.kind)"
}

test_relative_paths_resolve_under_repo() {
  config_load --force
  assert_eq "$RETROPI_ROOT/roms" "$(roms_dir)"
}

test_absolute_paths_are_left_alone() {
  printf 'paths:\n  roms: /Volumes/Games/roms\n' > "$RETROPI_CONFIG_LOCAL"
  config_load --force
  assert_eq "/Volumes/Games/roms" "$(roms_dir)"
}

test_cache_rebuilds_when_config_changes() {
  printf 'frontend:\n  kind: first\n' > "$RETROPI_CONFIG_LOCAL"
  config_load --force
  assert_eq "first" "$(cfg frontend.kind)"
  sleep 1                                  # mtime granularity
  printf 'frontend:\n  kind: second\n' > "$RETROPI_CONFIG_LOCAL"
  config_load                              # no --force: must notice on its own
  assert_eq "second" "$(cfg frontend.kind)"
}

test_cfg_keys_lists_child_keys() {
  config_load --force
  assert_contains "$(cfg_keys sync.targets)" "pi"
  assert_contains "$(cfg_keys controls.hotkeys)" "exit"
}
