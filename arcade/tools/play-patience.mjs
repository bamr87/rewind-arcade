// Headless checks for Patience 3.1: the deal, the move rules, drawing and
// recycling in both draw modes, standard and Vegas scoring, drag and drop
// through the real pointer hooks, pause, auto-finish, the win bounce, and a
// bot that plays hundreds of deals. Run with `npm run play:patience`; exits
// non-zero on any failure.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOT_DEALS = 300;

function mock2d() {
  const noop = () => mock2d;
  const grad = { addColorStop() {} };
  return new Proxy(
    { canvas: { width: 960, height: 640 }, createLinearGradient: () => grad, measureText: () => ({ width: 0 }) },
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
    t: 0,
    now: () => h.t,
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

const DEFAULTS = { draw: '1', scoring: 'standard', timed: true, autoFinish: true };

/** A game past its title panel, ready to play. */
function started(Patience, config) {
  const h = host({ ...DEFAULTS, ...config });
  const game = new Patience(h);
  game.render();
  if (h.overlay?.variant !== 'menu') throw new Error('expected the title overlay');
  game.onAction('deal');
  if (game.snapshot().phase !== 'playing') throw new Error(`deal did not begin play (${game.snapshot().phase})`);
  return { game, h };
}

/** '7H' -> a card; a trailing '?' makes it face down. Suits: S H D C. */
function C(s) {
  const up = !s.endsWith('?');
  const t = up ? s : s.slice(0, -1);
  const rank = { A: 1, J: 11, Q: 12, K: 13 }[t.slice(0, -1)] ?? Number(t.slice(0, -1));
  return { suit: 'SHDC'.indexOf(t.at(-1)), rank, up };
}

/** Put a hand-built layout on the table; omitted piles are empty. */
function lay(k, { stock = [], waste = [], found = [[], [], [], []], tab = [] }) {
  const piles = Array.from({ length: 13 }, () => []);
  piles[0] = stock.map(C);
  piles[1] = waste.map(C);
  found.forEach((f, i) => (piles[2 + i] = f.map(C)));
  tab.forEach((col, i) => (piles[6 + i] = col.map(C)));
  k.piles = piles;
}

const suitRun = (suit, to) => Array.from({ length: to }, (_, i) => ['A', 2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K'][i] + suit);

/** Press at the middle of a pile's card `index`, move to another pile's top, release. */
function drag(game, from, index, to) {
  const a = game.cardPositions(from)[index];
  const dest = game.k.piles[to].length ? game.cardPositions(to).at(-1) : game.pileRect(to);
  game.onPointerDown({ x: a.x + 20, y: a.y + 6, button: 0, pointerType: 'mouse' });
  game.onPointerMove({ x: (a.x + dest.x) / 2 + 20, y: (a.y + dest.y) / 2 + 6, button: 0, pointerType: 'mouse' });
  game.onPointerMove({ x: dest.x + 20, y: dest.y + 6, button: 0, pointerType: 'mouse' });
  game.onPointerUp({ x: dest.x + 20, y: dest.y + 6, button: 0, pointerType: 'mouse' });
}

const cardKey = (c) => `${c.suit}:${c.rank}`;

async function main() {
  const vite = await createServer({
    root,
    configFile: false,
    cacheDir: path.join(os.tmpdir(), 'vite-play-patience'),
    server: { middlewareMode: true },
    appType: 'custom',
  });
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });
  try {
    const { getGame } = await vite.ssrLoadModule('/src/games/registry.ts');
    const manifest = getGame('patience');
    check('registered', manifest?.id === 'patience', `getGame('patience') -> ${manifest?.title}`);
    if (!manifest) throw new Error("no game registered as 'patience'");
    const { Patience } = await vite.ssrLoadModule('/src/games/patience/game.ts');
    const K = await vite.ssrLoadModule('/src/games/patience/klondike.ts');
    const { Klondike, STOCK, WASTE, FOUND, TAB } = K;

    /* ---------------------------- manifest --------------------------- */
    {
      check(
        'manifest-meta',
        manifest.title === 'Patience 3.1' && manifest.year === '1990' && manifest.icon === '🃏',
        `${manifest.title} (${manifest.year}) ${manifest.icon}`,
      );
      const got = Object.fromEntries(
        manifest.config.map((f) => [f.key, [f.type, f.type === 'select' ? f.options.map((o) => o.value).join('|') : '', f.default, f.restart]]),
      );
      const want = {
        draw: ['select', '1|3', '1', true],
        scoring: ['select', 'standard|vegas', 'standard', true],
        timed: ['toggle', '', true, true],
        autoFinish: ['toggle', '', true, true],
      };
      check('manifest-config', JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));
      check('manifest-pad', JSON.stringify(manifest.pad) === JSON.stringify({ south: 'KeyD', west: 'KeyA' }), JSON.stringify(manifest.pad));
    }

    /* ----------------------------- imports --------------------------- */
    {
      const dir = path.join(root, 'src/games/patience');
      const files = fs.readdirSync(dir);
      const bad = [];
      for (const f of files) {
        for (const m of fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/from '([^']+)'/g)) {
          if (!/^(\.\/|\.\.\/\.\.\/engine\/)/.test(m[1])) bad.push(`${f}: ${m[1]}`);
        }
      }
      check('engine-only-imports', bad.length === 0, bad.length ? bad.join(', ') : files.join(', '));
      check('ts-only', files.every((f) => f.endsWith('.ts')), files.join(', '));
    }

    /* ------------------------------ deal ----------------------------- */
    {
      const bad = [];
      for (let seed = 1; seed <= 200; seed++) {
        const k = new Klondike(1, 'standard', true, seed);
        const all = k.piles.flat();
        if (new Set(all.map(cardKey)).size !== 52 || all.length !== 52) bad.push(`seed ${seed}: not 52 distinct cards`);
        if (k.stock.length !== 24 || k.stock.some((c) => c.up)) bad.push(`seed ${seed}: stock ${k.stock.length}`);
        for (let i = 0; i < 7; i++) {
          const col = k.column(i);
          if (col.length !== i + 1 || col.some((c, j) => c.up !== (j === i))) bad.push(`seed ${seed}: column ${i + 1}`);
        }
      }
      const a = JSON.stringify(new Klondike(1, 'standard', true, 99).piles);
      const b = JSON.stringify(new Klondike(3, 'vegas', false, 99).piles);
      const c = JSON.stringify(new Klondike(1, 'standard', true, 100).piles);
      check('deal', bad.length === 0, bad.length ? bad.slice(0, 4).join(' | ') : '200 seeds: 28 tableau (1–7, top up) + 24 face-down stock, 52 distinct');
      check('deal-seeded', a === b && a !== c, 'same seed -> same deal in any mode; next seed differs');
    }

    /* ------------------------------ rules ---------------------------- */
    {
      const k = new Klondike(1, 'standard', false, 1);
      lay(k, { waste: ['5H'], found: [['AS'], [], [], []], tab: [['8S?', '7H', '6C'], ['8C'], ['KD'], [], ['9H'], ['6D']] });
      const rules = [
        ['9♥ not on 6♣', !k.canMove(TAB + 4, 0, TAB + 0)],
        ['5♥ not on 6♦ (same colour)', !k.canMove(WASTE, 0, TAB + 5)],
        ['5♥ on 6♣', k.canMove(WASTE, 0, TAB + 0)],
        ['7♥ alone needs whole run', k.canMove(TAB + 0, 1, TAB + 1) && !k.canMove(TAB + 0, 2, TAB + 1)],
        ['face-down never moves', !k.canMove(TAB + 0, 0, TAB + 3)],
        ['only a king to an empty column', k.canMove(TAB + 2, 0, TAB + 3) && !k.canMove(TAB + 1, 0, TAB + 3)],
        ['foundation needs suit + 1', !k.canMove(TAB + 0, 2, FOUND) && !k.canMove(WASTE, 0, FOUND + 1)],
        ['a run never goes home', !k.canMove(TAB + 0, 1, FOUND + 1)],
        ['nothing onto stock or waste', !k.canMove(TAB + 1, 0, STOCK) && !k.canMove(TAB + 1, 0, WASTE)],
      ];
      const failed = rules.filter(([, ok]) => !ok).map(([n]) => n);
      check('rules', failed.length === 0, failed.length ? `failed: ${failed.join(', ')}` : rules.map(([n]) => n).join('; '));
    }

    /* -------------------------- drag and drop ------------------------ */
    {
      const { game } = started(Patience, { timed: false });
      lay(game.k, { stock: ['2S?'], tab: [['8S?', '7H', '6C'], ['8C'], ['9D'], [], [], [], ['QS']] });
      const before = JSON.stringify(game.k.piles);
      drag(game, TAB + 6, 0, TAB + 2); // Q♠ on 9♦: illegal
      const illegal = JSON.stringify(game.k.piles) === before && game.snapshot().moves === 0 && !game.snapshot().dragging;
      drag(game, TAB + 0, 2, TAB + 2); // 6♣ on 9♦: illegal
      const illegal2 = JSON.stringify(game.k.piles) === before;
      check('illegal-drop-snaps-back', illegal && illegal2, `columns: ${game.snapshot().columns.slice(0, 3).join(' | ')}`);

      drag(game, TAB + 0, 1, TAB + 1); // 7♥ 6♣ onto 8♣: the whole run moves
      const s = game.snapshot();
      check(
        'run-move',
        s.columns[0] === '8♠' && s.columns[1] === '8♣ 7♥ 6♣' && s.points === 5 && s.moves === 1,
        `col1=${s.columns[0]} col2=${s.columns[1]} points=${s.points} (turned 8♠ face up: +5)`,
      );

      // A click (press and release in place) moves nothing; a pointer leaving cancels a drag.
      const p = game.cardPositions(TAB + 1).at(-1);
      game.onPointerDown({ x: p.x + 10, y: p.y + 10, button: 0, pointerType: 'mouse' });
      game.onPointerMove({ x: 700, y: 300, button: 0, pointerType: 'mouse' });
      game.onPointerLeave();
      game.onPointerUp({ x: 700, y: 300, button: 0, pointerType: 'mouse' });
      check('leave-cancels', game.snapshot().columns[1] === '8♣ 7♥ 6♣' && !game.snapshot().dragging, game.snapshot().columns[1]);
    }

    /* --------------------------- double-click ------------------------ */
    {
      const { game, h } = started(Patience, { timed: false });
      lay(game.k, { waste: ['AH'], tab: [['2C']] });
      const w = game.cardPositions(WASTE)[0];
      const click = () => {
        game.onPointerDown({ x: w.x + 30, y: w.y + 30, button: 0, pointerType: 'mouse' });
        game.onPointerUp({ x: w.x + 30, y: w.y + 30, button: 0, pointerType: 'mouse' });
      };
      h.t = 1000; click();
      h.t = 1600; click();
      const slow = game.k.homed;
      h.t = 1800; click();
      const fast = game.k.homed;
      check('double-click-home', slow === 0 && fast === 1 && game.k.points === 10, `600 ms apart -> ${slow} home; 200 ms -> ${fast} home, points ${game.k.points}`);
    }

    /* ------------------------ draw and recycle ----------------------- */
    {
      const { game } = started(Patience, { draw: '1', timed: false });
      game.k.points = 500;
      let draws = 0;
      while (game.k.stock.length) { game.onKey('KeyD', true); game.onKey('KeyD', false); draws++; }
      const turned = game.k.waste.length;
      game.onKey('KeyD', true); game.onKey('KeyD', false);
      const s = game.snapshot();
      check(
        'draw-one',
        draws === 24 && turned === 24 && s.stock === 24 && s.waste === 0 && s.points === 400 && game.k.stock.every((c) => !c.up),
        `24 draws turn 1 each (waste ${turned}); recycle -> stock ${s.stock}, points 500 -> ${s.points}`,
      );
      game.onKey('KeyD', true); game.onKey('KeyD', true); game.onKey('KeyD', false);
      check('key-repeat-ignored', game.k.waste.length === 1, `held D (two key-downs) -> waste ${game.k.waste.length}`);
    }
    {
      const k = new Klondike(3, 'standard', false, 7);
      k.points = 500;
      const pass = () => { let n = 0; while (k.stock.length) { k.drawCards(); n++; } return n; };
      const draws = pass();
      const trail = [];
      for (let r = 1; r <= 4; r++) { k.drawCards(); trail.push(k.points); pass(); }
      check(
        'draw-three',
        draws === 8 && trail.join() === '500,500,480,460',
        `24 cards in ${draws} draws of 3; points after recycles 1–4: ${trail.join(', ')} (−20 after the 3rd pass)`,
      );
      const empty = new Klondike(1, 'standard', false, 7);
      lay(empty, {});
      check('empty-stock', empty.drawCards() === 'empty' && empty.moves === 0, 'nothing to draw or recycle -> no move');
    }

    /* ----------------------------- scoring --------------------------- */
    {
      const k = new Klondike(1, 'standard', true, 3);
      lay(k, { waste: ['5H'], found: [['AS', '2S'], [], [], []], tab: [['6C'], ['3S?', '3S']] });
      k.points = 0;
      k.move(WASTE, 0, TAB + 0); const a = k.points;       // waste -> tableau +5
      k.move(TAB + 1, 1, FOUND); const b = k.points;        // tableau -> foundation +10, turn over +5
      k.move(FOUND, 2, TAB + 1); const c = k.points;        // nope: 3♠ onto 3♠ is illegal
      const fromFound = new Klondike(1, 'standard', true, 3);
      lay(fromFound, { found: [['AH', '2H', '3H', '4H'], [], [], []], tab: [['5S']] });
      fromFound.points = 40;
      fromFound.move(FOUND, 3, TAB + 0);
      check('points-table', a === 5 && b === 20 && c === 20 && fromFound.points === 25, `+5 waste→tab: ${a}; +10 home +5 turned: ${b}; −15 foundation→tab: 40 -> ${fromFound.points}`);

      const t = new Klondike(1, 'standard', true, 3);
      t.points = 10;
      for (let i = 0; i < 700; i++) t.tick(0.05); // 35 s
      const untimed = new Klondike(1, 'standard', false, 3);
      untimed.points = 10;
      for (let i = 0; i < 700; i++) untimed.tick(0.05);
      const floor = new Klondike(1, 'standard', true, 3);
      for (let i = 0; i < 2400; i++) floor.tick(0.05);
      check('time-penalty', t.points === 4 && untimed.points === 10 && floor.points === 0, `35 s timed: 10 -> ${t.points}; untimed: ${untimed.points}; floored: ${floor.points}`);

      const bonus = new Klondike(1, 'standard', true, 3);
      bonus.points = 520; bonus.moves = 120; bonus.elapsed = 140;
      const want = 520 + Math.round(700000 / 140) + 80 * 5;
      const quick = new Klondike(1, 'standard', true, 3);
      quick.elapsed = 12; quick.moves = 250;
      check(
        'win-bonuses',
        bonus.finalScore(true) === want && bonus.finalScore(false) === 520 && quick.finalScore(true) === Math.round(700000 / 30),
        `140 s, 120 moves: ${bonus.finalScore(true)} (want ${want}); give-up keeps points; <30 s counts as 30, >200 moves no bonus`,
      );
    }

    /* ------------------------------- undo ---------------------------- */
    {
      const { game } = started(Patience, { timed: false });
      const start = JSON.stringify(game.k.piles);
      for (let i = 0; i < 5; i++) { game.onKey('KeyD', true); game.onKey('KeyD', false); }
      const drawn = JSON.stringify(game.k.piles);
      for (let i = 0; i < 5; i++) { const key = i % 2 ? 'KeyU' : 'KeyZ'; game.onKey(key, true); game.onKey(key, false); }
      check('undo', drawn !== start && JSON.stringify(game.k.piles) === start, '5 draws, then U/Z five times -> the deal is back');
      const t = new Klondike(1, 'standard', true, 2);
      t.points = 50; t.drawCards();
      for (let i = 0; i < 400; i++) t.tick(0.05); // 20 s: −4
      t.undo();
      check('undo-keeps-time', t.points === 46, `undo after 20 s timed: 50 -> ${t.points}`);
    }

    /* ------------------------------ pause ---------------------------- */
    {
      const { game } = started(Patience, {});
      game.onPause();
      const before = game.snapshot();
      game.onKey('KeyD', true); game.onKey('KeyD', false);
      const s = game.k.stock.length ? game.pileRect(STOCK) : null;
      if (s) game.onPointerDown({ x: s.x + 10, y: s.y + 10, button: 0, pointerType: 'mouse' });
      game.onAction('auto');
      game.render();
      const after = game.snapshot();
      game.onResume();
      game.onKey('KeyD', true); game.onKey('KeyD', false);
      check(
        'pause-blocks-input',
        after.stock === before.stock && after.moves === before.moves && game.snapshot().stock === before.stock - 1,
        `paused: stock ${before.stock} -> ${after.stock}; resumed D -> ${game.snapshot().stock}`,
      );
      const { game: g2 } = started(Patience, {});
      for (let i = 0; i < 40; i++) g2.update(0.05);
      const clock = g2.snapshot().elapsed;
      check('clock', Math.abs(clock - 2) < 1e-9, `40 frames at the 50 ms cap -> ${clock.toFixed(2)} s`);
      const before2 = g2.snapshot();
      for (const code of ['Space', 'Enter', 'Escape', 'KeyP']) { g2.onKey(code, true); g2.onKey(code, false); }
      check('ignores-system-keys', JSON.stringify(g2.snapshot()) === JSON.stringify(before2), 'Space/Enter/Escape/KeyP change nothing');
    }

    /* ------------------------ win, bounce, submit -------------------- */
    const almostWon = (k) => lay(k, {
      found: [suitRun('S', 12), suitRun('H', 12), suitRun('D', 12), suitRun('C', 12)],
      tab: [['KS'], ['KH'], ['KD'], ['KC']],
    });
    {
      const { game, h } = started(Patience, { autoFinish: false });
      almostWon(game.k);
      game.k.points = 300; game.k.moves = 150;
      for (let i = 0; i < 4; i++) drag(game, TAB + i, 0, FOUND + i);
      const s = game.snapshot();
      check(
        'forced-win',
        s.phase === 'won' && h.overlay?.variant === 'win' && h.submitted.length === 1 && h.submitted[0] >= 0 && Number.isInteger(h.submitted[0]),
        `phase=${s.phase} overlay=${h.overlay?.variant} submitted=${h.submitted.join(',')}`,
      );
      for (let i = 0; i < 200; i++) { game.update(0.05); game.render(); }
      const mid = game.snapshot();
      game.onPause();
      game.render(); game.render();
      game.onResume();
      for (let i = 0; i < 1200; i++) { game.update(0.05); if (i % 50 === 0) game.render(); }
      const late = game.snapshot();
      check(
        'win-bounce',
        mid.trail > 100 && late.trail > 100 && late.trail <= 1400 && h.submitted.length === 1 && late.phase === 'won',
        `trail ${mid.trail} stamps after 10 s, ${late.trail} after 70 s (capped, still animating); one submit`,
      );
      game.onAction('deal');
      check('deal-again', game.snapshot().phase === 'playing' && game.snapshot().homed === 0 && h.overlay === null, `phase=${game.snapshot().phase}`);
    }
    {
      const { game, h } = started(Patience, { autoFinish: true, timed: false });
      // 43 cards home, nine left, and Q♠ still face down under J♠.
      lay(game.k, {
        found: [suitRun('S', 10), suitRun('H', 11), suitRun('D', 11), suitRun('C', 11)],
        tab: [['KS', 'QH'], ['KH', 'QC'], ['KD'], ['QS?', 'JS'], ['QD'], ['KC']],
      });
      const allHere = game.k.piles.flat().length === 52 && !game.k.allRevealed;
      drag(game, TAB + 3, 1, FOUND); // J♠ home turns Q♠ over: nothing face down any more -> auto-finish
      const phase = game.snapshot().phase;
      for (let i = 0; i < 40 && game.snapshot().phase === 'finishing'; i++) game.update(0.05);
      check(
        'auto-finish',
        allHere && phase === 'finishing' && game.snapshot().phase === 'won' && h.submitted.length === 1,
        `after the last card turns: ${phase}; then ${game.snapshot().phase}, submitted ${h.submitted.join(',')}`,
      );
    }

    /* ------------------------------ Vegas ---------------------------- */
    {
      const { game, h } = started(Patience, { scoring: 'vegas', autoFinish: false });
      const hud0 = h.hud.stats.map((s) => `${s.label}=${s.value}`).join(' ');
      almostWon(game.k);
      for (let i = 0; i < 4; i++) drag(game, TAB + i, 0, FOUND + i);
      const won = h.submitted.at(-1);

      const { game: g2, h: h2 } = started(Patience, { scoring: 'vegas', draw: '3' });
      lay(g2.k, { found: [['AS', '2S'], ['AH'], [], []], tab: [['3S']] });
      g2.onAction('giveup');
      g2.onAction('giveup');
      const { game: g3, h: h3 } = started(Patience, { scoring: 'vegas' });
      g3.onAction('giveup');
      check(
        'vegas',
        won === 260 && h2.submitted.join() === '15' && h3.submitted.join() === '0' && h2.overlay?.variant === 'lose' && g2.k.vegasNet === -37,
        `start HUD: ${hud0}; win submits ${won}; 3 home then give up (twice) submits ${h2.submitted.join(',')}; nothing home: ${h3.submitted.join(',')}`,
      );
      for (let i = 0; i < 400; i++) game.k.tick(0.05);
      check('vegas-untimed', game.k.vegasNet === 208, `Vegas ignores the clock: net ${game.k.vegasNet}`);
    }
    {
      const { game, h } = started(Patience, {});
      game.onAction('giveup');
      game.onAction('giveup');
      check('giveup-once', h.submitted.length === 1 && h.submitted[0] === 0 && game.snapshot().phase === 'over', `submitted ${h.submitted.join(',')}`);
      const hud = h.hud;
      check(
        'hud',
        hud.stats.map((s) => s.label).join(',') === 'Score,Moves,Time,Best' && hud.badge === 'DRAW 1',
        `stats=${hud.stats.map((s) => s.label).join(',')} badge=${hud.badge}`,
      );
    }

    /* ------------------------------- bot ----------------------------- */
    {
      // A greedy player: home anything, then any tableau move that turns a card
      // or empties a column for a king, then a waste move, then draw.
      const bad = [];
      let wins = 0, actions = 0;
      for (let seed = 1; seed <= BOT_DEALS; seed++) {
        const draw = seed % 2 ? '1' : '3';
        const { game, h } = started(Patience, { draw, scoring: seed % 3 ? 'standard' : 'vegas' });
        game.k.deal(seed);
        const k = game.k;
        let idle = 0;
        for (let n = 0; n < 1500 && game.snapshot().phase === 'playing'; n++) {
          actions++;
          const before = k.moves;
          if (k.autoStep(true)) { game.afterMove(); idle = 0; game.update(0.05); continue; }
          let moved = false;
          for (let c = 0; c < 7 && !moved; c++) {
            const col = k.column(c);
            const first = col.findIndex((x) => x.up);
            if (first < 0) continue;
            if (first === 0 && col[0].rank === 13) continue; // a king already at the bottom
            for (let t = 0; t < 7 && !moved; t++) {
              if (t !== c && k.canMove(TAB + c, first, TAB + t)) moved = game.tryMove(TAB + c, first, TAB + t);
            }
          }
          for (let t = 0; t < 7 && !moved; t++) if (k.canMove(WASTE, k.waste.length - 1, TAB + t)) moved = game.tryMove(WASTE, k.waste.length - 1, TAB + t);
          if (!moved) {
            game.onKey('KeyD', true); game.onKey('KeyD', false);
            idle++;
            if (idle > 3 * (k.stock.length + k.waste.length) + 6) break;
          } else idle = 0;
          if (k.moves < before) bad.push(`seed ${seed}: moves went backwards`);
          const all = k.piles.flat();
          if (all.length !== 52 || new Set(all.map(cardKey)).size !== 52) { bad.push(`seed ${seed}: deck corrupted`); break; }
          if (k.points < 0) { bad.push(`seed ${seed}: negative points`); break; }
          game.update(0.05);
          if (n % 25 === 0) game.render();
        }
        for (let i = 0; i < 80 && game.snapshot().phase === 'finishing'; i++) game.update(0.05);
        if (game.snapshot().phase === 'won') { wins++; for (let i = 0; i < 60; i++) { game.update(0.05); game.render(); } }
        else game.onAction('giveup');
        if (h.submitted.length !== 1 || !(h.submitted[0] >= 0) || !Number.isInteger(h.submitted[0])) bad.push(`seed ${seed}: submitted ${h.submitted.join(',')}`);
        if (k.scoring === 'vegas' && h.submitted[0] > 260) bad.push(`seed ${seed}: Vegas ${h.submitted[0]}`);
      }
      check('bot', bad.length === 0 && wins > 0, bad.length ? bad.slice(0, 5).join(' | ') : `${BOT_DEALS} deals, ${actions} actions, ${wins} won, every deal submitted exactly once`);
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
    console.log('\nPatience checks ok');
  }
}

await main();
