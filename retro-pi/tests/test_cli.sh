#!/usr/bin/env bash
# CLI contract: help, unknown commands, exit codes, global flags.

setup_sandbox() { RP="$REPO_ROOT/bin/retropi"; }
teardown_sandbox() { :; }

test_version_flag_prints_version() {
  assert_contains "$("$RP" --version)" "retropi"
}

test_help_lists_core_commands() {
  local out
  out="$("$RP" --help 2>&1)"
  assert_contains "$out" "doctor"
  assert_contains "$out" "install"
  assert_contains "$out" "build"
  assert_contains "$out" "roms"
  assert_contains "$out" "sync"
}

test_unknown_command_fails_with_message() {
  local out
  out="$("$RP" definitely-not-a-command 2>&1)" && return 1
  assert_contains "$out" "unknown command"
}

test_no_arguments_shows_usage_and_fails() {
  assert_fails "$RP"
}

test_every_command_has_help() {
  local c out
  for c in doctor install build config systems roms bios cores sync package extend clean; do
    out="$("$RP" "$c" --help 2>&1)" || true
    assert_contains "$out" "retropi $c" "no help text for '$c'" || return 1
  done
}

test_subcommand_help_does_not_require_config() {
  assert_ok "$RP" config --help
  assert_ok "$RP" systems --help
}

test_systems_list_shows_enabled_systems() {
  local out
  out="$("$RP" systems list 2>&1)"
  assert_contains "$out" "nes"
  assert_contains "$out" "Nintendo Entertainment System"
}

test_systems_show_reports_detail() {
  local out
  out="$("$RP" systems show psx 2>&1)"
  assert_contains "$out" "Sony PlayStation"
  assert_contains "$out" "swanstation_libretro"
  assert_contains "$out" "scph5501.bin"
}

test_systems_show_accepts_aliases() {
  local out
  out="$("$RP" systems show genesis 2>&1)"
  assert_contains "$out" "Mega Drive"
}

test_unknown_system_is_rejected() {
  assert_fails "$RP" systems show not_a_console
}

test_config_get_reads_defaults() {
  assert_eq "retroarch" "$("$RP" config get emulation.backend 2>/dev/null)"
}

test_dry_run_is_accepted_globally() {
  assert_ok "$RP" --dry-run clean
}

# --- global flags must work on BOTH sides of the subcommand -------------------
# Regression: routing everything after the subcommand to that subcommand (so
# `retropi doctor --help` worked) broke the documented `retropi doctor -v`.
# doctor rejected it outright and `roms scan --verbose` silently ignored it.

test_global_verbose_accepted_after_subcommand() {
  local out
  out="$("$RP" cores list -v 2>&1)" || true
  assert_not_contains "$out" "unknown option"
}

test_global_flags_identical_in_either_position() {
  local before after
  before="$("$RP" -v cores list 2>&1)"
  after="$("$RP" cores list -v 2>&1)"
  assert_eq "$before" "$after" "leading and trailing -v differ"
}

test_trailing_dry_run_is_honored() {
  local out
  out="$("$RP" build -n --systems nes 2>&1)" || true
  assert_contains "$out" "dry"
}

test_help_still_reaches_the_subcommand() {
  # The global parser must not swallow --help: that was the original fix.
  local out
  out="$("$RP" doctor --help 2>&1)"
  assert_contains "$out" "retropi doctor"
  assert_not_contains "$out" "SETUP"
}

test_double_dash_stops_flag_interpretation() {
  local out
  out="$("$RP" roms find -- "-v" 2>&1)" || true
  assert_contains "$out" "matches"
}

test_unknown_option_is_still_rejected() {
  assert_fails "$RP" doctor --definitely-not-a-flag
}

# tools/run-rom.sh: bounded, screenshot-taking, display-free runs are how a
# server (or CI) proves a core really renders.
test_run_rom_bounded_headless_command() {
  local tmp out
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/retropi-runrom.XXXXXX")"
  mkdir -p "$tmp/cores"
  touch "$tmp/cores/nestopia_libretro.so" "$tmp/cores/nestopia_libretro.dylib" "$tmp/game.nes"
  out="$(RETROPI_CORE_DIR="$tmp/cores" RETROPI_SYSTEM_CORE_DIRS="" RETROPI_RETROARCH_BIN=/usr/bin/true \
    "$REPO_ROOT/tools/run-rom.sh" nes "$tmp/game.nes" --emulator nestopia --print \
    --frames 90 --screenshot "$tmp/shot.png" 2>/dev/null)"
  rm -rf "$tmp"
  assert_contains "$out" "--max-frames=90"
  assert_contains "$out" "--max-frames-ss-path="
  assert_contains "$out" "shot.png"
}

test_run_rom_rejects_a_bad_frame_count() {
  local tmp
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/retropi-runrom.XXXXXX")"
  mkdir -p "$tmp/cores"
  touch "$tmp/cores/nestopia_libretro.so" "$tmp/cores/nestopia_libretro.dylib" "$tmp/game.nes"
  assert_fails env RETROPI_CORE_DIR="$tmp/cores" RETROPI_SYSTEM_CORE_DIRS="" RETROPI_RETROARCH_BIN=/usr/bin/true \
    "$REPO_ROOT/tools/run-rom.sh" nes "$tmp/game.nes" --emulator nestopia --print --frames soon
  rm -rf "$tmp"
}

test_frontend_session_is_documented_and_validates_subcommands() {
  assert_contains "$("$RP" frontend --help 2>&1)" "frontend session start"
  assert_fails "$RP" frontend session sideways
}

# The session client runs under bin/retropi's errexit + pipefail. Its window
# search fails until the frontend maps a window; that failure once killed the
# client, and xinit shut X down with it. Stubs stand in for X and ES-DE.
test_session_client_survives_the_window_search_and_places_the_frontend() {
  local tmp out
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/retropi-session.XXXXXX")"
  mkdir -p "$tmp/bin"
  cat > "$tmp/bin/xrandr" <<'__S__'
#!/bin/sh
printf 'Screen 0: minimum 320 x 200, current 1200 x 1920, maximum 16384 x 16384\n'
printf 'HDMI-1 connected 1200x1920+0+0 left\n'
__S__
  printf '#!/bin/sh\nexit 0\n' > "$tmp/bin/xset"
  cat > "$tmp/bin/xdotool" <<__S__
#!/bin/sh
case "\$1" in
  search)
    n=\$(cat "$tmp/searches" 2>/dev/null || echo 0); n=\$((n+1)); echo \$n > "$tmp/searches"
    [ "\$n" -ge 5 ] && { echo 4242; exit 0; }
    exit 1 ;;
  windowmove) echo "\$*" > "$tmp/moved" ;;
esac
__S__
  printf '#!/bin/sh\nsleep 3\nexit 0\n' > "$tmp/bin/ES-DE"
  chmod +x "$tmp/bin/"*
  out="$(PATH="$tmp/bin:$PATH" DISPLAY=:99 RETROPI_FRONTEND_BIN="$tmp/bin/ES-DE" \
    "$RP" frontend session client 2>&1)"
  local rc=$?
  local moved
  moved="$(cat "$tmp/moved" 2>/dev/null)"
  rm -rf "$tmp"
  assert_eq 0 "$rc" "session client exited early: $out"
  assert_contains "$out" "screen 1200x1920"
  assert_eq "windowmove 4242 0 0" "$moved"
}
