#!/usr/bin/env python3
"""Import games from an archive laid out with one folder per console.

Bulk collections are organised by folder ("Sega Genesis/", "Nintendo 64/"),
and that folder name is often the only reliable signal: .bin and .zip belong
to a dozen systems, and some extensions (.sg) belong to none the extension
table knows. retro-pi resolves the folder names to system ids, then this
extracts each entry into the right place.

    romimport.py plan    <archive>
    romimport.py extract <archive> <roms_dir> <mapfile> [--dry-run] [--overwrite]

`plan` prints "topfolder<TAB>count<TAB>extensions<TAB>bytes" per folder.
`mapfile` holds "topfolder<TAB>system_id" lines; unmapped folders are skipped.
Existing files are never overwritten unless --overwrite is given.

A collection can also be a plain directory - an external drive, a NAS share -
whose system folders may sit at any depth ("nintendo/nes/great/"). Those games
are LINKED into roms/<system>/ by default, never moved or rewritten, so the
collection stays the source of truth:

    romimport.py plan-dir <source> [--all-folders]
    romimport.py link     <source> <roms_dir> <mapfile> [--copy] [--dry-run]
                          [--overwrite] [--saves <dir>] [--metadata <csv>]
                          [--metadata-out <dir>] [--all-folders]

`plan-dir` prints "reldir<TAB>count<TAB>extensions<TAB>bytes" for every folder
that holds files, and "!reldir<TAB>count<TAB><TAB>bytes" for each folder it
holds back (names starting "_" or ".": holding, duplicate and tooling folders;
--all-folders includes "_" folders). For `link`, the mapfile holds
"dir<TAB>reldir<TAB>system_id" and "ext<TAB>system_id<TAB>.a .b" lines; see
cmd_link for the routing rules. Each result line is
"system<TAB>file<TAB>status".
"""
from __future__ import annotations

import csv
import json
import os
import shutil
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


# --- directory collections ---------------------------------------------------

# Extensions that say nothing about the console: several systems claim them,
# so they never move a file away from the system its folder names.
GENERIC_EXTS = {".zip", ".7z", ".bin", ".rom"}

# Battery saves kept beside the ROMs; RetroArch looks for <rom>.srm in its
# savefile directory, so they are copied there (never overwriting).
SAVE_EXTS = {".srm"}


def _held_back(name: str, all_folders: bool) -> bool:
    if name.startswith("."):
        return True
    return name.startswith("_") and not all_folders


def _walk(source: str, all_folders: bool):
    """Yield (reldir, files, held) for every directory under source.

    held is True for a directory that is excluded, reported once at its top.
    """
    for directory, dirs, files in os.walk(source):
        keep = []
        for d in sorted(dirs):
            if _held_back(d, all_folders):
                path = os.path.join(directory, d)
                count = size = 0
                for sub, _, subfiles in os.walk(path):
                    for f in subfiles:
                        if not f.startswith("."):
                            count += 1
                            try:
                                size += os.path.getsize(os.path.join(sub, f))
                            except OSError:
                                pass
                yield os.path.relpath(path, source), count, size, True
            else:
                keep.append(d)
        dirs[:] = keep
        real = [f for f in sorted(files) if not f.startswith(".")]
        rel = os.path.relpath(directory, source)
        yield (ROOT if rel == "." else rel), real, directory, False


def cmd_plan_dir(source: str, all_folders: bool = False) -> int:
    for rel, files, extra, held in _walk(source, all_folders):
        if held:
            print(f"!{rel}\t{files}\t\t{extra}")
            continue
        if not files:
            continue
        exts = sorted({os.path.splitext(f)[1].lower() for f in files})
        total = 0
        for f in files:
            try:
                total += os.path.getsize(os.path.join(extra, f))
            except OSError:
                pass
        print(f"{rel}\t{len(files)}\t{' '.join(e for e in exts if e)}\t{total}")
    return 0


def _read_linkmap(mapfile: str):
    dirs, exts = {}, {}
    with open(mapfile, encoding="utf-8") as fh:
        for line in fh:
            parts = line.rstrip("\n").split("\t")
            if parts[0] == "dir" and len(parts) == 3:
                dirs[parts[1]] = parts[2]
            elif parts[0] == "ext" and len(parts) == 3:
                exts[parts[1]] = {e.lower() for e in parts[2].split()}
    return dirs, exts


def route(folder_system: str, ext: str, exts: dict) -> tuple[str | None, str]:
    """-> (system, reason). The folder decides; a specific extension the
    folder's system does not take goes to the one system that does take it
    (SG-1000 .sg files kept in a Master System folder)."""
    ext = ext.lower()
    if ext in exts.get(folder_system, set()):
        return folder_system, ""
    if not ext or ext in GENERIC_EXTS:
        return None, "unsupported"
    claimants = [s for s, e in exts.items() if ext in e]
    if len(claimants) == 1:
        return claimants[0], ""
    return None, "ambiguous" if claimants else "unsupported"


def _rating(value: str) -> str | None:
    """A rating on a 0-1, 0-5 or 0-10 scale -> ES-DE's 0-1."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    if v <= 0:
        return None
    scale = 1.0 if v <= 1 else 5.0 if v <= 5 else 10.0 if v <= 10 else 100.0
    return f"{min(v / scale, 1.0):.2f}"


# Catalog column -> gamelist field. The first column present wins.
META_COLUMNS = {
    "name": ("display_name", "name", "title"),
    "desc": ("desc", "description", "summary"),
    "rating": ("rating_bayesian", "rating", "community_rating"),
    "year": ("year", "release_year"),
    "releasedate": ("releasedate", "release_date"),
    "genre": ("genre",),
    "developer": ("developer",),
    "publisher": ("publisher",),
    "players": ("max_players", "players"),
}


def load_metadata(csv_path: str, source: str) -> dict:
    """{source-relative path: {field: value}} from a catalog CSV.

    Rows join on a `path` column relative to the collection root; a `file`
    column (basename) is the fallback when no path is given.
    """
    out = {}
    with open(csv_path, encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        cols = set(reader.fieldnames or [])
        pick = {field: next((c for c in names if c in cols), None)
                for field, names in META_COLUMNS.items()}
        for row in reader:
            key = (row.get("path") or "").strip()
            if key:
                if os.path.isabs(key):
                    key = os.path.relpath(key, source)
                key = os.path.normpath(key)
            else:
                key = (row.get("file") or "").strip()
            if not key:
                continue
            fields = {}
            for field, col in pick.items():
                val = (row.get(col) or "").strip() if col else ""
                if not val:
                    continue
                if field == "rating":
                    val = _rating(val)
                elif field == "year":
                    field, val = "releasedate", (f"{int(float(val)):04d}0101T000000"
                                                 if val.replace(".", "", 1).isdigit() else None)
                elif field == "players":
                    val = val.split(".")[0]
                if val:
                    fields.setdefault(field, val)
            if fields:
                out[key] = fields
    return out


def _same_file(a: str, b: str) -> bool:
    try:
        return os.path.samefile(a, b)
    except OSError:
        return False


def cmd_link(source: str, roms_dir: str, mapfile: str, copy: bool = False,
             dry_run: bool = False, overwrite: bool = False,
             saves_dir: str | None = None, metadata: str | None = None,
             metadata_out: str | None = None, all_folders: bool = False) -> int:
    source = os.path.realpath(source)
    dirs, exts = _read_linkmap(mapfile)
    meta = load_metadata(metadata, source) if metadata else {}
    by_file = {}
    for k, v in meta.items():
        by_file.setdefault(os.path.basename(k), []).append(v)

    planned = {}            # dest path -> source path
    collected = {}          # system -> {basename: fields}
    systems_seen = set()

    def emit(system, name, status):
        print(f"{system}\t{name}\t{status}")

    for rel, files, absdir, held in _walk(source, all_folders):
        if held:
            continue
        folder_system = dirs.get(rel)
        for name in files:
            ext = os.path.splitext(name)[1].lower()
            src = os.path.join(absdir, name)
            if ext in SAVE_EXTS:
                if not folder_system or not saves_dir:
                    continue
                dest = os.path.join(saves_dir, name)
                if os.path.exists(dest):
                    emit(folder_system, name, "save-exists")
                elif dry_run:
                    emit(folder_system, name, "save-would-add")
                else:
                    os.makedirs(saves_dir, exist_ok=True)
                    shutil.copy2(src, dest)
                    emit(folder_system, name, "save-added")
                continue
            if not folder_system:
                emit("-", os.path.join(rel, name), "unmapped")
                continue
            system, why = route(folder_system, ext, exts)
            if not system:
                emit(folder_system, os.path.join(rel, name), why)
                continue
            systems_seen.add(system)
            dest = os.path.join(roms_dir, system, name)
            if dest in planned:
                emit(system, os.path.join(rel, name), "collision")
                continue
            planned[dest] = src

            relsrc = os.path.normpath(os.path.join(rel, name)) if rel != ROOT else name
            fields = meta.get(relsrc)
            if fields is None and len(by_file.get(name, [])) == 1:
                fields = by_file[name][0]
            if fields:
                collected.setdefault(system, {})[name] = fields

            status = _place(src, dest, copy, dry_run, overwrite, source)
            emit(system, name, status)

    # Prune links this collection owns whose game is gone or has moved.
    if not copy:
        for system in sorted(systems_seen | set(dirs.values())):
            sysdir = os.path.join(roms_dir, system)
            if not os.path.isdir(sysdir):
                continue
            for name in sorted(os.listdir(sysdir)):
                path = os.path.join(sysdir, name)
                if not os.path.islink(path) or path in planned:
                    continue
                target = os.path.join(sysdir, os.readlink(path))
                if not os.path.normpath(target).startswith(source + os.sep):
                    continue
                if dry_run:
                    emit(system, name, "would-prune")
                else:
                    os.unlink(path)
                    emit(system, name, "pruned")

    if metadata_out and collected and not dry_run:
        os.makedirs(metadata_out, exist_ok=True)
        for system, games in collected.items():
            path = os.path.join(metadata_out, f"{system}.json")
            merged = {}
            if os.path.exists(path):
                with open(path, encoding="utf-8") as fh:
                    merged = json.load(fh)
            merged.update(games)
            with open(path + ".tmp", "w", encoding="utf-8") as fh:
                json.dump(merged, fh, indent=1, sort_keys=True, ensure_ascii=False)
            os.replace(path + ".tmp", path)
    for system, games in sorted(collected.items()):
        print(f"{system}\t{len(games)}\tmetadata")
    return 0


def _place(src: str, dest: str, copy: bool, dry_run: bool, overwrite: bool,
           source: str) -> str:
    """Link or copy one game; never touches the source."""
    exists = os.path.lexists(dest)
    if exists:
        if os.path.islink(dest) and not copy:
            target = os.path.normpath(os.path.join(os.path.dirname(dest), os.readlink(dest)))
            if target == src:
                return "kept"
            # A link into this collection is ours: follow a game that moved
            # (re-rated from good/ to great/). Anything else stays put.
            if not (overwrite or target.startswith(source + os.sep)):
                return "exists"
            if dry_run:
                return "would-relink"
            os.unlink(dest)
            os.symlink(src, dest)
            return "relinked"
        if copy and _same_file(dest, src):
            return "kept"
        if not overwrite:
            return "exists"
    if dry_run:
        return "would-add"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if exists:
        os.unlink(dest)
    if copy:
        tmp = dest + ".part"
        shutil.copy2(src, tmp)
        os.replace(tmp, dest)
    else:
        os.symlink(src, dest)
    return "added"


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        sys.stderr.write(__doc__)
        return 2
    cmd, archive = argv[1], argv[2]
    if cmd in ("plan-dir", "link"):
        return _main_dir(cmd, argv[2:])
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


def _main_dir(cmd: str, args: list[str]) -> int:
    def opt(flag):
        if flag in args:
            i = args.index(flag)
            if i + 1 < len(args):
                val = args[i + 1]
                del args[i:i + 2]
                return val
        return None
    saves, metadata, meta_out = opt("--saves"), opt("--metadata"), opt("--metadata-out")
    flags = {a for a in args if a.startswith("--")}
    pos = [a for a in args if not a.startswith("--")]
    all_folders = "--all-folders" in flags
    if not pos or not os.path.isdir(pos[0]):
        sys.stderr.write(f"romimport: not a directory: {pos[0] if pos else ''}\n")
        return 1
    if cmd == "plan-dir":
        return cmd_plan_dir(pos[0], all_folders)
    if len(pos) < 3:
        sys.stderr.write("romimport: link needs <source> <roms_dir> <mapfile>\n")
        return 2
    if metadata and not os.path.isfile(metadata):
        sys.stderr.write(f"romimport: no such metadata file: {metadata}\n")
        return 1
    return cmd_link(pos[0], pos[1], pos[2], copy="--copy" in flags,
                    dry_run="--dry-run" in flags, overwrite="--overwrite" in flags,
                    saves_dir=saves, metadata=metadata, metadata_out=meta_out,
                    all_folders=all_folders)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
