# Architecture

> How the three pillars share system ids and stay decoupled, what each pillar owns, and the steps for adding a game, a console or a platform.

Rewind Arcade is three programs that agree on names, not a single process.

```
                    systems/registry.yaml
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
      arcade/             emulate/             catalog/
   GameManifest         <id>.yaml            platforms.py
   canvas games         RetroArch            dump parsers
   static site          EmulationStation     SQLite catalog
```

## Why they stay separate

They have incompatible runtimes and constraints. Arcade is TypeScript in a browser. Emulate is bash 3.2 so it runs on stock macOS. Catalog is Python stdlib so a Pi does not need pip. Merging them would drag each stack's constraints onto the others. The arcade UI is allowed to *display* catalog rows and registry ids; it must not import catalog or emulate code. Collection JSON is loaded from a cartidx `data.js` export, never from Python.

What they share is the **system id**: `nes`, `snes`, `megadrive`, `psx`. A dump in `roms/nes` is playable and identifiable without a translation table.

## Play

`arcade/src/engine/` and `arcade/src/ui/` know nothing about any specific game. A game in `arcade/src/games/<id>/` never imports React, the router, or another game. The contract is `arcade/src/engine/types.ts` (`GameManifest` / `GameInstance` / `GameContext`). Routing is hash-based so `arcade/dist/` runs from any static host.

## Emulate

A console is `emulate/config/systems/<id>.yaml`. `emulate/lib/systems.sh` reads manifests; `emulate/cmd/build.sh` writes `es_systems.xml` and a RetroArch overlay config. `emulate/lib/platform.sh` is the only file allowed to branch on OS. Generated output in `emulate/build/` is disposable.

`RETROPI_ROOT` is the `emulate/` directory even when you invoke `./bin/retropi` from the monorepo root. The root wrapper `exec`s the real script so path resolution is unchanged.

## Catalog

Columns live in `catalog/src/cartridge_index/schema.py`. Title matching lives in `matching.py`. Dump parsers live in `systems/`, one family per module, and must use emulate's ids. `platforms.py` is broader than dump identification: a shelf holds GameCube discs and Switch carts that this tree does not (yet) emulate.

Scanning identifies and validates in one read. Files are referenced in place.

## Adding something

| Thing | Steps |
|---|---|
| Browser game | `arcade/src/games/<id>/` + registry line |
| Playable console | `emulate/config/systems/<id>.yaml`, then `systems enable` |
| Dump parser | `catalog/src/cartridge_index/systems/<family>.py` + synthetic tests |
| Shelf platform | row in `catalog/src/cartridge_index/platforms.py` |
| Encyclopedia | `docs/systems/` + `systems/registry.yaml` |

Do all four when a console is first-class. Do the last two when you only track it on a shelf.
