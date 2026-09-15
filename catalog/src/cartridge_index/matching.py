"""Title matching -- the one place two titles are compared.

Every join in this project is a title comparison: a ROM to its community
rating, to a price, to a sales record, to a cartridge on the shelf, and a dump
no hash can place to the nearest name in a DAT. Each of those joins used to
carry its own copy of these rules, the copies drifted, and every drift was a
wrong number attached to a cartridge. So there is one copy, and the rules that
earned their place are written down here:

* A title's *numbers* are its identity. "Dig Dug" is not "Dig Dug II", "Sonic"
  is not "Sonic 2", "Ready 2 Rumble Boxing - Round 2" is not the first game.
  Every tier, exact included, requires the sequence signature to agree.
* The title before a subtitle is its own tier ("head"), and only when there
  is exactly one separator. An unrestricted version turned compilations into
  their first game -- "Spider-Man - X-Men - Arcade's Revenge" matched plain
  "Spider-Man" on three consoles -- and removing it outright cost ~40 correct
  prices ("Abadox - The Deadly Inner War" is simply "Abadox" in a price guide).
* This project's own filename bookkeeping (-overdump, -unidentified,
  -unverified-dump) is not part of any title, and is stripped first.
* Some pairs clear every automatic gate and are still different games
  ("OutRunners"/"OutRun", "Super Cars"/"Super C"). They are recorded by hand
  in data/rejects.csv, one reviewed pair per line.

A missing match can be filled in later. A wrong one silently corrupts every
analysis built on it, so each tier here errs towards missing.
"""

from __future__ import annotations

import csv
import difflib
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

ROMAN = {"ii": "2", "iii": "3", "iv": "4", "v": "5", "vi": "6", "vii": "7",
         "viii": "8", "ix": "9", "x": "10", "xi": "11", "xii": "12"}
_UNROMAN = {v: k for k, v in ROMAN.items()}

BRACKETS = re.compile(r"\s*[\[(][^\])]*[\])]")
PIPE_TAG = re.compile(r"(?:[-\s_]+(?:unidentified|overdump|unverified|dump|dup(?:[-\s_]\d+)?|"
                      r"eng|usa|jpn|eur|jp|us|eu))+$", re.I)
# "Disney's" arrives as "disney s" once a slug has eaten the apostrophe.
PUBLISHER_PREFIX = re.compile(
    r"^(walt disney|disney|sega|nintendo|capcom|konami|tom clancy|jim henson)"
    r"(?:'s|'|\s+s|s)\s+", re.I)
# The subset of PIPE_TAG this tool itself appends. Region and language words are
# ignored when *comparing* titles, but they are information in a *name*:
# "-eng" on an unidentified dump marks an English fan translation.
OUR_SUFFIX = re.compile(r"(?:[-\s_]+(?:unidentified|overdump|unverified|dump|"
                        r"dup(?:[-\s_]\d+)?))+$", re.I)
SUBTITLE = re.compile(r"\s+-\s+|:\s+")
EDITIONS = re.compile(
    r"\s*[\[(](?:[^\])]*(?:edition|bundle|version|not for resale|player'?s choice|"
    r"greatest hits|classics|limited|collector|signature|sealed|5 screw|3 screw|"
    r"cartridge only|manual only|box only|homebrew)[^\])]*)[\])]", re.I)

# Filename conventions that say nothing about the game: GoodTools condition
# codes, and the "# SMS" system marks some Sega libraries put in the name.
GOODTOOLS = re.compile(r"\s*[\[(](?:!|[abcfhopt]\d*|U|E|J|JU|UE|W|F|G|S|I|M\d|"
                       r"PD|Unl|hack|fix|alt|c|bad ?dump|over ?dump)[\])]", re.I)
SYSTEM_MARK = re.compile(r"\s*#\s*(SMS|GG|SG-?1000|SC-?3000|SF-?7000|32X|MD|GEN)\b",
                         re.I)


def fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s))
    return "".join(c for c in s if not unicodedata.combining(c))


def strip_tags(s: str) -> str:
    """Drop bracketed tags and this project's own filename suffixes."""
    return PIPE_TAG.sub("", BRACKETS.sub("", str(s))).strip()


def norm(s: str) -> str:
    """Fold a title to a comparison key: no case, punctuation, articles or tags."""
    s = EDITIONS.sub("", fold(s))
    s = strip_tags(s)
    s = s.replace("°", " degrees ")
    s = re.sub(r"\s*&\s*", " ", s)
    s = re.sub(r"[-_]+", " ", s)          # slugs: "disney-s-..." must read as words
    s = PUBLISHER_PREFIX.sub("", s.strip())
    s = re.sub(r"\b(the|a|an|and)\b", " ", s, flags=re.I)
    return re.sub(r"[^a-z0-9]", "", s.lower())


def seq(s: str) -> str:
    """Every number a title claims, in order.

    Brackets and our own suffixes go first, so "WWF Raw (1994)" agrees with
    "WWF Raw". Digit runs are read from inside words, so "GT64" agrees with
    "GT 64" and "4in1" with "4 in 1".
    """
    out = []
    for w in re.split(r"[^a-z0-9]+", strip_tags(fold(s)).lower()):
        if w in ROMAN:
            out.append(ROMAN[w])
        else:
            out += re.findall(r"\d+", w)
    return "".join(out)


def head(s: str) -> str | None:
    """The title before its subtitle -- only when there is exactly one subtitle.

    "Abadox - The Deadly Inner War" has a head ("Abadox"). "Spider-Man - X-Men -
    Arcade's Revenge" does not: two separators mark a compilation or crossover,
    and its first part is a different game.
    """
    parts = SUBTITLE.split(strip_tags(str(s)))
    return parts[0] if len(parts) == 2 and len(norm(parts[0])) >= 4 else None


def variants(s: str) -> set[str]:
    words = re.split(r"[\s:_-]+", str(s).lower())
    v = {norm(s),
         norm(" ".join(ROMAN.get(w, w) for w in words)),
         norm(" ".join(_UNROMAN.get(w, w) for w in words))}
    v.discard("")
    return v


def slugify(name: str, limit: int = 100) -> str:
    s = fold(name).replace("&", " and ").replace("'", "").replace("’", "")
    s = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower()
    return re.sub(r"-{2,}", "-", s)[:limit].strip("-")


def base_title(nointro_name: str) -> str:
    """A No-Intro name without its parenthetical tags: the title itself."""
    return re.sub(r"\s*\([^)]*\)", "", str(nointro_name)).strip()


def tidy_filename(stem: str) -> str:
    """A readable title from a filename, when the filename is all there is.

    Handles both raw dump names ("Super_Mario_Bros_(U)_[!]") and the slugs this
    tool writes ("castlevania-iii-draculas-curse-overdump").
    """
    s = SYSTEM_MARK.sub("", str(stem))
    s = GOODTOOLS.sub("", s)
    s = re.sub(r"\s+32X$", "", s, flags=re.I)
    slug_like = bool(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)+", s))
    s = OUR_SUFFIX.sub("", s)
    s = s.replace("_", " ")
    if slug_like:
        s = " ".join(w.upper() if w in ROMAN else w.capitalize()
                     for w in s.split("-"))
    s = re.sub(r"\s{2,}", " ", s).strip(" -_.")
    return s or str(stem)


def load_rejects(path: Path | None = None) -> set[tuple[str, str]]:
    """Reviewed pairs that must never match, normalised, in both directions."""
    path = Path(path) if path else Path(__file__).parent / "data" / "rejects.csv"
    out = set()
    if not path.exists():
        return out
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            a, b = norm(r.get("title", "")), norm(r.get("not", ""))
            if a and b:
                out.add((a, b))
                out.add((b, a))
    return out


@dataclass
class Match:
    item: dict
    how: str          # "title" | "fuzzy" | "prefix"


class TitleIndex:
    """Match titles against a pool of records, conservatively.

    Tiers, each gated on the sequence signature and the reject list:
      title   an exact normalised variant
      head    the part before a single subtitle separator, on either side
              ("Abadox - The Deadly Inner War" <-> "Abadox")
      fuzzy   difflib >= cutoff, within titles carrying the same digits
      prefix  one title extends the other, >= 55% overlap, and exactly one
              distinct candidate qualifies -- ambiguity is a non-match
    """

    def __init__(self, items, title=lambda m: m["title"], prefer=None,
                 rejects=None, cutoff=0.92):
        self.title = title
        self.prefer = prefer or (lambda m: (len(title(m)), title(m)))
        self.rejects = load_rejects() if rejects is None else set(rejects)
        self.cutoff = cutoff
        self.exact: dict[str, list] = {}
        self.heads: dict[str, list] = {}
        self.by_norm: dict[str, list] = {}
        for m in items:
            t = title(m)
            n = norm(t)
            if not n:
                continue
            self.by_norm.setdefault(n, []).append(m)
            for k in variants(t):
                self.exact.setdefault(k, []).append(m)
            h = head(t)
            if h:
                for k in variants(h):
                    self.heads.setdefault(k, []).append(m)
        self.by_digits: dict[str, list] = {}
        for k in self.by_norm:
            self.by_digits.setdefault(re.sub(r"\D", "", k), []).append(k)

    def __len__(self):
        return sum(len(v) for v in self.by_norm.values())

    def _ok(self, query: str, cand) -> bool:
        ct = self.title(cand)
        return seq(query) == seq(ct) and (norm(query), norm(ct)) not in self.rejects

    def _best(self, cands):
        uniq = list({id(c): c for c in cands}.values())
        return min(uniq, key=self.prefer)

    def match(self, *titles, fuzzy=True, prefix=True) -> Match | None:
        titles = [t for t in titles if t]
        for t in titles:
            cands = [m for k in variants(t) for m in self.exact.get(k, [])]
            cands = [m for m in cands if self._ok(t, m)]
            if cands:
                return Match(self._best(cands), "title")
        if not titles:
            return None
        for t in titles:
            # Query "Abadox - The Deadly Inner War" against a pool holding "Abadox",
            # and query "Mickey Mania" against a pool holding its subtitled form.
            h = head(t)
            cands = [m for k in variants(h) for m in self.exact.get(k, [])] if h else []
            cands += [m for k in variants(t) for m in self.heads.get(k, [])]
            cands = [m for m in cands if self._ok(t, m)]
            if len({norm(self.title(m)) for m in cands}) == 1:
                return Match(self._best(cands), "head")
        t = titles[0]
        k = norm(t)
        if not k:
            return None
        if fuzzy:
            pool = self.by_digits.get(re.sub(r"\D", "", k), [])
            for close in difflib.get_close_matches(k, pool, n=3, cutoff=self.cutoff):
                cands = [m for m in self.by_norm[close] if self._ok(t, m)]
                if cands:
                    return Match(self._best(cands), "fuzzy")
        if prefix and len(k) >= 5:
            hits = {}
            for mk, items in self.by_norm.items():
                if len(mk) < 5 or not (mk.startswith(k) or k.startswith(mk)):
                    continue
                if min(len(mk), len(k)) / max(len(mk), len(k)) < 0.55:
                    continue
                ok = [m for m in items if self._ok(t, m)]
                if ok:
                    hits[mk] = ok
            if len(hits) == 1:
                return Match(self._best(next(iter(hits.values()))), "prefix")
        return None
