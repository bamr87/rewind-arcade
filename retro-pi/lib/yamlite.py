#!/usr/bin/env python3
"""Dependency-free YAML reader for retro-pi manifests (module name avoids
shadowing PyYAML's own `yaml` module -- lib/ sits first on sys.path).

retro-pi must run on a stock Raspberry Pi OS image and a stock macOS box with
nothing installed beyond bash + python3. PyYAML is used when present; otherwise
this module falls back to a parser covering the subset the manifests use:

  * nested block mappings (indentation-based)
  * block sequences ("- item" / "- key: value")
  * flow sequences ([a, b, c]) and empty flow maps ({})
  * quoted and bare scalars, #-comments, booleans, ints, floats, null
  * multi-document files are NOT supported (and not needed)

CLI:
  yamlite.py get    FILE KEY.PATH [default]   scalar -> stdout (lists -> one/line)
  yamlite.py keys   FILE [KEY.PATH]           child mapping keys, one per line
  yamlite.py len    FILE KEY.PATH             length of a list/mapping
  yamlite.py has    FILE KEY.PATH             exit 0 if the path exists
  yamlite.py json   FILE [FILE...]            merged JSON to stdout
  yamlite.py flat   FILE [FILE...]           dotted.path=value lines (deep-merged)
  yamlite.py check  FILE [FILE...]            parse-only validation

Key paths are dotted; list elements are indexed numerically: emulators.0.core
"""
from __future__ import annotations

import json
import os
import re
import sys

# ---------------------------------------------------------------- scalars ----

_CONSTS = {
    "true": True, "True": True, "yes": True, "on": True,
    "false": False, "False": False, "no": False, "off": False,
    "null": None, "Null": None, "~": None, "": None,
}


def _scalar(tok: str):
    tok = tok.strip()
    if len(tok) >= 2 and tok[0] == tok[-1] and tok[0] in "\"'":
        inner = tok[1:-1]
        return inner.replace('\\"', '"') if tok[0] == '"' else inner
    if tok in _CONSTS:
        return _CONSTS[tok]
    try:
        return int(tok)
    except ValueError:
        pass
    try:
        return float(tok)
    except ValueError:
        pass
    return tok


def _flow_seq(tok: str):
    """Parse [a, "b, c", d] honoring quotes."""
    body = tok[1:-1].strip()
    if not body:
        return []
    out, cur, quote = [], "", None
    for ch in body:
        if quote:
            cur += ch
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
            cur += ch
        elif ch == ",":
            out.append(_scalar(cur))
            cur = ""
        else:
            cur += ch
    if cur.strip():
        out.append(_scalar(cur))
    return out


def _value(tok: str):
    tok = tok.strip()
    if tok.startswith("[") and tok.endswith("]"):
        return _flow_seq(tok)
    if tok.startswith("{") and tok.endswith("}"):
        return {} if not tok[1:-1].strip() else _flow_map(tok)
    return _scalar(tok)


def _flow_map(tok: str):
    out = {}
    for part in tok[1:-1].split(","):
        if ":" in part:
            k, v = part.split(":", 1)
            out[k.strip().strip("\"'")] = _scalar(v)
    return out


def _strip_comment(line: str) -> str:
    """Remove a trailing #-comment that is not inside quotes."""
    quote = None
    for i, ch in enumerate(line):
        if quote:
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
        elif ch == "#" and (i == 0 or line[i - 1] in " \t"):
            return line[:i]
    return line

# ----------------------------------------------------------------- parser ----


class YamlError(ValueError):
    pass


def _read_block(lines, i, parent_indent, style, chomp):
    """Consume a block scalar body; return (text, next_line_index).

    style '|' keeps newlines, '>' folds them into spaces (blank line =
    paragraph break). chomp '-' strips the trailing newline, '+' keeps all,
    '' (clip) keeps exactly one.
    """
    body = []
    j = i
    while j < len(lines):
        raw = lines[j]
        if not raw.strip():
            body.append("")
            j += 1
            continue
        indent = len(raw) - len(raw.lstrip())
        if indent <= parent_indent:
            break
        body.append(raw.rstrip())
        j += 1
    trailing_blanks = 0
    while body and not body[-1]:
        body.pop()
        trailing_blanks += 1
    if not body:
        return "", j
    base = min(len(l) - len(l.lstrip()) for l in body if l.strip())
    out = [l[base:] if l.strip() else "" for l in body]

    if style == "|":
        text = "\n".join(out)
    else:
        parts, cur = [], []
        for l in out:
            if not l:
                parts.append(" ".join(cur))
                cur = []
            else:
                cur.append(l.strip())
        parts.append(" ".join(cur))
        text = "\n".join(parts)

    if chomp == "-":
        text = text.rstrip("\n")
    elif chomp == "+":
        # "keep" retains the line terminator AND every trailing blank line.
        text += "\n" * (1 + trailing_blanks)
    else:
        text = text.rstrip("\n") + "\n" if text else text
    return text, j


_BLOCK_RE = re.compile(r"^(?P<key>.*?):[ \t]*(?P<style>[|>])(?P<chomp>[+-]?)[ \t]*$")


def _tokenize(text: str):
    """-> list of (indent, content, lineno, literal) for significant lines.

    `literal` is None except for a block scalar, where it carries the already
    resolved string so the parser never re-splits it.
    """
    rows = []
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        raw = lines[i]
        n = i + 1
        if raw.lstrip().startswith("#") or not raw.strip():
            i += 1
            continue
        if raw.strip() in ("---", "..."):
            i += 1
            continue
        indent = len(raw) - len(raw.lstrip())
        if "\t" in raw[:indent]:
            raise YamlError(f"line {n}: tab used for indentation")

        # A block scalar header must be detected before comment stripping,
        # because '#' inside the block body is content, not a comment.
        m = _BLOCK_RE.match(raw.strip())
        if m and not m.group("key").endswith(("|", ">")):
            value, i = _read_block(lines, i + 1, indent, m.group("style"), m.group("chomp"))
            rows.append((indent, m.group("key").strip() + ":", n, value))
            continue

        line = _strip_comment(raw).rstrip()
        if not line.strip():
            i += 1
            continue
        rows.append((indent, line.strip(), n, None))
        i += 1
    return rows


def _parse_block(rows, idx, indent):
    """Parse siblings at >= `indent`; return (value, next_index)."""
    if idx >= len(rows):
        return None, idx
    if rows[idx][3] is None and (rows[idx][1] == "-" or rows[idx][1].startswith("- ")):
        return _parse_seq(rows, idx, rows[idx][0])
    return _parse_map(rows, idx, rows[idx][0])


def _parse_map(rows, idx, indent):
    out = {}
    while idx < len(rows):
        ind, content, lineno, literal = rows[idx]
        if ind < indent:
            break
        if ind > indent:
            raise YamlError(f"line {lineno}: unexpected indent")
        if literal is None and content.startswith("- "):
            break
        if literal is not None:
            out[content[:-1].strip().strip("\"'")] = literal
            idx += 1
            continue
        if ":" not in content:
            raise YamlError(f"line {lineno}: expected 'key: value', got {content!r}")
        key, _, rest = content.partition(":")
        key = key.strip().strip("\"'")
        rest = rest.strip()
        if rest:
            out[key] = _value(rest)
            idx += 1
            continue
        # nested block (or an explicit empty value)
        if idx + 1 < len(rows) and rows[idx + 1][0] > ind:
            child, idx = _parse_block(rows, idx + 1, rows[idx + 1][0])
            out[key] = child
        else:
            out[key] = None
            idx += 1
    return out, idx


def _parse_seq(rows, idx, indent):
    out = []
    while idx < len(rows):
        ind, content, lineno, literal = rows[idx]
        if literal is not None:
            break
        if ind < indent or not (content == "-" or content.startswith("- ")):
            break
        item = content[2:].strip() if content.startswith("- ") else ""
        if not item:
            if idx + 1 < len(rows) and rows[idx + 1][0] > ind:
                child, idx = _parse_block(rows, idx + 1, rows[idx + 1][0])
                out.append(child)
            else:
                out.append(None)
                idx += 1
            continue
        if ":" in item and not item.startswith(("[", "{", '"', "'")):
            # inline mapping start: "- key: value" plus deeper continuation lines
            key, _, rest = item.partition(":")
            entry = {key.strip(): _value(rest) if rest.strip() else None}
            idx += 1
            if idx < len(rows) and rows[idx][0] > ind:
                child, idx = _parse_map(rows, idx, rows[idx][0])
                entry.update(child)
            out.append(entry)
            continue
        out.append(_value(item))
        idx += 1
    return out, idx


def _fallback_load(text: str):
    rows = _tokenize(text)
    if not rows:
        return {}
    value, idx = _parse_block(rows, 0, rows[0][0])
    if idx != len(rows):
        raise YamlError(f"line {rows[idx][2]}: could not parse {rows[idx][1]!r}")
    return value


_PYYAML = None  # None = unresolved, False = unavailable, else the module


def _pyyaml():
    """PyYAML when it is genuinely installed, else None.

    RETROPI_YAML_PURE=1 forces the built-in parser so CI can exercise the
    Raspberry Pi path (no PyYAML) from a Mac that happens to have it.
    """
    global _PYYAML
    if _PYYAML is None:
        if os.environ.get("RETROPI_YAML_PURE") == "1":
            _PYYAML = False
        else:
            try:
                import yaml  # type: ignore
                _PYYAML = yaml if hasattr(yaml, "safe_load") else False
            except ImportError:
                _PYYAML = False
    return _PYYAML or None


def load(text: str):
    mod = _pyyaml()
    if mod is None:
        return _fallback_load(text)
    try:
        return mod.safe_load(text) or {}
    except Exception as exc:  # surface PyYAML errors in our own vocabulary
        raise YamlError(str(exc).replace("\n", " ")) from None


def load_file(path: str):
    with open(path, "r", encoding="utf-8") as fh:
        try:
            return load(fh.read())
        except YamlError as exc:
            raise YamlError(f"{path}: {exc}") from None

# -------------------------------------------------------------- traversal ----


_MISSING = object()


def dig(data, path: str, default=_MISSING):
    cur = data
    if path:
        for part in path.split("."):
            if isinstance(cur, dict) and part in cur:
                cur = cur[part]
            elif isinstance(cur, list) and part.lstrip("-").isdigit():
                i = int(part)
                if -len(cur) <= i < len(cur):
                    cur = cur[i]
                else:
                    return _miss(path, default)
            else:
                return _miss(path, default)
    return cur


def _miss(path, default):
    if default is _MISSING:
        raise KeyError(path)
    return default


def deep_merge(base, over):
    """Mappings merge recursively; every other type is replaced wholesale."""
    if isinstance(base, dict) and isinstance(over, dict):
        out = dict(base)
        for k, v in over.items():
            out[k] = deep_merge(base[k], v) if k in base else v
        return out
    return over


def emit(value) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (list, tuple)):
        return "\n".join(emit(v) for v in value)
    if isinstance(value, dict):
        return "\n".join(str(k) for k in value)
    return str(value)


def flatten(data, prefix=""):
    if isinstance(data, dict):
        for k, v in data.items():
            yield from flatten(v, f"{prefix}.{k}" if prefix else str(k))
    elif isinstance(data, list):
        for i, v in enumerate(data):
            yield from flatten(v, f"{prefix}.{i}")
    else:
        yield prefix, emit(data)

# ------------------------------------------------------------------- main ----


def main(argv):
    if len(argv) < 3:
        sys.stderr.write(__doc__)
        return 2
    cmd, path = argv[1], argv[2]
    try:
        if cmd == "json":
            merged = {}
            for p in argv[2:]:
                merged = deep_merge(merged, load_file(p))
            json.dump(merged, sys.stdout, indent=2, sort_keys=True)
            sys.stdout.write("\n")
            return 0
        if cmd == "check":
            for p in argv[2:]:
                load_file(p)
            return 0

        if cmd == "flat":
            merged = {}
            for p in argv[2:]:
                merged = deep_merge(merged, load_file(p))
            for k, v in flatten(merged):
                print(f"{k}={v}")
            return 0

        data = load_file(path)
        key = argv[3] if len(argv) > 3 else ""

        if cmd == "get":
            default = argv[4] if len(argv) > 4 else _MISSING
            val = dig(data, key, default)
            out = emit(val)
            if out:
                print(out)
            return 0
        if cmd == "keys":
            val = dig(data, key, {})
            if isinstance(val, dict):
                print("\n".join(val)) if val else None
            elif isinstance(val, list):
                print("\n".join(str(i) for i in range(len(val)))) if val else None
            return 0
        if cmd == "len":
            val = dig(data, key, [])
            print(len(val) if hasattr(val, "__len__") else 0)
            return 0
        if cmd == "has":
            try:
                return 0 if dig(data, key) is not None else 1
            except KeyError:
                return 1
    except (YamlError, OSError) as exc:
        sys.stderr.write(f"yaml: {exc}\n")
        return 1
    except KeyError as exc:
        sys.stderr.write(f"yaml: key not found: {exc}\n")
        return 1

    sys.stderr.write(f"yaml: unknown command {cmd!r}\n")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
