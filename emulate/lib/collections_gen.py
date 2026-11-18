#!/usr/bin/env python3
"""Frontend custom collections from collection definitions: groupings across consoles.

    collections_gen.py <metadata-dir> <roms-dir> <collections-dir>
                       --defs <dir> [--defs <dir> ...] [--settings es_settings.xml]
                       [--dry-run] [--list]

A collection is one YAML file, so adding one is dropping a file in a definitions
directory (config/collections/, an extension pack's collections/, or your own
config/collections.local/). A later directory's file with the same name replaces
an earlier one, and `enabled: false` turns a shipped one off:

    name: "Top Rated"                 # shown in the frontend
    description: "..."                # for people; ignored
    enabled: true                     # default true
    match:                            # which games belong (optional: all of them)
      field: tier
      regex: "^[SA]"
    group_by:                         # optional: one collection per value
      field: genre                    #   name may then use {value}
      split: ";"                      #   several values in one field
      as: decade                      #   or year: derived from releasedate
    min: 8                            # smallest collection written (default 1)

A condition is a leaf or a combination:

    {field: F, equals: V} {field: F, in: [V, ...]} {field: F, regex: R}
    {field: F, gte: N} {field: F, lte: N} {field: F, exists: true}
    {all: [cond, ...]} {any: [cond, ...]} {not: cond}

Fields are the import metadata (name, desc, rating, releasedate, developer,
publisher, genre, players, kidgame, franchise, tier, cooperative, esrb, ident,
release_type, nointro) plus `file` (the ROM's path under roms/<system>/),
`system` and `year`. Text tests ignore case.

The metadata is the per-system JSON `retropi roms import --metadata` keeps. Each
collection is written as `custom-<Name>.cfg`, one absolute ROM path per line,
the format ES-DE reads. Only collections this tool wrote (listed in
.retropi-collections) are ever replaced or removed.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

OWNED = ".retropi-collections"


class DefinitionError(ValueError):
    pass


# --- definitions -----------------------------------------------------------------

def load_definitions(dirs: list[str]) -> dict[str, dict]:
    """{id: definition}, later directories overriding earlier ones by file name."""
    import yamlite
    defs: dict[str, dict] = {}
    for d in dirs:
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            if not f.endswith((".yaml", ".yml")):
                continue
            path = os.path.join(d, f)
            try:
                data = yamlite.load_file(path) or {}
            except Exception as e:                       # noqa: BLE001 - report which file
                raise DefinitionError(f"{path}: {e}") from e
            if not isinstance(data, dict):
                raise DefinitionError(f"{path}: not a mapping")
            data["_source"] = path
            defs[os.path.splitext(f)[0]] = data
    for cid, d in defs.items():
        if d.get("enabled", True) is not False and not d.get("name"):
            raise DefinitionError(f"{d['_source']}: no name")
    return defs


# --- conditions ------------------------------------------------------------------

def _year(fields: dict) -> int | None:
    m = re.match(r"(\d{4})", str(fields.get("releasedate") or ""))
    return int(m.group(1)) if m else None


def _num(v) -> float | None:
    try:
        return float(str(v).split("-")[-1])           # "1-4" players -> 4
    except (TypeError, ValueError):
        return None


def test(cond, game: dict) -> bool:
    if cond is None:
        return True
    if not isinstance(cond, dict):
        raise DefinitionError(f"a condition must be a mapping, not {cond!r}")
    if "all" in cond:
        return all(test(c, game) for c in cond["all"])
    if "any" in cond:
        return any(test(c, game) for c in cond["any"])
    if "not" in cond:
        return not test(cond["not"], game)
    field = cond.get("field")
    if not field:
        raise DefinitionError(f"a condition needs a field: {cond!r}")
    val = game.get(field)
    text = "" if val is None else str(val).strip()
    if "exists" in cond:
        return bool(text) == bool(cond["exists"])
    if "equals" in cond:
        return text.lower() == str(cond["equals"]).lower()
    if "in" in cond:
        return text.lower() in {str(v).lower() for v in cond["in"]}
    if "regex" in cond:
        return bool(re.search(str(cond["regex"]), text, re.IGNORECASE))
    if "gte" in cond or "lte" in cond:
        n = _num(text)
        if n is None:
            return False
        return (n >= float(cond.get("gte", n))) and (n <= float(cond.get("lte", n)))
    raise DefinitionError(f"no test in condition {cond!r}")


def _values(game: dict, group: dict) -> list[str]:
    raw = game.get(group.get("field", ""))
    if group.get("as") in ("decade", "year"):
        y = game.get("year")
        if not y or not 1970 <= y < 2030:
            return []
        return [f"{y // 10 * 10}s" if group["as"] == "decade" else str(y)]
    if raw in (None, ""):
        return []
    parts = str(raw).split(group["split"]) if group.get("split") else [str(raw)]
    return [p.strip() for p in parts if p.strip()]


def _safe(name: str) -> str:
    """A collection name that is also a portable file name."""
    return re.sub(r"\s+", " ", re.sub(r'[/\\:*?"<>|]', "-", name)).strip()


# --- building --------------------------------------------------------------------

def games(meta: dict[str, dict[str, dict]], roms_dir: str):
    """(path, fields) for every game in the metadata that is still on disk."""
    for system, entries in sorted(meta.items()):
        for rel, f in sorted(entries.items()):
            path = os.path.join(roms_dir, system, rel)
            if os.path.lexists(path):
                yield path, {**f, "file": rel, "system": system, "year": _year(f)}


def groupings(meta, roms_dir: str, defs: dict[str, dict]) -> dict[str, list[str]]:
    groups: dict[str, set] = defaultdict(set)
    floors: dict[str, int] = {}
    active = {cid: d for cid, d in defs.items() if d.get("enabled", True) is not False}
    for path, g in games(meta, roms_dir):
        for cid, d in active.items():
            if not test(d.get("match"), g):
                continue
            group = d.get("group_by")
            names = ([str(d["name"]).replace("{value}", v) for v in _values(g, group)]
                     if group else [str(d["name"])])
            for n in names:
                n = _safe(n)
                groups[n].add(path)
                floors[n] = int(d.get("min", 1))
    return {n: sorted(p) for n, p in sorted(groups.items()) if len(p) >= floors[n]}


def load(meta_dir: str) -> dict[str, dict[str, dict]]:
    meta = {}
    if not os.path.isdir(meta_dir):
        return meta
    for f in sorted(os.listdir(meta_dir)):
        if f.endswith(".json"):
            with open(os.path.join(meta_dir, f), encoding="utf-8") as fh:
                data = json.load(fh)
            if isinstance(data, dict):
                meta[f[:-5]] = data
    return meta


def write(groups: dict[str, list[str]], out_dir: str, dry_run: bool = False) -> tuple[int, set]:
    owned_path = os.path.join(out_dir, OWNED)
    owned = set()
    if os.path.exists(owned_path):
        with open(owned_path, encoding="utf-8") as fh:
            owned = {ln.strip() for ln in fh if ln.strip()}
    stale = owned - set(groups)
    if dry_run:
        return len(groups), stale
    os.makedirs(out_dir, exist_ok=True)
    for name, paths in groups.items():
        path = os.path.join(out_dir, f"custom-{name}.cfg")
        if os.path.exists(path) and name not in owned:
            continue                      # a collection the user made; never ours to replace
        with open(path + ".tmp", "w", encoding="utf-8") as fh:
            fh.write("".join(p + "\n" for p in paths))
        os.replace(path + ".tmp", path)
        owned.add(name)
    for name in sorted(stale):
        try:
            os.unlink(os.path.join(out_dir, f"custom-{name}.cfg"))
        except FileNotFoundError:
            pass
        owned.discard(name)
    with open(owned_path, "w", encoding="utf-8") as fh:
        fh.write("".join(n + "\n" for n in sorted(owned)))
    return len(groups), stale


def enable(settings: str, groups: dict, stale: set) -> str:
    """CollectionSystemsCustom = the user's own collections, then ours."""
    import es_settings
    current = [n for n in (es_settings.get(settings, "CollectionSystemsCustom") or "").split(",") if n]
    keep = [n for n in current if n not in stale and n not in groups]
    value = ",".join(keep + list(groups))
    es_settings.merge(settings, {"CollectionSystemsCustom": value})
    return value


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("metadata_dir")
    ap.add_argument("roms_dir")
    ap.add_argument("collections_dir")
    ap.add_argument("--defs", action="append", default=[], help="definitions directory (repeatable)")
    ap.add_argument("--settings", help="es_settings.xml whose CollectionSystemsCustom to update")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--list", action="store_true", help="print the definitions and exit")
    a = ap.parse_args(argv)
    try:
        defs = load_definitions(a.defs)
        if a.list:
            for cid, d in defs.items():
                state = "off" if d.get("enabled", True) is False else "on"
                print(f"{cid}\t{state}\t{d.get('name', '')}\t{d['_source']}")
            return 0
        groups = groupings(load(a.metadata_dir), a.roms_dir, defs)
    except DefinitionError as e:
        print(f"collections: {e}", file=sys.stderr)
        return 2
    wrote, stale = write(groups, a.collections_dir, a.dry_run)
    if a.settings and not a.dry_run:
        enable(a.settings, groups, stale)
    for name, paths in groups.items():
        print(f"{name}\t{len(paths)}")
    print(f"{wrote} collections, {len(stale)} stale {'would be ' if a.dry_run else ''}removed",
          file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
