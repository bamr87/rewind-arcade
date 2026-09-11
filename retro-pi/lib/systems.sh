#!/usr/bin/env bash
# lib/systems.sh - read config/systems/*.yaml and turn them into launch data.
#
# This is the layer that knows what a "system" is. Adding a console means
# dropping one YAML file into config/systems/ - no code changes anywhere.

systems_dir() { printf '%s' "${RETROPI_SYSTEMS_DIR:-$RETROPI_ROOT/config/systems}"; }

# system_ids - every manifest present, sorted.
system_ids() {
  local f id
  for f in "$(systems_dir)"/*.yaml; do
    [[ -e "$f" ]] || continue
    id="$(basename "$f" .yaml)"
    printf '%s\n' "$id"
  done | sort
}

# systems_enabled - ids from config, filtered to those that actually exist.
systems_enabled() {
  local id
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    if system_exists "$id"; then
      printf '%s\n' "$id"
    else
      warn "config lists unknown system '$id' (no config/systems/$id.yaml); skipping"
    fi
  done < <(cfg_list systems.enabled)
}

system_file()   { printf '%s/%s.yaml' "$(systems_dir)" "$1"; }
system_exists() { [[ -f "$(system_file "$1")" ]]; }

# system_resolve <name> - map an alias (genesis, sms, ps1) to its canonical id.
system_resolve() {
  local want="$1" id alias
  system_exists "$want" && { printf '%s' "$want"; return 0; }
  while IFS= read -r id; do
    while IFS= read -r alias; do
      [[ "$alias" == "$want" ]] && { printf '%s' "$id"; return 0; }
    done < <(sys_list "$id" aliases)
  done < <(system_ids)
  return 1
}

# --- manifest access (flat-file cached, same trick as config.sh) --------------

_sys_flat() {
  local id="$1" src flat
  src="$(system_file "$id")"
  flat="$RETROPI_STATE/systems/$id.flat"
  if [[ ! -f "$flat" || "$src" -nt "$flat" ]]; then
    mkdir -p "$RETROPI_STATE/systems"
    yaml flat "$src" > "$flat.tmp" || die "failed to parse $src"
    mv "$flat.tmp" "$flat"
  fi
  printf '%s' "$flat"
}

# sys_get <id> <dotted.key> [default]
sys_get() {
  local id="$1" key="$2" default="${3-}" flat val
  system_exists "$id" || die "unknown system: $id"
  flat="$(_sys_flat "$id")"
  val="$(grep -- "^${key}=" "$flat" 2>/dev/null | head -1 | cut -d= -f2-)" || true
  if [[ -z "$val" ]]; then printf '%s' "$default"; else printf '%s' "$val"; fi
}

# sys_list <id> <dotted.key> - list values, one per line.
sys_list() {
  local id="$1" key="$2" flat
  system_exists "$id" || return 0
  flat="$(_sys_flat "$id")"
  grep -- "^${key}\.[0-9]\{1,\}=" "$flat" 2>/dev/null \
    | sed "s/^${key//./\\.}\.//" | sort -t= -k1,1n | cut -d= -f2- || true
}

# sys_count <id> <list.key> - number of ENTRIES in a list.
# Counts distinct indices, so a list of mappings (4 flat lines per entry)
# reports its real length rather than its line count.
sys_count() {
  local id="$1" key="$2" flat out
  system_exists "$id" || { printf '0'; return 0; }
  flat="$(_sys_flat "$id")"
  out="$(grep -o -- "^${key}\.[0-9]\{1,\}" "$flat" 2>/dev/null \
        | sed "s/^${key//./\\.}\.//" | sort -nu | wc -l | tr -d ' ')" || out=0
  printf '%s' "${out:-0}"
}

# --- emulators ----------------------------------------------------------------

# emulator_indices <id> - indices into emulators.list
emulator_indices() {
  local id="$1" flat
  flat="$(_sys_flat "$id")"
  grep -o -- "^emulators\.list\.[0-9]\{1,\}\.id=" "$flat" 2>/dev/null \
    | sed 's/^emulators\.list\.//; s/\.id=$//' | sort -n -u || true
}

# emulator_field <id> <index> <field> [default]
emulator_field() { sys_get "$1" "emulators.list.$2.$3" "${4-}"; }

# emulator_supported <id> <index> - honors an optional `platforms:` filter.
emulator_supported() {
  local id="$1" idx="$2" plats p tag
  plats="$(sys_list "$id" "emulators.list.$idx.platforms" | tr '\n' ' ')"
  [[ -z "${plats// /}" ]] && return 0   # unrestricted
  for p in $plats; do
    for tag in $(platform_tags); do
      [[ "$p" == "$tag" ]] && return 0
    done
  done
  return 1
}

# emulator_index_of <id> <emu_id> - index for a named emulator, or 1 if absent.
emulator_index_of() {
  local id="$1" want="$2" idx
  while IFS= read -r idx; do
    [[ -n "$idx" ]] || continue
    [[ "$(emulator_field "$id" "$idx" id)" == "$want" ]] && { printf '%s' "$idx"; return 0; }
  done < <(emulator_indices "$id")
  return 1
}

# default_emulator <id> - configured override, manifest default, or first
# entry that runs on this platform.
default_emulator() {
  local id="$1" want idx
  want="$(cfg "emulators.$id" "")"
  [[ -z "$want" ]] && want="$(sys_get "$id" emulators.default "")"
  if [[ -n "$want" ]] && idx="$(emulator_index_of "$id" "$want")"; then
    if emulator_supported "$id" "$idx"; then printf '%s' "$want"; return 0; fi
    debug "$id: default emulator '$want' is not available on $(platform_label)"
  fi
  while IFS= read -r idx; do
    [[ -n "$idx" ]] || continue
    if emulator_supported "$id" "$idx"; then
      emulator_field "$id" "$idx" id; return 0
    fi
  done < <(emulator_indices "$id")
  return 1
}

# system_cores <id> - libretro core names usable on this platform.
system_cores() {
  local id="$1" idx core
  while IFS= read -r idx; do
    [[ -n "$idx" ]] || continue
    emulator_supported "$id" "$idx" || continue
    [[ "$(emulator_field "$id" "$idx" type libretro)" == "libretro" ]] || continue
    core="$(emulator_field "$id" "$idx" core)"
    [[ -n "$core" ]] && printf '%s\n' "$core"
  done < <(emulator_indices "$id")
  return 0   # a trailing failed test must not fail the function under `set -e`
}

# --- paths and launch commands ------------------------------------------------

# system_rom_dir <id>
system_rom_dir() { printf '%s/%s' "$(roms_dir)" "$1"; }

# system_extensions <id> - space separated, as es_systems.xml wants them.
# Both cases are listed because ES matches extensions case-sensitively and real
# ROM dumps are inconsistent (.ZIP, .Bin). bash 3.2 has no ${x^^}, hence tr.
system_extensions() {
  local id="$1" ext upper out=""
  while IFS= read -r ext; do
    [[ -n "$ext" ]] || continue
    upper="$(printf '%s' "$ext" | tr '[:lower:]' '[:upper:]')"
    out="$out $ext"
    [[ "$upper" != "$ext" ]] && out="$out $upper"
  done < <(sys_list "$id" extensions)
  printf '%s' "${out# }"
}

# launch_command <id> [emu_id] - the command string embedded in es_systems.xml.
launch_command() {
  local id="$1" emu="${2:-}" idx type core bin extra=""
  [[ -n "$emu" ]] || emu="$(default_emulator "$id")" || return 1
  idx="$(emulator_index_of "$id" "$emu")" || return 1
  type="$(emulator_field "$id" "$idx" type libretro)"

  case "$type" in
    libretro)
      core="$(emulator_field "$id" "$idx" core)"
      bin="$(retroarch_bin)"
      [[ "$(cfg emulation.fullscreen true)" == "true" ]] && extra=" --fullscreen"
      [[ "$(cfg emulation.verbose_logging false)" == "true" ]] && extra="$extra --verbose"
      printf '"%s" -L "%s"%s %%ROM%%' "$bin" "$(core_path "$core")" "$extra"
      ;;
    standalone)
      emulator_field "$id" "$idx" command
      ;;
    *)
      die "$id: unknown emulator type '$type'"
      ;;
  esac
}
