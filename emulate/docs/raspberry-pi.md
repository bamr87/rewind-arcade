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

On the Pi itself:

```sh
git clone <your-fork> retro-pi && cd retro-pi
./platforms/raspberrypi/bootstrap.sh
./bin/retropi install
./bin/retropi frontend launch   # from a graphical desktop session
```

From a Mac, with the Pi's USB disk mounted (`bootfs`):

```sh
./bin/retropi provision
```

That writes a first-boot installer onto the FAT boot partition. Plug the disk into the Pi (or boot the QEMU VM). On first boot, with network, the board unpacks retro-pi to `/opt/retro-pi`, installs RetroArch + cores + ES-DE, and autostarts the frontend. Login is the Mac username unless you pass `--user`; the password is printed and saved as `retropi-credentials.txt` on `bootfs`.

The bootstrap runs the generic [Debian bootstrap](debian.md) — dependencies, RetroArch from apt, or an existing RetroPie install — and then prints performance advice for your board.

## Works alongside RetroPie

ES-DE is the default frontend, even when RetroPie is installed. Existing RetroArch and cores remain reusable:

- cores: `/opt/retropie/libretrocores`
- RetroArch: `/opt/retropie/emulators/retroarch/bin/retroarch`

To retain RetroPie's frontend, explicitly run `./bin/retropi config set frontend.kind emulationstation`, then rebuild. Its configuration remains under `/opt/retropie/configs/all/emulationstation`; ES-DE uses `~/ES-DE`. No legacy settings or scraped metadata are migrated or deleted automatically.

The ES-DE AppImage requires a 64-bit OS and a working graphical session. Upstream recommends `MESA_GL_VERSION_OVERRIDE=3.3 ./bin/retropi frontend launch` on Raspberry Pi OS if desktop OpenGL is not advertised correctly. On unsupported 32-bit boards, explicitly choose an installed legacy frontend or use `install --no-frontend`; there is no silent fallback.

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

On Raspberry Pi OS Desktop, add the absolute path to `bin/retropi frontend launch` to the desktop's autostart applications. ES-DE's AppImage needs a graphical session; running it directly from a bare console is not sufficient. On a console-only installation, install the X11 dependencies and use the managed session described in [debian.md](debian.md#playing-on-the-machines-own-monitor):

```sh
./bin/retropi frontend session start
```

With an explicitly selected RetroPie frontend, RetroPie's existing autostart can remain in place.

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
