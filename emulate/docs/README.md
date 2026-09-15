# Documentation

## Start here

| Document | What it covers |
|---|---|
| [getting-started.md](getting-started.md) | clone to working frontend, in order |
| [commands.md](commands.md) | every command, flag and helper script |
| [configuration.md](configuration.md) | the config layers and the keys worth knowing |

## Per platform

| Document | What it covers |
|---|---|
| [macos.md](macos.md) | Apple Silicon and Intel, the Rosetta trap, where files live |
| [raspberry-pi.md](raspberry-pi.md) | board-by-board tuning, RetroPie coexistence, the Mac-to-Pi workflow |
| [debian.md](debian.md) | Debian and Ubuntu desktops and servers, apt cores, running with no display |
| [emulationstation.md](emulationstation.md) | installing and managing the frontend, gamelists, themes |

## Going further

| Document | What it covers |
|---|---|
| [adding-systems.md](adding-systems.md) | adding a console — one YAML file, no code |
| [architecture.md](architecture.md) | how the pieces fit and why they are shaped that way |
| [troubleshooting.md](troubleshooting.md) | symptoms, causes, fixes |
| [legal.md](legal.md) | what this project ships, downloads, and refuses to |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | working on retro-pi itself |
| [../../docs/systems/README.md](../../docs/systems/README.md) | every platform in the Rewind Arcade monorepo |

## The short version

A console is one declarative YAML manifest. The tooling reads manifests and generates whatever the frontend and emulator need, so adding a system is adding a file rather than changing code.

```
config/systems/*.yaml ──► lib/systems.sh ──► cmd/build.sh ──► es_systems.xml
     (declarative)        (interpretation)    (generation)      (frontend)
```

Everything in `build/` is disposable. Configuration is the source of truth; regenerate with `retropi build`.
