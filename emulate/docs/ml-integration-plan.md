# Driving retro-pi's emulators from a reinforcement learning loop

> A reviewed, not-yet-implemented plan for driving retro-pi's emulators from a reinforcement learning loop as an optional extension pack, without breaking the bash + python3 core.

**Status:** plan, reviewed 2026-09-11. No code written yet. **Scope:** what an ML layer for *this repository* looks like — not a general RL tutorial.

---

## What this review changed

The first draft was a correct description of the RL ecosystem and an incorrect description of how it lands on retro-pi's two targets. Corrections:

| Claim in draft | Reality | Consequence |
|---|---|---|
| `import stable_retro as retro` | The distribution is `stable-retro`; the **module is `retro`** | Draft's Path A skeleton fails at line 1 |
| `GrayScaleObservation` | Renamed `GrayscaleObservation` in Gymnasium 1.0 | Draft's Path B skeleton fails at import |
| RetroArch `retro_ai` plugin loads a model into RetroArch | Merged upstream (PR #17407, Jan 2025) but **experimental, off by default, Windows + Linux x86 only** | Path D does not run on macOS *or* a Pi — i.e. neither retro-pi target |
| "NeSLE, a GPU-native NES emulator" | Not verifiable. The real project is **CuLE** (NVlabs) — Atari only, CUDA only | No GPU emulation path exists for this repo; drop it |
| NEAT via BizHawk as a laptop-friendly option | BizHawk is Windows-first (Mono elsewhere) | Not a macOS or Pi story either |
| Implicit: this gets added to retro-pi | Core is hard-capped at **bash + python3, no pip packages** | The ML stack cannot live in the core tree at all |

The last row is the one that matters. It is addressed first, below, because it gates every other decision.

---

## Decision 1 — where the code lives

`AGENTS.md` is unambiguous: two runtime dependencies, bash and python3, no pip packages. `lib/yamlite.py` exists specifically so that PyYAML is not required. An RL stack is torch + gymnasium + stable-baselines3 + a native emulator extension — roughly 2 GB of wheels. That cannot go in the core tree.

So it doesn't. **The ML layer is an extension pack with its own virtualenv**, using the mechanism `retropi extend pack` already scaffolds:

```
packages/ml/
  pack.yaml            pack metadata (existing schema)
  requirements.txt     torch, gymnasium, stable-retro, stable-baselines3
  setup.sh             creates packages/ml/.venv, installs, verifies
  envs/                retro-pi manifest -> Gymnasium env adapters
  train/               training entry points
  runs/                checkpoints + tensorboard (gitignored)
```

Non-negotiable invariants, to be enforced by tests:

1. `make check` passes on a machine with **zero** pip packages installed.
2. Nothing under `bin/`, `lib/`, or `cmd/` imports anything outside the stdlib.
3. `packages/ml/.venv/` and `packages/ml/runs/` are gitignored.
4. Removing `packages/ml/` entirely changes no core behaviour.

Optionally a thin `cmd/ml.sh` shim, following the existing subcommand convention (`cmd_ml()`, a `--help` block starting `retropi ml`, which `tests/test_cli.sh` asserts for every command). It must contain no Python, only dispatch into `packages/ml/.venv/bin/python`, and must exit with a clear message when the venv is absent:

```
ml stack not installed. Set it up with:  packages/ml/setup.sh
```

That keeps the CLI contract honest: `retropi ml` exists and self-documents on a stock Pi, and simply reports that the optional stack is not present.

---

## Decision 2 — which target does what

| Capability | macOS (Apple Silicon) | Raspberry Pi (aarch64) |
|---|---|---|
| stable-retro + SB3 training | **yes** (CPU; MPS for the policy) | no — throughput makes PPO impractical |
| gym-super-mario-bros | yes (needs Python ≥ 3.13) | needs 3.13+; still too slow to train |
| Inference on a trained policy | yes | **yes** — this is the Pi's job |
| In-emulator inference (RetroArch Game AI) | no (x86 Win/Linux only) | no (x86 Win/Linux only) |
| NEAT via BizHawk | no (Windows-first) | no |
| GPU emulation farm (CuLE) | no (no CUDA) | no |

Read off the table: **the Mac trains, the Pi plays back.** Everything else in the draft's Path C and Path D is blocked on platforms this repo does not target.

Python version is a real constraint, not a footnote. This Mac runs 3.14.7, so it is fine. Raspberry Pi OS ships older; `gym-super-mario-bros` 9.1.0 requires ≥ 3.13. The pack's `setup.sh` must check the interpreter version and fail with an explanation rather than producing a confusing resolver error.

---

## Decision 3 — what the ML layer reuses from retro-pi

This is the part that justifies the work living here at all rather than in a scratch directory. Three existing pieces carry over:

**Manifests as the source of truth.** `tests/test_manifests.sh` asserts that required keys are present; it never rejects unknown ones. So an optional block extends `config/systems/*.yaml` without touching the schema or the tests:

```yaml
ml:
  retro_game: SuperMarioBros-Nes      # stable-retro game id
  states: [Level1-1, Level2-1]        # savestates to train from
  actions: simple                     # named action set, not raw buttons
```

This preserves the rule that nothing branches on a console name in code: the env adapter reads the manifest, exactly as `cmd/build.sh` does.

**Emulator resolution.** `tools/run-rom.sh` already resolves a system to a core via `default_emulator` / `launch_command`, and validates that the core is installed *and* architecture-matched. Playback of a trained policy should go through the same path so that what trains and what plays agree.

**`saves/`** is the natural home for training savestates — already gitignored as content you own.

What it must **not** reuse: nothing in the ML layer may download a ROM or a BIOS image. The existing rule holds without exception.

---

## The contract

Every working setup is the same loop:

```text
savestate  →  observation (RGB and/or RAM)
           →  policy (CNN / MLP)
           →  joypad bitmask
           →  emulator.step()
           →  reward + done
           →  store transition
```

Four design choices decide whether this works in an afternoon or a month:

| Choice | Easy default | Why it matters |
|---|---|---|
| Observation | 84×84 grayscale, 4-frame stack | Pixels work everywhere; RAM is faster if you know addresses |
| Action space | 7–12 legal button combos, not 256 raw NES buttons | Raw buttons almost never learn |
| Reward | Δx + Δscore − death, clipped | Sparse "beat the level" is too late |
| Reset | Savestate *after* the title screen | Otherwise the agent spends 10M steps on the menu |

---

## Path A — the primary path: stable-retro + PPO

The maintained fork of OpenAI Gym Retro. Wraps NES, SNES, Genesis, GB/GBA, Atari and arcade as Gymnasium envs. Targets Python 3.10–3.14.

```bash
packages/ml/setup.sh          # venv + pip install -r requirements.txt
```

ROMs are **not** shipped. Import legally obtained dumps — note that `retro.import` validates against known hashes and silently skips anything that does not match:

```bash
python -m retro.import roms/nes
```

> **Check this before planning around it.** This repository's NES folder
> contains `super-mario-bros-unverified-dump.nes`,
> `castlevania-iii-draculas-curse-overdump.nes` and several other files whose
> names say the hash does not match No-Intro. Those will not import. Run the
> command and read what it accepted before committing to a title — do not
> assume the library is usable.

Airstriker (Genesis) ships with stable-retro as a public-domain test ROM, so the stack can be verified with no ROM question at all. That is the first milestone.

```python
import retro                              # distribution: stable-retro
from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import SubprocVecEnv, VecFrameStack, VecTransposeImage
from stable_baselines3.common.atari_wrappers import WarpFrame, ClipRewardEnv
from gymnasium.wrappers import TimeLimit

def make_env():
    env = retro.make(game="Airstriker-Genesis", state=retro.State.DEFAULT)
    env = TimeLimit(env, max_episode_steps=4500)
    env = WarpFrame(env)                   # 84x84 gray
    env = ClipRewardEnv(env)
    return env

venv = VecTransposeImage(VecFrameStack(SubprocVecEnv([make_env] * 8), n_stack=4))
model = PPO("CnnPolicy", venv, n_steps=128, batch_size=32, n_epochs=4,
            learning_rate=2.5e-4, ent_coef=0.01, verbose=1)
model.learn(total_timesteps=1_000_000)
model.save("packages/ml/runs/airstriker_ppo")
```

That is the DeepMind Atari recipe ported to retro cores: frame skip + warp + clip + stack. `WarpFrame` and `ClipRewardEnv` are current SB3 API.

Then swap the game id for something you own and that imported cleanly.

[stable-retro-scripts](https://github.com/MatPoliquin/stable-retro-scripts) is a batteries-included trainer (curricula, model export) if hand-rolling the loop stops being interesting.

---

## Path B — fastest first win: Super Mario Bros on nes-py

If the goal is specifically Mario, `gym-super-mario-bros` (9.1.0, June 2026) skips the ROM-hash problem entirely — it resolves its own ROM and does not read retro-pi's `roms/` tree. It ships level IDs, a shaped forward-progress reward, and a small legal action set. Requires Python ≥ 3.13.

```python
import gymnasium as gym
import gym_super_mario_bros                      # registers the envs
from nes_py.wrappers import JoypadSpace
from gym_super_mario_bros.actions import SIMPLE_MOVEMENT
from gymnasium.wrappers import GrayscaleObservation   # renamed in Gymnasium 1.0
from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv, VecFrameStack

def make():
    env = gym.make("SuperMarioBros-1-1-v0", render_mode="rgb_array")
    env = JoypadSpace(env, SIMPLE_MOVEMENT)    # 7 actions, not 256
    env = GrayscaleObservation(env, keep_dim=True)
    return env

env = VecFrameStack(DummyVecEnv([make]), n_stack=4)
model = PPO("CnnPolicy", env, n_steps=512, learning_rate=1e-5, verbose=1)
model.learn(1_000_000)
```

World 1-1 is the standard "did my pipeline work?" test. PPO on pixels usually starts looking like a player after a few hundred thousand to a couple million steps. The `-v0/-v1/-v2/-v3` suffixes select rendering variants; `-v0` is the standard one.

Because this path bypasses retro-pi's ROM and core resolution completely, treat it as a *pipeline smoke test*, not as the integration. It proves torch and the training loop work on this machine. It does not prove anything about retro-pi.

---

## Path C — NEAT (deferred)

SethBling's MarI/O pattern: a population of tiny nets, fitness = how far Mario got, evolve topologies. Genuinely CPU-friendly and fun to watch.

Deferred, because the two packaged versions ([Retro-ML](https://github.com/Tourmi/Retro-ML), SethBling's original) both run inside BizHawk, which is Windows-first. `neat-python` against a stable-retro env would work on macOS, but then you are hand-designing a fitness function and a RAM map per game — which is exactly the per-console special-casing this repository is built to avoid.

Revisit only if Path A stalls on throughput.

---

## Path D — inference inside the emulator (blocked)

The draft treated this as an optional second integration. It is currently unavailable on both targets.

RetroArch merged Game AI input override in January 2025 (PR #17407): a "Game AI" quick-menu section, an external `game_ai_lib` doing PyTorch C++ inference, overriding P1/P2 joypad each frame. It is **experimental, disabled by default, and built for Windows and Linux x86 only**. macOS arm64 and Pi aarch64 are not supported. MatPoliquin also maintains a RetroArch fork (`RetroArchAI`) ahead of upstream, with the same platform limits.

So: no "AI as a co-op partner in RetroArch" on this hardware today. Track the upstream platform list; revisit if arm64 or macOS builds appear. Until then, "playback on the Pi" means a Python process driving a headless core and rendering, not RetroArch with a model loaded.

---

## The parts that actually fail

**1. Action space.** Never expose the raw 12-button multi-discrete pad. Discretize to moves a human would press: walk, run-jump, jump, fire. Fighting games need tighter legal combo sets still.

**2. Reward.** Score-delta is often enough for shmups and sports. Platformers need `+Δx`, a small living bonus, and a hard death penalty. If the agent farms score in place, the shaping is wrong. Write `scenario.json` (stable-retro) or a Gym wrapper.

**3. Menus and lives.** Always start from a savestate *in gameplay*. Terminate on death or timeout. Curriculum = train one state, then unlock the next.

**4. Observation.** Pixels: skip 4, max-pool flicker, gray, 84×84, stack 4. RAM: hunt addresses in a memory searcher (FCEUX / mGBA), put them in `data.json`. RAM + a small MLP often beats a CNN on sample efficiency for 2D games.

**5. Throughput.** One NES instance is ~100–300 SPS on CPU. PPO wants millions of steps. Use `SubprocVecEnv` (8–16 procs). Don't render during training. There is no GPU emulation escape hatch on this hardware — CuLE is Atari + CUDA.

**6. ROM hashes.** Covered above, and specific to this repository's library. This is the single most likely thing to stall day one.

**7. Integrating a new game.** stable-retro ships ~1000. If a title isn't there: Integration UI → mark start state, done condition, reward variables → import. That is the real "bootstrap a new title" step, and it is manual.

---

## The plan

Each phase has an exit criterion. Do not start the next one until it is met.

**Phase 0 — prove the ROM situation.** Install the pack, run `python -m retro.import roms/nes` and record what was accepted. This is an hour of work and it determines whether Phase 3 is about Mario or about something else. *Exit:* a written list of which owned ROMs stable-retro will accept.

**Phase 1 — the pack skeleton.** `packages/ml/` with `setup.sh`, pinned `requirements.txt`, `.gitignore` entries, Python-version check. Optional `cmd/ml.sh` shim. *Exit:* `make check` green with no venv present; `retropi ml --help` works on a bare machine; `packages/ml/setup.sh` produces a working venv on this Mac.

**Phase 2 — Airstriker end to end.** Path A's skeleton, no owned ROM involved. *Exit:* a random agent and a trained checkpoint, with the trained one's mean episode reward clearly above random, inside about an hour of wall clock. If that does not happen, the problem is the setup, not the hyperparameters.

**Phase 3 — a title from this library.** The `ml:` manifest block, a savestate in `saves/`, an env adapter that reads the manifest rather than hardcoding the console. *Exit:* training runs driven entirely off `config/systems/<id>.yaml`, with a second console added by editing YAML only.

**Phase 4 — playback.** Load a checkpoint, drive a core, render. Confirm it runs on the Pi. *Exit:* a trained policy visibly playing on the Pi.

**Not in scope:** in-emulator inference (Path D, blocked), NEAT (Path C, deferred), GPU emulation (no hardware), any form of content download.

---

## Verification log

Checked 2026-09-11 against upstream sources:

- [stable-retro](https://github.com/Farama-Foundation/stable-retro) — module name `retro`, `python -m retro.import`, Python 3.10–3.14.
- [gym-super-mario-bros on PyPI](https://pypi.org/project/gym-super-mario-bros/) — 9.1.0, released 2026-06-10, Gymnasium-native, Python ≥ 3.13.
- [Gymnasium observation wrappers](https://gymnasium.farama.org/api/wrappers/observation_wrappers/) — `GrayscaleObservation` since v1.0.0.
- [SB3 Atari wrappers](https://stable-baselines3.readthedocs.io/en/master/common/atari_wrappers.html) — `WarpFrame`, `ClipRewardEnv` current.
- [RetroArch PR #17407](https://github.com/libretro/RetroArch/pull/17407) — merged 2025-01-21; experimental, off by default, Windows + Linux x86.
- [CuLE](https://github.com/NVlabs/cule) — the real GPU emulation project; Atari, CUDA. No evidence for "NeSLE".
- Local: `python3 -VV` → 3.14.7; `tests/test_manifests.sh` asserts required manifest keys only and tolerates unknown ones.
