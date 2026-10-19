# Contributing

## The constraints that shape everything

**bash 3.2.** macOS still ships it, and `#!/usr/bin/env bash` resolves to it there. No associative arrays, no `mapfile`/`readarray`, no `${var^^}`, no `&>>`.

**bash and python3 only.** Both exist on a stock macOS box and a stock Raspberry Pi OS image. No pip packages, no Ansible, no jq, no bats. `lib/yamlite.py` exists precisely so PyYAML is not required.

**No content, ever.** Emulators and cores are fair game to download. Games and BIOS images are not — retro-pi reports and verifies them, and must never fetch them.

## Before you commit

```sh
make check        # lint, config validation, .vscode validation, tests
make test-linux   # the Raspberry Pi code path: bash 5.x, no PyYAML, arm64
```

Both matter. A surprising number of bugs in this repo were invisible on macOS and obvious in the container, or the reverse — see the "bash version differences" section of [CLAUDE.md](CLAUDE.md).

## Adding a console

One file in `config/systems/`. Never special-case a console in code.

```sh
./bin/retropi extend system <id> --name "..." --core <core>_libretro --ext ".ext"
./bin/retropi systems enable <id>
./bin/retropi build
```

`tests/test_manifests.sh` enforces the schema: the id matches the filename, extensions start with a dot, the default emulator exists in the list, libretro entries name a `*_libretro` core, BIOS `required` is boolean, and no two systems claim the same alias.

## Adding a command

Create `cmd/<name>.sh` defining `cmd_<name>()`. The dispatcher finds it by filename — there is no registry to update. Include a `--help` branch whose first line starts with `retropi <name>`; `tests/test_cli.sh` asserts that for every command, and `tests/test_docs.sh` asserts it appears in `docs/commands.md`.

## Layering

`lib/platform.sh` is the only file that may branch on the operating system. `lib/frontend.sh` is the only file that knows where EmulationStation keeps anything. If code elsewhere needs one of those facts, add a function there and call it.

User-facing messages go to stderr via `info`/`step`/`ok`/`warn`/`die`. Data meant for piping goes to stdout.

Mutations respect `--dry-run`: route them through `run`, or check `$RETROPI_DRY_RUN`. Anything written outside the repo gets a `backup_file` first.

## Testing

`tests/run.sh` is self-contained — no bats, no pip. Each test runs in its own subshell against a throwaway sandbox, so the suite never touches your real ROMs, cores or frontend config.

Write the test so it fails for the right reason. Several tests here exist because a deliberate break proved the original assertion was passing vacuously, and at least one caught a real bug in the implementation it was written to describe.

Avoid hardcoding counts that drift — assert against what is on disk instead. A test that says "23 systems" breaks the moment someone adds a console, which is supposed to be a one-file change.

## Shell gotchas this repo has already been bitten by

A function whose last statement is a failing test returns non-zero and, under `set -e`, kills the caller. End such functions with `return 0`.

Bash 3.2 errors on `"${arr[*]}"` for an empty array under `set -u`.

Since bash 5.2, an unquoted `&` in `${var//pat/repl}` expands to the matched text, so `${s//</&lt;}` differs between macOS and a Pi. Prefer `sed` when the replacement contains `&`.

`for x in $(cmd)` word-splits paths containing spaces. Read line by line.

Capture subprocess output with `</dev/null` — a GUI binary that blocks on stdin holds the pipe open forever.
