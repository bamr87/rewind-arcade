#!/usr/bin/env python3
"""Generate an original NES test cartridge for verifying a retro-pi setup.

This is not a game and contains nothing derived from any commercial title: it
is ~100 bytes of original 6502 that cycles the PPU backdrop colour, which is
enough to prove end to end that RetroArch loaded the core, the core accepted
the ROM, and frames are actually advancing.

    python3 tests/fixtures/make_test_rom.py roms/nes/retropi-test.nes

Output is a 24,592 byte NROM (mapper 0) image: 16 byte iNES header,
16 KiB PRG ROM, 8 KiB CHR ROM.
"""
from __future__ import annotations

import sys

# --- a very small 6502 assembler ---------------------------------------------
# Only the addressing modes this ROM needs. Two passes: collect label
# addresses, then emit with branch offsets resolved.

IMPLIED = {
    "sei": 0x78, "cld": 0xD8, "txs": 0x9A, "inx": 0xE8, "iny": 0xC8,
    "rti": 0x40, "lsr_a": 0x4A, "tax": 0xAA, "txa": 0x8A, "dex": 0xCA,
    "nop": 0xEA,
}
IMMEDIATE = {"lda": 0xA9, "ldx": 0xA2, "ldy": 0xA0, "cpx": 0xE0, "and": 0x29,
             "cmp": 0xC9, "ora": 0x09, "adc": 0x69}
ABSOLUTE = {"lda": 0xAD, "sta": 0x8D, "stx": 0x8E, "bit": 0x2C, "jmp": 0x4C,
            "inc": 0xEE}
ABSOLUTE_X = {"lda": 0xBD, "sta": 0x9D}
ZEROPAGE = {"lda": 0xA5, "sta": 0x85, "inc": 0xE6, "dec": 0xC6}
BRANCH = {"bpl": 0x10, "bne": 0xD0, "beq": 0xF0, "bmi": 0x30, "bcc": 0x90}


class Asm:
    def __init__(self, origin: int):
        self.origin = origin
        self.out = bytearray()
        self.labels: dict[str, int] = {}
        self.fixups: list[tuple[int, str, str]] = []

    @property
    def pc(self) -> int:
        return self.origin + len(self.out)

    def label(self, name: str) -> "Asm":
        self.labels[name] = self.pc
        return self

    def _emit(self, *vals: int) -> "Asm":
        self.out.extend(vals)
        return self

    def imp(self, op: str) -> "Asm":
        return self._emit(IMPLIED[op])

    def imm(self, op: str, val: int) -> "Asm":
        return self._emit(IMMEDIATE[op], val & 0xFF)

    def abs(self, op: str, addr: int) -> "Asm":
        return self._emit(ABSOLUTE[op], addr & 0xFF, (addr >> 8) & 0xFF)

    def absx(self, op: str, addr: int) -> "Asm":
        return self._emit(ABSOLUTE_X[op], addr & 0xFF, (addr >> 8) & 0xFF)

    def zp(self, op: str, addr: int) -> "Asm":
        return self._emit(ZEROPAGE[op], addr & 0xFF)

    def branch(self, op: str, target: str) -> "Asm":
        self.fixups.append((len(self.out) + 1, target, "rel"))
        return self._emit(BRANCH[op], 0x00)

    def jmp_label(self, target: str) -> "Asm":
        self.fixups.append((len(self.out) + 1, target, "abs"))
        return self._emit(ABSOLUTE["jmp"], 0x00, 0x00)

    def lda_abs_label(self, target: str) -> "Asm":
        self.fixups.append((len(self.out) + 1, target, "abs"))
        return self._emit(ABSOLUTE_X["lda"], 0x00, 0x00)

    def resolve(self) -> bytes:
        for pos, name, kind in self.fixups:
            if name not in self.labels:
                raise KeyError(f"undefined label: {name}")
            target = self.labels[name]
            if kind == "rel":
                delta = target - (self.origin + pos + 1)
                if not -128 <= delta <= 127:
                    raise ValueError(f"branch out of range to {name}: {delta}")
                self.out[pos] = delta & 0xFF
            else:
                self.out[pos] = target & 0xFF
                self.out[pos + 1] = (target >> 8) & 0xFF
        return bytes(self.out)


# --- PPU / APU registers ------------------------------------------------------
PPUCTRL, PPUMASK, PPUSTATUS = 0x2000, 0x2001, 0x2002
PPUADDR, PPUDATA, PPUSCROLL = 0x2006, 0x2007, 0x2005
APUFRAME, APUDMC = 0x4017, 0x4010

FRAME_COUNTER = 0x10   # zero page


def build_prg() -> bytes:
    a = Asm(0xC000)

    a.label("reset")
    a.imp("sei").imp("cld")
    a.imm("ldx", 0x40).abs("stx", APUFRAME)      # silence APU frame IRQ
    a.imm("ldx", 0xFF).imp("txs")                # stack at $01FF
    a.imm("ldx", 0x00)
    a.abs("stx", PPUCTRL).abs("stx", PPUMASK)    # rendering + NMI off
    a.abs("stx", APUDMC)

    # The PPU is not ready until two vblanks have passed after power-on.
    a.label("vblank1").abs("bit", PPUSTATUS).branch("bpl", "vblank1")

    a.imm("lda", 0x00)
    a.label("clrmem")
    for page in (0x0000, 0x0100, 0x0300, 0x0400, 0x0500, 0x0600, 0x0700):
        a.absx("sta", page)
    a.imm("lda", 0xFE).absx("sta", 0x0200)       # park sprites off screen
    a.imm("lda", 0x00)
    a.imp("inx").branch("bne", "clrmem")

    a.label("vblank2").abs("bit", PPUSTATUS).branch("bpl", "vblank2")

    # Palette: $3F00..$3F1F
    a.abs("lda", PPUSTATUS)                      # reset the address latch
    a.imm("lda", 0x3F).abs("sta", PPUADDR)
    a.imm("lda", 0x00).abs("sta", PPUADDR)
    a.imm("ldx", 0x00)
    a.label("palloop")
    a.lda_abs_label("palette")
    a.abs("sta", PPUDATA)
    a.imp("inx").imm("cpx", 0x20).branch("bne", "palloop")

    a.imm("lda", 0x00).abs("sta", PPUSCROLL).abs("sta", PPUSCROLL)
    a.imm("lda", 0x0E).abs("sta", PPUMASK)       # show background

    # Main loop: one pass per frame, backdrop colour steps every 16 frames.
    a.label("forever")
    a.label("waitvbl").abs("bit", PPUSTATUS).branch("bpl", "waitvbl")
    a.zp("inc", FRAME_COUNTER)
    a.zp("lda", FRAME_COUNTER)
    for _ in range(4):
        a.imp("lsr_a")                           # /16
    a.imm("and", 0x3F)                           # legal NES colour range
    a.imp("tax")

    a.abs("lda", PPUSTATUS)
    a.imm("lda", 0x3F).abs("sta", PPUADDR)
    a.imm("lda", 0x00).abs("sta", PPUADDR)
    a.imp("txa")                                 # colour index -> A
    a.abs("sta", PPUDATA)
    a.imm("lda", 0x00).abs("sta", PPUSCROLL).abs("sta", PPUSCROLL)
    a.jmp_label("forever")

    a.label("nmi").imp("rti")

    a.label("palette")
    # Backdrop plus three background palettes; deliberately plain.
    a.out.extend(bytes([0x0F, 0x30, 0x21, 0x11] * 4 +
                       [0x0F, 0x30, 0x21, 0x11] * 4))

    code = a.resolve()
    if len(code) > 16384 - 6:
        raise SystemExit(f"PRG overflow: {len(code)} bytes")

    prg = bytearray(b"\x00" * 16384)
    prg[: len(code)] = code
    # Vectors live in the last six bytes: NMI, RESET, IRQ.
    nmi, reset = a.labels["nmi"], a.labels["reset"]
    prg[0x3FFA:0x3FFC] = bytes([nmi & 0xFF, nmi >> 8])
    prg[0x3FFC:0x3FFE] = bytes([reset & 0xFF, reset >> 8])
    prg[0x3FFE:0x4000] = bytes([nmi & 0xFF, nmi >> 8])
    return bytes(prg)


def build_rom() -> bytes:
    header = bytearray(16)
    header[0:4] = b"NES\x1a"
    header[4] = 1        # 1 x 16 KiB PRG
    header[5] = 1        # 1 x 8 KiB CHR
    header[6] = 0x01     # mapper 0, vertical mirroring
    chr_rom = bytes(8192)   # blank tiles: the field renders as the backdrop
    return bytes(header) + build_prg() + chr_rom


def main() -> int:
    dest = sys.argv[1] if len(sys.argv) > 1 else "roms/nes/retropi-test.nes"
    rom = build_rom()
    with open(dest, "wb") as fh:
        fh.write(rom)
    print(f"wrote {dest} ({len(rom)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
