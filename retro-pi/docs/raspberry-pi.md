# Raspberry Pi

## Supported boards

| Board | Architecture | Comfortable through | Notes |
|---|---|---|---|
| Pi 5 | arm64 | PS1, N64, some Dreamcast/PSP | Use accuracy cores |
| Pi 4 | arm64 | PS1 | N64/DC need per-game tuning |
| Pi 3 | arm64/armhf | 16-bit | Use the fast cores |
| Pi Zero 2 W | arm64 | 8-bit, light 16-bit | |

Use the **64-bit** Raspberry Pi OS. The libretro buildbot's `linux/aarch64` builds are better maintained than the 32-bit ones.

## Setup

```sh
git clone <your-fork> retro-pi && cd retro-pi
./platforms/raspberrypi/bootstrap.sh
./bin/retropi install
```

The bootstrap installs dependencies, installs RetroArch from apt (or detects an existing RetroPie install), and prints performance advice for your board.

## Works alongside RetroPie

If RetroPie is already installed, retro-pi detects and uses it rather than competing with it:

- cores: `/opt/retropie/libretrocores`
- RetroArch: `/opt/retropie/emulators/retroarch/bin/retroarch`
- frontend config: `/opt/retropie/configs/all/emulationstation`

You can also run retro-pi standalone with plain RetroArch and ES-DE.

## Tuning for slower boards

Override the default emulator per system — no manifest editing:

```sh
./bin/retropi config set emulators.snes snes9x2010
./bin/retropi config set emulators.psx pcsx-rearmed
./bin/retropi config set emulators.megadrive picodrive
./bin/retropi build
```

Trim the system list so the frontend is not cluttered with things the board cannot run:

```sh
./bin/retropi systems disable saturn dreamcast psp nds n64
```

## Storing ROMs on external media

SD cards are slow and wear out. Point the library at a USB SSD:

```sh
./bin/retropi config set paths.roms /media/pi/games/roms
./bin/retropi config set paths.saves /media/pi/games/saves
./bin/retropi build
```

Absolute paths are used as-is; relative ones resolve inside the repo.

## The Mac-to-Pi workflow

Curate on the Mac, push to the Pi under the TV.

Configure the target once in `config/local.yaml`:

```yaml
sync:
  targets:
    pi:
      host: retropie.local
      user: pi
      path: /home/pi/RetroPie
      include: [config, roms, bios]
```

Then:

```sh
./bin/retropi sync push pi --dry-run    # always look first
./bin/retropi sync push pi
ssh pi@retropie.local 'cd retro-pi && ./bin/retropi build'
```

Bring save games back the other way:

```sh
./bin/retropi sync pull pi saves
```

Because saves are centralized (`saves.centralize`), they live outside the ROM tree and survive a full ROM re-push.

## Autostart into the frontend

With RetroPie, EmulationStation already autostarts. For a plain Raspberry Pi OS install, add to `~/.bashrc` (console boot):

```sh
if [ "$(tty)" = "/dev/tty1" ]; then
  emulationstation
fi
```

## Controllers

Configure once in RetroArch, then let retro-pi write consistent hotkeys:

```yaml
controls:
  hotkey_enable: select
  hotkeys:
    exit: start        # select+start quits back to the frontend
    menu: x
    save_state: r
    load_state: l
```

```sh
./bin/retropi build --apply-retroarch
```
