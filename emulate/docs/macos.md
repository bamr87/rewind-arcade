# macOS

## Setup

```sh
./platforms/macos/bootstrap.sh
./bin/retropi install
```

Works on both Apple Silicon and Intel; the correct core builds are selected automatically (`apple/osx/arm64` vs `apple/osx/x86_64`).

## The frontend

RetroArch is installed from the upstream universal build, not Homebrew: the cask is x86_64/OpenGL, which runs under Rosetta on Apple Silicon and cannot open a video context for hardware-rendered cores, so N64, Dreamcast, PSP and Saturn all fail while 2D systems keep working. The universal build is native and uses Metal. **ES-DE does not** — it ships as a signed DMG, so it is a manual step:

1. Download from <https://es-de.org/#Downloads>
2. Drag `ES-DE.app` to `/Applications`
3. Launch it once so it creates `~/.emulationstation`
4. `./bin/retropi build`

retro-pi writes to `~/.emulationstation/custom_systems/es_systems.xml`, which ES-DE merges with its built-in definitions.

You can skip the frontend entirely and launch games from RetroArch — the cores and paths are configured either way.

## Core architecture: the Rosetta trap

Cores are `dlopen()`ed into the RetroArch process, so a core must match the **RetroArch binary** — not your CPU. This bites on Apple Silicon: the Homebrew cask currently ships an **x86_64-only** RetroArch that runs under Rosetta, so an arm64 Mac needs **x86_64** cores. Download arm64 cores instead and every launch dies with `incompatible architecture (have 'arm64', need 'x86_64')`.

retro-pi handles this for you: it inspects the installed RetroArch with `lipo` and picks the matching buildbot path, preferring arm64 when a universal build offers it.

```sh
./bin/retropi doctor      # reports "cores must be x86_64" and flags mismatches
./bin/retropi cores list  # marks any core built for the wrong architecture
./bin/retropi cores install --force   # rebuild them for the right one
```

If you later install a native arm64 RetroArch, re-run `cores install --force` and retro-pi will switch to arm64 cores automatically.

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
