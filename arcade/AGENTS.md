# arcade

> The rules for working in the play pillar (`arcade/`): the commands, the engine/game seam, the lifecycle owned by `useGameEngine`, the shared services, styling, and the catalog and emulator integration.

These are the canonical agent instructions for this pillar; the monorepo rules are in [../AGENTS.md](../AGENTS.md) and apply here too.

## Commands

```sh
npm install
npm run dev        # Vite dev server, hot reload
npm run build      # tsc -b (type-check, noEmit) + vite build -> dist/
npm run preview    # serve the production build
```

There is no test suite and no linter. `npm run build` is the only automated check — treat a clean `tsc -b` as the gate; CI (`.github/workflows/arcade.yml`) runs exactly `npm ci` and `npm run build`. `tsconfig.json` has `strict`, `noUnusedLocals`, and `noUnusedParameters` on, so unused imports/params fail the build even though `npm run dev` will happily serve them. `tsc -b` is incremental via `tsconfig.tsbuildinfo`; delete that file if type-check results look stale.

Verifying gameplay changes means running the app. Append `?debug=1` to the URL to expose `{ manifest, instance }` on `window.__arcade` for console inspection.

## Architecture

Rewind Arcade is a static, backend-free React 19 + TypeScript + Vite site: a pluggable retro-game engine inside an ES-DE-style frontend. `vite.config.ts` sets `base: './'` so `dist/` runs from any static host or a bare file path; routing is hash-based (`src/engine/router.ts`: `#/` system view, `#/system/<id>` gamelist, `#/play` lobby, `#/play/<id>`, `#/emulate/<id>`, `#/catalog`, `#/systems/<id>`, `#/profile`, `#/settings`). It deliberately stays a Vite SPA rather than Next.js: everything is client-side canvas, and the relative-base static deploy is a requirement. Heavy pages (`GamePage`, `EmulatePage`, catalog, systems, profile, settings, the command palette) are `React.lazy` chunks.

### The engine/game seam

The central design constraint: **`src/engine/` and `src/ui/` know nothing about any specific game, and a game in `src/games/<id>/` never imports React, the router, the DOM shell, or another game.** The whole contract is `src/engine/types.ts`:

- A game exports a `GameManifest` (id, art, copy, `config` schema, `create()`).
- `create(context)` returns a `GameInstance` — a class that declares its own fixed `design` resolution and implements `update(dt)` / `render()` plus optional input hooks.
- The instance's only channel back to the host is the `GameContext`: a 2D canvas context, the resolved config, the audio bus, `setHud`, `setOverlay`, `submitScore`, `getBest`.

Everything user-visible is *derived* from the manifest: the lobby card (`src/ui/GamesGrid.tsx`), routing (`src/App.tsx`), the HUD (`src/ui/Hud.tsx`, driven by the `HudModel` a game pushes via `setHud`), all menu/win/lose/pause panels (`src/ui/Overlay.tsx`, from the declarative `OverlayModel`), and the settings drawer (`src/ui/ConfigPanel.tsx`, generated from the `ConfigField[]` schema). Adding a game is one directory plus one entry in `GAMES` in `src/games/registry.ts`, plus a cover branch and fallback-exclusion entry in `src/ui/esde/PlayCover.tsx` — no engine or other UI file changes. Snake and Minesweeper exist mainly to keep this seam honest: they share zero code with JezzBall or each other (tick-based grid, turn-based deduction, continuous physics) yet reuse the entire shell.

### `useGameEngine` owns the lifecycle

`src/engine/useGameEngine.ts` is the only bridge between the plug-in contract and React/the DOM. A single `useEffect` (deps: `manifest`, `config`, `sessionKey`) is where a `GameInstance` is born and dies; it owns the canvas, the one `requestAnimationFrame` loop, DPI/`ResizeObserver` scaling of the design box, pointer/wheel/key listeners, and auto-pause on blur or tab hide. Consequences to keep in mind:

- **Games read config only in their constructor.** Config reactivity works purely because a changed config rebuilds the session. `GamePage` creates a new config object on every change, so *any* setting restarts the running game — the `restart: true` flag on `ConfigField` is currently declarative only and never consulted by the engine.
- **Keys are split into two classes.** `Space`/`Enter`/`Escape`/`KeyP` are system keys handled by the host (pause, and confirming the overlay's primary button) and are *not* forwarded to the game. Everything else goes to `onKey`. Don't bind a system key inside a game.
- `dt` is clamped to 50 ms, and `render()` runs even while paused.
- The optional third argument, `{ onScore }`, lets the host observe every `submitScore` without touching the game contract. `GamePage` uses it for play history and record toasts.
- HUD buttons use `IconButton noFocus` so a click never leaves focus on a button, where Space would both pause through the engine and re-click the button.
- Pointer coordinates are converted to the game's design space before dispatch, so game code never sees CSS pixels or DPR.
- **A pad reaches a game as key codes.** `GameManifest.pad` (and `pad2` for a second player) maps a button *position* to a code the game already handles in `onKey`, so no engine file knows what any game does with it; directions default to the arrows, which is why every game was playable from a pad before any of them declared a binding. Start stays with the host for pause, and while a panel is up the pad drives the panel instead of the game.

### Shared services

- `src/engine/storage.ts` — every bit of persistence (best scores, per-game config overrides, global mute) funnels through this crash-proof `localStorage` wrapper under the `rewind-arcade:` prefix; private-mode/quota failures degrade silently. Loading a config drops saved keys that no longer exist in the schema or whose type changed.
- `src/engine/audio.ts` — one shared Web Audio synth, no asset files: games build SFX out of `tone()`/`arp()`. `ensure()` is called on first input to satisfy autoplay policies; mute is global and persisted.
- `src/engine/util.ts` — `cfgInt`/`cfgNum`/`cfgBool`/`cfgStr` are the standard way a game reads `GameConfig` values with a typed fallback; also `clamp`, `fmt`, `shade`.
- `src/profile/store.ts` — host-side play history (sessions, seconds, last 24 scores, favorites) behind `useSyncExternalStore`, persisted through `storage`. Best scores stay in the engine's `best:<id>` keys; profile export/import carries them along. Games never see this store.
- `src/settings/store.ts` — frontend preferences. They are applied as `data-phosphor`, `data-motion`, and `data-ambient` on `<html>` so CSS reacts without React. Mute is not here; `audio.subscribe` plus `useMuted()` (`src/ui/hooks.ts`) keep every mute button in sync. `apply()` also pushes the three pad preferences into `engine/gamepad.ts`, which is how engine code honours them without importing the frontend.
- `src/engine/gamepad.ts` — the only `requestAnimationFrame` poll of the Gamepad API, because the API has no button events and two pollers would act on one press twice. It emits press/release/repeat events (auto-repeat and stick hysteresis live there), polls only while something subscribes, and releases everything held when it stops so no game is left thrusting. Buttons are named by position (`south`/`east`, never A/B) since which position confirms is the user's layout preference — ask `padRoles()` and `padGlyph()` rather than hard-coding a letter. `suspendPad()` hands the pad to an emulator iframe, which polls the same device itself.
- `src/esde/spatial.ts` — pad navigation for the pages that are plain DOM: it focuses the nearest focusable element in the direction pressed, so a new page is navigable as soon as it renders. Deliberately pad-only — hijacking a keyboard's arrow keys would break scrolling — and it draws its ring from `[data-pad-focus]` because `:focus-visible` never fires for programmatic focus.

### Styling

`src/styles/app.css` is the only stylesheet entry. It imports Tailwind v4, then loads `global.css`, `esde.css`, and `catalog.css` into a `legacy` cascade layer declared *below* `utilities`. A Tailwind class therefore always beats a legacy rule on the same element, and Tailwind's preflight sits under the legacy sheets. Do not import those sheets from components; unlayered CSS would override every utility. `@theme inline` maps colors to the runtime variables (`bg-accent` is `var(--accent)`), so a game page's inline `--accent` and the phosphor theme both flow into utilities. New surfaces build from `src/ui/kit.tsx`. Opacity is the only animation on the page wrapper in `EsdeRoot`, because a transform there would re-anchor the catalog's `position: fixed` drawers.

### Catalog and systems (no Python, no dumps)

Arcade must not import `catalog/` or `emulate/` code. Shared truth is `systems/registry.yaml`, bundled as text (`src/systems/registry.ts`). Collection rows come from a cartidx `data.js` export: the Vite dev server will serve `catalog/workspace/web/data.js` at `/catalog-data.js` when that file exists; production builds never embed it. Users can also drop the file in the Catalog page. Compact web keys match `catalog/src/cartridge_index/schema.py` — if you add a column the page reads, add it there first. The export's `window.SYSTEMS` table (console hardware facts) is optional: older exports and bundles already saved in IndexedDB lack it, so read `bundle.systems` as possibly undefined.

EmulatorJS is vendored, not linked. `tools/fetch-emulatorjs.mjs` (`npm run emulatorjs`) copies the runtime, translations and one core per system from the CDN into `vendor/emulatorjs/`; `emulatorJsPlugin` serves that at `/emulatorjs/` and copies it into `dist/` at build. `src/emulate/emulatorjs.ts` probes `version.json` once and falls back to the CDN when the folder is absent, so a fresh checkout still runs. The core file each system needs is EmulatorJS's own `getCores()` mapping — `EJS_core` is not a file name (`segaMD` loads `genesis_plus_gx`, PSP only ships a threads build), so `CORE_FILES` in the script is the place that mapping lives. Each core also ships as plain, `-legacy` and `-thread` builds and the runtime chooses one (legacy on an ordinary page, threads when cross-origin isolated); anything it cannot find locally it silently re-requests from `cdn.emulatorjs.org`, so vendoring one variant looks fine while still hitting the network. Verify with the network log, not the console.

Dumps reach the frontend from two places, merged behind one surface. `romsPlugin` in `vite.config.ts` lists `emulate/roms/<id>/` (or `$ARCADE_ROMS` / `$RETROPI_PATHS_ROMS`) at `/roms-index.json` and streams the files at `/roms/<id>/<file>`, refusing anything that resolves outside the root; it imports `EMU_SYSTEMS` so the accepted extensions have one definition. A deployed site has no such plugin, so `src/emulate/library.ts` is the browser's own answer: a directory handle the user granted (persisted in IndexedDB and re-opened on the next visit — Chrome and Edge only) plus files kept as blobs in IndexedDB for every other browser. `src/emulate/roms.ts` merges both into one index, deduplicating by `system|file`, and holds the key matching that joins a file to a catalog title (slug, title, No-Intro name, minus cartidx's `-unverified-dump` tail or a `-japan` region tail); unmatched files become their own `kind: 'rom'` gamelist entries. Because both sources produce the same `RomFile`, gamelists, ROM badges and one-click launch work the same on GitHub Pages as they do in development.

Two things follow from that and are easy to get wrong. A browser-held dump has no URL until its bytes are read, so `openRom()` is async and returns a `release()` the player must call when it ejects, or object URLs leak a ROM's worth of memory each time. And a restored directory handle comes back knowing what it points at but *without* its permission grant, which can only be re-requested from a user gesture — hence the `prompt` state the UI renders as a button rather than treating as an error.

EmulatorJS boots from page globals and throws if loaded twice, so each game runs in its own `srcDoc` iframe; that frame shares this document's origin, which is what lets it load an object URL created out here.

Art is always hotlinked, never bundled or downloaded. `src/esde/covers.ts` is the one place image URLs are built: libretro thumbnails by No-Intro name, LaunchBox images from the export's `bx`/`lg`/`ts`/`ct` file names, and libretro's "systematic" console renders via jsDelivr. `SystemArt` preloads each candidate list and only draws images that actually load, so a missing cover never leaves a gap.

### Notes

- `legacy/jezzball-standalone.html` is the preserved original single-file version. It is not built or imported; don't try to keep it in sync with `src/`.
- `dist/` and `tsconfig.tsbuildinfo` are gitignored build outputs; a stale `dist/` may sit in the working tree from an earlier build.
