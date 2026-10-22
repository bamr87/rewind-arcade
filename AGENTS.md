<!-- kit: sdlc v0.1.0 · AGENTS.md is the CANONICAL agent instructions file (decision D4, UPS-AGENT-07/08). -->

# rewind-arcade

> A three-pillar retro gaming monorepo: play browser recreations (`arcade/`), emulate consoles with ES-DE and RetroArch (`emulate/`), and catalog the physical collection (`catalog/`), all on one set of system ids.

## What this repo is

Rewind Arcade serves anyone who wants to play, emulate and keep track of retro games across every format this tree supports. It is three programs that agree on names, not one process: **Play** (`arcade/`, a static React + TypeScript + Vite site), **Emulate** (`emulate/`, retro-pi: bash 3.2 + python3 with no pip, generating EmulationStation and RetroArch configuration) and **Catalog** (`catalog/`, cartridge-index: Python 3.11+ standard library only, one SQLite catalog). The root holds the wrappers, the shared system registry and the cross-pillar docs. A change is done when the suites of every pillar it touched pass (`make check` covers all three) and the docs it affects say what the code now does.

Each pillar has its own rules, which you must read before editing that tree: [arcade/AGENTS.md](arcade/AGENTS.md) (the `GameManifest`/`GameInstance` seam, the hash router, no game imports React), [emulate/AGENTS.md](emulate/AGENTS.md) (bash 3.2, `lib/platform.sh` is the only OS branch, never download content) and [catalog/AGENTS.md](catalog/AGENTS.md) (stdlib only, never move dumps, one definition of columns and matching).

## Stack & commands

Quick start (the same block as the README):

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

Build, test and lint:

```sh
make help                 # every root target
make play                 # arcade dev server
make arcade-build         # tsc -b + vite build -> arcade/dist/
make test                 # emulate + catalog suites, then the generated-docs checks
make check                # arcade build + emulate check + catalog check + the generated-docs checks
make docs                 # regenerate docs/systems/README.md's table and the docs index
make -C emulate check     # shellcheck + config validation + tests
make -C emulate test-linux    # the emulate suite in Debian containers (bash 5.x, no PyYAML)
make -C catalog check     # catalog tests + byte-compile
./bin/ci                  # the GitHub workflow jobs on this host
./bin/ci --act            # the same YAML via nektos/act (Docker)
```

The arcade has no unit suite: `npm run build --prefix arcade` is its gate (`strict`, and unused locals or parameters fail the build).

## Layout

```
arcade/                 Play: browser games, console loader, catalog browser (React + TypeScript + Vite)
emulate/                Emulate: retro-pi manifests, RetroArch, EmulationStation (bash 3.2 + python3)
catalog/                Catalog: cartridge-index dumps, inventory, prices, SQLite (Python 3.11+ stdlib)
systems/registry.yaml   one id per platform, used by every pillar
docs/                   encyclopedia, getting started, architecture, formats, legal (index: docs/README.md)
bin/                    retropi and cartidx wrappers, and ci (run the workflows locally)
tools/                  repository tooling: the systems-table generator and the vendored docs index
retro-pi/               the former bamr87/retro-pi repository, imported with full history; reference only
features/, verify/      the fleet feature index and verification scenarios
```

- `RETROPI_ROOT` is `emulate/`, not the monorepo root; the root `bin/retropi` `exec`s the real script so path resolution is unchanged. `bin/cartidx` puts `catalog/src` on `sys.path`. Don't move those trees without updating the wrappers and the CI working directories.
- `retro-pi/` keeps its own README, `bin/retropi` and tests, run from inside it. Its `ci.yml` does not run from that path.

## Conventions

- **Backlog of record:** GitHub Issues with the fleet labels (`.github/sdlc.yml`, `backlog.mode: issues`). Pick up issues labelled `agent:ready`; never touch `agent:hold` or `human-review`.
- **Definition of Done:** the touched pillars' suites green, the generated docs current (`make docs`), and the fleet default pull-request checklist (this repo has no `.github/pull_request_template.md`, so the owner's default applies).
- **Decisions:** ADRs in `docs/adr/NNNN-slug.md`, indexed in `docs/adr/README.md`. Add one for anything hard to reverse.
- **Commits:** Conventional Commits (`feat fix docs style refactor test chore perf ci build`), scoped by pillar where it fits (`feat(arcade): …`). The PR title is the squash subject.
- **Branches:** `feature/`, `fix/`, `docs/`, `refactor/`, `test/` or `chore/` off `main`.
- **Changelog:** `CHANGELOG.md` is written by release-please (`release.yml`) from the PR titles. Never edit it, or a version number, by hand.
- **Markdown:** one line per prose paragraph; do not hard-wrap. Tables, lists, headings and code blocks may wrap.
- **Never:** push to `main` directly, commit lockfiles or secrets, suppress type errors, leave empty exception handlers, or edit generated files by hand (the `AUTO` spans in `docs/systems/README.md` and `docs/README.md`, `emulate/build/`, `arcade/dist/`).

## Hard constraints (all pillars)

- **Never commit game data.** ROM files, BIOS images, `emulate/config/local.yaml`, `catalog/cartridge.toml`, `catalog/collection/`, `catalog/data/reference/` and `catalog/workspace/` stay out of git.
- **Never download games or BIOS.** Cores and emulators, yes. Catalog `fetch` is metadata only. Arcade ships original recreations, not dumps.
- **Never move dumps.** The catalog records what a file is and what you own, in place.
- **Do not mix stacks.** Arcade does not import emulate or catalog code. Emulate does not call cartidx. Catalog may assume emulate's folder names (`roms/<id>`) but must not import emulate code.
- **System ids are defined once**, in `systems/registry.yaml`, and must match `emulate/config/systems/<id>.yaml` and `catalog/src/cartridge_index/platforms.py`. The platform table in `docs/systems/README.md` is generated from the registry by `python3 tools/gen_systems_table.py`.

## Where to work

| Change | Lives in |
| --- | --- |
| A browser game | `arcade/src/games/<id>/` + `arcade/src/games/registry.ts` |
| Arcade engine / HUD | `arcade/src/engine/`, `arcade/src/ui/` |
| A console to play | `emulate/config/systems/<id>.yaml` only |
| Dump identification | `catalog/src/cartridge_index/systems/` |
| Shelf / price platforms | `catalog/src/cartridge_index/platforms.py` |
| Title matching | `catalog/src/cartridge_index/matching.py` only |
| A new platform id | `systems/registry.yaml`, then `make docs`, then the matching emulate manifest and catalog platform |
| Encyclopedia | `docs/systems/<family>.md` |

How the pillars share ids and stay decoupled is [docs/architecture.md](docs/architecture.md).

## Tests that encode the docs map

Do not "clean up" these strings; the suites assert them:

- `emulate/tests/test_docs.sh`: every command in `emulate/cmd/` appears in `emulate/docs/commands.md` and its `--help` starts with `retropi <name>`; internal links in `emulate/*.md`, `emulate/docs/*.md` and `emulate/*/README.md` resolve; every `emulate/docs/*.md` is listed in `emulate/docs/README.md`; `emulate/README.md` links `docs/README.md`; `emulate/CONTRIBUTING.md` states `bash 3.2` and `make test-linux`; every `emulate/lib/` module is named in `emulate/docs/architecture.md` and `emulate/AGENTS.md`.
- `catalog/tests/test_docs.py`: every CLI command appears as `cartidx <cmd>` in `catalog/README.md`, and every schema column in `catalog/docs/data-dictionary.md`.
- `make test` / `make check` at the root: `python3 tools/gen_systems_table.py --check` and `python3 tools/docs_index.py --check`.

## Fleet context

Member of the bamr87 fleet, vendored as the submodule `projects/rewind-arcade` of [bamr87/bamr87](https://github.com/bamr87/bamr87): commit and push here first; the hub bumps its pointer afterwards. The standards live in the hub's [specs/](https://github.com/bamr87/bamr87/tree/main/specs) (the Universal Project Standard); this repo's SDLC declaration is `.github/sdlc.yml`. What acts on it:

- `ci.yml` calls the hub's shared `standard-ci.yml`; `arcade.yml`, `emulate.yml` and `catalog.yml` gate their own pillar on path filters; `deploy.yml` publishes the arcade to GitHub Pages; `conformance.yml` and `verify.yml` call the hub's shared checks; `release.yml` runs release-please; `claude.yml` answers `@claude`.
- The hub's fleet loops (fleet-pulse doctor, issue pipeline, standardization fan-outs) open pull requests here; none of them merges.

## Standard deviations

none
