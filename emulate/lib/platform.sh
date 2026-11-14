#!/usr/bin/env bash
# lib/platform.sh - detect the host and expose one vocabulary for both targets.
#
# Everything above this layer talks in terms of RETROPI_OS / pkg_install /
# core_dir; nothing else in the tree is allowed to branch on `uname`.

# --- detection ----------------------------------------------------------------

detect_platform() {
  RETROPI_ARCH="$(uname -m)"
  case "$(uname -s)" in
    Darwin) RETROPI_OS="macos" ;;
    Linux)  RETROPI_OS="linux" ;;
    *)      RETROPI_OS="unknown" ;;
  esac

  # Raspberry Pi identifies itself in the device tree; fall back to cpuinfo.
  RETROPI_IS_PI=0
  RETROPI_PI_MODEL=""
  if [[ -r /proc/device-tree/model ]]; then
    RETROPI_PI_MODEL="$(tr -d '\0' < /proc/device-tree/model 2>/dev/null || true)"
  elif [[ -r /proc/cpuinfo ]]; then
    RETROPI_PI_MODEL="$(awk -F': ' '/^Model/{print $2; exit}' /proc/cpuinfo 2>/dev/null || true)"
  fi
  [[ "$RETROPI_PI_MODEL" == *"Raspberry Pi"* ]] && RETROPI_IS_PI=1

  # Distro id, for apt-vs-other messaging.
  RETROPI_DISTRO=""
  if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    RETROPI_DISTRO="$(. /etc/os-release && printf '%s' "${ID:-}")"
  fi

  # SteamOS ships pacman, but its root filesystem is read-only and replaced
  # on every OS update, so nothing may be installed there. retro-pi installs
  # into $HOME instead (AppImages), and RETROPI_PKG says so.
  RETROPI_IS_STEAMOS=0
  [[ "$RETROPI_DISTRO" == "steamos" ]] && RETROPI_IS_STEAMOS=1

  # Package manager.
  if [[ "$RETROPI_IS_STEAMOS" == "1" ]]; then RETROPI_PKG="steamos"
  elif have brew; then RETROPI_PKG="brew"
  elif have apt-get; then RETROPI_PKG="apt"
  elif have dnf;  then RETROPI_PKG="dnf"
  elif have pacman; then RETROPI_PKG="pacman"
  else RETROPI_PKG="none"; fi

  export RETROPI_OS RETROPI_ARCH RETROPI_IS_PI RETROPI_PI_MODEL RETROPI_DISTRO RETROPI_IS_STEAMOS RETROPI_PKG
}

platform_label() {
  local label="$RETROPI_OS/$RETROPI_ARCH"
  [[ "$RETROPI_IS_PI" == "1" ]] && label="$label (${RETROPI_PI_MODEL:-Raspberry Pi})"
  [[ "${RETROPI_IS_STEAMOS:-0}" == "1" ]] && label="$label (SteamOS)"
  printf '%s' "$label"
}

# platform_tags - tags a manifest can filter emulators on (macos, linux, pi, steamos, arm64).
platform_tags() {
  local tags="$RETROPI_OS $RETROPI_ARCH"
  [[ "$RETROPI_IS_PI" == "1" ]] && tags="$tags pi"
  [[ "${RETROPI_IS_STEAMOS:-0}" == "1" ]] && tags="$tags steamos"
  printf '%s' "$tags"
}

# --- package manager abstraction ---------------------------------------------

# pkg_install <pkg...> - install OS packages using whatever manager exists.
pkg_install() {
  [[ $# -gt 0 ]] || return 0
  case "$RETROPI_PKG" in
    brew)   run brew install "$@" ;;
    apt)    run sudo apt-get install -y --no-install-recommends "$@" ;;
    dnf)    run sudo dnf install -y "$@" ;;
    pacman) run sudo pacman -S --needed --noconfirm "$@" ;;
    steamos) die "SteamOS keeps its root filesystem read-only; not installing: $* (use a Flatpak or AppImage)" ;;
    *)      die "no supported package manager found; install manually: $*" ;;
  esac
}

# pkg_install_cask <cask...> - macOS GUI apps; a no-op elsewhere.
pkg_install_cask() {
  [[ $# -gt 0 ]] || return 0
  [[ "$RETROPI_OS" == "macos" ]] || { debug "skipping casks on $RETROPI_OS: $*"; return 0; }
  run brew install --cask "$@"
}

# pkg_install_hint <pkg> - the command a person should run to install <pkg>.
pkg_install_hint() {
  case "$RETROPI_PKG" in
    brew)   printf 'brew install %s' "$1" ;;
    apt)    printf 'sudo apt-get install -y %s' "$1" ;;
    dnf)    printf 'sudo dnf install -y %s' "$1" ;;
    pacman) printf 'sudo pacman -S %s' "$1" ;;
    steamos) printf '%s is not in this SteamOS image; the root is read-only, so use a Flatpak or AppImage' "$1" ;;
    *)      printf 'install %s with your package manager' "$1" ;;
  esac
}

pkg_refresh() {
  case "$RETROPI_PKG" in
    brew) run brew update ;;
    apt)  run sudo apt-get update ;;
    *)    : ;;
  esac
}

# pkg_installed <pkg> - true when the package is already present.
pkg_installed() {
  case "$RETROPI_PKG" in
    brew) brew list --versions "$1" >/dev/null 2>&1 || brew list --cask --versions "$1" >/dev/null 2>&1 ;;
    apt)  dpkg -s "$1" >/dev/null 2>&1 ;;
    dnf)  rpm -q "$1" >/dev/null 2>&1 ;;
    pacman) pacman -Qi "$1" >/dev/null 2>&1 ;;
    *) return 1 ;;
  esac
}

# --- RetroArch layout ---------------------------------------------------------
# RetroArch stores cores and config in different places per platform. These are
# the only functions that know that.

# retroarch_config_dir - where RetroArch reads retroarch.cfg from.
#
# Probed, not hardcoded: macOS builds disagree. The Homebrew cask uses
# ~/Library/Application Support/RetroArch, while the upstream build (the one
# retro-pi installs) keeps user data under ~/Documents/RetroArch. Writing to
# the wrong one is silent - settings simply never take effect, which showed up
# as a PSX core hunting for a BIOS in a directory we had never configured.
retroarch_config_dir() {
  if [[ -n "${RETROPI_RETROARCH_CONFIG:-}" ]]; then
    printf '%s' "$RETROPI_RETROARCH_CONFIG"; return
  fi
  local c
  # Read line by line: "Application Support" contains a space, and
  # `for c in $(...)` would split it into two bogus candidates.
  # 1. A directory that already holds a retroarch.cfg is authoritative.
  while IFS= read -r c; do
    [[ -n "$c" ]] || continue
    [[ -f "$c/retroarch.cfg" ]] && { printf '%s' "$c"; return; }
  done < <(_ra_config_candidates)
  # 2. Otherwise the one RetroArch has demonstrably used (it creates these).
  while IFS= read -r c; do
    [[ -n "$c" ]] || continue
    [[ -d "$c/system" || -d "$c/states" || -d "$c/playlists" ]] && { printf '%s' "$c"; return; }
  done < <(_ra_config_candidates)
  # 3. Fall back to the platform default. head -1 rather than positional
  # parameters: the macOS fallback contains spaces and would word-split.
  _ra_config_candidates | head -1 | tr -d '\n'
}

# _ra_config_candidates - possible config homes, most likely first.
# Paths contain no spaces on Linux; the macOS one does, so it is emitted last
# and callers use the single-value accessor above rather than splitting.
_ra_config_candidates() {
  case "$RETROPI_OS" in
    macos)
      printf '%s\n' "$HOME/Documents/RetroArch"
      printf '%s\n' "$HOME/Library/Application Support/RetroArch"
      ;;
    *)
      printf '%s\n' "${XDG_CONFIG_HOME:-$HOME/.config}/retroarch"
      printf '%s\n' "/opt/retropie/configs/all/retroarch"
      ;;
  esac
}

# core_dir - where retro-pi INSTALLS cores. Always a directory the user owns.
#
# Distro and RetroPie core directories are root-owned, so they are searched
# (see core_path) but never written to: pointing `cores install` at
# /usr/lib/x86_64-linux-gnu/libretro would fail on every download.
core_dir() {
  if [[ -n "${RETROPI_CORE_DIR:-}" ]]; then printf '%s' "$RETROPI_CORE_DIR"; return; fi
  case "$RETROPI_OS" in
    macos) printf '%s' "$HOME/Library/Application Support/RetroArch/cores" ;;
    *)     printf '%s' "${XDG_CONFIG_HOME:-$HOME/.config}/retroarch/cores" ;;
  esac
}

# linux_multiarch - the Debian multiarch triplet for this machine.
# Debian and Ubuntu ship apt cores (libretro-nestopia, libretro-mgba, ...) under
# /usr/lib/<triplet>/libretro, not /usr/lib/libretro.
linux_multiarch() {
  case "$RETROPI_ARCH" in
    x86_64)          printf 'x86_64-linux-gnu' ;;
    aarch64|arm64)   printf 'aarch64-linux-gnu' ;;
    armv7l|armv6l)   printf 'arm-linux-gnueabihf' ;;
    i686|i386)       printf 'i386-linux-gnu' ;;
    *) return 1 ;;
  esac
}

# system_core_dirs - read-only core directories the OS or RetroPie provides,
# most specific first. RETROPI_SYSTEM_CORE_DIRS (colon-separated, may be empty)
# replaces the list; tests set it so the host's packages cannot leak in.
system_core_dirs() {
  if [[ -n "${RETROPI_SYSTEM_CORE_DIRS+set}" ]]; then
    [[ -n "$RETROPI_SYSTEM_CORE_DIRS" ]] && printf '%s\n' "$RETROPI_SYSTEM_CORE_DIRS" | tr ':' '\n'
    return 0
  fi
  [[ "$RETROPI_OS" == "linux" ]] || return 0
  local ma
  ma="$(linux_multiarch)" && printf '%s\n' "/usr/lib/$ma/libretro"
  printf '%s\n' /usr/lib/libretro /usr/lib64/libretro
  # RetroPie nests each core in its own package directory (lr-snes9x/...).
  printf '%s\n' /opt/retropie/libretrocores
  return 0
}

# core_search_dirs - every existing directory cores are looked up in.
core_search_dirs() {
  local d
  printf '%s\n' "$(core_dir)"
  while IFS= read -r d; do
    [[ -n "$d" && -d "$d" ]] && printf '%s\n' "$d"
  done < <(system_core_dirs)
  return 0
}

core_ext() {
  [[ "$RETROPI_OS" == "macos" ]] && printf 'dylib' || printf 'so'
}

# core_path <core_name> - absolute path to a core binary (may not exist yet).
#
# A core retro-pi installed wins; otherwise one the distro or RetroPie
# provides; otherwise the path an install would create.
core_path() {
  local file dir d f
  file="$1.$(core_ext)"
  dir="$(core_dir)"
  if [[ ! -f "$dir/$file" ]]; then
    while IFS= read -r d; do
      [[ -n "$d" && -d "$d" ]] || continue
      [[ -f "$d/$file" ]] && { printf '%s/%s' "$d" "$file"; return 0; }
      for f in "$d"/*/"$file"; do
        [[ -f "$f" ]] && { printf '%s' "$f"; return 0; }
      done
    done < <(system_core_dirs)
  fi
  printf '%s/%s' "$dir" "$file"
}

# core_managed <core_name> - true when the core lives in retro-pi's own
# directory (so retro-pi may update or remove it) rather than a package's.
core_managed() {
  [[ "$(core_path "$1")" == "$(core_dir)/"* ]]
}

# core_installed <core_name>
core_installed() { [[ -f "$(core_path "$1")" ]]; }

# _elf_arch <file> - the machine an ELF binary was built for, as retroarch_arch
# spells it; empty when it cannot be told.
_elf_arch() {
  have file || return 0
  case "$(file -L "$1" 2>/dev/null)" in
    *aarch64*)         printf 'aarch64' ;;
    *x86-64*)          printf 'x86_64' ;;
    *"Intel 80386"*)   printf 'i686' ;;
    *"ARM, EABI"*)     printf 'armv7l' ;;
  esac
  return 0
}

# core_arch_matches <core_name> - true when an installed core can actually be
# loaded by this RetroArch. Catches the arm64-core/x86_64-RetroArch mismatch
# that otherwise only shows up as a runtime dlopen failure.
core_arch_matches() {
  local f want got
  f="$(core_path "$1")"
  [[ -f "$f" ]] || return 1
  want="$(retroarch_arch)"
  if [[ "$RETROPI_OS" == "macos" ]] && have lipo; then
    got="$(lipo -archs "$f" 2>/dev/null || true)"
    [[ -z "$got" ]] && return 0          # cannot tell: do not cry wolf
    case " $got " in *" $want "*) return 0 ;; esac
    return 1
  fi
  got="$(_elf_arch "$f")"
  [[ -z "$got" ]] && return 0
  case "$want:$got" in
    arm64:aarch64|armv6l:armv7l) return 0 ;;
  esac
  [[ "$want" == "$got" ]]
}

# retroarch_bin - the launcher command ES will invoke.
retroarch_bin() {
  if [[ -n "${RETROPI_RETROARCH_BIN:-}" ]]; then printf '%s' "$RETROPI_RETROARCH_BIN"; return; fi
  if have retroarch; then command -v retroarch; return; fi
  if [[ "$RETROPI_OS" == "macos" && -x "/Applications/RetroArch.app/Contents/MacOS/RetroArch" ]]; then
    printf '%s' "/Applications/RetroArch.app/Contents/MacOS/RetroArch"; return
  fi
  if [[ "$RETROPI_OS" == "linux" && -x "$(retroarch_appimage_path)" ]]; then
    retroarch_appimage_path; return
  fi
  if [[ -x /opt/retropie/emulators/retroarch/bin/retroarch ]]; then
    printf '%s' "/opt/retropie/emulators/retroarch/bin/retroarch"; return
  fi
  printf 'retroarch'
}

# --- libretro buildbot --------------------------------------------------------
# Maps the host to the buildbot path that serves matching core binaries.

buildbot_base() { printf '%s' "${RETROPI_BUILDBOT:-https://buildbot.libretro.com/nightly}"; }

# retroarch_arch - the architecture cores must be built for.
#
# This is NOT necessarily `uname -m`. RetroArch dlopen()s cores into its own
# process, so a core has to match the RETROARCH BINARY. On Apple Silicon the
# Homebrew cask ships an x86_64-only build that runs under Rosetta, so a Mac
# reporting arm64 needs x86_64 cores. Getting this wrong fails at load time
# with "incompatible architecture", long after a successful download.
retroarch_arch() {
  if [[ -n "${RETROPI_CORE_ARCH:-}" ]]; then printf '%s' "$RETROPI_CORE_ARCH"; return; fi
  local bin archs
  bin="$(retroarch_bin)"
  have "$bin" && bin="$(command -v "$bin")"
  if [[ -x "$bin" ]]; then
    if [[ "$RETROPI_OS" == "macos" ]] && have lipo; then
      archs="$(lipo -archs "$bin" 2>/dev/null || true)"
      # A universal binary runs native, so prefer arm64 when it is offered.
      case " $archs " in
        *" arm64 "*)  printf 'arm64';  return ;;
        *" x86_64 "*) printf 'x86_64'; return ;;
      esac
    elif have file; then
      archs="$(file -L "$bin" 2>/dev/null || true)"
      case "$archs" in
        *aarch64*)         printf 'aarch64'; return ;;
        *x86-64*|*x86_64*) printf 'x86_64';  return ;;
        *armv7*)           printf 'armv7l';  return ;;
      esac
    fi
  fi
  printf '%s' "$RETROPI_ARCH"
}

buildbot_path() {
  # These strings are the buildbot's actual directory names, verified against
  # the live index. Note 64-bit ARM is "aarch64" there, NOT "arm64" - that is
  # the Raspberry Pi 4/5 path and getting it wrong 404s every core download.
  case "$RETROPI_OS:$(retroarch_arch)" in
    macos:arm64)               printf 'apple/osx/arm64' ;;
    macos:x86_64)              printf 'apple/osx/x86_64' ;;
    linux:aarch64|linux:arm64) printf 'linux/aarch64' ;;
    linux:armv7l)              printf 'linux/armv7-neon-hf' ;;
    linux:armv6l)              printf 'linux/armhf' ;;
    linux:x86_64)              printf 'linux/x86_64' ;;
    linux:i686|linux:i386)     printf 'linux/x86' ;;
    *) return 1 ;;
  esac
}

# --- display -----------------------------------------------------------------

# platform_has_display - true when a GUI program can open a window here.
# A Mac always can. On Linux an SSH session into a desktop machine has no
# DISPLAY either, so this answers "from this shell", not "on this machine".
platform_has_display() {
  [[ "$RETROPI_OS" == "linux" ]] || return 0
  [[ -n "${DISPLAY:-}" || -n "${WAYLAND_DISPLAY:-}" ]]
}

# headless_wrapper - print the command prefix that gives a GUI program a
# virtual display (empty where none is needed), or fail when there is no way to.
headless_wrapper() {
  [[ "$RETROPI_OS" == "linux" ]] || return 0
  have xvfb-run || return 1
  printf "xvfb-run -a -s '-screen 0 1280x720x24'"
}

# session_supported - true when `retropi frontend session` can take over a
# local monitor here: Linux with X11's xinit, xrandr and xdotool.
session_supported() {
  [[ "$RETROPI_OS" == "linux" ]] || return 1
  have xinit && have xrandr && have xdotool
}

# controller_profile_drivers - RetroArch joypad drivers whose autoconfig
# profiles retro-pi ships for this OS (config/controllers/<driver>/).
# RETROPI_CONTROLLER_DRIVERS overrides, for tests.
controller_profile_drivers() {
  if [[ -n "${RETROPI_CONTROLLER_DRIVERS+set}" ]]; then
    printf '%s\n' $RETROPI_CONTROLLER_DRIVERS
    return 0
  fi
  [[ "$RETROPI_OS" == "linux" ]] && printf '%s\n' udev linuxraw
  return 0
}

# default_joypad_driver - RetroArch joypad driver when controls.joypad_driver
# is auto; empty means RetroArch's own default. On SteamOS that default can be
# sdl2, whose bundled SDL cannot see Bluetooth Xbox pads, while every profile
# retro-pi ships is a udev one.
default_joypad_driver() {
  [[ "${RETROPI_IS_STEAMOS:-0}" == "1" ]] && printf 'udev'
  return 0
}

# steam_desktop_keys - keys Steam's Desktop Layout types when a controller is
# used outside a Steam game (SteamOS Desktop Mode, Steam in the background).
# RetroArch reads them as keyboard input on top of the pad itself: Enter is
# player 1 Start, the arrows the D-pad, Space fast-forward, Escape quit.
# Prints the RetroArch keyboard binds to clear; nothing where Steam is absent.
steam_desktop_keys() {
  [[ "${RETROPI_IS_STEAMOS:-0}" == "1" ]] || return 0
  printf '%s\n' input_exit_emulator input_toggle_fast_forward \
    input_player1_start input_player1_select input_player1_up input_player1_down \
    input_player1_left input_player1_right input_player1_gun_start input_player1_gun_select
}

# --- sandboxes ------------------------------------------------------------------
# An editor installed as a Flatpak (VS Code on SteamOS) runs its terminals,
# tasks and debug sessions inside the Flatpak sandbox: no host RetroArch, no
# host libraries for the cores, a different /tmp. Commands that launch or drive
# emulators hop to the host session instead.

# platform_sandboxed - true inside a Flatpak sandbox that can reach the host.
platform_sandboxed() {
  [[ -f /.flatpak-info ]] && have flatpak-spawn
}

# host_reexec <retropi args...> - re-run this retropi invocation on the host
# when sandboxed; returns (does nothing) otherwise or once already there.
host_reexec() {
  [[ "${RETROPI_ON_HOST:-0}" == "1" ]] && return 0
  platform_sandboxed || return 0
  local args v
  args=("--env=RETROPI_ON_HOST=1" "--directory=$PWD")
  for v in DISPLAY WAYLAND_DISPLAY XDG_RUNTIME_DIR XDG_SESSION_TYPE \
           RETROPI_DRY_RUN RETROPI_ASSUME_YES RETROPI_VERBOSE; do
    [[ -n "${!v:-}" ]] && args[${#args[@]}]="--env=$v=${!v}"
  done
  for v in $(compgen -e | grep '^RETROPI_' || true); do
    args[${#args[@]}]="--env=$v=${!v}"
  done
  debug "sandboxed: re-running on the host"
  exec flatpak-spawn --host --watch-bus "${args[@]}" "$RETROPI_ROOT/bin/retropi" "$@"
}

# --- audio ---------------------------------------------------------------------
# RetroArch (pulse driver) and ES-DE (SDL) both play to the sound server's
# default output, so choosing an output means changing that default. Linux with
# PipeWire only; WirePlumber remembers the choice across restarts.

# audio_supported - true when outputs can be listed and selected here.
audio_supported() {
  [[ "$RETROPI_OS" == "linux" ]] && have wpctl
}

# audio_outputs - one "id<TAB>default-mark<TAB>description" line per output.
# Parsed from `wpctl status`: the Sinks block of the Audio section.
audio_outputs() {
  audio_supported || return 1
  wpctl status 2>/dev/null | awk '
    /^Audio/ { audio = 1; next }
    /^(Video|Settings)/ { audio = 0 }
    audio && /Sinks:/ { sinks = 1; next }
    audio && /(Sources|Filters|Streams):/ { sinks = 0 }
    sinks && match($0, /[0-9]+\. /) {
      id = substr($0, RSTART, RLENGTH - 2)
      desc = substr($0, RSTART + RLENGTH)
      sub(/ *\[vol:.*$/, "", desc)
      mark = (index(substr($0, 1, RSTART), "*") > 0) ? "*" : ""
      printf "%s\t%s\t%s\n", id, mark, desc
    }'
  return 0
}

# audio_set_output <pattern> - make the first output whose description
# contains <pattern> (case-insensitive) the default. Prints its description.
audio_set_output() {
  local want line id desc lower_desc lower_want
  want="$1"
  [[ -n "$want" ]] || return 1
  lower_want="$(printf '%s' "$want" | tr '[:upper:]' '[:lower:]')"
  while IFS= read -r line; do
    id="${line%%$'\t'*}"
    desc="${line##*$'\t'}"
    lower_desc="$(printf '%s' "$desc" | tr '[:upper:]' '[:lower:]')"
    case "$lower_desc" in
      *"$lower_want"*)
        run wpctl set-default "$id" || return 1
        printf '%s' "$desc"
        return 0 ;;
    esac
  done < <(audio_outputs)
  return 1
}

# appimage_fuse_package - the package that lets an AppImage mount itself.
# Debian 13 and Ubuntu 24.04 renamed libfuse2 to libfuse2t64.
appimage_fuse_package() {
  case "$RETROPI_PKG" in
    apt)
      if apt-cache show libfuse2t64 >/dev/null 2>&1; then printf 'libfuse2t64'
      else printf 'libfuse2'; fi ;;
    dnf)    printf 'fuse-libs' ;;
    pacman) printf 'fuse2' ;;
    *)      printf 'libfuse2' ;;
  esac
}

# --- macOS: RetroArch build selection ----------------------------------------
# The Homebrew cask ships an x86_64 OpenGL build. On Apple Silicon that runs
# under Rosetta AND asks for an OpenGL context macOS no longer provides well,
# so any core that hardware-renders (N64, Dreamcast, PSP, Saturn) dies with
# "Cannot open video driver". Upstream's universal build uses Metal and runs
# natively, so that is what retro-pi installs.

# retroarch_translated - true when RetroArch is x86_64 on arm64 hardware.
retroarch_translated() {
  [[ "$RETROPI_OS" == "macos" ]] || return 1
  [[ "$RETROPI_ARCH" == "arm64" ]] || return 1
  [[ "$(retroarch_arch)" == "x86_64" ]] || return 1
  return 0
}

# retroarch_macos_url - latest stable universal (Metal) build.
retroarch_macos_url() {
  local ver="${RETROPI_RETROARCH_VERSION:-}"
  if [[ -z "$ver" ]]; then
    ver="$(_http_get "https://buildbot.libretro.com/stable/" 2>/dev/null \
          | grep -oE 'href="/stable/[0-9.]+/"' \
          | sed 's|href="/stable/||; s|/"||' | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)"
  fi
  [[ -n "$ver" ]] || return 1
  printf 'https://buildbot.libretro.com/stable/%s/apple/osx/universal/RetroArch_Metal.dmg' "$ver"
}

# --- Linux: RetroArch AppImage ----------------------------------------------
# Where packages cannot be installed (SteamOS's read-only root), RetroArch comes
# from libretro's stable buildbot as an AppImage in ~/Applications, next to
# ES-DE's. The archive also carries a "<AppImage>.home" directory of assets,
# shaders and controller profiles. It is NOT installed beside the AppImage:
# the AppImage runtime treats such a directory as a portable $HOME, which would
# move RetroArch's config away from ~/.config/retroarch. Its contents are merged
# into the real config directory instead, never overwriting the user's files.

# retroarch_appimage_path - where retro-pi installs the RetroArch AppImage.
retroarch_appimage_path() { printf '%s' "$HOME/Applications/RetroArch.AppImage"; }

# _stable_version - newest version directory on the libretro stable buildbot.
_stable_version() {
  _http_get "https://buildbot.libretro.com/stable/" 2>/dev/null \
    | grep -oE 'href="/stable/[0-9.]+/"' \
    | sed 's|href="/stable/||; s|/"||' | sort -t. -k1,1n -k2,2n -k3,3n | tail -1
}

# retroarch_linux_url - latest stable RetroArch archive (AppImage inside).
retroarch_linux_url() {
  local ver="${RETROPI_RETROARCH_VERSION:-}" path
  path="$(buildbot_path)" || return 1
  [[ -n "$ver" ]] || ver="$(_stable_version)"
  [[ -n "$ver" ]] || return 1
  printf 'https://buildbot.libretro.com/stable/%s/%s/RetroArch.7z' "$ver" "$path"
}

# install_retroarch_appimage <RetroArch.7z> - unpack the AppImage into
# ~/Applications and merge the bundled assets into the config directory.
install_retroarch_appimage() {
  local archive="$1" tmp img home dest cfg
  need 7z "required to unpack RetroArch.7z"
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/retropi-ra.XXXXXX")"
  if ! 7z x -y -o"$tmp" "$archive" >/dev/null; then
    rm -rf "$tmp"; error "could not unpack $archive"; return 1
  fi
  img="$(find "$tmp" -maxdepth 2 -name '*.AppImage' -type f | head -1)"
  if [[ -z "$img" ]]; then
    rm -rf "$tmp"; error "no AppImage inside $archive"; return 1
  fi
  dest="$(retroarch_appimage_path)"
  ensure_dir "$(dirname "$dest")"
  cp "$img" "$dest" && chmod +x "$dest"
  home="$img.home/.config/retroarch"
  if [[ -d "$home" ]]; then
    cfg="$(retroarch_config_dir)"
    ensure_dir "$cfg"
    step "merging bundled assets into $cfg"
    # -n: never replace a file the user (or an earlier install) already has.
    cp -Rn "$home"/. "$cfg"/ 2>/dev/null || true
  fi
  rm -rf "$tmp"
  printf '%s' "$dest"
}

# _http_get <url> - fetch to stdout.
_http_get() {
  if have curl; then curl -fsSL --max-time 45 "$1"
  elif have wget; then wget -qO- "$1"
  else return 1; fi
}

# install_app_from_dmg <dmg> - mount, copy the .app to /Applications, detach.
# Shared by the RetroArch and ES-DE installers; both images carry a licence
# agreement that hdiutil would otherwise block on interactively.
install_app_from_dmg() {
  local dmg="$1" mnt app dest
  need hdiutil "required to mount disk images"
  mnt="$(printf 'Y\n' | hdiutil attach -nobrowse -readonly "$dmg" 2>/dev/null \
        | grep -o '/Volumes/.*' | tail -1)"
  [[ -n "$mnt" && -d "$mnt" ]] || { error "could not mount $dmg"; return 1; }

  app="$(find "$mnt" -maxdepth 1 -name "*.app" 2>/dev/null | head -1)"
  if [[ -z "$app" ]]; then
    hdiutil detach "$mnt" >/dev/null 2>&1 || true
    error "no .app inside $dmg"
    return 1
  fi
  dest="/Applications/$(basename "$app")"
  [[ -d "$dest" ]] && { step "replacing $dest"; rm -rf "$dest"; }
  step "copying $(basename "$app") to /Applications"
  if ! cp -R "$app" "$dest" 2>/dev/null; then
    hdiutil detach "$mnt" >/dev/null 2>&1 || true
    error "could not write to /Applications"
    return 1
  fi
  hdiutil detach "$mnt" >/dev/null 2>&1 || true
  have xattr && xattr -dr com.apple.quarantine "$dest" 2>/dev/null || true
  printf '%s' "$dest"
  return 0
}

# core_download_url <core_name> - zipped core matching this host.
core_download_url() {
  local path
  path="$(buildbot_path)" || return 1
  printf '%s/%s/latest/%s.%s.zip' "$(buildbot_base)" "$path" "$1" "$(core_ext)"
}
