"""Scan: read every ROM once -- identify it, validate it, fingerprint it.

Identification tries, in order: the whole file, the system's canonical payload,
then any alternates the system offers (a trimmed headered image, an overdump
cut down to its real size). A file no hash places may still be recognisable by
name; it is then *unverified* -- the title is probably right, the bytes are
certainly not the preservation dump -- and never "identified".

Results are cached by size and modification time, and the cache for a system is
dropped whenever its DAT changes, so a rebuild of a 6.5 GB library that has not
changed takes seconds rather than minutes.
"""

from __future__ import annotations

import time
from collections import Counter
from pathlib import Path

from .. import sources
from ..dat import digests, load_dat
from ..io import read_json, write_json
from ..matching import TitleIndex, base_title, tidy_filename
from ..systems import REGISTRY

CACHE_VERSION = 4   # bump whenever inspect() or name guessing changes
REGION_RANK = ("USA", "World", "Europe", "Japan")


def iter_files(cfg, systems=None):
    """(library, system, path, relative posix path) for every candidate file."""
    for lib in cfg.libraries:
        for sid, folders in lib.systems.items():
            if systems and sid not in systems:
                continue
            system = REGISTRY[sid]
            seen = set()
            for folder in folders:
                base = lib.root / folder
                if not base.is_dir():
                    continue
                for p in sorted(base.rglob("*")):
                    rel = p.relative_to(lib.root)
                    if any(part.startswith(".") for part in rel.parts):
                        continue
                    if set(rel.parts) & set(lib.exclude):
                        continue
                    if not p.is_file() or not system.accepts(p):
                        continue
                    key = rel.as_posix()
                    if key not in seen:
                        seen.add(key)
                        yield lib, system, p, key


def _name_index(dat):
    def rank(m):
        n = m["name"]
        region = next((i for i, k in enumerate(REGION_RANK)
                       if f"({k}" in n or f", {k}" in n), len(REGION_RANK))
        return (region, "(Beta" in n or "(Proto" in n, len(n))
    return TitleIndex([{"title": base_title(n), "name": n} for n in dat.names],
                      prefer=rank, cutoff=0.90)


def inspect_file(system, path: Path, dat, names, library: str, rel: str) -> dict:
    row = {"system": system.id, "system_label": system.label, "library": library,
           "path": rel, "file": path.name, "size_bytes": path.stat().st_size}
    try:
        data, note = system.read(path)
    except OSError as e:
        data, note = None, f"unreadable: {e}"
    if data is None:
        row.update(ident="unreadable", verdict="fail", issues=f"fail: {note}",
                   title=tidy_filename(path.stem))
        return row

    ins = system.inspect(data)
    pd = digests(ins.payload)
    lookups = [(pd, "file")] if ins.payload is data else [(digests(data), "file"),
                                                           (pd, "payload")]
    hit, method, extra = None, "", {}
    for dig, how in lookups:
        hit = dat.lookup(dig)
        if hit:
            method = how
            break
    if not hit and ins.alternates:
        for blob, how, facts in ins.alternates():
            hit = dat.lookup(digests(blob))
            if hit:
                method, extra = how, facts
                break
    if extra.get("overdump"):
        ins.flag("warn", extra["overdump_note"])
        row["overdump"] = True

    row.update(payload_bytes=len(ins.payload), crc=pd["crc"], md5=pd["md5"],
               sha1=pd["sha1"], verdict=ins.verdict, issues="; ".join(ins.issues),
               notes="; ".join(x for x in (note, *ins.notes) if x),
               match_method=method)
    row.update(ins.facts)
    if hit:
        row.update(ident="identified", nointro_name=hit.name, region=hit.region,
                   serial=hit.serial, title=base_title(hit.name))
        return row
    guess = names.match(tidy_filename(path.stem), prefix=False) if names else None
    if guess:
        row.update(ident="unverified", match_method="name",
                   title_guess=guess.item["name"], title=guess.item["title"])
    else:
        row.update(ident="unmatched", title=tidy_filename(path.stem))
    return row


def _fingerprint(path: Path) -> str:
    try:
        st = path.stat()
        return f"{CACHE_VERSION}:{st.st_size}:{st.st_mtime_ns}"
    except FileNotFoundError:
        return f"{CACHE_VERSION}:missing"


def scan(cfg, systems=None, use_cache=True, log=print, progress=None):
    cache_path = cfg.workspace / "cache" / "scan.json"
    cache = read_json(cache_path, {}) if use_cache else {}
    if cache.get("version") != CACHE_VERSION:
        cache = {}
    old_files, old_dats = cache.get("files", {}), cache.get("dats", {})
    files, dat_prints, dats, names = {}, {}, {}, {}
    rows, stats = [], Counter()
    t0 = time.monotonic()

    for lib, system, path, rel in iter_files(cfg, systems):
        sid = system.id
        if sid not in dats:
            dpath = sources.nointro_path(cfg, system)
            dats[sid] = load_dat(dpath)
            names[sid] = _name_index(dats[sid]) if len(dats[sid]) else None
            dat_prints[sid] = _fingerprint(dpath)
            if not len(dats[sid]):
                log(f"  note: no DAT for {system.label} ({dpath.name}); "
                    "run `cartidx fetch nointro`")
        st = path.stat()
        key = f"{lib.name}|{sid}|{rel}"
        hit = old_files.get(key)
        if (hit and hit["size"] == st.st_size and hit["mtime"] == st.st_mtime_ns
                and old_dats.get(sid) == dat_prints[sid]):
            row = hit["row"]
            stats["cached"] += 1
        else:
            row = inspect_file(system, path, dats[sid], names[sid], lib.name, rel)
            stats["read"] += 1
            stats["bytes"] += st.st_size
        files[key] = {"size": st.st_size, "mtime": st.st_mtime_ns, "row": row}
        rows.append(row)
        if progress and len(rows) % 250 == 0:
            progress(len(rows), stats)

    if systems:   # a partial scan keeps what it did not look at
        for k, v in old_files.items():
            if k.split("|")[1] not in systems:
                files.setdefault(k, v)
        dat_prints = {**{k: v for k, v in old_dats.items() if k not in systems},
                      **dat_prints}
    write_json(cache_path, {"version": CACHE_VERSION, "dats": dat_prints, "files": files})
    stats["files"] = len(rows)
    stats["seconds"] = round(time.monotonic() - t0, 1)
    return rows, stats
