# Getting started

> Five minutes from a fresh clone to a working frontend, step by step, then the everyday loop and how to move the setup to another machine.

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
./platforms/debian/bootstrap.sh         # Debian, Ubuntu (add --headless on a server)
./platforms/steamos/bootstrap.sh        # SteamOS (add --steam for Game Mode shortcuts)
```

This installs the OS-level dependencies (python3, curl, unzip, rsync) and RetroArch. It is safe to re-run.

## 3. Install the emulation stack

```sh
./bin/retropi install
```

Installs ES-DE and RetroArch if missing, downloads libretro cores for enabled systems from the official buildbot, then generates your frontend configuration. ES-DE is the main ROM frontend. `install --no-frontend` skips installing it, and `install --all` remains an alias for the full stack. Installation still downloads cores and generates configuration if the selected frontend cannot be installed, then exits non-zero instead of silently selecting a different frontend.

To be selective:

```sh
./bin/retropi cores install --system snes
./bin/retropi cores list
```

## 4. Choose your systems

Two dozen systems ship enabled; more manifests sit in `config/systems/` (Lynx, WonderSwan, Amiga, 3DO, Vectrex, and others). Enable extras with `retropi systems enable <id>`. Trim the list so the frontend only shows what you actually play:

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

### A collection on another drive

A collection you keep elsewhere — an external drive, a NAS share — is imported as a directory, and linked rather than copied:

```sh
./bin/retropi roms import /media/games --dry-run
./bin/retropi roms import /media/games --metadata /media/games/catalog.csv
./bin/retropi build
```

- **System folders can sit at any depth.** Each folder's system is the deepest path component that names one, so `nintendo/nes/great/` and `nintendo/nes/rest/` both land in `nes/`. `--map "path/to/folder=system_id"` assigns a folder (and everything under it) explicitly.
- **Holding folders stay out.** Folders whose names start with `_` (`_duplicates`, `_regional`, `_quarantine`, ...) or `.` are held back and listed; `--all-folders` includes the `_` ones. Dotfiles, including macOS `._*` AppleDouble files, are never games.
- **Links, not copies.** Each game becomes a symlink in `roms/<system>/`; the collection is never moved, renamed or touched. `--copy` copies instead, for a library that has to work with the drive unplugged. With links, an unplugged drive simply means those games are absent until it is back.
- **Re-running is a sync.** A game that moved between folders is relinked, a link to a game that is gone is pruned, and nothing else is changed: only links pointing into this collection are ever removed.
- **The extension routes what the folder cannot.** A file whose extension the folder's system does not take goes to the one system that does — SG-1000 `.sg` cartridges kept in a Master System folder land in `sg1000/`. Anything else is listed as not imported.
- **Battery saves come along.** `.srm` files beside the games are copied into `saves/` unless a save of that name is already there.
- **`--metadata <csv>`** reads a catalog with a `path` column (relative to the collection) or a `file` column, and recognises `display_name`/`name`/`title`, `rating_bayesian`/`rating` (0-1, 0-5 or 0-10), `year`, `genre`, `developer`, `publisher`, `max_players`/`players` and `description`. The result is kept per system under `.retropi/metadata/`, so every later `retropi build` fills the gamelist from it — only fields an entry does not have yet, and a title only where the current one was derived from the filename. Anything scraped or typed in stays.

Without metadata, slug-style filenames still get readable titles: `adventures-of-batman-and-robin-the.smc` shows as "The Adventures of Batman and Robin".

## 6. Regenerate and play

```sh
./bin/retropi build
./bin/retropi frontend launch
```

This writes ES-DE's custom system definitions and gamelists, then opens ES-DE. Systems with no games remain hidden. Select a game with your keyboard or controller; ES-DE launches RetroArch using the generated core, BIOS and save paths. Scraping and theme selection are available in ES-DE's own menus. Exit the emulator to return to ES-DE.

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
./bin/retropi provision                # write a first-boot installer onto a mounted Pi bootfs
```

See [raspberry-pi.md](raspberry-pi.md) for the Mac-to-Pi workflow.
