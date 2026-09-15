"""Super Nintendo.

A 512-byte copier header on top of a whole number of kilobytes is what the
.smc extension means: 757 of 857 files in the reference library carry one and
every emulator skips it. It is stripped, and noted, never warned about.

Validation reads the cartridge's internal header at LoROM $7FC0, HiROM $FFC0 or
ExHiROM $40FFC0. The checksum and its complement must XOR to $FFFF, and the
checksum should match a byte sum over the image with its tail mirrored up to a
power of two.
"""

from __future__ import annotations

from .base import Inspection, System


def checksum(data: bytes) -> int:
    n = len(data)
    if n == 0:
        return 0
    p = 1 << (n.bit_length() - 1)
    if p == n:
        return sum(data) & 0xFFFF
    rest = data[p:]
    mult = p // len(rest) if rest else 0
    return (sum(data[:p]) + sum(rest) * mult) & 0xFFFF


def header_score(data: bytes, off: int):
    if off + 32 > len(data):
        return -1, None
    h = data[off:off + 32]
    chk = h[30] | (h[31] << 8)
    cmp_ = h[28] | (h[29] << 8)
    score = 0
    if (chk ^ cmp_) == 0xFFFF and chk != 0:
        score += 8
    score += sum(1 for c in h[0:21] if 32 <= c < 127) // 4
    if h[21] & 0x20:
        score += 2
    if 0x08 <= h[23] <= 0x0D:
        score += 2
    return score, {"title": h[0:21].decode("ascii", "replace").strip(),
                   "checksum": chk, "complement": cmp_,
                   "rom_size_kb": 1 << h[23] if h[23] < 24 else 0}


class SNES(System):
    id = "snes"
    label = "SNES"
    manufacturer = "Nintendo"
    exts = frozenset({".smc", ".sfc", ".fig", ".swc"})
    dat = "Nintendo - Super Nintendo Entertainment System"
    launchbox = "Super Nintendo Entertainment System"
    vgchartz = "SNES"
    price_platforms = ("snes",)

    def inspect(self, data: bytes) -> Inspection:
        copier = len(data) % 1024 == 512
        if copier:
            data = data[512:]
        ins = Inspection(payload=data)
        if copier:
            ins.note("512-byte copier header stripped")

        best, info, layout = -1, None, None
        for off, name in ((0x7FC0, "LoROM"), (0xFFC0, "HiROM"), (0x40FFC0, "ExHiROM")):
            s, i = header_score(data, off)
            if s > best:
                best, info, layout = s, i, name
        if best < 6 or info is None:
            ins.flag("risky", "no recognisable SNES internal header at any standard offset")
            return ins

        ins.facts.update(layout=layout + (" + copier header" if copier else ""),
                         internal_title=info["title"],
                         checksum=f"${info['checksum']:04X}")
        if (info["checksum"] ^ info["complement"]) != 0xFFFF:
            ins.flag("warn", f"header checksum ${info['checksum']:04X} and complement "
                             f"${info['complement']:04X} do not pair")
        else:
            actual = checksum(data)
            if actual != info["checksum"]:
                ins.flag("warn", f"checksum ${info['checksum']:04X} in the header, "
                                 f"${actual:04X} computed from the image")
        declared = info["rom_size_kb"] * 1024
        if declared and not (declared / 2 <= len(data) <= declared * 2):
            ins.flag("warn", f"header declares ~{info['rom_size_kb']}KB, image is "
                             f"{len(data) // 1024}KB")
        return ins
