"""Nintendo 64.

No-Intro indexes big-endian .z64. Dumps also circulate byteswapped (.v64) and
little-endian (.n64), and are commonly zipped, so the image is unwrapped and
reordered before it is hashed or its header is read.
"""

from __future__ import annotations

from .base import Inspection, System

MAGIC = {b"\x80\x37\x12\x40": "z64", b"\x37\x80\x40\x12": "v64",
         b"\x40\x12\x37\x80": "n64"}


def to_z64(data: bytes) -> tuple[bytes, str]:
    fmt = MAGIC.get(bytes(data[:4]))
    if fmt == "v64":
        b = bytearray(len(data) - len(data) % 2)
        b[0::2], b[1::2] = data[1:len(b):2], data[0:len(b):2]
        return bytes(b) + data[len(b):], "v64"
    if fmt == "n64":
        n = len(data) - len(data) % 4
        out = bytearray(n)
        for i in range(0, n, 4):
            out[i:i + 4] = data[i:i + 4][::-1]
        return bytes(out) + data[n:], "n64"
    return data, fmt or ""


class N64(System):
    id = "n64"
    label = "Nintendo 64"
    manufacturer = "Nintendo"
    exts = frozenset({".z64", ".v64", ".n64", ".zip"})
    dat = "Nintendo - Nintendo 64"
    launchbox = "Nintendo 64"
    vgchartz = "N64"
    price_platforms = ("n64",)

    def inspect(self, data: bytes) -> Inspection:
        payload, fmt = to_z64(data)
        ins = Inspection(payload=payload)
        ins.facts["byte_order"] = fmt or "unknown"
        if fmt in ("v64", "n64"):
            ins.note(f"normalised from .{fmt} byte order")
        if payload[:4] != b"\x80\x37\x12\x40":
            ins.flag("risky", "not a recognisable N64 image after byte-order normalisation")
            return ins
        if len(payload) % 4:
            ins.flag("warn", "image length is not a multiple of 4")
        if len(payload) < 1 << 20:
            ins.flag("warn", f"unusually small for an N64 cartridge "
                             f"({len(payload) // 1024}KB)")
        crc1 = int.from_bytes(payload[0x10:0x14], "big")
        crc2 = int.from_bytes(payload[0x14:0x18], "big")
        if crc1 == 0 or crc2 == 0:
            ins.flag("risky", "boot CRCs are zero; the image will fail the CIC check")
        ins.facts.update(internal_title=" ".join(
            payload[0x20:0x34].decode("ascii", "replace").split()),
            checksum=f"${crc1:08X}")
        return ins
