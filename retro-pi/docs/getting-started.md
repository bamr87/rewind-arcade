# Getting started

Five minutes from a fresh clone to a working frontend.

## 1. Check the machine

```sh
./bin/retropi doctor
```

`doctor` never changes anything. It reports what is present, what is missing, and ends with a list of the exact commands to run next. Start here on every new machine.

## 2. Bootstrap the platform

```sh
./platforms/macos/bootstrap.sh          # macOS
./platforms/raspberrypi/bootstrap.sh    # Raspberry Pi OS
```

This installs the OS-level dependencies (python3, curl, unzip, rsync) and RetroArch. It is safe to re-run.

## 3. Install the emulation stack

```sh
./bin/retropi install
```

Installs RetroArch if missing, downloads a libretro core for every enabled system from the official buildbot, then generates your frontend configuration.

To be selective:

```sh
./bin/retropi cores install --system snes
./bin/retropi cores list
```

## 4. Choose your systems

Two dozen systems ship enabled. Trim the list so the frontend only shows what you actually play:

```sh
./bin/retropi systems list
./bin/retropi systems disable saturn dreamcast nds
./bin/retropi systems enable psx
```

Changes are written to `config/local.yaml`, which is gitignored and yours.

## 5. Add games

retro-pi does not supply games. Copy your own dumps in:

```sh
cp ~/Downloads/*.sfc roms/snes/
./bin/retropi roms add ~/Downloads/game.nes        # or let it file them
./bin/retropi roms scan
```

`roms add` picks the target folder from the file extension and asks when the extension is ambiguous (`.zip` and `.bin` belong to many systems).

For a collection organised one folder per console, import the archive whole:

```sh
./bin/retropi roms import collection.zip --dry-run   # show the plan first
./bin/retropi roms import collection.zip
```

Folder names are matched against every name a system answers to — its id, aliases, short name and full name, with a leading manufacturer dropped if that helps — so "Sega Genesis" lands in `megadrive/` and "Nintendo 64" in `n64/`. This matters because the extension frequently cannot decide: `.bin` and `.zip` belong to a dozen systems. Anything unmatched is reported rather than guessed, and `--map "Folder Name=system_id"` forces it. Games already present are never overwritten.

## 6. Regenerate and play

```sh
./bin/retropi build
```

This writes `es_systems.xml` into your frontend's config directory. Start ES-DE or EmulationStation and your systems are there.

## The loop from here

```sh
./bin/retropi roms scan      # what do I have?
./bin/retropi bios check     # what firmware is still missing?
./bin/retropi doctor         # is anything broken?
./bin/retropi build          # apply config changes
```

## Moving the setup to another machine

```sh
./bin/retropi package                  # a small archive: tooling + config
./bin/retropi sync push pi             # or rsync straight to the Pi
```

See [raspberry-pi.md](raspberry-pi.md) for the Mac-to-Pi workflow.
