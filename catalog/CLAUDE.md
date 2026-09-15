# CLAUDE.md

Guidance for working in this repository.

## What this is

The catalog pillar of Rewind Arcade (cartridge-index): titles you track, a physical inventory, and optional dump file references, joined in one SQLite catalog. See README.md. System ids match emulate/ (retro-pi).

## Hard constraints

**Standard library only.** Python 3.11+, no pip packages. `tomllib`, `sqlite3`, `zipfile`, `urllib` and `xml.etree` cover everything. This matches retro-pi, which this project sits beside.

**Never commit game data or personal data.** ROM files are referenced in place. `cartridge.toml` (drive paths), `collection/` (what the user owns and paid), `data/reference/` (third-party data) and `workspace/` stay out of git. Tests build synthetic cartridge images in `tests/romgen.py`; never add a real dump.

**Never download games.** `fetch` retrieves metadata only.

**Never move, copy, zip or delete dumps.** File references (path, hashes, identification) are recorded in place. There is no organize or bundle command.

## One definition of each thing

These exist because duplicated copies drifted and each drift was a silent bug:

- **Columns** live in `schema.py`. CSV, SQLite and the web page all read it.
  `tests/test_web.py` fails if the page reads a field the schema does not export.
- **Title matching** lives in `matching.py`. Do not write a second normaliser.
- **Reference paths** live in `sources/__init__.py`.
- **Naming and copy roles** live in `stages/tiers.py`; a dump's `slug` and `plan_tier` describe it in the catalog, not a destination on disk.
- **The library** is `games`: one row per system and title, built in `stages/catalog.py`.

## Matching rules that earned their place

Read the docstring of `matching.py` and docs/matching.md before touching it. In short: the sequence signature gates every tier and is read from words, never from a normalised key; the title before a subtitle matches only when there is exactly one separator; our own filename suffixes are stripped first; reviewed false positives go in `data/rejects.csv` with a reason. Err towards a missing match.

When you change matching, compare a build against the previous catalog and read every value that was lost. Some will be regressions. Others will be the previous catalog's false positives, and those are the more important finding.

## Distrust a check that flags too much

When a validation flags an implausibly large share of a library, the check is usually wrong, not the library. It happened three times: a 128-byte NES copier footer (663 files), the 512-byte SNES copier header (757 of 857), and 32KB SMS/Game Gear cartridges whose header ends exactly at the image's last byte. Emulators accept all of them. Make such things notes, not warnings, and add a synthetic test that pins the boundary.

## One read per file

Scanning identifies and validates in the same pass. A separate validation pass once re-read 6.5 GB and, run in the wrong order, blanked 2,756 verdicts. Keep per-file work inside `System.inspect()`.

## Markdown

One line per prose paragraph; do not hard-wrap. A global pre-commit hook (`~/.git-hooks/unwrap-prose.py`) joins wrapped paragraphs and restages the file, so wrapped prose gets rewritten at commit time anyway. Tables, lists, headings and code blocks are left alone, so wrap those however reads best.

## Tests

`make test`. Any change to a parser needs a synthetic image that exercises it; any wrong match that is fixed needs a case in `tests/test_matching.py`.
