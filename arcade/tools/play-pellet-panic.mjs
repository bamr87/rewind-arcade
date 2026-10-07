// Headless checks for Pellet Panic: proves the maze generator's promises over
// many seeds, then drives the real game class through its rules with a mock
// canvas. Run with `npm run play:pellet-panic`; exits non-zero on any failure.
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DT = 1 / 60;
const SEEDS = 500;

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

function run(game, seconds, each) {
  for (let i = 0; i < Math.ceil(seconds / DT); i++) {
    if (each && each(game) === false) return;
    game.update(DT);
    if (i % 10 === 0) game.render();
  }
}

/** Start a game and step through the READY! pause. */
function started(PelletPanic, config) {
  const h = host({ lives: 3, chaserSpeed: 85, fright: 6, seed: 42, ...config });
  const game = new PelletPanic(h);
  game.render();
  if (h.overlay?.variant !== 'menu') throw new Error('expected the title overlay');
  game.onAction('start');
  run(game, 2);
  if (game.snapshot().phase !== 'playing') throw new Error(`start did not begin play (${game.snapshot().phase})`);
  return { game, h };
}

async function main() {
  const vite = await createServer({
    root,
    configFile: false,
    cacheDir: path.join(os.tmpdir(), 'vite-play-pellet-panic'),
    server: { middlewareMode: true },
    appType: 'custom',
  });
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });
  try {
    const maze = await vite.ssrLoadModule('/src/games/pellet-panic/maze.ts');
    const chasers = await vite.ssrLoadModule('/src/games/pellet-panic/chasers.ts');
    const { PelletPanic } = await vite.ssrLoadModule('/src/games/pellet-panic/game.ts');
    const { pelletPanicManifest } = await vite.ssrLoadModule('/src/games/pellet-panic/index.ts');
    const { getGame } = await vite.ssrLoadModule('/src/games/registry.ts');

    /* ----------------------------- maze ----------------------------- */
    {
      const bad = [];
      const shapes = new Set();
      for (let s = 1; s <= SEEDS; s++) {
        const m = maze.generateMaze(s);
        const problems = maze.checkMaze(m);
        if (problems.length) bad.push(`seed ${s}: ${problems.slice(0, 3).join('; ')}`);
        if (maze.generateMaze(s).tiles.join('') !== m.tiles.join('')) bad.push(`seed ${s}: not deterministic`);
        shapes.add(m.tiles.join(''));
      }
      check('maze-sound', bad.length === 0, bad.length ? bad.slice(0, 5).join(' | ') : `${SEEDS} seeds symmetric, connected, dead-end free, deterministic`);
      check('maze-variety', shapes.size > SEEDS * 0.9, `${shapes.size} distinct mazes from ${SEEDS} seeds`);
      // The checker itself must have teeth: a single walled-off corridor tile is a dead end.
      const m = maze.generateMaze(7);
      const broken = { ...m, tiles: m.tiles.slice() };
      const i = m.spawn.y * maze.COLS + m.spawn.x - 1;
      broken.tiles[i] = maze.WALL;
      check('maze-checker-bites', maze.checkMaze(broken).length > 0, maze.checkMaze(broken).slice(0, 2).join('; '));
    }

    /* ---------------------------- manifest --------------------------- */
    {
      const want = { lives: [1, 5, 1, 3], chaserSpeed: [70, 110, 5, 85], fright: [2, 10, 1, 6], seed: [0, 9999, 1, 0] };
      const got = Object.fromEntries(pelletPanicManifest.config.map((f) => [f.key, [f.min, f.max, f.step, f.default]]));
      const ok =
        JSON.stringify(got) === JSON.stringify(want) &&
        pelletPanicManifest.config.every((f) => f.type === 'range' && f.restart === true);
      check('manifest-config', ok, JSON.stringify(got));
      check('registered', getGame('pellet-panic') === pelletPanicManifest, `getGame('pellet-panic') -> ${getGame('pellet-panic')?.title}`);
    }

    /* ---------------------------- chasers ---------------------------- */
    {
      const player = { x: 10, y: 20, dir: 3 }; // facing right
      const rook = { x: 4, y: 16 };
      const corner = { x: 0, y: 32 };
      const t = (rule, self) => chasers.chaseTarget(rule, player, self, rook, corner);
      const direct = t('direct', rook);
      const ambush = t('ambush', { x: 20, y: 5 });
      const flank = t('flank', { x: 20, y: 5 });
      const shyFar = t('shy', { x: 25, y: 2 });
      const shyNear = t('shy', { x: 12, y: 21 });
      const ok =
        direct.x === 10 && direct.y === 20 &&
        ambush.x === 14 && ambush.y === 20 &&
        flank.x === 20 && flank.y === 24 &&
        shyFar.x === 10 && shyNear.x === corner.x && shyNear.y === corner.y;
      check('chase-rules', ok, `direct=${JSON.stringify(direct)} ambush=${JSON.stringify(ambush)} flank=${JSON.stringify(flank)} shy far=${JSON.stringify(shyFar)} near=${JSON.stringify(shyNear)}`);
      const modes = [0, 6.9, 7.1, 26.9, 27.1, 34.1, 60, 1000].map((s) => chasers.modeAt(s)[0]).join('');
      // Phases end at 7, 27, 34, 54, 59, 79 s, then chase forever.
      check('schedule', modes === 'ssccsccc', `modes at 0,6.9,7.1,26.9,27.1,34.1,60,1000 s = ${modes}`);
      const pts = [0, 1, 2, 3].map(chasers.frightPoints).join('/');
      check('fright-points', pts === '200/400/800/1600', pts);
    }

    /* ---------------------------- gameplay --------------------------- */
    {
      // Pellets score 10 each as the player runs.
      const { game } = started(PelletPanic, {});
      run(game, 1.5);
      const s = game.snapshot();
      check('eats-pellets', s.score > 0 && s.score % 10 === 0, `score=${s.score} after 1.5 s at x=${s.player.x}`);
    }
    {
      // Buffered turn: press Up while running left; it must be taken at the
      // first tile along the way whose upper neighbour is open.
      // Not every maze has an upward opening along the spawn corridor; use the
      // first seed whose maze does.
      let game = null;
      let expect = null;
      for (let seed = 1; seed < 100 && expect === null; seed++) {
        game = new PelletPanic(host({ seed }));
        game.onAction('start'); // still in READY!, so the press below is buffered before any move
        const m = game.maze;
        const open = (x, y) => maze.tileAt(m, x, y) === maze.PATH;
        let x = m.spawn.x;
        while (expect === null && open(x - 1, m.spawn.y)) {
          x--;
          if (open(x, m.spawn.y - 1)) expect = x;
        }
      }
      game.onKey('ArrowUp', true);
      let turnedAt = null;
      run(game, 3, (g) => {
        const p = g.snapshot().player;
        if (p.dir === 0) {
          turnedAt = p.x;
          return false;
        }
      });
      check('buffered-turn', expect !== null && turnedAt === expect, `expected turn at x=${expect}, took it at x=${turnedAt}`);
    }
    {
      // Scatter -> chase flip reverses every active chaser.
      const { game } = started(PelletPanic, {});
      game.chaserSpeed = () => 0; // hold them still so the reversal is observable
      game.modeClock = 6.99;
      const before = game.snapshot().chasers.filter((c) => c.state === 'active').map((c) => c.dir);
      game.update(0.02);
      const after = game.snapshot();
      const now = after.chasers.filter((c) => c.state === 'active').map((c) => c.dir);
      const reversed = before.length > 0 && before.every((d, i) => now[i] === (d + 2) % 4);
      check('mode-flip', after.mode === 'chase' && reversed, `mode=${after.mode} dirs ${before} -> ${now}`);
    }
    {
      // A power pellet makes the chasers edible: 200, 400, 800, 1600.
      const { game } = started(PelletPanic, {});
      for (const c of game.chasers) Object.assign(c, { state: 'active', dir: 1, t: 0 });
      game.frighten();
      const gains = [];
      for (const c of game.chasers) {
        const before = game.score;
        Object.assign(c, { tx: game.player.tx, ty: game.player.ty, t: game.player.t, dir: game.player.dir });
        game.collide();
        gains.push(game.score - before);
      }
      const states = game.snapshot().chasers.map((c) => c.state).join(',');
      check('fright-chain', gains.join('/') === '200/400/800/1600' && states === 'eaten,eaten,eaten,eaten', `gains=${gains.join('/')} states=${states}`);
      // …and the eaten ones find their way home and back out.
      game.player.want = -1;
      game.player.moving = false;
      let back = false;
      run(game, 20, (g) => {
        g.player.moving = false;
        if (g.snapshot().chasers.every((c) => c.state === 'active')) {
          back = true;
          return false;
        }
      });
      check('eyes-return', back, `chasers: ${game.snapshot().chasers.map((c) => c.state).join(',')}`);
    }
    {
      // Touching a chaser costs a life; the last one ends the game and submits the score.
      const { game, h } = started(PelletPanic, { lives: 1 });
      run(game, 0.5);
      const rook = game.chasers[0];
      Object.assign(rook, { state: 'active', frightened: false, tx: game.player.tx, ty: game.player.ty, t: game.player.t, dir: game.player.dir });
      game.collide();
      const dying = game.snapshot().phase;
      run(game, 2);
      const s = game.snapshot();
      check(
        'death-and-game-over',
        dying === 'dying' && s.phase === 'over' && h.overlay?.variant === 'lose' && h.submitted.at(-1) === s.score && s.score > 0,
        `phase ${dying} -> ${s.phase}, overlay=${h.overlay?.variant}, submitted=${h.submitted.join(',')} score=${s.score}`,
      );
    }
    {
      // Eating the last pellet clears the level: +1000 and a brand-new maze.
      const { game } = started(PelletPanic, {});
      const seed1 = game.snapshot().seed;
      game.pellets.fill(0);
      game.pelletsLeft = 1;
      const i = game.player.ty * maze.COLS + game.player.tx;
      game.pellets[i] = 1;
      const before = game.score;
      game.eatAt(game.player.tx, game.player.ty);
      const cleared = game.snapshot();
      run(game, 2.5);
      const s = game.snapshot();
      check(
        'level-clear',
        cleared.phase === 'clear' && cleared.score === before + 10 + 1000 && s.level === 2 && s.seed !== seed1 && s.pelletsLeft > 100,
        `phase=${cleared.phase} +${cleared.score - before} -> level ${s.level}, seed ${seed1} -> ${s.seed}, pellets=${s.pelletsLeft}`,
      );
    }
    {
      // A fixed seed replays the same mazes; seed 0 draws a fresh run each game.
      const a = started(PelletPanic, { seed: 1234 }).game.snapshot().seed;
      const b = started(PelletPanic, { seed: 1234 }).game.snapshot().seed;
      const c = started(PelletPanic, { seed: 0 }).game.snapshot().seed;
      const d = started(PelletPanic, { seed: 0 }).game.snapshot().seed;
      check('seed-config', a === b && c !== d, `seed 1234 -> ${a}, ${b}; seed 0 -> ${c}, ${d}`);
    }
    {
      // A bot that walks to the nearest pellet plays whole games at the 50 ms dt
      // cap without ever leaving the corridors.
      const { game, h } = started(PelletPanic, { lives: 3, chaserSpeed: 70 });
      let offGrid = 0;
      let frames = 0;
      for (; frames < 20 * 60 * 5 && game.snapshot().phase !== 'over'; frames++) {
        const s = game.snapshot();
        if (s.phase === 'playing') game.player.want = nearestPelletDir(game, maze);
        game.update(0.05);
        if (frames % 7 === 0) game.render();
        const p = game.snapshot().player;
        if (maze.tileAt(game.maze, p.x, p.y) !== maze.PATH) offGrid++;
      }
      const s = game.snapshot();
      check(
        'bot-playthrough',
        offGrid === 0 && s.score > 500 && (s.phase !== 'over' || h.submitted.length === 1),
        `${(frames * 0.05).toFixed(0)} s: phase=${s.phase} level=${s.level} score=${s.score} lives=${s.lives} offGrid=${offGrid}`,
      );
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
    console.log('\nPellet Panic checks ok');
  }
}

/**
 * First step of a breadth-first walk to the closest pellet, planned from the
 * tile the player is about to reach — the game applies it there as a buffered
 * turn (or at once, if it means turning back).
 */
function nearestPelletDir(game, maze) {
  const { COLS } = maze;
  const DX = [0, -1, 0, 1];
  const DY = [-1, 0, 1, 0];
  const p = game.player;
  const start = p.moving && p.t > 0 ? { x: maze.wrapX(p.tx + DX[p.dir]), y: p.ty + DY[p.dir] } : { x: p.tx, y: p.ty };
  const seen = new Map([[start.y * COLS + start.x, -1]]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    const first = seen.get(p.y * COLS + p.x);
    if (head > 0 && game.pellets[p.y * COLS + p.x]) return first;
    for (let d = 0; d < 4; d++) {
      const nx = maze.wrapX(p.x + DX[d]);
      const ny = p.y + DY[d];
      if (maze.tileAt(game.maze, nx, ny) !== maze.PATH || seen.has(ny * COLS + nx)) continue;
      seen.set(ny * COLS + nx, head === 0 ? d : first);
      queue.push({ x: nx, y: ny });
    }
  }
  return game.player.dir;
}

await main();
