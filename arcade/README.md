# Play — Rewind Arcade

> The browser pillar: an ES-DE-style frontend with original game recreations, an in-browser console loader for dumps you own, and a browser for cartidx catalog exports, all static with no backend.

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
2. Export a `GameManifest` (title, art, description, and a **config schema**) from `src/games/<your-game>/index.ts`.
3. Add the manifest to the `GAMES` array in `src/games/registry.ts`.
4. Give it a cover in `src/ui/esde/PlayCover.tsx`: add a branch `{id === '<your-game>' && <… />}` **and** add the id to the fallback-exclusion array below the branches. A game left out of that file gets the generic fallback cover.
5. Optional: a headless bot in `tools/play-<your-game>.mjs` with a matching `play:<your-game>` script in `package.json`, as SkiFree and the games after it have.

That's it. The arcade card, routing, HUD, the settings drawer, high-score tracking and pause are all derived from the manifest automatically — no engine or UI file needs to change beyond the cover. Snake and Minesweeper exist mainly to prove this seam: they share zero code with JezzBall — or with each other — yet reuse the entire shell. Minesweeper is turn-based rather than animated, which shows the loop is happy to drive a game where nothing moves on its own.

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

### SkiFree (1991)
An original downhill run in the spirit of the Windows entertainment-pack classic. Steer with ← → / **A D**, or let the mouse or a finger lean you. Hold ↓ / **S** to tuck for speed and ↑ / **W** to snowplow and slow down. A tree or rock wipes you out, and you get back up. Pass the marker and the yeti comes after you. Settings: tree density (2–10), yeti distance (1000–4000 m), and ski speed (180–340). `npm run play:skifree` drives the game headlessly.

### Pellet Panic (1980)
An original maze chase: eat every pellet while four chasers hunt you. Rook chases you directly, Lark ambushes four tiles ahead, Moth flanks off Rook's position, and Wisp backs off when it gets close. They alternate scatter and chase phases. A power pellet turns them blue, so they reverse, slow down, and can be eaten for 200 / 400 / 800 / 1600. **Every level is a freshly generated, left-right-mirrored maze** with side tunnels, a central pen, and no dead ends. Steer with the arrows / **WASD** (or swipe). A turn pressed early is taken at the next opening. Settings: lives, chaser speed, fright time, and a maze seed (0 = new mazes every game). `npm run play:pellet-panic` checks the generator over 500 seeds (symmetric, connected, dead-end free, deterministic) and drives the game's rules headlessly.

### Silo Sentinel (1980)
An original missile-defence game, and the arcade's first pointer-aim shooter. Warheads fall on six cities and three silos. Click or tap the sky and the silo with ammo nearest in x fires a counter-missile that bursts there. Blasts grow, then shrink, and destroy any warhead they touch, and each destroyed warhead bursts too, so blasts chain. Each kill scores `25 × multiplier`. A wave's end pays `(100 × cities + 5 × unused ammo) × multiplier`. **The cities still standing then become the next wave's multiplier** (minimum ×1; the first wave is ×1). Keyboard and pad move a crosshair (arrows / **WASD**, **F** / **K** fires, and holding a key fires once). Settings: starting wave, ammo per silo, warhead speed, and wind drift (pushes missiles and blasts sideways, shown in the HUD). `npm run play:silo-sentinel` drives the rules headlessly.

### Touchdown (1979)
An original lunar-lander run. Rotate with ← → / **A D** and thrust with ↑ / **W** (pad: stick to rotate, south button or right trigger to thrust); thrust burns fuel. Touch down slow and upright on a pad (×2 wide … ×5 narrow) to score `50 × multiplier` plus a soft-touch bonus of up to 50; any other contact is a crash. **Landing chain:** every landing brings fresh midpoint-displacement terrain, and the next descent starts with your leftover fuel plus a small top-up, so the run ends on a crash or an empty tank. Settings: gravity (Moon / Mars / Earth), starting fuel, terrain roughness and pad count. `npm run play:touchdown` checks the terrain generator for every roughness × pad-count setting (exact pad count, flat, wider than the lander, below the spawn), the landing and crash rules, fuel carry-over and an autopilot flying whole chains at the 50 ms dt cap.

### Gridlock (1982)
An original light-cycle duel in the spirit of the arcade light cycles and QBasic Nibbles. Two cycles move continuously on a grid and leave solid trails. Hit a wall or any trail and you lose the round, and a head-on crash is a draw that gets replayed. Turns are 90° only, a reversal is ignored, and turns pressed in quick succession are taken one per step. **Boost leaves a gap:** **F** doubles your speed for 0.4 s and draws no trail while it lasts, so you can open an escape hatch (for either rider). It then recharges for 3 s, shown in the HUD meter. Solo, you steer with **WASD** or the arrows against a CPU whose flood-fill look-ahead scales with its skill setting. With two players, P1 uses **WASD** + **F** and P2 uses the arrows + **L**, and two gamepads each drive one cycle. A round won scores 1000 + 10 per second survived, and the match adds +500. Settings: players, CPU skill, rounds to win, speed (cells/s) and arena size. `npm run play:gridlock` drives the game headlessly and checks frame-rate-independent movement, boost gaps and cooldown, reversals, head-on draws, scoring and the CPU.

### Crate Shift (1982)
An original crate-pushing puzzle in the spirit of Thinking Rabbit's Sokoban. Walk into a crate to push it one square. Crates are never pulled, so a crate shoved into a corner stays there. Get every crate onto a target to clear the level; the next one is a little larger. Move with the arrows / **WASD** (or tap beside the player). **Z** / **U** / **Backspace** undoes a move, all the way back to the level start, and **R** restarts the level. On a gamepad the d-pad moves, the west button undoes and the north button restarts. **Levels are generated, not stored.** Each one is built backwards from the solved position by pulling crates off their targets, so every level can be solved, and the length of that solution replayed forward, walks included, is the level's par. Solve a level at par for 1,000 points; each move over par costs 20, down to 100. Settings: warehouse size, crates per level, a level seed (0 = new levels every game), and levels per run. `npm run play:crate-shift` replays each generated level's own solution over 50 seeds × every size × 2 and 6 crates, and checks the push rules, undo, restart, seeding and scoring headlessly.

### Flak Shack (1982)
An original Paratrooper-style turret shooter. Helicopters cross the sky and drop paratroopers, and you rotate a ground gun to shoot them before they land. Rotate with ← → / **A D**, and fire with **F** / **K** (Space is pause). A helicopter scores +10, a trooper +5, and every shot costs 1, with the score floored at 0. Shoot a trooper's chute and it plummets, taking out any trooper standing where it lands. Let **four troopers land on one side** of the gun and they storm it, which ends the game. Everything draws in a selectable four-colour **CGA palette**: palette 1 (cyan / magenta / white), palette 0 (green / red / brown), or mono green. Settings: palette, helicopter frequency, and **bomber waves**. With bomber waves on, jets cross high and drop one bomb aimed at the gun; a bomb that reaches the gun ends the game, a bomb shot down scores 0, and a jet scores +10. `npm run play:flak-shack` drives the rules headlessly: F/K-only fire, the score floor, the crush, the storm, jets on and off, four colours per palette, and a bot playthrough at the 50 ms dt cap.

### Rockfall (1984)
An original cave dig in the spirit of the 1984 home-computer classic. Tunnel through dirt with the arrows / **WASD** to collect the gem target, then reach the exit before the clock runs out. Boulders and gems fall when nothing is under them and roll off other boulders and gems. A boulder that is already falling crushes you, but one resting on your head does not, so keep moving when you dig under one. You can push a single boulder sideways into empty space. Hold **F** with a direction to dig or grab the next tile without stepping into it, and press **R** to give up a stuck cave for a life. A gem scores 10, or 25 once you are past the target. **Every gem over the target multiplies the exit bonus:** `seconds left × 10 + extra gems × seconds left × 2`. You have three lives, and a death replays the same cave from the score you entered it with. Settings: cave size (small fits the screen, and larger caves scroll), boulder density, gem target, time limit, and a cave seed (0 = new caves every game). The generator guarantees that, on the initial grid, the exit and at least the target number of gems are connected to the start through dirt. `npm run play:rockfall` checks that over seeds 1–50 at every size and drives the physics and scoring headlessly.

### Lode Digger (1983)
An original platformer: take every piece of gold on a grid of bricks, ladders and bars while guards chase you, then climb the escape ladder that appears off the top of the screen. Run and climb with the arrows / **WASD**; **Z** / **Q** digs the brick down-left and **X** / **E** down-right; **R** restarts the level for a life. A guard that falls into a hole is stuck for a while and drops any gold it carried. **Holes refill on a steady beat**: the last four beats tick and the brick visibly fills in, a guard still inside respawns at the top, and the player inside loses a life. Score: gold 250, trapped guard 75, level clear 1500 plus 2 per second under 600. Five built-in levels, as text grids in `src/games/lode-digger/levels.ts`. Settings: start level, lives, guard speed, and hole refill time. `npm run play:lode-digger` checks that every level is well-formed and completable by the game's own movement rules, then drives digging, the refill beat, traps, scoring, and a bot playthrough of all five levels headlessly.

### Banana Barrage (1991)
An original artillery duel in the spirit of QBasic's GORILLA.BAS. Two gorillas stand on the end rooftops of a random city skyline and take turns lobbing exploding bananas under gravity and a per-round wind (shown by the arrow at street level). Set the angle with ↑ ↓ / **W S** and the power with ← → / **A D** (tap for one step, hold to sweep), and throw with **F** / **K** (Space is pause). **Damage persists:** every blast carves a circular hole out of a per-pixel collision mask, and the hole stays for the rest of the round, so a later banana can tunnel through an earlier crater. Hit the other gorilla to take the round; a banana that comes back down on its own thrower gives the round away. Every round brings a new skyline and wind. Solo, you play the CPU, which simulates throws against the current skyline and wind and then misses by an error that shrinks as its accuracy setting rises. In two-player mode both players share the keys on their own turn, and each can use a gamepad (south / east / R1 throws). Score, from player 1's side: each round won is `1000 + max(0, 500 − 100 × (throws − 1))` and winning the match adds 250. It is submitted once at the end. Settings: players, CPU accuracy, rounds to win, maximum wind and gravity (m/s²). `npm run play:banana-barrage` checks skylines over 50 seeds, F/K-only throws, ignored input off-turn, mask carving and tunnelling, no tunnelling through a 2 px wall at full power and the 50 ms dt cap, 300 random throws all resolving, the scoring formula, the CPU's accuracy scaling, and whole bot matches headlessly.

### Blockfall (1984)
An original falling-block puzzle in the spirit of Pajitnov's original. Seven tetrominoes fall into a 10 × 20 well. Move with ← → / **A D** (hold to slide: the game runs its own delayed auto-shift, so OS key repeat never double-moves a piece), soft drop with ↓ / **S**, and hard drop with ↑ / **W** (Space is pause). **X** / **K** rotates clockwise and **Z** / **J** counter-clockwise, with Super Rotation System wall kicks. **C** / **L** holds a piece for later, once per piece. A piece on the stack locks after half a second, and a move or turn restarts that delay up to 15 times. Clearing 1 / 2 / 3 / 4 lines at once scores 100 / 300 / 500 / 800 × level. A soft drop adds 1 per row and a hard drop 2. Every 10 lines raises the level, and gravity speeds up on the guideline curve. **Phosphor burn:** every cleared line leaves a glow on the glass at its row, behind the stack, that fades over 20 s. On a gamepad the d-pad moves and drops, south rotates clockwise, east counter-clockwise, and west holds. Settings: start level, ghost piece, phosphor burn, and piece order (7-bag or random). `npm run play:blockfall` checks the scoring table, DAS against OS key repeat, wall kicks, lock delay, hold, levels, the phosphor fade, and game over headlessly, then lets a placement bot play 600 frames at the 50 ms dt cap.

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

Every recreation plays from the pad: the d-pad and stick are the arrow keys, **Start** pauses, and each game binds its own action buttons — fire in Asteroids, serve in Breakout, rotate the wall in JezzBall, flag in Minesweeper, tuck (south) and snowplow (north) in SkiFree. Pong seats two pads, one per paddle. JezzBall and Minesweeper still want a pointer for the part that aims.

Settings → Gamepad has a live button read-out for checking a mapping, a rumble switch, and a layout choice: **Xbox**, **Nintendo** (A on the right confirms) or **PlayStation** (✕ confirms). The layout changes both the glyphs shown and which button confirms, so the prompts match the controller in your hands.

While an emulator core is running, the pad belongs to it — EmulatorJS reads the same controller from inside its iframe, so the frontend stops polling until you eject.

Best scores, play history, and settings are saved in `localStorage`. Append `?debug=1` to the URL to expose the live game instance on `window.__arcade` for console tinkering.
