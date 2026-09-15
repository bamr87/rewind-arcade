"""The shape of every table this tool writes, defined once.

The previous incarnation wrote its web data from two scripts, each with its own
field list. A column added to one was silently dropped by the other, and the
browser lost the Kaggle sales and critic fields the moment validation ran. So
every consumer -- CSV, SQLite, the web tool -- reads its columns from here.

`games` is the library: one row per system and title. `roms` holds optional file
references (path, hashes, identification) and is never a maintenance plan.
"""

from __future__ import annotations

# (column, web key or None, kind)   kind: s=text, n=number, i=integer, b=boolean
ROM_FIELDS = [
    # identity
    ("system", "c", "s"), ("system_label", "cl", "s"), ("library", "lib", "s"),
    ("path", "p", "s"), ("file", None, "s"), ("slug", "s", "s"),
    ("title", "t", "s"), ("nointro_name", "n", "s"), ("title_guess", "tg", "s"),
    ("region", "rg", "s"), ("serial", "sr", "s"),
    # state
    ("ident", "id", "s"),          # identified | unverified | unmatched | unreadable
    ("match_method", "mm", "s"),   # file | payload | headered | overdump | name
    ("tier", "st", "s"),           # library | regional | superseded | duplicate
    ("plan_tier", "pt2", "s"),     # copy role in the catalog
    ("duplicate_of", None, "s"),
    ("verdict", "vd", "s"),        # pass | warn | risky | fail
    ("issues", "vi", "s"), ("notes", "nt", "s"),
    # bytes
    ("size_bytes", "sz", "i"), ("payload_bytes", None, "i"),
    ("crc", "crc", "s"), ("md5", None, "s"), ("sha1", None, "s"),
    # cartridge facts, per system
    ("mapper", "mp8", "s"), ("mapper_header", None, "s"), ("archaic_header", None, "b"),
    ("prg_16k", None, "i"), ("chr_8k", None, "i"), ("battery", None, "b"),
    ("reset_vector", None, "s"), ("trailing_bytes", None, "i"),
    ("header_junk", None, "s"), ("overdump", None, "b"),
    ("layout", None, "s"), ("internal_title", None, "s"), ("checksum", None, "s"),
    ("region_code", None, "s"), ("byte_order", None, "s"),
    # release metadata
    ("genre", "g", "s"), ("developer", "dv", "s"), ("publisher", "pub", "s"),
    ("year", "y", "i"), ("franchise", "fr", "s"), ("max_players", "mp", "i"),
    ("esrb", None, "s"), ("cooperative", None, "s"), ("wikipedia_url", "w", "s"),
    ("meta_source", None, "s"),
    # community rating (LaunchBox), shrunk per system
    ("community_rating", "cr", "n"), ("rating_votes", "rv", "i"),
    ("rating_bayesian", "rb", "n"), ("rating_tier", "rt", "s"),
    ("rating_match", None, "s"), ("lb_title", None, "s"),
    # market value (your price guide)
    ("loose_price", "l", "n"), ("cib_price", "cb", "n"), ("new_price", "nw", "n"),
    ("price_title", "pt", "s"), ("price_match", "pm", "s"),
    # VGChartz via Kaggle. sales_total is a FLOOR on known units, never a rank:
    # the source lost the figures for most of the biggest sellers.
    ("critic_score", "cs", "n"), ("sales_total", "sl", "n"), ("sales_na", "sna", "n"),
    ("sales_jp", "sjp", "n"), ("sales_pal", "spal", "n"), ("sales_other", None, "n"),
    ("vg_title", None, "s"), ("sales_match", "sm", "s"),
    # the physical collection
    ("owned_count", "oc", "i"), ("inventory_ids", "inv", "s"),
]
ROM_COLUMNS = [c for c, _k, _t in ROM_FIELDS]

GAME_FIELDS = [
    ("system", "c", "s"), ("system_label", "cl", "s"),
    ("title", "t", "s"), ("slug", "s", "s"), ("media", "me", "s"),
    ("region", "rg", "s"), ("serial", "sr", "s"),
    ("genre", "g", "s"), ("developer", "dv", "s"), ("publisher", "pub", "s"),
    ("year", "y", "i"), ("franchise", "fr", "s"), ("max_players", "mp", "i"),
    ("wikipedia_url", "w", "s"),
    ("community_rating", "cr", "n"), ("rating_votes", "rv", "i"),
    ("rating_bayesian", "rb", "n"), ("rating_tier", "rt", "s"),
    ("loose_price", "l", "n"), ("cib_price", "cb", "n"), ("new_price", "nw", "n"),
    ("price_title", "pt", "s"),
    ("critic_score", "cs", "n"), ("sales_total", "sl", "n"),
    ("sales_na", "sna", "n"), ("sales_jp", "sjp", "n"), ("sales_pal", "spal", "n"),
    ("owned_count", "oc", "i"), ("rom_count", "rc", "i"),
    ("verified", "vf", "b"), ("best_verdict", "vd", "s"),
]
GAME_COLUMNS = [c for c, _k, _t in GAME_FIELDS]

INVENTORY_FIELDS = [
    ("id", "id", "s"), ("system", "c", "s"), ("title", "t", "s"),
    ("format", "f", "s"),          # cartridge | disc | floppy | pcb | directory | console | accessory
    ("completeness", "cp", "s"),   # loose | cib | new | box-only | manual-only
    ("condition", "cd", "s"), ("region", "rg", "s"), ("quantity", "q", "i"),
    ("paid", "pd", "n"), ("acquired", "ac", "s"), ("location", "lo", "s"),
    ("notes", "nt", "s"), ("source", None, "s"),
]
INVENTORY_COLUMNS = [c for c, _k, _t in INVENTORY_FIELDS]

# What exporting adds to each inventory row.
INVENTORY_DERIVED = [
    ("system_label", "cl", "s"), ("value", "v", "n"), ("loose_price", "l", "n"),
    ("cib_price", "cb", "n"), ("new_price", "nw", "n"), ("price_title", "pt", "s"),
    ("rom_count", "rc", "i"), ("rom_slugs", "rs", "s"), ("rating_bayesian", "rb", "n"),
    ("rating_tier", "rt", "s"), ("genre", "g", "s"), ("year", "y", "i"),
    ("link_match", "lm", "s"),
]
INVENTORY_EXPORT_FIELDS = INVENTORY_FIELDS + INVENTORY_DERIVED
INVENTORY_EXPORT_COLUMNS = [c for c, _k, _t in INVENTORY_EXPORT_FIELDS]

PRICE_FIELDS = [
    ("platform", "p", "s"), ("system", "c", "s"), ("title", "t", "s"),
    ("loose_price", "l", "n"), ("cib_price", "cb", "n"), ("new_price", "nw", "n"),
    ("paid", "pd", "n"), ("owned", "o", "b"), ("rating", None, "s"),
    ("publisher", "pub", "s"), ("genre", None, "s"), ("release_date", None, "s"),
    ("notes", "nt", "s"), ("source_sheet", None, "s"),
]
PRICE_COLUMNS = [c for c, _k, _t in PRICE_FIELDS]


def cast(value, kind):
    if value in (None, ""):
        return None
    if kind == "s":
        return str(value)
    if kind == "b":
        return str(value).strip().lower() in ("1", "true", "yes", "y")
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return int(f) if kind == "i" else f


def web_rows(rows, fields):
    """Compact records for the browser: short keys, typed values, nulls dropped."""
    out = []
    for r in rows:
        d = {}
        for col, key, kind in fields:
            if key is None:
                continue
            v = cast(r.get(col), kind)
            if v is not None and v != "":
                d[key] = v
        out.append(d)
    return out


def web_keys(fields) -> dict[str, str]:
    return {key: col for col, key, _k in fields if key}
