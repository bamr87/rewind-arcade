# The game library

> How one ROM collection becomes the same library on the desktop (ES-DE) and in the browser (the arcade): the catalog identifies and describes every dump and fetches its artwork, emulate links it into ES-DE with gamelists and collections, and the arcade reads the same files.

## One refresh

```sh
make library                       # or: tools/library-sync.sh [--fetch] [--no-media] [LIBRARY_DIR]
```

The library directory defaults to the first `root` in `catalog/cartridge.toml`. Quit ES-DE first: it rewrites its settings on exit. A refresh with nothing new to download takes under a minute; `--fetch` also refreshes the reference data (monthly is plenty).

## The flow

```
LIBRARY_DIR (your dumps, read in place, never moved)
  │
  ├─ cartidx build   → catalog/workspace/roms.csv, games.csv, web/data.js, cartridge.sqlite
  │                     identity (No-Intro), header checks, LaunchBox / libretro / VGChartz
  │                     metadata in one vocabulary (genres, ESRB), ratings, prices
  ├─ cartidx media   → catalog/workspace/media/<system>/<kind>/<dump name>.<ext> + index.json
  │                     covers, marquees, titlescreens, physicalmedia, screenshots
  │
  ├─ retropi roms import LIBRARY_DIR --metadata catalog/workspace/roms.csv
  │                  → emulate/roms/<system>/<dump> (links) + .retropi/metadata/<system>.json
  ├─ retropi build   → ES-DE gamelists: name, description, rating, date, developer,
  │                     publisher, genre, players, kid-friendly flag
  ├─ retropi frontend collections → ES-DE custom collections across consoles
  │
  └─ arcade (npm run dev) reads catalog/workspace/web/data.js, catalog/workspace/media/
                          and emulate/roms/ in place: the same games, data and art
```

The pillars meet only through these files; none imports another (see [architecture.md](architecture.md)).

## On the desktop (ES-DE)

- **Artwork:** `frontend.settings.MediaDirectory` in `emulate/config/local.yaml` points ES-DE at `catalog/workspace/media`, whose folder names are ES-DE's own; apply it with `retropi frontend settings --apply`.
- **Sorting:** ES-DE sorts any game list by name, rating, release date, developer, publisher, genre, players, times played and last played (Start → Sort games by).
- **Filtering and search:** Start → Filter games narrows by text in the name, favorites, genre, players, publisher, developer, rating, kid game and more; it works because every field is filled from the catalog.
- **Grouping:** `retropi frontend collections` writes Top Rated, Classics, `Genre - …`, `Decade - …`, `Series - …`, Multiplayer, Co-op, Family, Betas & Hacks and Unidentified Dumps across all consoles, grouped under Collections in the system carousel. Every collection is a small YAML definition: drop one in `emulate/config/collections.local/` (or ship one in an extension pack's `collections/`) to add, replace or turn off a collection ([commands.md](../emulate/docs/commands.md#frontend)). ES-DE's own All games, Favorites and Last played are on as well (`CollectionSystemsAuto`).
- **Kid mode:** games rated E, EC or K-A carry ES-DE's kid-game flag.

Values the import wrote are refreshed when the catalog improves; anything you edit or scrape in ES-DE is never overwritten (the record of what was written lives in `.retropi/metadata/applied/`).

## In the browser (the arcade)

`npm run dev --prefix arcade` serves the catalog export at `/catalog-data.js`, the artwork at `/media/` and the linked dumps at `/roms/`, so on this machine the browser shows the same image files as ES-DE.

A public site hosts no images: a production build copies none of the media, and every cover, logo and screenshot is an embedded link to where it is already public (LaunchBox's image CDN by the catalog's file names, libretro-thumbnails by No-Intro name). The local `media/` folder exists for ES-DE, which needs files on disk.

## Quality

`cartidx build` prints identification and header verdicts per system, and `cartidx media --report` prints artwork coverage per kind. What remains after a build is mostly what no database lists: betas, hacks and fan translations, which keep a title from the file name and no artwork.
