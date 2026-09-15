# Play — Rewind Arcade

The **play** pillar of [Rewind Arcade](../README.md): an **ES-DE-style frontend** in the browser — system carousel, gamelist, then launch. Recreations, dumps you own, and a cartidx catalog share the same ids. No backend. Collection data and dumps stay on your machine; the production build never ships them.

**▶ Play it: <https://bamr87.github.io/rewind-arcade/>**

Built with **React 19 + TypeScript + Vite**, styled with **Tailwind CSS v4**, animated with **Motion**, with a **cmdk** command palette and **sonner** toasts. Game rendering is plain HTML5 canvas; sound is synthesized with the Web Audio API (no asset files). Fonts are bundled, so the site still works offline from a folder.

## Quick start

```sh
npm install
npm run dev        # dev server with hot reload
# or
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

Then open the printed URL. The build uses a relative base, so `dist/` can be dropped on any static host (GitHub Pages, Netlify, S3, a plain folder) with no configuration.

## What's inside

```
src/
  engine/                 # framework — knows nothing about any specific game
  games/                  # recreations; registry.ts is the ONE place a game is registered
  emulate/systems.ts      # EmulatorJS cores (same ids as retro-pi)
  systems/                # bundled parse of systems/registry.yaml
  catalog/                # cartidx data.js types, parser, IndexedDB store
  profile/                # play history: sessions, time, score trends, favorites
  settings/               # frontend preferences: phosphor theme, CRT, motion
  styles/app.css          # Tailwind entry; older sheets load in a lower cascade layer
  ui/
    esde/                 # ES-DE system view, gamelist, main menu
    kit.tsx               # shared buttons, switches, panels, stat tiles
    Shell.tsx             # top bar
    CommandPalette.tsx    # ⌘K / Ctrl+K search across games, systems, collection
    PlayLobby.tsx         # featured cabinet, stats, filterable game grid
    ProfilePage.tsx       # Hall of Fame: achievements, scoreboard, backup
    SettingsPage.tsx      # preferences and shortcut reference
    CatalogPage.tsx       # library, physical, analyze, price guide
    SystemsPage.tsx       # encyclopedia of shared ids
    EmulatePage.tsx       # drop a dump you own
    GamePage.tsx          # mounts a game: HUD + overlays + settings
legacy/
  jezzball-standalone.html  # the original single-file version, preserved
```

The **engine** owns everything reusable — the render loop, input, pause (and auto-pause on blur), DPI-aware scaling, high scores, config persistence, theming, and all the shared UI. A **game** is a self-contained module that talks to the host only through the `GameContext` it is handed. It never imports React, the router, or another game.

## Adding a game

1. Create `src/games/<your-game>/game.ts` with a class implementing `GameInstance` — it declares
its own `design` resolution and implements `update(dt)` / `render()` plus whatever input hooks it needs. It receives a `GameContext` for canvas, config, audio, HUD, overlays and scores.
2. Export a `GameManifest` (title, art, description, and a **config schema**) from
   `src/games/<your-game>/index.ts`.
3. Add the manifest to the `GAMES` array in `src/games/registry.ts`.

That's it. The arcade card, routing, HUD, the settings drawer, high-score tracking and pause are all derived from the manifest automatically — no other file needs to change. Snake and Minesweeper exist mainly to prove this seam: they share zero code with JezzBall — or with each other — yet reuse the entire shell. Minesweeper is turn-based rather than animated, which shows the loop is happy to drive a game where nothing moves on its own.

### The config schema

Each field a game declares becomes a control in the HUD's game settings drawer and a persisted, per-device override. Supported field types: `range` (slider), `toggle`, and `select`. Fields marked `restart: true` rebuild the current game when changed. JezzBall, for example, exposes arena size, capture target, starting balls, ball speed and wall speed.

## Games

### Pong (1972)
Two paddles and a bouncing square. Mouse or W/S for the left paddle; CPU or arrows on the right. First to the target score wins.

### JezzBall (1992)
Grow walls to partition the arena and seal off empty space while balls ricochet. A ball touching a wall **mid-build** shatters it and costs a life. Seal the target % to clear the level; each level adds a ball. Click to build, right-click / scroll / **V** to rotate the wall.

### Breakout (1976)
Slide a paddle, keep the ball up, clear the brick wall. Click or **F** to serve. Upper rows score more.

### Minesweeper (1990)
Uncover squares and read the numbers — each one counts the mines in the eight squares around it. Click to dig, right-click / scroll / **F** to flag, and click a fully flagged number to clear its neighbours in one move. The first click is always safe. Field size and mine density are configurable.

### Snake (1976)
Steer a snake with the arrow keys / **WASD** (or swipe on touch), eat apples to grow longer and faster, and avoid the walls and your own tail. Optional wrap-around mode in settings.

### Asteroids (1979)
Thrust, turn, and shoot the rocks. **F** / **K** fires (Space is pause). Edges wrap; big rocks split.

## Frontend

- **Play lobby** (`#/play`) — a featured cabinet (your last game, or a daily pick), lifetime stats, and a game grid you can filter by favorites, played, or new, search, and sort.
- **Command palette** — ⌘K / Ctrl+K from any frontend page. Jump to a recreation, a page, a system, or any title in a loaded collection; toggle sound, the CRT filter, or the theme; or insert a coin for a random game.
- **Hall of Fame** (`#/profile`) — sessions, time played, records, achievements, and a per-game scoreboard with recent-score trends. Export the history to JSON and import it on another browser; imported best scores only ever go up.
- **Settings** (`#/settings`) — phosphor accent (cyan, magenta, amber, green, violet), ambient backdrop, motion (system, reduced, full), CRT filter, record celebrations, and sound.
- **In game** — the HUD adds restart, how to play, CRT filter, screenshot (PNG of the canvas), and fullscreen. Beating a personal best raises a toast and confetti.

## Catalog

`#/catalog` is the collection browser. It does not import Python. With a current `cartidx build`, the system carousel shows each console with a fan of box covers from your owned and top-rated titles, and game details carry descriptions, release dates, and cover art. Images load from libretro and LaunchBox when shown; nothing is downloaded or shipped. After `cartidx build`, `make play` will pick up `catalog/workspace/web/data.js` in dev. On a static host, drop that `data.js` onto the page (stored in IndexedDB). Until a collection is loaded, the page shows the platform atlas from `systems/registry.yaml`.

Tabs: Library, Physical, Analyze, Price guide — the same views as `cartidx serve`, restyled into this shell. `#/systems` lists every shared id and links through to play, emulate, or catalog.

## Emulate

From a system's gamelist, **Load dump** opens `#/emulate/<id>`. Drop a dump you own; EmulatorJS runs it in the page. Cores load from a CDN; **no game files are fetched or shipped**. Disc systems may still ask for BIOS you dumped yourself.

## Controls (ES-DE)

- **Left / Right** — system carousel
- **Up / Down** — gamelist
- **Enter / A** — select / launch
- **Backspace / Esc / B** — back
- **F1 / Start** — main menu
- **/** — search the gamelist
- A–Z — jump to title
- **⌘K / Ctrl+K** — command palette

During a recreation: **Space / Enter** pause or confirm, **Esc / P** pause. The HUD buttons cover everything else.

Best scores, play history, and settings are saved in `localStorage`. Append `?debug=1` to the URL to expose the live game instance on `window.__arcade` for console tinkering.
