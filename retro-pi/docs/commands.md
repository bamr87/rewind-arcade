# Command reference

Every command takes `--help`. Global flags work on either side of the subcommand: `retropi -v doctor` and `retropi doctor -v` are the same.

| Global flag | Effect |
|---|---|
| `-n`, `--dry-run` | print what would happen, change nothing |
| `-v`, `--verbose` | debug output |
| `-y`, `--yes` | assume yes for prompts (required in CI) |
| `--no-color` | disable coloured output |
| `--version` | print the version |

A literal `--` stops flag interpretation, so `retropi roms find -- -v` searches for the text `-v`.

## Setup

### `doctor`

Checks the machine and reports what is missing. Changes nothing, and ends with the exact commands to fix what it found. Run it first on any new machine, and again whenever something breaks.

```
--strict          exit non-zero on warnings as well as failures
--systems <ids>   limit system checks to a comma separated list
--no-bios         skip the BIOS audit
```

Exits non-zero when it finds failures, so it works as a CI gate.

### `install`

Installs the emulator stack: RetroArch, libretro cores for the enabled systems, then generates configuration.

```
(no options)      RetroArch + cores + build
--all             also install an EmulationStation frontend
--retroarch       RetroArch only
--cores           cores only
--frontend        frontend only
--no-frontend     skip the frontend
--no-cores        skip cores
--no-build        skip config generation
```

On macOS this installs the upstream universal build rather than the Homebrew cask — see [macos.md](macos.md) for why that matters.

### `build`

Regenerates everything downstream of the manifests: the ROM directory tree, `es_systems.xml`, per-system gamelists, and RetroArch paths. Run it after any configuration change.

```
--systems <ids>    build only these systems (comma separated)
--no-install       write to build/ only, do not touch the frontend
--no-dirs          do not create the ROM directory tree
--no-gamelists     do not write gamelist.xml
--no-retroarch     skip RetroArch path configuration
--apply-retroarch  merge the generated keys into your real retroarch.cfg
```

Output lands in `build/` and is installed into the frontend's config directory. Existing files are backed up first.

`--systems` is a filter, not a preference: building with it leaves every other system out of the generated frontend config until the next full build.

### `config`

```
config init             create config/local.yaml for this machine
config show [--raw]     print the fully merged configuration
config get <key>        read one value (dotted, e.g. paths.roms)
config set <key> <val>  write a value into config/local.yaml
config path             print the config file locations
config edit             open config/local.yaml in $EDITOR
config validate         parse every config file and manifest
```

Precedence runs defaults < `config/local.yaml` < `RETROPI_*` environment variables. See [configuration.md](configuration.md).

## Content

### `systems`

```
systems list [--all]     enabled systems (--all: every manifest)
systems show <id>        full detail, including the generated launch command
systems enable <id>...   add to config/local.yaml
systems disable <id>...  remove from config/local.yaml
```

`show` accepts aliases, so `systems show genesis` finds `megadrive`. Its last line is the exact command the frontend will run — the fastest way to debug a game that will not start.

### `roms`

```
roms scan                 count games per system, write build/inventory.tsv
roms list [system]        list games
roms import <archive>     import a collection laid out one folder per console
    --dry-run             show the plan, extract nothing
    --overwrite           replace games already present
    --map "Folder=id"     force a folder to a system (repeatable)
roms add <file>...        file individual games
    --system <id>         force the target system
    --move                move instead of copy
roms checksum             record SHA-1 for every game
roms verify               re-check against the recorded checksums
roms find <text>          search by name
```

`add` resolves the system from the file extension and refuses to guess when the extension is ambiguous — `.zip` and `.bin` belong to a dozen systems each. `import` uses the archive's folder names instead, which is the only reliable signal for a bulk collection.

`verify` exits non-zero when anything is corrupt or missing, so it works in a cron job.

### `bios`

```
bios check [--all]   report required and optional BIOS per system
bios where           print the BIOS directory
```

Distinguishes missing-and-required from missing-and-optional, and verifies the MD5 of files you supply, so a wrong-region dump is reported rather than silently failing at boot. retro-pi never downloads BIOS images — see [legal.md](legal.md).

### `cores`

```
cores list                    every core the enabled systems need
cores install                 all missing cores
cores install <core>...       specific cores
cores install --system <id>   the cores for one system
cores install --all           cores for every available system
cores install --force         re-download even if present
cores update                  re-download every installed core
cores remove <core>...        delete cores
cores dir                     print the core directory
```

Cores must match the **RetroArch binary**, not the CPU — they are `dlopen()`ed into it. `list` marks any core built for the wrong architecture, and `install --force` rebuilds them.

### `frontend`

```
frontend status            what is installed, where, and what is wired up
frontend install [--force] download and install ES-DE for this platform
frontend launch            start the frontend
frontend gamelist          write gamelist.xml so games show real titles
    --systems <ids>        limit to these systems
    --dry-run              report what would change
frontend themes list|install <git-url>|dir
frontend settings [--apply]  merge managed keys into es_settings.xml
frontend dirs              print every managed path
```

See [emulationstation.md](emulationstation.md).

## Maintenance

### `sync`

```
sync targets                 list configured targets
sync push <target> [sets]    send content to the target
sync pull <target> [sets]    bring content back
    --dry-run / -n           show what rsync would transfer
    --delete                 remove destination files that are gone locally
```

Content sets: `config`, `roms`, `bios`, `saves`, `themes`. Defaults to the target's `include` list.

Always `--dry-run` first. Saves are usually pulled rather than pushed: `retropi sync pull pi saves`.

### `package`

```
--with-roms      include the ROM library (can be very large)
--with-bios      include BIOS files
--name <name>    archive base name
--out <dir>      output directory (default: dist/)
```

Produces a small archive of the tooling and configuration — enough to rebuild an identical setup anywhere. Content is opt-in, so the default archive is safe to share.

### `extend`

```
extend system <id>     scaffold config/systems/<id>.yaml
    --name "..."       full display name
    --core <core>      libretro core name
    --ext ".a26,.bin"  comma separated extensions
    --year / --manufacturer
extend pack <name>     scaffold an extension pack in packages/
extend list            list installed extension packs
```

See [adding-systems.md](adding-systems.md).

### `test` and `clean`

```
test [pattern] [-v]   run the test suite, optionally filtered
clean [--all]         remove generated files (--all: also cached downloads)
```

`clean` never touches ROMs, BIOS files or saves.

## Helper scripts

These sit outside the CLI because they are development and launch aids rather than part of the managed workflow.

| Script | Purpose |
|---|---|
| `tools/run-rom.sh <system> [rom]` | launch a game using the same emulator resolution the frontend uses; `--print` shows the command, `--fullscreen` and `--log <file>` also available |
| `tools/validate-vscode.py [--run]` | check `.vscode/` run and debug configuration; `--run` executes every launch configuration |
| `platforms/macos/bootstrap.sh` | install macOS prerequisites |
| `platforms/raspberrypi/bootstrap.sh` | install Raspberry Pi prerequisites |
| `tests/fixtures/make_test_rom.py` | generate an original NES test cartridge for verifying a setup |

## Make targets

`make help` lists them. The ones worth knowing:

| Target | What it does |
|---|---|
| `make check` | everything CI runs: lint, config validation, `.vscode` validation, tests |
| `make test` | the test suite |
| `make test-linux` | the suite in a Linux/arm64 container — the Raspberry Pi code path |
| `make lint` | shellcheck every script |
| `make setup` | install, build, doctor |
