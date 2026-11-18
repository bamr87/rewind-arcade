"""Artwork for every file reference: covers, logos, title screens, cartridges, screenshots.

    cartidx media              download what is missing (incremental)
    cartidx media --report     coverage only, no network

Images land in `<workspace>/media/<system>/<kind>/<stem>.<ext>`, where `stem` is the
dump's file name without its extension and `kind` is ES-DE's folder name. That is the
layout ES-DE reads from its MediaDirectory setting and the one a static web host can
serve unchanged, so the desktop frontend and the browser arcade read the same files.

Sources, best first per kind:

| kind           | source                                                         |
|----------------|----------------------------------------------------------------|
| covers         | LaunchBox "Box - Front", else libretro Named_Boxarts by No-Intro name |
| marquees       | LaunchBox "Clear Logo"                                          |
| titlescreens   | LaunchBox "Screenshot - Game Title", else libretro Named_Titles |
| physicalmedia  | LaunchBox "Cart - Front"                                        |
| screenshots    | libretro Named_Snaps by No-Intro name (gameplay)                |

Artwork is metadata, never game data. A URL that answered 404 is remembered in
`media/.missing.json` and not asked again until `--retry-missing`. `media/index.json`
lists what is on disk per dump, for the browser arcade to read once.
"""

from __future__ import annotations

import csv
import json
import os
import urllib.error
import urllib.parse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

LAUNCHBOX = "https://images.launchbox-app.com/"
LIBRETRO = "https://thumbnails.libretro.com/"

# libretro-thumbnails pack per system id; ids without one get LaunchBox art only.
LIBRETRO_PACKS = {
    "nes": "Nintendo - Nintendo Entertainment System",
    "snes": "Nintendo - Super Nintendo Entertainment System",
    "n64": "Nintendo - Nintendo 64",
    "gb": "Nintendo - Game Boy",
    "gbc": "Nintendo - Game Boy Color",
    "gba": "Nintendo - Game Boy Advance",
    "megadrive": "Sega - Mega Drive - Genesis",
    "sega32x": "Sega - 32X",
    "mastersystem": "Sega - Master System - Mark III",
    "gamegear": "Sega - Game Gear",
    "sg1000": "Sega - SG-1000",
    "segacd": "Sega - Mega-CD - Sega CD",
    "pcengine": "NEC - PC Engine - TurboGrafx 16",
    "atari2600": "Atari - 2600",
    "atari7800": "Atari - 7800",
}

# kind -> (LaunchBox column in roms.csv, libretro folder); either may be None.
KINDS = {
    "covers": ("box_art", "Named_Boxarts"),
    "marquees": ("logo_art", None),
    "titlescreens": ("title_art", "Named_Titles"),
    "physicalmedia": ("cart_art", None),
    "screenshots": (None, "Named_Snaps"),
}


def media_root(cfg) -> Path:
    return cfg.workspace / "media"


def libretro_name(name: str) -> str:
    """libretro-thumbnails replaces these characters in file names with '_'."""
    return "".join("_" if c in '&*/:`<>?\\|"' else c for c in name)


def stem(path: str) -> str:
    base = os.path.basename(path)
    return os.path.splitext(base)[0]


def keeper(path: str) -> bool:
    """A dump outside the holding folders (_duplicates, _regional, ...)."""
    return not any(part.startswith("_") for part in Path(path).parts[:-1])


def candidates(row: dict, kind: str) -> list[str]:
    lb_col, lr_folder = KINDS[kind]
    out = []
    lb = (row.get(lb_col) or "").strip() if lb_col else ""
    if lb:
        out.append(LAUNCHBOX + urllib.parse.quote(lb))
    pack = LIBRETRO_PACKS.get(row.get("system") or "")
    name = (row.get("nointro_name") or "").strip()
    if lr_folder and pack and name:
        out.append(f"{LIBRETRO}{urllib.parse.quote(pack)}/{lr_folder}/"
                   f"{urllib.parse.quote(libretro_name(name))}.png")
    return out


def existing(folder: Path, s: str) -> Path | None:
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        p = folder / f"{s}{ext}"
        if p.exists():
            return p
    return None


def plan(rows, root: Path, kinds=KINDS, include_held=False):
    """(have, todo): images already on disk, and (dest stem path, urls) still to get."""
    have, todo, seen = [], [], set()
    for r in rows:
        path = r.get("path") or ""
        if not path or (not include_held and not keeper(path)):
            continue
        s = stem(path)
        for kind in kinds:
            key = (r["system"], kind, s)
            if key in seen:
                continue
            seen.add(key)
            folder = root / r["system"] / kind
            got = existing(folder, s)
            if got:
                have.append((r["system"], kind, s, got))
                continue
            urls = candidates(r, kind)
            if urls:
                todo.append((r["system"], kind, s, folder, urls))
    return have, todo


def _ext(url: str) -> str:
    ext = os.path.splitext(urllib.parse.urlparse(url).path)[1].lower()
    return ext if ext in (".png", ".jpg", ".jpeg", ".webp") else ".png"


def _get(job, missing: set, download):
    system, kind, s, folder, urls = job
    for url in urls:
        if url in missing:
            continue
        try:
            info = download(url, folder / f"{s}{_ext(url)}")
            return job, url, info, None
        except urllib.error.HTTPError as e:
            if e.code in (403, 404, 410):
                missing.add(url)
                continue
            return job, url, None, f"HTTP {e.code}"
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            return job, url, None, str(e)
    return job, None, None, "no source"


def run(cfg, rows, systems=None, kinds=None, workers=6, include_held=False,
        retry_missing=False, report_only=False, log=print) -> dict:
    from .fetch import download
    root = media_root(cfg)
    kinds = [k for k in (kinds or KINDS) if k in KINDS]
    rows = [r for r in rows if not systems or r.get("system") in systems]
    miss_path = root / ".missing.json"
    missing = set() if retry_missing else set(_read_json(miss_path, []))
    have, todo = plan(rows, root, kinds, include_held)
    stats = {"had": len(have), "todo": len(todo), "got": 0, "none": 0, "errors": 0, "bytes": 0}
    log(f"  media     {len(have)} images on disk, {len(todo)} to look for")
    if report_only or not todo:
        if not report_only:
            write_index(rows, root, include_held)
        return stats | {"coverage": coverage(rows, root, kinds, include_held)}
    manifest = _read_manifest(root)
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        for i, (job, url, info, err) in enumerate(
                pool.map(lambda j: _get(j, missing, download), todo), 1):
            system, kind, s = job[:3]
            if info:
                stats["got"] += 1
                stats["bytes"] += info["bytes"]
                manifest[(system, kind, s)] = {"url": url, "bytes": info["bytes"],
                                               "sha1": info["sha1"]}
            elif err == "no source":
                stats["none"] += 1
            else:
                stats["errors"] += 1
                log(f"  media     {system}/{kind}/{s}: {err}")
            if i % 500 == 0:
                log(f"  ... {i}/{len(todo)} ({stats['got']} new, {stats['bytes'] / 1e6:.0f} MB)")
                _save(root, manifest, missing)
    _save(root, manifest, missing)
    write_index(rows, root, include_held)
    stats["coverage"] = coverage(rows, root, kinds, include_held)
    return stats


def write_index(rows, root: Path, include_held=False) -> int:
    """media/index.json: what is on disk per dump, for a web page to read once.

    {"<system>/<stem>": {"t": title, "covers": ".png", "screenshots": ".png", ...}}
    The browser joins a game to its images by system and title, and a file in
    the roms folder by system and file name (the stem).
    """
    index = {}
    for r in rows:
        path = r.get("path") or ""
        if not path or (not include_held and not keeper(path)):
            continue
        key = f"{r['system']}/{stem(path)}"
        if key in index:
            continue
        entry = {"t": r.get("title") or ""}
        for kind in KINDS:
            got = existing(root / r["system"] / kind, stem(path))
            if got:
                entry[kind] = got.suffix
        if len(entry) > 1:
            index[key] = entry
    root.mkdir(parents=True, exist_ok=True)
    tmp = root / ".index.json.tmp"
    tmp.write_text(json.dumps(index, separators=(",", ":"), ensure_ascii=False, sort_keys=True),
                   encoding="utf-8")
    os.replace(tmp, root / "index.json")
    return len(index)


def coverage(rows, root: Path, kinds=KINDS, include_held=False) -> dict:
    """{system: Counter(kind -> games with that image, 'games' -> total)}."""
    out = defaultdict(Counter)
    seen = set()
    for r in rows:
        path = r.get("path") or ""
        if not path or (not include_held and not keeper(path)):
            continue
        s = stem(path)
        if (r["system"], s) in seen:
            continue
        seen.add((r["system"], s))
        c = out[r["system"]]
        c["games"] += 1
        for kind in kinds:
            c[kind] += existing(root / r["system"] / kind, s) is not None
    return dict(out)


def _read_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


MANIFEST_FIELDS = ["system", "kind", "stem", "url", "bytes", "sha1"]


def _read_manifest(root: Path) -> dict:
    out = {}
    try:
        with open(root / "manifest.csv", encoding="utf-8", newline="") as fh:
            for r in csv.DictReader(fh):
                out[(r["system"], r["kind"], r["stem"])] = {k: r[k] for k in ("url", "bytes", "sha1")}
    except OSError:
        pass
    return out


def _save(root: Path, manifest: dict, missing: set) -> None:
    root.mkdir(parents=True, exist_ok=True)
    tmp = root / ".manifest.csv.tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, MANIFEST_FIELDS)
        w.writeheader()
        for (system, kind, s), v in sorted(manifest.items()):
            w.writerow({"system": system, "kind": kind, "stem": s, **v})
    os.replace(tmp, root / "manifest.csv")
    (root / ".missing.json").write_text(json.dumps(sorted(missing), indent=0), encoding="utf-8")
