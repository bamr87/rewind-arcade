# Systems

Every platform id this monorepo knows. Machine-readable copy: [`systems/registry.yaml`](../../systems/registry.yaml).

Legend: **Play** = browser recreation. **Emu** = `emulate/config/systems/<id>.yaml` exists. **On** = enabled in a fresh `retropi build`. **ID** = dump bytes can be identified. **Cat** = inventory / price-guide platform.

## Nintendo

| id | Name | Year | Media | Emu | On | ID | Cat |
|---|---|---|---|---|---|---|---|
| nes | NES / Famicom | 1983 | cartridge | yes | yes | yes | yes |
| snes | SNES / Super Famicom | 1990 | cartridge | yes | yes | yes | yes |
| n64 | Nintendo 64 | 1996 | cartridge | yes | yes | yes | yes |
| gb | Game Boy | 1989 | cartridge | yes | yes | — | yes |
| gbc | Game Boy Color | 1998 | cartridge | yes | yes | — | yes |
| gba | Game Boy Advance | 2001 | cartridge | yes | yes | — | yes |
| nds | Nintendo DS | 2004 | cartridge | yes | yes | — | yes |
| virtualboy | Virtual Boy | 1995 | cartridge | yes | — | — | yes |
| gamecube | GameCube | 2001 | disc | — | — | — | yes |
| wii | Wii | 2006 | disc | — | — | — | yes |
| wiiu | Wii U | 2012 | disc | — | — | — | yes |
| 3ds | 3DS | 2011 | cartridge | — | — | — | yes |
| switch | Switch | 2017 | cartridge | — | — | — | yes |

[nintendo.md](nintendo.md)

## Sega

| id | Name | Year | Media | Emu | On | ID | Cat |
|---|---|---|---|---|---|---|---|
| sg1000 | SG-1000 | 1983 | cartridge | yes | — | yes | yes |
| mastersystem | Master System | 1985 | cartridge | yes | yes | yes | yes |
| megadrive | Mega Drive / Genesis | 1988 | cartridge | yes | yes | yes | yes |
| gamegear | Game Gear | 1990 | cartridge | yes | yes | yes | yes |
| segacd | Sega CD / Mega-CD | 1991 | disc | yes | yes | — | yes |
| sega32x | 32X | 1994 | cartridge | yes | yes | yes | yes |
| saturn | Saturn | 1994 | disc | yes | yes | — | yes |
| dreamcast | Dreamcast | 1998 | disc | yes | yes | — | yes |

[sega.md](sega.md)

## Sony

| id | Name | Year | Media | Emu | On | ID | Cat |
|---|---|---|---|---|---|---|---|
| psx | PlayStation | 1994 | disc | yes | yes | — | yes |
| psp | PSP | 2004 | disc | yes | yes | — | yes |
| ps2 | PlayStation 2 | 2000 | disc | — | — | — | yes |
| ps3 | PlayStation 3 | 2006 | disc | — | — | — | yes |
| ps4 | PlayStation 4 | 2013 | disc | — | — | — | yes |
| psvita | PlayStation Vita | 2011 | cartridge | — | — | — | yes |

[sony.md](sony.md)

## Atari

| id | Name | Year | Media | Emu | On | ID | Cat |
|---|---|---|---|---|---|---|---|
| atari2600 | Atari 2600 | 1977 | cartridge | yes | yes | — | yes |
| atari800 | 400/800/XL/XE | 1979 | floppy | yes | — | — | yes |
| atari5200 | Atari 5200 | 1982 | cartridge | yes | — | — | yes |
| atari7800 | Atari 7800 | 1986 | cartridge | yes | yes | — | yes |
| lynx | Lynx | 1989 | cartridge | yes | — | — | yes |
| jaguar | Jaguar | 1993 | cartridge | yes | — | — | yes |

[atari.md](atari.md)

## Computers and adventures

| id | Name | Year | Media | Emu | On | ID | Cat |
|---|---|---|---|---|---|---|---|
| dos | MS-DOS | 1981 | floppy | yes | yes | — | yes |
| c64 | Commodore 64 | 1982 | floppy | yes | yes | — | yes |
| amiga | Amiga | 1985 | floppy | yes | — | — | yes |
| scummvm | ScummVM | 1987 | directory | yes | — | — | yes |

[computers.md](computers.md)

## Arcade and everything else

| id | Name | Year | Media | Emu | On | ID | Cat |
|---|---|---|---|---|---|---|---|
| arcade | Arcade (FBNeo / MAME) | 1980 | pcb | yes | yes | — | yes |
| vectrex | Vectrex | 1982 | cartridge | yes | — | — | yes |
| colecovision | ColecoVision | 1982 | cartridge | yes | — | — | yes |
| intellivision | Intellivision | 1979 | cartridge | yes | — | — | yes |
| pcengine | PC Engine / TG-16 | 1987 | cartridge | yes | yes | — | yes |
| pcenginecd | PC Engine CD / TG-CD | 1988 | disc | yes | — | — | yes |
| neogeo | Neo Geo AES/MVS | 1990 | cartridge | yes | yes | — | yes |
| 3do | 3DO | 1993 | disc | yes | — | — | yes |
| ngp | Neo Geo Pocket / Color | 1998 | cartridge | yes | — | — | yes |
| wonderswan | WonderSwan / Color | 1999 | cartridge | yes | — | — | yes |
| xbox | Original Xbox | 2001 | disc | — | — | — | yes |

[arcade-and-other.md](arcade-and-other.md)

## Browser arcade

| id | Name | Year | Play |
|---|---|---|---|
| pong | Pong | 1972 | [arcade](../../arcade/README.md) |
| jezzball | JezzBall | 1992 | arcade |
| breakout | Breakout | 1976 | arcade |
| snake | Snake | 1976 | arcade |
| asteroids | Asteroids | 1979 | arcade |
| minesweeper | Minesweeper | 1990 | arcade |

Browser console loader: `#/emulate` (same system ids, user-supplied dumps).

These are original programs, not dumps. They do not share ids with consoles.

## Enable an extra emulator

```sh
./bin/retropi systems enable wonderswan
./bin/retropi cores install --system wonderswan
./bin/retropi build
```
