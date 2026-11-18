"""Train a PPO agent on a retro-pi game.

    retropi ml train                               # smb-1-1, 16 envs, 10M steps
    retropi ml train --envs 32 --steps 20e6 --name smb-big
    retropi ml train --resume runs/smb-1-1/checkpoints/ppo_2000000_steps.zip

Runs land in packages/ml/runs/<name>/: checkpoints/, tensorboard/, best/ and
the exact settings (settings.json). Follow training with
    packages/ml/.venv/bin/tensorboard --logdir packages/ml/runs

Defaults follow PPO's Atari setting (Schulman et al. 2017, Table 5) with the
Mario-specific changes the reference implementations use; see README.md for
every source. A step is 4 emulated frames, so frames = 4 x steps.
"""
from __future__ import annotations

import argparse
import json
import os
import time

import numpy as np
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback, CheckpointCallback
from stable_baselines3.common.vec_env import SubprocVecEnv, VecFrameStack, VecMonitor

from retroenv import HERE, RetroEnv, make


def linear(start: float):
    return lambda progress: progress * start     # progress runs 1 -> 0


class GameStats(BaseCallback):
    """Log what matters in game terms: how far right, how often the flag."""

    def __init__(self, every: int = 10_000):
        super().__init__()
        self.every, self.max_x, self.flags, self.episodes = every, [], 0, 0

    def _on_step(self) -> bool:
        for info, done in zip(self.locals["infos"], self.locals["dones"]):
            if done:
                self.episodes += 1
                self.max_x.append(info.get("max_x", 0))
                self.flags += int(bool(info.get("flag")))
        if self.n_calls % max(1, self.every // self.training_env.num_envs) == 0 and self.max_x:
            recent = self.max_x[-100:]
            self.logger.record("game/max_x_mean", float(np.mean(recent)))
            self.logger.record("game/max_x_best", float(np.max(self.max_x)))
            self.logger.record("game/flags_total", self.flags)
            self.logger.record("game/episodes", self.episodes)
        return True


class Evidence(BaseCallback):
    """Every `every` steps: evaluate the current policy and film it.

    Writes runs/<name>/videos/step-<N>.mp4 (one deterministic episode, every
    frame at 60 fps) and appends a line to runs/<name>/progress.jsonl with
    deterministic and stochastic results over `episodes` episodes each. The
    evaluation env lives in this (the learner's) process, separate from the
    training envs, with the same sticky actions.
    """

    def __init__(self, run: str, game: str, every: int, episodes: int, sticky: float):
        super().__init__()
        self.run, self.game, self.every, self.episodes, self.sticky = run, game, every, episodes, sticky
        self.next = 0
        self.env = None
        self.started = time.time()

    def _on_training_start(self) -> None:
        self.next = self.num_timesteps          # film the starting point too

    def _on_step(self) -> bool:
        if self.num_timesteps >= self.next:
            self.next += self.every
            self.snapshot()
        return True

    def _on_training_end(self) -> None:
        # The final policy, unless a periodic snapshot just covered it.
        if self.num_timesteps - (self.next - self.every) > self.every // 10:
            self.snapshot()

    def snapshot(self) -> None:
        from evaluate import rollout, summarize, caption_for
        from video import caption_bar, write_mp4
        if self.env is None:
            self.env = RetroEnv(self.game, sticky=self.sticky)
        step = self.num_timesteps
        det = [rollout(self.env, self.model, True, seed=9000 + i, record=(i == 0)) for i in range(self.episodes)]
        sto = [rollout(self.env, self.model, False, seed=9500 + i) for i in range(self.episodes)]
        clip = det[0].pop("recording")
        os.makedirs(os.path.join(self.run, "videos"), exist_ok=True)
        video = os.path.join(self.run, "videos", f"step-{step:09d}.mp4")
        cap = caption_for(f"STEP {step / 1e6:.2f}M", det[0])
        bar = caption_bar(cap, clip[0].shape[1])
        write_mp4([np.concatenate([f, bar], axis=0) for f in clip + [clip[-1]] * 45], video)
        row = {"step": step, "frames": step * 4, "wall_s": round(time.time() - self.started, 1),
               "deterministic": summarize(det), "stochastic": summarize(sto),
               "video": os.path.relpath(video, self.run)}
        with open(os.path.join(self.run, "progress.jsonl"), "a") as fh:
            fh.write(json.dumps(row) + "\n")
        d, s_ = row["deterministic"], row["stochastic"]
        self.logger.record("eval/det_max_x_mean", d["max_x_mean"])
        self.logger.record("eval/det_flag_rate", d["flag_rate"])
        self.logger.record("eval/sto_max_x_mean", s_["max_x_mean"])
        self.logger.record("eval/sto_flag_rate", s_["flag_rate"])
        print(f"[evidence] step {step:,}: deterministic x {d['max_x_mean']:.0f} flags {d['flag_rate']:.0%}"
              f" | stochastic x {s_['max_x_mean']:.0f} flags {s_['flag_rate']:.0%} -> {video}", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--game", default="smb-1-1")
    ap.add_argument("--name", help="run name (default: the game)")
    ap.add_argument("--envs", type=int, default=16, help="parallel emulator processes")
    ap.add_argument("--steps", type=float, default=10e6, help="agent steps (x4 frames)")
    ap.add_argument("--lr", type=float, default=2.5e-4)
    ap.add_argument("--n-steps", type=int, default=128, help="rollout length per env")
    ap.add_argument("--batch", type=int, default=256)
    ap.add_argument("--epochs", type=int, default=4)
    ap.add_argument("--gamma", type=float, default=0.99)
    ap.add_argument("--clip", type=float, default=0.1)
    ap.add_argument("--ent", type=float, default=0.01)
    ap.add_argument("--sticky", type=float, default=0.25)
    ap.add_argument("--device", default="auto")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--resume", help="checkpoint .zip to continue from")
    ap.add_argument("--video-every", type=float, default=500_000,
                    help="steps between evidence snapshots (video + evaluation); 0 disables")
    ap.add_argument("--eval-episodes", type=int, default=10)
    args = ap.parse_args()

    name = args.name or args.game
    run = os.path.join(HERE, "runs", name)
    os.makedirs(run, exist_ok=True)
    with open(os.path.join(run, "settings.json"), "w") as fh:
        json.dump(vars(args), fh, indent=2)

    venv = SubprocVecEnv([make(args.game, sticky=args.sticky) for _ in range(args.envs)],
                         start_method="spawn")
    venv = VecFrameStack(VecMonitor(venv), n_stack=4)
    venv.seed(args.seed)

    if args.resume:
        model = PPO.load(args.resume, env=venv, device=args.device)
    else:
        model = PPO("CnnPolicy", venv, learning_rate=linear(args.lr), n_steps=args.n_steps,
                    batch_size=args.batch, n_epochs=args.epochs, gamma=args.gamma,
                    gae_lambda=0.95, clip_range=linear(args.clip), ent_coef=args.ent,
                    vf_coef=0.5, max_grad_norm=0.5, seed=args.seed, device=args.device,
                    tensorboard_log=os.path.join(run, "tensorboard"), verbose=1)

    callbacks = [CheckpointCallback(save_freq=max(1, 500_000 // args.envs),
                                    save_path=os.path.join(run, "checkpoints"), name_prefix="ppo"),
                 GameStats()]
    if args.video_every:
        callbacks.append(Evidence(run, args.game, int(args.video_every), args.eval_episodes, args.sticky))
    import torch
    dev = model.device
    print(f"training {args.game}: {args.envs} envs, {int(args.steps):,} steps "
          f"({int(args.steps) * 4:,} frames) on {dev}"
          f"{' (' + torch.cuda.get_device_name(0) + ')' if dev.type == 'cuda' else ''} -> {run}", flush=True)
    t0 = time.time()
    try:
        model.learn(total_timesteps=int(args.steps), callback=callbacks,
                    reset_num_timesteps=not args.resume, tb_log_name="ppo")
    except KeyboardInterrupt:
        print("interrupted; saving")
    model.save(os.path.join(run, "final"))
    print(f"saved {os.path.join(run, 'final.zip')} after {time.time() - t0:.0f}s")
    venv.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
