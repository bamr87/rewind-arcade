# EmulationStation

EmulationStation is a managed part of retro-pi, not an external dependency you wire up yourself. retro-pi installs it, decides where its files belong, and generates the three things it reads: the system list, the gamelists, and (on request) its settings.

```sh
./bin/retropi frontend install    # download and install ES-DE for this platform
./bin/retropi frontend status     # what is installed, where, and what is wired up
./bin/retropi build               # systems + gamelists, written where ES reads them
./bin/retropi frontend launch     # start it
```

## Which frontend

| kind | What it is | Where it runs |
|---|---|---|
| `es-de` | ES-DE (EmulationStation Desktop Edition) | macOS, Linux, Raspberry Pi |
| `emulationstation` | RetroPie's EmulationStation | Raspberry Pi |
| `none` | generate configuration, launch nothing | anywhere |

Both read the same `es_systems.xml`, which is what lets one configuration serve a Mac and a Pi. Set it with `frontend.kind`; retro-pi detects what is actually installed regardless.

## Install

`frontend install` resolves the release asset for your platform from the ES-DE release index and installs it:

| Platform | Asset |
|---|---|
| macOS Apple Silicon | `ES-DE_<ver>-arm64.dmg` |
| macOS Intel | `ES-DE_<ver>-x64.dmg` |
| Linux / Raspberry Pi 4-5 (64-bit) | `ES-DE_aarch64.AppImage` |
| Linux x86_64 | `ES-DE_x64.AppImage` |

Asset URLs are opaque IDs rather than predictable paths, so they are looked up rather than constructed — the version you get is whatever upstream has published.

On macOS the disk image carries a licence agreement that would otherwise block the mount; retro-pi accepts it, copies the app to `/Applications`, and clears the download quarantine flag. On Linux the AppImage lands in `~/Applications` and needs FUSE (`sudo apt-get install -y libfuse2`).

If RetroPie is already installed, retro-pi detects and uses it instead of installing anything.

## Where files go

ES-DE 3.0 moved its application data directory from `~/.emulationstation` to `~/ES-DE`, and keeps settings one level deeper. retro-pi derives the layout from the installed version rather than probing for whatever directory happens to exist — a stale `~/.emulationstation` must not win, or the configuration lands somewhere the frontend never reads.

| What | ES-DE 3.x | RetroPie ES |
|---|---|---|
| home | `~/ES-DE` | `/opt/retropie/configs/all/emulationstation` |
| systems | `<home>/custom_systems/es_systems.xml` | `<home>/es_systems.xml` |
| gamelists | `<home>/gamelists/<system>/gamelist.xml` | same |
| themes | `<home>/themes` | same |
| settings | `<home>/settings/es_settings.xml` | `<home>/es_settings.xml` |

`retropi frontend dirs` prints the resolved paths. Override the lot with `RETROPI_ES_CONFIG_HOME`.

## Gamelists

Without a gamelist, EmulationStation shows raw filenames. retro-pi derives a display title from the standard ROM naming conventions, so the frontend reads properly with no scraping and no network:

| File | Shown as |
|---|---|
| `Backdrop Cycler, The (USA) (Rev 1).nes` | The Backdrop Cycler |
| `Palette_Probe (World) [!].nes` | Palette Probe |
| `Scroll Test Bros. (USA).nes` | Scroll Test Bros. |

A `<sortname>` is written too, so "The Backdrop Cycler" files under B.

```sh
./bin/retropi frontend gamelist              # all enabled systems
./bin/retropi frontend gamelist --dry-run    # report, change nothing
```

`retropi build` does this automatically; turn it off with `frontend.generate_gamelists: false` or `build --no-gamelists`.

**Existing gamelists are merged, never overwritten.** Descriptions, images, ratings and play counts you have scraped are preserved; only games missing from the list are added. An entry whose file has disappeared is reported and left alone, because the metadata is usually worth more than the tidiness.

## Themes

```sh
./bin/retropi frontend themes list
./bin/retropi frontend themes install <git-url>
./bin/retropi frontend themes dir
```

Themes are git repositories cloned into the frontend's theme directory; re-running `install` updates one in place. Select the active theme in the frontend's own UI.

## Settings

`es_settings.xml` is the frontend's own state, so retro-pi only touches the keys you list and only when you ask:

```yaml
frontend:
  settings:
    ROMDirectory: "{roms}"
    MediaDirectory: "{media}"
```

`{roms}`, `{media}` and `{themes}` expand to the resolved paths. No key names are hardcoded, so you can manage anything your frontend version supports.

```sh
./bin/retropi frontend settings           # show what would be written
./bin/retropi frontend settings --apply   # merge it in (the original is backed up)
```

The merge preserves every other setting and keeps the element type the frontend already chose for a key.

## Verifying it worked

ES-DE logs what it parses. After a build:

```sh
./bin/retropi frontend launch
grep -E "Parsing (systems|gamelist)" ~/ES-DE/logs/es_log.txt
```

You should see your `custom_systems/es_systems.xml` and one line per system gamelist.
