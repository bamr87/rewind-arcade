# Catalog — cartridge-index

The **catalog** pillar of [Rewind Arcade](../README.md): a library and index for a retro game collection — the titles you track, the cartridges on the shelf, and optional dump file references, as one SQLite catalog with a browser for analytics.

```sh
./bin/cartidx init --systems nes,snes,n64   # selected platforms -> cartridge.toml
./bin/cartidx fetch                         # reference data, once (~110 MB)
./bin/cartidx build                         # identify refs, enrich, export
./bin/cartidx serve                         # browse at http://127.0.0.1:8765
```

Python 3.11 or later and nothing else: no pip, no virtualenv, no database server. Run it from the checkout, or `pip install .` for a `cartidx` command.

ROM folders are optional. `cartidx init --root /path/to/roms` still detects system folders and records dumps in place; files are never moved, renamed, copied or zipped.

If no library folder is reachable when you build (a drive is unplugged), `build` keeps the file references from the last build instead of scanning to an empty catalog, and says so.

## What it answers

| Question | How |
|---|---|
| What do I track? | The `games` catalog: one row per system and title for the platforms you selected |
| What is this dump, really? | Hashes the bytes a preservation database indexes (header stripped, byte order fixed) against No-Intro, and keeps the path as a reference |
| Will it boot? | Reads the cartridge's own header: iNES geometry and reset vector, SNES checksum, Genesis `SEGA` and checksum, SMS `TMR SEGA`, N64 boot CRCs |
| Is it any good? | LaunchBox community ratings, shrunk per system so a single 5-star vote does not outrank a thousand 4.7s |
| What is it worth, and what did it sell? | Your price guide (loose / complete / sealed), plus VGChartz critic scores and sales |
| What do I own, and do I have a dump of it? | A physical inventory linked to the catalog and valued from the price guide |
| What should I look for next? | The `wishlist` view: top-rated games you own no copy of |
| How complete is this platform? | The `coverage` view and the Analyze tab: owned share, dump-ref share, value, ratings |

## Digital and physical

A collection has two halves that are usually tracked in unrelated places:

- **Games** (`workspace/games.csv`): one row per title on the platforms you index. Built from inventory, dump references, and reference metadata.
- **File references** (`workspace/roms.csv`): one row per dump file, scanned from the libraries in `cartridge.toml` when you configure them. Files are referenced in place and never copied or moved.
- **Inventory** (`collection/inventory.csv`): one row per physical item. You own this file. `cartidx inventory import` seeds it from price-guide rows marked owned, and `cartidx inventory add` appends to it. Nothing else writes to it.

They join on system and title. A game row learns how many copies are on the shelf (`owned_count`) and how many dump references it has (`rom_count`).

## Commands

| Command | Does |
|---|---|
| `cartidx init [--root DIR]` | write `cartridge.toml`, optionally detecting system folders; `--systems` and `--media` select what to index |
| `cartidx status` | libraries, file counts, what reference data is present |
| `cartidx systems` | supported systems and their sources |
| `cartidx fetch [nointro metadat launchbox vgchartz]` | download reference data; `--keep-zip` keeps LaunchBox's Metadata.zip and `--reuse-zip` re-reads it without downloading |
| `cartidx prices import [FILE]` | read a price-guide spreadsheet (`.ods`) or CSV export |
| `cartidx inventory import \| add \| list` | manage the physical collection |
| `cartidx scan` | identify dump files and validate; report only |
| `cartidx build` | scan refs, enrich and export the catalog |
| `cartidx catalog [--owned \| --wishlist]` | list the games library |
| `cartidx export` | rewrite the outputs from the last catalog without rescanning |
| `cartidx serve` | the web browser for the collection |
| `cartidx query "SQL"` | ask the SQLite catalog a question |

Every command takes `--help`.

## What a build produces

Everything generated lands in `workspace/`:

| File | For |
|---|---|
| `games.csv` | the library, one row per title ([columns](docs/data-dictionary.md)) |
| `roms.csv` | dump file references, one row per file |
| `inventory.csv` | your inventory plus value, rating and dump link |
| `systems.csv` | one row per system: hardware facts and catalog counts |
| `cartridge.sqlite` | tables `games`, `roms`, `inventory`, `prices`, `systems`; views `coverage`, `collection_value`, `wishlist` |
| `web/` | a self-contained page: Library, Physical, Analyze, Price guide |

```sh
cartidx query "SELECT system_label, COUNT(*), ROUND(AVG(rating_bayesian),2) FROM games GROUP BY 1"
cartidx query "SELECT * FROM wishlist LIMIT 20"
cartidx query "SELECT * FROM coverage"
```

## Systems

NES, SNES, Nintendo 64, Genesis / Mega Drive, 32X, Master System, Game Gear and SG-1000 can be identified from dump bytes. Inventory and the price guide accept a wider set of platforms (Game Boy through PlayStation, arcade, DOS, and so on). Adding a dump-capable system is a module in `src/cartridge_index/systems/`; see [docs/systems.md](docs/systems.md). System ids are [emulate](../emulate/README.md)'s (retro-pi), so a library it laid out is recognised as is: emulate sets a machine up to *play* games, catalog knows what the games *are*.

`cartridge.toml` names the platforms (and optionally media types) this library captures:

```toml
systems = ["nes", "snes", "n64", "megadrive"]
media   = ["cartridge"]
```

## What never goes in git

| | Where it lives |
|---|---|
| ROM files | on your drives, referenced from `cartridge.toml` |
| `cartridge.toml` | local: it holds absolute paths to your drives |
| `collection/` | local: what you own and what you paid |
| `data/reference/` | fetched: third-party data under its own terms |
| `workspace/` | generated |

`.gitignore` enforces all of it, including the common ROM extensions. The repository holds code, tests built on synthetic cartridge images, and one piece of hand-curated data: [the title pairs that must never match](src/cartridge_index/data/rejects.csv).

## Reference data

| Source | Provides | Fetched from |
|---|---|---|
| No-Intro DATs | what a dump is | libretro-database |
| libretro metadata | developer, publisher, genre, year and month, franchise, players, ESRB, serial, origin, Edge and Famitsu scores | libretro-database |
| LaunchBox Games Database | community ratings, release dates and types, descriptions, video links, box / logo / title / cart art file names, console hardware facts | gamesdb.launchbox-app.com |
| VGChartz (via Kaggle) | critic scores, sales | kaggle.com, anonymously |

Each is third-party data under its own terms. It is downloaded to your machine and never redistributed; `data/reference/SOURCES.json` records the URL, time and SHA-1 of every file.

**Art is referenced, not downloaded.** The art columns hold LaunchBox image file names; the images stay on `images.launchbox-app.com`, and the web page loads a cover only when you open a title.

**VGChartz sales are a floor, not a ranking.** The dataset lost the figures for most of the biggest sellers: most of the cartridges it scores 9 or better have no sales number at all. `build` warns about this every run. See [docs/matching.md](docs/matching.md).

## Layout

```
bin/cartidx                  run from the checkout, no install
src/cartridge_index/
  cli.py                     commands
  config.py                  cartridge.toml, system-folder detection, library scope
  schema.py                  every column of every output, defined once
  matching.py                every title comparison, defined once
  dat.py                     No-Intro and libretro DAT parsing
  platforms.py               platform ids for anything on a shelf
  systems/                   one module per console family
  sources/                   fetch reference data; read price guides
  stages/                    scan, tiers, enrich, physical, catalog, export
  web/index.html             the browser
  data/rejects.csv           reviewed title pairs that must never match
tests/                       unittest; synthetic cartridge images only
docs/                        systems, matching, data dictionary
```

## Development

```sh
make test      # the whole suite, stdlib unittest
make check     # tests plus a byte-compile of every module
```
