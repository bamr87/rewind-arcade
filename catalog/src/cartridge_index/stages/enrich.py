"""Enrich: attach what the world knows about each title.

Sources are applied in order of how specific they are to the *dump*, and a
later source only ever fills a blank -- it never overwrites a better-curated
value:

  1. libretro metadata   keyed by the exact No-Intro name the hash matched
  2. LaunchBox           community ratings; release data by title
  3. VGChartz (Kaggle)   critic scores and sales by title
  4. your price guide    loose / complete / sealed value by title

Ratings are shrunk per system -- (votes x score + m x C) / (votes + m), with C
the vote-weighted mean of that platform and m its median vote count -- because
a 5.0 from one vote is not better than a 4.7 from a thousand, and an N64 4.0
and a Master System 4.0 are not drawn from the same population.

VGChartz's sales column is systematically missing the biggest sellers, so it is
imported as a floor on known units and a warning is raised on every run.
"""

from __future__ import annotations

import re
import statistics
from collections import Counter, defaultdict

from .. import sources
from ..dat import load_meta
from ..io import read_csv, read_json
from ..matching import TitleIndex
from ..systems import REGISTRY

TIERS = ((4.25, "S - classic"), (3.90, "A - great"), (3.50, "B - good"),
         (3.00, "C - average"))


def rating_tier(score: float) -> str:
    return next((name for floor, name in TIERS if score >= floor), "D - weak")


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _fill(r, col, val) -> bool:
    if val in (None, "") or r.get(col) not in (None, ""):
        return False
    r[col] = val
    return True


def bayesian_prior(games):
    rated = [(float(g["CommunityRating"]), int(float(g.get("CommunityRatingCount") or 0)))
             for g in games if _num(g.get("CommunityRating")) is not None]
    votes = [v for _s, v in rated] or [1]
    total = sum(votes)
    mean = sum(s * v for s, v in rated) / total if total else 3.5
    return mean, statistics.median(votes)


def enrich(cfg, rows, prices=(), log=print):
    stats = {}
    by_system = defaultdict(list)
    for r in rows:
        if r.get("ident") != "unreadable":
            by_system[r["system"]].append(r)

    vg = read_csv(sources.vgchartz_path(cfg))
    vg_by = defaultdict(list)
    for m in vg:
        vg_by[m.get("console", "")].append(m)
    priced = defaultdict(list)
    for p in prices:
        if any(_num(p.get(k)) is not None for k in ("loose_price", "cib_price", "new_price")):
            priced[p.get("system", "")].append(p)

    for sid, group in by_system.items():
        if sid not in REGISTRY:
            continue
        s = REGISTRY[sid]
        st = Counter(roms=len(group))

        meta = load_meta(sources.metadat_root(cfg), s.dat)
        if len(meta):
            for r in group:
                name = r.get("nointro_name") or r.get("title_guess") or ""
                got = [_fill(r, col, val) for col, val in meta.lookup(name).items()]
                if any(got):
                    r["meta_source"] = "libretro"
                    st["meta"] += 1

        games = read_json(sources.launchbox_path(cfg, s), [])
        if games:
            mean, m = bayesian_prior(games)
            st["prior_mean"], st["prior_votes"] = round(mean, 2), m
            ix = TitleIndex(games, title=lambda g: g.get("Name", ""),
                            prefer=lambda g: -_num(g.get("CommunityRatingCount") or 0))
            for r in group:
                hit = ix.match(r.get("title"), prefix=False)
                if not hit:
                    continue
                g = hit.item
                r["lb_title"], r["rating_match"] = g.get("Name", ""), hit.how
                for col, key in (("genre", "Genres"), ("developer", "Developer"),
                                 ("publisher", "Publisher"), ("max_players", "MaxPlayers"),
                                 ("esrb", "ESRB"), ("cooperative", "Cooperative"),
                                 ("wikipedia_url", "WikipediaURL"), ("overview", "Overview"),
                                 ("release_type", "ReleaseType"), ("video_url", "VideoURL"),
                                 ("launchbox_id", "DatabaseID"), ("box_art", "BoxFront"),
                                 ("logo_art", "ClearLogo"), ("title_art", "TitleShot"),
                                 ("cart_art", "CartFront")):
                    _fill(r, col, g.get(key))
                rd = g.get("ReleaseDate") or ""
                if re.match(r"^\d{4}", rd):
                    _fill(r, "year", rd[:4])
                if re.match(r"^\d{4}-\d{2}-\d{2}", rd):
                    _fill(r, "release_date", rd[:10])
                _fill(r, "year", g.get("ReleaseYear"))
                raw = _num(g.get("CommunityRating"))
                if raw is not None:
                    v = int(_num(g.get("CommunityRatingCount")) or 0)
                    score = (v * raw + m * mean) / (v + m)
                    r.update(community_rating=round(raw, 2), rating_votes=v,
                             rating_bayesian=round(score, 3), rating_tier=rating_tier(score))
                    st["rated"] += 1

        pool = vg_by.get(s.vgchartz or "", [])
        if pool:
            ix = TitleIndex(pool, prefer=lambda m: (
                0 if (m.get("total_sales") or "").strip() else 1,
                0 if (m.get("critic_score") or "").strip() else 1, len(m["title"])))
            for r in group:
                hit = ix.match(r.get("title"))
                if not hit:
                    continue
                m_ = hit.item
                r["vg_title"], r["sales_match"] = m_["title"], hit.how
                for col, key in (("genre", "genre"), ("publisher", "publisher"),
                                 ("developer", "developer"), ("year", "release_year")):
                    _fill(r, col, m_.get(key))
                if _num(m_.get("critic_score")) is not None:
                    r["critic_score"] = _num(m_["critic_score"])
                    st["critic"] += 1
                for col in ("total", "na", "jp", "pal", "other"):
                    val = _num(m_.get(f"{col}_sales"))
                    if val is not None:
                        r[f"sales_{col}"] = val
                if r.get("sales_total") not in (None, ""):
                    st["sales"] += 1
                st["vgchartz"] += 1

        # A year and month from libretro still date a title LaunchBox had no day for.
        for r in group:
            y, mo = _num(r.get("year")), _num(r.get("release_month"))
            if y and mo and 1 <= mo <= 12:
                _fill(r, "release_date", f"{int(y):04d}-{int(mo):02d}")

        pool = [p for pid in s.price_platforms for p in priced.get(pid, [])]
        if pool:
            ix = TitleIndex(pool, prefer=lambda p: (len(p["title"]), p["title"]))
            for r in group:
                hit = ix.match(r.get("title"), fuzzy=False)
                if not hit:
                    continue
                p = hit.item
                r.update(loose_price=_num(p.get("loose_price")),
                         cib_price=_num(p.get("cib_price")),
                         new_price=_num(p.get("new_price")),
                         price_title=p["title"], price_match=hit.how)
                st["priced"] += 1
        stats[sid] = st

    return stats, sales_warnings(vg, {REGISTRY[s].vgchartz for s in by_system})


def sales_warnings(vg, codes) -> list[str]:
    """Check the sales column against the source's own acclaim column.

    A cartridge the dataset scores 9+ and then leaves blank on sales is a hole,
    not a flop. When most of them are blank the column cannot be ranked.
    """
    pool = [m for m in vg if m.get("console") in codes]
    hi = [m for m in pool if (_num(m.get("critic_score")) or 0) >= 9]
    blank = [m for m in hi if _num(m.get("total_sales")) is None]
    if not hi or len(blank) <= len(hi) / 2:
        return []
    top = max(((_num(m.get("total_sales")), m["title"]) for m in pool
               if _num(m.get("total_sales")) is not None), default=(0, "-"))
    return [f"{len(blank)} of the {len(hi)} cartridges VGChartz itself scores 9+ have no "
            f"sales figure (e.g. {', '.join(m['title'] for m in blank[:3])}). Its largest "
            f"figure is {top[0]:g}M ({top[1]}). Treat sales_total as a floor on known "
            "units, never as a ranking."]
