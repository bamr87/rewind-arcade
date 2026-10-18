// Headless checks for Silo Sentinel: drives the real game class through its
// rules with a mock canvas: silo selection, blast kills, the wave bonus and the
// city-count multiplier, game over, wind, and keyboard-repeat suppression.
// Run with `npm run play:silo-sentinel`; exits non-zero on any failure.
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DT = 1 / 60;

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

function run(game, seconds, dt = DT) {
  for (let i = 0; i < Math.ceil(seconds / dt); i++) {
    game.update(dt);
    if (i % 10 === 0) game.render();
  }
}

/** A started wave with nothing scheduled, so a check controls every entity. */
function quiet(SiloSentinel, config = {}) {
  const h = host({ startWave: 1, ammo: 10, speed: 100, wind: false, ...config });
  const game = new SiloSentinel(h);
  game.render();
  if (h.overlay?.variant !== 'menu') throw new Error('expected the title overlay');
  game.onAction('start');
  if (game.snapshot().phase !== 'playing') throw new Error('start did not begin a wave');
  game.queue = [];
  return { game, h };
}

const tap = (x, y) => ({ x, y, button: 0, pointerType: 'mouse' });
const hudStat = (h, label) => h.hud.stats?.find((s) => s.label === label)?.value;

async function main() {
  const vite = await createServer({
    root,
    configFile: false,
    cacheDir: path.join(os.tmpdir(), 'vite-play-silo-sentinel'),
    server: { middlewareMode: true },
    appType: 'custom',
  });
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });
  try {
    const mod = await vite.ssrLoadModule('/src/games/silo-sentinel/game.ts');
    const { SiloSentinel, SILO_X, CITY_X, GROUND, WARHEAD_POINTS } = mod;
    const { siloSentinelManifest } = await vite.ssrLoadModule('/src/games/silo-sentinel/index.ts');
    const { getGame } = await vite.ssrLoadModule('/src/games/registry.ts');

    /* ---------------------------- manifest --------------------------- */
    {
      const by = Object.fromEntries(siloSentinelManifest.config.map((f) => [f.key, f]));
      const r = (k) => [by[k]?.type, by[k]?.min, by[k]?.max, by[k]?.step, by[k]?.default];
      const ok =
        Object.keys(by).join() === 'startWave,ammo,speed,wind' &&
        JSON.stringify(r('startWave')) === JSON.stringify(['range', 1, 10, 1, 1]) &&
        JSON.stringify(r('ammo')) === JSON.stringify(['range', 6, 15, 1, 10]) &&
        JSON.stringify(r('speed')) === JSON.stringify(['range', 50, 150, 10, 100]) && by.speed.unit === '%' &&
        by.wind.type === 'toggle' && by.wind.default === false &&
        siloSentinelManifest.cursor === 'crosshair' &&
        JSON.stringify(siloSentinelManifest.pad) === JSON.stringify({ south: 'KeyF', east: 'KeyF', r1: 'KeyF', r2: 'KeyF' });
      check('manifest-config', ok, `${Object.keys(by)} cursor=${siloSentinelManifest.cursor} pad=${JSON.stringify(siloSentinelManifest.pad)}`);
      check('registered', getGame('silo-sentinel') === siloSentinelManifest, `getGame('silo-sentinel') -> ${getGame('silo-sentinel')?.title}`);
    }

    /* ------------------------- silo selection ------------------------ */
    {
      const { game } = quiet(SiloSentinel, { ammo: 6 });
      const fired = [];
      game.onPointerDown(tap(120, 200)); // nearest is the left silo
      fired.push(game.snapshot().ammo.join('/'));
      game.ammo[0] = 0;
      game.onPointerDown(tap(120, 200)); // left is empty -> middle
      fired.push(game.snapshot().ammo.join('/'));
      game.onPointerDown(tap(235, 200)); // left is still empty -> middle again
      fired.push(game.snapshot().ammo.join('/'));
      const tie = quiet(SiloSentinel).game;
      tie.onPointerDown(tap(235, 200)); // exactly between left (70) and middle (400): ties go left
      game.ammo = [0, 0, 0];
      const before = game.snapshot().missiles.length;
      game.onPointerDown(tap(600, 200));
      const after = game.snapshot();
      check(
        'nearest-silo',
        fired.join() === '5/6/6,0/5/6,0/4/6' && tie.snapshot().ammo.join('/') === '9/10/10' && after.missiles.length === before && after.ammo.join() === '0,0,0',
        `fired ${fired.join(' then ')}; tie -> ${tie.snapshot().ammo.join('/')}; all empty -> missiles ${before} -> ${after.missiles.length}`,
      );
      const ground = quiet(SiloSentinel).game;
      ground.onPointerDown(tap(400, GROUND - 10));
      check('ground-click-ignored', ground.snapshot().ammo.join('/') === '10/10/10', `click on the ground -> ammo ${ground.snapshot().ammo.join('/')}`);
    }

    /* ----------------------------- blasts ---------------------------- */
    {
      // A blast placed on a warhead's path destroys it for 25 × multiplier.
      const { game, h } = quiet(SiloSentinel);
      game.mult = 3;
      game.warheads.push({ x0: 400, y0: 0, x: 400, y: 100, tx: 400, vx: 0, vy: 40, target: 0 });
      game.blasts.push({ x: 400, y: 140, t: 0, scale: 1 });
      game.queue = [0, 0]; // keep the wave open
      game.clock = -100;
      run(game, 1);
      const s = game.snapshot();
      check('blast-kills', s.warheads === 0 && s.score === WARHEAD_POINTS * 3 && hudStat(h, 'Score') === '75', `warheads=${s.warheads} score=${s.score} (want ${WARHEAD_POINTS * 3})`);
    }
    {
      // End to end: fire at a point on the warhead's path; the counter-blast kills it.
      const { game } = quiet(SiloSentinel);
      game.warheads.push({ x0: 400, y0: 0, x: 400, y: 60, tx: 400, vx: 0, vy: 40, target: 0 });
      game.queue = [0];
      game.clock = -100;
      game.onPointerDown(tap(400, 120));
      run(game, 1.6);
      const s = game.snapshot();
      check('fire-and-kill', s.warheads === 0 && s.score === WARHEAD_POINTS && s.ammo[1] === 9, `warheads=${s.warheads} score=${s.score} ammo=${s.ammo.join('/')}`);
    }
    {
      // Chain reaction: one blast takes out a warhead, whose burst takes out its neighbour.
      const { game } = quiet(SiloSentinel);
      game.warheads.push({ x0: 300, y0: 0, x: 300, y: 200, tx: 300, vx: 0, vy: 0, target: 0 });
      // 50 px from the first blast (out of its 40 px reach), 20 px from the warhead it kills.
      game.warheads.push({ x0: 320, y0: 0, x: 320, y: 200, tx: 320, vx: 0, vy: 0, target: 1 });
      game.blasts.push({ x: 270, y: 200, t: 0, scale: 1 });
      game.queue = [0];
      game.clock = -100;
      run(game, 1.2);
      check('chain-reaction', game.snapshot().warheads === 0 && game.snapshot().score === 2 * WARHEAD_POINTS, `warheads left=${game.snapshot().warheads} score=${game.snapshot().score}`);
    }

    /* ---------------------- wave end + multiplier -------------------- */
    {
      const { game, h } = quiet(SiloSentinel, { startWave: 5 });
      const firstMult = hudStat(h, '×Mult');
      game.cities[1] = false;
      game.cities[4] = false; // k = 4
      game.ammo = [3, 0, 2]; // a = 5
      game.mult = 2;
      game.score = 100;
      game.update(DT);
      const s = game.snapshot();
      const rows = h.overlay?.rows?.map((r) => r.label).join(' | ');
      const bonusOk = s.phase === 'summary' && s.score === 100 + (100 * 4 + 5 * 5) * 2 && h.overlay?.variant === 'win' && h.overlay.rows?.length >= 4;
      game.onAction('next');
      const n = game.snapshot();
      check('first-wave-x1', firstMult === '×1', `startWave=5 first wave multiplier ${firstMult}`);
      check(
        'wave-bonus-and-multiplier',
        bonusOk && n.phase === 'playing' && n.wave === 6 && hudStat(h, '×Mult') === '×4' && n.ammo.join('/') === '10/10/10',
        `bonus ${s.score - 100} (want ${(400 + 25) * 2}); rows: ${rows}; next wave ${n.wave} HUD ${hudStat(h, '×Mult')} ammo ${n.ammo.join('/')}`,
      );
      // One city left -> ×1, never ×0.
      game.queue = [];
      game.cities = CITY_X.map((_, i) => i === 0);
      game.update(DT);
      game.onAction('next');
      check('multiplier-floor', hudStat(h, '×Mult') === '×1', `1 city standing -> HUD ${hudStat(h, '×Mult')}`);
    }

    /* ---------------------------- game over -------------------------- */
    {
      const { game, h } = quiet(SiloSentinel);
      game.score = 321;
      game.cities = CITY_X.map((_, i) => i === 2);
      game.warheads.push({ x0: CITY_X[2], y0: 0, x: CITY_X[2], y: GROUND - 1, tx: CITY_X[2], vx: 0, vy: 60, target: 2 });
      game.queue = [0];
      game.clock = -100;
      run(game, 0.5);
      run(game, 1);
      const s = game.snapshot();
      check('game-over', s.phase === 'over' && s.cities === 0 && h.overlay?.variant === 'lose' && h.submitted.join() === '321', `phase=${s.phase} cities=${s.cities} overlay=${h.overlay?.variant} submitted=[${h.submitted}]`);
      // A silo hit loses that silo's ammo for the wave.
      const { game: g2 } = quiet(SiloSentinel);
      g2.warheads.push({ x0: SILO_X[1], y0: 0, x: SILO_X[1], y: GROUND - 1, tx: SILO_X[1], vx: 0, vy: 60, target: CITY_X.length + 1 });
      g2.queue = [0];
      g2.clock = -100;
      run(g2, 0.2);
      check('silo-hit', g2.snapshot().ammo.join('/') === '10/0/10' && g2.snapshot().cities === 6, `ammo after a silo hit ${g2.snapshot().ammo.join('/')}`);
    }

    /* ------------------------------ wind ----------------------------- */
    {
      const drift = (wind) => {
        const { game, h } = quiet(SiloSentinel, { wind });
        game.blasts.push({ x: 400, y: 200, t: 0, scale: 1 });
        game.queue = [0];
        game.clock = -100;
        const x0 = game.snapshot().blasts[0].x;
        run(game, 1);
        return { dx: game.snapshot().blasts[0].x - x0, wind: game.snapshot().wind, hud: hudStat(h, 'Wind') };
      };
      const on = drift(true);
      const off = drift(false);
      check(
        'wind',
        Math.abs(on.dx) > 15 && Math.abs(on.dx - on.wind) < 0.5 && on.hud && off.dx === 0 && off.hud === undefined,
        `wind on: blast moved ${on.dx.toFixed(1)} px in 1 s (wind ${on.wind.toFixed(1)}, HUD "${on.hud}"); off: ${off.dx}`,
      );
    }

    /* --------------------------- keyboard ---------------------------- */
    {
      const { game } = quiet(SiloSentinel);
      for (let i = 0; i < 5; i++) game.onKey('KeyF', true); // OS auto-repeat
      const held = game.snapshot().missiles.length;
      game.onKey('KeyF', false);
      game.onKey('KeyF', true);
      const again = game.snapshot().missiles.length;
      game.onKey('KeyF', false);
      check('repeat-fires-once', held === 1 && again === 2, `5 repeats -> ${held} shot(s); release + press -> ${again}`);
      const r0 = { ...game.reticle };
      game.onKey('ArrowRight', true);
      game.onKey('KeyW', true);
      run(game, 0.25);
      game.onKey('ArrowRight', false);
      game.onKey('KeyW', false);
      game.onKey('KeyK', true);
      const m = game.snapshot().missiles.at(-1);
      check('crosshair-keys', game.reticle.x > r0.x + 80 && game.reticle.y < r0.y - 80 && Math.abs(m.tx - game.reticle.x) < 0.01, `reticle ${r0.x},${r0.y} -> ${game.reticle.x.toFixed(0)},${game.reticle.y.toFixed(0)}; K fired at ${m.tx.toFixed(0)},${m.ty.toFixed(0)}`);
      game.onKey('KeyF', true);
      game.onPause();
      game.onKey('KeyF', true);
      check('pause-releases-keys', game.snapshot().missiles.length === 5, `after pause a fresh press fires: missiles=${game.snapshot().missiles.length}`);
    }

    /* --------------------------- playthrough ------------------------- */
    {
      // A bot that fires ahead of the lowest warhead plays whole waves at the
      // 50 ms dt cap, and waves advance with the multiplier from the cities.
      const h = host({ startWave: 1, ammo: 10, speed: 100, wind: true });
      const game = new SiloSentinel(h);
      game.onAction('start');
      let waves = 0;
      let cool = 0;
      let bad = 0;
      for (let f = 0; f < 20 * 60 * 6 && game.snapshot().phase !== 'over' && waves < 4; f++) {
        const s = game.snapshot();
        if (s.phase === 'summary') {
          waves++;
          game.onAction('next');
          if (hudStat(h, '×Mult') !== `×${Math.max(1, s.cities)}`) bad++;
          continue;
        }
        cool -= 0.05;
        const targets = game.warheads.filter((w) => !game.missiles.some((m) => Math.abs(m.tx - w.x) < 30 && Math.abs(m.ty - w.y) < 60));
        const low = targets.sort((a, b) => b.y - a.y)[0];
        if (low && cool <= 0 && low.y > 120) {
          const lead = 0.7;
          game.onPointerDown(tap(low.x + low.vx * lead, Math.min(low.y + low.vy * lead, 480)));
          cool = 0.35;
        }
        game.update(0.05);
        if (f % 7 === 0) game.render();
      }
      const s = game.snapshot();
      check('bot-playthrough', waves >= 2 && bad === 0 && (s.phase !== 'over' || h.submitted.length === 1), `${waves} waves cleared, wave=${s.wave} cities=${s.cities} score=${s.score} phase=${s.phase} badMult=${bad}`);
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
    console.log('\nSilo Sentinel checks ok');
  }
}

await main();
