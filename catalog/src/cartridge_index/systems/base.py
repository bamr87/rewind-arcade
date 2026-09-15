"""What every system module provides.

Identification only works on the bytes a preservation database indexes, and
each console stores its dumps differently, so a system turns the file on disk
into three things at once:

  payload     the canonical bytes to hash (header stripped, byte order fixed)
  verdict     can an emulator load it -- read from the cartridge's own header
  alternates  other slices worth hashing when the payload finds nothing
              (a NES overdump is still the right game at a fraction of its size)

Doing all three in one pass means every file is read once. Previously the
catalogue was built by one script and validated by another that re-read all
6.5 GB, and running them in the wrong order silently blanked 2,756 verdicts.
"""

from __future__ import annotations

import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable

ORDER = {"pass": 0, "warn": 1, "risky": 2, "fail": 3}


@dataclass
class Inspection:
    payload: bytes
    verdict: str = "pass"
    issues: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    facts: dict = field(default_factory=dict)
    # A callable, so the extra hashing only happens for files nothing else placed.
    alternates: Callable[[], Iterable[tuple[bytes, str, dict]]] | None = None

    def flag(self, level: str, message: str) -> None:
        self.issues.append(f"{level}: {message}")
        if ORDER[level] > ORDER[self.verdict]:
            self.verdict = level

    def note(self, message: str) -> None:
        self.notes.append(message)


class System:
    id: str = ""
    label: str = ""
    manufacturer: str = ""
    exts: frozenset[str] = frozenset()
    dat: str = ""              # libretro-database file stem
    launchbox: str = ""        # LaunchBox platform name
    vgchartz: str | None = None
    price_platforms: tuple[str, ...] = ()   # platform ids whose price rows apply
    min_bare_size = 8192       # an extensionless file smaller than this is not a ROM

    def accepts(self, path: Path) -> bool:
        ext = path.suffix.lower()
        if ext not in self.exts:
            return False
        if ext == "":
            try:
                return path.stat().st_size >= self.min_bare_size
            except OSError:
                return False
        return True

    def read(self, path: Path) -> tuple[bytes | None, str]:
        """The image's bytes, unwrapping a zip container when there is one."""
        if path.suffix.lower() != ".zip":
            return path.read_bytes(), ""
        try:
            with zipfile.ZipFile(path) as z:
                names = [n for n in z.namelist() if not n.endswith("/")]
                inner = [n for n in names
                         if Path(n).suffix.lower() in self.exts - {".zip"}]
                pick = inner or names
                if not pick:
                    return None, "empty archive"
                return z.read(pick[0]), f"from {Path(pick[0]).name}"
        except (zipfile.BadZipFile, RuntimeError, OSError, EOFError) as e:
            return None, f"unreadable archive: {e}"

    def inspect(self, data: bytes) -> Inspection:
        return Inspection(payload=data)
