"""Games catalog: one row per system and title.

ROM files stay as references -- path, hashes, identification -- and are never
moved. The catalog is the library: titles you track, copies you own, and what
the reference sources know about them.
"""

from __future__ import annotations

from collections import Counter, defaultdict

from ..matching import norm, slugify
from ..platforms import label, media as platform_media
from ..schema import GAME_COLUMNS

COPY = (
    "title", "region", "serial", "genre", "developer", "publisher", "year",
    "franchise", "max_players", "wikipedia_url", "community_rating", "rating_votes",
    "rating_bayesian", "rating_tier", "loose_price", "cib_price", "new_price",
    "price_title", "critic_score", "sales_total", "sales_na", "sales_jp", "sales_pal",
    "nointro_name", "release_date", "release_type", "origin", "esrb", "overview",
    "video_url", "launchbox_id", "edge_rating", "famitsu_rating",
    "box_art", "logo_art", "title_art", "cart_art",
)
VERDICT_RANK = {"pass": 0, "warn": 1, "risky": 2, "fail": 3}


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _pick(members, col):
    for m in members:
        if m.get(col) not in (None, ""):
            return m[col]
    return None


def _quality(r):
    ident = {"identified": 0, "unverified": 1}.get(r.get("ident"), 2)
    verdict = VERDICT_RANK.get(r.get("verdict"), 3)
    return (ident, verdict, r.get("plan_tier") != "library", r.get("path") or "")


def _blank() -> dict:
    return {c: None for c in GAME_COLUMNS}


def collapse(rows) -> list[dict]:
    groups = defaultdict(list)
    for r in rows:
        title = (r.get("title") or "").strip()
        if not title or r.get("ident") == "unreadable":
            continue
        groups[(r["system"], norm(title))].append(r)
    games = []
    for (sid, _key), members in groups.items():
        members = sorted(members, key=_quality)
        refs = [m for m in members if m.get("tier") != "duplicate"]
        qty = 0
        for m in members:
            n = _num(m.get("owned_count"))
            if n:
                qty = max(qty, int(n))
        best_v = min((VERDICT_RANK.get(m.get("verdict"), 3) for m in (refs or members)),
                     default=3)
        slug = next((m.get("slug") for m in members
                     if m.get("plan_tier") == "library" and m.get("slug")), None)
        game = _blank()
        game.update(system=sid, system_label=members[0].get("system_label") or label(sid),
                    slug=slug or members[0].get("slug") or slugify(members[0]["title"]),
                    media=platform_media(sid) or "cartridge",
                    owned_count=qty, rom_count=len(refs),
                    verified=any(m.get("ident") == "identified" for m in members),
                    best_verdict={0: "pass", 1: "warn", 2: "risky", 3: "fail"}[best_v])
        for col in COPY:
            game[col] = _pick(members, col)
        games.append(game)
    return games


def add_owned(games, items) -> list[dict]:
    have = {(g["system"], norm(g.get("title") or "")) for g in games}
    for it in items:
        title = (it.get("title") or "").strip()
        sid = it.get("system") or ""
        if not title or not sid:
            continue
        key = (sid, norm(title))
        if key in have:
            continue
        qty = int(_num(it.get("quantity")) or 1)
        game = _blank()
        game.update(system=sid, system_label=it.get("system_label") or label(sid),
                    title=title, slug=slugify(title),
                    media=it.get("format") or platform_media(sid),
                    genre=it.get("genre"), year=it.get("year"),
                    rating_bayesian=it.get("rating_bayesian"),
                    rating_tier=it.get("rating_tier"),
                    loose_price=it.get("loose_price"), cib_price=it.get("cib_price"),
                    new_price=it.get("new_price"), price_title=it.get("price_title"),
                    owned_count=qty, rom_count=int(_num(it.get("rom_count")) or 0),
                    verified=False, best_verdict=None)
        games.append(game)
        have.add(key)
    return games


def build(rows, items, systems=None, media=None) -> list[dict]:
    games = add_owned(collapse(rows), items)
    if systems:
        want = set(systems)
        games = [g for g in games if g["system"] in want]
    if media:
        want = set(media)
        games = [g for g in games if (g.get("media") or "") in want]
    games.sort(key=lambda g: (g.get("system") or "", (g.get("title") or "").lower()))
    return games


def systems(platforms: dict, games) -> list[dict]:
    """One row per system in the catalog: LaunchBox's platform facts beside its counts."""
    counts = defaultdict(Counter)
    labels = {}
    for g in games:
        sid = g.get("system") or ""
        if not sid:
            continue
        c = counts[sid]
        c["titles"] += 1
        c["owned"] += bool(_num(g.get("owned_count")))
        c["rom"] += bool(_num(g.get("rom_count")))
        labels.setdefault(sid, g.get("system_label"))
    rows = []
    for sid in sorted(counts):
        p, c = platforms.get(sid, {}), counts[sid]
        rows.append({
            "system": sid, "system_label": labels.get(sid) or label(sid),
            "launchbox_platform": p.get("Name"), "manufacturer": p.get("Manufacturer"),
            "developer": p.get("Developer"),
            "release_date": (p.get("ReleaseDate") or "")[:10] or None,
            "media": p.get("Media") or platform_media(sid), "cpu": p.get("Cpu"),
            "memory": p.get("Memory"), "graphics": p.get("Graphics"), "sound": p.get("Sound"),
            "display": p.get("Display"), "max_controllers": p.get("MaxControllers"),
            "overview": p.get("Notes"), "titles": c["titles"], "owned_titles": c["owned"],
            "titles_with_rom": c["rom"]})
    return rows
