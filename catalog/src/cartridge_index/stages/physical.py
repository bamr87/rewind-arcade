"""The physical collection: what is on the shelf, what it is worth, and
whether there is a ROM of it.

collection/inventory.csv is yours. This module reads it, adds to it only when
asked (`cartidx inventory import` / `add`), and never rewrites what you typed.
Everything derived -- value, the ROM link, the rating -- goes to the workspace.

One row is one item. `quantity` covers identical copies; a boxed copy and a
loose copy of the same game are two rows, because they are worth different
amounts. `completeness` picks the price: new -> sealed value, cib -> complete,
anything else -> loose.
"""

from __future__ import annotations

from collections import defaultdict

from .. import platforms
from ..io import read_csv, write_csv
from ..matching import TitleIndex, norm, slugify
from ..schema import INVENTORY_COLUMNS
from ..systems import REGISTRY

PRICE_FOR = {"new": "new_price", "sealed": "new_price", "cib": "cib_price",
             "complete": "cib_price"}


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def load(cfg) -> list[dict]:
    return read_csv(cfg.inventory)


def save(cfg, items) -> None:
    write_csv(cfg.inventory, items, INVENTORY_COLUMNS)


def _new_id(system, title, taken) -> str:
    base = f"{system or 'item'}-{slugify(title, 60) or 'untitled'}"
    ident, n = base, 1
    while ident in taken:
        n += 1
        ident = f"{base}-{n}"
    taken.add(ident)
    return ident


def add(cfg, items, **fields) -> dict:
    taken = {i["id"] for i in items}
    item = {c: "" for c in INVENTORY_COLUMNS}
    item.update({k: v for k, v in fields.items() if v not in (None, "")})
    item["system"] = platforms.resolve(item["system"]) or item["system"]
    item["id"] = _new_id(item["system"], item["title"], taken)
    item["format"] = item["format"] or platforms.media(item["system"])
    item["quantity"] = item["quantity"] or 1
    items.append(item)
    return item


def import_owned(cfg, items, prices) -> tuple[int, int]:
    """Seed the inventory from price-guide rows marked owned. Idempotent."""
    have = {(i.get("system", ""), norm(i.get("title", ""))) for i in items}
    added = skipped = 0
    for p in prices:
        if str(p.get("owned")).lower() not in ("true", "1", "yes"):
            continue
        key = (p.get("system", ""), norm(p.get("title", "")))
        if not key[1] or key in have:
            skipped += 1
            continue
        add(cfg, items, system=p.get("system") or p.get("platform", ""),
            title=p["title"], paid=p.get("paid"), notes=p.get("notes"),
            source=f"price guide: {p.get('source_sheet', '')}")
        have.add(key)
        added += 1
    return added, skipped


def link(rows, items, prices) -> list[dict]:
    """Join inventory to ROMs and prices. Sets owned_count on the ROM rows."""
    roms = defaultdict(list)
    for r in rows:
        r["owned_count"], r["inventory_ids"] = None, ""
        if r.get("ident") != "unreadable" and r.get("tier") != "duplicate":
            roms[r["system"]].append(r)
    rom_ix = {sid: TitleIndex(rs, prefer=lambda r: (
        r.get("tier") != "library", r.get("ident") != "identified",
        r.get("verdict") != "pass", r["path"])) for sid, rs in roms.items()}

    priced = defaultdict(list)
    for p in prices:
        if any(_num(p.get(k)) is not None for k in ("loose_price", "cib_price", "new_price")):
            priced[p.get("system", "")].append(p)
    price_ix = {}

    out = []
    for it in items:
        x = dict(it)
        sid = it.get("system", "")
        qty = int(_num(it.get("quantity")) or 1)
        x["system_label"] = platforms.label(sid)

        ix = rom_ix.get(sid)
        hit = ix.match(it.get("title")) if ix else None
        if hit:
            key = norm(hit.item["title"])
            sibs = [r for r in roms[sid] if norm(r["title"]) == key]
            x.update(rom_count=len(sibs), rom_slugs="; ".join(r["slug"] for r in sibs),
                     link_match=hit.how, rating_bayesian=hit.item.get("rating_bayesian"),
                     rating_tier=hit.item.get("rating_tier"),
                     genre=hit.item.get("genre"), year=hit.item.get("year"))
            for r in sibs:
                r["owned_count"] = (r["owned_count"] or 0) + qty
                r["inventory_ids"] = "; ".join(filter(None, (r["inventory_ids"], it["id"])))
        else:
            x["rom_count"] = 0

        plats = REGISTRY[sid].price_platforms if sid in REGISTRY else (sid,)
        if sid not in price_ix:
            pool = [p for pid in plats for p in priced.get(pid, [])]
            price_ix[sid] = TitleIndex(pool, prefer=lambda p: (len(p["title"]), p["title"])) \
                if pool else None
        ph = price_ix[sid].match(it.get("title"), fuzzy=False) if price_ix[sid] else None
        if ph:
            p = ph.item
            x.update(loose_price=_num(p.get("loose_price")), cib_price=_num(p.get("cib_price")),
                     new_price=_num(p.get("new_price")), price_title=p["title"])
            col = PRICE_FOR.get((it.get("completeness") or "").strip().lower(), "loose_price")
            unit = x.get(col) if x.get(col) is not None else x.get("loose_price")
            x["value"] = round(unit * qty, 2) if unit is not None else None
        out.append(x)
    return out
