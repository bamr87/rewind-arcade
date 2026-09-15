"""Platform identity for anything in a collection, ROM-capable or not.

Ids follow emulate/ (retro-pi) wherever that tree has a manifest, so a library
organised under roms/<id> is already laid out the way this tool expects.
The physical inventory is broader than the ROM libraries -- a shelf holds
GameCube discs as readily as NES cartridges -- so the platform list is too.
"""

from __future__ import annotations

import re

# id: (label, manufacturer, media, aliases)
PLATFORMS = {
    "nes": ("NES", "Nintendo", "cartridge",
            ["NES", "Nintendo Entertainment System", "Famicom"]),
    "snes": ("SNES", "Nintendo", "cartridge",
             ["SNES", "Super Nintendo", "Super Nintendo Entertainment System",
              "Super Famicom"]),
    "n64": ("Nintendo 64", "Nintendo", "cartridge", ["N64", "Nintendo 64"]),
    "gb": ("Game Boy", "Nintendo", "cartridge", ["GB", "Game Boy"]),
    "gbc": ("Game Boy Color", "Nintendo", "cartridge", ["GBC", "Game Boy Color"]),
    "gba": ("Game Boy Advance", "Nintendo", "cartridge", ["GBA", "Game Boy Advance"]),
    "nds": ("Nintendo DS", "Nintendo", "cartridge", ["DS", "NDS", "Nintendo DS"]),
    "virtualboy": ("Virtual Boy", "Nintendo", "cartridge",
                   ["VB", "Virtual Boy", "VirtualBoy"]),
    "3ds": ("Nintendo 3DS", "Nintendo", "cartridge", ["3DS", "Nintendo 3DS"]),
    "gamecube": ("GameCube", "Nintendo", "disc", ["GameCube", "Gamecube", "GC", "NGC"]),
    "wii": ("Wii", "Nintendo", "disc", ["Wii"]),
    "wiiu": ("Wii U", "Nintendo", "disc", ["Wii U", "WiiU"]),
    "switch": ("Switch", "Nintendo", "cartridge", ["Switch", "Nintendo Switch"]),
    "megadrive": ("Sega Genesis", "Sega", "cartridge",
                  ["Genesis", "Sega Genesis", "Mega Drive", "Sega Mega Drive", "GEN"]),
    "sega32x": ("Sega 32X", "Sega", "cartridge", ["32X", "Sega 32X", "S32X"]),
    "segacd": ("Sega CD", "Sega", "disc", ["Sega CD", "Mega-CD", "SCD"]),
    "mastersystem": ("Master System", "Sega", "cartridge",
                     ["Master System", "Sega Master System", "SMS", "MS"]),
    "gamegear": ("Game Gear", "Sega", "cartridge", ["Game Gear", "Sega Game Gear", "GG"]),
    "sg1000": ("SG-1000", "Sega", "cartridge", ["SG-1000", "Sega SG-1000", "SG1000"]),
    "saturn": ("Saturn", "Sega", "disc", ["Saturn", "Sega Saturn", "SAT"]),
    "dreamcast": ("Dreamcast", "Sega", "disc", ["Dreamcast", "Sega Dreamcast", "DC"]),
    "psx": ("PlayStation", "Sony", "disc", ["PlayStation", "PS1", "PSX", "PS"]),
    "ps2": ("PlayStation 2", "Sony", "disc", ["PlayStation 2", "PS2"]),
    "ps3": ("PlayStation 3", "Sony", "disc", ["PlayStation 3", "PS3"]),
    "ps4": ("PlayStation 4", "Sony", "disc", ["PlayStation 4", "PS4"]),
    "psp": ("PSP", "Sony", "disc", ["PSP", "PlayStation Portable"]),
    "psvita": ("PlayStation Vita", "Sony", "cartridge",
               ["Vita", "PS Vita", "PSVita", "PS Vita"]),
    "atari2600": ("Atari 2600", "Atari", "cartridge", ["Atari 2600", "2600"]),
    "atari5200": ("Atari 5200", "Atari", "cartridge", ["Atari 5200", "5200"]),
    "atari7800": ("Atari 7800", "Atari", "cartridge", ["Atari 7800", "7800"]),
    "atari800": ("Atari 8-bit", "Atari", "floppy",
                 ["Atari 800", "Atari XL", "Atari XE", "Atari 8-bit"]),
    "lynx": ("Atari Lynx", "Atari", "cartridge", ["Lynx", "Atari Lynx"]),
    "jaguar": ("Atari Jaguar", "Atari", "cartridge", ["Jaguar", "Atari Jaguar"]),
    "pcengine": ("PC Engine", "NEC", "cartridge", ["PC Engine", "TurboGrafx-16", "TG16"]),
    "pcenginecd": ("PC Engine CD", "NEC", "disc",
                   ["PC Engine CD", "TurboGrafx-CD", "TGCD"]),
    "neogeo": ("Neo Geo", "SNK", "cartridge", ["Neo Geo", "NeoGeo", "AES"]),
    "ngp": ("Neo Geo Pocket", "SNK", "cartridge",
            ["Neo Geo Pocket", "NGP", "Neo Geo Pocket Color", "NGPC"]),
    "arcade": ("Arcade", "Various", "pcb", ["Arcade", "MAME", "FBNeo", "Neo Geo MVS"]),
    "vectrex": ("Vectrex", "GCE", "cartridge", ["Vectrex", "GCE Vectrex"]),
    "colecovision": ("ColecoVision", "Coleco", "cartridge",
                     ["ColecoVision", "Coleco", "CV"]),
    "intellivision": ("Intellivision", "Mattel", "cartridge",
                      ["Intellivision", "INTV"]),
    "3do": ("3DO", "Panasonic", "disc", ["3DO", "Panasonic 3DO"]),
    "wonderswan": ("WonderSwan", "Bandai", "cartridge",
                   ["WonderSwan", "WS", "WonderSwan Color", "WSC"]),
    "c64": ("Commodore 64", "Commodore", "floppy", ["C64", "Commodore 64"]),
    "amiga": ("Amiga", "Commodore", "floppy",
              ["Amiga", "Commodore Amiga", "A500", "A1200"]),
    "dos": ("MS-DOS", "Microsoft", "floppy", ["DOS", "MS-DOS", "PC"]),
    "scummvm": ("ScummVM", "Various", "directory", ["ScummVM", "Scumm"]),
    "xbox": ("Xbox", "Microsoft", "disc", ["Xbox", "Original Xbox", "OG Xbox"]),
}


def _key(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


_ALIAS = {}
for _id, (_label, _maker, _media, _aliases) in PLATFORMS.items():
    for _a in [_id, _label, *_aliases]:
        _ALIAS.setdefault(_key(_a), _id)


def resolve(name: str) -> str | None:
    """Platform id for a label as some spreadsheet or database spelled it."""
    if not name:
        return None
    return _ALIAS.get(_key(name))


def label(platform_id: str) -> str:
    return PLATFORMS.get(platform_id, (platform_id,))[0]


def media(platform_id: str) -> str:
    p = PLATFORMS.get(platform_id)
    return p[2] if p else ""
