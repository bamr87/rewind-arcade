#!/usr/bin/env bash
# cmd/ml.sh - dispatch into the optional ML pack (packages/ml/).
#
# Contains no Python and imports nothing: the ML stack (torch, gymnasium,
# stable-baselines3) lives in packages/ml/.venv, which the core never needs.
# Without it, every subcommand but `setup` says how to install it.

cmd_ml() {
  local sub="${1:-help}" pack venv_py
  [[ $# -gt 0 ]] && shift
  case "$sub" in
    -h|--help|help) _ml_help; return 0 ;;
  esac
  # The venv is built against the host's Python; editors in a Flatpak hop out.
  host_reexec ml "$sub" "$@"
  pack="$RETROPI_ROOT/packages/ml"
  venv_py="$pack/.venv/bin/python"
  [[ -d "$pack" ]] || die "the ml pack is missing: $pack"
  if [[ "$sub" == "setup" ]]; then
    "$pack/setup.sh" "$@"
    return
  fi
  [[ -x "$venv_py" ]] || die "ml stack not installed. Set it up with:  ./bin/retropi ml setup   (or packages/ml/setup.sh)"
  case "$sub" in
    # From the caller's directory, so paths typed on the command line resolve.
    train)  "$venv_py" "$pack/train.py" "$@" ;;
    eval)   "$venv_py" "$pack/evaluate.py" "$@" ;;
    check)  _ml_check "$pack" "$venv_py" "$@" ;;
    board)  "$pack/.venv/bin/tensorboard" --logdir "$pack/runs" "$@" ;;
    report) "$venv_py" "$pack/report.py" "$@" ;;
    games)  (cd "$pack/games" && ls -1 *.yaml | sed 's/\.yaml$//') ;;
    python) (cd "$pack" && "$venv_py" "$@") ;;
    *) die "ml: unknown subcommand '$sub' (see: retropi ml --help)" ;;
  esac
}

_ml_help() {
  cat >&2 <<'__H__'
retropi ml - train agents on real games (optional pack: packages/ml)

  ml setup [--rocm|--cuda]   create packages/ml/.venv (CPU PyTorch by default)
  ml check [game]            validate a game definition: API check, a random
                             rollout, emulator speed
  ml games                   list game definitions (packages/ml/games/*.yaml)
  ml train [options]         PPO on a game (default smb-1-1; --help for options)
  ml eval <model.zip>|--random [--episodes n] [--gif f]
  ml board                   TensorBoard over packages/ml/runs
  ml report [run]            the run's evidence as one HTML page (curves, videos)
  ml python <args>           the pack's Python, for your own scripts

The core of retro-pi never imports any of this. See packages/ml/README.md.
__H__
}

_ml_check() {
  local pack="$1" py="$2" game="${3:-smb-1-1}"
  (cd "$pack" && "$py" - "$game" <<'__PY__'
import sys, time
from gymnasium.utils.env_checker import check_env
from retroenv import RetroEnv
game = sys.argv[1]
env = RetroEnv(game)
check_env(env, skip_render_check=True)
obs, info = env.reset(seed=0)
print(f"{game}: core {env.emu.library_name} {env.emu.library_version}, "
      f"{env.action_space.n} actions, observation {obs.shape}")
print(f"  start: {info}")
steps, t0, ret = 0, time.time(), 0.0
while time.time() - t0 < 3:
    obs, r, term, trunc, info = env.step(env.action_space.sample())
    ret += r; steps += 1
    if term or trunc:
        env.reset()
dt = time.time() - t0
print(f"  random rollout: {steps} steps in {dt:.1f}s = {steps / dt:.0f} steps/s per env "
      f"({4 * steps / dt / env.emu.fps:.0f}x real time)")
print("  ok")
__PY__
  )
}
