"""Export: CSV for people, SQLite for questions, a web page for browsing.

All three read their columns from schema.py, so none of them can quietly drop a
field the others carry. The SQLite file is the consolidated library: `games` is
the catalog, `roms` are file references, `inventory` and `prices` are yours.
"""

from __future__ import annotations

import os
import shutil
import sqlite3
from importlib.resources import files
from pathlib import Path

from ..io import write_csv, write_text
from ..schema import (GAME_COLUMNS, GAME_FIELDS, INVENTORY_EXPORT_COLUMNS,
                      INVENTORY_EXPORT_FIELDS, PRICE_COLUMNS, PRICE_FIELDS,
                      ROM_COLUMNS, ROM_FIELDS, cast, web_rows)

SQL_TYPE = {"s": "TEXT", "n": "REAL", "i": "INTEGER", "b": "INTEGER"}

VIEWS = {
    "collection_value": """
        SELECT system, system_label, COUNT(*) AS items, SUM(quantity) AS copies,
               ROUND(SUM(value), 2) AS value, ROUND(SUM(paid), 2) AS paid,
               SUM(rom_count > 0) AS with_rom
          FROM inventory GROUP BY system""",
    "wishlist": """
        SELECT system, system_label, title, rating_bayesian AS rating, rating_tier,
               loose_price, genre, year
          FROM games
         WHERE COALESCE(owned_count, 0) = 0
           AND rating_tier IN ('S - classic', 'A - great')
         ORDER BY rating_bayesian DESC""",
    "coverage": """
        SELECT system, system_label, COUNT(*) AS titles,
               SUM(COALESCE(owned_count, 0) > 0) AS owned,
               SUM(COALESCE(rom_count, 0) > 0) AS with_rom,
               ROUND(AVG(rating_bayesian), 2) AS rating,
               ROUND(SUM(CASE WHEN COALESCE(owned_count, 0) > 0
                              THEN loose_price END), 2) AS owned_value
          FROM games GROUP BY system, system_label""",
}


def write_sqlite(path: Path, games, rows, items, prices) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.unlink(missing_ok=True)
    con = sqlite3.connect(tmp)
    try:
        for name, fields, data in (("games", GAME_FIELDS, games),
                                   ("roms", ROM_FIELDS, rows),
                                   ("inventory", INVENTORY_EXPORT_FIELDS, items),
                                   ("prices", PRICE_FIELDS, prices)):
            cols = ", ".join(f'"{c}" {SQL_TYPE[k]}' for c, _key, k in fields)
            con.execute(f'CREATE TABLE "{name}" ({cols})')
            marks = ", ".join("?" for _ in fields)
            con.executemany(f'INSERT INTO "{name}" VALUES ({marks})', (
                [(int(v) if isinstance(v := cast(r.get(c), k), bool) else v)
                 for c, _key, k in fields] for r in data))
        con.execute("CREATE INDEX games_title ON games (system, title)")
        con.execute("CREATE INDEX roms_title ON roms (system, title)")
        for name, sql in VIEWS.items():
            con.execute(f"CREATE VIEW {name} AS {sql}")
        con.commit()
    finally:
        con.close()
    os.replace(tmp, path)


def write_web(out: Path, games, rows, items, prices) -> None:
    import json
    out.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(files("cartridge_index").joinpath("web/index.html"), out / "index.html")
    dump = lambda v: json.dumps(v, separators=(",", ":"))  # noqa: E731
    write_text(out / "data.js",
               "window.GAMES=" + dump(web_rows(games, GAME_FIELDS)) + ";\n"
               "window.ROMS=" + dump(web_rows(rows, ROM_FIELDS)) + ";\n"
               "window.INVENTORY=" + dump(web_rows(items, INVENTORY_EXPORT_FIELDS)) + ";\n"
               "window.PRICES=" + dump(web_rows(prices, PRICE_FIELDS)) + ";\n")


def write_all(cfg, games, rows, items, prices) -> dict[str, Path]:
    ws = cfg.workspace
    ordered = sorted(rows, key=lambda r: (r.get("system") or "", r.get("slug") or "",
                                          r.get("path") or ""))
    out = {"games": cfg.games, "catalog": cfg.catalog, "inventory": ws / "inventory.csv",
           "sqlite": ws / "cartridge.sqlite", "web": ws / "web" / "index.html"}
    write_csv(out["games"], games, GAME_COLUMNS)
    write_csv(out["catalog"], ordered, ROM_COLUMNS)
    write_csv(out["inventory"], items, INVENTORY_EXPORT_COLUMNS)
    write_sqlite(out["sqlite"], games, ordered, items, prices)
    write_web(ws / "web", games, ordered, items, prices)
    return out


def write_prices(cfg, prices) -> None:
    write_csv(cfg.prices, prices, PRICE_COLUMNS)
