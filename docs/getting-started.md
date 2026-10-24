# Getting started

> Play, emulate and catalog from a fresh clone: the three entry points, in order, and what each needs on your machine.

Three entry points, depending on whether you want to play in a browser, boot real console software, or index a collection.

## Play (browser)

Original recreations. No ROMs, no accounts, no backend.

```sh
npm install --prefix arcade
npm run dev --prefix arcade
```

Open the printed URL. Hash routes: `#/` for the hub, `#/play/jezzball` for a game, `#/emulate` for the console loader, `#/catalog` for the collection browser, `#/systems` for the shared id map.

A gamepad drives the whole frontend — the carousel, the gamelists, the other pages by way of a focus ring, and every recreation. Plug one in and press a button; the layout (Xbox, Nintendo, PlayStation) is under Settings → Gamepad.

Dumps you already keep in `emulate/roms/<system-id>/` appear in the browser frontend too: picking one launches it in the page, with no file picker. `npm run emulatorjs --prefix arcade` vendors EmulatorJS and the cores those systems use (~71 MB, gitignored) so a session loads nothing from a CDN.

Production build is static files in `arcade/dist/` and is what GitHub Pages serves. The deployed site runs entirely in the browser: point it at a roms folder (or add files) and drop in a `cartidx build` export, and it keeps both — no server, nothing uploaded.

Adding a game is one directory plus one line in `arcade/src/games/registry.ts`. See [arcade/README.md](../arcade/README.md).

## Emulate (ES-DE + RetroArch)

ES-DE (EmulationStation Desktop Edition) is the primary ROM frontend on macOS, 64-bit Raspberry Pi OS, and Debian/Ubuntu. RetroArch runs the selected games; the browser loader is a separate optional interface.

```sh
./bin/retropi doctor        # reports what this machine needs; changes nothing
./bin/retropi install       # ES-DE + RetroArch + cores + generated config
./bin/retropi build         # regenerate the frontend
./bin/retropi frontend launch   # browse and launch games in ES-DE
```

Put dumps you own in `emulate/roms/<system-id>/` (or point `paths.roms` at a drive). The tool never fetches games or BIOS.

Two dozen systems are enabled in a fresh frontend. More manifests live in `emulate/config/systems/`:

```sh
./bin/retropi systems list
./bin/retropi systems enable lynx
./bin/retropi cores install --system lynx
./bin/retropi build
```

Full walkthrough: [emulate/docs/getting-started.md](../emulate/docs/getting-started.md). Platform notes: [macOS](../emulate/docs/macos.md), [Raspberry Pi](../emulate/docs/raspberry-pi.md), [Debian](../emulate/docs/debian.md).

## Catalog (inventory + identification)

Python 3.11+, no pip. ROM folders are optional and are never moved.

```sh
./bin/cartidx init --systems nes,snes,n64
./bin/cartidx fetch              # reference metadata only (~110 MB)
./bin/cartidx build              # identify, enrich, export
./bin/cartidx serve              # http://127.0.0.1:8765
```

`init --root /path/to/roms` recognises emulate's `roms/<id>` layout as-is.

Full command list: [catalog/README.md](../catalog/README.md).

## One library, three views

```
emulate/roms/nes/game.nes     # you supply this; git never sees it
        │
        ├─ retropi build      # frontend entry, launch command
        └─ cartidx scan       # header + No-Intro hash, recorded in place
```

Ids come from [`systems/registry.yaml`](../systems/registry.yaml). If emulate has a folder name, catalog uses the same string.
