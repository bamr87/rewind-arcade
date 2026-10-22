# PRD — Rewind Arcade

> The product requirements for Rewind Arcade: problem, users, goals and non-goals, features, requirements and proposed success measures.

Derived from the README, agent docs, config and code in [`bamr87/rewind-arcade`](https://github.com/bamr87/rewind-arcade). Anything not stated in those sources is marked **TBD**; success metrics are proposals.

## 1. Overview / problem

A retro gaming workspace with three pillars sharing one set of system ids: Play (client-side browser arcade of original recreations), Emulate (ES-DE + RetroArch on macOS, Raspberry Pi and Debian via `./bin/retropi`) and Catalog (physical inventory, dump identification, prices and SQLite analytics via `./bin/cartidx`).

## 2. Target users

- Retro gaming hobbyists who own physical collections
- Players wanting browser recreations with no backend
- Raspberry Pi / desktop emulation builders

## 3. Goals and non-goals

**Goals**

- One system-id registry (`systems/registry.yaml`) shared by every pillar
- Play original recreations in the browser
- Install and configure an emulation stack reproducibly
- Catalog and value a physical collection

**Non-goals**

- Distributing or downloading ROMs/BIOS (never)
- Committing personal collection data
- Cross-importing code between pillars

## 4. Core features (current)

- `arcade/`: React + canvas + Web Audio games (e.g. Banana Barrage, Blockfall, Lode Digger, SkiFree), published to GitHub Pages
- `emulate/` / `retro-pi/`: ES-DE + RetroArch installer, doctor, frontend launch
- `catalog/`: cartridge-index (stdlib Python): dumps, inventory, prices, SQLite
- `systems/registry.yaml` + docs encyclopedia
- Tests that enforce the system-id map across pillars

## 5. Requirements

**Functional**

- System ids must match across registry, emulate configs and catalog platforms
- Catalog `fetch` retrieves metadata only

**Non-functional**

- Emulate scripts target bash 3.2; OS branching only in `lib/platform.sh`
- Catalog uses Python stdlib only
- Never commit game data

## 6. Success metrics (proposed — not defined in sources)

- Number of playable recreations
- Supported systems in the registry
- Emulate install success on each target OS: TBD

## 7. Roadmap / open questions

- Release cadence and which pillar is primary: TBD

## 8. Links

- [README.md](README.md) · [AGENTS.md](AGENTS.md) · [Backlog: GitHub Issues](https://github.com/bamr87/rewind-arcade/issues) · [CHANGELOG.md](CHANGELOG.md) · [docs/README.md](docs/README.md) · [docs/architecture.md](docs/architecture.md)
