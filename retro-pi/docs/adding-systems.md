# Adding a system

A system is one YAML file in `config/systems/`. No code changes.

## Scaffold it

```sh
./bin/retropi extend system vectrex \
  --name "GCE Vectrex" \
  --core vecx_libretro \
  --ext ".vec,.bin,.zip" \
  --year 1982 \
  --manufacturer GCE
```

Then:

```sh
./bin/retropi systems enable vectrex
./bin/retropi cores install --system vectrex
./bin/retropi build
```

## The manifest format

```yaml
id: psx                      # must match the filename
name: "Sony PlayStation"
short_name: "PS1"
manufacturer: "Sony"
year: 1994
aliases: [ps1, playstation]  # `retropi systems show ps1` works

frontend:
  platform: psx              # scraper/theme id the frontend understands
  theme: psx

extensions: [".cue", ".chd", ".pbp", ".m3u"]

emulators:
  default: swanstation
  list:
    - id: swanstation
      type: libretro
      core: swanstation_libretro
      display: "SwanStation"
    - id: pcsx-rearmed
      type: libretro
      core: pcsx_rearmed_libretro
      display: "PCSX-ReARMed (fast)"
      platforms: [linux]     # only offered on Linux / Raspberry Pi

bios:
  - file: "scph5501.bin"
    md5: 490f666e1afb15b7362b406ed1cea246
    required: true
    note: "US BIOS"

notes: >-
  Anything future-you should know about this system.
```

### Fields that matter

| Field | Why it matters |
|---|---|
| `id` | Folder name under `roms/`, and the `<name>` in `es_systems.xml` |
| `extensions` | What the frontend will show. Both cases are generated for you |
| `emulators.list[].platforms` | Restricts an emulator to `macos`, `linux`, `pi`, or an architecture. Omit for "everywhere" |
| `emulators.default` | Used unless overridden in config. Must appear in `list` |
| `bios[].required` | Drives the red/grey distinction in `retropi bios check` |

### Multiple emulators

Every entry that runs on the current platform becomes a `<command>` in `es_systems.xml`, with the default first. ES-DE shows them in a picker; RetroPie's EmulationStation uses the first.

### Standalone (non-libretro) emulators

```yaml
    - id: dolphin
      type: standalone
      display: "Dolphin"
      command: '/Applications/Dolphin.app/Contents/MacOS/Dolphin -e %ROM%'
      platforms: [macos]
```

`%ROM%` is substituted by the frontend.

## Finding the right core name

Core names are the filenames on the libretro buildbot, minus the extension:

```sh
./bin/retropi cores dir                 # where they get installed
open https://buildbot.libretro.com/nightly/apple/osx/arm64/latest/
```

## Validate your work

```sh
./bin/retropi config validate    # does it parse?
./tests/run.sh manifests         # does it satisfy the schema rules?
./bin/retropi systems show vectrex
```

The manifest tests check that `id` matches the filename, extensions start with a dot, the default emulator exists, every libretro entry names a core, and no two systems claim the same alias.

## Extension packs

To share a themed set of systems:

```sh
./bin/retropi extend pack arcade-extras
# add manifests to packages/arcade-extras/systems/
```
