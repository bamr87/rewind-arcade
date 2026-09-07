# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm install
npm run dev        # Vite dev server, hot reload
npm run build      # tsc -b (type-check, noEmit) + vite build -> dist/
npm run preview    # serve the production build
```

There is no test suite, no linter, and no CI. `npm run build` is the only automated check — treat a clean `tsc -b` as the gate. `tsconfig.json` has `strict`, `noUnusedLocals`, and `noUnusedParameters` on, so unused imports/params fail the build even though `npm run dev` will happily serve them. `tsc -b` is incremental via `tsconfig.tsbuildinfo`; delete that file if type-check results look stale.

Verifying gameplay changes means running the app. Append `?debug=1` to the URL to expose `{ manifest, instance }` on `window.__arcade` for console inspection.

## Architecture

Rewind Arcade is a static, backend-free React + TypeScript + Vite site: a pluggable retro-game engine hosting JezzBall and Snake. `vite.config.ts` sets `base: './'` so `dist/` runs from any static host or a bare file path; routing is therefore hash-based (`src/engine/router.ts`, `#/` and `#/play/<id>`) with no server rewrites.

### The engine/game seam

The central design constraint: **`src/engine/` and `src/ui/` know nothing about any specific game, and a game in `src/games/<id>/` never imports React, the router, the DOM shell, or another game.** The whole contract is `src/engine/types.ts`:

- A game exports a `GameManifest` (id, art, copy, `config` schema, `create()`).
- `create(context)` returns a `GameInstance` — a class that declares its own fixed
  `design` resolution and implements `update(dt)` / `render()` plus optional input hooks.
- The instance's only channel back to the host is the `GameContext`: a 2D canvas
context, the resolved config, the audio bus, `setHud`, `setOverlay`, `submitScore`, `getBest`.

Everything user-visible is *derived* from the manifest: the arcade card (`src/ui/Arcade.tsx`), routing (`src/App.tsx`), the HUD (`src/ui/Hud.tsx`, driven by the `HudModel` a game pushes via `setHud`), all menu/win/lose/pause panels (`src/ui/Overlay.tsx`, from the declarative `OverlayModel`), and the settings drawer (`src/ui/ConfigPanel.tsx`, generated from the `ConfigField[]` schema). Adding a game is one directory plus one entry in `GAMES` in `src/games/registry.ts` — no other file changes. Snake exists mainly to keep this seam honest: it shares zero code with JezzBall (tick-based grid vs. continuous physics) yet reuses the entire shell.

### `useGameEngine` owns the lifecycle

`src/engine/useGameEngine.ts` is the only bridge between the plug-in contract and React/the DOM. A single `useEffect` (deps: `manifest`, `config`, `sessionKey`) is where a `GameInstance` is born and dies; it owns the canvas, the one `requestAnimationFrame` loop, DPI/`ResizeObserver` scaling of the design box, pointer/wheel/key listeners, and auto-pause on blur or tab hide. Consequences to keep in mind:

- **Games read config only in their constructor.** Config reactivity works purely
because a changed config rebuilds the session. `GamePage` creates a new config object on every change, so *any* setting restarts the running game — the `restart: true` flag on `ConfigField` is currently declarative only and never consulted by the engine.
- **Keys are split into two classes.** `Space`/`Enter`/`Escape`/`KeyP` are system keys
handled by the host (pause, and confirming the overlay's primary button) and are *not* forwarded to the game. Everything else goes to `onKey`. Don't bind a system key inside a game.
- `dt` is clamped to 50 ms, and `render()` runs even while paused.
- Pointer coordinates are converted to the game's design space before dispatch, so game
  code never sees CSS pixels or DPR.

### Shared services

- `src/engine/storage.ts` — every bit of persistence (best scores, per-game config
overrides, global mute) funnels through this crash-proof `localStorage` wrapper under the `rewind-arcade:` prefix; private-mode/quota failures degrade silently. Loading a config drops saved keys that no longer exist in the schema or whose type changed.
- `src/engine/audio.ts` — one shared Web Audio synth, no asset files: games build SFX
out of `tone()`/`arp()`. `ensure()` is called on first input to satisfy autoplay policies; mute is global and persisted.
- `src/engine/util.ts` — `cfgInt`/`cfgNum`/`cfgBool`/`cfgStr` are the standard way a
  game reads `GameConfig` values with a typed fallback; also `clamp`, `fmt`, `shade`.

### Notes

- `legacy/jezzball-standalone.html` is the preserved original single-file version. It is
  not built or imported; don't try to keep it in sync with `src/`.
- `dist/` is checked in but gitignored — it is a build output, not a source of truth.
