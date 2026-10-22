# Nintendo

> NES through Switch, the Game Boy line and the Virtual Boy: home consoles, handhelds, and the odd dual-red visor.

Ids follow emulate. Catalog inventory accepts every row here; dump identification today covers NES, SNES, and N64.

## NES (`nes`)

1983 cartridge. Aliases: `famicom`. Core default: Nestopia UE (`nestopia_libretro`); Mesen and FCEUmm as alternatives.

Catalog strips the 16-byte iNES header and hashes the payload No-Intro indexes. Dirty `DiskDude!` headers, bank-padded overdumps, and 128-byte copier footers are notes, not hard failures — emulators accept them. Famicom Disk System software uses `.fds` plus optional `disksys.rom` and stays in this system.

## SNES (`snes`)

1990 cartridge. Alias: `superfamicom`.

A 512-byte copier header is what `.smc` means; most libraries still carry one. Catalog strips it, then looks for an internal header at LoROM / HiROM / ExHiROM and checks the checksum complement.

## Nintendo 64 (`n64`)

1996 cartridge. Catalog reorders `.v64` / `.n64` to big-endian `.z64` before hashing and checks boot CRCs.

## Game Boy line (`gb`, `gbc`, `gba`)

1989 / 1998 / 2001 cartridges. mGBA covers GBA (BIOS optional). Same ids as emulate ROM folders, so a Game Boy library laid out for the frontend is already a catalog library. Dump-byte identification for these is not in catalog yet; inventory and the price guide still accept them.

## Nintendo DS (`nds`)

2004 cartridge (dual screen). Emulate has a manifest. Catalog tracks copies on a shelf.

## Virtual Boy (`virtualboy`)

1995 cartridge. Beetle VB. Enable with `retropi systems enable virtualboy`.

## Disc and later (`gamecube`, `wii`, `wiiu`, `3ds`, `switch`)

Catalog / price-guide platforms. They are on the registry so a shelf spreadsheet that says "GameCube" resolves to `gamecube`, the same way `psx` does. They do not yet have emulate manifests — Dolphin / Citra / Yuzu-class emulators are standalone and heavier than the libretro path this tree standardises on.
