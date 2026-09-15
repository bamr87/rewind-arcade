"""Synthetic cartridge images for tests.

Every image here is fabricated: a valid header wrapped around seeded random
bytes. No game data is in this repository, and none is needed to exercise the
parsers -- only the structure matters.
"""

from __future__ import annotations

import random


def _rand(n: int, seed: int) -> bytes:
    return random.Random(seed).randbytes(n)


def nes(prg=2, chr_=1, mapper=0, footer=0, junk=b"", reset=0x8000, seed=1,
        duplicate_banks=1, battery=False):
    """An iNES image. duplicate_banks>1 builds a copier overdump of the same cart."""
    prg_data = bytearray(_rand(prg * 16384, seed))
    prg_data[-6:] = bytes((0x00, 0x80, reset & 0xFF, reset >> 8, 0x00, 0x80))
    chr_data = _rand(chr_ * 8192, seed + 1)
    header = bytearray(16)
    header[0:4] = b"NES\x1a"
    header[4] = prg * duplicate_banks
    header[5] = chr_ * duplicate_banks
    header[6] = ((mapper & 0x0F) << 4) | (0x02 if battery else 0)
    header[7] = mapper & 0xF0
    if junk:
        header[7:7 + len(junk)] = junk[:9]
    body = bytes(prg_data) * duplicate_banks + chr_data * duplicate_banks
    real = bytes(prg_data) + chr_data
    return bytes(header) + body + _rand(footer, seed + 2), real


def snes(size_kb=512, copier=False, title=b"TEST CART", seed=3, corrupt_checksum=False):
    data = bytearray(_rand(size_kb * 1024, seed))
    off = 0x7FC0
    data[off:off + 21] = title.ljust(21, b" ")[:21]
    data[off + 21] = 0x20                         # LoROM
    data[off + 22] = 0x00
    data[off + 23] = (size_kb.bit_length() - 1)   # 2^n KB
    data[off + 25] = 0x01
    data[off + 27] = 0x00
    data[off + 28:off + 32] = b"\xff\xff\x00\x00"
    from cartridge_index.systems.snes import checksum
    chk = checksum(bytes(data))
    if corrupt_checksum:
        chk ^= 0x1234
    data[off + 28] = (chk ^ 0xFFFF) & 0xFF
    data[off + 29] = (chk ^ 0xFFFF) >> 8
    data[off + 30] = chk & 0xFF
    data[off + 31] = chk >> 8
    image = bytes(data)
    return (bytes(512) + image if copier else image), image


def genesis(size=0x80000, title=b"TEST CART", sega=True, seed=5):
    data = bytearray(_rand(size, seed))
    data[0x100:0x110] = (b"SEGA MEGA DRIVE " if sega else bytes(16))
    data[0x120:0x150] = title.ljust(48, b" ")
    data[0x1F0:0x1F3] = b"JUE"
    s = 0
    for i in range(0x200, len(data) - 1, 2):
        s = (s + ((data[i] << 8) | data[i + 1])) & 0xFFFF
    data[0x18E], data[0x18F] = s >> 8, s & 0xFF
    return bytes(data)


def sega8(size=0x8000, region=4, header=True, seed=7):
    data = bytearray(_rand(size, seed))
    if header:
        off = 0x7FF0
        data[off:off + 8] = b"TMR SEGA"
        data[off + 15] = (region << 4) | 0x0C
    else:
        for off in (0x1FF0, 0x3FF0, 0x7FF0):
            data[off:off + 8] = b"NOT SEGA"
    return bytes(data)


def n64(order="z64", size=0x200000, seed=9, zero_crc=False):
    data = bytearray(_rand(size, seed))
    data[0:4] = b"\x80\x37\x12\x40"
    data[0x10:0x18] = bytes(8) if zero_crc else b"\x12\x34\x56\x78\x9a\xbc\xde\xf0"
    data[0x20:0x34] = b"TEST CART".ljust(20, b" ")
    z64 = bytes(data)
    if order == "v64":
        b = bytearray(len(z64))
        b[0::2], b[1::2] = z64[1::2], z64[0::2]
        return bytes(b), z64
    if order == "n64":
        b = bytearray(len(z64))
        for i in range(0, len(z64), 4):
            b[i:i + 4] = z64[i:i + 4][::-1]
        return bytes(b), z64
    return z64, z64


def dat(system_name, games):
    """A clrmamepro DAT. games: [(name, region, payload_bytes, rom_ext)]."""
    from cartridge_index.dat import digests
    out = [f'clrmamepro (\n\tname "{system_name}"\n\tversion "test"\n)\n']
    for name, region, payload, ext in games:
        d = digests(payload)
        out.append(
            f'game (\n\tname "{name}"\n\tregion "{region}"\n'
            f'\trom ( name "{name}{ext}" size {len(payload)} crc {d["crc"].upper()} '
            f'md5 {d["md5"].upper()} sha1 {d["sha1"].upper()} )\n)\n')
    return "\n".join(out)
