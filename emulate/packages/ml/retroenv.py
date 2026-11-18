"""Gymnasium environments over retro-pi's own libretro cores.

    from retroenv import RetroEnv
    env = RetroEnv("smb-1-1")                 # packages/ml/games/smb-1-1.yaml
    obs, info = env.reset(seed=0)
    obs, reward, terminated, truncated, info = env.step(env.action_space.sample())

A game is a YAML file in games/ (see smb-1-1.yaml): the ROM, a boot script to
the first playable frame, RAM variables, derived values, reward terms, end
conditions and a discrete action set. Nothing here knows about any one game.

The emulator is lib/retrohost.py (standard library, ctypes) on the same core
binary RetroArch uses. One RetroEnv per process: libretro cores keep global
state, so vector envs must be subprocess-based (train.py uses SubprocVecEnv).

Defaults follow the emulator-RL literature (sources in README.md):
- frame skip 4 with a max-pool over the last two frames, 84x84 grayscale
  (Mnih et al. 2015), stacked by the trainer;
- sticky actions with p=0.25 (Machado et al. 2018), because the emulator is
  fully deterministic and would otherwise reward memorising an input sequence;
- 0-30 random no-op frames at reset (Mnih et al. 2015).
"""
from __future__ import annotations

import math
import os
import sys

import gymnasium as gym
import numpy as np
import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
EMULATE = os.path.dirname(os.path.dirname(HERE))          # retro-pi's root
sys.path.insert(0, os.path.join(EMULATE, "lib"))
from retrohost import Buttons, Core, PIXEL_RGB565, PIXEL_XRGB8888  # noqa: E402

GAMES = os.path.join(HERE, "games")
_HELPERS = {"clip": lambda v, lo, hi: max(lo, min(hi, v)), "min": min, "max": max,
            "abs": abs, "math": math}


class _Values(dict):
    """dict with attribute access, so expressions can say prev.x."""
    __getattr__ = dict.__getitem__


def load_game(name_or_path: str) -> dict:
    path = name_or_path
    if not os.path.exists(path):
        path = os.path.join(GAMES, f"{name_or_path}.yaml")
    with open(path, encoding="utf-8") as fh:
        game = yaml.safe_load(fh)
    game["_path"] = path
    return game


def resolve_core(system: str, emulator: str) -> str:
    """The core binary retro-pi installed for <system>'s <emulator>."""
    with open(os.path.join(EMULATE, "config", "systems", f"{system}.yaml"), encoding="utf-8") as fh:
        manifest = yaml.safe_load(fh)
    core = next((e.get("core") for e in manifest["emulators"]["list"] if e.get("id") == emulator), None)
    if not core:
        raise ValueError(f"{system} has no libretro emulator {emulator!r}")
    ext = "dylib" if sys.platform == "darwin" else "so"
    cores = os.environ.get("RETROPI_CORE_DIR") or os.path.join(
        os.environ.get("XDG_CONFIG_HOME", os.path.expanduser("~/.config")), "retroarch", "cores")
    path = os.path.join(cores, f"{core}.{ext}")
    if not os.path.exists(path):
        raise FileNotFoundError(f"core not installed: {path} "
                                f"(./bin/retropi cores install --system {system})")
    return path


def resolve_rom(system: str, rom: str) -> str:
    if os.path.isabs(rom):
        return rom
    roms = os.environ.get("RETROPI_PATHS_ROMS") or os.path.join(EMULATE, "roms")
    path = os.path.join(roms, system, rom)
    if not os.path.exists(path):
        raise FileNotFoundError(f"ROM not found: {path} (is the collection drive mounted?)")
    return path


class RetroEnv(gym.Env):
    metadata = {"render_modes": ["rgb_array"], "render_fps": 60}

    def __init__(self, game: str | dict = "smb-1-1", frame_skip: int = 4,
                 sticky: float = 0.25, noop_max: int = 30, size: int = 84,
                 render_mode: str | None = None, record: bool = False):
        self.game = game if isinstance(game, dict) else load_game(game)
        self.frame_skip, self.sticky, self.noop_max, self.size = frame_skip, sticky, noop_max, size
        self.render_mode = render_mode
        # record=True keeps every emulated frame (RGB, full size) in
        # self.recording for videos; training leaves it off.
        self.record = record
        self.recording: list[np.ndarray] = []
        g = self.game
        self.emu = Core(resolve_core(g["system"], g["emulator"]), resolve_rom(g["system"], g["rom"]))
        self._actions = [sum(Buttons.parse(b) for b in combo) if combo else 0 for combo in g["actions"]]
        self.action_space = gym.spaces.Discrete(len(self._actions))
        self.observation_space = gym.spaces.Box(0, 255, (size, size, 1), dtype=np.uint8)
        self._vars = {k: (int(v["addr"]), int(v.get("bcd", 0))) for k, v in g["vars"].items()}
        self._derive = [(k, compile(str(e), f"{g['name']}:derive.{k}", "eval")) for k, e in (g.get("derive") or {}).items()]
        self._reward = [(k, compile(str(e), f"{g['name']}:reward.{k}", "eval")) for k, e in g["reward"].items()]
        self._done = [compile(str(e), f"{g['name']}:done", "eval") for e in g.get("done", [])]
        self._start_state = self._boot()
        self._rows = self._cols = None
        self.prev = None
        self._last_action = 0

    # -- the game definition ------------------------------------------------------
    def _read(self) -> _Values:
        ram = self.emu.ram
        vals = _Values()
        for name, (addr, bcd) in self._vars.items():
            if bcd:
                v = 0
                for i in range(bcd):
                    v = v * 10 + (ram[addr + i] & 0x0F)
                vals[name] = v
            else:
                vals[name] = ram[addr]
        return vals

    def _evaluate(self, prev: _Values | None) -> _Values:
        vals = self._read()
        scope = dict(_HELPERS)
        scope.update(vals)
        scope["prev"] = prev if prev is not None else None
        for name, code in self._derive:
            if prev is None:
                # The first frame has no history: let `prev` be the frame itself.
                scope["prev"] = _Values(scope)
                scope["prev"].setdefault(name, 0)
            value = eval(code, {"__builtins__": {}}, scope)
            vals[name] = scope[name] = value
            if prev is None:
                scope["prev"][name] = value
        return vals

    def _check(self, code, vals, prev) -> object:
        scope = dict(_HELPERS)
        scope.update(vals)
        scope["prev"] = prev
        return eval(code, {"__builtins__": {}}, scope)

    def _boot(self) -> bytes:
        for step in self.game.get("boot", []):
            if "wait" in step:
                self.emu.run(int(step["wait"]), 0, render=False)
            elif "press" in step:
                self.emu.run(int(step.get("frames", 5)), Buttons.parse(str(step["press"])), render=False)
            elif "until" in step:
                code = compile(str(step["until"]), "boot.until", "eval")
                limit = int(step.get("max_frames", 2000))
                for _ in range(limit):
                    if self._check(code, self._evaluate(None), None):
                        break
                    self.emu.run(1, 0, render=False)
                else:
                    raise RuntimeError(f"{self.game['name']}: boot condition never held: {step['until']}")
        return self.emu.save_state()

    # -- observation -------------------------------------------------------------------
    @staticmethod
    def frame_rgb(f) -> np.ndarray:
        """A retrohost Frame as an (h, w, 3) uint8 array."""
        if f.format == PIXEL_XRGB8888:
            a = np.frombuffer(f.data, np.uint8).reshape(f.height, f.pitch // 4, 4)[:, :f.width]
            return a[..., [2, 1, 0]].copy()
        a = np.frombuffer(f.data, "<u2").reshape(f.height, f.pitch // 2)[:, :f.width].astype(np.uint16)
        if f.format == PIXEL_RGB565:
            r, g, b = (a >> 11 & 31) << 3, (a >> 5 & 63) << 2, (a & 31) << 3
        else:
            r, g, b = (a >> 10 & 31) << 3, (a >> 5 & 31) << 3, (a & 31) << 3
        return np.stack([r, g, b], axis=-1).astype(np.uint8)

    def _pixels(self) -> np.ndarray:
        """max(frame, previous frame) -> grayscale -> size x size."""
        frames = [f for f in (self.emu.frame, self.emu.prev_frame) if f is not None]
        out = None
        for f in frames:
            if f.format == PIXEL_XRGB8888:
                a = np.frombuffer(f.data, np.uint8).reshape(f.height, f.pitch // 4, 4)[:, :f.width]
                r, g, b = a[..., 2], a[..., 1], a[..., 0]
            else:
                a = np.frombuffer(f.data, "<u2").reshape(f.height, f.pitch // 2)[:, :f.width].astype(np.uint16)
                if f.format == PIXEL_RGB565:
                    r, g, b = (a >> 11 & 31) << 3, (a >> 5 & 63) << 2, (a & 31) << 3
                else:
                    r, g, b = (a >> 10 & 31) << 3, (a >> 5 & 31) << 3, (a & 31) << 3
            y = (0.299 * r + 0.587 * g + 0.114 * b).astype(np.uint8)
            out = y if out is None else np.maximum(out, y)
        if self._rows is None:
            h, w = out.shape
            self._rows = np.linspace(0, h - 1, self.size).astype(int)
            self._cols = np.linspace(0, w - 1, self.size).astype(int)
        return out[np.ix_(self._rows, self._cols)][..., None]

    def render(self):
        f = self.emu.frame
        return None if f is None else self.frame_rgb(f)

    # -- gymnasium -------------------------------------------------------------------------
    def reset(self, *, seed: int | None = None, options: dict | None = None):
        super().reset(seed=seed)
        self.emu.load_state(self._start_state)
        noops = int(self.np_random.integers(0, self.noop_max + 1)) if self.noop_max else 0
        self.recording = []
        self.emu.run(max(noops, 2), 0, render=True)
        self.prev = self._evaluate(None)
        self._steps = self._stall = 0
        self._last_action = 0
        return self._pixels(), self._info(self.prev)

    def step(self, action: int):
        buttons = self._actions[int(action)]
        prev_buttons = self._actions[self._last_action]
        for i in range(self.frame_skip):
            # Sticky actions: each frame, with probability p, the previous
            # action is held instead of the new one (Machado et al. 2018).
            held = prev_buttons if self.sticky and self.np_random.random() < self.sticky else buttons
            prev_buttons = held
            self.emu.run(1, held, render=self.record or i >= self.frame_skip - 2)
            if self.record and self.emu.frame is not None:
                self.recording.append(self.frame_rgb(self.emu.frame))
        self._last_action = int(action)
        vals = self._evaluate(self.prev)
        terms = {k: float(self._check(c, vals, self.prev)) for k, c in self._reward}
        clip = float(self.game.get("reward_clip", math.inf))
        reward = max(-clip, min(clip, sum(terms.values()))) / float(self.game.get("reward_scale", 1))
        terminated = any(self._check(c, vals, self.prev) for c in self._done)
        self._steps += 1
        self._stall = 0 if vals.get("max_x", 0) > self.prev.get("max_x", 0) else self._stall + 1
        truncated = (self._steps >= int(self.game.get("max_steps", 10**9))
                     or self._stall >= int(self.game.get("stall_steps", 10**9)))
        self.prev = vals
        info = self._info(vals)
        info["reward_terms"] = terms
        return self._pixels(), reward, bool(terminated), bool(truncated and not terminated), info

    def _info(self, vals) -> dict:
        return {k: (bool(vals[k]) if isinstance(vals[k], bool) else int(vals[k]))
                for k in self.game.get("info", []) if k in vals}

    def close(self):
        self.emu.close()


def make(game: str = "smb-1-1", **kwargs):
    """Factory for vector envs: make(game)() builds one env in the calling process."""
    def _thunk():
        return RetroEnv(game, **kwargs)
    return _thunk
