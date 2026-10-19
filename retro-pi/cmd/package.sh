#!/usr/bin/env bash
# cmd/package.sh - build a portable archive of this workspace.
#
# The default archive is the tooling and your configuration: small enough to
# email, enough to rebuild an identical setup anywhere. Content is opt-in.

cmd_package() {
  local with_roms with_bios name="" out_dir=""
  with_roms="$(cfg package.include_roms false)"
  with_bios="$(cfg package.include_bios false)"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --with-roms) with_roms=true ;;
      --with-bios) with_bios=true ;;
      --name) name="${2:-}"; shift ;;
      --out)  out_dir="${2:-}"; shift ;;
      -h|--help)
        cat >&2 <<'__H__'
retropi package - build a portable archive of this workspace

  --with-roms      include the ROM library (can be very large)
  --with-bios      include BIOS files (check your local law before sharing)
  --name <name>    archive base name (default: retropi-<date>)
  --out <dir>      output directory (default: dist/)

The default archive contains the tooling and configuration only, so it stays
small and safe to share. Unpack anywhere and run ./bin/retropi doctor.
__H__
        return 0 ;;
      *) die "package: unknown option $1" ;;
    esac
    shift
  done

  need tar "required to build the archive"
  [[ -n "$name" ]] || name="retropi-$(date +%Y%m%d)"
  [[ -n "$out_dir" ]] || out_dir="$RETROPI_ROOT/dist"
  ensure_dir "$out_dir"

  local stage archive
  stage="$(mktemp -d "${TMPDIR:-/tmp}/retropi-pkg.XXXXXX")"
  archive="$out_dir/$name.tar.gz"

  info "staging $name"
  local root="$stage/$name"
  mkdir -p "$root"

  local item
  for item in bin lib cmd config docs tests platforms packages Makefile README.md LICENSE .editorconfig; do
    [[ -e "$RETROPI_ROOT/$item" ]] || continue
    cp -R "$RETROPI_ROOT/$item" "$root/"
  done
  # local.yaml is machine-specific: ship it as an example, not as config.
  if [[ -f "$root/config/local.yaml" ]]; then
    mv "$root/config/local.yaml" "$root/config/local.yaml.example"
  fi

  if [[ "$with_roms" == "true" ]]; then
    step "including ROMs ($(_dir_size "$(roms_dir)"))"
    cp -R "$(roms_dir)" "$root/roms"
  else
    mkdir -p "$root/roms"; : > "$root/roms/.gitkeep"
  fi
  if [[ "$with_bios" == "true" ]]; then
    step "including BIOS ($(_dir_size "$(bios_dir)"))"
    cp -R "$(bios_dir)" "$root/bios"
  else
    mkdir -p "$root/bios"; : > "$root/bios/.gitkeep"
  fi

  _write_package_manifest "$root" "$with_roms" "$with_bios"

  info "creating $archive"
  if [[ "$RETROPI_DRY_RUN" == "1" ]]; then
    step "dry run: would archive $root"
    rm -rf "$stage"
    return 0
  fi
  ( cd "$stage" && tar -czf "$archive" "$name" )
  rm -rf "$stage"

  ok "$archive ($(_dir_size "$archive"))"
  log ""
  log "To use it on another machine:"
  log "  tar -xzf $(basename "$archive")"
  log "  cd $name && ./bin/retropi doctor"
  return 0
}

_dir_size() {
  [[ -e "$1" ]] || { printf '0'; return 0; }
  du -sh "$1" 2>/dev/null | awk '{print $1}'
}

_write_package_manifest() {
  local root="$1" with_roms="$2" with_bios="$3"
  {
    printf 'retro-pi portable workspace\n'
    printf '===========================\n\n'
    printf 'packaged:     %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    printf 'retropi:      %s\n' "$RETROPI_VERSION"
    printf 'built on:     %s\n' "$(platform_label)"
    printf 'systems:      %s\n' "$(systems_enabled | tr '\n' ' ')"
    printf 'includes roms: %s\n' "$with_roms"
    printf 'includes bios: %s\n' "$with_bios"
    printf '\nQuick start\n-----------\n'
    printf '  ./bin/retropi doctor      # see what this machine needs\n'
    printf '  ./bin/retropi install     # install RetroArch and cores\n'
    printf '  ./bin/retropi build       # generate the frontend config\n'
    printf '\nThis archive contains no game ROMs unless listed above.\n'
  } > "$root/PACKAGE.txt"
}
