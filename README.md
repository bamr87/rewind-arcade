# 🕹️ Rewind Arcade

A **client-side portal of recreated classic computer games**, built on a small pluggable game engine. Ships with **JezzBall** and **Snake**; adding a new game is one file plus one line in a registry. No backend — it builds to static files and plays fully offline.

Built with **React + TypeScript + Vite**. Rendering is plain HTML5 canvas; sound is synthesized with the Web Audio API (no asset files).

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
    types.ts              #   the plug-in contract (GameManifest / GameInstance / GameContext)
    useGameEngine.ts      #   canvas + render loop + input + pause + DPI scaling, bridged to React
    audio.ts              #   shared Web Audio synth (mute is global + persisted)
    storage.ts            #   crash-proof localStorage: best scores + per-game config
    router.ts             #   dependency-free hash router
    util.ts               #   small canvas/color/number helpers
  games/
    registry.ts           # the catalog — the ONE place a game is registered
    jezzball/             #   JezzBall (game logic + manifest/config schema)
    snake/                #   Snake     (game logic + manifest/config schema)
  ui/
    Arcade.tsx            # home grid, generated from the registry
    GamePage.tsx          # mounts a game: HUD + overlays + settings
    Hud.tsx               # progress / lives / stats / actions, driven by the game's HUD model
    Overlay.tsx           # renders a game's declarative menu / win / lose / pause panels
    ConfigPanel.tsx       # settings drawer generated from a game's config schema
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

That's it. The arcade card, routing, HUD, the settings drawer, high-score tracking and pause are all derived from the manifest automatically — no other file needs to change. Snake exists mainly to prove this seam: it shares zero code with JezzBall yet reuses the entire shell.

### The config schema

Each field a game declares becomes a control in the settings drawer (`⚙`) and a persisted, per-device override. Supported field types: `range` (slider), `toggle`, and `select`. Fields marked `restart: true` rebuild the current game when changed. JezzBall, for example, exposes arena size, capture target, starting balls, ball speed and wall speed.

## Games

### JezzBall (1992)
Grow walls to partition the arena and seal off empty space while balls ricochet. A ball touching a wall **mid-build** shatters it and costs a life. Seal the target % to clear the level; each level adds a ball. Click to build, right-click / scroll / **V** to rotate the wall.

### Snake (1976)
Steer a snake with the arrow keys / **WASD** (or swipe on touch), eat apples to grow longer and faster, and avoid the walls and your own tail. Optional wrap-around mode in settings.

## Controls (shared)

- **Space / Enter** — confirm the on-screen panel, or pause/resume during play
- **Esc / P** — pause
- **⚙** — per-game settings · **🔊** — mute (persisted) · **←** — back to the arcade

Best scores and settings are saved in `localStorage`. Append `?debug=1` to the URL to expose the live game instance on `window.__arcade` for console tinkering.
