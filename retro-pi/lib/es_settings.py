#!/usr/bin/env python3
"""Merge retro-pi's managed keys into an EmulationStation es_settings.xml.

Settings files are the frontend's own state: this MERGES rather than replaces,
so anything you changed in the UI survives. An existing key keeps the element
type the frontend chose for it (<string>/<bool>/<int>); only new keys get a
type inferred from their value.

    lib/es_settings.py <es_settings.xml> KEY=VALUE [KEY=VALUE ...]
"""
from __future__ import annotations

import sys
import xml.etree.ElementTree as ET


def infer_type(value: str) -> str:
    if value in ("true", "false"):
        return "bool"
    if value.lstrip("-").isdigit():
        return "int"
    return "string"


def merge(target: str, wanted: dict) -> tuple[int, int]:
    try:
        root = ET.parse(target).getroot()
    except (FileNotFoundError, ET.ParseError):
        root = ET.Element("config")

    index = {el.get("name"): el for el in list(root) if el.get("name")}
    updated = added = 0
    for key, value in wanted.items():
        node = index.get(key)
        if node is None:
            node = ET.SubElement(root, infer_type(value))
            node.set("name", key)
            added += 1
        else:
            updated += 1
        node.set("value", value)

    # Readable, stable formatting.
    root.text = "\n    "
    for el in list(root):
        el.tail = "\n    "
    if len(root):
        root[-1].tail = "\n"
    ET.ElementTree(root).write(target, encoding="UTF-8", xml_declaration=True)
    return updated, added


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        sys.stderr.write(__doc__)
        return 2
    target, pairs = argv[1], argv[2:]
    wanted = {}
    for p in pairs:
        if "=" not in p:
            sys.stderr.write(f"es_settings: not a KEY=VALUE pair: {p}\n")
            return 2
        k, v = p.split("=", 1)
        wanted[k] = v
    updated, added = merge(target, wanted)
    print(f"updated {updated}, added {added}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
