"""Price guides: an OpenDocument spreadsheet (one sheet per platform) or a CSV.

Numbers come from each cell's office:value attribute, not its rendered text, so
"$1,422.96" arrives as 1422.96 without unpicking currency formatting. A
trailing empty cell can claim to repeat 16,384 times; repeats are capped.
"""

from __future__ import annotations

import csv
import re
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter
from pathlib import Path

from .. import platforms

NS = {"table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
      "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0"}
T = lambda t: "{%s}%s" % (NS["table"], t)   # noqa: E731
O = lambda t: "{%s}%s" % (NS["office"], t)  # noqa: E731
MAX_REPEAT = 256

# Sheets named for a platform rather than containing a platform column.
SHEET_PLATFORM = {
    "sega": "Sega Genesis", "nes": "NES", "snes": "SNES", "n64": "Nintendo 64",
    "gamecube": "GameCube", "gamecube prices": "GameCube", "wii": "Wii",
    "wii u": "Wii U", "switch": "Switch", "n64-ratings": "Nintendo 64",
    "snes ratings": "SNES", "ps1": "PlayStation", "ps2": "PlayStation 2",
    "ps3": "PlayStation 3", "ps4": "PlayStation 4", "ds": "Nintendo DS",
    "3ds": "Nintendo 3DS", "sega-ratings": "Sega Genesis",
}


def _cell(c):
    vt = c.get(O("value-type"))
    if vt in ("float", "currency", "percentage"):
        v = c.get(O("value"))
        if v not in (None, ""):
            try:
                f = float(v)
                return int(f) if f.is_integer() else f
            except ValueError:
                pass
    if vt == "date":
        return c.get(O("date-value")) or "".join(c.itertext()).strip()
    if vt == "boolean":
        return c.get(O("boolean-value"))
    return "".join(c.itertext()).strip()


def _rows(table):
    rows = []
    for r in table.findall(T("table-row")):
        rep_r = min(int(r.get(T("number-rows-repeated"), 1) or 1), MAX_REPEAT)
        vals = []
        for c in r:
            if c.tag not in (T("table-cell"), T("covered-table-cell")):
                continue
            rep = min(int(c.get(T("number-columns-repeated"), 1) or 1), MAX_REPEAT)
            vals.extend([_cell(c)] * rep)
        while vals and vals[-1] in ("", None):
            vals.pop()
        if vals:
            rows.extend([vals] * rep_r)
    return rows


def parse_ods(path: Path) -> dict[str, list[list]]:
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("content.xml"))
    return {t.get(T("name")): rows for t in root.iter(T("table"))
            if (rows := _rows(t))}


def _records(rows):
    header = [re.sub(r"\s+", " ", re.sub(r"[▲▼↑↓]", "", str(h))).strip()
              or f"col{i}" for i, h in enumerate(rows[0])]
    seen, cols = Counter(), []
    for h in header:
        seen[h] += 1
        cols.append(h if seen[h] == 1 else f"{h} {seen[h]}")
    for r in rows[1:]:
        rec = {c: (r[i] if i < len(r) else "") for i, c in enumerate(cols)}
        if any(str(v).strip() for v in rec.values()):
            yield rec


def money(v):
    if v in ("", None):
        return None
    if isinstance(v, (int, float)):
        return round(float(v), 2)
    s = re.sub(r"[^0-9.\-]", "", str(v))
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def _pick(rec, *names):
    low = {k.lower(): v for k, v in rec.items()}
    for n in names:
        v = low.get(n.lower())
        if v not in (None, ""):
            return v
    return ""


def read_price_guide(path: Path) -> list[dict]:
    path = Path(path)
    if path.suffix.lower() == ".csv":
        with open(path, newline="", encoding="utf-8-sig") as f:
            sheets = {path.stem: [row for row in csv.reader(f)]}
    else:
        sheets = parse_ods(path)
    out = []
    for name, rows in sheets.items():
        if len(rows) < 2:
            continue
        default = SHEET_PLATFORM.get(name.lower(), name)
        for rec in _records(rows):
            title = str(_pick(rec, "Title", "Game", "Name", "product-name")).strip()
            if not title:
                continue
            note = str(_pick(rec, "Notes", "Note")).strip()
            plat = str(_pick(rec, "Platform", "console-name", "Console") or default).strip()
            owned_col = str(_pick(rec, "Owned")).strip().lower()
            out.append({
                "platform": plat,
                "system": platforms.resolve(plat) or "",
                "title": title,
                "loose_price": money(_pick(rec, "Loose Price", "Loose", "loose-price")),
                "cib_price": money(_pick(rec, "CIB Price", "Complete", "cib-price")),
                "new_price": money(_pick(rec, "New Price", "new-price")),
                "paid": money(_pick(rec, "Paid", "Price Paid")),
                "owned": bool(re.search(r"\bown(ed)?\b", note, re.I))
                         or owned_col in ("yes", "y", "true", "1", "x"),
                "rating": str(_pick(rec, "Rating", "Score", "Grade", "metascore")).strip(),
                "publisher": str(_pick(rec, "Publisher")).strip(),
                "genre": str(_pick(rec, "genre(s)", "Genre")).strip(),
                "release_date": str(_pick(rec, "Release Date", "release_date", "Year")).strip(),
                "notes": note,
                "source_sheet": name,
            })
    return out
