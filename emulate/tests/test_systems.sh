#!/usr/bin/env bash
# System resolution, emulator selection and platform filtering.

setup_sandbox() {
  SB="$(mktemp -d "${TMPDIR:-/tmp}/retropi-sys.XXXXXX")"
  SB="$(cd "$SB" && pwd)"   # normalize: $TMPDIR may end in a slash
  mkdir -p "$SB/config" "$SB/lib" "$SB/.retropi" "$SB/cores"
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
  config_init
  RETROPI_ROOT="$SB"
  RETROPI_STATE="$SB/.retropi"
  RETROPI_CONFIG_DEFAULT="$SB/config/retropi.yaml"
  RETROPI_CONFIG_LOCAL="$SB/config/local.yaml"
  RETROPI_FLAT="$SB/.retropi/config.flat"
  RETROPI_YAML="$SB/lib/yamlite.py"
  export RETROPI_CORE_DIR="$SB/cores"
  export RETROPI_SYSTEM_CORE_DIRS=""
  detect_platform
  config_load --force
}
teardown_sandbox() { [[ -n "${SB:-}" ]] && rm -rf "$SB"; }

test_aliases_resolve_to_canonical_ids() {
  assert_eq "megadrive" "$(system_resolve genesis)"
  assert_eq "psx"       "$(system_resolve ps1)"
  assert_eq "mastersystem" "$(system_resolve sms)"
  assert_eq "pcengine"  "$(system_resolve tg16)"
}

test_canonical_id_resolves_to_itself() {
  assert_eq "nes" "$(system_resolve nes)"
}

test_unknown_system_fails_to_resolve() {
  assert_fails system_resolve definitely_not_a_console
}

test_every_manifest_is_listed() {
  local ids
  ids="$(system_ids)"
  assert_contains "$ids" "nes"
  assert_contains "$ids" "dreamcast"
  # Count the manifests rather than hardcoding a number: adding a console is
  # supposed to be a one-file change, not a test edit.
  local on_disk
  on_disk="$(find "$(systems_dir)" -name '*.yaml' | wc -l | tr -d ' ')"
  assert_eq "$on_disk" "$(system_ids | wc -l | tr -d ' ')"
}

test_platform_filter_excludes_foreign_emulators() {
  # pcsx-rearmed is declared linux-only; on macOS it must not be offered.
  RETROPI_OS="macos"; RETROPI_ARCH="arm64"; RETROPI_IS_PI=0
  local idx
  idx="$(emulator_index_of psx pcsx-rearmed)"
  assert_fails emulator_supported psx "$idx"

  RETROPI_OS="linux"; RETROPI_ARCH="aarch64"; RETROPI_IS_PI=1
  assert_ok emulator_supported psx "$idx"
}

test_unrestricted_emulators_run_everywhere() {
  local idx
  idx="$(emulator_index_of psx swanstation)"
  RETROPI_OS="macos"; assert_ok emulator_supported psx "$idx"
  RETROPI_OS="linux"; assert_ok emulator_supported psx "$idx"
}

test_default_emulator_falls_back_when_unsupported() {
  # sega32x's only core is picodrive, which is unrestricted: always resolvable.
  assert_eq "picodrive" "$(default_emulator sega32x)"
  assert_eq "swanstation" "$(default_emulator psx)"
}

test_config_can_override_default_emulator() {
  printf 'emulators:\n  nes: fceumm\n' > "$RETROPI_CONFIG_LOCAL"
  config_load --force
  assert_eq "fceumm" "$(default_emulator nes)"
}

test_extensions_include_both_cases() {
  local ext
  ext="$(system_extensions nes)"
  assert_contains "$ext" ".nes"
  assert_contains "$ext" ".NES"
}

test_launch_command_references_the_right_core() {
  RETROPI_OS="macos"; RETROPI_ARCH="arm64"
  local cmd
  cmd="$(launch_command nes nestopia)"
  assert_contains "$cmd" "nestopia_libretro.dylib"
  assert_contains "$cmd" "%ROM%"
  assert_contains "$cmd" "-L"
}

test_launch_command_uses_so_on_linux() {
  RETROPI_OS="linux"; RETROPI_ARCH="aarch64"
  export RETROPI_RETROARCH_BIN="/nonexistent/retroarch"
  unset RETROPI_CORE_DIR
  local cmd
  cmd="$(launch_command nes nestopia)"
  assert_contains "$cmd" "nestopia_libretro.so"
  assert_not_contains "$cmd" ".dylib"
}

test_core_installed_detects_files() {
  assert_fails core_installed nestopia_libretro
  touch "$RETROPI_CORE_DIR/nestopia_libretro.$(core_ext)"
  assert_ok core_installed nestopia_libretro
}

# --- Debian: apt cores live in /usr/lib/<multiarch>/libretro ------------------

test_distro_core_is_found_when_retropi_has_none() {
  RETROPI_OS="linux"; RETROPI_ARCH="x86_64"
  mkdir -p "$SB/sys"
  touch "$SB/sys/nestopia_libretro.so"
  export RETROPI_SYSTEM_CORE_DIRS="$SB/missing:$SB/sys"
  assert_eq "$SB/sys/nestopia_libretro.so" "$(core_path nestopia_libretro)"
  assert_ok core_installed nestopia_libretro
  assert_fails core_managed nestopia_libretro
  assert_contains "$(launch_command nes nestopia)" "$SB/sys/nestopia_libretro.so"
}

test_installs_never_target_a_distro_core_dir() {
  RETROPI_OS="linux"; RETROPI_ARCH="x86_64"
  mkdir -p "$SB/sys"
  export RETROPI_SYSTEM_CORE_DIRS="$SB/sys"
  assert_eq "$SB/cores" "$(core_dir)"
  assert_eq "$SB/cores/snes9x_libretro.so" "$(core_path snes9x_libretro)"
}

test_retropi_core_shadows_the_distro_one() {
  RETROPI_OS="linux"; RETROPI_ARCH="x86_64"
  mkdir -p "$SB/sys"
  touch "$SB/sys/nestopia_libretro.so" "$SB/cores/nestopia_libretro.so"
  export RETROPI_SYSTEM_CORE_DIRS="$SB/sys"
  assert_eq "$SB/cores/nestopia_libretro.so" "$(core_path nestopia_libretro)"
  assert_ok core_managed nestopia_libretro
}

test_retropie_nested_core_layout_is_found() {
  RETROPI_OS="linux"; RETROPI_ARCH="aarch64"
  mkdir -p "$SB/rp/lr-nestopia"
  touch "$SB/rp/lr-nestopia/nestopia_libretro.so"
  export RETROPI_SYSTEM_CORE_DIRS="$SB/rp"
  assert_eq "$SB/rp/lr-nestopia/nestopia_libretro.so" "$(core_path nestopia_libretro)"
}

test_system_core_dirs_follow_debian_multiarch() {
  unset RETROPI_SYSTEM_CORE_DIRS
  RETROPI_OS="linux"
  RETROPI_ARCH="x86_64";  assert_contains "$(system_core_dirs)" "/usr/lib/x86_64-linux-gnu/libretro"
  RETROPI_ARCH="aarch64"; assert_contains "$(system_core_dirs)" "/usr/lib/aarch64-linux-gnu/libretro"
  RETROPI_ARCH="armv7l";  assert_contains "$(system_core_dirs)" "/usr/lib/arm-linux-gnueabihf/libretro"
  assert_contains "$(system_core_dirs)" "/opt/retropie/libretrocores"
  RETROPI_OS="macos"
  assert_eq "" "$(system_core_dirs)"
}

test_install_hints_match_the_package_manager() {
  RETROPI_PKG="apt";    assert_eq "sudo apt-get install -y xvfb" "$(pkg_install_hint xvfb)"
  RETROPI_PKG="dnf";    assert_eq "sudo dnf install -y xvfb" "$(pkg_install_hint xvfb)"
  RETROPI_PKG="brew";   assert_eq "brew install xvfb" "$(pkg_install_hint xvfb)"
  RETROPI_PKG="pacman"; assert_eq "fuse2" "$(appimage_fuse_package)"
}

test_display_detection() {
  RETROPI_OS="macos"
  assert_ok platform_has_display
  assert_eq "" "$(headless_wrapper)"
  RETROPI_OS="linux"
  DISPLAY="" WAYLAND_DISPLAY="" assert_fails platform_has_display
  DISPLAY=":0" WAYLAND_DISPLAY="" assert_ok platform_has_display
  DISPLAY="" WAYLAND_DISPLAY="wayland-0" assert_ok platform_has_display
}

test_display_region_turns_fullscreen_into_a_window_overlay() {
  local cmd
  cmd="$(launch_command nes nestopia)"
  assert_contains "$cmd" "--fullscreen"
  assert_not_contains "$cmd" "retroarch-display.cfg"
  printf 'display:\n  region: top-half\n' > "$RETROPI_CONFIG_LOCAL"
  config_load --force
  cmd="$(launch_command nes nestopia)"
  rm -f "$RETROPI_CONFIG_LOCAL"; config_load --force
  assert_not_contains "$cmd" "--fullscreen"
  assert_contains "$cmd" "retroarch-retropi.cfg|"
  assert_contains "$cmd" "retroarch-display.cfg"
}

# --- audio: choosing the output games play through -----------------------------

_stub_wpctl() {
  mkdir -p "$SB/bin"
  cat > "$SB/bin/wpctl" <<__S__
#!/bin/sh
if [ "\$1" = "set-default" ]; then echo "\$2" > "$SB/default"; exit 0; fi
cat <<'__STATUS__'
PipeWire 'pipewire-0' [1.4.2, amr@forge, cookie:1]
 └─ Clients:
        33. WirePlumber                         [1.4.2, amr@forge, pid:1]

Audio
 ├─ Devices:
 │      48. GK106 HDMI Audio Controller         [alsa]
 │      49. Built-in Audio                      [alsa]
 │
 ├─ Sinks:
 │  *   35. Built-in Audio Digital Stereo (IEC958) [vol: 0.40]
 │      56. GK106 HDMI Audio Controller Digital Stereo (HDMI) [vol: 0.40]
 │
 ├─ Sources:
 │      60. Built-in Audio Analog Stereo        [vol: 1.00]
 │
 ├─ Filters:
 │
 └─ Streams:

Video
 ├─ Devices:
 │      70. Fake HDMI Camera                    [v4l2]
__STATUS__
__S__
  chmod +x "$SB/bin/wpctl"
  export PATH="$SB/bin:$PATH"
}

test_audio_outputs_lists_sinks_only() {
  RETROPI_OS="linux"
  _stub_wpctl
  local out
  out="$(audio_outputs)"
  assert_eq 2 "$(printf '%s\n' "$out" | grep -c .)" "only the two sinks: $out"
  assert_contains "$out" "$(printf '35\t*\tBuilt-in Audio Digital Stereo (IEC958)')"
  assert_contains "$out" "$(printf '56\t\tGK106 HDMI Audio Controller Digital Stereo (HDMI)')"
  assert_not_contains "$out" "Camera"
  assert_not_contains "$out" "Analog Stereo"
}

test_audio_set_output_matches_case_insensitively() {
  RETROPI_OS="linux"
  _stub_wpctl
  assert_eq "GK106 HDMI Audio Controller Digital Stereo (HDMI)" "$(audio_set_output hdmi)"
  assert_eq "56" "$(cat "$SB/default")"
  assert_fails audio_set_output "bluetooth"
}

test_audio_is_linux_only() {
  RETROPI_OS="macos"
  assert_fails audio_supported
}

test_buildbot_paths_match_known_targets() {
  # Pin to the host arch: buildbot_path() consults the installed RetroArch
  # binary, and this test is about the arch -> path mapping alone.
  export RETROPI_RETROARCH_BIN="/nonexistent/retroarch"
  RETROPI_OS="macos"; RETROPI_ARCH="arm64"
  assert_eq "apple/osx/arm64" "$(buildbot_path)"
  # 64-bit ARM is "aarch64" upstream, not "arm64" - the Raspberry Pi 4/5 path.
  RETROPI_OS="linux"; RETROPI_ARCH="aarch64"
  assert_eq "linux/aarch64" "$(buildbot_path)"
  RETROPI_ARCH="armv7l"
  assert_eq "linux/armv7-neon-hf" "$(buildbot_path)"
  RETROPI_OS="plan9"; RETROPI_ARCH="sparc"
  assert_fails buildbot_path
  unset RETROPI_RETROARCH_BIN
}

test_core_download_url_is_zipped_and_platform_matched() {
  export RETROPI_RETROARCH_BIN="/nonexistent/retroarch"
  RETROPI_OS="linux"; RETROPI_ARCH="aarch64"
  assert_eq "https://buildbot.libretro.com/nightly/linux/aarch64/latest/snes9x_libretro.so.zip" \
            "$(core_download_url snes9x_libretro)"
  unset RETROPI_RETROARCH_BIN
}

# --- core architecture must match the RetroArch binary, not the OS -----------
# Found the hard way: the Homebrew cask ships an x86_64-only RetroArch, so an
# arm64 Mac downloading arm64 cores gets "incompatible architecture" at dlopen.

test_core_arch_override_drives_buildbot_path() {
  RETROPI_OS="macos"; RETROPI_ARCH="arm64"
  # An x86_64 RetroArch on arm64 hardware must pull x86_64 cores.
  export RETROPI_CORE_ARCH="x86_64"
  assert_eq "x86_64" "$(retroarch_arch)"
  assert_eq "apple/osx/x86_64" "$(buildbot_path)"
  assert_contains "$(core_download_url snes9x_libretro)" "apple/osx/x86_64"
  unset RETROPI_CORE_ARCH
}

test_core_arch_defaults_to_host_when_no_binary() {
  RETROPI_OS="macos"; RETROPI_ARCH="arm64"
  export RETROPI_RETROARCH_BIN="/nonexistent/retroarch"
  assert_eq "arm64" "$(retroarch_arch)"
  unset RETROPI_RETROARCH_BIN
}

test_native_arm64_retroarch_uses_arm64_cores() {
  RETROPI_OS="macos"; RETROPI_ARCH="arm64"
  export RETROPI_CORE_ARCH="arm64"
  assert_eq "apple/osx/arm64" "$(buildbot_path)"
  unset RETROPI_CORE_ARCH
}

test_pi_arch_detection_is_unaffected() {
  RETROPI_OS="linux"; RETROPI_ARCH="aarch64"
  export RETROPI_RETROARCH_BIN="/nonexistent/retroarch"
  assert_eq "linux/aarch64" "$(buildbot_path)"
  unset RETROPI_RETROARCH_BIN
}

# --- Rosetta detection: x86_64 RetroArch on arm64 breaks 3D cores -------------
# Symptom is misleading: the core loads the ROM fine, then exits with
# "Cannot open video driver", which looks like a bad ROM.

test_translated_retroarch_is_detected() {
  RETROPI_OS="macos"; RETROPI_ARCH="arm64"
  export RETROPI_CORE_ARCH="x86_64"
  assert_ok retroarch_translated
  unset RETROPI_CORE_ARCH
}

test_native_arm64_retroarch_is_not_flagged() {
  RETROPI_OS="macos"; RETROPI_ARCH="arm64"
  export RETROPI_CORE_ARCH="arm64"
  assert_fails retroarch_translated
  unset RETROPI_CORE_ARCH
}

test_intel_mac_is_not_translated() {
  RETROPI_OS="macos"; RETROPI_ARCH="x86_64"
  export RETROPI_CORE_ARCH="x86_64"
  assert_fails retroarch_translated
  unset RETROPI_CORE_ARCH
}

test_linux_is_never_translated() {
  RETROPI_OS="linux"; RETROPI_ARCH="aarch64"
  export RETROPI_CORE_ARCH="x86_64"
  assert_fails retroarch_translated
  unset RETROPI_CORE_ARCH
}

test_macos_retroarch_url_is_the_universal_metal_build() {
  export RETROPI_RETROARCH_VERSION="1.22.2"
  local url
  url="$(retroarch_macos_url)"
  assert_contains "$url" "universal"
  assert_contains "$url" "RetroArch_Metal.dmg"
  assert_contains "$url" "1.22.2"
  unset RETROPI_RETROARCH_VERSION
}

# --- RetroArch settings travel with the launch command ------------------------
# macOS builds keep retroarch.cfg in different places (Homebrew under
# ~/Library/Application Support, upstream under ~/Documents/RetroArch), so
# writing settings into "the" config silently failed. --appendconfig hands
# them over at launch instead.

test_launch_command_appends_our_config() {
  RETROPI_OS="macos"; RETROPI_ARCH="arm64"
  export RETROPI_RETROARCH_BIN="/nonexistent/retroarch"
  local cmd
  cmd="$(launch_command nes nestopia)"
  assert_contains "$cmd" "--appendconfig"
  assert_contains "$cmd" "retroarch-retropi.cfg"
  unset RETROPI_RETROARCH_BIN
}

test_append_config_can_be_disabled() {
  printf 'emulation:\n  append_config: false\n' > "$RETROPI_CONFIG_LOCAL"
  config_load --force
  export RETROPI_RETROARCH_BIN="/nonexistent/retroarch"
  assert_not_contains "$(launch_command nes nestopia)" "--appendconfig"
  unset RETROPI_RETROARCH_BIN
  rm -f "$RETROPI_CONFIG_LOCAL"
  config_load --force
}

test_retroarch_config_dir_prefers_an_existing_config() {
  RETROPI_OS="macos"
  local fake="$SB/home"
  HOME_SAVE="$HOME"; HOME="$fake"
  mkdir -p "$HOME/Documents/RetroArch" "$HOME/Library/Application Support/RetroArch"
  : > "$HOME/Library/Application Support/RetroArch/retroarch.cfg"
  assert_eq "$HOME/Library/Application Support/RetroArch" "$(retroarch_config_dir)"
  HOME="$HOME_SAVE"
}

test_retroarch_config_dir_falls_back_to_a_used_directory() {
  RETROPI_OS="macos"
  local fake="$SB/home2"
  HOME_SAVE="$HOME"; HOME="$fake"
  # No cfg anywhere, but RetroArch demonstrably used ~/Documents/RetroArch.
  mkdir -p "$HOME/Documents/RetroArch/system"
  assert_eq "$HOME/Documents/RetroArch" "$(retroarch_config_dir)"
  HOME="$HOME_SAVE"
}

# --- folder names resolve to systems -----------------------------------------
# Bulk collections are organised by console folder, and that name is often the
# only usable signal: .bin and .zip belong to many systems, .sg to none that a
# plain extension table knows.

test_folder_name_matches_by_id() {
  assert_eq "gamegear"     "$(system_match 'Game Gear')"
  assert_eq "mastersystem" "$(system_match 'Master System')"
  assert_eq "sega32x"      "$(system_match 'Sega 32X')"
}

test_folder_name_matches_by_full_name() {
  assert_eq "n64" "$(system_match 'Nintendo 64')"
}

test_folder_name_matches_after_dropping_the_manufacturer() {
  # "Sega Genesis" is not an id, a name or an alias - but "genesis" is.
  assert_eq "megadrive" "$(system_match 'Sega Genesis')"
}

test_folder_name_matching_ignores_case_and_punctuation() {
  assert_eq "sg1000" "$(system_match 'SG-1000')"
  assert_eq "nes"    "$(system_match 'n.e.s.')"
  assert_eq "snes"   "$(system_match '  SNES  ')"
}

test_unknown_folder_name_does_not_match() {
  assert_fails system_match "Some Console That Does Not Exist"
  assert_fails system_match ""
}
