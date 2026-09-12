#!/usr/bin/env bash
# cmd/audio.sh - choose which output games and the frontend play through.

cmd_audio() {
  local sub="${1:-list}"
  [[ $# -gt 0 ]] && shift
  case "$sub" in
    list)  _audio_list ;;
    set)   _audio_set "${1:-}" ;;
    apply) _audio_apply ;;
    -h|--help|help)
      cat >&2 <<'__H__'
retropi audio - choose the sound output

  audio list            outputs the sound server offers (* = current default)
  audio set <name>      make the output matching <name> the default now
  audio apply           apply audio.output from your config

RetroArch and the frontend both play to the default output, so this is how
sound reaches, say, speakers on an HDMI monitor. Linux with PipeWire (wpctl).
The choice persists across restarts; `frontend session start` also applies
audio.output. Match names case-insensitively, e.g.  retropi audio set hdmi
__H__
      ;;
    *) die "audio: unknown subcommand '$sub' (try: retropi audio --help)" ;;
  esac
}

_audio_require() {
  audio_supported || die "audio output selection needs Linux with PipeWire (wpctl)"
}

_audio_list() {
  _audio_require
  local line id mark desc n=0
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    IFS=$'\t' read -r id mark desc <<< "$line"
    # an empty default mark collapses under tab IFS; re-read by position
    id="${line%%$'\t'*}"; desc="${line##*$'\t'}"; mark="${line#*$'\t'}"; mark="${mark%%$'\t'*}"
    printf '  %1s %-5s %s\n' "$mark" "$id" "$desc"
    n=$((n+1))
  done < <(audio_outputs)
  [[ "$n" -gt 0 ]] || warn "no audio outputs found"
  return 0
}

_audio_set() {
  _audio_require
  [[ -n "$1" ]] || die "audio set: name an output (see: retropi audio list)"
  local desc
  desc="$(audio_set_output "$1")" || die "no audio output matches '$1' (see: retropi audio list)"
  ok "default output: $desc"
  step "keep it for sessions: ./bin/retropi config set audio.output $1"
}

_audio_apply() {
  local want
  want="$(cfg audio.output "")"
  [[ -n "$want" ]] || { step "audio.output is not set; leaving the default output alone"; return 0; }
  _audio_require
  local desc
  desc="$(audio_set_output "$want")" || die "audio.output '$want' matches no output (see: retropi audio list)"
  ok "default output: $desc"
}
