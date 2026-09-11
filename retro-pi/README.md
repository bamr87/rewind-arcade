# retro-pi

A portable, packageable workspace for building, installing, maintaining and extending a retro gaming setup — one repository that works the same on **macOS** and a **Raspberry Pi**, driving **EmulationStation** and **RetroArch**.

NES, SNES, N64, Game Boy, Genesis/Mega Drive, Master System, Game Gear, Sega CD, 32X, Saturn, Dreamcast, PlayStation, PSP, Atari, PC Engine, Neo Geo, arcade, DOS and C64 ship configured — 23 systems, and adding another is one YAML file.

```sh
git clone <your-fork> retro-pi && cd retro-pi
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
| **Test** | 68 tests across macOS bash 3.2 and Linux bash 5.x |

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

MAINTAIN   sync        push/pull the workspace to another machine
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
make test          # 68 tests
make test-linux    # run the suite in a Linux/arm64 container (the Pi path)
```

CI runs the suite on macOS (bash 3.2) and Ubuntu (bash 5.x), again with the built-in YAML parser forced, and once more on `linux/arm64` under QEMU — the real Raspberry Pi target.

## Documentation

- [Getting started](docs/getting-started.md)
- [macOS](docs/macos.md) · [Raspberry Pi](docs/raspberry-pi.md)
- [Configuration](docs/configuration.md)
- [Adding systems](docs/adding-systems.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Architecture](docs/architecture.md)
- [Legal](docs/legal.md)

## License

MIT for the tooling. Emulators, cores, BIOS images and games carry their own terms — see [LICENSE](LICENSE) and [docs/legal.md](docs/legal.md).
