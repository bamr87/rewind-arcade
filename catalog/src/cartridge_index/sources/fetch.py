"""Reference data: fetched on demand, never committed.

Everything a collection is compared against is third-party data under its own
terms, and all of it is one download away, so none of it lives in the
repository. `cartidx fetch` writes it under the reference directory and records
in SOURCES.json where each file came from, when, and its SHA-1.

  no-intro   libretro-database           hash sets: what a dump is
  metadat    libretro-database           developer, publisher, genre, year...
  launchbox  LaunchBox Games Database    ratings, descriptions, art file names, platforms
  vgchartz   Kaggle (a VGChartz scrape)  critic scores and sales

The Kaggle dataset downloads anonymously. Credentials -- KAGGLE_API_TOKEN, or
KAGGLE_USERNAME and KAGGLE_KEY, from the environment or a .env beside
cartridge.toml -- are only sent if Kaggle refuses the anonymous request.
"""

from __future__ import annotations

import base64
import csv
import hashlib
import io
import os
import re
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from ..dat import META_FIELDS
from ..io import read_json, write_csv, write_json
from . import (launchbox_path, launchbox_platforms_path, metadat_root, nointro_path,
               sources_path, vgchartz_path)

LIBRETRO = "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat"
LAUNCHBOX = "https://gamesdb.launchbox-app.com/Metadata.zip"
KAGGLE_DATASET = "bhushandivekar/video-game-sales-and-industry-data-1980-2024"
KAGGLE = f"https://www.kaggle.com/api/v1/datasets/download/{KAGGLE_DATASET}"
KAGGLE_MEMBER = "Video Games Sales (1980-2024) - Raw.csv"
USER_AGENT = "cartridge-index/0.1"

LAUNCHBOX_FIELDS = ("Name", "CommunityRating", "CommunityRatingCount", "Genres",
                    "Developer", "Publisher", "MaxPlayers", "ReleaseDate", "ESRB",
                    "Cooperative", "WikipediaURL", "Overview", "ReleaseType", "ReleaseYear",
                    "VideoURL", "DatabaseID")
# <GameImage> types kept, and the key each is stored under beside the game's fields.
LAUNCHBOX_IMAGES = {"Box - Front": "BoxFront", "Clear Logo": "ClearLogo",
                    "Screenshot - Game Title": "TitleShot", "Cart - Front": "CartFront"}
IMAGE_REGIONS = ("North America", "United States", "World", "", "Europe", "United Kingdom",
                 "Japan")
PLATFORM_FIELDS = ("Name", "ReleaseDate", "Developer", "Manufacturer", "Cpu", "Memory",
                   "Graphics", "Sound", "Display", "Media", "MaxControllers", "Notes",
                   "Category")
VGCHARTZ_COLUMNS = ["console", "title", "genre", "publisher", "developer",
                    "critic_score", "total_sales", "na_sales", "jp_sales",
                    "pal_sales", "other_sales", "release_date", "release_year"]

WHAT = ("nointro", "metadat", "launchbox", "vgchartz")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def download(url: str, dest: Path, headers: dict | None = None) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
    dest.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=f".{dest.name}.", dir=dest.parent)
    h, n = hashlib.sha1(), 0
    try:
        with urllib.request.urlopen(req, timeout=120) as resp, os.fdopen(fd, "wb") as out:
            while chunk := resp.read(1 << 16):
                out.write(chunk)
                h.update(chunk)
                n += len(chunk)
        os.replace(tmp, dest)
    except BaseException:
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass
        raise
    return {"url": url, "bytes": n, "sha1": h.hexdigest(), "fetched": _now()}


def _record(cfg, key: str, info: dict) -> None:
    path = sources_path(cfg)
    data = read_json(path, {})
    data[key] = info
    write_json(path, dict(sorted(data.items())), indent=1)


def fetch_nointro(cfg, systems, log=print) -> int:
    ok = 0
    for s in systems:
        url = f"{LIBRETRO}/no-intro/{urllib.parse.quote(s.dat)}.dat"
        try:
            info = download(url, nointro_path(cfg, s))
        except urllib.error.HTTPError as e:
            log(f"  no-intro  {s.label:<14} HTTP {e.code}")
            continue
        _record(cfg, f"no-intro/{s.dat}", info)
        log(f"  no-intro  {s.label:<14} {info['bytes'] / 1e6:6.2f} MB")
        ok += 1
    return ok


def fetch_metadat(cfg, systems, log=print) -> int:
    ok = 0
    for folder in META_FIELDS:
        got = 0
        for s in systems:
            url = f"{LIBRETRO}/{folder}/{urllib.parse.quote(s.dat)}.dat"
            try:
                info = download(url, metadat_root(cfg) / folder / f"{s.dat}.dat")
            except urllib.error.HTTPError:
                continue
            _record(cfg, f"metadat/{folder}/{s.dat}", info)
            got += 1
        log(f"  metadat   {folder:<14} {got}/{len(systems)} systems")
        ok += got
    return ok


def _region_rank(region: str | None) -> int:
    region = region or ""
    return IMAGE_REGIONS.index(region) if region in IMAGE_REGIONS else len(IMAGE_REGIONS)


def extract_launchbox(zip_path: Path, systems) -> tuple[dict[str, list[dict]], dict[str, dict]]:
    """Stream Metadata.xml and keep only the platforms, fields and images we use.

    Returns the games per system, and LaunchBox's facts about each platform.

    Only direct children of the root are cleared, and only once they close: an
    earlier version cleared every element as it ended, which wiped each
    <Platform> child before its parent <Game> was read and silently returned
    nothing for SG-1000.

    Images are separate <GameImage> records joined on DatabaseID, listed after
    every <Game>. Kept games are indexed by id as they stream past, so an image
    for any other game is dropped without being held. Per image type the most
    North American region wins, matching No-Intro's USA-first titles.
    """
    want = {s.launchbox: s.id for s in systems}
    out = {s.id: [] for s in systems}
    platforms: dict[str, dict] = {}
    by_id: dict[str, dict] = {}
    ranks: dict[tuple[str, str], int] = {}
    with zipfile.ZipFile(zip_path) as z, z.open("Metadata.xml") as f:
        depth, root = 0, None
        for event, el in ET.iterparse(f, events=("start", "end")):
            if event == "start":
                depth += 1
                if root is None:
                    root = el
                continue
            depth -= 1
            if depth != 1:
                continue
            if el.tag == "Game":
                sid = want.get(el.findtext("Platform") or "")
                if sid:
                    game = {k: el.findtext(k) for k in LAUNCHBOX_FIELDS if el.findtext(k)}
                    out[sid].append(game)
                    if game.get("DatabaseID"):
                        by_id[game["DatabaseID"]] = game
            elif el.tag == "GameImage":
                gid = el.findtext("DatabaseID") or ""
                key = LAUNCHBOX_IMAGES.get(el.findtext("Type") or "")
                name = el.findtext("FileName")
                if gid in by_id and key and name:
                    rank = _region_rank(el.findtext("Region"))
                    if rank < ranks.get((gid, key), len(IMAGE_REGIONS) + 1):
                        ranks[(gid, key)] = rank
                        by_id[gid][key] = name
            elif el.tag == "Platform":
                sid = want.get(el.findtext("Name") or "")
                if sid:
                    platforms[sid] = {k: el.findtext(k) for k in PLATFORM_FIELDS
                                      if el.findtext(k)}
            root.clear()
    for games in out.values():
        games.sort(key=lambda g: g.get("Name", "").lower())
    return out, platforms


def fetch_launchbox(cfg, systems, log=print, keep_zip=False, reuse_zip=False) -> int:
    zpath = cfg.reference / "launchbox" / "Metadata.zip"
    if reuse_zip and zpath.exists():
        log("  launchbox reading the Metadata.zip already in the reference folder")
    else:
        log("  launchbox downloading Metadata.zip (~100 MB)")
        info = download(LAUNCHBOX, zpath)
        _record(cfg, "launchbox/Metadata.zip", info)
    per, platforms = extract_launchbox(zpath, systems)
    for s in systems:
        write_json(launchbox_path(cfg, s), per[s.id])
        art = sum(1 for g in per[s.id] if g.get("BoxFront"))
        log(f"  launchbox {s.label:<14} {len(per[s.id]):>6} games, {art:>6} with box art")
    known = read_json(launchbox_platforms_path(cfg), {})
    write_json(launchbox_platforms_path(cfg), dict(sorted({**known, **platforms}.items())),
               indent=1)
    if not keep_zip and not reuse_zip:
        zpath.unlink(missing_ok=True)
    return sum(1 for g in per.values() if g)


def _env(cfg) -> dict:
    env = {k: v for k, v in os.environ.items() if k.startswith("KAGGLE")}
    dotenv = cfg.base / ".env"
    if dotenv.exists():
        for line in dotenv.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                k, v = k.strip(), v.strip().strip("'\"")
                if k.startswith("KAGGLE") and v:
                    env.setdefault(k, v)
    return env


def _kaggle_auth(env: dict) -> dict | None:
    if env.get("KAGGLE_API_TOKEN"):
        return {"Authorization": f"Bearer {env['KAGGLE_API_TOKEN']}"}
    if env.get("KAGGLE_USERNAME") and env.get("KAGGLE_KEY"):
        pair = f"{env['KAGGLE_USERNAME']}:{env['KAGGLE_KEY']}".encode()
        return {"Authorization": "Basic " + base64.b64encode(pair).decode()}
    return None


def normalise_vgchartz(text: str) -> list[dict]:
    rows = []
    for r in csv.DictReader(io.StringIO(text)):
        # The dataset ships placeholder rows: "The gamrReview Test Game" is
        # scored 10/10 on NES and would outrank every real cartridge.
        if re.search(r"\btest game\b", r.get("title", ""), re.I):
            continue
        m = re.search(r"\b(19\d{2}|20\d{2})\b", r.get("release_date") or "")
        r["release_year"] = m.group(1) if m else ""
        rows.append(r)
    return rows


def fetch_vgchartz(cfg, log=print) -> int:
    with tempfile.TemporaryDirectory() as d:
        zpath = Path(d) / "vgchartz.zip"
        try:
            info = download(KAGGLE, zpath)
            info["auth"] = "anonymous"
        except urllib.error.HTTPError as e:
            auth = _kaggle_auth(_env(cfg))
            if e.code not in (401, 403) or not auth:
                raise
            info = download(KAGGLE, zpath, headers=auth)
            info["auth"] = "credentials"
        with zipfile.ZipFile(zpath) as z:
            text = z.read(KAGGLE_MEMBER).decode("utf-8")
    rows = normalise_vgchartz(text)
    write_csv(vgchartz_path(cfg), rows, VGCHARTZ_COLUMNS)
    _record(cfg, "vgchartz/vgchartz.csv", {**info, "dataset": KAGGLE_DATASET,
                                           "member": KAGGLE_MEMBER, "rows": len(rows)})
    log(f"  vgchartz  {len(rows):,} rows ({info['auth']})")
    return 1


def fetch(cfg, what=WHAT, systems=None, log=print, keep_zip=False, reuse_zip=False) -> int:
    from ..systems import REGISTRY
    systems = (list(REGISTRY.values()) if systems is None
               else [REGISTRY[s] for s in systems if s in REGISTRY])
    done = 0
    if "nointro" in what:
        done += fetch_nointro(cfg, systems, log)
    if "metadat" in what:
        done += fetch_metadat(cfg, systems, log)
    if "launchbox" in what:
        done += fetch_launchbox(cfg, systems, log, keep_zip=keep_zip, reuse_zip=reuse_zip)
    if "vgchartz" in what:
        done += fetch_vgchartz(cfg, log)
    return done
