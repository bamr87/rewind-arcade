#!/usr/bin/env bash
# cmd/install.sh - install the emulator stack for this machine.
#
# RetroArch, ES-DE, cores and generated configuration form the default stack.

cmd_install() {
  local do_ra=1 do_cores=1 do_frontend=1 do_build=1
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --all)          do_ra=1; do_cores=1; do_frontend=1; do_build=1 ;;
      --no-frontend)  do_frontend=0 ;;
      --frontend)     do_frontend=1; do_ra=0; do_cores=0; do_build=0 ;;
      --cores)        do_cores=1; do_ra=0; do_frontend=0; do_build=0 ;;
      --retroarch)    do_ra=1; do_cores=0; do_frontend=0; do_build=0 ;;
      --no-cores)     do_cores=0 ;;
      --no-build)     do_build=0 ;;
      -h|--help)
        cat >&2 <<'__H__'
retropi install - install the emulator stack

  (no options)      ES-DE + RetroArch + cores for enabled systems + build
  --all             same as the default full stack
  --no-frontend     skip the frontend
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

  local frontend_rc=0
  [[ "$do_ra" == "1" ]] && _install_retroarch
  if [[ "$do_frontend" == "1" ]]; then
    _install_frontend || frontend_rc=1
  fi
  [[ "$do_cores" == "1" ]] && _install_cores
  [[ "$do_build" == "1" ]] && { info "generating configuration"; cmd_build; }

  log ""
  if [[ "$frontend_rc" != "0" ]]; then
    error "install incomplete: the configured frontend did not install"
    return 1
  fi
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
      # NOT the Homebrew cask: it is x86_64/OpenGL, which leaves every
      # hardware-rendered core broken on Apple Silicon.
      local url dmg dest
      if url="$(retroarch_macos_url)"; then
        dmg="$(downloads_dir)/$(basename "$url")"
        step "downloading $(basename "$url") (universal, Metal)"
        if fetch "$url" "$dmg"; then
          if [[ "$RETROPI_DRY_RUN" == "1" ]]; then
            step "dry run: would install $dmg"
          elif dest="$(install_app_from_dmg "$dmg")"; then
            ok "installed $dest"
          else
            warn "could not install the universal build"
          fi
        else
          warn "download failed: $url"
        fi
      else
        warn "could not resolve a RetroArch build; install manually from https://www.retroarch.com/"
      fi
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
  frontend_detect
  if frontend_install; then
    return 0
  fi
  error "could not install the configured frontend: $RETROPI_FE_KIND"
  log ""
  log "Install the selected frontend manually, then run ./bin/retropi build."
  log "For an emulator-only setup, use: ./bin/retropi install --no-frontend"
  log ""
  log "retro-pi writes its configuration to:"
  log "  $(es_config_dir)/es_systems.xml"
  return 1
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
