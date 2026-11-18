# Development harness

> Run, debug and script games: RetroArch under a dev profile, ES-DE with debug logging, a live seam into a running game, and a headless seam that drives a core from Python faster than real time, as the ground floor for building, customizing and training on games.

`retropi dev` is the harness; `retropi ml` (an optional pack) trains agents on top of it. Inside an editor installed as a Flatpak (VS Code on SteamOS), every `retropi` command except `retropi test` re-runs itself on the host, so they work from the integrated terminal, tasks and F5 alike. In the sandbox the OS, XDG paths and libraries are the Flatpak's, and a `build` run there would write core paths that only exist inside the sandbox into ES-DE's configuration. The test suite stays where it is started.

## Two seams into a game

| | Live | Headless |
|---|---|---|
| What runs | RetroArch, windowed, started by `dev run` | the same libretro core, in a Python process, no window |
| Code | `lib/racmd.py` over RetroArch's network command port and Network RetroPad | `lib/retrohost.py` (ctypes, standard library) |
| Input | `dev press` / `hold` / `release` | `Core.run(frames, buttons)` |
| Memory | `dev peek` / `poke` / `watch` | `core.ram[addr]`, a live writable view |
| Time | `dev pause` / `step` / `resume`, `dev ff` (fast-forward) | as fast as the core runs; save/load state in microseconds |
| Speed | real time, or N x with `--speed N` (8x measured: 61 → 486 frames/s) | ~3,000 frames/s per process, ~47,000 with 32 processes on this machine |
| For | watching, debugging, finding RAM addresses, demonstrating an agent | scripts, tests, bulk runs, reinforcement learning |

Both run the core binary retro-pi installed for RetroArch, so what a script or an agent sees is what the frontend plays.

## Live: drive the game RetroArch is running

```sh
./bin/retropi dev run nes roms/nes/super-mario-bros-duck-hunt.nes --emulator fceumm
./bin/retropi dev run roms/snes/super-metroid.smc      # system from the folder or extension
./bin/retropi dev run nes <rom> --speed 8              # start fast-forwarded at 8x
./bin/retropi dev run nes <rom> --mute                 # no sound; `dev mute` toggles it live
```

Sound: `--mute` starts one run silent, `dev.mute: true` in `config/local.yaml` makes every dev run silent, and `emulation.mute: true` mutes every game the frontend launches too (F9 unmutes in game).

`dev run` launches through `tools/run-rom.sh`, the same resolution the frontend uses, with one more RetroArch overlay (`build/dev/retroarch-dev.cfg`): windowed, an FPS counter, no pausing when the window loses focus, never saving RetroArch's config, a verbose log in `build/dev/retroarch.log`, the command port (`dev.port`, 55355) and the Network RetroPad (`dev.pad_port`, 55400 for player 1). From any other terminal:

```sh
./bin/retropi dev status                 # PLAYING nes,super-mario-bros-duck-hunt,crc32=...
./bin/retropi dev press start            # input, as a player would
./bin/retropi dev hold right+b; sleep 2; ./bin/retropi dev release
./bin/retropi dev pause; ./bin/retropi dev step 30
./bin/retropi dev peek 75a 1             # SMB lives
./bin/retropi dev poke 75a 09            # ... now 9
./bin/retropi dev watch 6d 2             # print Mario's page/x whenever they change
./bin/retropi dev screenshot             # into screenshots/
./bin/retropi dev repl                   # all of the above at a prompt
```

Addresses are hex. A core that publishes a memory map (Nestopia, FCEUmm) is addressed in the console's address space; one that does not (snes9x) falls back to its system RAM from 0, so SNES WRAM `$7E0000` is `0`. Button names are RetroPad ones: `b y select start up down left right a x l r l2 r2 l3 r3`; on the NES, RetroPad `a` is the A button (jump) and `b` is B (run).

The ports are bound by RetroArch for the whole machine, not only localhost: keep them firewalled, and stop the game when you are done.

## Headless: a game as a Python object

```sh
./bin/retropi dev headless nes roms/nes/super-mario-bros-duck-hunt.nes --emulator fceumm \
    --frames 1400 --press "start@200:204,start@400:404,right+b@700:1399,a@900:930" \
    --peek 6d:1 --peek 86:1 --png /tmp/frame.png
./bin/retropi dev headless nes <rom> --emulator fceumm --bench --procs 16 --frames 12000
```

```python
import sys; sys.path.insert(0, "lib")
from retrohost import Core, Buttons
with Core(core_so, rom) as emu:
    emu.run(200)                              # frames, with nothing pressed
    emu.run(5, Buttons.START)
    start = emu.save_state()                  # ~5 KB for the NES; instant
    emu.run(4, Buttons.RIGHT | Buttons.B, render=True)   # keeps the last 2 frames
    x = emu.ram[0x6D] * 256 + emu.ram[0x86]
    emu.load_state(start)
    emu.save_png("frame.png")
```

`render=False` skips copying frames out of the core entirely, the fastest way to advance. Save states are deterministic: the same inputs from the same state give byte-identical RAM and frames (`tests/test_dev.sh` checks it). One core per process, because a libretro core keeps global state; run parallel instances as separate processes.

## Machine learning

`retropi ml` is the optional pack in [`packages/ml/`](../packages/ml/README.md): Gymnasium environments defined by a YAML file per game, PPO training over many emulator processes, and evaluation the way the research literature reports it. The defaults and their sources (Mnih et al. 2015, Machado et al. 2018, Schulman et al. 2017 and the Mario-specific work) are in that README; the original plan and what changed is [ml-integration-plan.md](ml-integration-plan.md).

```sh
./bin/retropi ml setup && ./bin/retropi ml check
./bin/retropi ml train --envs 16 --steps 10e6
```

## Frontend

```sh
./bin/retropi dev frontend               # ES-DE windowed (dev.window), --debug logging
./bin/retropi dev logs                   # follow build/dev/retroarch.log and ES-DE's es_log.txt
./bin/retropi dev check                  # what the harness needs and finds
```

## VS Code

`.vscode/tasks.json` has a task for each `dev` and `ml` entry point, and `.vscode/launch.json` debug configurations for `lib/retrohost.py`, `lib/racmd.py` (a REPL against the running game) and the ML env, so a breakpoint in a reward expression or in the host's callbacks works with F5.

## Building and customizing games

Two directions this harness is the base for, neither built yet:

- **Homebrew.** SteamOS has no compilers, but ships `podman` and `distrobox`: a toolchain container (cc65 for the NES, WLA-DX or ca65 for the SNES, RGBDS for the Game Boy) builds into a folder whose output `retropi dev run <rom>` launches, and `retropi roms import <folder>` adds to the library.
- **Patches.** RetroArch soft-patches content: an `.ips`, `.bps` or `.ups` file with the ROM's name next to it in `roms/<system>/` is applied at load, leaving the dump untouched, and `dev peek`/`poke` are the tools for finding what to change.
