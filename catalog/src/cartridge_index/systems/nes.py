"""Nintendo Entertainment System.

Three facts about NES dumps drive everything here.

The 16-byte iNES header is not part of the cartridge, and 1990s copier dumps
also carry a 127-129 byte trailing footer, so hashing the whole file matches
nothing. The payload -- the file minus its header, trimmed to the size the
header declares -- matches the preservation set exactly. In the library this
was built against, not one file was byte-identical to a modern dump, and 734
matched on payload.

Header bytes 7-15 should be zero, and in many dumps they hold a tool
signature ("DiskDude!"). The mapper's high nibble lives in byte 7, so the
signature silently adds 0x40 to the mapper -- the whole explanation for dozens
of ordinary MMC1 carts claiming to be mapper 65. If bytes 12-15 are dirty the
header is archaic and only the low nibble is trusted.

Copiers also padded images by repeating banks. Trimming PRG and CHR to a clean
fraction and hashing again recovers the real cartridge (54 files).
"""

from __future__ import annotations

import hashlib

from .base import Inspection, System

INES = b"NES\x1a"
PRG, CHR = 16384, 8192
SIGNATURES = (b"DiskDude!", b"demiforce", b"Ni03", b"NI2.1")

# Mappers the mainstream emulators (FCEUX, Mesen, Nestopia) implement. Not
# exhaustive for fringe pirate boards, which is why outside it is "risky".
SUPPORTED = {
    0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 13, 15, 16, 18, 19, 21, 22, 23, 24, 25, 26,
    32, 33, 34, 36, 37, 38, 39, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52,
    57, 58, 60, 61, 62, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77,
    78, 79, 80, 82, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 99,
    100, 101, 105, 107, 112, 113, 115, 117, 118, 119, 133, 140, 142, 144, 146,
    148, 149, 150, 152, 153, 154, 155, 156, 157, 159, 163, 164, 165, 167, 168,
    180, 182, 184, 185, 189, 193, 200, 201, 202, 203, 204, 205, 206, 207, 209,
    210, 211, 212, 213, 214, 215, 216, 217, 218, 225, 226, 227, 228, 229, 230,
    231, 232, 233, 234, 235, 240, 241, 242, 243, 244, 246, 248, 249, 250, 252, 255,
}

# Boards with hard bank limits an emulator will refuse or mis-map.
GEOMETRY = {
    0: {"max_prg": 2, "max_chr": 1, "name": "NROM"},
    2: {"max_chr": 0, "name": "UxROM"},
    3: {"max_prg": 2, "name": "CNROM"},
    7: {"max_chr": 0, "name": "AxROM"},
    71: {"max_chr": 0, "name": "Camerica"},
}


def parse_header(data: bytes) -> dict | None:
    if len(data) < 16 or data[:4] != INES:
        return None
    prg, chr_ = data[4], data[5]
    f6, f7 = data[6], data[7]
    nes2 = (f7 & 0x0C) == 0x08
    archaic = any(data[12:16]) and not nes2
    if nes2:
        prg |= (data[9] & 0x0F) << 8
        chr_ |= (data[9] & 0xF0) << 4
        mapper = (f6 >> 4) | (f7 & 0xF0) | ((data[8] & 0x0F) << 8)
    elif archaic:
        mapper = f6 >> 4
    else:
        mapper = (f6 >> 4) | (f7 & 0xF0)
    trainer = 512 if f6 & 0x04 else 0
    return {"prg": prg, "chr": chr_, "mapper": mapper,
            "mapper_header": (f6 >> 4) | (f7 & 0xF0), "nes2": nes2,
            "archaic": archaic, "trainer": trainer, "battery": bool(f6 & 0x02),
            "mirroring": "vertical" if f6 & 0x01 else "horizontal",
            "header_len": 16 + trainer, "data_len": prg * PRG + chr_ * CHR}


def header_junk(data: bytes) -> str:
    tail = data[7:16]
    if not any(tail):
        return ""
    for sig in SIGNATURES:
        if sig in data[:16]:
            return sig.decode("latin-1")
    return "nonzero bytes 7-15 (" + "".join(
        chr(c) if 32 <= c < 127 else "." for c in tail) + ")"


def overdump_slices(data: bytes, h: dict):
    """Candidate real images for a copier overdump: PRG/CHR at a clean fraction."""
    base = h["header_len"]
    prg_bytes = data[base:base + h["prg"] * PRG]
    chr_bytes = data[base + h["prg"] * PRG:base + h["data_len"]]
    for pd in (1, 2, 4, 8):
        if h["prg"] % pd:
            continue
        for cd in (1, 2, 4, 8):
            if pd == 1 and cd == 1:
                continue
            if (h["chr"] % cd) if h["chr"] else cd != 1:
                continue
            cand = prg_bytes[:len(prg_bytes) // pd] + (
                chr_bytes[:len(chr_bytes) // cd] if chr_bytes else b"")
            if cand:
                real_prg, real_chr = h["prg"] // pd, (h["chr"] // cd if h["chr"] else 0)
                yield cand, "overdump", {
                    "overdump": True,
                    "overdump_note": (f"overdump: header claims {h['prg']}x16K PRG / "
                                      f"{h['chr']}x8K CHR, cartridge is "
                                      f"{real_prg}x16K / {real_chr}x8K")}


class NES(System):
    id = "nes"
    label = "NES"
    manufacturer = "Nintendo"
    exts = frozenset({".nes"})
    dat = "Nintendo - Nintendo Entertainment System"
    launchbox = "Nintendo Entertainment System"
    vgchartz = "NES"
    price_platforms = ("nes",)

    def inspect(self, data: bytes) -> Inspection:
        h = parse_header(data)
        if h is None:
            ins = Inspection(payload=data)
            ins.flag("fail", "no iNES header (magic bytes 'NES\\x1a' missing)")
            return ins

        end = h["header_len"] + h["data_len"]
        ins = Inspection(payload=data[16:end] if end <= len(data) else data[16:])
        ins.facts.update(mapper=h["mapper"], mapper_header=h["mapper_header"],
                         archaic_header=h["archaic"], prg_16k=h["prg"],
                         chr_8k=h["chr"], battery=h["battery"],
                         header_junk=header_junk(data))

        if h["prg"] == 0:
            ins.flag("fail", "header declares zero PRG-ROM; nothing to execute")
        extra = len(data) - end
        ins.facts["trailing_bytes"] = extra
        if extra < 0:
            ins.flag("fail", f"truncated: {-extra} bytes short of the {end} "
                             "the header declares")
        elif 127 <= extra <= 129:
            # One footer family (127 x30, 128 x452, 129 x1 in the reference
            # library). Every emulator ignores it; flagging it once turned 663
            # healthy files into warnings.
            ins.note(f"{extra}-byte copier footer (emulators ignore it)")
        elif extra > 0:
            ins.flag("warn", f"{extra} trailing bytes beyond the declared size")
        if ins.verdict == "fail":
            return ins

        if h["archaic"] and h["mapper"] != h["mapper_header"]:
            ins.flag("warn", f"archaic header: mapper read as {h['mapper']}, not the "
                             f"{h['mapper_header']} byte 7 implies")
        if h["mapper"] not in SUPPORTED:
            ins.flag("risky", f"mapper {h['mapper']} is outside the mainstream "
                              "emulator support set; verify before trusting")
        g = GEOMETRY.get(h["mapper"])
        if g:
            if "max_prg" in g and h["prg"] > g["max_prg"]:
                ins.flag("warn", f"{g['name']} takes at most {g['max_prg']} PRG "
                                 f"banks, header says {h['prg']}")
            if "max_chr" in g and h["chr"] > g["max_chr"]:
                ins.flag("warn", f"{g['name']} uses CHR-RAM, header declares "
                                 f"{h['chr']} CHR banks")
        for name, n in (("PRG", h["prg"]), ("CHR", h["chr"])):
            if n and n & (n - 1):
                ins.flag("warn", f"{name} bank count {n} is not a power of two")

        prg_end = h["header_len"] + h["prg"] * PRG
        if prg_end <= len(data) and prg_end >= h["header_len"] + 6:
            tail = data[prg_end - 6:prg_end]
            rst = tail[2] | (tail[3] << 8)
            ins.facts["reset_vector"] = f"${rst:04X}"
            if rst < 0x8000:
                ins.flag("risky", f"reset vector ${rst:04X} points below $8000 "
                                  "(outside cartridge ROM); will not boot")
            elif rst in (0x0000, 0xFFFF):
                ins.flag("risky", f"reset vector ${rst:04X} looks like "
                                  "unprogrammed memory")
        else:
            ins.flag("risky", "could not read the reset vector")

        def alternates():
            yield data[:end], "headered", {}
            yield from overdump_slices(data, h)

        ins.alternates = alternates
        return ins
