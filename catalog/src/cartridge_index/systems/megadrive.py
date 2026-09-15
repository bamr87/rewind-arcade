"""Sega Genesis / Mega Drive and the 32X.

Raw .bin is the norm. The .smd copier format adds a 512-byte header and
interleaves each 16K block into odd and even halves; it is de-interleaved
before anything is hashed or read. This applies to 32X too: the previous
scanner treated 32X as raw, and three .smd-format 32X dumps (BC Racers,
Brutal: Above the Claw, Darxide) were unidentifiable until it did not.

A missing "SEGA" at $100 does not stop a cartridge booting -- the console never
reads it. Early Electronic Arts titles (Budokan, Populous, Zany Golf, Ishido)
put 68000 code there, so its absence is a warning, not a fault.
"""

from __future__ import annotations

from .base import Inspection, System


def is_smd(data: bytes) -> bool:
    """A 512-byte copier header, then 16K interleaved blocks.

    Size alone is not proof: the header carries $AA $BB at offset 8, and an
    image with "SEGA" already in place at $100 is raw whatever its length.
    """
    if len(data) % 16384 != 512:
        return False
    return data[8:10] == b"\xaa\xbb" or b"SEGA" not in data[0x100:0x110]


def deinterleave(data: bytes) -> bytes:
    body = data[512:]
    out = bytearray()
    for i in range(0, len(body), 16384):
        blk = body[i:i + 16384]
        if len(blk) < 16384:
            out += blk
            break
        half = 8192
        for j in range(half):
            out += bytes((blk[half + j], blk[j]))
    return bytes(out)


def interleave(image: bytes) -> bytes:
    """The inverse, for tests: a raw image laid out as an .smd."""
    out = bytearray(512)
    out[8:11] = b"\xaa\xbb\x06"
    for i in range(0, len(image), 16384):
        blk = image[i:i + 16384]
        half = 8192
        enc = bytearray(16384)
        for j in range(half):
            enc[half + j], enc[j] = blk[2 * j], blk[2 * j + 1]
        out += enc
    return bytes(out)


class MegaDrive(System):
    id = "megadrive"
    label = "Sega Genesis"
    manufacturer = "Sega"
    exts = frozenset({".bin", ".gen", ".md", ".smd"})
    dat = "Sega - Mega Drive - Genesis"
    launchbox = "Sega Genesis"
    vgchartz = "GEN"
    price_platforms = ("megadrive",)

    def inspect(self, data: bytes) -> Inspection:
        smd = is_smd(data)
        if smd:
            data = deinterleave(data)
        ins = Inspection(payload=data)
        if smd:
            ins.note("de-interleaved from .smd")
        if b"SEGA" not in data[0x100:0x110]:
            ins.flag("warn", "non-standard header: no 'SEGA' at $100 (early EA or "
                             "unlicensed cartridge; emulators do not require it)")
            ins.facts["region_code"] = "non-standard"
            return ins
        chk = (data[0x18E] << 8) | data[0x18F] if len(data) > 0x18F else 0
        s = 0
        for i in range(0x200, len(data) - 1, 2):
            s = (s + ((data[i] << 8) | data[i + 1])) & 0xFFFF
        if chk and s != chk:
            ins.flag("warn", f"header checksum ${chk:04X}, computed ${s:04X}")
        ins.facts.update(
            internal_title=" ".join(data[0x120:0x150].decode("ascii", "replace").split()),
            checksum=f"${chk:04X}",
            region_code=data[0x1F0:0x1F3].decode("ascii", "replace").strip())
        return ins


class Sega32X(MegaDrive):
    id = "sega32x"
    label = "Sega 32X"
    exts = frozenset({".32x"})
    dat = "Sega - 32X"
    launchbox = "Sega 32X"
    vgchartz = "S32X"
    # The price guide files 32X carts under Genesis. VGChartz is deliberately
    # NOT widened the same way: the same title on both is a different
    # cartridge that sold differently.
    price_platforms = ("sega32x", "megadrive")
