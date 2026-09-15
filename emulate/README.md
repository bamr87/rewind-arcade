# Emulate — retro-pi

The **emulate** pillar of [Rewind Arcade](../README.md): a portable, packageable workspace for building, installing, maintaining and extending a retro gaming setup — one tree that works the same on **macOS**, a **Raspberry Pi** and **Debian/Ubuntu**, driving **EmulationStation** and **RetroArch**.

NES, SNES, N64, Game Boy, Genesis/Mega Drive, Master System, Game Gear, SG-1000, Sega CD, 32X, Saturn, Dreamcast, PlayStation, PSP, Atari, PC Engine, Neo Geo, arcade, DOS and C64 ship configured — two dozen systems, and adding another is one YAML file.

```sh
# from the monorepo root:  ./bin/retropi doctor
# or here:
./bin/retropi doctor        # what does this machine need?
./bin/retropi install       # RetroArch + cores + generated config
./bin/retropi build         # regenerate the frontend
```

## Why this exists

Retro setups rot. You tune a Pi for a year, the SD card dies, and the knowledge is gone. Or you build it on a Mac and none of it transfers to the Pi under the TV.

retro-pi keeps the *setup* — not the games — as version-controlled, declarative configuration:

- **Declarative.** A console is one YAML manifest. The tooling generates the
  frontend and emulator config from it.
- **Portable.** The same repo bootstraps a Mac and a Pi, choosing the right
  cores, paths and binaries for each.
- **Packageable.** `retropi package` makes a ~60 KB archive that rebuilds the
  whole setup anywhere.
- **Honest about content.** It never downloads games or BIOS images.

## What it does

| | |
|---|---|
| **Establish** | `doctor` audits the machine and prints the exact next commands |
| **Install** | RetroArch via brew/apt; libretro cores from the official buildbot |
| **Build** | Generates `es_systems.xml` + RetroArch paths from the manifests |
| **Organize** | Files ROMs by extension, inventories the library, checksums it |
| **Maintain** | Verifies BIOS by MD5, detects bit rot, syncs Mac ⇄ Pi over rsync |
| **Extend** | `extend system <id>` scaffolds a console; no code changes |
| **Test** | a self-contained suite, run on macOS bash 3.2 and Linux bash 5.x |

## Commands

```
SETUP      doctor      check this machine and report what is missing
           install     install the emulator stack
           build       generate frontend + emulator config
           config      read, write and initialize configuration

CONTENT    systems     list and inspect supported systems
           roms        inventory, verify and organize your library
           bios        report which firmware each system still needs
           cores       list, install and update libretro cores
           audio       choose the sound output (e.g. HDMI speakers)

MAINTAIN   sync        push/pull the workspace to another machine
           provision   write the framework onto a Pi OS boot partition
           package     build a portable archive
           extend      scaffold a new system or extension pack
           test        run the test suite
           clean       remove generated state
```

Every command takes `--help`. Global flags: `--dry-run`, `--verbose`, `--yes`.

## How it fits together

```
config/systems/*.yaml  ──►  lib/systems.sh  ──►  cmd/build.sh  ──►  es_systems.xml
      (declarative)          (interpretation)      (generation)       (frontend)
```

`es_systems.xml` is the format both ES-DE (macOS/Linux) and RetroPie's EmulationStation read, which is what lets one configuration serve both targets. Alternate emulators become extra `<command>` entries — ES-DE shows a picker, RetroPie uses the first.

## EmulationStation is part of the framework

The frontend is installed and managed, not left to you:

```sh
./bin/retropi frontend install    # ES-DE for this platform, resolved from upstream
./bin/retropi frontend status     # installed? where does it read from? is it wired up?
./bin/retropi frontend gamelist   # real titles instead of filenames
./bin/retropi frontend launch
```

retro-pi derives the frontend's layout from the version installed (ES-DE 3.x moved its data directory), writes `es_systems.xml` and per-system gamelists where that version actually reads them, and merges rather than overwrites anything you have scraped. See [docs/emulationstation.md](docs/emulationstation.md).

## Adding a console

```sh
./bin/retropi extend system vectrex --name "GCE Vectrex" \
  --core vecx_libretro --ext ".vec,.bin,.zip"
./bin/retropi systems enable vectrex
./bin/retropi cores install --system vectrex
./bin/retropi build
```

No code changes — see [docs/adding-systems.md](docs/adding-systems.md).

## Per-machine tuning, one source of truth

The same manifests produce different output per machine. A PS1 manifest can offer `pcsx-rearmed` on a Pi and `beetle-psx` on a Mac; each machine generates only what it can run. Machine-specific choices live in `config/local.yaml`, which is gitignored:

```sh
./bin/retropi config set paths.roms /Volumes/Games/roms
./bin/retropi config set emulators.snes snes9x2010     # fast core on a Pi 3
```

## Mac ⇄ Pi

Curate on the desktop, push to the console:

```sh
./bin/retropi sync push pi --dry-run
./bin/retropi sync push pi
./bin/retropi sync pull pi saves      # bring progress back
```

Saves are centralized outside the ROM tree, so re-pushing your library never overwrites progress.

## Requirements

bash and python3 — both already present on stock macOS and Raspberry Pi OS. No pip installs, no Ansible, no runtime dependencies to manage. Written for bash 3.2 so it runs on Apple's ancient system bash unchanged.

## Games and BIOS

retro-pi ships no games and no firmware, and will not download either. It organizes and verifies files you supply. See [docs/legal.md](docs/legal.md).

## Development

```sh
make check         # lint + validate + test
make test          # the test suite
make test-linux    # run the suite in Debian bookworm + trixie containers
```

CI runs the suite on macOS (bash 3.2) and Ubuntu (bash 5.x), again with the built-in YAML parser forced, once more on `linux/arm64` under QEMU — the real Raspberry Pi target — and on Debian 13 (trixie).

To launch a game without needing one, generate an original test cartridge:

```sh
python3 tests/fixtures/make_test_rom.py roms/nes/retropi-test.nes
./tools/run-rom.sh nes                  # launches it windowed
./tools/run-rom.sh nes --print          # just show the command
```

### VSCode

`.vscode/` ships run and debug configuration: **F5** for the debug configurations in `launch.json`, and **Cmd/Ctrl+Shift+B** for `check` (lint + validate + tests). The task list also has `run: NES test ROM`, which generates the cartridge above and launches it.

Validate that configuration (and optionally execute every debug configuration) with:

```sh
make validate-vscode          # static checks
make validate-vscode-run      # also run each configuration
```

It catches the things VSCode only reports at F5 time: a stale program path, a picker option naming a system or test file that no longer exists, or a `pathBash` that resolves to a bash too old for the debugger. `make check` runs the static half.

The Python configurations work as soon as the Python extension is installed. Step-debugging the shell scripts needs the Bash Debug extension and bash 4+, so on macOS `brew install bash` — Apple's bash 3.2 is too old to drive the debugger. Note that retro-pi is written to *run* on 3.2, so confirm any fix with `./tests/run.sh` under `/bin/bash` and `make test-linux` for the Pi.

## Documentation

- [All documentation](docs/README.md)
- [Getting started](docs/getting-started.md)
- [Command reference](docs/commands.md)
- [macOS](docs/macos.md) · [Raspberry Pi](docs/raspberry-pi.md)
- [EmulationStation](docs/emulationstation.md)
- [Configuration](docs/configuration.md)
- [Adding systems](docs/adding-systems.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Architecture](docs/architecture.md)
- [Legal](docs/legal.md)

## License

MIT for the tooling. Emulators, cores, BIOS images and games carry their own terms — see [LICENSE](LICENSE) and [docs/legal.md](docs/legal.md).
