"""cartidx -- maintain a retro game library and query it.

    cartidx init [--root DIR]         write cartridge.toml for selected platforms
    cartidx fetch                     download reference data (DATs, ratings, sales)
    cartidx prices import [file]      read your price-guide spreadsheet
    cartidx inventory import          seed the physical inventory from owned rows
    cartidx build                     identify file refs, enrich, export the catalog
    cartidx catalog                   list the games library
    cartidx serve                     browse analytics in a web page
    cartidx query "SELECT ..."        ask the SQLite catalog a question
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path

from . import __version__, config, platforms
from .io import read_csv, read_json
from .schema import PRICE_COLUMNS
from .systems import REGISTRY


def table(headers, rows, right=()):
    rows = [["" if c is None else str(c) for c in r] for r in rows]
    widths = [max([len(h)] + [len(r[i]) for r in rows]) for i, h in enumerate(headers)]

    def fmt(cells):
        return "  ".join(c.rjust(widths[i]) if i in right else c.ljust(widths[i])
                         for i, c in enumerate(cells)).rstrip()
    print(fmt(headers))
    print(fmt(["-" * w for w in widths]))
    for r in rows:
        print(fmt(r))


def pct(n, d):
    return f"{n / d * 100:.0f}%" if d else "-"


def _parse_csv_list(value):
    return [s.strip() for s in (value or "").split(",") if s.strip()]


# ---------------------------------------------------------------- commands

def cmd_init(a):
    out = Path(a.output)
    if out.exists() and not a.force:
        print(f"{out} exists; pass --force to replace it", file=sys.stderr)
        return 1
    scope = _parse_csv_list(a.systems)
    media = _parse_csv_list(a.media)
    known = set(REGISTRY) | set(platforms.PLATFORMS)
    bad = [s for s in scope if s not in known]
    if bad:
        print(f"unknown system(s): {', '.join(bad)}", file=sys.stderr)
        return 2
    allowed_media = {"cartridge", "disc", "console", "accessory", "floppy", "pcb", "directory"}
    bad_m = [m for m in media if m not in allowed_media]
    if bad_m:
        print(f"unknown media: {', '.join(bad_m)}", file=sys.stderr)
        return 2
    root = Path(a.root).expanduser().resolve() if a.root else None
    detected = {}
    if root:
        if not root.is_dir():
            print(f"not a directory: {root}", file=sys.stderr)
            return 1
        detected = config.detect_systems(root)
        if scope:
            detected = {k: v for k, v in detected.items() if k in scope}
    if not scope:
        scope = sorted(detected) or sorted(REGISTRY)
    out.write_text(config.render(root, detected, a.name,
                                 Path(a.workbook).expanduser() if a.workbook else None,
                                 scope, media or None),
                   encoding="utf-8")
    print(f"wrote {out}")
    table(["scope"], [[s] for s in scope])
    if detected:
        table(["system", "folders"], [[s, ", ".join(f)] for s, f in sorted(detected.items())])
    elif root:
        print("\nNo system folders recognised. Edit [libraries.systems] by hand; "
              "folders are matched on system ids: " + ", ".join(REGISTRY))
    print("\nnext: cartidx fetch && cartidx build")
    return 0


def cmd_systems(_cfg, a):
    table(["id", "label", "extensions", "no-intro DAT", "LaunchBox", "VGChartz"],
          [[s.id, s.label, " ".join(sorted(e or "(none)" for e in s.exts)), s.dat,
            s.launchbox, s.vgchartz or "-"] for s in REGISTRY.values()])
    return 0


def cmd_status(cfg, a):
    from . import sources
    from .stages.scan import iter_files
    print(f"config     {cfg.path}")
    print(f"workspace  {cfg.workspace}")
    print(f"reference  {cfg.reference}")
    print(f"collection {cfg.collection}")
    if cfg.systems:
        print(f"systems    {', '.join(cfg.systems)}")
    if cfg.media:
        print(f"media      {', '.join(cfg.media)}\n")
    else:
        print()
    if cfg.libraries:
        counts = Counter((lib.name, s.id) for lib, s, _p, _r in iter_files(cfg, cfg.filter_systems()))
        rows = []
        for lib in cfg.libraries:
            for sid, folders in sorted(lib.systems.items()):
                if cfg.systems and sid not in cfg.systems:
                    continue
                missing = [f for f in folders if not (lib.root / f).is_dir()]
                rows.append([lib.name, sid, counts[(lib.name, sid)], ", ".join(folders),
                             "MISSING " + ", ".join(missing) if missing else ""])
        table(["library", "system", "files", "folders", ""], rows, right={2})
    else:
        print("no ROM libraries configured (file references skipped)")

    print()
    have = read_json(sources.sources_path(cfg), {})
    ref = []
    wanted = cfg.systems or list(REGISTRY)
    for sid in wanted:
        if sid not in REGISTRY:
            continue
        s = REGISTRY[sid]
        ref.append([s.label, "yes" if sources.nointro_path(cfg, s).exists() else "-",
                    "yes" if (sources.metadat_root(cfg) / "genre" / f"{s.dat}.dat").exists() else "-",
                    "yes" if sources.launchbox_path(cfg, s).exists() else "-"])
    if ref:
        table(["reference", "no-intro", "metadat", "launchbox"], ref)
    print(f"vgchartz   {'yes' if sources.vgchartz_path(cfg).exists() else '-'}"
          + (f"   (last fetch {max(v.get('fetched', '') for v in have.values())})" if have else ""))
    print(f"\ninventory  {len(read_csv(cfg.inventory))} items   prices {len(read_csv(cfg.prices))} rows")
    games = read_csv(cfg.games)
    cat = read_csv(cfg.catalog)
    print(f"catalog    {len(games)} games, {len(cat)} file refs"
          + ("" if games else "   (run cartidx build)"))
    return 0


def cmd_fetch(cfg, a):
    from .sources import fetch
    what = set(a.what) if a.what and "all" not in a.what else set(fetch.WHAT)
    bad = what - set(fetch.WHAT)
    if bad:
        print(f"unknown source(s): {', '.join(bad)}; choose from {', '.join(fetch.WHAT)}",
              file=sys.stderr)
        return 2
    want = a.system if a.system else (list(cfg.systems) if cfg.systems else None)
    if want is not None:
        want = [s for s in want if s in REGISTRY]
    fetch.fetch(cfg, what, want, keep_zip=a.keep_zip, reuse_zip=a.reuse_zip)
    print(f"\nreference data in {cfg.reference}")
    return 0


def _progress(n, stats):
    print(f"  ... {n} files ({stats['cached']} cached)", flush=True)


def _scan_report(rows):
    per = defaultdict(Counter)
    for r in rows:
        c = per[r["system"]]
        c["files"] += 1
        c[r.get("ident")] += 1
        c["v_" + (r.get("verdict") or "")] += 1
        for k in ("rating_bayesian", "loose_price", "critic_score", "owned_count"):
            c[k] += r.get(k) not in (None, "")
    body = []
    for sid in REGISTRY:
        c = per.get(sid)
        if not c:
            continue
        body.append([REGISTRY[sid].label, c["files"], pct(c["identified"], c["files"]),
                     c["unverified"], c["unmatched"] + c["unreadable"],
                     f"{c['v_pass']}/{c['v_warn']}/{c['v_risky']}/{c['v_fail']}",
                     pct(c["rating_bayesian"], c["files"]), pct(c["loose_price"], c["files"]),
                     c["critic_score"], c["owned_count"]])
    if body:
        table(["system", "files", "verified", "unverified", "unmatched",
               "pass/warn/risky/fail", "rated", "priced", "critic", "owned"],
              body, right=set(range(1, 10)))


def _catalog_report(games):
    per = defaultdict(Counter)
    for g in games:
        c = per[g.get("system") or ""]
        c["titles"] += 1
        c["owned"] += 1 if (g.get("owned_count") or 0) not in (None, "", 0, "0") else 0
        c["roms"] += 1 if (g.get("rom_count") or 0) not in (None, "", 0, "0") else 0
        c["rated"] += g.get("rating_bayesian") not in (None, "")
    body = []
    for sid, c in sorted(per.items()):
        body.append([platforms.label(sid) if sid else sid, c["titles"], c["owned"],
                     c["roms"], c["rated"]])
    if body:
        print()
        table(["system", "games", "owned", "with file ref", "rated"], body, right={1, 2, 3, 4})


def cmd_scan(cfg, a):
    from .stages.scan import scan
    from .stages.tiers import mark_duplicates
    if not cfg.libraries:
        print("no ROM libraries configured; file references are optional", file=sys.stderr)
        return 1
    rows, st = scan(cfg, cfg.filter_systems(a.system), use_cache=not a.no_cache,
                    progress=_progress)
    mark_duplicates(rows)
    print(f"\n{st['files']} files, {st['read']} read ({st['bytes'] / 2**30:.2f} GB), "
          f"{st['cached']} from cache, {st['seconds']}s\n")
    _scan_report(rows)
    return 0


def _reachable(cfg) -> bool:
    return any(d.is_dir() for lib in cfg.libraries for sid in lib.systems
               for d in lib.folders(sid))


def _system_rows(cfg, games) -> list[dict]:
    from . import sources
    from .stages import catalog
    return catalog.systems(read_json(sources.launchbox_platforms_path(cfg), {}), games)


def cmd_build(cfg, a):
    from .stages import catalog, enrich, export, physical, scan, tiers
    systems = cfg.filter_systems(a.system)
    previous = read_csv(cfg.catalog) if cfg.libraries else []
    if cfg.libraries and previous and not _reachable(cfg):
        # An unplugged drive scans to nothing; that is not a library with no dumps.
        rows = previous
        print(f"no library folder is reachable (drives unmounted?); keeping the {len(rows)} "
              "file reference(s) from the last build instead of scanning to nothing")
    elif cfg.libraries:
        rows, st = scan.scan(cfg, systems, use_cache=not a.no_cache, progress=_progress)
        print(f"scanned {st['files']} files: {st['read']} read "
              f"({st['bytes'] / 2**30:.2f} GB), {st['cached']} cached, {st['seconds']}s")
        if a.system:
            rows += [r for r in previous if r["system"] not in a.system]
        tiers.mark_duplicates(rows)
        tiers.plan(rows)
    else:
        rows = []
        print("no ROM libraries configured; cataloguing inventory against reference data")
    prices = read_csv(cfg.prices)
    warnings = []
    if rows and not a.no_enrich:
        _stats, warnings = enrich.enrich(cfg, rows, prices)
    items = physical.link(rows, physical.load(cfg), prices)
    games = catalog.build(rows, items, cfg.systems or None, cfg.media)
    if not a.no_enrich:
        need = [g for g in games if g.get("system") in REGISTRY
                and g.get("rating_bayesian") in (None, "")]
        if need:
            _stats, extra = enrich.enrich(cfg, need, prices)
            warnings += extra
    out = export.write_all(cfg, games, rows, items, prices, _system_rows(cfg, games))
    print()
    _scan_report(rows)
    _catalog_report(games)
    for w in warnings:
        print(f"\nWARNING  {w}")
    print(f"\n{len(games)} game(s) in the catalog, {len(rows)} file ref(s)")
    for k, p in out.items():
        print(f"wrote {k:<9} {p}")
    return 0


def cmd_export(cfg, a):
    from .stages import catalog, export, physical
    rows = read_csv(cfg.catalog)
    prices = read_csv(cfg.prices)
    items = physical.link(rows, physical.load(cfg), prices)
    games = catalog.build(rows, items, cfg.systems, cfg.media)
    if not games and not rows:
        print("no catalog yet; run cartidx build", file=sys.stderr)
        return 1
    for k, p in export.write_all(cfg, games, rows, items, prices,
                                 _system_rows(cfg, games)).items():
        print(f"wrote {k:<9} {p}")
    return 0


def cmd_catalog(cfg, a):
    games = read_csv(cfg.games)
    if not games:
        print("no catalog yet; run cartidx build", file=sys.stderr)
        return 1
    if a.system:
        games = [g for g in games if g.get("system") in a.system]
    if a.owned:
        games = [g for g in games if str(g.get("owned_count") or "0") not in ("", "0")]
    if a.wishlist:
        games = [g for g in games if g.get("rating_tier") in ("S - classic", "A - great")
                 and str(g.get("owned_count") or "0") in ("", "0")]
    table(["system", "title", "year", "rating", "owned", "refs", "loose"],
          [[g.get("system"), (g.get("title") or "")[:40], g.get("year"),
            g.get("rating_bayesian"), g.get("owned_count") or "-",
            g.get("rom_count") or "-", g.get("loose_price")] for g in games],
          right={2, 3, 4, 5, 6})
    print(f"\n{len(games)} game(s)")
    return 0


def cmd_prices(cfg, a):
    from .sources.workbook import read_price_guide
    from .stages.export import write_prices
    path = Path(a.path).expanduser() if a.path else cfg.workbook
    if not path or not path.exists():
        print("no price guide: pass a path or set `workbook` in cartridge.toml", file=sys.stderr)
        return 1
    rows = read_price_guide(path)
    write_prices(cfg, rows)
    per = Counter(r["system"] or f"({r['platform']})" for r in rows)
    table(["system", "rows", "owned", "priced"],
          [[k, n, sum(1 for r in rows if (r["system"] or f"({r['platform']})") == k and r["owned"]),
            sum(1 for r in rows if (r["system"] or f"({r['platform']})") == k and r["loose_price"])]
           for k, n in per.most_common()], right={1, 2, 3})
    print(f"\nwrote {len(rows)} rows to {cfg.prices}")
    return 0


def cmd_inventory(cfg, a):
    from .stages import physical
    items = physical.load(cfg)
    if a.action == "import":
        prices = read_csv(cfg.prices)
        if not prices:
            print("no price guide imported; run cartidx prices import first", file=sys.stderr)
            return 1
        added, skipped = physical.import_owned(cfg, items, prices)
        physical.save(cfg, items)
        print(f"added {added} item(s), skipped {skipped} already present; "
              f"{len(items)} in {cfg.inventory}")
        return 0
    if a.action == "add":
        it = physical.add(cfg, items, system=a.system, title=a.title, format=a.format,
                          completeness=a.completeness, condition=a.condition,
                          region=a.region, quantity=a.quantity, paid=a.paid,
                          acquired=a.acquired, location=a.location, notes=a.notes,
                          source="cartidx inventory add")
        physical.save(cfg, items)
        print(f"added {it['id']}")
        return 0
    rows = read_csv(cfg.catalog)
    linked = physical.link(rows, items, read_csv(cfg.prices))
    if a.system:
        linked = [x for x in linked if x.get("system") in a.system]
    table(["id", "system", "title", "completeness", "paid", "value", "rom"],
          [[x["id"], x.get("system"), x.get("title", "")[:40], x.get("completeness"),
            x.get("paid"), x.get("value"), x.get("rom_count") or "-"] for x in linked],
          right={4, 5, 6})
    return 0


def cmd_serve(cfg, a):
    import functools
    import http.server
    web = cfg.workspace / "web"
    if not (web / "index.html").exists():
        print("no web export yet; run cartidx build", file=sys.stderr)
        return 1
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(web))
    with http.server.ThreadingHTTPServer((a.host, a.port), handler) as httpd:
        print(f"serving {web} at http://{a.host}:{a.port}/  (Ctrl+C to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
    return 0


def cmd_query(cfg, a):
    db = cfg.workspace / "cartridge.sqlite"
    if not db.exists():
        print("no database yet; run cartidx build", file=sys.stderr)
        return 1
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        cur = con.execute(a.sql)
    except sqlite3.Error as e:
        print(f"sqlite: {e}", file=sys.stderr)
        return 1
    headers = [d[0] for d in cur.description or []]
    rows = cur.fetchmany(a.limit)
    table(headers, rows)
    print(f"\n{len(rows)} row(s)")
    return 0


# ------------------------------------------------------------------ parser

def parser():
    ap = argparse.ArgumentParser(prog="cartidx", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", help="path to cartridge.toml (default: search upward)")
    ap.add_argument("--version", action="version", version=f"cartidx {__version__}")
    sub = ap.add_subparsers(dest="cmd", required=True)
    systems = dict(action="append", choices=sorted(set(REGISTRY) | set(platforms.PLATFORMS)),
                   metavar="SYSTEM", help="limit to a system (repeatable)")

    p = sub.add_parser("init", help="write cartridge.toml for a library")
    p.add_argument("--root", help="optional ROM library root; omit for a metadata-only library")
    p.add_argument("--name", default="main")
    p.add_argument("--systems", help="comma-separated platform ids to index")
    p.add_argument("--media", help="comma-separated types: cartridge, disc, floppy, pcb, directory, console, accessory")
    p.add_argument("--workbook")
    p.add_argument("--output", default=config.CONFIG_NAME)
    p.add_argument("--force", action="store_true")

    sub.add_parser("status", help="configuration, libraries and data at a glance")
    sub.add_parser("systems", help="supported systems")

    p = sub.add_parser("fetch", help="download reference data")
    p.add_argument("what", nargs="*", help="nointro metadat launchbox vgchartz (default all)")
    p.add_argument("--system", **systems)
    p.add_argument("--keep-zip", action="store_true", help="keep LaunchBox Metadata.zip")
    p.add_argument("--reuse-zip", action="store_true",
                   help="read a LaunchBox Metadata.zip already in the reference folder "
                        "instead of downloading it again")

    for name, text in (("scan", "identify file references, report only"),
                       ("build", "scan file refs, enrich and export the catalog")):
        p = sub.add_parser(name, help=text)
        p.add_argument("--system", **systems)
        p.add_argument("--no-cache", action="store_true", help="re-read every file")
        if name == "build":
            p.add_argument("--no-enrich", action="store_true")

    sub.add_parser("export", help="rewrite CSV, SQLite and web data from the catalog")

    p = sub.add_parser("catalog", help="list the games library")
    p.add_argument("--system", **systems)
    p.add_argument("--owned", action="store_true", help="only titles you own")
    p.add_argument("--wishlist", action="store_true", help="S/A-tier titles with no copy")

    p = sub.add_parser("prices", help="price guide")
    ps = p.add_subparsers(dest="action", required=True)
    pi = ps.add_parser("import", help="read a price-guide spreadsheet (.ods or .csv)")
    pi.add_argument("path", nargs="?")

    p = sub.add_parser("inventory", help="the physical collection")
    ps = p.add_subparsers(dest="action", required=True)
    ps.add_parser("import", help="add price-guide rows marked owned")
    pl = ps.add_parser("list", help="list items with value and ROM link")
    pl.add_argument("--system", action="append")
    pa = ps.add_parser("add", help="add an item")
    pa.add_argument("--system", required=True)
    pa.add_argument("--title", required=True)
    for f in ("format", "completeness", "condition", "region", "quantity", "paid",
              "acquired", "location", "notes"):
        pa.add_argument(f"--{f}")

    p = sub.add_parser("serve", help="browse the collection")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8765)

    p = sub.add_parser("query", help="run SQL against the catalog")
    p.add_argument("sql")
    p.add_argument("--limit", type=int, default=200)
    return ap


HANDLERS = {"status": cmd_status, "systems": cmd_systems, "fetch": cmd_fetch,
            "scan": cmd_scan, "build": cmd_build, "export": cmd_export,
            "catalog": cmd_catalog, "prices": cmd_prices, "inventory": cmd_inventory,
            "serve": cmd_serve, "query": cmd_query}


def main(argv=None) -> int:
    a = parser().parse_args(argv)
    if a.cmd == "init":
        return cmd_init(a)
    if a.cmd == "systems":        # answerable before any library is configured
        return cmd_systems(None, a)
    try:
        cfg = config.load(a.config)
    except config.ConfigError as e:
        print(f"cartidx: {e}", file=sys.stderr)
        return 2
    return HANDLERS[a.cmd](cfg, a)


__all__ = ["main", "PRICE_COLUMNS"]
