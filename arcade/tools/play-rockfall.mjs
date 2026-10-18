// Headless checks for Rockfall: proves the cave generator's reachability
// promise over many seeds, then drives the real game class through its tile
// physics and scoring with a mock canvas. Run with `npm run play:rockfall`;
// exits non-zero on any failure.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DT = 1 / 60;

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

function run(game, seconds, dt = DT, each) {
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    if (each && each(game) === false) return;
    game.update(dt);
    if (i % 10 === 0) game.render();
  }
}

const DEFAULTS = { size: 'medium', boulders: 15, gems: 12, time: 150, seed: 42 };

function started(Rockfall, config) {
  const h = host({ ...DEFAULTS, ...config });
  const game = new Rockfall(h);
  game.render();
  if (h.overlay?.variant !== 'menu') throw new Error('expected the title overlay');
  game.onAction('start');
  if (game.snapshot().phase !== 'playing') throw new Error(`start did not begin play (${game.snapshot().phase})`);
  return { game, h };
}

async function main() {
  const vite = await createServer({
    root,
    configFile: false,
    cacheDir: path.join(os.tmpdir(), 'vite-play-rockfall'),
    server: { middlewareMode: true },
    appType: 'custom',
  });
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });
  try {
    const cave = await vite.ssrLoadModule('/src/games/rockfall/cave.ts');
    const { Rockfall } = await vite.ssrLoadModule('/src/games/rockfall/game.ts');
    const { rockfallManifest } = await vite.ssrLoadModule('/src/games/rockfall/index.ts');
    const { getGame } = await vite.ssrLoadModule('/src/games/registry.ts');
    const T = { '#': cave.WALL, '.': cave.EMPTY, ':': cave.DIRT, o: cave.BOULDER, '*': cave.GEM, P: cave.PLAYER, E: cave.EXIT };

    /**
     * Replace the live cave with a hand-drawn one: `map` rows are placed at
     * (1,1), everything else is dirt inside a steel border.
     */
    const stage = (game, map) => {
      const { cols, rows } = game.cave;
      game.tiles.fill(cave.DIRT);
      game.falling.fill(0);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) game.tiles[y * cols + x] = cave.WALL;
      }
      map.forEach((row, y) =>
        row.split('').forEach((ch, x) => {
          const i = (y + 1) * cols + x + 1;
          game.tiles[i] = T[ch];
          if (ch === 'P') Object.assign(game, { px: x + 1, py: y + 1 });
          if (ch === 'E') game.cave.exit = { x: x + 1, y: y + 1 };
        }),
      );
      game.pending = null;
      game.held = [];
      game.grab = false;
    };
    const tileAt = (game, x, y) => game.tiles[(y + 1) * game.cave.cols + x + 1]; // map coordinates
    const ticks = (game, n) => {
      for (let i = 0; i < n && game.snapshot().phase === 'playing'; i++) game.tick();
    };

    /* ---------------------------- manifest --------------------------- */
    {
      const m = rockfallManifest;
      const shape = Object.fromEntries(
        m.config.map((f) => [f.key, f.type === 'range' ? [f.min, f.max, f.step, f.default] : [f.options.map((o) => o.value).join('/'), f.default]]),
      );
      const want = { size: ['small/medium/large', 'medium'], boulders: [5, 30, 5, 15], gems: [5, 30, 1, 12], time: [60, 240, 10, 150], seed: [0, 9999, 1, 0] };
      check('manifest-config', JSON.stringify(shape) === JSON.stringify(want) && m.config.every((f) => f.restart === true), JSON.stringify(shape));
      check(
        'manifest-meta',
        m.id === 'rockfall' && m.year === '1984' && m.icon === '💎' && JSON.stringify(m.pad) === JSON.stringify({ south: 'KeyF', north: 'KeyR' }),
        `id=${m.id} year=${m.year} icon=${m.icon} pad=${JSON.stringify(m.pad)}`,
      );
      check('registered', getGame('rockfall') === m, `getGame('rockfall') -> ${getGame('rockfall')?.title}`);
      const dir = path.join(root, 'src/games/rockfall');
      const bad = fs
        .readdirSync(dir)
        .flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter((l) => /from '/.test(l) && !/from '(\.\.\/\.\.\/engine\/|\.\/)/.test(l)));
      check('imports-engine-only', bad.length === 0, bad.length ? bad.join(' | ') : 'only ../../engine/* and ./');
    }

    /* ------------------------------ caves ---------------------------- */
    {
      // Reachable: a 4-neighbour flood fill from the start through dirt / empty /
      // gem reaches >= target gems and the exit, for seeds 1-50 at every size —
      // at the default settings and at the densest ones.
      const bad = [];
      let caves = 0;
      for (const size of Object.keys(cave.SIZES)) {
        for (const [boulders, gems] of [[15, 12], [30, 30], [5, 5], [30, 5]]) {
          for (let seed = 1; seed <= 50; seed++) {
            const c = cave.generateCave({ seed, size, boulders, gems });
            const r = cave.reach(c);
            caves++;
            if (r.gems < gems || !r.exit) bad.push(`${size} b${boulders} g${gems} seed ${seed}: ${r.gems}/${gems} gems, exit=${r.exit}`);
            const again = cave.generateCave({ seed, size, boulders, gems });
            if (again.tiles.join('') !== c.tiles.join('')) bad.push(`${size} seed ${seed}: not deterministic`);
            const placed = c.tiles.filter((t) => t === cave.GEM).length;
            if (placed < gems + cave.extraGems(gems) - 2) bad.push(`${size} seed ${seed}: only ${placed} gems placed`);
          }
        }
      }
      check('caves-reachable', bad.length === 0, bad.length ? bad.slice(0, 4).join(' | ') : `${caves} caves: target gems + exit reachable, deterministic`);
      // The checker must have teeth: box the start in steel and nothing is reachable.
      const c = cave.generateCave({ seed: 7, size: 'small', boulders: 15, gems: 12 });
      for (const [dx, dy] of [[0, -1], [-1, 0], [0, 1], [1, 0]]) c.tiles[(c.start.y + dy) * c.cols + c.start.x + dx] = cave.WALL;
      const r = cave.reach(c);
      check('reach-checker-bites', r.gems === 0 && !r.exit, `boxed-in start reaches ${r.gems} gems, exit=${r.exit}`);
      const sizes = Object.entries(cave.SIZES).map(([k, v]) => {
        const g = started(Rockfall, { size: k }).game.snapshot();
        return g.cols === v.cols && g.rows === v.rows;
      });
      check('size-setting', sizes.every(Boolean), Object.entries(cave.SIZES).map(([k, v]) => `${k}=${v.cols}x${v.rows}`).join(' '));
    }

    /* ----------------------------- physics --------------------------- */
    {
      // Dig out the dirt under a boulder (grab, so the digger stays put): the
      // boulder drops into the dug-out space and lands on the steel below it.
      const { game } = started(Rockfall, {});
      stage(game, [
        '.o..',
        '.:P.',
        '.#..',
      ]);
      game.onKey('KeyF', true);
      game.onKey('ArrowLeft', true);
      game.tick(); // digs (1,1); the same tick's physics pass drops the boulder into it
      game.onKey('ArrowLeft', false);
      game.onKey('KeyF', false);
      const dug = tileAt(game, 1, 1);
      ticks(game, 3);
      const s = game.snapshot();
      check(
        'boulder-drops',
        dug !== cave.DIRT && tileAt(game, 1, 1) === cave.BOULDER && tileAt(game, 1, 0) === cave.EMPTY && s.player.x === 3 && s.player.y === 2 && s.phase === 'playing',
        `dug=${dug} boulder now at (1,1)=${tileAt(game, 1, 1)}, (1,0)=${tileAt(game, 1, 0)}, digger at ${s.player.x},${s.player.y}`,
      );
    }
    {
      // A boulder resting on the digger is harmless; one that falls onto them kills.
      const { game } = started(Rockfall, {});
      stage(game, [
        'o..',
        'P..',
      ]);
      ticks(game, 4);
      const safe = game.snapshot().phase === 'playing';
      stage(game, [
        'o..',
        '...',
        'P..',
      ]);
      ticks(game, 3);
      check('falling-boulder-kills', safe && game.snapshot().phase === 'dying', `resting boulder: ${safe ? 'safe' : 'killed'}; falling boulder: ${game.snapshot().phase}`);
    }
    {
      // A boulder or gem on a round thing rolls off to an open side and falls.
      const { game } = started(Rockfall, {});
      stage(game, [
        '.o.P',
        '.o.:',
        '###:',
      ]);
      ticks(game, 1);
      const rolled = tileAt(game, 0, 0) === cave.BOULDER && tileAt(game, 1, 0) === cave.EMPTY;
      ticks(game, 2);
      check('rolls-off-round', rolled && tileAt(game, 0, 1) === cave.BOULDER, `rolled left after 1 tick=${rolled}; after 3 it rests at (0,1)=${tileAt(game, 0, 1)}`);
      stage(game, [
        '.*.P',
        '.o.:',
        '###:',
      ]);
      ticks(game, 3);
      check('gems-roll-too', tileAt(game, 0, 1) === cave.GEM, `gem ended at (0,1)=${tileAt(game, 0, 1)}`);
      stage(game, [
        '.o.P',
        '.#.:',
        '.##:',
      ]);
      ticks(game, 3);
      check('steel-is-not-round', tileAt(game, 1, 0) === cave.BOULDER, `boulder on steel stays: (1,0)=${tileAt(game, 1, 0)}`);
    }
    {
      // Push a single boulder sideways into empty space; two in a row will not budge.
      const { game } = started(Rockfall, {});
      stage(game, [
        'Po..',
        '####',
      ]);
      game.onKey('ArrowRight', true);
      game.tick();
      game.onKey('ArrowRight', false);
      const pushed = tileAt(game, 2, 0) === cave.BOULDER && game.snapshot().player.x === 2;
      stage(game, [
        'Poo.',
        '####',
      ]);
      game.onKey('ArrowRight', true);
      game.tick();
      game.onKey('ArrowRight', false);
      const blocked = tileAt(game, 1, 0) === cave.BOULDER && game.snapshot().player.x === 1;
      stage(game, [
        'P.',
        'o.',
        '#.',
      ]);
      game.onKey('ArrowDown', true);
      game.tick();
      game.onKey('ArrowDown', false);
      const noVertical = game.snapshot().player.y === 1;
      check('push', pushed && blocked && noVertical, `single push=${pushed}, double blocked=${blocked}, no vertical push=${noVertical}`);
    }

    /* ----------------------------- scoring --------------------------- */
    {
      const { game, h } = started(Rockfall, { gems: 5 });
      stage(game, [
        'P****E',
        '######',
      ]);
      const step = () => {
        game.onKey('ArrowRight', true);
        game.tick();
        game.onKey('ArrowRight', false);
      };
      game.collected = 3;
      const s0 = game.snapshot().score;
      step(); // 4th gem: +10, exit still shut
      const shut = !game.snapshot().exitOpen;
      step(); // 5th = target: +10, exit opens
      const open = game.snapshot().exitOpen;
      step(); // 6th: over target, +25
      step(); // 7th: +25
      const gemPts = game.snapshot().score - s0;
      game.time = 42.3;
      const before = game.snapshot().score;
      step(); // into the open exit
      const s = game.snapshot();
      const rem = 43;
      const want = rem * 10 + 2 * rem * 2;
      check('gem-points', shut && open && gemPts === 10 + 10 + 25 + 25, `gems scored ${gemPts} (want 70); exit shut before target=${shut}, open at target=${open}`);
      check(
        'exit-bonus',
        s.phase === 'clear' && s.score - before === want && Number.isInteger(s.score),
        `bonus ${s.score - before} (want ${rem}×10 + 2 over × ${rem}×2 = ${want}), phase=${s.phase}`,
      );
      run(game, 2.5);
      check('next-cave', game.snapshot().level === 2 && game.snapshot().phase === 'playing' && game.snapshot().collected === 0, `level ${game.snapshot().level}, phase ${game.snapshot().phase}`);
      check('hud', h.hud.stats?.map((x) => x.label).join(',') === 'Gems,Time,Score,Best' && h.hud.lives?.max === 3, `stats=${h.hud.stats?.map((x) => x.label)} lives=${JSON.stringify(h.hud.lives)}`);
      const closed = started(Rockfall, { gems: 5 }).game;
      stage(closed, ['PE', '##']);
      closed.onKey('ArrowRight', true);
      closed.tick();
      check('exit-closed-below-target', closed.snapshot().player.x === 1 && closed.snapshot().phase === 'playing', `digger at x=${closed.snapshot().player.x}`);
    }

    /* --------------------------- lives / clock ----------------------- */
    {
      // Running out of time costs a life and replays the same cave from its starting score.
      const { game } = started(Rockfall, {});
      const seed = game.snapshot().seed;
      run(game, 1);
      game.score = 120;
      game.caveStartScore = 50;
      game.time = 0.01;
      game.update(DT);
      const dying = game.snapshot().phase;
      run(game, 1.7);
      const s = game.snapshot();
      check('timeout-costs-a-life', dying === 'dying' && s.lives === 2 && s.phase === 'playing' && s.seed === seed && s.score === 50 && s.time > 149, `phase ${dying} -> ${s.phase}, lives=${s.lives}, seed ${seed}->${s.seed}, score=${s.score}`);
      game.onKey('KeyR', true);
      check('give-up', game.snapshot().phase === 'dying', `R -> ${game.snapshot().phase}`);
    }
    {
      // The last life ends the game and submits a non-negative integer score.
      const { game, h } = started(Rockfall, {});
      for (let i = 0; i < 3; i++) {
        game.score += 37;
        game.onKey('KeyR', true);
        game.onKey('KeyR', false);
        run(game, 1.7);
      }
      const s = game.snapshot();
      check(
        'game-over-submits',
        s.phase === 'over' && h.submitted.length === 1 && Number.isInteger(h.submitted[0]) && h.submitted[0] >= 0 && h.overlay?.variant === 'lose',
        `phase=${s.phase} submitted=[${h.submitted}] overlay=${h.overlay?.variant}`,
      );
    }
    {
      // A fixed seed replays the same caves; seed 0 draws a fresh run each game.
      const a = started(Rockfall, { seed: 1234 }).game.snapshot().seed;
      const b = started(Rockfall, { seed: 1234 }).game.snapshot().seed;
      const c = started(Rockfall, { seed: 0 }).game.snapshot().seed;
      const d = started(Rockfall, { seed: 0 }).game.snapshot().seed;
      check('seed-config', a === b && c !== d, `seed 1234 -> ${a}, ${b}; seed 0 -> ${c}, ${d}`);
    }
    {
      // Pausing drops held keys so the digger doesn't walk on after a resume.
      const { game } = started(Rockfall, {});
      game.onKey('ArrowRight', true);
      game.onPause();
      game.pending = null;
      const x0 = game.snapshot().player.x;
      ticks(game, 3);
      check('pause-releases-keys', game.snapshot().player.x === x0, `moved ${game.snapshot().player.x - x0} after pause`);
    }

    /* ------------------------------- bot ----------------------------- */
    {
      // A bot that walks to the nearest gem (then the exit) plays whole games at
      // the 50 ms dt cap: nothing throws, the digger never leaves the grid, and
      // every submitted score is a non-negative integer.
      let gems = 0;
      let caves = 0;
      let detail = '';
      let broken = 0;
      for (const size of ['small', 'medium', 'large']) {
        const { game, h } = started(Rockfall, { size, seed: 7, time: 90 });
        for (let f = 0; f < 20 * 60 * 4 && game.snapshot().phase !== 'over'; f++) {
          if (game.snapshot().phase === 'playing') botSteer(game, cave);
          game.update(0.05);
          if (f % 5 === 0) game.render();
          const p = game.snapshot().player;
          if (p.x < 1 || p.y < 1 || p.x >= game.cave.cols - 1 || p.y >= game.cave.rows - 1) broken++;
          if (game.snapshot().phase === 'playing' && game.tiles[p.y * game.cave.cols + p.x] !== cave.PLAYER) broken++;
        }
        const s = game.snapshot();
        gems += s.collected;
        caves += s.level - 1;
        if (h.submitted.some((n) => !Number.isInteger(n) || n < 0)) broken++;
        detail += ` ${size}: cave ${s.level} score=${s.score} lives=${s.lives} phase=${s.phase};`;
      }
      check('bot-playthrough', broken === 0 && caves > 0, `${caves} caves cleared, ${gems} gems in the last;${detail}`);
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
    console.log('\nRockfall checks ok');
  }
}

/**
 * Bot: breadth-first through dirt / empty / gem to the nearest gem, or to the
 * exit once it is open. It first looks for a route that never passes directly
 * under a boulder or gem, then for any route at all; with none, it gives up
 * the cave. The chosen direction is held until the next tick.
 */
function botSteer(game, cave) {
  const DX = [0, -1, 0, 1];
  const DY = [-1, 0, 1, 0];
  const C = game.cave.cols;
  const t = game.tiles;
  const goal = (i) => (game.exitOpen() ? t[i] === cave.EXIT : t[i] === cave.GEM);
  const route = (careful) => {
    const ok = (i) => {
      const v = t[i];
      if (v === cave.EXIT) return game.exitOpen();
      if (v !== cave.DIRT && v !== cave.EMPTY && v !== cave.GEM) return false;
      return !careful || (t[i - C] !== cave.BOULDER && t[i - C] !== cave.GEM);
    };
    const start = game.py * C + game.px;
    const first = new Map([[start, -1]]);
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      for (let d = 0; d < 4; d++) {
        const j = i + DY[d] * C + DX[d];
        if (first.has(j) || !ok(j)) continue;
        const f = head === 0 ? d : first.get(i);
        if (goal(j)) return f;
        first.set(j, f);
        queue.push(j);
      }
    }
    return -1;
  };
  const dir = route(true) >= 0 ? route(true) : route(false);
  game.held = [];
  if (dir >= 0) game.onKey(['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'][dir], true);
  else game.onKey('KeyR', true);
}

await main();
