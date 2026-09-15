# Sega

One living-room lineage from SG-1000 through Dreamcast, plus the Game Gear.

## SG-1000 (`sg1000`)

1983 cartridge. Headerless by design; catalog treats a missing header as normal. Libraries often drop SG-1000, SC-3000 and SF-7000 software in the Master System folder — scanning those against the SMS DAT cannot match. This id exists so extensions can decide. Manifest ships; enable it if you keep a separate folder.

## Master System (`mastersystem`)

1985 cartridge. Alias: `sms`. Catalog looks for `TMR SEGA` at `$7FF0` / `$3FF0` / `$1FF0`. A 32KB image's header ending on the last byte is valid.

## Mega Drive / Genesis (`megadrive`)

1988 cartridge. Aliases: `genesis`, `md`. Catalog de-interleaves `.smd` and warns (only) if `SEGA` is missing — early EA carts put 68000 code there and still boot. Checksum at `$18E`.

## Game Gear (`gamegear`)

1990 cartridge. Alias: `gg`. Same Sega 8-bit header family as the Master System.

## Sega CD (`segacd`) and 32X (`sega32x`)

1991 disc and 1994 cartridge add-ons. Separate ids so BIOS and cores stay honest. 32X dumps are identified with the Genesis family parser.

## Saturn (`saturn`) and Dreamcast (`dreamcast`)

1994 and 1998 discs. Emulate manifests with BIOS checks. Catalog inventory accepts both; there is no dump-byte parser for GD-ROM / Saturn images in this tree.
