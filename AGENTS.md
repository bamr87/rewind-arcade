# AGENTS.md

Rewind Arcade is a three-pillar retro gaming monorepo. Read `CLAUDE.md` for constraints, then the pillar file for the tree you are touching.

- Play: `arcade/` — `arcade/CLAUDE.md`
- Emulate: `emulate/` — `emulate/CLAUDE.md` (bash 3.2, no pip)
- Catalog: `catalog/` — `catalog/CLAUDE.md` (Python stdlib only)

System ids are defined once in `systems/registry.yaml` and must match `emulate/config/systems/<id>.yaml` and `catalog/src/cartridge_index/platforms.py`.

Never add ROM, BIOS, or personal collection files. Never download games. Never move dumps.

Root commands: `make help`, `./bin/retropi`, `./bin/cartidx`, `npm run dev --prefix arcade`.

## Claude Code notes

Moved verbatim from the former `CLAUDE.md` on 2026-10-20 (decision D4: one canonical agent file). Fold these into the sections above when you next touch them.


Guidance for working in this repository.

## What this is

Rewind Arcade is a monorepo for retro gaming across every format this tree supports: **play** (browser recreations), **emulate** (RetroArch + EmulationStation), and **catalog** (physical + dump index). System ids are shared; see `systems/registry.yaml` and `docs/systems/`.

## Layout

```
arcade/     browser arcade — React + TypeScript + Vite
emulate/    retro-pi — bash 3.2 + python3, no pip
catalog/    cartridge-index — Python 3.11+ stdlib only
docs/       encyclopedia and getting started
systems/    unified id registry
bin/        wrappers that exec emulate/bin/retropi and catalog/bin/cartidx
```

`RETROPI_ROOT` is `emulate/`, not the monorepo root. `cartidx` inserts `catalog/src` on `sys.path`. Do not move those trees without updating the wrappers and CI working directories.

## Commands

```sh
make play                 # arcade dev server
make arcade-build         # tsc + vite → arcade/dist/
./bin/retropi doctor      # emulate audit
./bin/cartidx --help      # catalog CLI
make test                 # emulate + catalog suites
make check                # arcade build + both suites
./bin/ci                  # GitHub workflow jobs on this host
./bin/ci --act            # same YAML via nektos/act (Docker)
```

Arcade has no unit suite; `npm run build --prefix arcade` is the gate (`strict`, unused locals/params fail). Emulate: `make -C emulate check` and `make -C emulate test-linux`. Catalog: `make -C catalog check`.

## Hard constraints (all pillars)

**Never commit game data.** ROM files, BIOS images, `emulate/config/local.yaml`, `catalog/cartridge.toml`, `catalog/collection/`, `catalog/data/reference/`, and `catalog/workspace/` stay out of git.

**Never download games or BIOS.** Cores and emulators, yes. Catalog `fetch` is metadata only. Arcade ships original recreations.

**Do not mix stacks.** Arcade does not import emulate or catalog. Emulate does not call cartidx. Catalog may assume emulate's folder names (`roms/<id>`) but must not import emulate code. Shared truth is `systems/registry.yaml` plus matching ids in `emulate/config/systems/` and `catalog/src/cartridge_index/platforms.py`.

## Where to work

| Change | Live in |
|---|---|
| A browser game | `arcade/src/games/<id>/` + `arcade/src/games/registry.ts` |
| Arcade engine / HUD | `arcade/src/engine/`, `arcade/src/ui/` |
| A console to play | `emulate/config/systems/<id>.yaml` only |
| Dump identification | `catalog/src/cartridge_index/systems/` |
| Shelf / price platforms | `catalog/src/cartridge_index/platforms.py` |
| Title matching | `catalog/src/cartridge_index/matching.py` only |
| Encyclopedia | `docs/systems/`, then `systems/registry.yaml` |

## Pillar notes

Read the pillar file before editing that tree:

- [`arcade/CLAUDE.md`](arcade/CLAUDE.md) — GameManifest / GameInstance seam, hash router, no game imports React
- [`emulate/CLAUDE.md`](emulate/CLAUDE.md) — bash 3.2, `lib/platform.sh` is the only OS branch, never download content
- [`catalog/CLAUDE.md`](catalog/CLAUDE.md) — stdlib only, never move dumps, one definition of columns and matching

## Markdown

One line per prose paragraph; do not hard-wrap. Tables, lists, headings and code blocks may wrap.

## Tests that encode the map

Emulate `tests/test_docs.sh` asserts every command is in `emulate/docs/commands.md` and every internal link in that tree resolves. Catalog `tests/test_docs.py` asserts every CLI command appears as `cartidx <cmd>` in `catalog/README.md` and every schema column is in `catalog/docs/data-dictionary.md`. Do not "clean up" those strings.

## Governance

Read [`docs/constitution.md`](docs/constitution.md) before changing anything: it is the highest-precedence rule set here and wins over this file when they disagree. It changes only through a numbered record in [`docs/amendments/`](docs/amendments/), ratified by the maintainer merging the PR; agents propose, never merge. Every user-facing feature has a stable id in [`features/features.yml`](features/features.yml) with `status`, location and the PRD requirement ids it serves; the PRD's "Feature catalog" block is generated from it (`python3 <bamr87/bamr87>/tools/governance_lint.py prd-sync . --write`; check with `… check .`). Never hand-edit that block or `CHANGELOG.md`.
