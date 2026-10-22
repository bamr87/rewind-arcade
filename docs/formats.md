# Formats

> Cartridge, disc, floppy, tape, PCB and software: how each kind of media is treated as a first-class field next to the system id.

Retro software arrived on more than cartridges. This repo treats **media** as a first-class field next to the system id.

| Media | What it is | Typical extensions | Examples |
|---|---|---|---|
| `cartridge` | Mask ROM (or flash) in a plastic shell | `.nes` `.sfc` `.z64` `.gb` `.md` | NES, SNES, Genesis, Game Boy, N64 |
| `disc` | Optical: CD, GD-ROM, DVD, MiniDisc-like UMD | `.cue` `.chd` `.iso` `.pbp` | PS1, Sega CD, Saturn, Dreamcast, PSP |
| `floppy` | Magnetic disk | `.adf` `.d64` `.atr` `.img` | Amiga, C64, Atari 8-bit, DOS |
| `tape` | Magnetic cassette | `.tap` `.cas` `.t64` | C64, Atari 8-bit, some 8-bit micros |
| `pcb` | Arcade board (or a romset that stands in for one) | `.zip` `.7z` `.chd` | MAME / FBNeo |
| `directory` | A folder the engine interprets | `.scummvm` | ScummVM |
| `software` | Original program, not a dump | (built-in) | JezzBall, Minesweeper, Snake |

## Cartridges

Identification (catalog) reads the *cartridge's own header* after stripping copier junk: iNES, SNES internal header, Genesis `SEGA` + checksum, SMS `TMR SEGA`, N64 boot CRCs. Emulate does not care about that; it hands the file to a core. Both use the same folder name.

Copier formats (`.smc` 512-byte header, `.smd` interleaved Genesis, `.v64` byte-swapped N64) are dumps of the same cartridge. Catalog normalises them before hashing; emulate cores usually accept several layouts.

## Discs

Disc systems almost always need firmware (PS1 `scph5501.bin`, PCE-CD System Card, 3DO `panafz10.bin`). Emulate lists those files as `bios:` on the manifest and never fetches them. Prefer `.chd` or `.cue`/`.bin` over a raw `.iso` when the core wants a cue sheet.

## Floppies and tapes

C64, Amiga, DOS, and Atari 8-bit software is often a disk image plus an optional tape dump. Extension lists on the manifests are the frontend filter; they are not a claim that every core understands every extension.

## Arcade

An arcade "ROM" is a *romset*: many files named for a MAME or FBNeo revision. FBNeo and MAME 2003-Plus want different sets. `retropi doctor --systems arcade` is the reminder. Catalog treats arcade as a shelf platform; it does not try to identify PCB dumps the way it does iNES.

## Handhelds

Same cartridge media, smaller shells, often a boot ROM (Lynx, GBA). Catalog's dump parsers today cover the Sega 8-bit handhelds (Game Gear) alongside SMS; Game Boy identification is inventory/price only until a parser lands.

## Mixing media on one platform

PC Engine HuCards and CD games are **two system ids** (`pcengine`, `pcenginecd`) so the frontend can require a System Card BIOS only on the CD side. Famicom Disk System stays under `nes` (`.fds` + optional `disksys.rom`). Genesis + 32X + Sega CD are three ids that share a living room.
