# Systems

Each console family is one module in `src/cartridge_index/systems/`. A system turns a file into three things in a single read:

| | |
|---|---|
| **payload** | the canonical bytes to hash: what the preservation database indexes |
| **verdict** | `pass` / `warn` / `risky` / `fail`, read from the cartridge's own header |
| **alternates** | extra slices worth hashing when nothing else matched |

Identification tries the whole file, then the payload, then the alternates. A file nothing places by hash may still be recognised by name against the DAT; it is then `unverified`, never `identified`.

| System | Payload | Validation |
|---|---|---|
| NES | file minus the 16-byte iNES header, trimmed to the declared size | iNES magic, PRG present, not truncated, mapper in the mainstream emulator set (archaic headers corrected), bank geometry, 6502 reset vector |
| SNES | 512-byte copier header stripped when present | internal header at LoROM `$7FC0` / HiROM `$FFC0` / ExHiROM `$40FFC0`; checksum XOR complement = `$FFFF`; checksum recomputed |
| Nintendo 64 | unzipped, `.v64` / `.n64` reordered to big-endian `.z64` | magic, plausible size, non-zero boot CRCs |
| Genesis, 32X | `.smd` de-interleaved | `SEGA` at `$100` (absence is a warning only), checksum at `$18E` |
| Master System, Game Gear | raw | `TMR SEGA` at `$7FF0` / `$3FF0` / `$1FF0`, region code |
| SG-1000 | raw | headerless by design; absence is normal |

## Things each system learned the hard way

**NES.** Not one file in the reference library was byte-identical to a No-Intro dump; 734 matched on payload. Header bytes 7-15 often hold a tool signature (`DiskDude!`), which adds `0x40` to the mapper; if bytes 12-15 are dirty only the low nibble is trusted. Copiers padded images by repeating banks, so PRG and CHR are also tried at 1/2, 1/4 and 1/8 of their declared size, which recovered 54 overdumps. The 127-129 byte copier footer is a note, not a warning.

**SNES.** A copier header is what `.smc` means. 757 of 857 files carry one.

**Genesis.** Early Electronic Arts cartridges (Budokan, Populous, Zany Golf, Ishido) put 68000 code where `SEGA` usually sits. They boot.

**Master System / Game Gear.** The header occupies 16 bytes from its offset, so a 32KB cartridge's header at `$7FF0` ends exactly at the image's last byte. The original check required the image to be longer than that, and warned about every 32KB cartridge.

**SG-1000.** Libraries often keep SG-1000, SC-3000 and SF-7000 software in the Master System folder. Scanning it against the Master System DAT can never match; giving it its own system lifted Master System identification from 71% to 85% in the reference library. Folders may be shared, and extensions decide.

## Adding a system

1. Create `systems/<family>.py` with a `System` subclass: `id` (use retro-pi's),
`label`, `exts`, `dat` (the libretro-database file stem), `launchbox` (platform name), `vgchartz` (console code or `None`), `price_platforms`.
2. Implement `inspect(data) -> Inspection`: set the payload, call `flag()` for
   problems and `note()` for benign facts, put header facts in `facts`.
3. Register it in `systems/__init__.py`.
4. Add a synthetic image to `tests/romgen.py` and cases to `tests/test_systems.py`.
5. Check `tests.test_systems.Registry` still passes: no two systems may claim
   the same extension.
