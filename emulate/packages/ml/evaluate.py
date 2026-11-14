"""Evaluate an agent on a retro-pi game, the way the literature reports it.

    retropi ml eval runs/smb-1-1/final.zip --episodes 100
    retropi ml eval runs/smb-1-1/final.zip --episodes 100 --video runs/smb-1-1/eval.mp4
    retropi ml eval --random --episodes 100 --json runs/random.json    # the baseline

Reports flag rate and furthest x over N episodes with sticky actions on and
the policy's top action (Machado et al. 2018: evaluate with the stochasticity
the agent will meet, report many episodes, count frames); --stochastic samples
from the policy instead. --video records the first --video-episodes episodes,
every emulated frame at 60 fps, captioned with the outcome.
"""
from __future__ import annotations

import argparse
import json
import os
import statistics
import time

import numpy as np

from retroenv import HERE, RetroEnv


def load_model(path: str):
    from stable_baselines3 import PPO
    if not os.path.exists(path) and os.path.exists(os.path.join(HERE, path)):
        path = os.path.join(HERE, path)       # relative to the pack (runs/<name>/...)
    return PPO.load(path, device="cpu")


def rollout(env: RetroEnv, model=None, deterministic: bool = True, seed: int = 0,
            record: bool = False) -> dict:
    """Play one episode. model=None is the uniform random policy."""
    env.record = record
    obs, info = env.reset(seed=seed)
    stack = [obs] * 4
    total, steps, done = 0.0, 0, False
    terminated = truncated = False
    while not done:
        if model is None:
            action = int(env.np_random.integers(env.action_space.n))
        else:
            action, _ = model.predict(np.concatenate(stack, axis=-1), deterministic=deterministic)
        obs, reward, terminated, truncated, info = env.step(int(action))
        stack = stack[1:] + [obs]
        total += reward
        steps += 1
        done = terminated or truncated
    result = {"seed": seed, "return": round(total, 3), "steps": steps, "frames": steps * env.frame_skip,
              "max_x": int(info.get("max_x", 0)), "flag": bool(info.get("flag")),
              "end": "flag" if info.get("flag") else "death" if terminated else "timeout"}
    if record:
        result["recording"] = env.recording
        env.record = False
    return result


def summarize(results: list[dict]) -> dict:
    xs = [r["max_x"] for r in results]
    return {"episodes": len(results),
            "flag_rate": sum(r["flag"] for r in results) / len(results),
            "max_x_mean": statistics.mean(xs), "max_x_median": statistics.median(xs),
            "max_x_best": max(xs), "max_x_worst": min(xs),
            "return_mean": statistics.mean(r["return"] for r in results),
            "frames_mean": statistics.mean(r["frames"] for r in results),
            "ends": {e: sum(r["end"] == e for r in results) for e in ("flag", "death", "timeout")}}


def caption_for(label: str, r: dict) -> str:
    return f"{label}  X {r['max_x']}  {r['end'].upper()}"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("model", nargs="?", help="a checkpoint .zip (omit with --random)")
    ap.add_argument("--game", default="smb-1-1")
    ap.add_argument("--episodes", type=int, default=100)
    ap.add_argument("--sticky", type=float, default=0.25)
    ap.add_argument("--random", action="store_true", help="uniform random policy")
    ap.add_argument("--stochastic", action="store_true",
                    help="sample from the policy instead of taking its top action")
    ap.add_argument("--video", help="MP4 of the first --video-episodes episodes")
    ap.add_argument("--video-episodes", type=int, default=3)
    ap.add_argument("--label", help="caption prefix for the video (default: the mode)")
    ap.add_argument("--json", help="write the summary and every episode here")
    ap.add_argument("--seed", type=int, default=1000)
    args = ap.parse_args()
    if not args.random and not args.model:
        ap.error("name a model, or use --random")

    env = RetroEnv(args.game, sticky=args.sticky)
    model = None if args.random else load_model(args.model)
    mode = "random" if model is None else ("stochastic" if args.stochastic else "deterministic")
    label = args.label or mode.upper()

    t0 = time.time()
    results, clips = [], []
    for ep in range(args.episodes):
        rec = bool(args.video) and ep < args.video_episodes
        r = rollout(env, model, deterministic=not args.stochastic, seed=args.seed + ep, record=rec)
        if rec:
            clips.append((r.pop("recording"), caption_for(f"{label} EP {ep + 1}", r)))
        results.append(r)

    summary = summarize(results)
    print(f"{args.game}: {args.episodes} episodes, {mode} policy {args.model or ''} ({time.time() - t0:.0f}s)")
    print(f"  flag rate   {summary['flag_rate']:.1%}   ends {summary['ends']}")
    print(f"  max x       mean {summary['max_x_mean']:.0f}  median {summary['max_x_median']:.0f}  "
          f"best {summary['max_x_best']}")
    print(f"  frames      mean {summary['frames_mean']:.0f} per episode")

    if clips:
        from video import write_mp4
        frames, captions = [], []
        for clip, caption in clips:
            frames.extend(clip)
            frames.extend([clip[-1]] * 45)         # hold the last frame 0.75 s
            captions.extend([caption] * (len(clip) + 45))
        _write_captioned(frames, captions, args.video)
        print(f"  video       {args.video} ({len(frames) / 60:.0f}s)")
    if args.json:
        with open(args.json, "w") as fh:
            json.dump({"game": args.game, "policy": mode, "model": args.model, "sticky": args.sticky,
                       "summary": summary, "episodes": results}, fh, indent=1)
    env.close()
    return 0


def _write_captioned(frames, captions, path):
    """One video whose caption changes per clip: write each clip's frames with
    its own caption bar baked in, then encode once."""
    from video import caption_bar, write_mp4
    bars = {}
    out = []
    for f, c in zip(frames, captions):
        if c not in bars:
            bars[c] = caption_bar(c, f.shape[1])
        out.append(np.concatenate([f, bars[c]], axis=0))
    write_mp4(out, path, fps=60, scale=3)


if __name__ == "__main__":
    raise SystemExit(main())
