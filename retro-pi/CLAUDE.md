# CLAUDE.md

Guidance for working in this repository.

## What this is

A portable retro gaming workspace: declarative system manifests plus shell tooling that generates EmulationStation and RetroArch configuration. Targets macOS, Raspberry Pi and Debian/Ubuntu from one tree.

## Hard constraints

**bash 3.2.** macOS ships bash 3.2 (2007) and `#!/usr/bin/env bash` resolves to it. No associative arrays (`declare -A`), no `mapfile`/`readarray`, no `${var^^}`/`${var,,}`, no `&>>`.

**Two runtime dependencies: bash and python3.** Both exist on stock macOS and Raspberry Pi OS. Do not add pip packages, Ansible, jq or bats. `lib/yamlite.py` exists precisely so PyYAML is not required.

**Only `lib/platform.sh` branches on the OS.** If code elsewhere needs to know about `.dylib` vs `.so`, RetroPie paths, or the libretro buildbot layout, add a function there and call it.

**Never download games or BIOS images.** Cores and emulators, yes. Content, no. `retropi bios check` reports and verifies; it must never fetch.

## `set -e` footguns (both have bitten this repo)

A function whose last statement is a failing test returns non-zero and, under `set -o errexit`, kills the caller. End such functions with `return 0`:

```bash
some_fn() {
  while read -r x; do
    [[ -n "$x" ]] && printf '%s\n' "$x"    # false on the last iteration
  done < <(source)
  return 0    # without this the whole command aborts
}
```

The same applies to `[[ cond ]] && cmd` as the last line of a loop body.

Bash 3.2 also errors on `"${arr[*]}"` for an *empty* array under `set -u`. Guard with `[[ ${#arr[@]} -eq 0 ]]`.

## Bash version differences that matter

Since bash 5.2, an unquoted `&` in `${var//pat/repl}` expands to the matched text. `${s//</&lt;}` yields `<lt;` on a Pi (bash 5.x) and `&lt;` on macOS (bash 3.2). `xml_escape` uses `sed` for this reason. Prefer `sed` over parameter-expansion replacement when the replacement contains `&`.

This class of bug is invisible on a Mac — run `make test-linux` before trusting cross-platform string handling.

## Core architecture is not the OS architecture

Cores are `dlopen()`ed into RetroArch, so they must match the **RetroArch binary**. On Apple Silicon the Homebrew cask is x86_64-only (Rosetta), so an arm64 Mac needs x86_64 cores. `retroarch_arch()` in `lib/platform.sh` inspects the binary with `lipo`; `buildbot_path()` uses it, never `uname -m`.

Tests that assert on `buildbot_path()` must pin `RETROPI_RETROARCH_BIN=/nonexistent/retroarch` or `RETROPI_CORE_ARCH`, or they pick up whatever RetroArch the host happens to have and stop being hermetic.

## Linux cores live in more than one place

`core_dir()` is where retro-pi *installs* cores and is always user-owned (`~/.config/retroarch/cores` on Linux). `core_path()` also searches `system_core_dirs()`: Debian's apt cores under `/usr/lib/<multiarch>/libretro` (not `/usr/lib/libretro`), and RetroPie's nested `/opt/retropie/libretrocores/lr-*/`. Never make a root-owned directory the install target, and never let `cores remove` delete a core `core_managed()` says a package owns.

Tests that touch core resolution must set `RETROPI_SYSTEM_CORE_DIRS=""` (or a sandbox path); otherwise a host with `libretro-nestopia` installed changes the result.

## No display is a normal state on Linux

Over SSH or on a server, `DISPLAY`/`WAYLAND_DISPLAY` are unset. `platform_has_display()` reports it; `tools/run-rom.sh --headless --frames N --screenshot F` runs RetroArch in Xvfb and is how to verify rendering on such a machine. The NES test cartridge cycles its backdrop through the palette, black included, so compare screenshots at several frame counts before concluding video is broken.

## macOS: install RetroArch from upstream, not Homebrew

The Homebrew cask is an x86_64 OpenGL build. On Apple Silicon it runs under Rosetta and cannot create a video context, so every hardware-rendered core (n64, dreamcast, psp, saturn) loads its ROM and then exits with "Cannot open video driver" — while 2D cores work, which makes it look like a content problem. `retroarch_macos_url()` resolves the upstream universal Metal build; `retroarch_translated()` detects the broken combination and `doctor` fails on it.

## RetroArch settings ride along with the launch command

Do not try to write retro-pi's paths into "the" retroarch.cfg. macOS builds disagree about where that is — Homebrew reads `~/Library/Application Support/RetroArch`, the upstream build `~/Documents/RetroArch` — and writing to the wrong one fails silently: BIOS and save paths simply never apply, which surfaces as a core hunting for a BIOS in a directory you never configured.

`launch_command()` appends `--appendconfig <build>/retroarch-retropi.cfg`, which overlays on top of whatever config that build reads and overwrites nothing of the user's. `retroarch_config_dir()` still probes (existing cfg first, then a directory RetroArch has demonstrably used) for `build --apply-retroarch`, but that path is now optional.

Probe loops there must read line by line: `for c in $(_ra_config_candidates)` word-splits "Application Support" into two bogus candidates.

## EmulationStation layout is derived from the version, not probed

`lib/frontend.sh` owns every fact about the frontend. ES-DE 3.0 moved its data directory from `~/.emulationstation` to `~/ES-DE` and its settings to `<home>/settings/`. An installed frontend therefore decides its own paths from its version; probing for an existing directory is wrong, because retro-pi itself used to create `~/.emulationstation` and that stale directory would win.

Explicit overrides (`RETROPI_ES_CONFIG_HOME`, `RETROPI_FRONTEND_BIN`) are authoritative and must never fall back to a probe: pointing at a binary that is missing means "not installed", not "go find another one".

`frontend_detect` is re-entrancy guarded. It resolves the home via `frontend_version` -> `frontend_installed` -> `_fe_ensure`, which would otherwise call detection again; that recursion once turned a path lookup into 25 seconds of work. Any subprocess whose output is captured also needs `</dev/null` — a GUI binary that blocks on stdin holds the pipe open forever and hangs the suite.

## Layout

```
bin/retropi      dispatcher; parses global flags, sources cmd/<name>.sh
lib/common.sh    logging, run(), checksums, fetch, xml_escape
lib/platform.sh  OS/arch detection, package managers, RetroArch + core paths
lib/frontend.sh  EmulationStation: detection, layout, install, launch
lib/config.sh    layered config; flattens to .retropi/config.flat
lib/systems.sh   manifest access, name matching, emulator resolution, launch commands
lib/yamlite.py   dependency-free YAML reader (must match PyYAML exactly)
lib/gamelist.py  gamelist.xml generation; merges, never clobbers scraped data
lib/es_settings.py  es_settings.xml merge
lib/romimport.py bulk import from folder-per-console archives
cmd/<name>.sh    one subcommand per file, defining cmd_<name>()
config/systems/  one YAML manifest per console
tools/           run-rom.sh (launch a game), validate-vscode.py
docs/            user documentation; commands.md is the CLI reference
```

## Adding a subcommand

Create `cmd/<name>.sh` defining `cmd_<name>()`. The dispatcher finds it by filename. Include a `--help` branch printing a block that starts with `retropi <name>` — `tests/test_cli.sh` asserts this for every command.

## Adding a console

One file in `config/systems/`. Never special-case a console in code. `tests/test_manifests.sh` enforces the schema: id matches filename, extensions start with a dot, the default emulator exists in the list, libretro entries name a `*_libretro` core, BIOS `required` is boolean, aliases are unique.

## Before committing

```sh
make check          # shellcheck + config validation + tests
make test-linux     # Debian bookworm + trixie containers (bash 5.x, no PyYAML)
```

Both parsers must produce identical output — `RETROPI_YAML_PURE=1` forces the built-in one. A divergence means a manifest behaves differently per machine.

## Conventions

- Generated output is disposable; configuration is the source of truth. Never
  hand-edit anything in `build/`.
- User-facing messages go to stderr via `info`/`step`/`ok`/`warn`/`die`; data
  meant for piping goes to stdout.
- Respect `--dry-run`: mutations go through `run` or check `$RETROPI_DRY_RUN`.
- Back up before overwriting anything outside the repo (`backup_file`).
