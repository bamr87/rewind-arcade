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

### Pellet Panic (1980)
An original maze chase: eat every pellet while four chasers hunt you. Rook chases you directly, Lark ambushes four tiles ahead, Moth flanks off Rook's position, and Wisp backs off when it gets close. They alternate scatter and chase phases. A power pellet turns them blue, so they reverse, slow down, and can be eaten for 200 / 400 / 800 / 1600. **Every level is a freshly generated, left-right-mirrored maze** with side tunnels, a central pen, and no dead ends. Steer with the arrows / **WASD** (or swipe). A turn pressed early is taken at the next opening. Settings: lives, chaser speed, fright time, and a maze seed (0 = new mazes every game). `npm run play:pellet-panic` checks the generator over 500 seeds (symmetric, connected, dead-end free, deterministic) and drives the game's rules headlessly.

### Touchdown (1979)
An original lunar-lander run. Rotate with ← → / **A D** and thrust with ↑ / **W** (pad: stick to rotate, south button or right trigger to thrust); thrust burns fuel. Touch down slow and upright on a pad (×2 wide … ×5 narrow) to score `50 × multiplier` plus a soft-touch bonus of up to 50; any other contact is a crash. **Landing chain:** every landing brings fresh midpoint-displacement terrain, and the next descent starts with your leftover fuel plus a small top-up, so the run ends on a crash or an empty tank. Settings: gravity (Moon / Mars / Earth), starting fuel, terrain roughness and pad count. `npm run play:touchdown` checks the terrain generator for every roughness × pad-count setting (exact pad count, flat, wider than the lander, below the spawn), the landing and crash rules, fuel carry-over and an autopilot flying whole chains at the 50 ms dt cap.

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

Dumps you keep in `emulate/roms/<system-id>/` play with one click. The dev server lists that folder at `/roms-index.json` and streams the files themselves; a gamelist entry that matches one shows a **ROM** badge and launches straight into the browser core at `#/emulate/<id>/<file>`, no file picker. Files are matched to catalog titles by slug, by title, and by No-Intro name, so `sonic-the-hedgehog-2.bin` finds *Sonic The Hedgehog 2*; anything unmatched still appears in the gamelist under its own name. Point somewhere else with `ARCADE_ROMS=/Volumes/games/roms npm run dev` (`RETROPI_PATHS_ROMS` works too).

**On a deployed site the browser keeps its own library instead**, and everything above behaves the same. Two ways in, both on the Emulate page and in Settings → ROM library: **Open roms folder** hands the page a real directory (Chrome and Edge), which is remembered between visits and read on demand — nothing is copied, and the same `roms/<system-id>/` layout works. **Add files** stores dumps in IndexedDB for browsers without folder access, or for a handful of titles. A remembered folder needs one click to re-grant on each visit, because a browser only restores that permission from a gesture. Nothing is ever uploaded.

**The emulator itself can be local too.** `npm run emulatorjs` vendors an EmulatorJS build (runtime, translations, and every core our systems use — about 71 MB) into `arcade/vendor/emulatorjs/`, gitignored. Cores ship in several builds and EmulatorJS picks one at run time, quietly re-requesting from its own CDN anything it cannot find locally, so the script fetches the plain and legacy builds of each; add `--threads` if you serve with COOP/COEP headers. The dev server, `preview`, and `dist/` then serve it at `/emulatorjs/`, so a session reaches no third-party host at all. Without it the frontend falls back to `cdn.emulatorjs.org` and the player says so. `--systems nes,snes` fetches fewer cores; `ARCADE_EMULATORJS` moves the folder. (`cores/reports/*.json` 404s against the CDN too — EmulatorJS asks for a file that is not published.)

Without a local file, **Load dump** opens `#/emulate/<id>` and you drop a dump you own; it is kept in this browser, so it is still there next time. Either way EmulatorJS runs it in the page, each game in its own iframe so switching games is clean. The emulator and its cores come from the vendored build when it is present and from the CDN otherwise; **no game files are fetched or shipped** — a build contains no dumps at all, only the ones you point the browser at. Disc systems may still ask for BIOS you dumped yourself, and `.cue` / `.m3u` are skipped because a browser core streams a single file: use `.chd`, `.iso`, or a zip.

## GitHub Pages

The whole thing is a static site with no backend: hash routing, a relative base, and every stateful part living in the browser. `.github/workflows/deploy.yml` vendors EmulatorJS, runs `npm run build`, and publishes `arcade/dist/`.

What that leaves you with on <https://bamr87.github.io/rewind-arcade/>: the recreations and the whole ES-DE frontend work as-is; the emulator and its cores are served from the site itself; **dumps** come from the folder you grant or the files you add (above), held in IndexedDB; and a **collection** is a `data.js` from `cartidx build` dropped onto the Catalog page, also kept in IndexedDB. Play history, settings, and scores are `localStorage`. Nothing needs a server, and nothing leaves the machine.

## Controls (ES-DE)

- **Left / Right** — system carousel
- **Up / Down** — gamelist
- **Enter** — select / launch
- **Backspace / Esc** — back
- **F1** — main menu
- **PgUp / PgDn** — jump ten
- **/** — search the gamelist
- A–Z — jump to title
- **⌘K / Ctrl+K** — command palette

During a recreation: **Space / Enter** pause or confirm, **Esc / P** pause. The HUD buttons cover everything else.

## Gamepad

Plug one in and press a button — browsers keep a pad hidden until it is used. It drives the whole frontend: the d-pad or left stick moves, **A** selects, **B** goes back, **Start** opens the main menu, **Y** opens the command palette, and the shoulders jump ten rows. The pages that are not a carousel (lobby, catalog, atlas, Hall of Fame, settings) have no wheel to steer, so there the d-pad moves a focus ring to the nearest button in that direction; the keyboard's arrow keys still just scroll.

Every recreation plays from the pad: the d-pad and stick are the arrow keys, **Start** pauses, and each game binds its own action buttons — fire in Asteroids, serve in Breakout, rotate the wall in JezzBall, flag in Minesweeper. Pong seats two pads, one per paddle. JezzBall and Minesweeper still want a pointer for the part that aims.

Settings → Gamepad has a live button read-out for checking a mapping, a rumble switch, and a layout choice: **Xbox**, **Nintendo** (A on the right confirms) or **PlayStation** (✕ confirms). The layout changes both the glyphs shown and which button confirms, so the prompts match the controller in your hands.

While an emulator core is running, the pad belongs to it — EmulatorJS reads the same controller from inside its iframe, so the frontend stops polling until you eject.

Best scores, play history, and settings are saved in `localStorage`. Append `?debug=1` to the URL to expose the live game instance on `window.__arcade` for console tinkering.
