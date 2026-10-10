// Headless checks for Lode Digger: proves every built-in level is well-formed
// and completable by the game's own movement rules, then drives the real game
// class through digging, the beat-timed refill, traps, scoring and a full bot
// playthrough with a mock canvas. Run with `npm run play:lode-digger`; exits
// non-zero on any failure.
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DT = 1 / 60;
const CAP = 0.05; // the engine's dt clamp
const DIR_KEYS = ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];

function mock2d() {
  const noop = () => mock2d;
  const grad = { addColorStop() {} };
  return new Proxy(
    { canvas: { width: 896, height: 512 }, createLinearGradient: () => grad, measureText: () => ({ width: 0 }) },
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
    tones: 0,
    audio: { muted: true, ensure() {}, tone: () => h.tones++, arp() {} },
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

function run(game, seconds, each, dt = DT) {
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
    cacheDir: path.join(os.tmpdir(), 'vite-play-lode-digger'),
    server: { middlewareMode: true },
    appType: 'custom',
  });
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });
  try {
    const L = await vite.ssrLoadModule('/src/games/lode-digger/levels.ts');
    const { LodeDigger } = await vite.ssrLoadModule('/src/games/lode-digger/game.ts');
    const { lodeDiggerManifest } = await vite.ssrLoadModule('/src/games/lode-digger/index.ts');
    const { getGame } = await vite.ssrLoadModule('/src/games/registry.ts');

    /** Start a game on `level` and step through the READY pause. */
    function started(config = {}) {
      const h = host({ startLevel: '1', lives: 5, guardSpeed: 80, refill: 6, ...config });
      const game = new LodeDigger(h);
      game.render();
      if (h.overlay?.variant !== 'menu') throw new Error('expected the title overlay');
      game.onAction('start');
      run(game, 2);
      if (game.snapshot().phase !== 'playing') throw new Error(`start did not begin play (${game.snapshot().phase})`);
      return { game, h };
    }

    /* ----------------------------- levels ---------------------------- */
    {
      const bad = [];
      for (const [i, lv] of L.LEVELS.entries()) {
        const rows = lv.rows;
        const n = (ch) => rows.join('').split(ch).length - 1;
        const shapeOk =
          rows.length === 16 && rows.every((r) => r.length === 28) && n('P') === 1 && n('$') >= 1 && n('S') >= 1;
        if (!shapeOk) bad.push(`level ${i + 1} (${lv.name}): ${rows.length} rows, widths ${[...new Set(rows.map((r) => r.length))]}, P=${n('P')} $=${n('$')} S=${n('S')}`);
      }
      check('levels-shape', L.LEVELS.length >= 5 && bad.length === 0, bad.length ? bad.join(' | ') : `${L.LEVELS.length} levels, each 28 × 16 with one P, gold and an escape`);
    }
    {
      const bad = [];
      for (const [i, lv] of L.LEVELS.entries()) {
        const problems = L.checkLevel(lv);
        if (problems.length) bad.push(`level ${i + 1} (${lv.name}): ${problems.slice(0, 4).join('; ')}`);
      }
      check('levels-completable', bad.length === 0, bad.length ? bad.join(' | ') : 'every $ reachable from P and back, and the top row reachable only via the escape ladder');
    }
    {
      // The checker must have teeth: bury a gold in solid rock, and remove the escape.
      const lv = L.LEVELS[0];
      const gy = lv.rows.findIndex((r) => r.includes('$'));
      const gx = lv.rows[gy].indexOf('$');
      const walled = lv.rows.map((r, y) =>
        [...r].map((ch, x) => (Math.abs(x - gx) + Math.abs(y - gy) === 1 ? '@' : ch)).join(''),
      );
      const noEscape = lv.rows.map((r) => r.replaceAll('S', ' '));
      const a = L.checkLevel({ name: 'walled', rows: walled });
      const b = L.checkLevel({ name: 'no escape', rows: noEscape });
      check('checker-bites', a.length > 0 && b.length > 0, `walled gold -> ${a[0]}; no escape -> ${b[0]}`);
    }

    /* ---------------------------- manifest --------------------------- */
    {
      const want = {
        startLevel: ['select', L.LEVELS.map((_, i) => String(i + 1)).join(','), '1'],
        lives: ['range', 1, 9, 1, 5],
        guardSpeed: ['range', 50, 120, 10, 80],
        refill: ['range', 3, 10, 1, 6],
      };
      const got = Object.fromEntries(
        lodeDiggerManifest.config.map((f) => [
          f.key,
          f.type === 'select' ? [f.type, f.options.map((o) => o.value).join(','), f.default] : [f.type, f.min, f.max, f.step, f.default],
        ]),
      );
      const ok = JSON.stringify(got) === JSON.stringify(want) && lodeDiggerManifest.config.every((f) => f.restart === true);
      check('manifest-config', ok, JSON.stringify(got));
      const pad = JSON.stringify(lodeDiggerManifest.pad);
      check('manifest-pad', pad === JSON.stringify({ west: 'KeyZ', east: 'KeyX', l1: 'KeyZ', r1: 'KeyX', north: 'KeyR' }), pad);
      check('registered', getGame('lode-digger') === lodeDiggerManifest, `getGame('lode-digger') -> ${getGame('lode-digger')?.title}`);
    }

    /* ---------------------------- settings --------------------------- */
    {
      // Read once, in the constructor: start level, lives, guard speed, refill.
      const { game, h } = started({ startLevel: '3', lives: 7, guardSpeed: 120, refill: 9 });
      const s = game.snapshot();
      check(
        'config-applied',
        s.level === 3 && s.lives === 7 && game.guardPct === 120 && game.refillSecs === 9 && h.hud.lives?.max === 7,
        `level=${s.level} lives=${s.lives} guardPct=${game.guardPct} refill=${game.refillSecs}`,
      );
      const labels = (h.hud.stats ?? []).map((x) => x.label).join(',');
      check('hud', labels === 'Gold left,Level,Score,Best', labels);
    }

    /* ----------------------------- digging --------------------------- */
    // Crossroads (level 3) has a brick floor: P stands at (6,14) over brick, with open air to its left.
    function digSetup(config = {}) {
      const r = started({ startLevel: '3', refill: 3, ...config });
      r.game.guards = [];
      return r;
    }
    {
      const { game } = digSetup();
      game.onKey('KeyZ', true);
      game.onKey('KeyZ', true); // keyboard auto-repeat: the key never came up
      game.onKey('KeyZ', true);
      run(game, 0.5);
      const afterHold = game.snapshot().holes.length;
      game.onKey('KeyZ', false);
      game.onKey('KeyZ', true); // a fresh press on the same, already open, hole
      run(game, 0.3);
      const holes = game.snapshot().holes;
      check(
        'dig-once',
        afterHold === 1 && holes.length === 1 && holes[0].x === 5 && holes[0].y === 15,
        `holes after a held dig=${afterHold}, after a re-press=${holes.length} at ${holes.map((h) => `${h.x},${h.y}`)}`,
      );
    }
    {
      // A hole refills after `refill` seconds, on the next beat, with ticks before it.
      const { game, h } = digSetup({ refill: 3 });
      game.onKey('KeyX', true); // dig right: (7,15) under open air at (7,14)
      const hole = game.snapshot().holes[0];
      const tonesBefore = h.tones;
      let closedAt = null;
      run(game, 6, (g) => {
        if (g.snapshot().holes.length === 0) {
          closedAt = g.snapshot().levelTime;
          return false;
        }
      });
      const onBeat = Math.abs(hole.closeAt / 0.5 - Math.round(hole.closeAt / 0.5)) < 1e-9;
      check(
        'refill-on-beat',
        hole && onBeat && closedAt !== null && closedAt >= hole.dugAt + 3 && closedAt < hole.dugAt + 3 + 0.5 + DT && h.tones - tonesBefore >= 4,
        `dug at ${hole?.dugAt.toFixed(3)}s, closes at ${hole?.closeAt}s (beat: ${onBeat}), closed at ${closedAt?.toFixed(3)}s, ${h.tones - tonesBefore} tones`,
      );
    }
    {
      // A guard that falls in is trapped (+75); one still inside at the refill respawns at the top.
      const { game } = digSetup({ refill: 3 });
      game.onKey('KeyZ', true);
      run(game, 0.3);
      game.guards = [{ tx: 5, ty: 13, dir: -1, t: 0, falling: false, state: 'free', hold: 0, gold: true, carry: 99 }];
      const before = game.snapshot().score;
      let trapped = null;
      run(game, 1.5, (g) => {
        const gd = g.snapshot().guards[0];
        if (gd.state === 'trapped') {
          trapped = { ...gd, score: g.snapshot().score };
          g.guards[0].hold = 99; // keep it in, so the refill catches it
          return false;
        }
      });
      const dropped = game.gold[14 * 28 + 5] === 1;
      run(game, 4, (g) => g.snapshot().holes.length > 0); // stop on the refill frame
      const after = game.snapshot().guards[0];
      check(
        'guard-trap-and-respawn',
        trapped && trapped.x === 5 && trapped.y === 15 && trapped.score === before + 75 && dropped && after.y === 0 && after.state === 'free',
        `trapped at ${trapped?.x},${trapped?.y} (+${trapped ? trapped.score - before : '?'}), dropped gold above=${dropped}, after refill at ${after.x},${after.y} ${after.state}`,
      );
    }
    {
      // …and one that is not caught climbs out after its hold time.
      const { game } = digSetup({ refill: 10 });
      game.onKey('KeyZ', true);
      run(game, 0.3);
      game.guards = [{ tx: 5, ty: 13, dir: -1, t: 0, falling: false, state: 'free', hold: 0, gold: false, carry: 0 }];
      game.player.tx = 20; // out of reach, so the guard has somewhere to go
      let left = false;
      run(game, 9, (g) => {
        const gd = g.snapshot().guards[0];
        if (gd.state === 'free' && gd.y <= 14 && gd.x !== 5) {
          left = true;
          return false;
        }
      });
      check('guard-climbs-out', left, `guard ${JSON.stringify(game.snapshot().guards[0])}`);
    }
    {
      // The player caught in a refilling hole loses a life.
      const { game } = digSetup({ refill: 3, lives: 5 });
      game.onKey('KeyZ', true);
      run(game, 0.3);
      Object.assign(game.player, { tx: 5, ty: 15, t: 0, dir: -1, falling: false });
      let dying = false;
      run(game, 5, (g) => {
        if (g.snapshot().phase === 'dying') dying = true;
      });
      const s = game.snapshot();
      check('player-in-hole-dies', dying && s.lives === 4, `dying=${dying} lives=${s.lives} phase=${s.phase}`);
    }

    /* ------------------------- gold and escape ------------------------ */
    {
      const { game, h } = started({ startLevel: '1' });
      game.guards = [];
      const sx = L.LEVELS[0].rows[0].indexOf('S');
      const hiddenClimb = game.terrain.climbable(sx, 1);
      const total = game.snapshot().goldLeft;
      const before = game.snapshot().score;
      // Take all but one piece of gold by hand, then the last one through collectAt.
      const spots = [];
      for (let i = 0; i < game.gold.length; i++) if (game.gold[i]) spots.push(i);
      for (const i of spots.slice(0, -1)) game.collectAt(i % 28, Math.floor(i / 28));
      const stillHidden = !game.snapshot().escapeShown;
      const last = spots.at(-1);
      game.collectAt(last % 28, Math.floor(last / 28));
      const s = game.snapshot();
      check(
        'escape-hidden-until-gold',
        !hiddenClimb && stillHidden && s.escapeShown && game.terrain.climbable(sx, 1) && s.goldLeft === 0 && s.score === before + total * 250 && h.hud.stats[0].value === '0',
        `climbable before=${hiddenClimb}, hidden with 1 left=${stillHidden}, shown after=${s.escapeShown}, score +${s.score - before} for ${total} gold`,
      );
    }
    {
      const { game } = started({});
      game.levelTime = 12.7;
      const before = game.snapshot().score;
      game.levelClear();
      check('clear-bonus', game.snapshot().score - before === 1500 + (600 - 12) * 2, `+${game.snapshot().score - before} at 12.7 s`);
    }
    {
      // R restarts the level and costs a life; the last life ends the game, submitting once.
      const { game, h } = started({ lives: 2 });
      game.collectAt(...firstGold(game));
      const left = game.snapshot().goldLeft;
      game.onKey('KeyR', true);
      game.onKey('KeyR', true); // auto-repeat is not a second restart
      const s1 = game.snapshot();
      game.onKey('KeyR', false);
      run(game, 2);
      game.onKey('KeyR', true);
      game.onKey('KeyR', false);
      const s2 = game.snapshot();
      game.onKey('KeyR', true);
      check(
        'restart-costs-a-life',
        s1.lives === 1 && s1.phase === 'ready' && s1.goldLeft === left + 1 && s2.phase === 'over' && h.submitted.length === 1 && h.submitted[0] === s2.score && h.overlay?.variant === 'lose',
        `lives 2 -> ${s1.lives} (${s1.phase}, gold ${left} -> ${s1.goldLeft}) -> ${s2.lives} (${s2.phase}), submitted ${h.submitted.join(',')}`,
      );
    }
    {
      // Touching a guard costs a life.
      const { game } = started({ lives: 3 });
      const p = game.player;
      game.guards = [{ tx: p.tx, ty: p.ty, dir: -1, t: 0, falling: false, state: 'free', hold: 0, gold: false, carry: 0 }];
      run(game, 2);
      check('guard-kills', game.snapshot().lives === 2, `lives=${game.snapshot().lives} phase=${game.snapshot().phase}`);
    }

    /* ----------------------------- pausing ---------------------------- */
    {
      // Held keys are dropped on pause, and render() draws in every phase.
      const { game } = started({});
      game.onKey('ArrowRight', true);
      game.onPause();
      const x0 = game.snapshot().player.x;
      run(game, 1);
      let threw = null;
      for (const phase of ['menu', 'ready', 'playing', 'dying', 'clear', 'over', 'won']) {
        game.phase = phase;
        try {
          game.render();
        } catch (e) {
          threw = `${phase}: ${e.message}`;
        }
      }
      check('pause-and-render', game.snapshot().player.x === x0 && threw === null, `x ${x0} -> ${game.snapshot().player.x}, render error=${threw}`);
    }

    /* ---------------------------- playthrough --------------------------- */
    {
      // A bot that walks the shortest route to the next gold — then to the top —
      // clears every level at the 50 ms dt cap, never standing inside a wall.
      const { game, h } = started({ startLevel: '1', lives: 9 });
      const cleared = [];
      let inWall = 0;
      let held = null;
      let frames = 0;
      let level = 1;
      for (; frames < 20 * 60 * 5 && !['won', 'over'].includes(game.snapshot().phase); frames++) {
        const s = game.snapshot();
        if (s.level !== level) {
          cleared.push(level);
          level = s.level;
        }
        game.guards = [];
        if (s.phase === 'playing') {
          const d = botDir(game, L);
          const code = d >= 0 ? DIR_KEYS[d] : null;
          if (code !== held) {
            if (held) game.onKey(held, false);
            if (code) game.onKey(code, true);
            held = code;
          }
        }
        game.update(CAP);
        if (frames % 7 === 0) game.render();
        const c = game.cellOf(game.player);
        if (game.blocked(c.x, c.y)) inWall++;
      }
      const s = game.snapshot();
      if (s.phase === 'won') cleared.push(level);
      check(
        'bot-clears-every-level',
        s.phase === 'won' && cleared.length === L.LEVELS.length && inWall === 0 && h.submitted.length === 1 && Number.isInteger(s.score) && s.score >= 0,
        `${(frames * CAP).toFixed(0)} s: phase=${s.phase} cleared=${cleared.join(',')} score=${s.score} submitted=${h.submitted.join(',')} inWall=${inWall}`,
      );
    }
    {
      // With the guards live and at full speed, nobody ever ends up inside brick
      // or rock, however long they chase.
      const bad = [];
      for (let lv = 1; lv <= L.LEVELS.length; lv++) {
        const { game } = started({ startLevel: String(lv), guardSpeed: 120, lives: 9 });
        for (let f = 0; f < 60 * 20; f++) {
          if (game.snapshot().phase === 'playing' && f % 40 === 0) {
            for (const k of DIR_KEYS) game.onKey(k, false);
            game.onKey(DIR_KEYS[Math.floor(Math.random() * 4)], true);
          }
          game.update(CAP);
          for (const a of [game.player, ...game.guards]) {
            const c = game.cellOf(a);
            if (game.blocked(c.x, c.y) && !(a.state === 'trapped')) bad.push(`level ${lv}: actor in wall at ${c.x},${c.y}`);
          }
          if (['over', 'won'].includes(game.snapshot().phase)) break;
        }
        const sc = game.snapshot().score;
        if (!Number.isInteger(sc) || sc < 0) bad.push(`level ${lv}: score ${sc}`);
      }
      check('no-tunnelling', bad.length === 0, bad.length ? bad.slice(0, 3).join(' | ') : 'player and guards stayed out of brick and rock on every level at the dt cap');
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
    console.log('\nLode Digger checks ok');
  }
}

function firstGold(game) {
  const i = game.gold.findIndex((v) => v === 1);
  return [i % 28, Math.floor(i / 28)];
}

/**
 * First step of a breadth-first walk — by the game's own rules — to the
 * nearest gold, or to the top row once the escape is showing. Planned from the
 * tile the player is about to reach.
 */
function botDir(game, L) {
  const { COLS, DX, DY } = L;
  const p = game.player;
  const start = p.dir >= 0 && p.t > 0 ? { x: p.tx + DX[p.dir], y: p.ty + DY[p.dir] } : { x: p.tx, y: p.ty };
  const goal = (x, y) => (game.escapeShown ? y === 0 : game.gold[y * COLS + x] === 1);
  const first = new Map([[start.y * COLS + start.x, -1]]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const q = queue[head];
    const f = first.get(q.y * COLS + q.x);
    if (goal(q.x, q.y)) return head === 0 ? p.dir : f;
    for (let d = 0; d < 4; d++) {
      if (!L.canStep(game.terrain, q.x, q.y, d)) continue;
      const nx = q.x + DX[d];
      const ny = q.y + DY[d];
      if (first.has(ny * COLS + nx)) continue;
      first.set(ny * COLS + nx, head === 0 ? d : f);
      queue.push({ x: nx, y: ny });
    }
  }
  return -1;
}

await main();
