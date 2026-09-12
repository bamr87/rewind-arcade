#!/usr/bin/env bash
# EmulationStation integration. The layout facts here were verified against a
# real ES-DE 3.4.1 install, which creates <home>/ES-DE and keeps its settings
# in <home>/ES-DE/settings/ -- NOT in ~/.emulationstation.

setup_sandbox() {
  SB="$(mktemp -d "${TMPDIR:-/tmp}/retropi-fe.XXXXXX")"
  SB="$(cd "$SB" && pwd -P)"
  mkdir -p "$SB/config" "$SB/lib" "$SB/.retropi" "$SB/roms"
  cp -R "$REPO_ROOT/config/systems" "$SB/config/systems"
  cp "$REPO_ROOT/config/retropi.yaml" "$SB/config/retropi.yaml"
  cp "$REPO_ROOT/lib/yamlite.py" "$SB/lib/yamlite.py"

  # shellcheck source=/dev/null
  . "$REPO_ROOT/lib/common.sh"
  # shellcheck source=/dev/null
  . "$REPO_ROOT/lib/platform.sh"
  # shellcheck source=/dev/null
  . "$REPO_ROOT/lib/config.sh"
  # shellcheck source=/dev/null
  . "$REPO_ROOT/lib/systems.sh"
  # shellcheck source=/dev/null
  . "$REPO_ROOT/lib/frontend.sh"
  config_init
  RETROPI_ROOT="$SB"
  RETROPI_STATE="$SB/.retropi"
  RETROPI_CONFIG_DEFAULT="$SB/config/retropi.yaml"
  RETROPI_CONFIG_LOCAL="$SB/config/local.yaml"
  RETROPI_FLAT="$SB/.retropi/config.flat"
  RETROPI_YAML="$SB/lib/yamlite.py"
  detect_platform
  config_load --force
  HOME_BAK="$HOME"
  HOME="$SB/home"
  mkdir -p "$HOME"
}
teardown_sandbox() {
  [[ -n "${HOME_BAK:-}" ]] && HOME="$HOME_BAK"
  unset RETROPI_ES_CONFIG_HOME RETROPI_FRONTEND_BIN
  [[ -n "${SB:-}" ]] && rm -rf "$SB"
}

test_esde3_home_is_ES_DE_not_dot_emulationstation() {
  RETROPI_FE_FLAVOR="es-de"
  frontend_version() { printf 'ES-DE 3.4.1 (r51)'; }
  assert_eq "$HOME/ES-DE" "$(frontend_default_home)"
}

test_esde2_home_is_dot_emulationstation() {
  RETROPI_FE_FLAVOR="es-de"
  frontend_version() { printf 'ES-DE 2.2.1'; }
  assert_eq "$HOME/.emulationstation" "$(frontend_default_home)"
}

test_installed_frontend_beats_a_stale_legacy_directory() {
  # Regression: a leftover ~/.emulationstation (which retro-pi itself used to
  # create) must not win over the location ES-DE 3.x actually reads.
  mkdir -p "$HOME/.emulationstation"
  RETROPI_FE_FLAVOR="es-de"
  frontend_version() { printf 'ES-DE 3.4.1'; }
  RETROPI_FE_HOME="$(frontend_default_home)"
  assert_eq "$HOME/ES-DE" "$RETROPI_FE_HOME"
  assert_not_contains "$RETROPI_FE_HOME" ".emulationstation"
}

test_explicit_home_override_wins_even_before_it_exists() {
  export RETROPI_ES_CONFIG_HOME="$SB/custom-es-home"
  RETROPI_FE_HOME=""
  frontend_detect
  assert_eq "$SB/custom-es-home" "$(frontend_home)"
}

test_esde_settings_live_under_settings_subdir() {
  RETROPI_FE_HOME="$HOME/ES-DE"
  RETROPI_FE_FLAVOR="es-de"
  assert_eq "$HOME/ES-DE/settings/es_settings.xml" "$(frontend_settings_file)"
}

test_retropie_settings_live_at_home_root() {
  RETROPI_FE_HOME="$HOME/.emulationstation"
  RETROPI_FE_FLAVOR="emulationstation"
  assert_eq "$HOME/.emulationstation/es_settings.xml" "$(frontend_settings_file)"
}

test_esde_reads_systems_from_custom_systems() {
  RETROPI_FE_HOME="$HOME/ES-DE"
  RETROPI_FE_FLAVOR="es-de"
  unset RETROPI_ES_CONFIG
  assert_eq "$HOME/ES-DE/custom_systems" "$(es_config_dir)"
}

test_retropie_reads_systems_from_home_root() {
  RETROPI_FE_HOME="$HOME/.emulationstation"
  RETROPI_FE_FLAVOR="emulationstation"
  unset RETROPI_ES_CONFIG
  assert_eq "$HOME/.emulationstation" "$(es_config_dir)"
}

test_release_asset_matches_the_platform() {
  RETROPI_OS="macos"; RETROPI_ARCH="arm64"
  assert_eq "arm64.dmg" "$(frontend_asset_pattern)"
  RETROPI_ARCH="x86_64"
  assert_eq "x64.dmg" "$(frontend_asset_pattern)"
  # The Raspberry Pi 4/5 build.
  RETROPI_OS="linux"; RETROPI_ARCH="aarch64"
  assert_eq "aarch64.AppImage" "$(frontend_asset_pattern)"
  RETROPI_ARCH="x86_64"
  assert_eq "x64.AppImage" "$(frontend_asset_pattern)"
  RETROPI_OS="plan9"; RETROPI_ARCH="sparc"
  assert_fails frontend_asset_pattern
}

test_not_installed_is_reported_not_guessed() {
  export RETROPI_FRONTEND_BIN="/nonexistent/frontend"
  RETROPI_FE_HOME=""
  frontend_detect
  assert_fails frontend_installed
  assert_eq "none" "$(frontend_flavor)"
}
