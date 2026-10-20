# Configuration

## Layers

Later layers win:

1. `config/retropi.yaml` — committed defaults. Do not edit.
2. `config/local.yaml` — this machine. Gitignored. Yours.
3. `RETROPI_*` environment variables — one-off overrides.

```sh
./bin/retropi config init                       # create local.yaml
./bin/retropi config set paths.roms /mnt/games  # write a value
./bin/retropi config get paths.roms             # read one
./bin/retropi config show                       # everything, merged
./bin/retropi config path                       # where the files are
```

Environment overrides map a dotted key to upper snake case:

```sh
RETROPI_PATHS_ROMS=/Volumes/Games/roms ./bin/retropi build
RETROPI_FRONTEND_KIND=emulationstation ./bin/retropi build
```

## Merge semantics

Mappings merge key by key; **lists replace wholesale**. So this in `local.yaml`:

```yaml
systems:
  enabled: [nes, snes]
```

gives you exactly two systems, not the defaults plus two.

## Keys worth knowing

| Key | Default | What it does |
|---|---|---|
| `paths.roms` | `roms` | Game library. Absolute paths point at external drives |
| `paths.saves` | `saves` | Centralized saves and states |
| `paths.bios` | `bios` | Where BIOS files are looked up |
| `frontend.kind` | `es-de` | `es-de`, `emulationstation`, or `none` |
| `emulation.fullscreen` | `true` | Adds `--fullscreen` to generated commands |
| `display.rotate` | `normal` | `normal`, `left`, `right`, `inverted` — applied by `frontend session` |
| `display.region` | `full` | `full`, `top-half`, `bottom-half`, `left-half`, `right-half`; anything but `full` runs games in a borderless window of that size |
| `audio.output` | `""` | Output to play through, matched against `retropi audio list` (e.g. `hdmi`); applied by `audio apply` and `frontend session start` |
| `controls.joypad_driver` | `auto` | RetroArch joypad driver; `linuxraw` for sessions started over SSH |
| `systems.enabled` | every system | What the frontend shows |
| `emulators.<system>` | — | Override the default emulator for one system |
| `saves.centralize` | `true` | Keep saves out of the ROM tree |
| `controls.hotkeys.*` | see file | Hotkey combos written to RetroArch |
| `controls.manage_autoconfig` | `true` | Install the controller profiles in `config/controllers/` into RetroArch |
| `sync.targets.*` | `pi` | rsync destinations |

## Per-system emulator overrides

```yaml
emulators:
  snes: snes9x2010      # fast core on a Pi 3
  psx: pcsx-rearmed
```

The name is the `id` from the system's `emulators.list`, which `retropi systems show <id>` prints.

## Regenerating

Configuration changes do nothing until you run:

```sh
./bin/retropi build
```

## Validating

```sh
./bin/retropi config validate
```

Parses every config file and system manifest, and reports the offending line.
