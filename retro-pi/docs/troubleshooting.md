# Troubleshooting

Start with `./bin/retropi doctor`. It checks the whole chain and ends with the exact commands to fix what it found.

## A system does not appear in the frontend

1. Is it enabled? `./bin/retropi systems list`
2. Was the config regenerated? `./bin/retropi build`
3. Is the frontend reading our file? `./bin/retropi config path`
4. Does it have games? An empty folder is hidden by most themes.
5. Restart the frontend — `es_systems.xml` is read once at startup.

## A game is listed but will not launch

```sh
./bin/retropi systems show <system>
```

Check that the core is installed. If it says `core missing`:

```sh
./bin/retropi cores install --system <system>
```

Then try the launch command by hand — it is printed at the bottom of `systems show`. Running it directly surfaces the real error, which the frontend usually swallows.

## "No such file" for a core that was just installed

macOS quarantines downloaded binaries:

```sh
xattr -dr com.apple.quarantine "$(./bin/retropi cores dir)"
```

## "incompatible architecture" when launching

The core does not match the RetroArch binary. On Apple Silicon this usually means an x86_64 RetroArch (the Homebrew cask) with arm64 cores.

```sh
./bin/retropi doctor                  # names the architecture actually required
./bin/retropi cores install --force   # re-download matching cores
```

## A core will not download

```sh
./bin/retropi cores install <core> --force
```

Not every core is built for every platform. The failure message links to the buildbot index for your exact architecture — if the file is not listed there, it needs building from source or a different core.

## A 3D system loads the ROM and then quits ("Cannot open video driver")

N64, Dreamcast, PSP and Saturn cores render in hardware and need a working video context. 2D cores do not, which is why NES and SNES keep working and only the 3D systems fail — it looks like a bad ROM, but the log shows the ROM being read correctly first.

On Apple Silicon the usual cause is an x86_64 RetroArch (the Homebrew cask) running under Rosetta and asking for an OpenGL context macOS no longer provides:

```
[INFO]  [Environ] SET_HW_RENDER, context type: gl.
[ERROR] [GL] GL: Invalid enum.
[ERROR] [Video] Cannot open video driver. Exiting...
```

```sh
./bin/retropi doctor                   # reports it explicitly
./bin/retropi install --retroarch      # native universal (Metal) build
./bin/retropi cores install --force    # rebuild cores for the new architecture
```

## Disc-based games (PS1, Sega CD, Saturn, Dreamcast)

- Required BIOS missing? `./bin/retropi bios check`
- Loading the wrong file? Point the frontend at the `.cue` or `.chd`, never the
  `.bin`.
- Multi-disc games want an `.m3u` playlist listing each disc.

## BIOS is present in bios/ but the core says it cannot find one

The core is reading a different system directory. retro-pi passes its paths to RetroArch with `--appendconfig` at launch, so this should not happen — but it will if you launch RetroArch by hand without that flag, since RetroArch then uses its own defaults:

```sh
./bin/retropi systems show psx | tail -2   # the command that includes --appendconfig
./tools/run-rom.sh psx                     # or just use this
```

Editing `retroarch.cfg` directly is unreliable on macOS: the Homebrew build reads `~/Library/Application Support/RetroArch` while the upstream build reads `~/Documents/RetroArch`, so settings written to the wrong one apply silently to nothing.

## BIOS is present but the game still fails

```sh
./bin/retropi bios check
```

"present but MD5 differs" means the file is the wrong region or a bad dump. The manifests record the expected MD5 per region.

## Everything is slow on a Pi

Switch to the fast cores and drop the heavy systems:

```sh
./bin/retropi config set emulators.snes snes9x2010
./bin/retropi config set emulators.psx pcsx-rearmed
./bin/retropi systems disable saturn dreamcast psp nds
./bin/retropi build
```

## Config changes seem to be ignored

The merged config is cached. It rebuilds on mtime, but you can force it:

```sh
./bin/retropi config show          # shows what is actually in effect
./bin/retropi clean                # drops the cache
```

Also check for an env var overriding you — `RETROPI_*` beats both files.

## Saves disappeared after re-syncing ROMs

Saves belong outside the ROM tree. With `saves.centralize: true` (the default) they live in `paths.saves`, so a ROM re-push cannot touch them. Confirm with `./bin/retropi config get paths.saves`.

## Starting over

```sh
./bin/retropi clean --all     # generated state only
rm config/local.yaml          # back to stock configuration
```

Neither touches ROMs, BIOS files or saves.

## Reporting a problem

```sh
./bin/retropi doctor -v > doctor.txt
./tests/run.sh -v
```

Include both, plus `uname -a` and `bash --version`.
