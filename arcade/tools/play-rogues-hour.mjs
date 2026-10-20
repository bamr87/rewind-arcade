// Headless checks for Rogue's Hour: pins the manifest, the daily seed, the
// generator's connectivity, field of view and memory, the pause guard on turn
// keys, and the run clock, then lets a bot play thousands of turns. Run with
// `npm run play:rogues-hour`; exits non-zero on any failure.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = 80;
const H = 28;
const CELL_W = 12;
const CELL_H = 20;
const TOP = CELL_H;
const DAY = new Date(2026, 9, 20, 15, 30);
const WALKABLE = new Set([2, 3, 4]);
const STEP_KEYS = {
  '0,-1': 'ArrowUp', '0,1': 'ArrowDown', '-1,0': 'ArrowLeft', '1,0': 'ArrowRight',
  '-1,-1': 'Numpad7', '1,-1': 'Numpad9', '-1,1': 'Numpad1', '1,1': 'Numpad3',
};

/** A 2D context that accepts every call and records the glyphs drawn. */
function mock2d() {
  const texts = [];
  const noop = () => undefined;
  const target = {
    canvas: { width: 960, height: 600 },
    texts,
    measureText: () => ({ width: 0 }),
    fillText: (s, x, y) => texts.push({ s, x, y }),
  };
  return new Proxy(target, {
    get: (t, prop) => (prop in t ? t[prop] : noop),
    set: (t, prop, value) => ((t[prop] = value), true),
  });
}

function host(config) {
  let best = 0;
  const h = {
    config,
    ctx: mock2d(),
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

function started(RoguesHour, config = {}, day = DAY) {
  const h = host({ seedMode: 'daily', minutes: 10, fov: 7, ...config });
  const game = new RoguesHour(h, day);
  game.render();
  if (h.overlay?.variant !== 'menu') throw new Error('expected the title overlay');
  game.onAction('start');
  if (game.snapshot().phase !== 'playing') throw new Error('start did not begin play');
  return { game, h };
}

const press = (game, code) => {
  game.onKey(code, true);
  game.onKey(code, false);
};

/** Breadth-first path over walkable tiles (8-way); returns the first step toward any goal. */
function firstStep(s, goals) {
  const start = s.player.y * W + s.player.x;
  const prev = new Int32Array(W * H).fill(-2);
  prev[start] = -1;
  const queue = [start];
  for (let q = 0; q < queue.length; q++) {
    const cur = queue[q];
    if (goals.has(cur) && cur !== start) {
      let i = cur;
      while (prev[i] !== start) i = prev[i];
      return [(i % W) - s.player.x, Math.floor(i / W) - s.player.y];
    }
    const cx = cur % W, cy = Math.floor(cur / W);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (prev[n] !== -2 || !WALKABLE.has(s.tiles[n])) continue;
        prev[n] = cur;
        queue.push(n);
      }
    }
  }
  return null;
}

/** Every walkable tile reachable from `from` (8-way). */
function reachable(tiles, from) {
  const seen = new Set([from]);
  const queue = [from];
  for (let q = 0; q < queue.length; q++) {
    const cur = queue[q], cx = cur % W, cy = Math.floor(cur / W);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy, n = ny * W + nx;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen.has(n) || !WALKABLE.has(tiles[n])) continue;
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen;
}

/** Map cells that received a glyph in the last render. */
function drawnCells(h) {
  const cells = new Set();
  for (const t of h.ctx.texts) {
    const x = Math.floor(t.x / CELL_W), y = Math.floor((t.y - TOP) / CELL_H);
    if (t.y > TOP && y >= 0 && y < H && x >= 0 && x < W) cells.add(y * W + x);
  }
  return cells;
}

function render(game, h) {
  h.ctx.texts.length = 0;
  game.render();
  return drawnCells(h);
}

async function main() {
  const vite = await createServer({
    root,
    configFile: false,
    cacheDir: path.join(os.tmpdir(), 'vite-play-rogues-hour'),
    server: { middlewareMode: true },
    appType: 'custom',
  });
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });
  try {
    const { getGame } = await vite.ssrLoadModule('/src/games/registry.ts');
    const manifest = getGame('rogues-hour');
    check('registered', manifest?.id === 'rogues-hour', `getGame('rogues-hour') -> ${manifest?.title}`);
    if (!manifest) throw new Error("no game registered as 'rogues-hour'");
    const { RoguesHour } = await vite.ssrLoadModule('/src/games/rogues-hour/game.ts');
    const dungeon = await vite.ssrLoadModule('/src/games/rogues-hour/dungeon.ts');

    /* ---------------------------- manifest --------------------------- */
    {
      const got = Object.fromEntries(
        manifest.config.map((f) => [f.key, f.type === 'select' ? [f.type, f.options.map((o) => o.value).join('|'), f.default, f.restart] : [f.type, f.min, f.max, f.step, f.default, f.restart]]),
      );
      const want = {
        seedMode: ['select', 'daily|random', 'daily', true],
        minutes: ['range', 5, 20, 1, 10, true],
        fov: ['range', 4, 10, 1, 7, true],
      };
      check('manifest-config', JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));
      check(
        'manifest-meta',
        manifest.year === '1980' && manifest.icon === '🗡️' && JSON.stringify(manifest.pad) === JSON.stringify({ south: 'KeyX', west: 'KeyQ', north: 'KeyZ' }),
        `year=${manifest.year} icon=${manifest.icon} pad=${JSON.stringify(manifest.pad)}`,
      );
    }
    {
      const dir = path.join(root, 'src/games/rogues-hour');
      const bad = [];
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.ts')) bad.push(`non-ts file ${f}`);
        for (const m of fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/from '([^']+)'/g)) {
          if (!/^(\.\/|\.\.\/\.\.\/engine\/)/.test(m[1])) bad.push(`${f}: ${m[1]}`);
        }
      }
      check('engine-only-imports', bad.length === 0, bad.length ? bad.join(', ') : 'only ../../engine/* and ./ imports, .ts files only');
    }

    /* ----------------------------- seeding --------------------------- */
    {
      const a = started(RoguesHour, {}, new Date(2026, 9, 20, 8, 0)).game.snapshot();
      const b = started(RoguesHour, {}, new Date(2026, 9, 20, 23, 59)).game.snapshot();
      const c = started(RoguesHour, {}, new Date(2026, 9, 21, 8, 0)).game.snapshot();
      check('daily-same-date', a.map === b.map && a.seed === 20261020 && b.seed === 20261020, `seed ${a.seed} at 08:00 and 23:59 -> identical maps`);
      check('daily-next-date-differs', c.seed === 20261021 && c.map !== a.map, `seed ${c.seed} -> a different map`);
      const deep = (seed) => [1, 2, 3, 4, 5].map((d) => {
        const l = dungeon.generateLevel(seed, d);
        return `${Array.from(l.tiles).join('')}|${l.start}|${l.stairs}|${[...l.gold].join()}|${l.monsters.map((m) => `${m.x},${m.y},${m.kind}`).join()}`;
      }).join('\n');
      check('daily-every-depth', deep(20261020) === deep(20261020) && deep(20261020) !== deep(20261021), 'depths 1–5 regenerate identically from the same seed');
      // Retrying today's dungeon gives the same first level again.
      const { game } = started(RoguesHour, {});
      const first = game.snapshot().map;
      for (let i = 0; i < 20; i++) press(game, 'KeyZ');
      game.onAction('restart');
      check('daily-retry-same', game.snapshot().map === first && game.snapshot().turn === 0, 'restart replays the same daily level 1');

      const r1 = started(RoguesHour, { seedMode: 'random' }).game.snapshot();
      const r2 = started(RoguesHour, { seedMode: 'random' }).game.snapshot();
      check('random-differs', r1.map !== r2.map && r1.seed !== r2.seed, `random seeds ${r1.seed} vs ${r2.seed}`);
    }

    /* ---------------------------- generator -------------------------- */
    {
      const bad = [];
      let levels = 0;
      for (let seed = 1; seed <= 150; seed++) {
        for (let depth = 1; depth <= 8; depth++) {
          const l = dungeon.generateLevel(seed * 7919, depth);
          levels++;
          const reach = reachable(l.tiles, l.start);
          const things = [l.stairs, ...l.gold.keys(), ...l.potions, ...l.monsters.map((m) => m.y * W + m.x)];
          const lost = things.filter((i) => !reach.has(i));
          const floors = Array.from(l.tiles).filter((t, i) => t === 2 && !reach.has(i)).length;
          if (l.start === l.stairs) bad.push(`seed ${seed} d${depth}: start on stairs`);
          if (lost.length || floors) bad.push(`seed ${seed} d${depth}: ${lost.length} things, ${floors} floor tiles unreachable`);
          if (bad.length > 5) break;
        }
      }
      check('generator-connected', bad.length === 0, bad.length ? bad.slice(0, 5).join(' | ') : `${levels} levels: stairs, gold, potions, monsters and every room floor reachable from the start`);
    }

    /* ------------------------------ FOV ------------------------------ */
    {
      const { game, h } = started(RoguesHour, {});
      let s = game.snapshot();
      const drawn = render(game, h);
      const unseenDrawn = [...drawn].filter((i) => !s.seen[i]);
      const hiddenFloor = s.tiles.filter((t, i) => WALKABLE.has(t) && !s.seen[i]).length;
      const far = s.visible.findIndex((v, i) => v && Math.hypot((i % W) - s.player.x, Math.floor(i / W) - s.player.y) > 7.01);
      check('fov-hides-unseen', unseenDrawn.length === 0 && hiddenFloor > 100 && drawn.size > 5, `${drawn.size} cells drawn, ${unseenDrawn.length} of them unseen; ${hiddenFloor} walkable tiles still hidden`);
      check('fov-radius', far === -1, far === -1 ? 'nothing visible beyond the 7-tile sight radius' : `tile ${far} visible beyond radius`);
      const narrow = started(RoguesHour, { fov: 4 }).game.snapshot().visible.filter(Boolean).length;
      const wide = started(RoguesHour, { fov: 10 }).game.snapshot().visible.filter(Boolean).length;
      check('fov-setting', narrow < wide, `visible tiles at start: fov 4 -> ${narrow}, fov 10 -> ${wide}`);

      // Walk toward the stairs; explored tiles must never be forgotten, and remembered
      // (seen but out of sight) cells must still be drawn.
      let monotonic = true;
      let prevSeen = s.seen.filter(Boolean).length;
      for (let i = 0; i < 60 && game.snapshot().phase === 'playing'; i++) {
        s = game.snapshot();
        const step = firstStep(s, new Set([s.stairs]));
        if (!step) break;
        press(game, STEP_KEYS[step.join(',')]);
        const now = game.snapshot().seen.filter(Boolean).length;
        if (now < prevSeen && game.snapshot().depth === s.depth) monotonic = false;
        prevSeen = now;
      }
      s = game.snapshot();
      const drawnAfter = render(game, h);
      const remembered = s.seen.map((v, i) => (v && !s.visible[i] ? i : -1)).filter((i) => i >= 0);
      const rememberedDrawn = remembered.filter((i) => drawnAfter.has(i) || s.tiles[i] === 0).length;
      const monsterInDark = s.monsters.filter((m) => !s.visible[m.y * W + m.x]);
      const darkMonsterDrawn = h.ctx.texts.some((t) => monsterInDark.some((m) => t.s === m.glyph && Math.floor(t.x / CELL_W) === m.x && Math.floor((t.y - TOP) / CELL_H) === m.y));
      check(
        'fov-remembers',
        monotonic && remembered.length > 0 && rememberedDrawn === remembered.length && !darkMonsterDrawn,
        `explored count never shrank; ${remembered.length} remembered cells, ${rememberedDrawn} drawn; ${monsterInDark.length} monsters out of sight, drawn=${darkMonsterDrawn}`,
      );
    }

    /* --------------------------- pause guard ------------------------- */
    {
      const { game } = started(RoguesHour, {});
      const before = game.snapshot();
      game.onPause();
      for (const code of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'KeyD', 'Numpad3', 'KeyZ', 'Numpad5', 'KeyX', 'Period', 'KeyQ']) press(game, code);
      const paused = game.snapshot();
      game.onKey('ArrowRight', true);
      const arrowWhilePaused = game.snapshot();
      game.onKey('ArrowRight', false);
      check(
        'pause-blocks-turns',
        paused.turn === before.turn && paused.player.x === before.player.x && paused.player.y === before.player.y && arrowWhilePaused.turn === before.turn && arrowWhilePaused.player.x === before.player.x,
        `paused: turn ${before.turn} -> ${paused.turn}, player (${before.player.x},${before.player.y}) -> (${paused.player.x},${paused.player.y})`,
      );
      const t0 = game.snapshot().timeLeft;
      game.update(30);
      check('pause-stops-clock', game.snapshot().timeLeft === t0, `update(30) while paused: ${t0} -> ${game.snapshot().timeLeft}`);
      game.onResume();
      press(game, 'KeyZ');
      game.update(0.05);
      check('resume-plays', game.snapshot().turn === before.turn + 1 && game.snapshot().timeLeft < t0, `after onResume: turn ${game.snapshot().turn}, time ${game.snapshot().timeLeft.toFixed(2)}`);
    }

    /* --------------------------- system keys ------------------------- */
    {
      const { game } = started(RoguesHour, {});
      const before = game.snapshot();
      for (const code of ['Space', 'Enter', 'Escape', 'KeyP']) press(game, code);
      const after = game.snapshot();
      check('system-keys-inert', after.turn === before.turn && after.player.x === before.player.x && after.player.y === before.player.y, 'Space/Enter/Escape/KeyP take no turn');
      check('menu-blocks-turns', (() => {
        const h = host({ seedMode: 'daily', minutes: 10, fov: 7 });
        const g = new RoguesHour(h, DAY);
        press(g, 'KeyZ');
        press(g, 'ArrowRight');
        return g.snapshot().turn === 0 && g.snapshot().phase === 'menu';
      })(), 'turn keys do nothing while the title panel is up');
    }

    /* ------------------------------ keys ----------------------------- */
    {
      const { game } = started(RoguesHour, {});
      const t = () => game.snapshot().turn;
      press(game, 'KeyZ');
      press(game, 'Numpad5');
      const waited = t();
      press(game, 'KeyX');
      const offStairs = t();
      press(game, 'KeyQ');
      const noPotion = t();
      game.potions = 1;
      game.hp = 5;
      press(game, 'KeyQ');
      const quaffed = game.snapshot();
      const s = game.snapshot();
      game.px = s.stairs % W;
      game.py = Math.floor(s.stairs / W);
      press(game, 'Period');
      const descended = game.snapshot();
      game.px = descended.stairs % W;
      game.py = Math.floor(descended.stairs / W);
      press(game, 'KeyX');
      check(
        'keys',
        waited === 2 && offStairs === 2 && noPotion === 2 && quaffed.turn === 3 && quaffed.hp > 5 && quaffed.potions === 0 &&
          descended.depth === 2 && descended.map !== s.map && game.snapshot().depth === 3,
        `wait Z/Num5 -> turn ${waited}; X off stairs -> ${offStairs}; Q empty -> ${noPotion}; Q -> hp ${quaffed.hp}; . on stairs -> depth ${descended.depth}; X on stairs -> depth ${game.snapshot().depth}`,
      );
    }
    {
      const { h } = started(RoguesHour, {});
      const labels = (h.hud.stats || []).map((s) => s.label).join(',');
      check('hud', labels === 'Depth,Gold,HP,Time,Best' && h.hud.progress?.value === 1 && h.hud.badge === 'DAILY 20261020', `stats=${labels} progress=${h.hud.progress?.value} badge=${h.hud.badge}`);
    }

    /* ----------------------------- run clock ------------------------- */
    {
      const bad = [];
      for (const minutes of [5, 10, 20]) {
        const { game, h } = started(RoguesHour, { minutes });
        if (game.snapshot().timeLeft !== minutes * 60) bad.push(`${minutes} min starts at ${game.snapshot().timeLeft}`);
        // Earn something first so the submitted score is a real product.
        game.gold = 37;
        game.depth = 3;
        const frames = Math.ceil((minutes * 60) / 0.05) + 5;
        let endedAt = -1;
        for (let f = 0; f < frames; f++) {
          game.update(0.05);
          if (endedAt < 0 && game.snapshot().phase === 'over') endedAt = f;
        }
        for (let f = 0; f < 100; f++) game.update(0.05);
        const s = game.snapshot();
        const ok = s.phase === 'over' && s.endReason === 'time' && h.submitted.length === 1 && Number.isInteger(h.submitted[0]) && h.submitted[0] === 111 && h.overlay?.variant === 'win';
        const expect = Math.round((minutes * 60) / 0.05);
        if (!ok || Math.abs(endedAt + 1 - expect) > 1) bad.push(`${minutes} min: phase=${s.phase} ended at frame ${endedAt + 1}/${expect} submitted=${h.submitted.join(',')} overlay=${h.overlay?.variant}`);
      }
      check('time-out', bad.length === 0, bad.length ? bad.join(' | ') : '5/10/20 min runs end on their last frame at the 50 ms dt cap with exactly one submitScore(depth × gold = 111)');
    }

    /* ------------------------------- bot ----------------------------- */
    {
      let turns = 0, runs = 0, deaths = 0, maxDepth = 0, maxGold = 0, error = '';
      const submits = [];
      for (const seedMode of ['daily', 'random']) {
        for (let attempt = 0; attempt < 6 && !error; attempt++) {
          const { game, h } = started(RoguesHour, { seedMode, fov: 4 + attempt });
          runs++;
          try {
            for (let i = 0; i < 600 && game.snapshot().phase === 'playing'; i++) {
              const s = game.snapshot();
              const here = s.player.y * W + s.player.x;
              if (s.hp < 8 && s.potions > 0) press(game, 'KeyQ');
              else if (here === s.stairs && s.goldAt.length === 0) press(game, 'KeyX');
              else {
                const step = firstStep(s, new Set(s.goldAt.length ? s.goldAt : [s.stairs]));
                if (step) press(game, STEP_KEYS[step.join(',')]);
                else press(game, 'KeyZ');
              }
              if (i % 10 === 0) { game.update(0.05); game.render(); }
              turns++;
            }
          } catch (e) {
            error = `${seedMode} run ${attempt}: ${e.stack || e}`;
          }
          const s = game.snapshot();
          maxDepth = Math.max(maxDepth, s.depth);
          maxGold = Math.max(maxGold, s.gold);
          if (s.phase === 'over') {
            deaths++;
            submits.push(...h.submitted);
            if (h.submitted.length !== 1 || !Number.isInteger(h.submitted[0]) || h.submitted[0] < 0 || h.submitted[0] !== s.depth * s.gold) {
              error ||= `run ended with submissions ${h.submitted.join(',')} for depth ${s.depth} × gold ${s.gold}`;
            }
          } else if (h.submitted.length) {
            error ||= `submitted while still playing: ${h.submitted.join(',')}`;
          }
        }
      }
      check(
        'bot-plays',
        !error && turns >= 2000 && maxDepth >= 3 && maxGold > 0,
        error || `${runs} runs, ${turns} turns without throwing; deepest ${maxDepth}, most gold ${maxGold}; ${deaths} deaths, each with one integer submitScore (${submits.slice(0, 6).join(',')})`,
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
    console.log(`\nRogue's Hour checks ok (${results.length})`);
  }
}

await main();
