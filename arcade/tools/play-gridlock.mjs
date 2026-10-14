// Headless checks for Gridlock: drives the real game class through its rules
// with a mock canvas — fixed-step movement, boost gaps, reversals, head-on
// draws, scoring and the CPU rider. Run with `npm run play:gridlock`; exits
// non-zero on any failure.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function mock2d() {
  const noop = () => mock2d;
  const grad = { addColorStop() {} };
  return new Proxy(
    { canvas: { width: 800, height: 600 }, createLinearGradient: () => grad, measureText: () => ({ width: 0 }) },
    {
      get(target, prop) {
        return prop in target ? target[prop] : noop;
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    },
  );
}

function host(config) {
  let best = 0;
  const h = {
    ctx: mock2d(),
    config,
    audio: { muted: true, ensure() {}, tone() {}, arp() {} },
    now: () => 0,
    overlay: null,
    hud: {},
    submitted: [],
    setHud: (m) => (h.hud = m),
    setOverlay: (m) => (h.overlay = m),
    submitScore: (n) => {
      h.submitted.push(n);
      const record = n > best;
      if (record) best = n;
      return record;
    },
    getBest: () => best,
  };
  return h;
}

function run(game, seconds, dt = 1 / 60, each) {
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    if (each && each(game) === false) return;
    game.update(dt);
    if (i % 10 === 0) game.render();
  }
}

const DEFAULTS = { mode: 'two', ai: 70, rounds: 3, speed: 10, arena: 'medium' };

/** Take player 2 off the grid, so player 1's movement can be measured alone. */
function solo(game) {
  const p2 = game.cycles[1];
  p2.alive = false;
  game.grid[p2.y * game.cols + p2.x] = 0;
  return game;
}

/** Start a match and step through the READY pause. */
function started(Gridlock, config) {
  const h = host({ ...DEFAULTS, ...config });
  const game = new Gridlock(h);
  game.render();
  if (h.overlay?.variant !== 'menu') throw new Error('expected the title overlay');
  game.onAction('start');
  game.update(1.25);
  if (game.snapshot().phase !== 'playing') throw new Error(`start did not begin play (${game.snapshot().phase})`);
  return { game, h };
}

async function main() {
  const vite = await createServer({
    root,
    configFile: false,
    cacheDir: path.join(os.tmpdir(), 'vite-play-gridlock'),
    server: { middlewareMode: true },
    appType: 'custom',
  });
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });
  try {
    const { Gridlock } = await vite.ssrLoadModule('/src/games/gridlock/game.ts');
    const { gridlockManifest } = await vite.ssrLoadModule('/src/games/gridlock/index.ts');
    const { getGame } = await vite.ssrLoadModule('/src/games/registry.ts');

    /* ---------------------------- manifest --------------------------- */
    {
      const m = gridlockManifest;
      const shape = Object.fromEntries(
        m.config.map((f) => [f.key, f.type === 'range' ? [f.min, f.max, f.step, f.default] : [f.options.map((o) => o.value).join('/'), f.default]]),
      );
      const want = { mode: ['ai/two', 'ai'], ai: [30, 100, 5, 70], rounds: [1, 9, 1, 3], speed: [6, 20, 1, 10], arena: ['small/medium/large', 'medium'] };
      check('manifest-config', JSON.stringify(shape) === JSON.stringify(want) && m.config.every((f) => f.restart === true), JSON.stringify(shape));
      const pads =
        JSON.stringify(m.pad) === JSON.stringify({ up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', south: 'KeyF', east: 'KeyF' }) &&
        JSON.stringify(m.pad2) === JSON.stringify({ south: 'KeyL', east: 'KeyL' });
      check('manifest-pads', pads, `pad=${JSON.stringify(m.pad)} pad2=${JSON.stringify(m.pad2)}`);
      check('registered', getGame('gridlock') === m, `getGame('gridlock') -> ${getGame('gridlock')?.title}`);
      const dir = path.join(root, 'src/games/gridlock');
      const bad = fs
        .readdirSync(dir)
        .flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter((l) => /from '/.test(l) && !/from '(\.\.\/\.\.\/engine\/|\.\/)/.test(l)));
      check('imports-engine-only', bad.length === 0, bad.length ? bad.join(' | ') : 'only ../../engine/* and ./');
    }

    /* ------------------------- fixed-step movement ------------------- */
    {
      // One simulated second covers `speed` cells at any frame rate, including the 50 ms cap.
      const moved = [1 / 30, 1 / 144, 0.05].map((dt) => {
        const game = solo(started(Gridlock, { speed: 10 }).game);
        const x0 = game.snapshot().cycles[0].x;
        run(game, 1, dt);
        return game.snapshot().cycles[0].x - x0;
      });
      check('fixed-step', moved.every((n) => n === 10), `cells moved in 1 s at 30 / 144 / 20 fps: ${moved.join(' / ')}`);
      const game = solo(started(Gridlock, { speed: 17 }).game);
      const x0 = game.snapshot().cycles[0].x;
      run(game, 1, 1 / 144);
      check('speed-setting', game.snapshot().cycles[0].x - x0 === 17, `speed 17 moved ${game.snapshot().cycles[0].x - x0} cells in 1 s`);
    }

    /* ------------------------------ boost ---------------------------- */
    {
      const { game, h } = started(Gridlock, { speed: 10, arena: 'large' });
      solo(game);
      run(game, 0.2);
      const y = game.snapshot().cycles[0].y;
      const xStart = game.snapshot().cycles[0].x;
      game.onKey('KeyF', true);
      const boosting = game.snapshot().cycles[0].boosting;
      run(game, 0.4);
      const xEnd = game.snapshot().cycles[0].x;
      game.onKey('KeyF', true); // still cooling down: ignored
      const refused = !game.snapshot().cycles[0].boosting;
      run(game, 0.3);
      const row = Array.from({ length: game.snapshot().cycles[0].x - xStart }, (_, i) => game.grid[y * game.cols + xStart + 1 + i]);
      const holes = row.filter((v) => v === 0).length;
      const travelled = xEnd - xStart;
      check(
        'boost-gap',
        boosting && travelled === 8 && holes === 8 && row.slice(-2).every((v) => v === 1),
        `boost covered ${travelled} cells in 0.4 s, left ${holes} unmarked cells; trail resumes after: ${row.slice(-2).join(',')}`,
      );
      check('boost-cooldown', refused && h.hud.progress && h.hud.progress.complete === false, `second press refused=${refused}, hud progress=${JSON.stringify(h.hud.progress)}`);
      run(game, 3);
      check('boost-recharges', game.snapshot().cycles[0].cooldown === 0 && h.hud.progress?.complete === true, `cooldown=${game.snapshot().cycles[0].cooldown} progress=${JSON.stringify(h.hud.progress)}`);

      // Drive player 2 straight down through a gap cell: it must survive.
      const gapX = xStart + 3;
      const p2 = game.cycles[1];
      game.grid.fill(0, 0, (y - 1) * game.cols); // clear anything above so the approach is open
      Object.assign(p2, { x: gapX, y: y - 3, dir: 2, queue: [], sub: 0, alive: true, boostT: 0 });
      game.cycles[0].alive = false; // only P2 moves now
      game.update(0.45); // 4.5 cells: through the gap and one beyond
      const after = game.snapshot().cycles[1];
      check('gap-passable', after.alive && after.y > y, `P2 crossed row ${y} at x=${gapX}: now y=${after.y} alive=${after.alive}`);
    }

    /* ---------------------------- reversal --------------------------- */
    {
      const { game } = started(Gridlock, {});
      game.onKey('KeyA', true); // P1 is heading right: straight back is ignored
      game.onKey('ArrowRight', true); // P2 is heading left: same
      run(game, 0.3);
      const [a, b] = game.snapshot().cycles;
      check('no-reversal', a.dir === 3 && b.dir === 1 && a.alive && b.alive, `P1 dir=${a.dir} P2 dir=${b.dir}`);
      // Two quick 90° turns are buffered and taken one per step.
      game.onKey('KeyW', true);
      game.onKey('KeyA', true);
      const queued = game.snapshot().cycles[0].queue.join(',');
      run(game, 0.11);
      const one = game.snapshot().cycles[0].dir;
      run(game, 0.1);
      const two = game.snapshot().cycles[0].dir;
      check('buffered-turns', queued === '0,1' && one === 0 && two === 1, `queued ${queued}; dir after one step=${one}, after two=${two}`);
    }

    /* ----------------------- 2P input routing ------------------------ */
    {
      const { game } = started(Gridlock, { mode: 'two' });
      game.onKey('ArrowUp', true);
      game.onKey('KeyS', true);
      run(game, 0.15);
      const [a, b] = game.snapshot().cycles;
      check('two-player-keys', a.dir === 2 && b.dir === 0, `WASD drives P1 (dir ${a.dir}), arrows drive P2 (dir ${b.dir})`);
      game.onKey('KeyL', true);
      check('p2-boost', game.snapshot().cycles[1].boosting && !game.snapshot().cycles[0].boosting, 'L boosts P2 only');
    }

    /* --------------------------- head-on draw ------------------------ */
    {
      const { game, h } = started(Gridlock, { rounds: 1 });
      // Both start on the same row facing each other; left alone they meet head-on.
      run(game, 5, 1 / 60, (g) => g.snapshot().phase === 'playing');
      const s = game.snapshot();
      check(
        'head-on-draw',
        s.lastResult === 'draw' && s.wins.join('-') === '0-0' && s.score === 0 && h.submitted.length === 0 && s.phase === 'round',
        `result=${s.lastResult} wins=${s.wins.join('-')} score=${s.score} phase=${s.phase}`,
      );
      run(game, 1.7);
      const r = game.snapshot();
      check('draw-replays', r.phase === 'ready' && r.cycles.every((c) => c.alive) && h.submitted.length === 0, `after a draw the round restarts (${r.phase})`);
    }

    /* ----------------------------- scoring --------------------------- */
    {
      const { game, h } = started(Gridlock, { rounds: 1 });
      game.onKey('ArrowUp', true); // P2 drives up into the wall; P1 survives
      let crashedAt = 0;
      run(game, 4, 1 / 60, (g) => {
        if (g.snapshot().phase !== 'playing') return false;
        crashedAt = g.snapshot().roundTime;
      });
      const s = game.snapshot();
      const want = 1000 + 10 * Math.floor(s.roundTime) + 500;
      check(
        'round-and-match-score',
        s.phase === 'over' && s.lastResult === 'p1' && s.score === want && h.submitted.length === 1 && h.submitted[0] === want && h.overlay?.variant === 'win',
        `result=${s.lastResult} after ${crashedAt.toFixed(2)} s, score=${s.score} (want ${want}), submitted=${h.submitted.join(',')}`,
      );
    }
    {
      // Losing still submits, in both modes.
      const two = started(Gridlock, { rounds: 1, mode: 'two' });
      two.game.onKey('KeyW', true);
      run(two.game, 4);
      const cpu = started(Gridlock, { rounds: 1, mode: 'ai', ai: 100 });
      cpu.game.onKey('KeyW', true);
      run(cpu.game, 4);
      check(
        'loss-submits',
        two.h.submitted.join() === '0' && cpu.h.submitted.join() === '0' && two.h.overlay?.variant === 'lose' && cpu.h.overlay?.variant === 'lose',
        `2P submitted=[${two.h.submitted}] CPU submitted=[${cpu.h.submitted}]`,
      );
    }

    /* ------------------------------- CPU ----------------------------- */
    {
      // A P1 that never steers loses every round to a skilled CPU, which must
      // dodge both the walls and P1's oncoming head.
      let cpuWins = 0;
      const trials = 8;
      for (let t = 0; t < trials; t++) {
        const { game } = started(Gridlock, { mode: 'ai', ai: 100, rounds: 1, arena: ['small', 'medium', 'large'][t % 3] });
        run(game, 20, 0.05, (g) => g.snapshot().phase !== 'over');
        if (game.snapshot().lastResult === 'p2') cpuWins++;
      }
      check('cpu-survives', cpuWins === trials, `CPU beat a non-steering P1 in ${cpuWins}/${trials} rounds`);
    }
    {
      // Full matches at the 50 ms dt cap, with a simple wall-avoiding bot as P1:
      // every match ends, submits exactly once, and the HUD shows the badge.
      let ok = 0;
      const trials = 4;
      let detail = '';
      for (let t = 0; t < trials; t++) {
        const { game, h } = started(Gridlock, { mode: 'ai', ai: 30 + t * 20, rounds: 3 });
        let frames = 0;
        for (; frames < 20 * 60 * 3 && game.snapshot().phase !== 'over'; frames++) {
          if (game.snapshot().phase === 'playing') botSteer(game);
          game.update(0.05);
          if (frames % 7 === 0) game.render();
        }
        const s = game.snapshot();
        if (s.phase === 'over' && h.submitted.length === 1 && Number.isInteger(h.submitted[0]) && h.submitted[0] >= 0 && h.hud.badge === 'VS CPU') ok++;
        detail += ` ai=${30 + t * 20}: ${s.wins.join('-')} score=${s.score};`;
      }
      check('bot-matches', ok === trials, detail.trim());
    }
    {
      // CPU skill matters: alone in the arena, a 100 % CPU fills far more of it
      // before boxing itself in than a 30 % one does.
      const survival = (ai) => {
        let total = 0;
        for (let t = 0; t < 20; t++) {
          const { game } = started(Gridlock, { mode: 'ai', ai, rounds: 1, arena: 'small' });
          const p1 = game.cycles[0];
          p1.alive = false;
          game.grid[p1.y * game.cols + p1.x] = 0;
          for (let f = 0; f < 200 * 20 && game.snapshot().phase === 'playing'; f++) game.update(0.05);
          total += game.snapshot().roundTime;
        }
        return total / 20;
      };
      const low = survival(30);
      const high = survival(100);
      check('ai-setting', high > low * 1.5, `solo CPU survives ${low.toFixed(1)} s on average at 30 %, ${high.toFixed(1)} s at 100 %`);
    }
  } finally {
    await vite.close();
  }

  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail}`);
    if (!r.ok) failed++;
  }
  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exitCode = 1;
  } else {
    console.log('\nGridlock checks ok');
  }
}

/** P1 bot: head for whichever of straight / left / right leaves the most room (straight on a tie). */
function botSteer(game) {
  const DX = [0, -1, 0, 1];
  const DY = [-1, 0, 1, 0];
  const c = game.cycles[0];
  if (c.queue.length) return;
  let best = c.dir;
  let bestRoom = -1;
  for (const d of [c.dir, (c.dir + 1) % 4, (c.dir + 3) % 4]) {
    const room = game.space(c.x + DX[d], c.y + DY[d], 600);
    if (room > bestRoom) {
      bestRoom = room;
      best = d;
    }
  }
  if (best !== c.dir) game.onKey(['KeyW', 'KeyA', 'KeyS', 'KeyD'][best], true);
}

await main();
