# ES-DE (EmulationStation Desktop Edition)

ES-DE is Rewind Arcade's primary desktop ROM frontend, backed by RetroArch and optional standalone emulators. The default `retropi install` installs ES-DE with the emulator stack. retro-pi manages its system definitions and gamelists; settings are merged only on request. The browser arcade and its console loader remain separate, optional experiences.

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

`frontend.kind` selects the frontend to discover, install and launch; it defaults to `es-de`. An installed legacy EmulationStation does not satisfy an ES-DE installation. Set `frontend.kind: emulationstation` to use an existing RetroPie setup, or `none` to generate configuration without installing or launching a frontend. `RETROPI_FRONTEND_BIN` remains an authoritative explicit executable override; a missing override is reported as missing rather than replaced by another binary.

ES-DE loads only the generated systems by default, using its `<loadExclusive/>` directive. This makes `systems disable` and `build --systems` authoritative even when the excluded systems still contain ROMs. Set `frontend.load_exclusive: false` to complement ES-DE's bundled system list instead. Legacy EmulationStation output omits the directive.

## Install

`frontend install` resolves the release asset for your platform from the ES-DE release index and installs it:

| Platform | Asset |
|---|---|
| macOS Apple Silicon | `ES-DE_<ver>-arm64.dmg` |
| macOS Intel | `ES-DE_<ver>-x64.dmg` |
| Linux / Raspberry Pi 4-5 (64-bit) | `ES-DE_aarch64.AppImage` |
| Linux x86_64 | `ES-DE_x64.AppImage` |

Asset URLs are opaque IDs rather than predictable paths, so they are looked up rather than constructed — the version you get is whatever upstream has published.

On macOS the disk image carries a licence agreement that would otherwise block the mount; retro-pi accepts it, copies the app to `/Applications`, and clears the download quarantine flag. On Linux the AppImage lands in `~/Applications`, and retro-pi runs it once to prove it starts; if it does not, it names the FUSE package for your release (`libfuse2t64` on Debian 13, see [debian.md](debian.md)).

RetroPie's cores and RetroArch can still be reused while ES-DE provides the frontend. To keep the legacy frontend instead, run `./bin/retropi config set frontend.kind emulationstation` before installing or building. Installing legacy EmulationStation itself remains RetroPie's responsibility. `install --no-frontend` skips frontend installation for that invocation; it does not change the configured selection.

## Where files go

ES-DE 3.0 moved its application data directory from `~/.emulationstation` to `~/ES-DE`, and keeps settings one level deeper. retro-pi derives the layout from the installed version rather than probing for whatever directory happens to exist — a stale `~/.emulationstation` must not win, or the configuration lands somewhere the frontend never reads.

| What | ES-DE 3.x | RetroPie ES |
|---|---|---|
| home | `~/ES-DE` | `/opt/retropie/configs/all/emulationstation` |
| systems | `<home>/custom_systems/es_systems.xml` | `<home>/es_systems.xml` |
| gamelists | `<home>/gamelists/<system>/gamelist.xml` | same |
| themes | `<home>/themes` | same |
| settings | `<home>/settings/es_settings.xml` | `<home>/es_settings.xml` |

`retropi frontend dirs` prints the resolved paths. Override the application data directory with `RETROPI_ES_CONFIG_HOME`; current ES-DE releases receive that exact directory through `ESDE_APPDATA_DIR` in both desktop and X11-session launch paths. A pre-existing `ESDE_APPDATA_DIR` is also honored when no retro-pi override is set. A leading `~` is expanded before either generation or launch, matching ES-DE. Custom data-directory launching requires an ES-DE release supporting that upstream environment variable; upgrade older releases before using it. Do not substitute `--home`: that changes ES-DE's whole home-directory interpretation and appends `ES-DE` to the supplied path.

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

**Existing gamelists are merged, never overwritten.** Descriptions, images, ratings and play counts you have scraped are preserved; only games missing from the list are added. Nested game directories retain their relative paths, so identical filenames in separate folders remain distinct. Hidden directories, directory symlinks and subtrees containing `noload.txt` are not scanned. An entry whose file has disappeared is reported and left alone, because the metadata is usually worth more than the tidiness.

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

The merge preserves every other setting and keeps the element type the frontend already chose for a key. Close ES-DE before applying settings so its shutdown does not overwrite the merge. Generated system entries use absolute ROM paths, so launching the managed systems does not require changing `ROMDirectory`; applying it is useful for ES-DE's own directory tools and optional bundled-system merging.

## Controllers and media

Configure the frontend controller in ES-DE and emulator controls in RetroArch; they are separate mappings. Returning from RetroArch restores ES-DE's library view. Use ES-DE's theme downloader for compatible ES-DE themes and its scraper for artwork and descriptions. Legacy EmulationStation themes and media layouts are not interchangeable with ES-DE's. This repository does not download games or BIOS images.

## Verifying it worked

ES-DE logs what it parses. After a build:

```sh
./bin/retropi frontend launch
grep -E "Parsing (systems|gamelist)" ~/ES-DE/logs/es_log.txt
```

You should see your `custom_systems/es_systems.xml` and one line per system gamelist.

Upstream references: [ES-DE user guide](https://gitlab.com/es-de/emulationstation-de/-/blob/master/USERGUIDE.md), [advanced configuration](https://gitlab.com/es-de/emulationstation-de/-/blob/master/INSTALL.md).
