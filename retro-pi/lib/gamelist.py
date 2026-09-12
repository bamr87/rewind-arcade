#!/usr/bin/env python3
"""Generate EmulationStation gamelist.xml files from a ROM directory.

Without a gamelist, EmulationStation shows raw filenames -- "Legend of Zelda,
The (USA) (Rev 1).nes". This derives a clean title from standard No-Intro /
GoodTools naming so the frontend looks right with no scraping and no network.

Existing gamelists are MERGED, never overwritten: entries you have scraped
(descriptions, images, ratings, play counts) are preserved, and only games
missing from the list are added. A game whose file has disappeared is reported
but left alone.

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


def find_roms(rom_dir: str, extensions: list[str]) -> list[str]:
    wanted = {e.lower() for e in extensions}
    found = []
    for entry in sorted(os.listdir(rom_dir)):
        path = os.path.join(rom_dir, entry)
        if not os.path.isfile(path):
            continue
        if entry.startswith(".") or entry == "_ABOUT.txt":
            continue
        if os.path.splitext(entry)[1].lower() in wanted:
            found.append(entry)
    return found


def load_existing(path: str):
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
        p = (game.findtext("path") or "").strip()
        if p:
            index[os.path.basename(p)] = game
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
    root, existing = load_existing(out_xml)

    added = kept = 0
    for rom in roms:
        if rom in existing:
            kept += 1
            continue
        game = ET.SubElement(root, "game")
        ET.SubElement(game, "path").text = f"./{rom}"
        title = clean_name(rom)
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
    args = ap.parse_args()

    if args.clean_name:
        print(clean_name(args.clean_name))
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
