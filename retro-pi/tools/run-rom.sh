#!/usr/bin/env bash
# tools/run-rom.sh - launch a ROM with the emulator retro-pi resolved for it.
#
# This is the "run the app" entry point: it uses the same core resolution the
# generated frontend config uses, so what you see here is what the frontend
# will do.
#
#   tools/run-rom.sh nes                       # first ROM in roms/nes
#   tools/run-rom.sh nes path/to/game.nes      # a specific ROM
#   tools/run-rom.sh nes --emulator mesen      # a specific emulator
#   tools/run-rom.sh nes --print               # print the command, run nothing
#   tools/run-rom.sh nes --headless --frames 120 --screenshot shot.png
#                                              # prove video works with no display

set -o errexit
set -o nounset
set -o pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export RETROPI_ROOT="$ROOT"
# shellcheck source=../lib/common.sh
. "$ROOT/lib/common.sh"
# shellcheck source=../lib/platform.sh
. "$ROOT/lib/platform.sh"
# shellcheck source=../lib/config.sh
. "$ROOT/lib/config.sh"
# shellcheck source=../lib/systems.sh
. "$ROOT/lib/systems.sh"

usage() {
  cat >&2 <<'__U__'
tools/run-rom.sh - launch a ROM with retro-pi's resolved emulator

  tools/run-rom.sh <system> [rom] [options]

  --emulator <id>   use a specific emulator instead of the default
  --print           print the launch command and exit
  --fullscreen      launch fullscreen (default is windowed, for debugging)
  --log <file>      write a RetroArch verbose log here
  --frames <n>      quit after n frames instead of waiting for you
  --screenshot <f>  save the last frame to f (implies --frames 120 if unset)
  --headless        run inside a virtual display (xvfb-run); for servers and
                    SSH sessions, where there is no screen to open a window on

With no ROM, the first file in the system's ROM folder is used. For a quick
smoke test with no game at all:

  python3 tests/fixtures/make_test_rom.py roms/nes/retropi-test.nes
  tools/run-rom.sh nes
__U__
}

[[ $# -gt 0 ]] || { usage; exit 1; }
case "$1" in -h|--help) usage; exit 0 ;; esac

config_init
detect_platform
config_load

system=""
rom=""
emulator=""
print_only=0
fullscreen=0
logfile=""
frames=""
screenshot=""
headless=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --emulator) emulator="${2:-}"; shift ;;
    --print) print_only=1 ;;
    --fullscreen) fullscreen=1 ;;
    --log) logfile="${2:-}"; shift ;;
    --frames) frames="${2:-}"; shift ;;
    --screenshot) screenshot="${2:-}"; shift ;;
    --headless) headless=1 ;;
    -h|--help) usage; exit 0 ;;
    -*) die "unknown option: $1" ;;
    *)
      if [[ -z "$system" ]]; then system="$1"
      elif [[ -z "$rom" ]]; then rom="$1"
      else die "unexpected argument: $1"; fi ;;
  esac
  shift
done

[[ -n "$system" ]] || { usage; exit 1; }
system="$(system_resolve "$system")" || die "unknown system: $system"

# --- pick a ROM ---------------------------------------------------------------
if [[ -z "$rom" ]]; then
  romdir="$(system_rom_dir "$system")"
  [[ -d "$romdir" ]] || die "no ROM folder yet: $romdir (run: ./bin/retropi build)"
  for ext in $(sys_list "$system" extensions); do
    rom="$(find "$romdir" -type f -iname "*$ext" 2>/dev/null | sort | head -1)"
    [[ -n "$rom" ]] && break
  done
  [[ -n "$rom" ]] || die "no ROM found in $romdir
Generate a test cartridge with:
  python3 tests/fixtures/make_test_rom.py $romdir/retropi-test.nes"
fi
[[ -f "$rom" ]] || die "no such file: $rom"

# --- resolve the emulator -----------------------------------------------------
[[ -n "$emulator" ]] || emulator="$(default_emulator "$system")" \
  || die "no emulator available for $system on $(platform_label)"
idx="$(emulator_index_of "$system" "$emulator")" \
  || die "$system has no emulator '$emulator' (see: ./bin/retropi systems show $system)"

core="$(emulator_field "$system" "$idx" core "")"
if [[ -n "$core" ]]; then
  core_installed "$core" \
    || die "core not installed: $core
Install it with:  ./bin/retropi cores install --system $system"
  core_arch_matches "$core" \
    || die "core '$core' is built for the wrong architecture; RetroArch needs $(retroarch_arch)
Fix it with:  ./bin/retropi cores install --force $core"
fi

cmd="$(launch_command "$system" "$emulator")"
# The generated command is what the frontend runs; windowed is friendlier when
# you are debugging, so strip --fullscreen unless it was asked for.
[[ "$fullscreen" == "1" ]] || cmd="${cmd// --fullscreen/}"
[[ -n "$logfile" ]] && cmd="$cmd --verbose --log-file \"$logfile\""
if [[ -n "$frames" ]]; then
  [[ "$frames" =~ ^[0-9]+$ && "$frames" -gt 0 ]] || die "--frames needs a positive number, got: $frames"
fi
if [[ -n "$screenshot" ]]; then
  [[ -n "$frames" ]] || frames=120
  mkdir -p "$(dirname "$screenshot")"
  shot_abs="$(abspath "$screenshot")"
fi
[[ -n "$frames" ]] && cmd="$cmd --max-frames=$frames"
[[ -n "$screenshot" ]] && cmd="$cmd --max-frames-ss --max-frames-ss-path=\"$shot_abs\""
if [[ "$headless" == "1" ]]; then
  wrapper="$(headless_wrapper)" || die "--headless needs xvfb-run: $(pkg_install_hint "xvfb xauth")"
  [[ -n "$wrapper" ]] && cmd="$wrapper $cmd"
elif [[ "$print_only" == "0" ]] && ! platform_has_display; then
  die "no display in this shell (DISPLAY and WAYLAND_DISPLAY are unset)
Run from a desktop session, or test without one:
  tools/run-rom.sh $system --headless --frames 120 --screenshot /tmp/shot.png"
fi

# %ROM% is the frontend's placeholder; substitute the real path.
rom_abs="$(abspath "$rom")"
cmd="${cmd//%ROM%/\"$rom_abs\"}"

info "$system -> $(emulator_field "$system" "$idx" display "$emulator")"
step "rom:  $(basename "$rom_abs")"
step "core: ${core:-standalone}"

if [[ "$print_only" == "1" ]]; then
  printf '%s\n' "$cmd"
  exit 0
fi

log ""
eval "$cmd"
if [[ -n "$screenshot" ]]; then
  [[ -s "$shot_abs" ]] || die "RetroArch exited without writing $shot_abs"
  ok "screenshot: $shot_abs"
fi
