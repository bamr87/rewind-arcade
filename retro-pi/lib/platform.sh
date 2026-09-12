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

  # Package manager.
  if have brew;   then RETROPI_PKG="brew"
  elif have apt-get; then RETROPI_PKG="apt"
  elif have dnf;  then RETROPI_PKG="dnf"
  elif have pacman; then RETROPI_PKG="pacman"
  else RETROPI_PKG="none"; fi

  export RETROPI_OS RETROPI_ARCH RETROPI_IS_PI RETROPI_PI_MODEL RETROPI_DISTRO RETROPI_PKG
}

platform_label() {
  local label="$RETROPI_OS/$RETROPI_ARCH"
  [[ "$RETROPI_IS_PI" == "1" ]] && label="$label (${RETROPI_PI_MODEL:-Raspberry Pi})"
  printf '%s' "$label"
}

# platform_tags - tags a manifest can filter emulators on (macos, linux, pi, arm64).
platform_tags() {
  local tags="$RETROPI_OS $RETROPI_ARCH"
  [[ "$RETROPI_IS_PI" == "1" ]] && tags="$tags pi"
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
    *)      die "no supported package manager found; install manually: $*" ;;
  esac
}

# pkg_install_cask <cask...> - macOS GUI apps; a no-op elsewhere.
pkg_install_cask() {
  [[ $# -gt 0 ]] || return 0
  [[ "$RETROPI_OS" == "macos" ]] || { debug "skipping casks on $RETROPI_OS: $*"; return 0; }
  run brew install --cask "$@"
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

core_dir() {
  if [[ -n "${RETROPI_CORE_DIR:-}" ]]; then printf '%s' "$RETROPI_CORE_DIR"; return; fi
  case "$RETROPI_OS" in
    macos) printf '%s' "$HOME/Library/Application Support/RetroArch/cores" ;;
    *)
      # RetroPie ships cores here; plain Debian uses the user config dir.
      if [[ -d /opt/retropie/libretrocores ]]; then
        printf '%s' "/opt/retropie/libretrocores"
      elif [[ -d /usr/lib/libretro ]]; then
        printf '%s' "/usr/lib/libretro"
      else
        printf '%s' "${XDG_CONFIG_HOME:-$HOME/.config}/retroarch/cores"
      fi
      ;;
  esac
}

core_ext() {
  [[ "$RETROPI_OS" == "macos" ]] && printf 'dylib' || printf 'so'
}

# core_path <core_name> - absolute path to a core binary (may not exist yet).
core_path() {
  printf '%s/%s.%s' "$(core_dir)" "$1" "$(core_ext)"
}

# core_installed <core_name>
core_installed() { [[ -f "$(core_path "$1")" ]]; }

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
  return 0
}

# retroarch_bin - the launcher command ES will invoke.
retroarch_bin() {
  if [[ -n "${RETROPI_RETROARCH_BIN:-}" ]]; then printf '%s' "$RETROPI_RETROARCH_BIN"; return; fi
  if have retroarch; then command -v retroarch; return; fi
  if [[ "$RETROPI_OS" == "macos" && -x "/Applications/RetroArch.app/Contents/MacOS/RetroArch" ]]; then
    printf '%s' "/Applications/RetroArch.app/Contents/MacOS/RetroArch"; return
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
