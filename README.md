# Rewind Arcade

> Retro gaming workspace: browser arcade recreations, console emulation via ES-DE, and a physical game catalog.

[![License](https://img.shields.io/github/license/bamr87/rewind-arcade)](LICENSE) [![Live site](https://img.shields.io/badge/live-bamr87.github.io%2Frewind--arcade-2ea44f)](https://bamr87.github.io/rewind-arcade/)

## Overview

A **retro gaming workspace for every format**: play original recreations in the browser, emulate the consoles, and catalog the cartridges and discs on the shelf.

Three pillars, one set of system ids.

| Pillar | What it is | Entry |
|---|---|---|
| **Play** | Client-side portal: recreations, in-browser console loader, catalog browser, systems atlas | [`arcade/`](arcade/README.md) · [play it](https://bamr87.github.io/rewind-arcade/) |
| **Emulate** | ES-DE (EmulationStation Desktop Edition), the main ROM frontend, backed by RetroArch on macOS, Raspberry Pi, and Debian | [`emulate/`](emulate/README.md) · `./bin/retropi` |
| **Catalog** | Physical inventory, dump identification, prices, SQLite analytics | [`catalog/`](catalog/README.md) · `./bin/cartidx` |

System ids are shared. `roms/nes` that emulate laid out is the same `nes` the catalog hashes, values, and files on a shelf. The full map is [`systems/registry.yaml`](systems/registry.yaml) and the encyclopedia in [`docs/systems/`](docs/systems/README.md).

## Quick start

```sh
# Play — browser arcade, no backend
npm install --prefix arcade && npm run dev --prefix arcade

# Emulate — desktop ROM library and emulator stack
./bin/retropi doctor
./bin/retropi install           # ES-DE + RetroArch + cores + configuration
./bin/retropi frontend launch   # browse and launch your own ROMs in ES-DE

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
| Play Pong / JezzBall / Breakout / Snake / Asteroids / Minesweeper / SkiFree / Pellet Panic / Silo Sentinel / Touchdown / Gridlock / Crate Shift / Flak Shack / Rockfall / Lode Digger / Blockfall / Rogue's Hour | `arcade/` |
| Load a dump in the browser | `arcade/` → `#/emulate` |
| Browse a cartidx export | `arcade/` → `#/catalog` |
| Boot a NES, PS1, or Dreamcast ROM on a Mac or Pi | `./bin/retropi install` then `build` |
| Know whether a dump is a real No-Intro image | `./bin/cartidx scan` |
| Track loose / CIB value and a wishlist | `./bin/cartidx inventory` + `serve` |
| Add a console | one YAML in `emulate/config/systems/` — [guide](emulate/docs/adding-systems.md) |
| See every platform this repo knows | [docs/systems](docs/systems/README.md) |

Emulate ships **38** console manifests with two dozen systems enabled in a fresh ES-DE frontend. ES-DE is the primary interface for the local ROM library; RetroArch and standalone emulators run the games. The browser console loader remains an optional, separate experience, not a desktop ES-DE replacement. Catalog identifies **8** cartridge families from dump bytes and accepts a wider shelf of platforms for inventory and prices. Arcade ships **17** original recreations, an in-browser console loader (`#/emulate`), a catalog browser (`#/catalog`), and a systems atlas (`#/systems`).

## retro-pi (imported)

[`retro-pi/`](retro-pi/) is the former [bamr87/retro-pi](https://github.com/bamr87/retro-pi) repository, imported here with its full history: the portable retro-gaming workspace for macOS and Raspberry Pi, whose declarative manifests drive EmulationStation and RetroArch. It is the hardware-side counterpart of `emulate/` and keeps its own README, `bin/retropi` and tests, run from inside `retro-pi/`. Its `ci.yml` does not run from this path and is kept as the reference for folding its checks (`retropi config validate`, `tests/run.sh`) into this repository's workflows.

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

## Contributing

Contributions are welcome via pull request. Use [Conventional Commits](https://www.conventionalcommits.org/) and keep the CI checks green. The fleet-wide workflow is described in the hub's [CONTRIBUTING.md](https://github.com/bamr87/bamr87/blob/main/CONTRIBUTING.md). AI agents should start with [AGENTS.md](AGENTS.md) (with [CLAUDE.md](CLAUDE.md) for Claude Code).

## Changelog

Notable changes are recorded in [CHANGELOG.md](CHANGELOG.md); the full record is in the [commit history](https://github.com/bamr87/rewind-arcade/commits/main).

## License

Released under the [MIT License](LICENSE).

---

<!-- bamr87-portfolio-footer -->
Part of the [bamr87 portfolio](https://github.com/bamr87) — browse every project on [Amr's GitHub profile](https://github.com/bamr87).
