# Rewind Arcade

A **retro gaming workspace for every format**: play original recreations in the browser, emulate the consoles, and catalog the cartridges and discs on the shelf.

Three pillars, one set of system ids.

| Pillar | What it is | Entry |
|---|---|---|
| **Play** | Client-side portal: recreations, in-browser console loader, catalog browser, systems atlas | [`arcade/`](arcade/README.md) · [play it](https://bamr87.github.io/rewind-arcade/) |
| **Emulate** | RetroArch + EmulationStation on macOS, Raspberry Pi, and Debian | [`emulate/`](emulate/README.md) · `./bin/retropi` |
| **Catalog** | Physical inventory, dump identification, prices, SQLite analytics | [`catalog/`](catalog/README.md) · `./bin/cartidx` |

System ids are shared. `roms/nes` that emulate laid out is the same `nes` the catalog hashes, values, and files on a shelf. The full map is [`systems/registry.yaml`](systems/registry.yaml) and the encyclopedia in [`docs/systems/`](docs/systems/README.md).

## Quick start

```sh
# Play — browser arcade, no backend
npm install --prefix arcade && npm run dev --prefix arcade

# Emulate — what does this machine need?
./bin/retropi doctor

# Catalog — index the platforms you collect
./bin/cartidx init --systems nes,snes,n64
```

`make help` lists the common targets. Each pillar keeps its own CLI, tests, and docs; this root is the map.

## What's in the tree

```
arcade/                 browser games (React + canvas + Web Audio)
emulate/                retro-pi: manifests, RetroArch, EmulationStation
catalog/                cartridge-index: dumps, inventory, prices, SQLite
systems/registry.yaml   one id per platform, used by every pillar
docs/                   encyclopedia, getting started, legal
bin/retropi             wrapper → emulate/bin/retropi
bin/cartidx             wrapper → catalog/bin/cartidx
```

The **engine** in `arcade/` knows nothing about any specific game. The **emulate** tooling never special-cases a console in code — a system is one YAML file. The **catalog** never moves a dump; it records what a file *is* and what you *own*.

## Systems and formats

Cartridges, discs, floppies, tapes, arcade PCBs, and original PC software. Nintendo, Sega, Sony, Atari, NEC, SNK, Commodore, Bandai, Coleco, Mattel, and microcomputer lines.

| You want to… | Use |
|---|---|
| Play Pong / JezzBall / Breakout / Snake / Asteroids / Minesweeper | `arcade/` |
| Load a dump in the browser | `arcade/` → `#/emulate` |
| Browse a cartidx export | `arcade/` → `#/catalog` |
| Boot a NES, PS1, or Dreamcast ROM on a Mac or Pi | `./bin/retropi install` then `build` |
| Know whether a dump is a real No-Intro image | `./bin/cartidx scan` |
| Track loose / CIB value and a wishlist | `./bin/cartidx inventory` + `serve` |
| Add a console | one YAML in `emulate/config/systems/` — [guide](emulate/docs/adding-systems.md) |
| See every platform this repo knows | [docs/systems](docs/systems/README.md) |

Emulate ships **38** console manifests (24 enabled in a fresh frontend). Catalog identifies **8** cartridge families from dump bytes and accepts a wider shelf of platforms for inventory and prices. Arcade ships **6** original recreations, an in-browser console loader (`#/emulate`), a catalog browser (`#/catalog`), and a systems atlas (`#/systems`).

## Documentation

- [Getting started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [Formats](docs/formats.md)
- [Systems encyclopedia](docs/systems/README.md)
- [Legal](docs/legal.md)
- Emulate: [commands](emulate/docs/commands.md) · [macOS](emulate/docs/macos.md) · [Pi](emulate/docs/raspberry-pi.md) · [Debian](emulate/docs/debian.md)
- Catalog: [systems](catalog/docs/systems.md) · [matching](catalog/docs/matching.md) · [data dictionary](catalog/docs/data-dictionary.md)

## Constraints that do not move

**No game content in git.** Emulators and cores are fair game to download. Games and BIOS images are not. Catalog `fetch` retrieves metadata only. Arcade games are original recreations, not dumps.

**bash 3.2 and python3** for emulate. **Python 3.11+ stdlib only** for catalog. **React + TypeScript + Vite** for arcade; the build is static files.

## Development

```sh
make test          # emulate suite + catalog suite
make check         # arcade production build + both suites
make play          # arcade dev server
```

Pillar-specific notes: [`arcade/CLAUDE.md`](arcade/CLAUDE.md), [`emulate/CLAUDE.md`](emulate/CLAUDE.md), [`catalog/CLAUDE.md`](catalog/CLAUDE.md).
