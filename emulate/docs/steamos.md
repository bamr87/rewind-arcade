# SteamOS

> Running retro-pi on SteamOS (a Steam Deck or a desktop PC on SteamOS 3): everything in your home directory, nothing on the read-only root, and ES-DE reachable from Game Mode beside your Steam library.

SteamOS ships `pacman`, but its root filesystem is read-only and replaced on every OS update. retro-pi detects SteamOS (`ID=steamos` in `/etc/os-release`), reports the package manager as `steamos` and never runs `sudo pacman`; anything it installs goes into your home directory, which survives updates.

Verified on SteamOS 3.9 (x86_64 desktop): RetroArch 1.22.2 AppImage from the libretro stable buildbot, ES-DE AppImage, cores from the nightly buildbot.

## Setup

From Desktop Mode, in a terminal:

```sh
cd rewind-arcade/emulate
./platforms/steamos/bootstrap.sh          # check tools, write the launchers
./bin/retropi install                     # RetroArch + ES-DE AppImages, cores, config
./bin/retropi doctor
./platforms/steamos/bootstrap.sh --steam  # add the launchers to Steam (Steam must be running)
```

Everything the bootstrap needs (`python3 curl unzip 7z file rsync git`) is already in the SteamOS image. It is safe to re-run, and `--steam` skips a shortcut Steam already has.

## Where things live

| What | Where |
|---|---|
| RetroArch | `~/Applications/RetroArch.AppImage` (libretro stable buildbot) |
| RetroArch config, assets, cores | `~/.config/retroarch` |
| ES-DE | `~/Applications/ES-DE.AppImage` |
| ES-DE data | `~/ES-DE` |
| Launchers | `~/.local/share/applications/rewind-arcade-*.desktop` |

The RetroArch archive carries a `RetroArch-Linux-x86_64.AppImage.home` directory beside the AppImage. retro-pi does not install it there: the AppImage runtime treats such a directory as a portable `$HOME`, which would move RetroArch's config away from `~/.config/retroarch`. Its assets, shaders and controller profiles are merged into `~/.config/retroarch` instead, without replacing any file already there.

## Game Mode

`bootstrap.sh` writes two desktop entries, and `--steam` adds them to Steam with `steamos-add-to-steam`, SteamOS's own "Add to Steam", which asks the running client to add the shortcut instead of editing `shortcuts.vdf`:

| Shortcut | Runs |
|---|---|
| Rewind Arcade | `bin/retropi frontend launch`: ES-DE over your ROM library |
| Rewind Arcade (Browser) | the browser recreations in Firefox kiosk mode (`RETROPI_ARCADE_URL` overrides the site) |

Both appear under Non-Steam in your library. Artwork and controller layouts are Steam's to set. ES-DE reads the gamepad through Steam Input, so the default gamepad layout works.

## Controllers

`retropi build` installs RetroArch profiles for Steam Input's virtual pad (what every controller becomes when a game is started from Steam) and for an Xbox Elite Series 2 over Bluetooth.

**An Xbox controller over Bluetooth works in ES-DE but not in games.** Xbox pads on Bluetooth report keyboard keys (the Share button) next to their gamepad buttons, so systemd classifies them as keyboards, not joysticks. They then get no access rights for your user, and RetroArch's `udev` joypad driver never sees them. ES-DE is unaffected because SDL reads the pad through `hidraw`. Started from Desktop Mode, the only pad RetroArch finds is Steam's virtual one, which Steam's Desktop Layout drives with mouse and keyboard input instead. Fix it once, with your password:

```sh
./platforms/steamos/bootstrap.sh --controllers
```

This installs a udev hwdb override (`/etc/udev/hwdb.d/70-retropi-xbox-bluetooth.hwdb`, kept across SteamOS updates) that marks Bluetooth Xbox pads as joysticks. If the pad is still not seen, switch it off and on again. Launching through the Rewind Arcade shortcut in Steam avoids the problem without the override, because Steam then feeds its virtual pad from the controller's gamepad layout.

**Steam in the background doubles every press.** While Steam runs in Desktop Mode, its Desktop Layout also types keys for each controller: Enter, Space, the arrows, Escape, Tab. RetroArch reads those as a keyboard on top of the pad, so A also presses Start and a button can quit the game. On SteamOS `retropi build` therefore clears RetroArch's keyboard binds for exactly those keys (`controls.keyboard: auto`; `true` keeps them) and pins the `udev` joypad driver.

**Steam's virtual pad takes player 1.** RetroArch numbers Steam's virtual pad before a Bluetooth controller, and in Desktop Mode that pad is silent. Name your controller for player 1 in `config/local.yaml`; RetroArch then gives it port 1 whenever it is connected:

```yaml
controls:
  player1_device: "Xbox Wireless Controller"   # or vid:pid, e.g. "045e:0b22"
```

Hotkeys (hold Select/View, then Start/Menu to quit, X/Y for the menu, R/L to save or load a state) are written into each controller profile retro-pi installs, resolved against that controller's own buttons, because raw button numbers differ between pads.

To make a change in the RetroArch menu permanent, use Main Menu > Configuration File > Save Current Configuration: launches from retro-pi do not save RetroArch's config on exit, so its settings never leak into your own `retroarch.cfg`.

## ROMs and BIOS

ROMs go in `emulate/roms/<system>/` as on any other platform. A collection on an SD card or an external drive (SteamOS mounts them under `/run/media/deck/<label>`) is best linked in place with `./bin/retropi roms import /run/media/deck/<label>/<folder>`, then `./bin/retropi build`; re-run the import after changing the collection. A linked game is only playable while its drive is mounted. retro-pi never downloads games or BIOS images. See [getting-started.md](getting-started.md#a-collection-on-another-drive).

## Removing it

Delete `~/Applications/RetroArch.AppImage`, `~/Applications/ES-DE.AppImage`, `~/.config/retroarch`, `~/ES-DE` and the two desktop entries, then remove the shortcuts in Steam. Nothing outside your home directory was changed.
