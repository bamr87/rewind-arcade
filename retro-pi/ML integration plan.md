You hook the emulator into the standard RL loop: **pixels or RAM in, button presses out, reward in between**. The emulator is just a Gymnasium environment that you can reset to a savestate, step one frame (or four), and kill when the agent dies.

There are two different “bootstrap” jobs people mix up:

1. **Train** a policy by driving the emulator from Python.
2. **Inject** a trained policy back into an emulator frontend (RetroArch, BizHawk) so it plays live.

Do (1) first. (2) is optional.

---

## The contract you have to implement

Every working setup is the same loop:

```text
savestate  →  observation (RGB and/or RAM)
           →  policy (CNN / MLP / NEAT genome)
           →  joypad bitmask
           →  emulator.step()
           →  reward + done
           →  store transition / evolve
```

Four design choices decide whether this works in an afternoon or a month:

| Choice | Easy default | Why it matters |
|---|---|---|
| Observation | 84×84 grayscale, 4-frame stack | Pixels work everywhere; RAM is faster if you know addresses |
| Action space | 7–12 legal button combos, not 256 raw NES buttons | Raw buttons almost never learn |
| Reward | Δx + Δscore − death, clipped | Sparse “beat the level” is too late |
| Reset | Savestate *after* the title screen | Otherwise the agent spends 10M steps on the menu |

---

## Path A — fastest general setup: Stable-Retro + PPO

This is the maintained fork of OpenAI Gym Retro. It wraps NES, SNES, Genesis, GB/GBA, Atari, arcade, and more as Gymnasium envs.

```bash
pip install stable-retro "stable-baselines3[extra]" gymnasium
```

ROMs are **not** shipped. Put legally obtained dumps in a folder and import them (hashes must match No-Intro):

```bash
python -m retro.import /path/to/roms
```

Airstriker (Genesis) ships as a public-domain test ROM, so you can verify the stack with zero ROM hunting.

Minimal training skeleton:

```python
import stable_retro as retro
from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import SubprocVecEnv, VecFrameStack, VecTransposeImage
from stable_baselines3.common.atari_wrappers import WarpFrame, ClipRewardEnv
from gymnasium.wrappers import TimeLimit

def make_env():
    env = retro.make(game="Airstriker-Genesis", state=retro.State.DEFAULT)
    env = TimeLimit(env, max_episode_steps=4500)
    env = WarpFrame(env)          # 84x84 gray
    env = ClipRewardEnv(env)
    return env

venv = VecTransposeImage(VecFrameStack(SubprocVecEnv([make_env] * 8), n_stack=4))
model = PPO("CnnPolicy", venv, n_steps=128, batch_size=32, n_epochs=4,
            learning_rate=2.5e-4, ent_coef=0.01, verbose=1)
model.learn(total_timesteps=1_000_000)
model.save("airstriker_ppo")
```

That is the DeepMind Atari recipe ported to retro cores: frame skip + sticky actions + warp + clip + stack. Stable-Retro’s own docs use the same pattern.

Then swap the game id for something you own, e.g. `SuperMarioWorld-Snes` + a named savestate like `DonutPlains1`.

If you want a batteries-included trainer (curricula, export, play-against-AI), use [stable-retro-scripts](https://github.com/MatPoliquin/stable-retro-scripts).

---

## Path B — fastest *first win*: Super Mario Bros on nes-py

If you specifically want Mario, skip the 1000-game library and use `gym-super-mario-bros`. It already has level IDs, a shaped reward (forward progress), and a tiny legal action set.

```python
import gymnasium as gym
import gym_super_mario_bros
from nes_py.wrappers import JoypadSpace
from gym_super_mario_bros.actions import SIMPLE_MOVEMENT
from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv, VecFrameStack
from gymnasium.wrappers import GrayScaleObservation

def make():
    env = gym.make("SuperMarioBros-1-1-v3", render_mode="rgb_array")
    env = JoypadSpace(env, SIMPLE_MOVEMENT)   # 7 actions, not 256
    env = GrayScaleObservation(env, keep_dim=True)
    return env

env = VecFrameStack(DummyVecEnv([make]), n_stack=4)
model = PPO("CnnPolicy", env, n_steps=512, learning_rate=1e-5, verbose=1)
model.learn(1_000_000)
```

World 1-1 is the standard “did my pipeline work?” test. PPO on pixels usually starts looking like a player after a few hundred thousand to a couple million steps; RAM observations (x, y, enemy tiles) converge faster if you want to skip vision.

There is also a GPU-native NES emulator (NeSLE) that runs thousands of Mario instances on one CUDA card if you outgrow CPU `nes-py`.

---

## Path C — no GPU, classic bootstrap: NEAT inside the emulator

This is SethBling’s MarI/O pattern: a population of tiny nets, fitness = how far Mario got, evolve topologies. It runs *inside* BizHawk (Lua) or against Gym Retro with `neat-python`.

Why people still do this:

- Works on a laptop CPU.
- You can watch genomes fail in real time.
- RAM tile grids (solid / enemy / empty around the player) beat raw pixels for platformers.

Why not start here if you want a general “learn any game” system: you hand-design the fitness and the RAM map per game. Deep RL + Stable-Retro scales better once the env is integrated.

[Retro-ML](https://github.com/Tourmi/Retro-ML) is the modern packaged version of this (SharpNEAT + BizHawk plugins for SMW, SMB, Tetris, SF2, Pokémon, etc.).

---

## Path D — actually put the model *into* the emulator

Training talks to the core from Python. Playing “in” RetroArch is a second integration:

1. Train with Stable-Retro / stable-retro-scripts (`CnnPolicy`, 4×84×84 gray stack — that input shape is what the plugin expects).
2. Export the `.pt` / ONNX.
3. Load the RetroArch `retro_ai` plugin so it overrides P1 (or P2) joypad each frame.

That is how you get “AI as a co-op partner” or “AI as a better CPU opponent” in NHL ’94 / Sonic / etc., instead of a Python window.

BizHawk is the other injection target: Lua reads RAM + framebuffer, writes buttons. Good for NEAT and for one-off experiments; worse as a massively parallel trainer.

---

## The parts that actually fail

**1. Action space.**  
Never expose the raw 12-button multi-discrete pad. Discretize to “moves a human would press”: walk, run-jump, jump, fire, dash-attack. Fighting games need even tighter legal combo sets.

**2. Reward.**  
Default score-delta is often enough for shmups and sports. Platformers need `+Δx`, a small living bonus, and a hard death penalty. If the agent learns to farm score in place, you shaped it wrong. Write `scenario.json` (Stable-Retro) or a Gym wrapper.

**3. Menus and lives.**  
Always start from a savestate *in gameplay*. Terminate on death or timeout; don’t let the agent wander the title screen. Curriculum = train on one level/state, then unlock the next.

**4. Observation.**  
Pixels: skip 4, max-pool flicker, gray, 84×84, stack 4.  
RAM: hunt addresses in an emulator memory searcher (mGBA / FCEUX / BizHawk), then put them in `data.json`. RAM + a small MLP often beats a CNN on sample efficiency for 2D games.

**5. Throughput.**  
One NES instance is ~100–300 SPS on CPU. PPO wants millions of steps. Use `SubprocVecEnv` (8–16 procs) or a GPU emulator. Don’t render during training.

**6. Integration of a *new* game.**  
Stable-Retro already has ~1000 games. If yours isn’t there: Integration UI → mark start state, done condition, reward variables → import ROM. That is the real “bootstrap a new title” step.

---

## Which stack to pick

- **I want any retro game and a standard RL library** → Stable-Retro + SB3 PPO.  
- **I want Mario working this weekend** → `gym-super-mario-bros` + JoypadSpace + PPO.  
- **I have a laptop and like watching evolution** → NEAT + BizHawk / Retro-ML.  
- **I want the agent to play *inside* RetroArch with a human** → train in stable-retro-scripts, inject via the PyTorch C++ plugin.  
- **I need 10⁸ frames on one box** → NeSLE (NES) or a big `SubprocVecEnv` farm.

Start with Airstriker or SMB 1-1. If the random agent dies in place and the trained agent starts moving right within an hour of wall clock, the bootstrap worked. Only then spend time on reward surgery and a real title.