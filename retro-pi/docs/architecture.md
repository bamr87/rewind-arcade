# Architecture

## The idea

Everything about a console lives in one YAML manifest. The tooling reads manifests and generates whatever the frontend and emulator need. Adding a system is adding a file; nothing branches on console names in code.

```
config/systems/*.yaml  ──►  lib/systems.sh  ──►  cmd/build.sh  ──►  es_systems.xml
      (declarative)          (interpretation)      (generation)      (frontend)
```

## Layout

```
bin/retropi          CLI dispatcher: global flags, then delegate to cmd/
lib/
  common.sh          logging, run/dry-run, checksums, fetch, xml escaping
  platform.sh        the ONLY file that branches on macOS vs Linux vs Pi
  config.sh          layered config, flat-file cache
  systems.sh         manifest access, emulator resolution, launch commands
  yamlite.py         dependency-free YAML reader
cmd/<name>.sh        one file per subcommand, defines cmd_<name>()
config/
  retropi.yaml       committed defaults
  local.yaml         machine-local overrides (gitignored)
  systems/*.yaml     one manifest per console
platforms/           per-OS bootstrap scripts
tests/               self-contained test suite
docker/              Linux/arm64 container for testing the Pi path
```

## Design rules

**One place per concern.** Only `lib/platform.sh` knows that macOS uses `.dylib` and Linux uses `.so`, or that the libretro buildbot calls 64-bit ARM `aarch64`. Everything else asks it.

**Generated files are disposable.** Anything in `build/` or installed into the frontend can be deleted and recreated with `retropi build`. Configuration is the source of truth; generated output is never hand-edited.

**Content is never generated.** ROMs, BIOS images and saves are yours. The tool organizes and verifies them, and refuses to fetch them.

**bash 3.2.** macOS still ships it, so the tree avoids associative arrays, `mapfile` and `${var^^}`. CI runs bash 3.2 (macOS) and bash 5.x (Linux).

**Two dependencies.** bash and python3. Both are present on a stock Raspberry Pi OS and a stock Mac. Nothing needs to be installed to read the config.

## Why a YAML parser instead of PyYAML

A stock Raspberry Pi OS image has no PyYAML, and requiring `pip install` on a box that boots into a game menu is a bad trade. `lib/yamlite.py` implements the subset the manifests use and defers to PyYAML when it is installed.

The two must agree exactly, or a manifest would behave differently per machine. `tests/test_yamlite.sh` asserts byte-identical JSON from both backends for every shipped manifest, and `RETROPI_YAML_PURE=1` forces the built-in parser so CI can exercise the Pi path from any machine.

## Configuration resolution

```
config/retropi.yaml ─┐
config/local.yaml    ├─► deep merge ─► flatten ─► .retropi/config.flat ─► cfg()
RETROPI_* env vars  ─┘                                                      ▲
                                                        env vars checked first
```

Mappings merge recursively; lists replace wholesale, so a local `systems.enabled` overrides rather than extends. Flattening once into a `key=value` file means a command doing 50 lookups spawns python once instead of 50 times — which matters on a Pi.

## Emulator resolution

For each system, in order:

1. `emulators.<system>` in config, if set
2. `emulators.default` from the manifest
3. the first entry that runs on this platform

Every candidate is filtered through `platforms:`, so a manifest can list `pcsx-rearmed` for the Pi and `beetle-psx` for the Mac and each machine generates only what it can run.

## The frontend contract

`es_systems.xml` is understood by both ES-DE (macOS/Linux) and RetroPie's EmulationStation, which is what makes one config serve both targets. Alternate emulators are emitted as extra `<command label="...">` elements: ES-DE offers them in a picker, RetroPie ES uses the first — so the default is always written first.

## Testing

`tests/run.sh` is a self-contained runner: no bats, no pip. Each test executes in a subshell against a throwaway sandbox with redirected core and frontend directories, so the suite never touches your real setup.

Layers covered: the YAML parser (including agreement with PyYAML), the config merge, platform/emulator resolution, the generated XML (parsed and asserted element by element), and the CLI contract.
