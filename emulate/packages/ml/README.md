# ml

> Reinforcement learning on real games: Gymnasium environments over retro-pi's own libretro cores and your own ROMs, starting with Super Mario Bros. World 1-1.

An optional extension pack. The core of retro-pi stays bash and the Python standard library; this pack's stack (PyTorch, Gymnasium, Stable-Baselines3) lives in `packages/ml/.venv` and nothing outside the pack imports it. Removing `packages/ml/` changes no core behaviour.

## Quick start

```sh
./bin/retropi ml setup --rocm          # packages/ml/.venv with PyTorch for AMD GPUs (or --cpu, --cuda)
./bin/retropi ml check                 # API check, random rollout, emulator speed
./bin/retropi ml eval --random --episodes 100       # the baseline to beat
./bin/retropi ml train --envs 16 --steps 10e6       # PPO; runs/smb-1-1/
./bin/retropi ml board                 # TensorBoard
./bin/retropi ml eval runs/smb-1-1/final.zip --episodes 100 --video eval.mp4 --json eval.json
./bin/retropi ml report smb-1-1        # runs/smb-1-1/report/index.html: curves, table, every video
```

A long run belongs in a user service, so it survives the editor closing:

```sh
systemd-run --user --unit=retropi-ml-smb-1-1 --working-directory="$PWD" \
  --property=StandardOutput=append:"$PWD/packages/ml/runs/smb-1-1/train.log" \
  ./bin/retropi ml train --name smb-1-1 --envs 32 --steps 10e6
```

## Evidence

Training films itself. Every `--video-every` steps (default 500,000) it pauses, evaluates the current policy over `--eval-episodes` episodes (default 10) both with its top action and sampling, films one top-action episode at 60 fps with the result burned into a caption bar, and appends one line to `runs/<name>/progress.jsonl`. `ml report` turns that file, the run's settings and the random baseline (`ml eval --random --episodes 100 --json runs/baselines/random.json --video runs/baselines/random.mp4`) into one page. Videos are H.264 MP4s written by the host's `ffmpeg`.

## Hardware

PyTorch for AMD GPUs comes from the PyTorch ROCm index (`--rocm`, currently `rocm10.0`; `PYTORCH_INDEX` overrides). It bundles GPU libraries for every AMD architecture, so the venv is about 18 GB (1 GB with `--cpu`). Measured on an RX 9070 XT with 32 parallel games: about 1,000-1,200 agent steps/s, against about 450 on the CPU alone. The emulators could supply about 8,700; the rest of the gap is Python-side env stepping and process traffic.

## How it fits together

```
games/smb-1-1.yaml ──► retroenv.RetroEnv (Gymnasium) ──► train.py (PPO, SubprocVecEnv) ──► runs/<name>/
                             │
                             ▼
             lib/retrohost.py (stdlib ctypes libretro host)
                             │  same core binary RetroArch loads
                             ▼
             ~/.config/retroarch/cores/fceumm_libretro.so + roms/nes/<your dump>
```

- **The emulator is retro-pi's.** `lib/retrohost.py` loads the core `retropi cores install` put on disk and the ROM from `roms/<system>/` as it is. There is no hash allow-list, so dumps that stable-retro would reject (most of a real collection) still work, and a policy trained here plays the same core RetroArch runs.
- **A game is a YAML file.** `games/<name>.yaml` names the system, emulator and ROM, a boot script to the first playable frame, RAM variables, derived values, reward terms, end conditions and the action set. `retroenv.py` knows nothing about Mario. A new game is a new file.
- **Episodes reset from a save state** taken at the end of the boot script: instant, and identical each time. The emulator is deterministic (`tests/test_dev.sh` proves byte-identical RAM and frames from the same state and inputs), which is exactly why sticky actions and random no-op starts are on by default.
- **One env per process.** A libretro core keeps global state, so `train.py` runs each env in its own process (`SubprocVecEnv`). One process emulates about 3,000 frames/s (50x real time); on this 32-thread machine 16 processes reach about 35,000 frames/s and 32 about 47,000 (`retropi dev headless nes <rom> --bench --procs 16`).

## Defaults, and where they come from

| Setting | Default | Basis |
|---|---|---|
| Observation | max of the last two frames, grayscale, 84x84, 4-frame stack | Mnih et al. 2015 (DQN) |
| Frame skip | 4 (a step is 4 frames; count frames, not steps) | Mnih et al. 2015; Machado et al. 2018 |
| Stochasticity | sticky actions p=0.25, 0-30 random no-ops at reset | Machado et al. 2018; Mnih et al. 2015 |
| Actions | SIMPLE_MOVEMENT, 7 combinations | gym-super-mario-bros (Kauten) |
| Reward | progress on new max-x (jumps over 5 px/frame pay 0), clock penalty, -15 on death, +15 at the flag; clipped to ±15, scaled to ±1 | gym-super-mario-bros 7.4/9.x; Nichol et al. 2018 (max-x progress) |
| Termination | death, flag, leaving normal play; truncate at 3,000 steps or 400 steps without new ground | gym-super-mario-bros single-stage mode |
| Algorithm | PPO, 16 envs, rollout 128, 4 epochs, batch 256, lr 2.5e-4 and clip 0.1 annealed to 0, γ 0.99, λ 0.95, entropy 0.01 | Schulman et al. 2017, Table 5 (Atari) |

Values worth sweeping first, from the reference implementations: learning rate between 1e-5 and 1e-3 (uvipen's per-level tuning landed at 1e-4, 7e-5 for 1-3), γ 0.9, and more parallel envs (Burda et al. 2018 saw markedly better exploration with larger batches, up to 2,048 envs).

## Evaluating fairly

From Machado et al. 2018 and common practice: evaluate with sticky actions on (`ml eval` does), over at least 100 episodes, report flag rate and mean furthest x, count frames (4 per step), train several seeds, and check generalization on a level the agent never saw (1-2's night palette defeated Pathak et al.'s agent until fine-tuned). Random baseline on this setup, 20 episodes: 0% flags, mean furthest x 713 of roughly 3,160 to the flag.

## Research basis

Checked against the primary sources on 2026-11-13; numbers not in the source are not repeated here.

- Mnih et al., "Human-level control through deep reinforcement learning", *Nature* 518, 2015: frame max-pool, 84x84 luminance, frame skip 4, 4-frame stack, no-op starts.
- Machado et al., "Revisiting the Arcade Learning Environment", *JAIR* 61, 2018 (doi:10.1613/jair.5699): deterministic emulators reward memorised action sequences; sticky actions with ς=0.25; count frames; report at several points.
- Schulman et al., "Proximal Policy Optimization Algorithms", arXiv:1707.06347, 2017: Atari hyperparameters (horizon 128, 3 epochs, lr 2.5e-4·α, clip 0.1·α, γ 0.99, λ 0.95, entropy 0.01).
- Pathak et al., "Curiosity-driven Exploration by Self-supervised Prediction", ICML 2017 (arXiv:1705.05363): A3C + intrinsic curiosity on SMB with no game reward; crossed over 30% of 1-1; generalized to 1-3 but not 1-2 without fine-tuning.
- Burda et al., "Large-Scale Study of Curiosity-Driven Learning", ICLR 2019 (arXiv:1808.04355): PPO + curiosity, 84x84, frame skip 4; a 2,048-env run discovered 11 levels; larger batches helped.
- Nichol et al., "Gotta Learn Fast: A New Benchmark for Generalization in RL", arXiv:1804.03720, 2018: the Gym Retro (Sonic) benchmark; reward on max-x progress, 7 button combinations, sticky frame skip, 4,500-step episodes.
- Espeholt et al., IMPALA, ICML 2018 (arXiv:1802.01561), and Horgan et al., Ape-X, ICLR 2018 (arXiv:1803.00933): throughput by many parallel emulator actors; this machine's ~47k frames/s is about Ape-X scale.
- Kauten, [gym-super-mario-bros](https://github.com/Kautenja/gym-super-mario-bros): the RAM map, reward and action sets most SMB work builds on (cross-checked against [Data Crystal's SMB RAM map](https://datacrystal.tcrf.net/wiki/Super_Mario_Bros./RAM_map)).
- uvipen, [Super-mario-bros-PPO-pytorch](https://github.com/uvipen/Super-mario-bros-PPO-pytorch): PPO reported clearing 31 of 32 levels, with per-level learning rates; training time not reported.

No peer-reviewed PPO/DQN result with a full budget table for NES SMB 1-1 on game reward was found, so how many frames 1-1 takes here is an open measurement: plan for 10-50 million frames before judging a configuration.
