# Debian and Ubuntu

retro-pi runs on Debian 12 (bookworm) and 13 (trixie), and on the distributions built from them: Ubuntu, Linux Mint, Raspberry Pi OS. The Raspberry Pi guide covers board tuning; this one covers a desktop PC, a laptop, or a server you reach over SSH.

Verified end to end on Debian 13 (trixie), x86_64: RetroArch 1.20 from apt, 30 cores from the buildbot, ES-DE 3.4.1, a game rendered and screenshotted with no display attached.

## Setup

```sh
git clone <your-fork> retro-pi && cd retro-pi
./platforms/debian/bootstrap.sh         # desktop
./platforms/debian/bootstrap.sh --headless   # server: adds Xvfb for display-free testing
./bin/retropi install --all             # RetroArch, cores, ES-DE, generated config
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

To play on the machine's own monitor, log in to its desktop session and start the frontend there: `./bin/retropi frontend launch`.

## Checking your changes against Debian

```sh
make test-linux                       # bookworm and trixie containers
make test-linux DEBIAN_RELEASES=trixie
```

CI runs trixie on amd64 and bookworm on arm64.
