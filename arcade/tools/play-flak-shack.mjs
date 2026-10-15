// Headless checks for Flak Shack: drives the real game class through its rules
// with a mock canvas that records every colour drawn. Run with
// `npm run play:flak-shack`; exits non-zero on any failure.
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DT = 1 / 60;

/** A 2D context that accepts every call and remembers each fill/stroke colour set. */
function mock2d(colours) {
  const noop = () => undefined;
  return new Proxy(
    { canvas: { width: 640, height: 400 }, measureText: () => ({ width: 0 }) },
    {
      get(target, prop) {
        return prop in target ? target[prop] : noop;
      },
      set(target, prop, value) {
        if (prop === 'fillStyle' || prop === 'strokeStyle') colours.add(String(value).toLowerCase());
        target[prop] = value;
        return true;
      },
    },
  );
}

function host(config) {
  let best = 0;
  const h = {
    colours: new Set(),
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
  h.ctx = mock2d(h.colours);
  return h;
}

function run(game, seconds, each, dt = DT) {
  for (let i = 0; i < Math.ceil(seconds / dt); i++) {
    if (each && each(game) === false) return;
    game.update(dt);
    if (i % 10 === 0) game.render();
  }
}

/** A started game with nothing in the sky and no spawns pending. */
function quiet(FlakShack, config = {}) {
  const h = host({ palette: 'cga1', spawn: 5, jets: false, ...config });
  const game = new FlakShack(h);
  game.render();
  if (h.overlay?.variant !== 'menu') throw new Error('expected the title overlay');
  game.onAction('start');
  if (game.snapshot().phase !== 'playing') throw new Error('start did not begin play');
  game.heliTimer = 1e9;
  game.jetTimer = 1e9;
  return { game, h };
}

/** Fire one shot, then step until the cooldown has passed. */
function shoot(game, code = 'KeyF') {
  game.onKey(code, true);
  game.onKey(code, false);
  game.update(0.15);
}

async function main() {
  const vite = await createServer({
    root,
    configFile: false,
    cacheDir: path.join(os.tmpdir(), 'vite-play-flak-shack'),
    server: { middlewareMode: true },
    appType: 'custom',
  });
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });
  try {
    const { FlakShack, PALETTES } = await vite.ssrLoadModule('/src/games/flak-shack/game.ts');
    const { flakShackManifest: m } = await vite.ssrLoadModule('/src/games/flak-shack/index.ts');
    const { getGame } = await vite.ssrLoadModule('/src/games/registry.ts');

    /* ---------------------------- manifest --------------------------- */
    {
      const f = Object.fromEntries(m.config.map((c) => [c.key, c]));
      const ok =
        f.palette?.type === 'select' &&
        f.palette.default === 'cga1' &&
        f.palette.options.map((o) => o.value).join(',') === 'cga1,cga0,mono' &&
        f.spawn?.type === 'range' && f.spawn.min === 1 && f.spawn.max === 10 && f.spawn.step === 1 && f.spawn.default === 5 &&
        f.jets?.type === 'toggle' && f.jets.default === false &&
        m.config.length === 3 && m.config.every((c) => c.restart === true);
      check('manifest-config', ok, JSON.stringify(m.config.map((c) => [c.key, c.type, c.default])));
      check(
        'manifest-meta',
        m.id === 'flak-shack' && m.year === '1982' && m.icon === '🪂' &&
          JSON.stringify(m.pad) === JSON.stringify({ south: 'KeyF', east: 'KeyF', r1: 'KeyF', r2: 'KeyF' }),
        `id=${m.id} year=${m.year} pad=${JSON.stringify(m.pad)}`,
      );
      check('registered', getGame('flak-shack') === m, `getGame('flak-shack') -> ${getGame('flak-shack')?.title}`);
    }

    /* ------------------------------ input ---------------------------- */
    {
      // Only F and K fire. Space (and every other key) never does, even if a host forwarded it.
      const { game } = quiet(FlakShack);
      const ignored = ['Space', 'Enter', 'Escape', 'KeyP', 'KeyJ', 'KeyW', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'];
      for (const code of ignored) shoot(game, code);
      const afterIgnored = game.snapshot().shotsFired;
      shoot(game, 'KeyF');
      shoot(game, 'KeyK');
      const s = game.snapshot();
      check('fire-keys', afterIgnored === 0 && s.shotsFired === 2, `ignored keys fired ${afterIgnored}, F+K fired ${s.shotsFired - afterIgnored}`);
    }
    {
      // Rotation is clamped above the horizon on both sides.
      const { game } = quiet(FlakShack);
      game.onKey('ArrowLeft', true);
      run(game, 3);
      const left = game.snapshot().angle;
      game.onKey('ArrowLeft', false);
      game.onKey('KeyD', true);
      run(game, 3);
      const right = game.snapshot().angle;
      check('rotate-clamped', left < -Math.PI + 0.2 && left >= -Math.PI + 0.12 && right > -0.2 && right <= -0.12, `left=${left.toFixed(3)} right=${right.toFixed(3)}`);
    }

    /* ----------------------------- scoring --------------------------- */
    {
      // N misses against an empty sky: each costs 1, floored at 0.
      const { game, h } = quiet(FlakShack);
      const N = 12;
      for (let i = 0; i < N; i++) shoot(game);
      const s = game.snapshot();
      const hudScore = h.hud.stats?.find((x) => x.label === 'Score')?.value;
      check('score-floor', s.shotsFired === N && s.score === Math.max(0, -N) && hudScore === '0', `fired ${s.shotsFired}, score=${s.score}, hud=${hudScore}`);
      check(
        'hud-stats',
        h.hud.stats?.map((x) => x.label).join('|') === 'Score|Landed L/R|Best',
        h.hud.stats?.map((x) => `${x.label}=${x.value}`).join(' '),
      );
    }
    {
      // A helicopter is +10, a trooper +5, minus the shot that hit it.
      const { game } = quiet(FlakShack);
      game.score = 20;
      game.helis.push({ x: 320, y: 300, vx: 0, drops: [], t: 0 });
      shoot(game);
      const afterHeli = game.snapshot();
      game.troopers.push({ x: 320, y: 300, vy: 0, state: 'chute', t: 1 });
      game.update(0);
      shoot(game);
      const afterTrooper = game.snapshot();
      check(
        'score-values',
        afterHeli.score === 29 && afterHeli.helis === 0 && afterTrooper.score === 33 && afterTrooper.troopers.length === 0,
        `20 -1 +10 = ${afterHeli.score}; -1 +5 = ${afterTrooper.score}`,
      );
    }

    /* ---------------------------- troopers --------------------------- */
    {
      // Shooting a chute drops the trooper; it lands on the one standing below and both go.
      const { game } = quiet(FlakShack);
      game.angle = Math.atan2(240 - 354, 200 - 320); // aim at the canopy above x=200
      game.troopers.push({ x: 200, y: 380, vy: 0, state: 'landed', t: 0 });
      const cx = 320 + Math.cos(game.angle) * 160;
      const cy = 354 + Math.sin(game.angle) * 160;
      game.troopers.push({ x: cx, y: cy + 22, vy: 0, state: 'chute', t: 1 });
      game.troopers[0].x = cx; // stand the landed trooper right underneath
      game.onKey('KeyF', true);
      let plummeted = false;
      run(game, 4, (g) => {
        if (g.snapshot().troopers.some((t) => t.state === 'plummet')) plummeted = true;
      });
      const s = game.snapshot();
      check('chute-crush', plummeted && s.troopers.length === 0 && s.landed.L === 0, `plummeted=${plummeted} troopers left=${s.troopers.length} landedL=${s.landed.L}`);
    }
    {
      // A trooper on an intact chute lands and is counted on its side.
      const { game } = quiet(FlakShack);
      game.troopers.push({ x: 100, y: 300, vy: 0, state: 'chute', t: 1 });
      game.troopers.push({ x: 520, y: 300, vy: 0, state: 'chute', t: 1 });
      run(game, 4);
      const s = game.snapshot();
      check('lands', s.landed.L === 1 && s.landed.R === 1, `landed L=${s.landed.L} R=${s.landed.R}`);
    }
    {
      // Four landed on one side: storm, then game over with the score submitted once.
      const { game, h } = quiet(FlakShack);
      game.score = 42;
      for (const x of [40, 90, 140, 200]) game.troopers.push({ x, y: 380, vy: 0, state: 'landed', t: 0 });
      game.update(DT);
      const storming = game.snapshot().phase;
      run(game, 3);
      const s = game.snapshot();
      check(
        'storm-game-over',
        storming === 'storm' && s.phase === 'over' && h.overlay?.variant === 'lose' && h.submitted.length === 1 && h.submitted[0] === 42,
        `phase ${storming} -> ${s.phase}, overlay=${h.overlay?.variant}, submitted=${h.submitted.join(',')}`,
      );
      // Three on a side is not enough.
      const q = quiet(FlakShack);
      for (const x of [40, 90, 140]) q.game.troopers.push({ x, y: 380, vy: 0, state: 'landed', t: 0 });
      for (const x of [420, 500, 600]) q.game.troopers.push({ x, y: 380, vy: 0, state: 'landed', t: 0 });
      run(q.game, 3);
      check('three-is-safe', q.game.snapshot().phase === 'playing', `3+3 landed -> ${q.game.snapshot().phase}`);
    }

    /* ------------------------------ jets ----------------------------- */
    {
      const off = quiet(FlakShack, { jets: false, spawn: 10 });
      off.game.heliTimer = 0;
      off.game.jetTimer = 0;
      let maxJets = 0;
      run(off.game, 120, (g) => {
        maxJets = Math.max(maxJets, g.snapshot().jets);
        if (g.snapshot().phase !== 'playing') g.onAction('start');
      }, 0.05);
      check('jets-off', maxJets === 0 && off.game.snapshot().jetsSeen === 0, `jets seen with jets:false = ${off.game.snapshot().jetsSeen}`);

      const on = quiet(FlakShack, { jets: true });
      on.game.jetTimer = 0;
      let bombed = false;
      run(on.game, 6, (g) => {
        if (g.snapshot().bombs > 0) bombed = true;
        return g.snapshot().phase === 'playing';
      });
      const s = on.game.snapshot();
      check(
        'jets-bomb-ends',
        s.jetsSeen === 1 && bombed && s.phase === 'over' && on.h.submitted.length === 1 && on.h.overlay?.kicker === 'Direct hit',
        `jetsSeen=${s.jetsSeen} bombed=${bombed} phase=${s.phase} kicker=${on.h.overlay?.kicker}`,
      );

      const shot = quiet(FlakShack, { jets: true });
      shot.game.score = 10;
      shot.game.bombs.push({ x: 320, y: 300, vx: 0, vy: 0 });
      shoot(shot.game);
      shot.game.jets.push({ x: 320, y: 300, vx: 0, dropped: true });
      shoot(shot.game);
      const t = shot.game.snapshot();
      check('jets-scoring', t.bombs === 0 && t.jets === 0 && t.score === 10 - 1 + 0 - 1 + 10, `bomb +0, jet +10: score=${t.score}`);
    }

    /* ---------------------------- palettes --------------------------- */
    {
      const seen = [];
      let ok = true;
      const detail = [];
      for (const key of ['cga1', 'cga0', 'mono']) {
        const want = new Set(Object.values(PALETTES[key]).map((c) => c.toLowerCase()));
        const { game, h } = quiet(FlakShack, { palette: key, jets: true, spawn: 10 });
        game.heliTimer = 0;
        game.jetTimer = 0;
        // Populate the sky with every kind of thing that can be drawn.
        game.troopers.push({ x: 100, y: 380, vy: 0, state: 'landed', t: 0 });
        game.troopers.push({ x: 150, y: 200, vy: 0, state: 'plummet', t: 0 });
        game.bombs.push({ x: 200, y: 100, vx: 0, vy: 0 });
        game.burst(300, 200, 10);
        game.onKey('KeyF', true);
        run(game, 3, (g) => {
          g.onKey('KeyF', true);
          g.onKey('KeyF', false);
        });
        game.render();
        const extra = [...h.colours].filter((c) => !want.has(c));
        seen.push([...h.colours].sort().join(','));
        if (extra.length || h.colours.size !== 4) ok = false;
        detail.push(`${key}: ${h.colours.size} colours${extra.length ? ` (+${extra.join(',')})` : ''}`);
      }
      check('palettes-4-colour', ok && new Set(seen).size === 3, detail.join('; '));
    }

    /* --------------------------- bot playthrough --------------------- */
    {
      // A bot that aims at the lowest target plays whole games at the 50 ms dt cap.
      const { game, h } = quiet(FlakShack, { spawn: 7, jets: true });
      game.heliTimer = 0;
      game.jetTimer = 3;
      let frames = 0;
      let peak = 0;
      for (; frames < 20 * 60 * 3 && game.snapshot().phase !== 'over'; frames++) {
        const targets = [
          ...game.bombs,
          ...game.troopers.filter((t) => t.state !== 'landed').map((t) => ({ x: t.x, y: t.y - 6, vy: t.vy })),
          ...game.helis,
        ];
        targets.sort((a, b) => b.y - a.y);
        const tgt = targets[0];
        game.onKey('ArrowLeft', false);
        game.onKey('ArrowRight', false);
        if (tgt) {
          // Lead the target by the shot's flight time.
          const lead = Math.hypot(tgt.x - 320, tgt.y - 354) / 520;
          const want = Math.atan2(tgt.y + (tgt.vy ?? 0) * lead - 354, tgt.x + (tgt.vx ?? 0) * lead - 320);
          // The gun turns 0.13 rad per 50 ms frame, so the dead band must be wider than that.
          if (want < game.angle - 0.08) game.onKey('ArrowLeft', true);
          else if (want > game.angle + 0.08) game.onKey('ArrowRight', true);
          else game.onKey('KeyF', true);
        }
        game.update(0.05);
        if (frames % 7 === 0) game.render();
        peak = Math.max(peak, game.snapshot().score);
      }
      const s = game.snapshot();
      check(
        'bot-playthrough',
        peak > 50 && (s.phase !== 'over' || h.submitted.length === 1),
        `${(frames * 0.05).toFixed(0)} s: phase=${s.phase} score=${s.score} peak=${peak} fired=${s.shotsFired} landed=${s.landed.L}/${s.landed.R}`,
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
    console.log('\nFlak Shack checks ok');
  }
}

await main();
