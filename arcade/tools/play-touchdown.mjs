// Headless checks for Touchdown: proves the terrain generator's promises for
// every rough × pads setting over many seeds, then drives the real game class
// through its landing rules with a mock canvas. Run with `npm run play:touchdown`;
// exits non-zero on any failure.
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEEDS = 300;

function mock2d() {
  const noop = () => mock2d;
  return new Proxy(
    { canvas: { width: 800, height: 600 }, measureText: () => ({ width: 0 }) },
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

/** A flying game with the lander parked over the middle of pad 0. */
function flying(Touchdown, config = {}) {
  const h = host({ gravity: 'moon', fuel: 1000, rough: 5, pads: 3, ...config });
  const game = new Touchdown(h);
  game.render();
  if (h.overlay?.variant !== 'menu') throw new Error('expected the title overlay');
  game.onAction('start');
  if (game.snapshot().phase !== 'flying') throw new Error('start did not begin a descent');
  return { game, h };
}

function placeOverPad(game, { vx = 0, vy = 20, a = 0, gap = 2, pad = 0 } = {}) {
  const p = game.terrain.pads[pad];
  Object.assign(game.lander, { x: (p.x0 + p.x1) / 2, y: p.y - 12 - gap, vx, vy, a });
  return p;
}

function step(game, seconds, dt = 1 / 60, each) {
  for (let i = 0; i < Math.ceil(seconds / dt); i++) {
    if (each && each(game) === false) return;
    game.update(dt);
    if (i % 10 === 0) game.render();
  }
}

async function main() {
  const vite = await createServer({
    root,
    configFile: false,
    cacheDir: path.join(os.tmpdir(), 'vite-play-touchdown'),
    server: { middlewareMode: true },
    appType: 'custom',
  });
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });
  try {
    const terrain = await vite.ssrLoadModule('/src/games/touchdown/terrain.ts');
    const gameMod = await vite.ssrLoadModule('/src/games/touchdown/game.ts');
    const { Touchdown, landingScore, V_MAX, BURN, TOP_UP, GRAVITY } = gameMod;
    const { touchdownManifest } = await vite.ssrLoadModule('/src/games/touchdown/index.ts');
    const { getGame } = await vite.ssrLoadModule('/src/games/registry.ts');

    /* ----------------------------- terrain ---------------------------- */
    {
      const bad = [];
      const shapes = new Set();
      let total = 0;
      for (let rough = 1; rough <= 10; rough++) {
        for (let pads = 2; pads <= 5; pads++) {
          for (let s = 1; s <= SEEDS; s++) {
            const t = terrain.generateTerrain(rough, pads, mulberry32(s * 977 + rough * 31 + pads));
            const problems = terrain.checkTerrain(t, pads);
            if (problems.length) bad.push(`rough=${rough} pads=${pads} seed=${s}: ${problems.slice(0, 2).join('; ')}`);
            shapes.add(t.ys.join(','));
            total++;
          }
        }
      }
      check('terrain-sound', bad.length === 0, bad.length ? bad.slice(0, 5).join(' | ') : `${total} terrains (rough 1-10 × pads 2-5 × ${SEEDS} seeds): exact pad count, flat, wider than the lander, below spawn`);
      check('terrain-variety', shapes.size === total, `${shapes.size} distinct ridges from ${total} generations`);
      const t = terrain.generateTerrain(5, 3, mulberry32(7));
      const dented = { ...t, ys: t.ys.slice() };
      dented.ys[t.pads[1].i0 + 2] += 9;
      const short = { ...t, pads: t.pads.slice(0, 2) };
      check(
        'terrain-checker-bites',
        terrain.checkTerrain(dented, 3).length > 0 && terrain.checkTerrain(short, 3).length > 0,
        `${terrain.checkTerrain(dented, 3)[0]}; ${terrain.checkTerrain(short, 3)[0]}`,
      );
    }

    /* ---------------------------- manifest --------------------------- */
    {
      const by = Object.fromEntries(touchdownManifest.config.map((f) => [f.key, f]));
      const ranges = Object.fromEntries(['fuel', 'rough', 'pads'].map((k) => [k, [by[k]?.min, by[k]?.max, by[k]?.step, by[k]?.default]]));
      const g = by.gravity;
      const ok =
        Object.keys(by).join() === 'gravity,fuel,rough,pads' &&
        JSON.stringify(ranges) === JSON.stringify({ fuel: [500, 2000, 100, 1000], rough: [1, 10, 1, 5], pads: [2, 5, 1, 3] }) &&
        g.type === 'select' && g.default === 'moon' && g.options.map((o) => o.value).join() === 'moon,mars,earth' &&
        touchdownManifest.config.every((f) => f.restart === true) &&
        touchdownManifest.pad?.south === 'ArrowUp' && touchdownManifest.pad?.r2 === 'ArrowUp';
      check('manifest-config', ok, `${JSON.stringify(ranges)} gravity=${g?.options?.map((o) => o.value)} pad=${JSON.stringify(touchdownManifest.pad)}`);
      check('registered', getGame('touchdown') === touchdownManifest, `getGame('touchdown') -> ${getGame('touchdown')?.title}`);
      // Settings are read in the constructor: they shape the session.
      const { game } = flying(Touchdown, { pads: 5, fuel: 1500, gravity: 'earth' });
      const s = game.snapshot();
      check('config-applied', s.pads.length === 5 && s.fuel === 1500 && game.gravity === GRAVITY.earth, `pads=${s.pads.length} fuel=${s.fuel} g=${game.gravity}`);
    }

    /* ---------------------------- landings --------------------------- */
    {
      const { game, h } = flying(Touchdown);
      game.fuel = 600; // below the cap, so the top-up is visible
      const p = placeOverPad(game);
      step(game, 1);
      const s = game.snapshot();
      const want = landingScore(p.mult, s.last?.vSpeed ?? NaN);
      const formula = 50 * p.mult + Math.max(0, Math.round((1 - (s.last?.vSpeed ?? NaN) / V_MAX) * 50));
      check(
        'soft-landing',
        s.phase === 'landed' && s.chain === 1 && s.score === formula && want.pad + want.soft === formula && h.overlay?.variant === 'win' && h.submitted.length === 0,
        `phase=${s.phase} chain=${s.chain} ×${p.mult} v=${s.last?.vSpeed?.toFixed(1)} score=${s.score} (formula ${formula}) overlay=${h.overlay?.variant}`,
      );
      const before = game.terrain.ys.join();
      const left = s.fuel;
      game.onAction('next');
      const n = game.snapshot();
      check(
        'chain-carries-fuel',
        n.phase === 'flying' && left === 600 && n.fuel === left + TOP_UP && game.terrain.ys.join() !== before && n.pads.length === 3 && h.overlay === null,
        `fuel ${left} -> ${n.fuel} (+${TOP_UP}), terrain regenerated=${game.terrain.ys.join() !== before}`,
      );
      // A second landing adds to the chain total.
      placeOverPad(game, { vy: 5 });
      step(game, 1);
      const s2 = game.snapshot();
      check('chain-total', s2.phase === 'landed' && s2.chain === 2 && s2.score === s.score + s2.last.pad + s2.last.soft, `chain=${s2.chain} score ${s.score} -> ${s2.score}`);
    }
    for (const [name, opts] of [
      ['crash-fast', { vy: 80 }],
      ['crash-drift', { vx: 40 }],
      ['crash-tilt', { a: 0.4 }],
    ]) {
      const { game, h } = flying(Touchdown);
      placeOverPad(game, opts);
      step(game, 1);
      const s = game.snapshot();
      check(name, s.phase === 'over' && s.end === 'crash' && h.submitted.join() === '0' && h.overlay?.variant === 'lose', `${JSON.stringify(opts)} -> phase=${s.phase} end=${s.end} submitted=${h.submitted}`);
    }
    {
      // Soft and level, but beside a pad: any non-pad contact is a crash.
      const { game, h } = flying(Touchdown);
      let x = 20;
      while (terrain.padUnder(game.terrain, x - 12, x + 12) || game.terrain.pads.some((p) => x + 14 > p.x0 && x - 14 < p.x1)) x += 3;
      const ground = Math.max(terrain.groundAt(game.terrain, x - 12), terrain.groundAt(game.terrain, x + 12));
      Object.assign(game.lander, { x, y: Math.min(terrain.groundAt(game.terrain, x - 12), terrain.groundAt(game.terrain, x + 12)) - 14, vx: 0, vy: 5, a: 0 });
      step(game, 2);
      const s = game.snapshot();
      check('crash-off-pad', s.phase === 'over' && s.end === 'crash' && h.submitted.length === 1, `x=${x} ground≈${ground.toFixed(0)} -> phase=${s.phase} end=${s.end}`);
    }
    {
      // After landings, a crash submits the whole chain total.
      const { game, h } = flying(Touchdown);
      placeOverPad(game);
      step(game, 1);
      game.onAction('next');
      placeOverPad(game, { vy: 90 });
      step(game, 1);
      const s = game.snapshot();
      check('crash-submits-chain', s.phase === 'over' && s.chain === 1 && s.score > 0 && h.submitted.join() === String(s.score), `chain=${s.chain} submitted=${h.submitted}`);
    }

    /* ------------------------------ fuel ----------------------------- */
    {
      const { game } = flying(Touchdown);
      game.onKey('ArrowUp', true);
      step(game, 2);
      const used = 1000 - game.snapshot().fuel;
      check('thrust-burns', Math.abs(used - BURN * 2) < 2, `2 s of thrust burned ${used.toFixed(1)} (BURN=${BURN}/s)`);
      game.fuel = 3;
      step(game, 0.5);
      const vy0 = game.snapshot().vy;
      step(game, 1);
      const s = game.snapshot();
      check(
        'thrust-stops-at-zero',
        s.fuel === 0 && Math.abs(s.vy - vy0 - GRAVITY.moon) < 0.5,
        `fuel=${s.fuel}; with the key still held vy rose ${(s.vy - vy0).toFixed(2)} in 1 s (gravity ${GRAVITY.moon})`,
      );
      game.onPause();
      check('pause-releases-thrust', !game.thrusting(), `thrusting after onPause = ${game.thrusting()}`);
    }
    {
      // An empty tank ends the chain at the landing, with that landing scored.
      const { game, h } = flying(Touchdown);
      game.fuel = 0;
      placeOverPad(game);
      step(game, 1);
      const s = game.snapshot();
      check('empty-tank-ends-chain', s.phase === 'over' && s.end === 'dry' && s.chain === 1 && h.submitted.join() === String(s.score) && s.score > 0, `phase=${s.phase} end=${s.end} chain=${s.chain} submitted=${h.submitted}`);
    }

    /* ------------------------------ physics -------------------------- */
    {
      const fall = (gravity) => {
        const { game } = flying(Touchdown, { gravity });
        Object.assign(game.lander, { x: 400, y: 0, vx: 0, vy: 0, a: 0 });
        step(game, 1, 0.05);
        return game.snapshot().vy;
      };
      const [m, ma, e] = ['moon', 'mars', 'earth'].map(fall);
      check('gravity-settings', m < ma && ma < e && Math.abs(e - GRAVITY.earth) < 0.01, `vy after 1 s: moon=${m.toFixed(1)} mars=${ma.toFixed(1)} earth=${e.toFixed(1)}`);
    }
    {
      // HUD: fuel bar and the five stat chips.
      const { game, h } = flying(Touchdown);
      step(game, 0.3);
      const labels = (h.hud.stats ?? []).map((s) => s.label).join();
      check('hud', labels === 'Score,Chain,Alt,VSpd,HSpd' && h.hud.progress?.value <= 1 && h.hud.progress?.value > 0.9, `stats=${labels} fuel=${h.hud.progress?.value?.toFixed(3)}`);
    }
    {
      // An autopilot flies whole chains at the 50 ms dt cap; every state stays finite.
      let landings = 0;
      let nonFinite = 0;
      let games = 0;
      for (let run = 0; run < 6; run++) {
        const { game } = flying(Touchdown, { fuel: 2000 });
        games++;
        for (let f = 0; f < 20 * 60 * 4; f++) {
          const s = game.snapshot();
          if (s.phase === 'landed') {
            landings++;
            if (landings >= 3 * (run + 1)) break;
            game.onAction('next');
          }
          if (s.phase === 'over') break;
          autopilot(game, terrain);
          game.update(0.05);
          if (f % 7 === 0) game.render();
          if (![s.x, s.y, s.vx, s.vy, s.a, s.fuel].every(Number.isFinite)) nonFinite++;
        }
      }
      check('autopilot', landings >= games && nonFinite === 0, `${landings} landings over ${games} runs at dt=50 ms, non-finite frames=${nonFinite}`);
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
    console.log('\nTouchdown checks ok');
  }
}

/**
 * Steers toward the nearest pad above the highest ground on the way, then
 * descends over it: bang-bang thrust on a target vertical speed, tilt to fix
 * horizontal speed, upright for the last stretch.
 */
function autopilot(game, terrain) {
  const l = game.lander;
  const t = game.terrain;
  const pad = t.pads.reduce((a, b) => (Math.abs((b.x0 + b.x1) / 2 - l.x) < Math.abs((a.x0 + a.x1) / 2 - l.x) ? b : a));
  const cx = (pad.x0 + pad.x1) / 2;
  const dx = cx - l.x;
  const over = Math.abs(dx) < (pad.x1 - pad.x0) / 2 - 13;
  let ridge = -Infinity;
  for (let x = Math.min(l.x, cx) - 20; x <= Math.max(l.x, cx) + 20; x += 4) ridge = Math.max(ridge, -terrain.groundAt(t, Math.min(Math.max(x, 0), 800)));
  const clearance = -ridge - (l.y + 12);
  const alt = terrain.groundAt(t, l.x) - (l.y + 12);
  const wantVx = over ? 0 : Math.max(-45, Math.min(45, dx * 0.5));
  const wantVy = over ? (alt > 70 ? 30 : 8) : clearance > 70 ? 15 : -25;
  const tilt = over && alt < 25 ? 0 : Math.max(-0.5, Math.min(0.5, (wantVx - l.vx) * 0.03));
  game.keys.clear();
  if (l.a < tilt - 0.03) game.keys.add('ArrowRight');
  else if (l.a > tilt + 0.03) game.keys.add('ArrowLeft');
  if (l.vy > wantVy || Math.abs(wantVx - l.vx) > 15) game.keys.add('ArrowUp');
}

await main();
