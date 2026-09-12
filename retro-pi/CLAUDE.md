# CLAUDE.md

Guidance for working in this repository.

## What this is

A portable retro gaming workspace: declarative system manifests plus shell tooling that generates EmulationStation and RetroArch configuration. Targets macOS and Raspberry Pi from one tree.

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

## Layout

```
bin/retropi      dispatcher; parses global flags, sources cmd/<name>.sh
lib/common.sh    logging, run(), checksums, fetch, xml_escape
lib/platform.sh  OS/arch detection, package managers, core + frontend paths
lib/config.sh    layered config; flattens to .retropi/config.flat
lib/systems.sh   manifest access, emulator resolution, launch commands
lib/yamlite.py   dependency-free YAML reader (must match PyYAML exactly)
cmd/<name>.sh    one subcommand per file, defining cmd_<name>()
config/systems/  one YAML manifest per console
```

## Adding a subcommand

Create `cmd/<name>.sh` defining `cmd_<name>()`. The dispatcher finds it by filename. Include a `--help` branch printing a block that starts with `retropi <name>` — `tests/test_cli.sh` asserts this for every command.

## Adding a console

One file in `config/systems/`. Never special-case a console in code. `tests/test_manifests.sh` enforces the schema: id matches filename, extensions start with a dot, the default emulator exists in the list, libretro entries name a `*_libretro` core, BIOS `required` is boolean, aliases are unique.

## Before committing

```sh
make check          # shellcheck + config validation + 68 tests
make test-linux     # the Raspberry Pi code path (bash 5.x, no PyYAML)
```

Both parsers must produce identical output — `RETROPI_YAML_PURE=1` forces the built-in one. A divergence means a manifest behaves differently per machine.

## Conventions

- Generated output is disposable; configuration is the source of truth. Never
  hand-edit anything in `build/`.
- User-facing messages go to stderr via `info`/`step`/`ok`/`warn`/`die`; data
  meant for piping goes to stdout.
- Respect `--dry-run`: mutations go through `run` or check `$RETROPI_DRY_RUN`.
- Back up before overwriting anything outside the repo (`backup_file`).
