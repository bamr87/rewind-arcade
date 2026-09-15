"""Sega's 8-bit systems: Master System, Game Gear, SG-1000.

SMS and Game Gear cartridges carry "TMR SEGA" at $7FF0, $3FF0 or $1FF0 with a
region code and size. SG-1000 software predates the header, so its absence is
normal there.

One folder often holds all three: the reference library's Master System folder
turned out to hold 310 SMS cartridges and 63 SG-1000 / SC-3000 / SF-7000 ones.
Scanning those against the SMS database could never match them; giving
SG-1000 its own system lifted SMS identification from 71% to 85%.
"""

from __future__ import annotations

from .base import Inspection, System

REGIONS = {3: "SMS Japan", 4: "SMS Export", 5: "GG Japan", 6: "GG Export",
           7: "GG International"}


class _Sega8(System):
    """The header occupies the 16 bytes from its offset, so a 32KB cartridge
    with its header at $7FF0 ends exactly at the header's last byte. The
    original check demanded the image be *longer* than that, and so reported
    every 32KB cartridge -- the most common size -- as headerless."""

    manufacturer = "Sega"
    headerless_ok = False

    def inspect(self, data: bytes) -> Inspection:
        ins = Inspection(payload=data)
        off = next((c for c in (0x7FF0, 0x3FF0, 0x1FF0)
                    if len(data) >= c + 16 and data[c:c + 8] == b"TMR SEGA"), None)
        if off is None:
            if self.headerless_ok:
                ins.note("no 'TMR SEGA' header (normal for SG-1000 software)")
            else:
                ins.flag("warn", "no 'TMR SEGA' header; common in early or hacked dumps")
            return ins
        region = (data[off + 15] & 0xF0) >> 4
        if region not in REGIONS:
            ins.flag("warn", f"unknown region/system code {region} in the header")
        ins.facts.update(checksum=f"${data[off + 10] | (data[off + 11] << 8):04X}",
                         region_code=REGIONS.get(region, str(region)))
        return ins


class MasterSystem(_Sega8):
    id = "mastersystem"
    label = "Master System"
    exts = frozenset({".sms", ""})
    dat = "Sega - Master System - Mark III"
    launchbox = "Sega Master System"
    vgchartz = "MS"
    price_platforms = ("mastersystem",)


class GameGear(_Sega8):
    id = "gamegear"
    label = "Game Gear"
    exts = frozenset({".gg"})
    dat = "Sega - Game Gear"
    launchbox = "Sega Game Gear"
    vgchartz = "GG"
    price_platforms = ("gamegear",)


class SG1000(_Sega8):
    id = "sg1000"
    label = "SG-1000"
    exts = frozenset({".sg", ".sc", ".sf7"})
    dat = "Sega - SG-1000"
    launchbox = "Sega SG-1000"
    vgchartz = None           # VGChartz never tracked it
    price_platforms = ("sg1000",)
    headerless_ok = True
