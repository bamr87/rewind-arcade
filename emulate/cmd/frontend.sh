#!/usr/bin/env bash
# cmd/frontend.sh - manage EmulationStation as part of the framework.

cmd_frontend() {
  local sub="${1:-status}"
  [[ $# -gt 0 ]] && shift
  frontend_detect
  case "$sub" in
    status)   _fe_status "$@" ;;
    install)  _fe_install_cmd "$@" ;;
    launch|start) frontend_launch "$@" ;;
    session)  _fe_session "$@" ;;
    gamelist|gamelists) _fe_gamelist "$@" ;;
    themes)   _fe_themes "$@" ;;
    settings) _fe_settings "$@" ;;
    dirs)     _fe_dirs ;;
    -h|--help|help)
      cat >&2 <<'__H__'
retropi frontend - manage ES-DE (the default ROM frontend)

  frontend status            what is installed, where, and whether it is wired up
  frontend install           download and install ES-DE for this platform
      --force                reinstall even if a frontend is present
  frontend launch            start the frontend
  frontend session start     run it on this machine's own monitor (Linux/X11),
                             applying display.rotate and display.region;
                             works over SSH
  frontend session stop|status
  frontend gamelist          write gamelist.xml so games show real titles
      --systems <ids>        limit to these systems
      --dry-run              report what would change
  frontend themes list       list installed themes
  frontend themes install <git-url>
  frontend themes dir        print the theme directory
  frontend settings          show the settings retro-pi manages
      --apply                merge them into the frontend's es_settings.xml
  frontend dirs              print every managed path

ES-DE and RetroPie's EmulationStation both read the es_systems.xml that
`retropi build` generates; this command manages the rest of the frontend.
__H__
      ;;
    *) die "frontend: unknown subcommand '$sub'" ;;
  esac
}

_fe_status() {
  hr "frontend"
  if [[ "$RETROPI_FE_KIND" == "none" ]]; then
    info "frontend disabled (frontend.kind: none); configuration-only mode"
  elif frontend_installed; then
    printf '  %-18s %s%s%s\n' "installed" "$C_GREEN" "yes" "$C_RESET" >&2
    printf '  %-18s %s\n' "flavor" "$(frontend_flavor)" >&2
    printf '  %-18s %s\n' "version" "$(frontend_version)" >&2
    printf '  %-18s %s\n' "binary" "$(frontend_bin)" >&2
  else
    printf '  %-18s %s%s%s\n' "installed" "$C_YELLOW" "no" "$C_RESET" >&2
    printf '  %-18s %s\n' "configured kind" "$(cfg frontend.kind es-de)" >&2
    local asset
    if [[ "$RETROPI_FE_KIND" == "es-de" ]] && asset="$(frontend_resolve_asset 2>/dev/null)"; then
      printf '  %-18s %s (%s)\n' "available" "$(printf '%s' "$asset" | cut -f1)" \
        "$(printf '%s' "$asset" | cut -f3)" >&2
    fi
    step "install it: ./bin/retropi frontend install"
  fi

  hr "paths"
  printf '  %-18s %s\n' "home" "$(frontend_home)" >&2
  printf '  %-18s %s\n' "systems config" "$(es_config_dir)" >&2
  printf '  %-18s %s\n' "gamelists" "$(frontend_gamelists_dir)" >&2
  printf '  %-18s %s\n' "themes" "$(frontend_themes_dir)" >&2

  hr "generated config"
  local xml
  xml="$(es_config_dir)/es_systems.xml"
  if [[ -f "$xml" ]]; then
    local n
    n="$(grep -c '<system>' "$xml" 2>/dev/null || printf '0')"
    printf '  %s+%s es_systems.xml  %s systems\n' "$C_GREEN" "$C_RESET" "$n" >&2
  else
    printf '  %s-%s es_systems.xml  not generated\n' "$C_YELLOW" "$C_RESET" >&2
    step "generate it: ./bin/retropi build"
  fi

  local gl_dir gl_count=0 id
  gl_dir="$(frontend_gamelists_dir)"
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    [[ -f "$gl_dir/$id/gamelist.xml" ]] && gl_count=$((gl_count+1))
  done < <(systems_enabled)
  if [[ "$gl_count" -gt 0 ]]; then
    printf '  %s+%s gamelists       %s systems\n' "$C_GREEN" "$C_RESET" "$gl_count" >&2
  else
    printf '  %s-%s gamelists       none\n' "$C_YELLOW" "$C_RESET" >&2
    step "write them: ./bin/retropi frontend gamelist"
  fi

  local themes=0
  [[ -d "$(frontend_themes_dir)" ]] && \
    themes="$(find "$(frontend_themes_dir)" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')"
  printf '  %-18s %s\n' "themes installed" "$themes" >&2
  return 0
}

_fe_install_cmd() {
  local force=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --force) force=1 ;;
      *) die "frontend install: unknown option $1" ;;
    esac
    shift
  done
  frontend_install "$force" || return 1
  frontend_detect
  if frontend_installed; then
    log ""
    step "next: ./bin/retropi build   (writes es_systems.xml where it will be read)"
  fi
  return 0
}

_fe_session() {
  local sub="${1:-status}"
  [[ $# -gt 0 ]] && shift
  case "$sub" in
    start)  frontend_session_start ;;
    stop)   frontend_session_stop ;;
    client) frontend_session_client ;;
    status)
      if frontend_session_running; then ok "session running on $(cfg display.x_display :1)"
      else step "no session running"; fi ;;
    *) die "frontend session: unknown subcommand '$sub' (start, stop, status)" ;;
  esac
}

_fe_dirs() {
  printf 'home             %s\n' "$(frontend_home)"
  printf 'systems config   %s\n' "$(es_config_dir)"
  printf 'gamelists        %s\n' "$(frontend_gamelists_dir)"
  printf 'themes           %s\n' "$(frontend_themes_dir)"
  printf 'settings         %s\n' "$(frontend_settings_file)"
  printf 'binary           %s\n' "$(frontend_bin)"
}

# --- gamelists ----------------------------------------------------------------

_fe_gamelist() {
  local only="" dry=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --systems) only="${2:-}"; shift ;;
      --dry-run|-n) dry=1 ;;
      *) die "frontend gamelist: unknown option $1" ;;
    esac
    shift
  done
  [[ "$RETROPI_DRY_RUN" == "1" ]] && dry=1

  local ids
  if [[ -n "$only" ]]; then ids="$(printf '%s' "$only" | tr ',' '\n')"
  else ids="$(systems_enabled)"; fi

  local gl_dir id romdir out args ext line
  gl_dir="$(frontend_gamelists_dir)"
  info "writing gamelists under $gl_dir"

  local t_total=0 t_added=0 t_kept=0 t_missing=0 shown=0
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    id="$(system_resolve "$id")" || { warn "unknown system: $id"; continue; }
    romdir="$(system_rom_dir "$id")"
    [[ -d "$romdir" ]] || continue
    out="$gl_dir/$id/gamelist.xml"

    args=""
    while IFS= read -r ext; do
      [[ -n "$ext" ]] || continue
      args="$args --ext $ext"
    done < <(sys_list "$id" extensions)

    local dryflag=""
    [[ "$dry" == "1" ]] && dryflag="--dry-run"
    # shellcheck disable=SC2086
    line="$(python3 "$RETROPI_ROOT/lib/gamelist.py" "$id" "$romdir" "$out" $args $dryflag)" || {
      warn "$id: gamelist generation failed"; continue; }

    local total added kept missing
    total="$(printf '%s' "$line" | cut -f2)"
    added="$(printf '%s' "$line" | cut -f3)"
    kept="$(printf '%s' "$line" | cut -f4)"
    missing="$(printf '%s' "$line" | cut -f5)"
    t_total=$((t_total+total)); t_added=$((t_added+added))
    t_kept=$((t_kept+kept)); t_missing=$((t_missing+missing))

    [[ "$total" -eq 0 ]] && continue
    shown=1
    printf '  %-14s %4s games  %s+%s new  %s kept%s\n' \
      "$id" "$total" "$C_GREEN" "$added" "$kept" "$C_RESET" >&2
    [[ "$missing" -gt 0 ]] && \
      printf '  %-14s %s%s entries point at files that are gone%s\n' \
        "" "$C_YELLOW" "$missing" "$C_RESET" >&2
  done <<< "$ids"

  hr
  if [[ "$shown" == "0" ]]; then
    info "no games found; add some to $(roms_dir)/<system>/ first"
    return 0
  fi
  info "$t_total games: $t_added new entries, $t_kept already listed"
  [[ "$t_missing" -gt 0 ]] && step "$t_missing stale entries left in place (scraped data is never deleted)"
  [[ "$dry" == "1" ]] && step "dry run: nothing was written"
  return 0
}

# --- themes -------------------------------------------------------------------

_fe_themes() {
  local action="${1:-list}"
  [[ $# -gt 0 ]] && shift
  local dir
  dir="$(frontend_themes_dir)"
  case "$action" in
    list)
      if [[ ! -d "$dir" ]]; then
        info "no theme directory yet: $dir"
        step "install one: ./bin/retropi frontend themes install <git-url>"
        return 0
      fi
      local t n=0
      while IFS= read -r t; do
        [[ -n "$t" ]] || continue
        n=$((n+1))
        printf '  %-30s %s\n' "$(basename "$t")" \
          "$( [[ -d "$t/.git" ]] && printf 'git' || printf 'local')" >&2
      done < <(find "$dir" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sort)
      info "$n themes in $dir"
      ;;
    install)
      [[ $# -gt 0 ]] || die "frontend themes install: give a git URL"
      need git "required to install themes"
      local url="$1" name
      name="$(basename "$url" .git)"
      ensure_dir "$dir"
      if [[ -d "$dir/$name" ]]; then
        info "updating $name"
        run git -C "$dir/$name" pull --ff-only
      else
        info "cloning $name"
        run git clone --depth 1 "$url" "$dir/$name"
      fi
      ok "$name installed in $dir"
      step "select it in the frontend's UI settings"
      ;;
    dir) printf '%s\n' "$dir" ;;
    *) die "frontend themes: unknown action '$action'" ;;
  esac
  return 0
}

# --- settings -----------------------------------------------------------------
# Keys come from frontend.settings in the config, so nothing is hardcoded and
# you can manage any key your frontend version supports.

_fe_settings() {
  local apply=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --apply) apply=1 ;;
      *) die "frontend settings: unknown option $1" ;;
    esac
    shift
  done

  local target key val line
  target="$(frontend_settings_file)"
  info "settings retro-pi manages"
  local pairs=""
  for key in $(cfg_keys frontend.settings); do
    val="$(cfg "frontend.settings.$key")"
    val="${val//\{roms\}/$(roms_dir)}"
    val="${val//\{media\}/$(frontend_home)/downloaded_media}"
    val="${val//\{themes\}/$(frontend_themes_dir)}"
    printf '  %-24s %s\n' "$key" "$val" >&2
    pairs="$pairs$key=$val"$'\n'
  done
  [[ -n "$pairs" ]] || { warn "no frontend.settings configured"; return 0; }

  printf '  %-24s %s\n' "target" "$target" >&2
  if [[ "$apply" == "0" ]]; then
    log ""
    step "write them: ./bin/retropi frontend settings --apply"
    return 0
  fi

  [[ "$RETROPI_DRY_RUN" == "1" ]] && { step "dry run: would merge into $target"; return 0; }
  ensure_dir "$(dirname "$target")"
  backup_file "$target"

  # Pairs go as argv: `python3 - ` would read the program from stdin and leave
  # no way to also feed it data.
  local argv=()
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    argv[${#argv[@]}]="$line"
  done <<< "$pairs"
  python3 "$RETROPI_ROOT/lib/es_settings.py" "$target" "${argv[@]}" >&2 \
    || die "could not merge settings into $target"
  ok "merged into $target"
  return 0
}
