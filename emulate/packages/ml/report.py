"""Render a training run's evidence as one static HTML page.

    retropi ml report smb-1-1          # -> runs/smb-1-1/report/index.html

Reads only what the run itself recorded: runs/<name>/progress.jsonl (one line
per evidence snapshot: evaluation results and the video it filmed),
runs/<name>/settings.json, runs/<name>/final-eval.json when present, and
runs/baselines/random.json for the random-policy baseline. Videos are
referenced as videos/<file>.mp4 next to the page. Standard library only.
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name: str) -> dict:
    run = os.path.join(HERE, "runs", name)
    rows = []
    with open(os.path.join(run, "progress.jsonl")) as fh:
        for line in fh:
            if line.strip():
                rows.append(json.loads(line))
    rows.sort(key=lambda r: r["step"])

    def opt(path):
        p = os.path.join(HERE, "runs", path)
        return json.load(open(p)) if os.path.exists(p) else None
    return {"name": name, "run": run, "rows": rows,
            "settings": opt(f"{name}/settings.json") or {},
            "final": opt(f"{name}/final-eval.json"),
            "highlights": opt(f"{name}/highlights.json") or [],
            "random": opt("baselines/random.json"),
            "random_video": os.path.exists(os.path.join(HERE, "runs", "baselines", "random.mp4")),
            "log_mtime": os.path.getmtime(os.path.join(run, "progress.jsonl"))}


def esc(v) -> str:
    return html.escape(str(v))


def fmt_steps(n: float) -> str:
    return f"{n / 1e6:.1f}M" if n >= 1e6 else f"{n / 1e3:.0f}k" if n >= 1e3 else str(int(n))


def chart(rows, random_mean, total_steps, flag_x) -> str:
    """Furthest x reached vs training steps, as inline SVG on one scale."""
    W, H, L, R, T, B = 760, 320, 56, 16, 16, 40
    x_max = max(total_steps, rows[-1]["step"] if rows else 1)
    y_max = 3400

    def X(v):
        return L + (W - L - R) * v / x_max

    def Y(v):
        return T + (H - T - B) * (1 - min(v, y_max) / y_max)

    parts = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Furthest x position reached against training steps" class="chart">']
    for v in range(0, y_max + 1, 500):
        parts.append(f'<line x1="{L}" x2="{W - R}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" class="grid"/>'
                     f'<text x="{L - 8}" y="{Y(v) + 4:.1f}" class="tick" text-anchor="end">{v:,}</text>')
    step = 1_000_000 if x_max > 3e6 else 250_000
    for v in range(0, int(x_max) + 1, step):
        parts.append(f'<text x="{X(v):.1f}" y="{H - B + 18}" class="tick" text-anchor="middle">{fmt_steps(v)}</text>')
    parts.append(f'<text x="{(L + W - R) / 2}" y="{H - 4}" class="axis" text-anchor="middle">agent steps (4 frames each)</text>')
    if flag_x:
        parts.append(f'<line x1="{L}" x2="{W - R}" y1="{Y(flag_x):.1f}" y2="{Y(flag_x):.1f}" class="flagline"/>'
                     f'<text x="{W - R - 4}" y="{Y(flag_x) - 6:.1f}" class="label flagtext" text-anchor="end">flagpole, x {flag_x:,}</text>')
    if random_mean is not None:
        parts.append(f'<line x1="{L}" x2="{W - R}" y1="{Y(random_mean):.1f}" y2="{Y(random_mean):.1f}" class="baseline"/>'
                     f'<text x="{L + 6}" y="{Y(random_mean) - 6:.1f}" class="label basetext">random policy, mean x {random_mean:,.0f}</text>')
    for key, cls in (("stochastic", "sto"), ("deterministic", "det")):
        pts = [(X(r["step"]), Y(r[key]["max_x_mean"])) for r in rows]
        if len(pts) > 1:
            parts.append(f'<polyline class="line {cls}" points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in pts)}"/>')
        for x, y in pts:
            parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3" class="dot {cls}"/>')
        if pts:
            x, y = pts[-1]
            parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="5" class="dot end {cls}"/>')
    parts.append("</svg>")
    return "".join(parts)


def page(d: dict) -> str:
    rows, s, rnd, final = d["rows"], d["settings"], d["random"], d["final"]
    total = int(float(s.get("steps", 10e6)))
    last = rows[-1] if rows else None
    finished = final is not None
    rmean = rnd["summary"]["max_x_mean"] if rnd else None
    flag_x = None   # the pole's x is not recorded by the env, so no line is drawn for it
    best = max((r[k]["max_x_best"] for r in rows for k in ("deterministic", "stochastic")), default=0)
    updated = dt.datetime.fromtimestamp(d["log_mtime"]).strftime("%Y-%m-%d %H:%M")
    hours = last["wall_s"] / 3600 if last else 0

    status = ("Finished" if finished else "Training") + f" · {fmt_steps(last['step'] if last else 0)} of {fmt_steps(total)} steps · updated {updated}"

    def tile(label, value, note):
        return f'<div class="tile"><div class="tl">{esc(label)}</div><div class="tv">{value}</div><div class="tn">{note}</div></div>'

    det, sto = (last["deterministic"], last["stochastic"]) if last else ({}, {})
    tiles = "".join([
        tile("Furthest x, policy's top action", f"{det.get('max_x_mean', 0):,.0f}",
             f"mean of {det.get('episodes', 0)} episodes at {fmt_steps(last['step']) if last else '0'}"),
        tile("Furthest x, sampled actions", f"{sto.get('max_x_mean', 0):,.0f}",
             f"mean of {sto.get('episodes', 0)} episodes"),
        tile("Random policy", f"{rmean:,.0f}" if rmean is not None else "—",
             f"mean of {rnd['summary']['episodes']} episodes" if rnd else "not measured yet"),
        tile("Flags reached", f"{det.get('flag_rate', 0):.0%} / {sto.get('flag_rate', 0):.0%}",
             "top action / sampled, latest snapshot"),
        tile("Best single run", f"x {best:,}", "any snapshot, any mode"),
        tile("Emulated", f"{(last['frames'] if last else 0) / 1e6:.0f}M frames",
             f"{hours:.1f} h wall clock · 32 games in parallel"),
    ])

    vids = []
    for r in reversed(rows):
        de, so = r["deterministic"], r["stochastic"]
        vids.append(
            f'<figure class="clip"><video src="{esc(r["video"])}" controls muted playsinline preload="metadata"></video>'
            f'<figcaption><b>{fmt_steps(r["step"])} steps</b>'
            f'<span>top action: x {de["max_x_mean"]:,.0f}, flags {de["flag_rate"]:.0%}</span>'
            f'<span>sampled: x {so["max_x_mean"]:,.0f}, flags {so["flag_rate"]:.0%}</span></figcaption></figure>')
    if d["random_video"]:
        vids.append('<figure class="clip"><video src="videos/random.mp4" controls muted playsinline preload="metadata"></video>'
                    f'<figcaption><b>Random policy</b><span>baseline, first 3 of {rnd["summary"]["episodes"] if rnd else "?"} episodes</span></figcaption></figure>')

    table = "".join(
        f'<tr><td>{fmt_steps(r["step"])}</td><td>{r["frames"] / 1e6:.1f}M</td>'
        f'<td>{r["deterministic"]["max_x_mean"]:,.0f}</td><td>{r["deterministic"]["max_x_best"]:,}</td><td>{r["deterministic"]["flag_rate"]:.0%}</td>'
        f'<td>{r["stochastic"]["max_x_mean"]:,.0f}</td><td>{r["stochastic"]["max_x_best"]:,}</td><td>{r["stochastic"]["flag_rate"]:.0%}</td>'
        f'<td>{r["wall_s"] / 60:.0f} min</td></tr>' for r in rows)

    hl = []
    for h in d["highlights"]:
        ev = json.load(open(os.path.join(d["run"], h["eval"]))) if h.get("eval") else None
        stats = ""
        if ev:
            es = ev["summary"]
            stats = (f'<p class="hlstats">{es["episodes"]} episodes, {esc(ev["policy"])} actions, sticky actions on: '
                     f'flag rate <b>{es["flag_rate"]:.0%}</b> ({es["ends"]["flag"]} of {es["episodes"]}), '
                     f'furthest x mean <b>{es["max_x_mean"]:,.0f}</b>, best {es["max_x_best"]:,}.</p>')
        video = (f'<video class="wide" src="{esc(h["video"])}" controls muted playsinline preload="metadata"></video>'
                 if h.get("video") else "")
        hl.append(f'<section><h2>{esc(h["title"])}</h2><p>{esc(h.get("note", ""))}</p>{stats}{video}</section>')
    highlight_block = "".join(hl)
    final_block = ""
    if final:
        fs = final["summary"]
        final_block = (f'<section><h2>Final evaluation</h2><p>{fs["episodes"]} episodes with sticky actions, the policy\'s top action each step: '
                       f'flag rate <b>{fs["flag_rate"]:.0%}</b>, furthest x mean <b>{fs["max_x_mean"]:,.0f}</b> '
                       f'(median {fs["max_x_median"]:,.0f}, best {fs["max_x_best"]:,}); endings: {fs["ends"]["flag"]} at the flag, {fs["ends"]["death"]} deaths, '
                       f'{fs["ends"]["timeout"]} stalled (no new ground for 400 steps).</p>'
                       + ('<video class="wide" src="videos/final-eval.mp4" controls muted playsinline preload="metadata"></video>'
                          if os.path.exists(os.path.join(d["run"], "videos", "final-eval.mp4")) else "")
                       + '</section>')

    return f"""<title>Mario 1-1 Agent</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;600&family=Silkscreen&display=swap">
<style>
/* Layout: a lab notebook for one training run - status, numbers, the curve, then the film strip. */
:root {{
  --bg: #f5f7fb; --panel: #ffffff; --ink: #1d2433; --muted: #5d667a; --rule: #d9deea;
  --sky: #3d6fe0; --brick: #b3462a; --base: #7a8295; --flag: #2e8a4e;
  --f-display: "Silkscreen", "IBM Plex Mono", ui-monospace, monospace;
  --f-body: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --f-data: "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
}}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{
  --bg: #11151f; --panel: #181e2b; --ink: #e4e8f2; --muted: #9aa3b8; --rule: #2a3245;
  --sky: #7ea2ff; --brick: #f0825f; --base: #8b93a8; --flag: #5fd08a; color-scheme: dark; }} }}
:root[data-theme="dark"] {{
  --bg: #11151f; --panel: #181e2b; --ink: #e4e8f2; --muted: #9aa3b8; --rule: #2a3245;
  --sky: #7ea2ff; --brick: #f0825f; --base: #8b93a8; --flag: #5fd08a; color-scheme: dark; }}
body {{ background: var(--bg); color: var(--ink); font: 15px/1.55 var(--f-body); }}
.wrap {{ max-width: 1040px; margin: 0 auto; padding-block: 28px 56px;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px));
  display: grid; gap: 28px; }}
header {{ display: grid; gap: 6px; }}
.eyebrow {{ font: 12px var(--f-display); letter-spacing: .08em; color: var(--brick); text-transform: uppercase; }}
h1 {{ font: 600 30px/1.15 var(--f-body); margin: 0; text-wrap: balance; }}
h2 {{ font: 600 18px var(--f-body); margin: 0 0 10px; }}
.status {{ font: 13px var(--f-data); color: var(--muted); }}
.status b {{ color: {"var(--flag)" if finished else "var(--sky)"}; font-weight: 600; }}
p {{ max-width: 68ch; margin: 0; }}
.tiles {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }}
.tile {{ background: var(--panel); border: 1px solid var(--rule); border-radius: 6px; padding: 12px 14px; display: grid; gap: 2px; min-width: 0; }}
.tl {{ font-size: 12px; color: var(--muted); }}
.tv {{ font: 600 24px var(--f-data); font-variant-numeric: tabular-nums; }}
.tn {{ font-size: 12px; color: var(--muted); }}
.chartbox {{ background: var(--panel); border: 1px solid var(--rule); border-radius: 6px; padding: 12px; overflow-x: auto; }}
.chart {{ width: 100%; min-width: 520px; height: auto; display: block; }}
.grid {{ stroke: var(--rule); stroke-width: 1; }}
.tick, .axis, .label {{ fill: var(--muted); font: 11px var(--f-data); }}
.axis {{ font-size: 12px; }}
.baseline {{ stroke: var(--base); stroke-width: 1.5; stroke-dasharray: 5 4; }}
.flagline {{ stroke: var(--flag); stroke-width: 1.5; }}
.flagtext {{ fill: var(--flag); }}
.line {{ fill: none; stroke-width: 2.25; stroke-linejoin: round; }}
.line.det, .dot.det {{ stroke: var(--sky); }} .dot.det {{ fill: var(--sky); }}
.line.sto, .dot.sto {{ stroke: var(--brick); }} .dot.sto {{ fill: var(--brick); }}
.dot.end {{ stroke: var(--panel); stroke-width: 2; }}
.legend {{ display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; color: var(--muted); margin-top: 8px; }}
.legend i {{ display: inline-block; width: 18px; height: 3px; vertical-align: middle; margin-right: 6px; }}
.clips {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; }}
.clip {{ margin: 0; background: var(--panel); border: 1px solid var(--rule); border-radius: 6px; overflow: hidden; display: grid; }}
.clip video, video.wide {{ width: 100%; display: block; background: #000; image-rendering: pixelated; }}
video.wide {{ max-width: 768px; border-radius: 6px; margin-top: 12px; }}
.hlstats {{ margin-top: 6px; font-size: 14px; }}
figcaption {{ padding: 8px 10px 10px; display: grid; gap: 1px; font-size: 12px; color: var(--muted); }}
figcaption b {{ color: var(--ink); font: 600 13px var(--f-data); }}
.tablebox {{ overflow-x: auto; background: var(--panel); border: 1px solid var(--rule); border-radius: 6px; }}
table {{ border-collapse: collapse; width: 100%; font: 13px var(--f-data); font-variant-numeric: tabular-nums; }}
th, td {{ padding: 6px 10px; text-align: right; border-bottom: 1px solid var(--rule); white-space: nowrap; }}
th {{ color: var(--muted); font-weight: 600; font-family: var(--f-body); font-size: 12px; }}
td:first-child, th:first-child {{ text-align: left; }}
ul {{ margin: 6px 0 0; padding-left: 20px; max-width: 72ch; }}
li {{ margin: 3px 0; }}
code {{ font: 13px var(--f-data); }}
pre {{ background: var(--panel); border: 1px solid var(--rule); border-radius: 6px; padding: 12px; overflow-x: auto; font: 13px var(--f-data); margin: 8px 0 0; }}
</style>
<div class="wrap">
<header>
  <div class="eyebrow">Rewind Arcade · retro-pi ML</div>
  <h1>Mario 1-1 Agent</h1>
  <div class="status"><b>{esc(status.split(" · ")[0])}</b> · {esc(" · ".join(status.split(" · ")[1:]))}</div>
  <p>A PPO agent learning World 1-1 of Super Mario Bros. on the real NES game, from pixels, in 32 emulators at once. Every video below is an unedited evaluation episode filmed at that point in training, at 60 frames per second.</p>
</header>
<section class="tiles">{tiles}</section>
<section>
  <h2>How far right Mario gets</h2>
  <div class="chartbox">{chart(rows, rmean, total, flag_x)}</div>
  <div class="legend"><span><i style="background:var(--sky)"></i>policy's top action (mean of {det.get('episodes', 0)})</span>
  <span><i style="background:var(--brick)"></i>sampled actions (mean of {sto.get('episodes', 0)})</span>
  <span><i style="background:var(--base)"></i>random policy</span></div>
</section>
{highlight_block}
{final_block}
<section>
  <h2>Film strip</h2>
  <p style="margin-bottom:12px">Newest first. Each snapshot films one episode with the policy's top action; the caption under the picture is burned in by the evaluator.</p>
  <div class="clips">{"".join(vids)}</div>
</section>
<section>
  <h2>Every snapshot</h2>
  <div class="tablebox"><table><thead><tr><th>Steps</th><th>Frames</th><th>Top: mean x</th><th>Top: best</th><th>Top: flags</th>
  <th>Sampled: mean x</th><th>Sampled: best</th><th>Sampled: flags</th><th>Wall</th></tr></thead><tbody>{table}</tbody></table></div>
</section>
<section>
  <h2>Setup</h2>
  <ul>
    <li><b>Game:</b> Super Mario Bros. from the Super Mario Bros. / Duck Hunt cartridge, World 1-1, on the FCEUmm libretro core retro-pi installs for RetroArch, driven headlessly by <code>lib/retrohost.py</code>.</li>
    <li><b>Agent sees:</b> 84×84 grayscale frames, max of the last two, 4 stacked (Mnih et al. 2015). <b>Acts:</b> 7 button combinations (gym-super-mario-bros SIMPLE_MOVEMENT), every 4 frames.</li>
    <li><b>Reward:</b> new ground reached to the right, a clock penalty, −15 on death, +15 at the flag (gym-super-mario-bros; max-x progress after Nichol et al. 2018). An episode is one life.</li>
    <li><b>Randomness:</b> sticky actions p=0.25 and 0–30 random no-op frames at each start, so the agent cannot memorise one button sequence (Machado et al. 2018). Evaluation uses the same.</li>
    <li><b>Learner:</b> PPO (Schulman et al. 2017; Stable-Baselines3), {esc(s.get('envs', 32))} envs × {esc(s.get('n_steps', 128))}-step rollouts, {esc(s.get('epochs', 4))} epochs, lr {esc(s.get('lr', 2.5e-4))} and clip {esc(s.get('clip', 0.1))} annealed to 0, γ {esc(s.get('gamma', 0.99))}, entropy {esc(s.get('ent', 0.01))}, on an AMD Radeon RX 9070 XT (ROCm).</li>
    <li><b>"Top action" vs "sampled":</b> the policy outputs probabilities; the top action always takes the most likely button, sampled draws from the distribution. Early in training sampling usually does better.</li>
  </ul>
  <pre>./bin/retropi ml train --name {esc(d['name'])} --envs {esc(s.get('envs', 32))} --steps {esc(s.get('steps', 10e6))}
./bin/retropi ml eval runs/{esc(d['name'])}/final.zip --episodes 100 --video eval.mp4
./bin/retropi ml report {esc(d['name'])}</pre>
</section>
</div>
"""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("name", nargs="?", default="smb-1-1")
    args = ap.parse_args()
    d = load(args.name)
    if not d["rows"]:
        print("no evidence snapshots yet", file=sys.stderr)
        return 1
    out = os.path.join(d["run"], "report")
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, "index.html")
    with open(path, "w") as fh:
        fh.write(page(d))
    print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
