# Debian and Ubuntu

> Running retro-pi on Debian 12/13 and the distributions built from them — desktop, laptop or a server over SSH — including apt cores, the frontend AppImage and running with no display.

retro-pi runs on Debian 12 (bookworm) and 13 (trixie), and on the distributions built from them: Ubuntu, Linux Mint, Raspberry Pi OS. The Raspberry Pi guide covers board tuning; this one covers a desktop PC, a laptop, or a server you reach over SSH.

Verified end to end on Debian 13 (trixie), x86_64: RetroArch 1.20 from apt, 30 cores from the buildbot, ES-DE 3.4.1, a game rendered and screenshotted with no display attached.

## Setup

```sh
git clone <your-fork> retro-pi && cd retro-pi
./platforms/debian/bootstrap.sh         # desktop
./platforms/debian/bootstrap.sh --headless   # server: adds Xvfb for display-free testing
./bin/retropi install                   # ES-DE, RetroArch, cores, generated config
./bin/retropi doctor
```

The bootstrap installs `python3 curl unzip rsync git p7zip-full ca-certificates file` and RetroArch from apt. `file` is how retro-pi checks that a core matches RetroArch's architecture on Linux; without it that check is skipped.

## Where things live

| What | Where |
|---|---|
| RetroArch | `/usr/bin/retroarch` (apt) |
| RetroArch config | `~/.config/retroarch/retroarch.cfg` |
| cores retro-pi installs | `~/.config/retroarch/cores` |
| cores apt installs | `/usr/lib/<multiarch>/libretro`, e.g. `/usr/lib/x86_64-linux-gnu/libretro` |
| ES-DE | `~/Applications/ES-DE.AppImage` |
| ES-DE data | `~/ES-DE` |

## Cores: buildbot and apt side by side

Debian packages a handful of cores (`libretro-nestopia`, `libretro-mgba`, `libretro-gambatte`, `libretro-desmume`, `libretro-bsnes-mercury-*`, ...) and installs them under the multiarch directory, not `/usr/lib/libretro`. retro-pi searches that directory, so a core you installed with apt counts as installed and launches without a second copy.

Cores retro-pi downloads always go to `~/.config/retroarch/cores`, which you own — the apt directory belongs to root and `cores install` never writes there. When both have the same core, retro-pi's copy wins, because that is the one `cores update` keeps current. `cores list` prints every directory it searched, and `cores remove` refuses to delete a core apt owns.

Most systems have no apt core at all (snes9x, genesis_plus_gx, mupen64plus_next, swanstation, ...), so `retropi cores install` is still the normal path.

## The frontend AppImage

`retropi frontend install` puts ES-DE in `~/Applications` and then runs it once with `--version` to prove it starts. Current ES-DE builds start with only `fuse3` present, which is what Debian 13 ships. If an AppImage does not start, retro-pi names the FUSE 2 package for your release — `libfuse2t64` on Debian 13 and Ubuntu 24.04, `libfuse2` before that — and the no-FUSE fallback, `--appimage-extract-and-run`.

## No display: servers and SSH

RetroArch and ES-DE need a screen. Over SSH, or on a machine booted to a console, `DISPLAY` and `WAYLAND_DISPLAY` are unset; `doctor` warns about it and `tools/run-rom.sh` refuses to launch rather than failing inside RetroArch.

Everything that is not drawing still works: install, build, cores, ROM management, sync. To prove the drawing works too, run a game inside a virtual display for a fixed number of frames and keep the last one:

```sh
sudo apt-get install -y xvfb xauth        # or: platforms/debian/bootstrap.sh --headless
python3 tests/fixtures/make_test_rom.py roms/nes/retropi-test.nes
tools/run-rom.sh nes --headless --frames 120 --screenshot /tmp/shot.png
```

The test cartridge changes the backdrop colour every 16 frames, so screenshots at different frame counts should differ. A screenshot that is a single colour is not by itself a failure — one of the colours it cycles through is black.

## Playing on the machine's own monitor

A machine with no desktop — a server, or a box booted to a text console — can still put the frontend on its monitor. `frontend session start` starts an X server on a virtual terminal with ES-DE as its only client, and works over SSH:

```sh
sudo apt-get install -y --no-install-recommends xserver-xorg xinit x11-xserver-utils xdotool
./bin/retropi frontend session start
./bin/retropi frontend session stop
```

A rotated monitor, or only part of the screen, is machine-local configuration:

```yaml
# config/local.yaml
display:
  rotate: left          # normal | left | right | inverted
  region: top-half      # full | top-half | bottom-half | left-half | right-half
controls:
  joypad_driver: linuxraw
```

The session rotates the output, measures the rotated screen, sizes ES-DE to the region, and writes `build/retroarch-display.cfg` so every game opens as a borderless window in the same place. With `rotate` in xrandr's terms, `left` turns the picture 90° counter-clockwise; if the result is upside down, use the other one.

### Sound through the monitor

RetroArch and ES-DE play to PipeWire's default output, which on a machine with onboard audio is usually not the HDMI port. Speakers on the monitor, or a Dell soundbar on its audio-out, need the graphics card's HDMI output to be the default:

```sh
./bin/retropi audio list          # * marks the current default
./bin/retropi audio set hdmi
./bin/retropi config set audio.output hdmi   # and keep applying it for sessions
```

If the list has no HDMI output, the card's HDMI profile is off or the monitor is on another connector; `wpctl status` and `/proc/asound/card*/eld*` (look for `monitor_present 1`) show which.

### Controllers in a session started over SSH

The X server inherits the SSH login, not a local seat, so it gets no access to `/dev/input/event*` — RetroArch's `udev` driver and ES-DE both see no gamepad. The classic joystick nodes (`/dev/input/js*`) stay readable, so set `controls.joypad_driver: linuxraw`: RetroArch uses them, and the session tells ES-DE's SDL to as well.

`retropi build` installs the controller profiles from `config/controllers/` into `~/.config/retroarch/autoconfig/`. Debian's RetroArch ships none, so without them a pad is detected but its buttons are unmapped. The bundled profile covers XInput pads: Xbox 360 controllers and 8BitDo pads in X-input mode, which identify as "Microsoft X-Box 360 pad". Add another by dropping its `.cfg` into `config/controllers/<driver>/`.

On a desktop machine, just log in to the desktop and run `./bin/retropi frontend launch`.

## Checking your changes against Debian

```sh
make test-linux                       # bookworm and trixie containers
make test-linux DEBIAN_RELEASES=trixie
```

CI runs trixie on amd64 and bookworm on arm64.
