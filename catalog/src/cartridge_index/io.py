"""File input and output. Every write is atomic.

A catalog that is half-written when a run is interrupted is worse than the
previous one, because nothing about it looks wrong. Writes go to a sibling
temporary file and are renamed into place.
"""

from __future__ import annotations

import csv
import json
import os
import tempfile
from pathlib import Path


def _atomic(path: Path, write) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", newline="", encoding="utf-8") as f:
            write(f)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass
        raise


def read_csv(path: Path) -> list[dict]:
    path = Path(path)
    if not path.exists():
        return []
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def write_csv(path: Path, rows, columns) -> None:
    columns = list(columns)

    def write(f):
        w = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({c: _cell(r.get(c)) for c in columns})

    _atomic(path, write)


def _cell(v):
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else ""
    if isinstance(v, float):
        return f"{v:.4f}".rstrip("0").rstrip(".")
    return v


def read_json(path: Path, default=None):
    path = Path(path)
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data, indent=None) -> None:
    _atomic(path, lambda f: json.dump(data, f, indent=indent,
                                      separators=None if indent else (",", ":")))


def write_text(path: Path, text: str) -> None:
    _atomic(path, lambda f: f.write(text))
