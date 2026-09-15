"""The system registry. Adding a console means adding one module here.

Ids follow emulate/ (retro-pi), so a library it laid out (roms/<id>) is recognised as is.
"""

from .base import Inspection, System
from .megadrive import MegaDrive, Sega32X
from .n64 import N64
from .nes import NES
from .sega8 import SG1000, GameGear, MasterSystem
from .snes import SNES

REGISTRY: dict[str, System] = {s.id: s for s in (
    NES(), SNES(), N64(), MegaDrive(), Sega32X(), MasterSystem(), GameGear(), SG1000())}


def get(system_id: str) -> System:
    try:
        return REGISTRY[system_id]
    except KeyError:
        raise KeyError(f"unknown system {system_id!r}; known: "
                       f"{', '.join(sorted(REGISTRY))}") from None


__all__ = ["REGISTRY", "Inspection", "System", "get"]
