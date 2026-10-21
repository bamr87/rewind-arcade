// Headless checks for Banana Barrage: drives the real game class through its rules
// with a mock canvas, then plays whole matches against the CPU at the 50 ms dt cap.
// Run with `npm run play:banana-barrage`; exits non-zero on any failure.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A 2D context that accepts every call. */
function mock2d() {
  const noop = () => undefined;
  return new Proxy(
    { canvas: { width: 800, height: 500 }, measureText: () => ({ width: 0 }) },
    {
      get: (target, prop) => (prop in target ? target[prop] : noop),
      set: (target, prop, value) => ((target[prop] = value), true),
    },
  );
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

/** Small seeded PRNG so a skyline can be replayed. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A match started on a seeded skyline. */
function started(BananaBarrage, config = {}, seed = 1) {
  const h = host({ mode: 'ai', ai: 70, rounds: 3, wind: 5, gravity: 10, ...config });
  const game = new BananaBarrage(h);
  game.render();
  if (h.overlay?.variant !== 'menu') throw new Error('expected the title overlay');
  game.rng = mulberry32(seed);
  game.onAction('start');
  if (game.snapshot().phase !== 'aim') throw new Error('start did not begin play');
  return { game, h };
}

const tap = (game, code) => {
  game.onKey(code, true);
  game.onKey(code, false);
};

/** Step until the banana in the air comes down. Returns seconds taken, or -1 if it never did. */
function fly(game, dt = 0.05, limit = 30) {
  let t = 0;
  while (game.snapshot().phase === 'flight') {
    game.update(dt);
    t += dt;
    if (t > limit) return -1;
  }
  return t;
}

/** Finish a 'boom' pause so the turn passes. */
function settle(game) {
  for (let i = 0; i < 40 && game.snapshot().phase === 'boom'; i++) game.update(0.05);
}

/** Set the active player's aim and throw with F. */
function throwAt(game, angle, power) {
  const s = game.snapshot();
  game.aim[s.turn] = { angle, power };
  tap(game, 'KeyF');
}

/** A throw for `owner` that comes down harmlessly (building or off-screen), not on a gorilla. */
function safeMiss(game, owner) {
  for (const [a, p] of [[80, 30], [70, 25], [60, 20], [85, 40], [45, 15], [30, 12]]) {
    if (game.simulate(owner, a, p).kind !== 'gorilla') return [a, p];
  }
  throw new Error('no safe miss found');
}

async function main() {
  const vite = await createServer({
    root,
    configFile: false,
    cacheDir: path.join(os.tmpdir(), 'vite-play-banana-barrage'),
    server: { middlewareMode: true },
    appType: 'custom',
  });
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });
  try {
    const { BananaBarrage, W, H, BLAST_R } = await vite.ssrLoadModule('/src/games/banana-barrage/game.ts');
    const { bananaBarrageManifest: m } = await vite.ssrLoadModule('/src/games/banana-barrage/index.ts');
    const { getGame } = await vite.ssrLoadModule('/src/games/registry.ts');

    /* ---------------------------- manifest --------------------------- */
    {
      const f = Object.fromEntries(m.config.map((c) => [c.key, c]));
      const range = (c, min, max, step, def) => c?.type === 'range' && c.min === min && c.max === max && c.step === step && c.default === def;
      const ok =
        m.config.map((c) => c.key).join(',') === 'mode,ai,rounds,wind,gravity' &&
        f.mode.type === 'select' && f.mode.default === 'ai' &&
        JSON.stringify(f.mode.options) === JSON.stringify([{ value: 'ai', label: 'You vs CPU' }, { value: 'two', label: 'Two players' }]) &&
        range(f.ai, 30, 100, 5, 70) && f.ai.unit === '%' &&
        range(f.rounds, 1, 9, 1, 3) &&
        range(f.wind, 0, 10, 1, 5) &&
        range(f.gravity, 5, 20, 1, 10) &&
        m.config.every((c) => c.restart === true);
      check('manifest-config', ok, JSON.stringify(m.config.map((c) => [c.key, c.type, c.default])));
      const pad = JSON.stringify({ south: 'KeyF', east: 'KeyF', r1: 'KeyF' });
      check(
        'manifest-meta',
        m.id === 'banana-barrage' && m.year === '1991' && m.icon === '🍌' && JSON.stringify(m.pad) === pad && JSON.stringify(m.pad2) === pad,
        `id=${m.id} year=${m.year} pad=${JSON.stringify(m.pad)} pad2=${JSON.stringify(m.pad2)}`,
      );
      check('registered', getGame('banana-barrage') === m, `getGame('banana-barrage') -> ${getGame('banana-barrage')?.title}`);
    }

    /* ------------------------------ seam ----------------------------- */
    {
      const dir = path.join(root, 'src/games/banana-barrage');
      const src = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
      const imports = [...src.matchAll(/^import .* from '([^']+)'/gm)].map((x) => x[1]);
      const bad = imports.filter((s) => !s.startsWith('../../engine/') && !s.startsWith('./'));
      const sysKeys = src.match(/'(Space|Enter|Escape|KeyP)'/g) ?? [];
      check('engine-only-imports', bad.length === 0 && imports.length > 0, `imports: ${[...new Set(imports)].join(', ')}`);
      check('no-system-keys', sysKeys.length === 0, sysKeys.length ? `found ${sysKeys.join(',')}` : 'no Space/Enter/Escape/KeyP in game code');
    }

    /* ------------------------------ skyline -------------------------- */
    {
      let ok = true;
      const detail = [];
      for (let seed = 1; seed <= 50; seed++) {
        const { game } = started(BananaBarrage, {}, seed);
        const [a, b] = game.snapshot().gorillas;
        const standing = [a, b].every((g) => game.mask[Math.floor(g.y + 1) * W + Math.floor(g.x)] === 1 && game.mask[Math.floor(g.y - 2) * W + Math.floor(g.x)] === 0);
        const wind = game.snapshot().wind;
        if (!(standing && a.x < 200 && b.x > W - 200 && Number.isInteger(wind) && Math.abs(wind) <= 5)) {
          ok = false;
          detail.push(`seed ${seed}: L=${a.x},${a.y} R=${b.x},${b.y} wind=${wind}`);
        }
      }
      check('skyline-50-seeds', ok, ok ? 'gorillas on their roofs at each edge, integer wind in ±5' : detail.slice(0, 3).join('; '));
      const calm = started(BananaBarrage, { wind: 0 }, 7);
      check('wind-0-is-calm', calm.game.snapshot().wind === 0 && calm.h.hud.stats.find((s) => s.label === 'Wind')?.value === 'calm', `wind=${calm.game.snapshot().wind}`);
    }

    /* ------------------------------- input --------------------------- */
    {
      const { game, h } = started(BananaBarrage, { mode: 'ai' });
      for (const code of ['Space', 'Enter', 'Escape', 'KeyP', 'KeyJ', 'KeyL']) tap(game, code);
      const noThrow = game.snapshot().phase === 'aim' && game.snapshot().throws[0] === 0;
      tap(game, 'ArrowUp');
      tap(game, 'ArrowRight');
      tap(game, 'ArrowRight');
      const aim = game.snapshot().aim[0];
      tap(game, 'KeyK');
      const threw = game.snapshot().phase === 'flight' && game.snapshot().throws[0] === 1;
      check('throw-keys', noThrow && threw && aim.angle === 46 && aim.power === 52, `system keys threw=${!noThrow}; aim ${aim.angle}°/${aim.power}; K threw=${threw}`);
      check('hud', h.hud.badge === 'VS CPU' && h.hud.stats.map((s) => s.label).join('|') === 'Wind|Angle|Power|Rounds|Score', `${h.hud.badge} ${h.hud.stats.map((s) => `${s.label}=${s.value}`).join(' ')}`);
      // Hold a key: after a short delay the angle sweeps on its own.
      const s = started(BananaBarrage);
      s.game.onKey('ArrowUp', true);
      for (let i = 0; i < 10; i++) s.game.onKey('ArrowUp', true); // OS repeat is ignored
      const afterRepeat = s.game.snapshot().aim[0].angle;
      for (let i = 0; i < 20; i++) s.game.update(0.05);
      s.game.onKey('ArrowUp', false);
      const swept = s.game.snapshot().aim[0].angle;
      check('hold-to-sweep', afterRepeat === 46 && swept > 60 && swept <= 90, `after 10 repeats ${afterRepeat}°, after 1 s held ${swept.toFixed(1)}°`);
      check('two-player-badge', started(BananaBarrage, { mode: 'two' }).h.hud.badge === 'VS P2', 'mode two -> VS P2');
    }
    {
      // On the CPU's turn and while a banana flies, the keyboard does nothing.
      const { game } = started(BananaBarrage, { mode: 'ai', wind: 0 }, 3);
      const [a, p] = safeMiss(game, 0);
      throwAt(game, a, p);
      tap(game, 'KeyF');
      const midFlight = game.snapshot().throws[0];
      fly(game);
      settle(game);
      const cpuTurn = game.snapshot().turn === 1 && game.snapshot().phase === 'aim';
      const cpuAim = JSON.stringify(game.snapshot().aim[1]);
      for (const code of ['KeyF', 'KeyK', 'ArrowUp', 'ArrowLeft']) tap(game, code);
      const s = game.snapshot();
      check('inactive-input-ignored', midFlight === 1 && cpuTurn && s.phase === 'aim' && s.throws[1] === 0 && JSON.stringify(s.aim[1]) === cpuAim, `throws mid-flight=${midFlight}, cpu turn=${cpuTurn}, cpu throws after key presses=${s.throws[1]}`);
      game.update(1);
      check('cpu-throws', game.snapshot().throws[1] === 1, `after its think delay the CPU threw ${game.snapshot().throws[1]}`);
    }

    /* --------------------- carving and tunnelling -------------------- */
    {
      // Find a throw that lands on a building, take it twice: the second goes further down the hole.
      let found = null;
      for (let seed = 1; seed <= 30 && !found; seed++) {
        const { game } = started(BananaBarrage, { mode: 'two', wind: 0 }, seed);
        for (const [a, p] of [[40, 45], [35, 55], [50, 50], [30, 40], [45, 60]]) {
          const out = game.simulate(0, a, p);
          if (out.kind === 'building' && out.x > 200 && out.x < W - 200) {
            found = { game, a, p, out };
            break;
          }
        }
      }
      if (!found) {
        check('carve-clears-mask', false, 'no building throw found');
      } else {
        const { game, a, p } = found;
        const solidBefore = game.mask.reduce((n, v) => n + v, 0);
        throwAt(game, a, p);
        fly(game);
        const first = game.snapshot().boom;
        let cleared = true;
        for (let k = 0; k < 64; k++) {
          const r = (BLAST_R - 1) * Math.sqrt(k / 64);
          const t = k * 2.4;
          const x = Math.floor(first.x + Math.cos(t) * r);
          const y = Math.floor(first.y + Math.sin(t) * r);
          if (x >= 0 && x < W && y >= 0 && y < H && game.mask[y * W + x]) cleared = false;
        }
        const solidAfter = game.mask.reduce((n, v) => n + v, 0);
        check('carve-clears-mask', cleared && solidAfter < solidBefore && game.snapshot().craters === 1, `boom at ${first.x.toFixed(0)},${first.y.toFixed(0)}; solid ${solidBefore} -> ${solidAfter}`);
        settle(game);
        game.turn = 0; // hot-seat: hand the throw back to P1
        game.phase = 'aim';
        throwAt(game, a, p);
        fly(game);
        const second = game.snapshot().boom ?? game.snapshot().shot;
        const g0 = game.snapshot().gorillas[0];
        const d1 = Math.hypot(first.x - g0.x, first.y - g0.y);
        const d2 = second ? Math.hypot(second.x - g0.x, second.y - g0.y) : Infinity;
        check('tunnel-through-crater', d2 > d1 + 5, `same throw twice: first blast ${d1.toFixed(0)} px out, second ${Number.isFinite(d2) ? d2.toFixed(0) : 'off-screen'}`);
      }
    }
    {
      // A 2 px wall cannot be skipped at full power and the 50 ms dt cap.
      const { game } = started(BananaBarrage, { mode: 'two', wind: 0 }, 5);
      game.mask.fill(0);
      for (const g of game.snapshot().gorillas) for (let x = g.x - 20; x < g.x + 20; x++) game.mask[Math.floor(g.y + 1) * W + Math.floor(x)] = 1;
      for (let y = 0; y < H; y++) game.mask[y * W + 400] = game.mask[y * W + 401] = 1;
      throwAt(game, 5, 100);
      fly(game, 0.05);
      const b = game.snapshot().boom;
      check('no-tunnelling', b && b.x >= 399 && b.x < 403, `blast at x=${b?.x.toFixed(1)}`);
    }
    {
      // 300 random throws over random skylines and wind at the dt cap: every one comes down.
      let stuck = 0;
      let slowest = 0;
      const rnd = mulberry32(99);
      for (let i = 0; i < 300; i++) {
        const { game } = started(BananaBarrage, { mode: 'two', wind: 10, gravity: 5 + Math.floor(rnd() * 16) }, 1000 + i);
        throwAt(game, rnd() * 90, 1 + rnd() * 99);
        const t = fly(game, 0.05);
        if (t < 0) stuck++;
        slowest = Math.max(slowest, t);
      }
      check('projectiles-resolve', stuck === 0, `300 throws, ${stuck} never resolved, slowest ${slowest.toFixed(2)} s`);
    }

    /* ------------------------------ scoring -------------------------- */
    {
      // Hot-seat, 1 round: P1 misses, P2 misses, P1 hits on throw 2 -> 1000 + 400 + 250.
      let done = null;
      for (let seed = 1; seed <= 30 && !done; seed++) {
        const { game, h } = started(BananaBarrage, { mode: 'two', wind: 0, rounds: 1 }, seed);
        throwAt(game, ...safeMiss(game, 0));
        fly(game);
        settle(game);
        throwAt(game, ...safeMiss(game, 1));
        fly(game);
        settle(game);
        const plan = game.solve(0);
        if (!plan.hit) continue;
        throwAt(game, plan.angle, plan.power);
        fly(game);
        for (let i = 0; i < 60 && game.snapshot().phase === 'round'; i++) game.update(0.05);
        done = { game, h, seed };
      }
      const s = done?.game.snapshot();
      check(
        'score-formula',
        s && s.phase === 'over' && s.score === 1650 && done.h.submitted.length === 1 && done.h.submitted[0] === 1650 && done.h.overlay?.variant === 'win',
        `seed ${done?.seed}: phase=${s?.phase} score=${s?.score} submitted=${done?.h.submitted.join(',')} overlay=${done?.h.overlay?.variant}`,
      );
    }
    {
      // Many throws never push a round's bonus below the 1000 base, and losing scores nothing.
      const { game } = started(BananaBarrage, { mode: 'two', rounds: 1 });
      game.throws[0] = 12;
      game.endRound(0);
      const won = game.snapshot().score;
      const l = started(BananaBarrage, { mode: 'two', rounds: 1 });
      l.game.endRound(1);
      for (let i = 0; i < 60; i++) l.game.update(0.05);
      check('score-floor', won === 1000 && l.game.snapshot().score === 0 && l.h.submitted[0] === 0 && l.h.overlay?.variant === 'lose', `12 throws -> ${won}; lost match -> ${l.game.snapshot().score} (${l.h.overlay?.kicker})`);
    }

    /* -------------------------------- CPU ---------------------------- */
    {
      // Calm rounds: count the CPU's throws until it hits, over 20 skylines, at 100% and 30%.
      const cpuThrowsToHit = (ai, seed) => {
        const { game } = started(BananaBarrage, { mode: 'ai', ai, wind: 0, rounds: 9 }, seed);
        for (let turn = 0; turn < 40; turn++) {
          const s = game.snapshot();
          if (s.phase === 'round' || s.phase === 'over') return s.wins[1] === 1 ? s.throws[1] : Infinity;
          if (s.turn === 0) {
            throwAt(game, ...safeMiss(game, 0));
          } else {
            game.update(1); // the CPU's think delay
          }
          fly(game);
          settle(game);
        }
        return Infinity;
      };
      const ace = [];
      const rookie = [];
      for (let seed = 1; seed <= 20; seed++) {
        ace.push(cpuThrowsToHit(100, seed));
        rookie.push(cpuThrowsToHit(30, seed));
      }
      const firstHit = (xs) => xs.filter((n) => n === 1).length;
      check('cpu-100-within-3', ace.every((n) => n <= 3), `ai 100 throws-to-hit: ${ace.join(' ')}`);
      check('cpu-skill-scales', firstHit(ace) > firstHit(rookie), `first-throw hits over 20 rounds: ai 100 = ${firstHit(ace)}, ai 30 = ${firstHit(rookie)}`);
    }

    /* --------------------------- bot playthrough --------------------- */
    {
      // P1 aims with the same solver plus a little noise; whole matches against the CPU at the dt cap.
      let ok = true;
      const detail = [];
      for (let seed = 1; seed <= 5; seed++) {
        const { game, h } = started(BananaBarrage, { mode: 'ai', ai: 70, wind: 5, rounds: 3 }, seed);
        const noise = mulberry32(seed * 31);
        let frames = 0;
        let planned = -1;
        for (; frames < 20 * 60 * 20 && game.snapshot().phase !== 'over'; frames++) {
          const s = game.snapshot();
          if (s.phase === 'aim' && s.turn === 0 && planned !== s.round * 1000 + s.throws[0]) {
            planned = s.round * 1000 + s.throws[0];
            const plan = game.solve(0);
            throwAt(game, plan.angle + (noise() * 2 - 1) * 3, plan.power + (noise() * 2 - 1) * 4);
          }
          game.update(0.05);
          if (frames % 5 === 0) game.render();
        }
        const s = game.snapshot();
        const good = s.phase === 'over' && h.submitted.length === 1 && h.submitted[0] === s.score && Number.isInteger(s.score) && s.score >= 0 && Math.max(...s.wins) === 3;
        if (!good) ok = false;
        detail.push(`seed ${seed}: ${s.wins.join('-')} score ${s.score} in ${(frames * 0.05).toFixed(0)} s`);
      }
      check('bot-matches', ok, detail.join('; '));
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
    console.log('\nBanana Barrage checks ok');
  }
}

await main();
