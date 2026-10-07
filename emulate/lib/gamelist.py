#!/usr/bin/env python3
"""Generate EmulationStation gamelist.xml files from a ROM directory.

Without a gamelist, EmulationStation shows raw filenames -- "Legend of Zelda,
The (USA) (Rev 1).nes". This derives a clean title from standard No-Intro /
GoodTools naming so the frontend looks right with no scraping and no network.

Existing gamelists are MERGED, never overwritten: entries you have scraped
(descriptions, images, ratings, play counts) are preserved, and only games
missing from the list are added. Absolute paths inside the ROM directory match
their relative entries, so a rebuild does not append a duplicate. A game whose
file has disappeared is reported but left alone.

    lib/gamelist.py <system_id> <rom_dir> <out_xml> [--ext .nes --ext .zip]
    lib/gamelist.py --clean-name "Legend of Zelda, The (USA) (Rev 1).nes"
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import xml.etree.ElementTree as ET

# Parenthetical/bracketed tags used by the common ROM naming conventions:
# regions, languages, revisions, dump status, translations.
_TAG = re.compile(
    r"""\s*
    (?:
        \((?:[^()]*)\)      # (USA), (Europe), (Rev 1), (v1.1), (En,Fr,De)
      | \[(?:[^\[\]]*)\]    # [!], [b1], [T+Eng], [a]
    )""",
    re.VERBOSE,
)

# "Zelda, The" -> "The Zelda"; also handles A / An / Le / La / Les / Der / Die.
_ARTICLE = re.compile(r"^(.*?),\s*(The|A|An|Le|La|Les|Los|Las|Der|Die|Das|Il|El|L')$",
                      re.IGNORECASE)

_MULTISPACE = re.compile(r"\s{2,}")


def clean_name(filename: str) -> str:
    """Filename -> display title."""
    name = os.path.basename(filename)
    name = os.path.splitext(name)[0]
    name = name.replace("_", " ")
    name = _TAG.sub("", name)
    name = _MULTISPACE.sub(" ", name).strip()
    # Tag removal can leave a dangling separator ("Game - (USA)" -> "Game -").
    # Strip those, but never a trailing period: it belongs to abbreviations
    # like "Super Mario Bros." and "Dr. Mario".
    while name and name[-1] in "-_ ":
        name = name[:-1]
    while name and name[0] in "-_ ":
        name = name[1:]
    m = _ARTICLE.match(name)
    if m:
        body, article = m.group(1).strip(), m.group(2)
        article = article if article.endswith("'") else article + " "
        name = f"{article}{body}"
    return name or os.path.splitext(os.path.basename(filename))[0]


def sort_name(title: str) -> str:
    """Title for sorting: leading article moved to the end."""
    m = re.match(r"^(The|A|An)\s+(.*)$", title, re.IGNORECASE)
    return f"{m.group(2)}, {m.group(1)}" if m else title


# Archives are usually named more loosely than the ROM inside them
# ("perfect-dark.zip" wrapping "Perfect Dark (U) (V1.1) [!].z64"). When an
# archive holds exactly one ROM, that inner name is the better title source.
_ARCHIVE_EXT = {".zip", ".7z"}


def archive_inner_name(path: str) -> str | None:
    """Sole entry inside a single-ROM archive, else None."""
    if os.path.splitext(path)[1].lower() != ".zip":
        return None  # .7z needs a third-party library; not a dependency here
    try:
        import zipfile
        with zipfile.ZipFile(path) as zf:
            entries = [i.filename for i in zf.infolist()
                       if not i.is_dir() and not i.filename.startswith("__MACOSX")]
    except Exception:
        return None  # unreadable or not really a zip: fall back to the filename
    return entries[0] if len(entries) == 1 else None


def title_source(rom_path: str) -> str:
    """The filename a title should be derived from."""
    if os.path.splitext(rom_path)[1].lower() in _ARCHIVE_EXT:
        inner = archive_inner_name(rom_path)
        if inner:
            return os.path.basename(inner)
    return os.path.basename(rom_path)


def find_roms(rom_dir: str, extensions: list[str]) -> list[str]:
    """Return relative ROM paths without following directory symlinks."""
    wanted = {e.lower() for e in extensions}
    found = []
    for directory, dirs, files in os.walk(rom_dir, followlinks=False):
        # ES-DE excludes the entire subtree marked by noload.txt.
        if "noload.txt" in files:
            dirs[:] = []
            continue
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for entry in files:
            if entry.startswith(".") or entry == "_ABOUT.txt":
                continue
            path = os.path.join(directory, entry)
            if os.path.isfile(path) and os.path.splitext(entry)[1].lower() in wanted:
                found.append(os.path.relpath(path, rom_dir))
    return sorted(found)


def entry_key(path: str, rom_dir: str) -> str:
    """Identity shared by relative, ./relative, and in-tree absolute paths."""
    raw = (path or "").strip()
    if not raw:
        return ""
    normalized = os.path.normpath(os.path.expanduser(raw))
    if not os.path.isabs(normalized):
        return normalized
    # Resolve parents only. /var and /private/var must match, but a ROM symlink
    # must keep its name inside the library rather than follow its target.
    root = os.path.realpath(rom_dir)
    parent, name = os.path.split(normalized)
    located = os.path.join(os.path.realpath(parent), name) if parent else normalized
    try:
        rel = os.path.relpath(located, root)
    except ValueError:
        return normalized
    if rel == os.pardir or rel.startswith(os.pardir + os.sep):
        return normalized
    return rel


def load_existing(path: str, rom_dir: str):
    """-> (root_element, {rom_path: game_element}). Tolerates a missing file."""
    if not os.path.exists(path):
        return ET.Element("gameList"), {}
    try:
        tree = ET.parse(path)
    except ET.ParseError as exc:
        raise SystemExit(f"gamelist.py: {path} is not valid XML ({exc}); "
                         "move it aside and re-run")
    root = tree.getroot()
    index = {}
    for game in root.findall("game"):
        key = entry_key(game.findtext("path") or "", rom_dir)
        # Keep the first entry: a later duplicate must not replace scraped data.
        if key and key not in index:
            index[key] = game
    return root, index


def indent(elem, level=0):
    """Pretty-print in place (ET.indent needs Python 3.9+; this works anywhere)."""
    pad = "\n" + "  " * level
    if len(elem):
        if not (elem.text or "").strip():
            elem.text = pad + "  "
        for child in elem:
            indent(child, level + 1)
        if not (elem.tail or "").strip():
            elem.tail = pad
        if not (elem[-1].tail or "").strip():
            elem[-1].tail = pad
    elif level and not (elem.tail or "").strip():
        elem.tail = pad


def generate(system_id: str, rom_dir: str, out_xml: str,
             extensions: list[str], dry_run: bool = False) -> dict:
    if not os.path.isdir(rom_dir):
        return {"system": system_id, "added": 0, "kept": 0, "missing": 0, "total": 0}

    roms = find_roms(rom_dir, extensions)
    root, existing = load_existing(out_xml, rom_dir)

    added = kept = 0
    for rom in roms:
        if rom in existing:
            kept += 1
            continue
        game = ET.SubElement(root, "game")
        ET.SubElement(game, "path").text = f"./{rom}"
        title = clean_name(title_source(os.path.join(rom_dir, rom)))
        ET.SubElement(game, "name").text = title
        srt = sort_name(title)
        if srt != title:
            ET.SubElement(game, "sortname").text = srt
        added += 1

    present = set(roms)
    missing = [p for p in existing if p not in present]

    if not dry_run and (added or not os.path.exists(out_xml)):
        os.makedirs(os.path.dirname(out_xml), exist_ok=True)
        indent(root)
        ET.ElementTree(root).write(out_xml, encoding="UTF-8", xml_declaration=True)

    return {"system": system_id, "added": added, "kept": kept,
            "missing": len(missing), "total": len(roms)}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("system", nargs="?")
    ap.add_argument("rom_dir", nargs="?")
    ap.add_argument("out_xml", nargs="?")
    ap.add_argument("--ext", action="append", default=[], dest="extensions")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--clean-name", help="show the title derived from a filename")
    ap.add_argument("--title-for", help="show the title derived from a file on disk, "
                                        "looking inside single-ROM archives")
    args = ap.parse_args()

    if args.clean_name:
        print(clean_name(args.clean_name))
        return 0

    if args.title_for:
        print(clean_name(title_source(args.title_for)))
        return 0

    if not (args.system and args.rom_dir and args.out_xml):
        ap.error("system, rom_dir and out_xml are required")
    if not args.extensions:
        ap.error("at least one --ext is required")

    r = generate(args.system, args.rom_dir, args.out_xml,
                 args.extensions, args.dry_run)
    print(f"{r['system']}\t{r['total']}\t{r['added']}\t{r['kept']}\t{r['missing']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
