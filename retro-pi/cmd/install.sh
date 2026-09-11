#!/usr/bin/env bash
# cmd/install.sh - install the emulator stack for this machine.
#
# macOS:        RetroArch via Homebrew cask, ES-DE via its DMG (assisted).
# Raspberry Pi: RetroArch via apt, or defer to an existing RetroPie install.

cmd_install() {
  local do_ra=1 do_cores=1 do_frontend=0 do_build=1 all=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --all)          all=1; do_frontend=1 ;;
      --frontend)     do_frontend=1; do_ra=0; do_cores=0; do_build=0 ;;
      --cores)        do_cores=1; do_ra=0; do_build=0 ;;
      --retroarch)    do_ra=1; do_cores=0; do_build=0 ;;
      --no-cores)     do_cores=0 ;;
      --no-build)     do_build=0 ;;
      -h|--help)
        cat >&2 <<'__H__'
retropi install - install the emulator stack

  (no options)      RetroArch + cores for enabled systems + build
  --all             also install an EmulationStation frontend
  --retroarch       install RetroArch only
  --cores           install libretro cores only
  --frontend        install the frontend only
  --no-cores        skip cores
  --no-build        skip the config generation step

Run `retropi doctor` afterwards to confirm everything landed.
__H__
        return 0 ;;
      *) die "install: unknown option $1" ;;
    esac
    shift
  done

  info "installing on $(platform_label)"

  [[ "$do_ra" == "1" ]] && _install_retroarch
  [[ "$do_frontend" == "1" ]] && _install_frontend
  [[ "$do_cores" == "1" ]] && _install_cores
  [[ "$do_build" == "1" ]] && { info "generating configuration"; cmd_build; }

  log ""
  info "install finished - verifying"
  cmd_doctor --no-bios || true
  return 0
}

_install_retroarch() {
  if have retroarch || [[ "$(retroarch_bin)" != "retroarch" ]]; then
    ok "RetroArch already installed: $(retroarch_bin)"
    return 0
  fi
  info "installing RetroArch"
  case "$RETROPI_OS" in
    macos)
      need brew "install Homebrew from https://brew.sh"
      run brew install --cask retroarch
      ;;
    linux)
      if [[ -x /opt/retropie/emulators/retroarch/bin/retroarch ]]; then
        ok "RetroPie's RetroArch detected"
        return 0
      fi
      pkg_refresh
      pkg_install retroarch
      ;;
    *) die "unsupported platform for automatic install: $RETROPI_OS" ;;
  esac
  ok "RetroArch installed"
}

_install_frontend() {
  local kind
  kind="$(cfg frontend.kind es-de)"
  if es_installed; then
    ok "frontend already installed"
    return 0
  fi
  info "installing frontend ($kind)"
  case "$RETROPI_OS:$kind" in
    macos:es-de)
      # ES-DE is not in Homebrew; it ships as a signed DMG.
      warn "ES-DE is distributed as a DMG and cannot be installed unattended."
      log ""
      log "  1. Download the macOS build:  https://es-de.org/#Downloads"
      log "  2. Drag ES-DE.app into /Applications"
      log "  3. Re-run: ./bin/retropi build"
      log ""
      log "ES-DE reads the config retro-pi generates at:"
      log "  $(es_config_dir)/es_systems.xml"
      if confirm "open the ES-DE download page now?"; then
        run open "https://es-de.org/#Downloads"
      fi
      ;;
    linux:*)
      if [[ -x /opt/retropie/supplementary/emulationstation/emulationstation ]]; then
        ok "RetroPie EmulationStation detected"
        return 0
      fi
      warn "no EmulationStation found."
      log ""
      log "On Raspberry Pi OS the supported paths are:"
      log "  * RetroPie-Setup (full stack):  https://retropie.org.uk/docs/Manual-Installation/"
      log "  * ES-DE AppImage for aarch64:   https://es-de.org/#Downloads"
      log ""
      log "retro-pi works with either - it writes es_systems.xml to:"
      log "  $(es_config_dir)/es_systems.xml"
      ;;
    *)
      warn "no automatic frontend install for $RETROPI_OS/$kind"
      ;;
  esac
  return 0
}

_install_cores() {
  info "installing cores for enabled systems"
  _cores_install || warn "some cores could not be installed"
  return 0
}

# cores/doctor helpers live in their own command files; load them on demand.
if ! declare -f _cores_install >/dev/null 2>&1; then
  # shellcheck source=./cores.sh
  . "$RETROPI_ROOT/cmd/cores.sh"
fi
if ! declare -f cmd_doctor >/dev/null 2>&1; then
  # shellcheck source=./doctor.sh
  . "$RETROPI_ROOT/cmd/doctor.sh"
fi
if ! declare -f cmd_build >/dev/null 2>&1; then
  # shellcheck source=./build.sh
  . "$RETROPI_ROOT/cmd/build.sh"
fi
