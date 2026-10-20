#!/usr/bin/env python3
"""Import games from an archive laid out with one folder per console.

Bulk collections are organised by folder ("Sega Genesis/", "Nintendo 64/"),
and that folder name is often the only reliable signal: .bin and .zip belong
to a dozen systems, and some extensions (.sg) belong to none the extension
table knows. retro-pi resolves the folder names to system ids, then this
extracts each entry into the right place.

    romimport.py plan    <archive>
    romimport.py extract <archive> <roms_dir> <mapfile> [--dry-run] [--overwrite]

`plan` prints "topfolder<TAB>count<TAB>extensions" per folder.
`mapfile` holds "topfolder<TAB>system_id" lines; unmapped folders are skipped.
Existing files are never overwritten unless --overwrite is given.
"""
from __future__ import annotations

import os
import sys
import zipfile

SKIP_PREFIXES = ("__MACOSX", ".")


def _entries(zf: zipfile.ZipFile):
    for info in zf.infolist():
        if info.is_dir():
            continue
        name = info.filename
        if any(part.startswith(SKIP_PREFIXES) for part in name.split("/")):
            continue
        yield info


ROOT = "(root)"


def _topfolder(name: str) -> str:
    """Top-level folder, or ROOT for entries sitting at the archive root.

    A sentinel rather than "": with IFS set to tab, bash's `read` treats tab as
    whitespace, so an empty leading field collapses and shifts every column.
    """
    parts = name.split("/")
    return parts[0] if len(parts) > 1 else ROOT


def cmd_plan(archive: str) -> int:
    with zipfile.ZipFile(archive) as zf:
        folders: dict[str, list] = {}
        for info in _entries(zf):
            folders.setdefault(_topfolder(info.filename), []).append(info)
    for folder in sorted(folders):
        infos = folders[folder]
        exts = sorted({os.path.splitext(i.filename)[1].lower() for i in infos})
        total = sum(i.file_size for i in infos)
        print(f"{folder}\t{len(infos)}\t{' '.join(e for e in exts if e)}\t{total}")
    return 0


def cmd_extract(archive: str, roms_dir: str, mapfile: str,
                dry_run: bool = False, overwrite: bool = False) -> int:
    mapping = {}
    with open(mapfile, encoding="utf-8") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if "\t" in line:
                folder, system = line.split("\t", 1)
                mapping[folder] = system

    with zipfile.ZipFile(archive) as zf:
        for info in _entries(zf):
            folder = _topfolder(info.filename)
            system = None if folder == ROOT else mapping.get(folder)
            base = os.path.basename(info.filename)
            if not base:
                continue
            if not system:
                print(f"-\t{base}\tunmapped")
                continue

            dest_dir = os.path.join(roms_dir, system)
            dest = os.path.join(dest_dir, base)
            if os.path.exists(dest) and not overwrite:
                print(f"{system}\t{base}\texists")
                continue
            if dry_run:
                print(f"{system}\t{base}\twould-add")
                continue

            os.makedirs(dest_dir, exist_ok=True)
            # Stream rather than zf.extract(): that would recreate the archive's
            # folder structure under roms/, which is not what we want.
            tmp = dest + ".part"
            with zf.open(info) as src, open(tmp, "wb") as out:
                while True:
                    chunk = src.read(1024 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)
            os.replace(tmp, dest)
            print(f"{system}\t{base}\tadded")
    return 0


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        sys.stderr.write(__doc__)
        return 2
    cmd, archive = argv[1], argv[2]
    if not zipfile.is_zipfile(archive):
        sys.stderr.write(f"romimport: not a zip archive: {archive}\n")
        return 1
    if cmd == "plan":
        return cmd_plan(archive)
    if cmd == "extract":
        if len(argv) < 5:
            sys.stderr.write("romimport: extract needs <archive> <roms_dir> <mapfile>\n")
            return 2
        return cmd_extract(archive, argv[3], argv[4],
                           dry_run="--dry-run" in argv,
                           overwrite="--overwrite" in argv)
    sys.stderr.write(f"romimport: unknown command {cmd!r}\n")
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
