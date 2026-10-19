// Headless checks for Blockfall: drives the real game class through its rules with a
// mock canvas, then lets a bot play it at the 50 ms dt cap. Run with
// `npm run play:blockfall`; exits non-zero on any failure.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DT = 1 / 60;

/** A 2D context that accepts every call. */
function mock2d() {
  const noop = () => undefined;
  return new Proxy(
    { canvas: { width: 520, height: 640 }, measureText: () => ({ width: 0 }) },
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

/** A started game. */
function started(Blockfall, config = {}) {
  const h = host({ startLevel: 1, ghost: true, phosphor: true, randomizer: 'bag', ...config });
  const game = new Blockfall(h);
  game.render();
  if (h.overlay?.variant !== 'menu') throw new Error('expected the title overlay');
  game.onAction('start');
  if (game.snapshot().phase !== 'playing') throw new Error('start did not begin play');
  return { game, h };
}

const tap = (game, code) => {
  game.onKey(code, true);
  game.onKey(code, false);
};

/** Fill board rows (0 = top) completely, leaving the listed columns open. */
function fillRows(game, COLS, rows, open) {
  for (const r of rows) for (let c = 0; c < COLS; c++) game.board[r * COLS + c] = open.includes(c) ? 0 : 1;
}

async function main() {
  const vite = await createServer({
    root,
    configFile: false,
    cacheDir: path.join(os.tmpdir(), 'vite-play-blockfall'),
    server: { middlewareMode: true },
    appType: 'custom',
  });
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });
  try {
    const bf = await vite.ssrLoadModule('/src/games/blockfall/game.ts');
    const { Blockfall, COLS, ROWS, SHAPES, KINDS, fits, gravityInterval, DAS, ARR, LOCK_DELAY, PHOSPHOR_LIFE } = bf;
    const { blockfallManifest: m } = await vite.ssrLoadModule('/src/games/blockfall/index.ts');
    const { getGame } = await vite.ssrLoadModule('/src/games/registry.ts');

    /* ---------------------------- manifest --------------------------- */
    {
      const f = Object.fromEntries(m.config.map((c) => [c.key, c]));
      const ok =
        m.config.length === 4 &&
        f.startLevel?.type === 'range' && f.startLevel.min === 1 && f.startLevel.max === 15 && f.startLevel.step === 1 && f.startLevel.default === 1 &&
        f.ghost?.type === 'toggle' && f.ghost.default === true &&
        f.phosphor?.type === 'toggle' && f.phosphor.default === true &&
        f.randomizer?.type === 'select' && f.randomizer.default === 'bag' &&
        f.randomizer.options.map((o) => o.value).join(',') === 'bag,random' &&
        m.config.every((c) => c.restart === true);
      check('manifest-config', ok, JSON.stringify(m.config.map((c) => [c.key, c.type, c.default])));
      check(
        'manifest-meta',
        m.id === 'blockfall' && m.year === '1984' && m.icon === '🧱' &&
          JSON.stringify(m.pad) === JSON.stringify({ south: 'KeyX', east: 'KeyZ', west: 'KeyC' }),
        `id=${m.id} year=${m.year} pad=${JSON.stringify(m.pad)}`,
      );
      check('registered', getGame('blockfall') === m, `getGame('blockfall') -> ${getGame('blockfall')?.title}`);
    }

    /* ------------------------------ seam ----------------------------- */
    {
      const dir = path.join(root, 'src/games/blockfall');
      const src = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
      const imports = [...src.matchAll(/from '([^']+)'/g)].map((x) => x[1]);
      const bad = imports.filter((s) => !s.startsWith('../../engine/') && !s.startsWith('./'));
      const sysKeys = src.match(/'(Space|Enter|Escape|KeyP)'/g) ?? [];
      check('engine-only-imports', bad.length === 0, `imports: ${[...new Set(imports)].join(', ')}`);
      check('no-system-keys', sysKeys.length === 0, sysKeys.length ? `found ${sysKeys.join(',')}` : 'no Space/Enter/Escape/KeyP in game code');
    }

    /* ------------------------------ pieces --------------------------- */
    {
      const ok = KINDS.every((k) => SHAPES[k].length === 4 && SHAPES[k].every((r) => r.length === 4));
      const { game } = started(Blockfall);
      const kinds = [game.snapshot().piece.kind];
      for (let i = 0; i < 13; i++) {
        game.cur = null;
        game.spawn(game.nextKind());
        kinds.push(game.snapshot().piece.kind);
      }
      const counts = KINDS.map((k) => kinds.filter((x) => x === k).length);
      check('seven-bag', ok && counts.every((n) => n === 2), `first 14 pieces: ${kinds.join('')}`);
      const r = started(Blockfall, { randomizer: 'random' });
      r.game.rng = () => 0; // always the first kind: impossible under a bag
      for (let i = 0; i < 8; i++) {
        r.game.cur = null;
        r.game.spawn(r.game.nextKind());
      }
      check('random-randomizer', r.game.snapshot().next.every((k) => k === 'I'), `next with rng=0: ${r.game.snapshot().next.join('')}`);
    }

    /* ----------------------- system keys ignored --------------------- */
    {
      const { game } = started(Blockfall);
      const before = JSON.stringify(game.snapshot().piece);
      for (const code of ['Space', 'Enter', 'Escape', 'KeyP']) tap(game, code);
      check('system-keys-inert', JSON.stringify(game.snapshot().piece) === before, `piece ${before} -> ${JSON.stringify(game.snapshot().piece)}`);
    }

    /* ------------------------------ DAS/ARR -------------------------- */
    {
      // 10 OS auto-repeat key-downs in 50 ms: one step, nothing more until DAS.
      const { game } = started(Blockfall);
      game.gravAcc = -1e9; // no gravity in this test
      const x0 = game.snapshot().piece.x;
      for (let i = 0; i < 10; i++) {
        game.onKey('ArrowLeft', true);
        game.update(0.005);
      }
      const afterRepeats = x0 - game.snapshot().piece.x;
      // Keep holding: past DAS it slides on its own at the ARR rate, up to the wall.
      game.update(DAS - 0.05 + ARR * 0.5);
      const atDas = x0 - game.snapshot().piece.x;
      for (let i = 0; i < 30; i++) game.update(0.02);
      const p = game.snapshot().piece;
      const minX = Math.min(...SHAPES[p.kind][p.rot].map(([dx]) => p.x + dx));
      game.onKey('ArrowLeft', false);
      check('das-ignores-os-repeat', afterRepeats === 1, `moved ${afterRepeats} column(s) on 10 repeats in 50 ms`);
      check('das-then-arr', atDas === 2 && minX === 0, `after DAS ${atDas} column(s); held to the wall, leftmost cell x=${minX}`);
    }

    /* ---------------------------- rotation --------------------------- */
    {
      // A vertical I against the left wall must kick out to rotate back to flat.
      const { game } = started(Blockfall);
      game.cur = { kind: 'I', rot: 1, x: -2, y: 5 };
      const ok0 = fits(game.board, 'I', 1, -2, 5);
      tap(game, 'KeyZ'); // R -> 0 needs a kick of +2 or so
      const p = game.snapshot().piece;
      const cells = SHAPES.I[p.rot].map(([dx, dy]) => [p.x + dx, p.y + dy]);
      check('srs-wall-kick', ok0 && p.rot === 0 && cells.every(([x]) => x >= 0), `I at wall -> rot ${p.rot} x ${p.x}`);
      // Four clockwise turns bring a T back where it started.
      const t = started(Blockfall);
      t.game.cur = { kind: 'T', rot: 0, x: 3, y: 5 };
      for (let i = 0; i < 4; i++) tap(t.game, 'KeyX');
      const q = t.game.snapshot().piece;
      check('rotate-cycle', q.rot === 0 && q.x === 3 && q.y === 5, JSON.stringify(q));
    }

    /* ------------------------------ scoring -------------------------- */
    {
      // A single at level 1: 100, plus 2 per hard-dropped row.
      const { game, h } = started(Blockfall);
      fillRows(game, COLS, [ROWS - 1], [3, 4, 5, 6]);
      game.cur = { kind: 'I', rot: 0, x: 3, y: -1 };
      const s0 = game.snapshot().score;
      tap(game, 'ArrowUp');
      const s = game.snapshot();
      const rows = ROWS - 1; // the I's cells sit on box row 1: y -1 -> 18
      check('single-score', s.lines === 1 && s.score - s0 === 100 * 1 + rows * 2, `lines=${s.lines} +${s.score - s0} (want ${100 + rows * 2})`);
      check('hud-stats', h.hud.stats?.map((x) => x.label).join('|') === 'Score|Lines|Level|Best' && h.hud.badge === 'LEVEL 1', `${h.hud.badge} ${h.hud.stats?.map((x) => `${x.label}=${x.value}`).join(' ')}`);
    }
    {
      // A four-line clear at start level 3: 800 × 3.
      const { game } = started(Blockfall, { startLevel: 3 });
      fillRows(game, COLS, [16, 17, 18, 19], [9]);
      game.cur = { kind: 'I', rot: 1, x: 7, y: 16 }; // R cells sit in box column 2 -> x 9
      tap(game, 'ArrowUp');
      const s = game.snapshot();
      check('tetris-score', s.lines === 4 && s.score === 2400 && s.level === 3, `lines=${s.lines} score=${s.score} level=${s.level}`);
    }
    {
      // Soft drop: +1 per row it pulls the piece down.
      const { game } = started(Blockfall);
      const y0 = game.snapshot().piece.y;
      game.onKey('ArrowDown', true);
      for (let i = 0; i < 5; i++) game.update(0.05);
      game.onKey('ArrowDown', false);
      const s = game.snapshot();
      check('soft-drop', s.piece.y - y0 === 5 && s.score === 5, `fell ${s.piece.y - y0} rows, score ${s.score}`);
    }

    /* ------------------------------ levels --------------------------- */
    {
      const curve = Array.from({ length: 15 }, (_, i) => gravityInterval(i + 1));
      const falling = curve.every((v, i) => i === 0 || v < curve[i - 1]);
      check('gravity-curve', falling && Math.abs(curve[0] - 1) < 1e-9, `level 1 ${curve[0].toFixed(3)} s … level 15 ${curve[14].toFixed(4)} s`);
      const { game, h } = started(Blockfall);
      game.lines = 9;
      fillRows(game, COLS, [ROWS - 1], [3, 4, 5, 6]);
      game.cur = { kind: 'I', rot: 0, x: 3, y: -1 };
      tap(game, 'ArrowUp');
      const s = game.snapshot();
      check('level-up-every-10', s.lines === 10 && s.level === 2 && h.hud.badge === 'LEVEL 2', `lines=${s.lines} level=${s.level} badge=${h.hud.badge}`);
      // Gravity alone moves the piece faster at level 2 than at level 1.
      const drop = (lvl) => {
        const g = started(Blockfall, { startLevel: lvl }).game;
        const y0 = g.snapshot().piece.y;
        for (let i = 0; i < 60; i++) g.update(DT * 3);
        return g.snapshot().piece.y - y0;
      };
      check('faster-gravity', drop(5) > drop(1), `3 s of gravity: level 1 fell ${drop(1)}, level 5 fell ${drop(5)}`);
    }

    /* ---------------------------- lock delay ------------------------- */
    {
      const { game } = started(Blockfall);
      game.cur = { kind: 'O', rot: 0, x: 4, y: ROWS - 2 };
      game.update(LOCK_DELAY * 0.6);
      const early = game.snapshot().board.some(Boolean);
      game.update(LOCK_DELAY * 0.6);
      const late = game.snapshot().board.filter(Boolean).length;
      check('lock-delay', !early && late === 4, `locked early=${early}, cells after the delay=${late}`);
    }

    /* ------------------------------- hold ---------------------------- */
    {
      const { game } = started(Blockfall);
      const first = game.snapshot().piece.kind;
      tap(game, 'KeyC');
      const second = game.snapshot().piece.kind;
      tap(game, 'KeyC'); // only once per piece
      check('hold', game.snapshot().hold === first && game.snapshot().piece.kind === second, `held ${game.snapshot().hold}, playing ${game.snapshot().piece.kind}`);
    }

    /* ----------------------------- phosphor -------------------------- */
    {
      const clearOne = (phosphor) => {
        const { game } = started(Blockfall, { phosphor });
        fillRows(game, COLS, [ROWS - 1], [3, 4, 5, 6]);
        game.cur = { kind: 'I', rot: 0, x: 3, y: -1 };
        tap(game, 'ArrowUp');
        return game;
      };
      const on = clearOne(true);
      const marked = on.snapshot().marks;
      on.gravAcc = -1e9;
      for (let i = 0; i < 10 * 20; i++) {
        on.update(0.05);
        on.gravAcc = -1e9;
      }
      const atTen = on.snapshot().marks.length;
      for (let i = 0; i < (PHOSPHOR_LIFE - 10 + 0.5) * 20; i++) {
        on.update(0.05);
        on.gravAcc = -1e9;
      }
      on.render();
      const off = clearOne(false);
      check(
        'phosphor-burn',
        marked.length === 1 && marked[0].row === ROWS - 1 && atTen === 1 && on.snapshot().marks.length === 0,
        `marks after clear=${marked.length} (row ${marked[0]?.row}), at 10 s=${atTen}, at ${PHOSPHOR_LIFE + 0.5} s=${on.snapshot().marks.length}`,
      );
      check('phosphor-off', off.snapshot().lines === 1 && off.snapshot().marks.length === 0, `phosphor:false marks=${off.snapshot().marks.length}`);
    }

    /* ---------------------------- game over -------------------------- */
    {
      const { game, h } = started(Blockfall);
      fillRows(game, COLS, [0, 1, 2], [0]);
      game.score = 77;
      game.cur = { kind: 'O', rot: 0, x: 8, y: 5 };
      tap(game, 'ArrowUp'); // locks, and the next piece has nowhere to spawn
      check(
        'game-over',
        game.snapshot().phase === 'over' && h.overlay?.variant === 'lose' && h.submitted.length === 1 && h.submitted[0] === game.snapshot().score,
        `phase=${game.snapshot().phase} overlay=${h.overlay?.variant} submitted=${h.submitted.join(',')}`,
      );
    }

    /* --------------------------- bot playthrough --------------------- */
    {
      // A placement bot: for each new piece, try every rotation × column, keep the
      // lowest-cost landing, steer there with real key presses, and hard drop.
      const { game, h } = started(Blockfall);
      const evaluate = (board, kind, rot, x) => {
        if (!fits(board, kind, rot, x, -2)) return null;
        let y = -2;
        while (fits(board, kind, rot, x, y + 1)) y++;
        const b = Uint8Array.from(board);
        for (const [dx, dy] of SHAPES[kind][rot]) {
          if (y + dy < 0) return null;
          b[(y + dy) * COLS + x + dx] = 1;
        }
        let lines = 0;
        for (let r = 0; r < ROWS; r++) {
          let full = true;
          for (let c = 0; c < COLS; c++) if (!b[r * COLS + c]) full = false;
          if (full) lines++;
        }
        const heights = [];
        let holes = 0;
        for (let c = 0; c < COLS; c++) {
          let top = ROWS;
          for (let r = 0; r < ROWS; r++) if (b[r * COLS + c]) { top = r; break; }
          heights.push(ROWS - top);
          for (let r = top + 1; r < ROWS; r++) if (!b[r * COLS + c]) holes++;
        }
        const agg = heights.reduce((a, v) => a + v, 0);
        let bump = 0;
        for (let c = 1; c < COLS; c++) bump += Math.abs(heights[c] - heights[c - 1]);
        return 0.51 * agg + 0.36 * holes + 0.18 * bump - 0.76 * lines;
      };
      let frames = 0;
      let placed = 0;
      let lastPiece = null;
      while (frames < 600 || game.snapshot().lines < 1) {
        if (frames > 20000 || game.snapshot().phase !== 'playing') break;
        const p = game.snapshot().piece;
        // Every spawn is a fresh piece object; steer each one once, one piece every third frame.
        if (p && game.cur !== lastPiece && frames % 3 === 0) {
          lastPiece = game.cur;
          let bestCost = Infinity;
          let target = null;
          for (let rot = 0; rot < 4; rot++) {
            for (let x = -2; x < COLS; x++) {
              const cost = evaluate(game.board, p.kind, rot, x);
              if (cost !== null && cost < bestCost) {
                bestCost = cost;
                target = { rot, x };
              }
            }
          }
          if (target) {
            for (let i = 0; i < target.rot; i++) tap(game, 'KeyX');
            for (let guard = 0; guard < 12 && game.snapshot().piece.x !== target.x; guard++) {
              tap(game, game.snapshot().piece.x > target.x ? 'ArrowLeft' : 'ArrowRight');
            }
            tap(game, 'ArrowUp');
            placed++;
          }
        }
        game.update(0.05);
        if (frames % 5 === 0) game.render();
        frames++;
      }
      const s = game.snapshot();
      check('bot-clears-lines', frames >= 600 && s.lines >= 1 && s.phase === 'playing', `${frames} frames, ${placed} pieces placed, lines=${s.lines} score=${s.score} level=${s.level}`);
      // Then stop steering: hard drop in place until the well fills, and the score is submitted once.
      for (let i = 0; i < 400 && game.snapshot().phase === 'playing'; i++) {
        tap(game, 'ArrowUp');
        game.update(0.05);
      }
      check(
        'bot-game-over',
        game.snapshot().phase === 'over' && h.submitted.length === 1 && h.submitted[0] === game.snapshot().score && game.snapshot().score > 0,
        `phase=${game.snapshot().phase} submitted=${h.submitted.join(',')} score=${game.snapshot().score}`,
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
    console.log('\nBlockfall checks ok');
  }
}

await main();
