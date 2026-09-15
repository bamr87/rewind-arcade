"""Configuration: which platforms the library indexes, and where data lives.

Nothing about a particular drive is hardcoded. ROM folders are optional file
references; the catalog is the library. A config names the platforms (and
optionally media types) to capture, then may point at folders whose dumps are
recorded in place and never moved.

    systems    = ["nes", "snes", "n64"]   # platforms this library indexes
    media      = ["cartridge"]            # optional type filter
    workspace  = "workspace"              # catalog, SQLite, web data (generated)
    reference  = "data/reference"         # DATs and databases fetched by `cartidx fetch`
    collection = "collection"             # your inventory and price guide (personal)
    workbook   = "~/video-games.ods"      # optional price-guide spreadsheet

    [[libraries]]
    name = "main"
    root = "/Volumes/games/retro"

    [libraries.systems]
    nes     = "nintendo/nes"
    sega32x = ["sega/sega32x", "sega/megadrive"]   # a system may span folders

Relative paths resolve against the directory holding the config file.
"""

from __future__ import annotations

import os
import tomllib
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

CONFIG_NAME = "cartridge.toml"
DEFAULT_EXCLUDE = ("_retired", "_bundles", "_rom_analysis", "Claude outputs")
HOLDING = ("_duplicates", "_regional", "_superseded")


class ConfigError(Exception):
    pass


@dataclass
class Library:
    name: str
    root: Path
    systems: dict[str, list[str]]
    exclude: tuple[str, ...] = DEFAULT_EXCLUDE

    def folders(self, system_id: str) -> list[Path]:
        return [self.root / d for d in self.systems.get(system_id, [])]


@dataclass
class Config:
    path: Path | None
    base: Path
    workspace: Path
    reference: Path
    collection: Path
    workbook: Path | None = None
    systems: tuple[str, ...] = ()
    media: tuple[str, ...] = ()
    libraries: list[Library] = field(default_factory=list)

    @property
    def inventory(self) -> Path:
        return self.collection / "inventory.csv"

    @property
    def prices(self) -> Path:
        return self.collection / "prices.csv"

    @property
    def catalog(self) -> Path:
        return self.workspace / "roms.csv"

    @property
    def games(self) -> Path:
        return self.workspace / "games.csv"

    def library(self, name: str) -> Library:
        for lib in self.libraries:
            if lib.name == name:
                return lib
        raise ConfigError(f"no library named {name!r} in {self.path}")

    def resolve_rom(self, row: dict) -> Path:
        return self.library(row["library"]).root / row["path"]

    def filter_systems(self, extra=None) -> list[str] | None:
        """Systems to scan or catalogue. None means every configured library."""
        scope = set(self.systems) if self.systems else None
        if extra:
            chosen = set(extra)
            if scope:
                chosen &= scope
            return sorted(chosen)
        return sorted(scope) if scope else None


def _path(base: Path, value) -> Path:
    p = Path(os.path.expanduser(str(value)))
    return p if p.is_absolute() else (base / p)


def find(start: Path | None = None) -> Path | None:
    env = os.environ.get("CARTIDX_CONFIG")
    if env:
        return Path(env).expanduser()
    here = Path(start or Path.cwd()).resolve()
    for d in (here, *here.parents):
        if (d / CONFIG_NAME).exists():
            return d / CONFIG_NAME
    return None


def _string_list(value) -> tuple[str, ...]:
    if value in (None, ""):
        return ()
    if isinstance(value, str):
        return tuple(s.strip() for s in value.split(",") if s.strip())
    return tuple(str(s) for s in value)


def load(path: Path | str | None = None) -> Config:
    from . import platforms
    from .systems import REGISTRY

    path = Path(path).expanduser() if path else find()
    if not path or not path.exists():
        raise ConfigError(
            f"no {CONFIG_NAME} found. Create one with:  cartidx init")
    raw = tomllib.loads(path.read_text(encoding="utf-8"))
    base = path.resolve().parent
    known = set(REGISTRY) | set(platforms.PLATFORMS)
    systems = _string_list(raw.get("systems"))
    media = _string_list(raw.get("media"))
    bad = [s for s in systems if s not in known]
    if bad:
        raise ConfigError(f"unknown system(s): {', '.join(bad)}. "
                          f"Known: {', '.join(sorted(known))}")
    allowed_media = {"cartridge", "disc", "console", "accessory", "floppy", "pcb", "directory"}
    bad_m = [m for m in media if m not in allowed_media]
    if bad_m:
        raise ConfigError(f"unknown media: {', '.join(bad_m)}. "
                          f"Choose from {', '.join(sorted(allowed_media))}")
    cfg = Config(
        path=path,
        base=base,
        workspace=_path(base, raw.get("workspace", "workspace")),
        reference=_path(base, raw.get("reference", "data/reference")),
        collection=_path(base, raw.get("collection", "collection")),
        workbook=_path(base, raw["workbook"]) if raw.get("workbook") else None,
        systems=systems,
        media=media,
    )
    names = Counter()
    for i, lib in enumerate(raw.get("libraries", [])):
        name = lib.get("name") or f"library{i + 1}"
        names[name] += 1
        if "root" not in lib:
            raise ConfigError(f"library {name!r} has no root")
        systems = {}
        for sid, folders in (lib.get("systems") or {}).items():
            if sid not in REGISTRY:
                raise ConfigError(
                    f"library {name!r}: unknown system {sid!r}. "
                    f"Known: {', '.join(sorted(REGISTRY))}")
            systems[sid] = [folders] if isinstance(folders, str) else list(folders)
        cfg.libraries.append(Library(
            name=name, root=_path(base, lib["root"]), systems=systems,
            exclude=tuple(lib.get("exclude", DEFAULT_EXCLUDE))))
    dupes = [n for n, c in names.items() if c > 1]
    if dupes:
        raise ConfigError(f"duplicate library names: {', '.join(dupes)}")
    return cfg


def detect_systems(root: Path, max_depth: int = 2) -> dict[str, list[str]]:
    """Guess the system map for a library root.

    Folders named for a system id are claimed first (retro-pi lays libraries
    out as roms/<id>, others as <maker>/<id>). Then every claimed folder is
    checked for extensions only one system uses, because libraries share
    folders in practice: SG-1000 cartridges live in the Master System folder,
    and a stray .32x sits among Genesis dumps.
    """
    from .systems import REGISTRY

    root = Path(root)
    found: dict[str, list[str]] = {}
    for d in sorted(p for p in root.rglob("*") if p.is_dir()):
        rel = d.relative_to(root)
        if len(rel.parts) > max_depth or any(
                part.startswith((".", "_")) for part in rel.parts):
            continue
        if d.name.lower() in REGISTRY:
            found.setdefault(d.name.lower(), []).append(str(rel))

    owners = Counter(e for s in REGISTRY.values() for e in s.exts if e)
    unique = {e: s.id for s in REGISTRY.values() for e in s.exts if e and owners[e] == 1}
    for sid, folders in list(found.items()):
        for folder in list(folders):
            # Recursive: a holding folder (_regional, _duplicates) is still part
            # of the library, and a stray cartridge set aside there counts.
            exts = Counter(
                p.suffix.lower() for p in (root / folder).rglob("*")
                if p.is_file() and not p.name.startswith(".")
                and not set(p.relative_to(root / folder).parts) & set(DEFAULT_EXCLUDE))
            for ext, _n in exts.items():
                other = unique.get(ext)
                if other and other != sid and folder not in found.setdefault(other, []):
                    found[other].append(folder)
    return {k: v for k, v in found.items() if v}


def render(root: Path | None, systems: dict[str, list[str]], name: str = "main",
           workbook: Path | None = None, scope: list[str] | None = None,
           media: list[str] | None = None) -> str:
    def q(s):
        return '"' + str(s).replace("\\", "\\\\").replace('"', '\\"') + '"'

    scope = list(scope or sorted(systems))
    lines = [
        "# cartridge-index configuration. Relative paths resolve against this file.",
        "# systems = platforms this library indexes. media = optional type filter.",
        "systems = [" + ", ".join(q(s) for s in scope) + "]",
    ]
    lines.append("media   = [" + ", ".join(q(m) for m in media) + "]" if media else
                 '# media   = ["cartridge"]')
    lines += [
        'workspace  = "workspace"       # generated: catalog, SQLite, web data',
        'reference  = "data/reference"  # fetched: DATs and metadata (cartidx fetch)',
        'collection = "collection"      # personal: inventory and price guide',
    ]
    lines.append(f"workbook   = {q(workbook)}" if workbook else
                 '# workbook = "~/path/to/price-guide.ods"')
    if root:
        lines += ["", "[[libraries]]", f"name = {q(name)}", f"root = {q(root)}", "",
                  "[libraries.systems]"]
        for sid in sorted(systems):
            v = systems[sid]
            val = q(v[0]) if len(v) == 1 else "[" + ", ".join(q(x) for x in v) + "]"
            lines.append(f"{sid:<12} = {val}")
    return "\n".join(lines) + "\n"
