"""clrmamepro DATs: No-Intro hash sets and libretro metadata sets.

Both use the same block syntax:

    game (
        name "Legend of Zelda, The (USA)"
        region "USA"
        rom ( name "Legend of Zelda, The (USA).nes" size 131088 crc ... sha1 ... )
    )

ROM names carry parentheses, so a rom line is read to the end of the line
rather than to the first ")". The NES set lists two rom lines per game (a
headered .nes and a headerless .unh); both are indexed.
"""

from __future__ import annotations

import hashlib
import re
import zlib
from dataclasses import dataclass
from pathlib import Path

GAME = re.compile(r"\bgame\s*\((.*?)\n\)", re.S)
ROM_LINE = re.compile(r"^\s*rom\s*\((.*)\)\s*$", re.M)


def digests(data: bytes) -> dict[str, str]:
    return {"sha1": hashlib.sha1(data).hexdigest(),
            "md5": hashlib.md5(data).hexdigest(),
            "crc": format(zlib.crc32(data) & 0xFFFFFFFF, "08x")}


def field(block: str, key: str) -> str:
    m = re.search(r'\b%s\s+"([^"]*)"' % re.escape(key), block)
    if m:
        return m.group(1)
    m = re.search(r"^\s*%s\s+([^\s()\"]+)\s*$" % re.escape(key), block, re.M)
    return m.group(1) if m else ""


def _rom_bodies(block: str) -> list[str]:
    bodies = ROM_LINE.findall(block)
    if not bodies:
        m = re.search(r"\brom\s*\((.*)", block, re.S)
        if m:
            bodies = [m.group(1)]
    return bodies


@dataclass
class DatEntry:
    name: str
    region: str
    serial: str
    size: int | None
    rom_name: str


class Dat:
    def __init__(self, path: Path | None = None):
        self.path = path
        self.version = ""
        self.by_hash: dict[tuple[str, str], DatEntry] = {}
        self.names: list[str] = []

    def __len__(self):
        return len(self.names)

    def lookup(self, dig: dict[str, str]) -> DatEntry | None:
        for algo in ("sha1", "md5", "crc"):
            hit = self.by_hash.get((algo, dig.get(algo, "")))
            if hit:
                return hit
        return None


def load_dat(path: Path) -> Dat:
    dat = Dat(path)
    path = Path(path)
    if not path.exists():
        return dat
    text = path.read_text(encoding="utf-8", errors="replace")
    head = re.search(r"\bclrmamepro\s*\((.*?)\n\)", text, re.S)
    if head:
        dat.version = field(head.group(1), "version")
    for block in GAME.findall(text):
        name = field(block, "name")
        if not name:
            continue
        dat.names.append(name)
        for body in _rom_bodies(block):
            size = re.search(r"\bsize\s+(\d+)", body)
            entry = DatEntry(name=name, region=field(block, "region"),
                             serial=field(block, "serial") or field(body, "serial"),
                             size=int(size.group(1)) if size else None,
                             rom_name=field(body, "name"))
            for algo in ("sha1", "md5", "crc"):
                m = re.search(r"\b%s\s+([0-9A-Fa-f]+)\b" % algo, body)
                if m:
                    dat.by_hash.setdefault((algo, m.group(1).lower()), entry)
    return dat


# libretro metadat/<folder>/<system>.dat -> (key inside the block, our column)
META_FIELDS = {
    "developer": ("developer", "developer"),
    "publisher": ("publisher", "publisher"),
    "genre": ("genre", "genre"),
    "releaseyear": ("releaseyear", "year"),
    "franchise": ("franchise", "franchise"),
    "maxusers": ("users", "max_players"),
    "esrb": ("esrb_rating", "esrb"),
    "serial": ("serial", "serial"),
    "releasemonth": ("releasemonth", "release_month"),
    "origin": ("origin", "origin"),
    "magazine/edge": ("edge_rating", "edge_rating"),
    "magazine/famitsu": ("famitsu_rating", "famitsu_rating"),
}


class Meta:
    """libretro metadata, joined by game name first and ROM CRC second.

    The metadata sets do not agree on CRCs -- serial.dat and genre.dat can key
    the same game on different ones -- so the name is the primary join.
    """

    def __init__(self):
        self.by_name: dict[str, dict] = {}
        self.by_crc: dict[str, dict] = {}

    def __len__(self):
        return len(self.by_name)

    def lookup(self, name: str = "", crc: str = "") -> dict:
        out = dict(self.by_crc.get(crc.lower(), {})) if crc else {}
        out.update(self.by_name.get(name, {}))
        return out


def load_meta(root: Path, dat_stem: str) -> Meta:
    meta = Meta()
    for folder, (key, col) in META_FIELDS.items():
        path = Path(root) / folder / f"{dat_stem}.dat"
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for block in GAME.findall(text):
            val = field(block, key)
            if not val:
                continue
            name = field(block, "comment") or field(block, "name")
            if name:
                meta.by_name.setdefault(name, {})[col] = val
            for body in _rom_bodies(block):
                m = re.search(r"\bcrc\s+([0-9A-Fa-f]+)\b", body)
                if m:
                    meta.by_crc.setdefault(m.group(1).lower(), {})[col] = val
    return meta
