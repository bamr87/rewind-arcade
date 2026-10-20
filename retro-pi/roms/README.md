# ROMs

Game files go in per-system folders here — `roms/nes/`, `roms/snes/` and so on. Folder names come from the system `id`; `./bin/retropi systems list` prints them.

```sh
./bin/retropi build                    # create the folder tree
./bin/retropi roms add ~/game.nes      # file a game automatically
./bin/retropi roms scan                # inventory what you have
./bin/retropi roms checksum            # record SHA-1 for every game
./bin/retropi roms verify              # detect bit rot or a bad transfer
```

`roms add` chooses the folder from the file extension and asks when the extension is ambiguous (`.zip` and `.bin` belong to many systems):

```sh
./bin/retropi roms add --system megadrive ~/sonic.bin
```

Each generated folder contains an `_ABOUT.txt` naming the system, its accepted file types and its default emulator.

**This directory is gitignored.** Nothing here is committed, and retro-pi never downloads games — see [../docs/legal.md](../docs/legal.md).
