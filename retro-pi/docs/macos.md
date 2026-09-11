# macOS

## Setup

```sh
./platforms/macos/bootstrap.sh
./bin/retropi install
```

Works on both Apple Silicon and Intel; the correct core builds are selected automatically (`apple/osx/arm64` vs `apple/osx/x86_64`).

## The frontend

RetroArch installs from Homebrew. **ES-DE does not** — it ships as a signed DMG, so it is a manual step:

1. Download from <https://es-de.org/#Downloads>
2. Drag `ES-DE.app` to `/Applications`
3. Launch it once so it creates `~/.emulationstation`
4. `./bin/retropi build`

retro-pi writes to `~/.emulationstation/custom_systems/es_systems.xml`, which ES-DE merges with its built-in definitions.

You can skip the frontend entirely and launch games from RetroArch — the cores and paths are configured either way.

## Gatekeeper

macOS quarantines downloaded binaries. If RetroArch refuses to load a core:

```sh
xattr -dr com.apple.quarantine ~/Library/Application\ Support/RetroArch/cores
```

## Where things live

| What | Path |
|---|---|
| Cores | `~/Library/Application Support/RetroArch/cores` |
| RetroArch config | `~/Library/Application Support/RetroArch` |
| Frontend config | `~/.emulationstation/custom_systems` |
| ROMs, saves, BIOS | inside this repo, unless you change `paths` |

## bash 3.2

macOS still ships bash 3.2 from 2007. retro-pi is written to run on it, so there is nothing to install — but if you contribute, avoid associative arrays, `mapfile`, and `${var^^}`. The test suite runs on both bash 3.2 and bash 5.x in CI for exactly this reason.

## Keeping ROMs on an external drive

```sh
./bin/retropi config set paths.roms /Volumes/Games/roms
./bin/retropi build
```
