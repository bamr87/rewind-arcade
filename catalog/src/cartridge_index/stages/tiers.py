"""Tiers and names: how file references are classified in the catalog.

    library      English-playable, the best copy of each title
    regional     releases with no English text
    superseded   a lesser copy of a title already kept
    duplicate    byte-identical copies

`tier` is read from the folder a referenced file sits in. `plan_tier` and
`slug` are the copy's role and stable name in the catalog. Files are never
moved.

Names are slugs: lowercase, hyphenated, no punctuation, and honest about the
dump. A verified dump gets its bare title; the rest say what they are:
  -overdump           right game, padded image
  -unverified-dump    title recognised by name, bytes not the preservation dump
  -unidentified       nothing recognised it
  -dup-N              a byte-identical copy, numbered from 1
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from pathlib import PurePosixPath

from ..matching import base_title, slugify

HOLDING = {"_duplicates": "duplicate", "_regional": "regional",
           "_superseded": "superseded"}
FOLDER = {v: k for k, v in HOLDING.items()}

ENGLISH = {"USA", "World", "Europe", "Australia", "Canada", "UK", "Ireland",
           "New Zealand", "Scandinavia", "Brazil"}
LANGS = "En|Ja|Fr|De|Es|It|Pt|Nl|Sv|Zh|Ko|Da|No|Fi"
REGIONS = re.compile(
    r"\s*\((?:USA|Japan|Europe|World|Asia|Korea|Brazil|Australia|Canada|Spain|France|"
    r"Germany|Italy|Sweden|Netherlands|China|Taiwan|Hong Kong|Russia|Unknown|"
    r"New Zealand|Latin America|Scandinavia|UK|Ireland|Greece|Poland|Portugal|"
    r"Denmark|Norway|Finland)[^)]*\)", re.I)


def _true(v) -> bool:
    return v is True or str(v).lower() in ("true", "1", "yes")


def folder_tier(path: str) -> str:
    for part in PurePosixPath(path).parts:
        if part in HOLDING:
            return HOLDING[part]
    return "library"


def mark_duplicates(rows) -> None:
    """Byte-identical payloads within a system: one keeper, the rest duplicates.

    A copy already in a holding folder is never the keeper. Sorting by path
    alone once got this backwards -- "_duplicates/" sorts before real filenames
    -- which handed the keeper slot to the discarded copy and made 92 games,
    Punch-Out!! and Zelda among them, unreachable.
    """
    groups = defaultdict(list)
    for r in rows:
        r["tier"] = folder_tier(r["path"])
        r["duplicate_of"] = ""
        if r.get("sha1") and r.get("ident") != "unreadable":
            groups[(r["system"], r["sha1"])].append(r)
    for g in groups.values():
        if len(g) < 2:
            continue
        g.sort(key=lambda r: (folder_tier(r["path"]) != "library", r["path"]))
        for r in g[1:]:
            r["tier"] = "duplicate"
            r["duplicate_of"] = f"{g[0]['library']}:{g[0]['path']}"


def is_english(r) -> bool:
    """No region data is not evidence of being foreign; such rows stay put."""
    tags = re.findall(r"\(([^)]*)\)", r.get("nointro_name") or "")
    for t in tags[1:]:
        if re.fullmatch(rf"({LANGS})(,({LANGS}))*", t):
            return "En" in t.split(",")
    region = r.get("region") or ""
    return not region or any(p.strip() in ENGLISH for p in region.split(","))


def full_name(r) -> str:
    """The most specific name a file has earned.

    A hash match earns the full No-Intro name, tags and all. A name-only guess
    earns just the bare title: "(Proto)", "(Evercade)" or "(USA)" on a guessed
    name describe a dump nobody verified, and must not end up in a filename.
    """
    if r.get("nointro_name"):
        return r["nointro_name"]
    if r.get("title_guess"):
        return base_title(r["title_guess"])
    return r.get("title") or r.get("file", "")


def base_key(r) -> str:
    """The title a file collapses to once region, language and revision go."""
    n = full_name(r)
    n = REGIONS.sub("", n)
    n = re.sub(rf"\s*\((?:{LANGS})[^)]*\)", "", n)
    n = re.sub(r"\s*\((?:Rev [^)]*|v[\d.]+)\)", "", n, flags=re.I)
    return re.sub(r"\s{2,}", " ", n).strip()


def quality(r):
    """Lower is better: a verified dump that loads cleanly wins."""
    ident = {"identified": 0, "unverified": 1}.get(r.get("ident"), 2)
    verdict = {"pass": 0, "warn": 1, "risky": 2, "fail": 3}.get(r.get("verdict"), 1)
    name = r.get("nointro_name") or ""
    pre = bool(re.search(r"\((Proto|Beta|Demo|Sample)\b", name, re.I))
    pirate = bool(re.search(r"\((Pirate|Unl|Aftermarket)\b", name, re.I))
    rev = 0
    m = re.search(r"\(Rev (\w+)\)", name, re.I)
    if m:
        v = m.group(1)
        rev = -(int(v) if v.isdigit() else ord(v.upper()[0]) - 64)
    pref = ["USA", "World", "USA, Europe", "Japan, USA", "Europe"]
    region = r.get("region") or ""
    # Last before the path: a copy already in the library stays there. Without
    # this, two equal copies swap places on every run, because "_superseded/"
    # sorts before any filename -- the same trap the duplicate keeper fell into.
    return (ident, pre, pirate, verdict, _true(r.get("overdump")), rev,
            pref.index(region) if region in pref else len(pref),
            folder_tier(r.get("path", "")) != "library", r.get("path", ""))


def suffix(r) -> str:
    if _true(r.get("overdump")):
        return "-overdump"
    return {"identified": "", "unverified": "-unverified-dump"}.get(
        r.get("ident"), "-unidentified")


def plan(rows) -> None:
    groups = defaultdict(list)
    for r in rows:
        if r.get("ident") == "unreadable":
            r["plan_tier"] = r.get("tier", "library")
            r["slug"] = slugify(PurePosixPath(r["path"]).stem) or "rom"
        else:
            groups[(r["library"], r["system"])].append(r)
    for g in groups.values():
        _plan_group(g)


def _plan_group(group) -> None:
    used = Counter()

    def assign(r, tier, stem):
        stem = stem or slugify(PurePosixPath(r["path"]).stem) or "rom"
        used[(tier, stem)] += 1
        n = used[(tier, stem)]
        r["plan_tier"] = tier
        r["slug"] = stem if n == 1 else f"{stem}-{n}"

    dups = [r for r in group if r.get("tier") == "duplicate"]
    rest = [r for r in group if r.get("tier") != "duplicate"]
    keep = [r for r in rest if is_english(r)]
    regional = [r for r in rest if not is_english(r)]

    titles = defaultdict(list)
    for r in keep:
        titles[slugify(base_key(r))].append(r)
    for key in sorted(titles):
        members = sorted(titles[key], key=quality)
        assign(members[0], "library", slugify(base_key(members[0])) + suffix(members[0]))
        for r in members[1:]:
            assign(r, "superseded", slugify(full_name(r)) + suffix(r))
    for r in sorted(regional, key=quality):
        assign(r, "regional", slugify(full_name(r)) + suffix(r))
    # Duplicates are always numbered (-dup-1, -dup-2): the counter is what makes
    # a pile of identical copies addressable, and one rule beats two.
    dup_n = Counter()
    for r in sorted(dups, key=lambda r: r["path"]):
        stem = (slugify(base_key(r)) or slugify(PurePosixPath(r["path"]).stem) or "rom") + "-dup"
        dup_n[stem] += 1
        r["plan_tier"], r["slug"] = "duplicate", f"{stem}-{dup_n[stem]}"
