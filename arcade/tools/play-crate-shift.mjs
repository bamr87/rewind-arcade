// Headless checks for Crate Shift: replays the generator's own solutions
// through the real game class over many seeds, then pins the rules, undo,
// scoring and seeding with a mock canvas. Run with `npm run play:crate-shift`;
// exits non-zero on any failure.
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEEDS = 50;
const SIZES = ['small', 'medium', 'large'];
const ARROWS = ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];

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

/** A keyboard press: down then up, as the host delivers it. */
function press(game, code) {
  game.onKey(code, true);
  game.onKey(code, false);
}

function started(CrateShift, config) {
  const h = host({ size: 'medium', crates: 3, seed: 42, levels: 3, ...config });
  const game = new CrateShift(h);
  game.render();
  if (h.overlay?.variant !== 'menu') throw new Error('expected the title overlay');
  game.onAction('start');
  if (game.snapshot().phase !== 'playing') throw new Error(`start did not begin play (${game.snapshot().phase})`);
  return { game, h };
}

/** Replay the current level's own solution; returns the snapshot taken on the last move. */
function solve(game) {
  for (const d of game.snapshot().solution) press(game, ARROWS[d]);
  return game.snapshot();
}

/** Step through the post-level pause into the next level. */
function next(game) {
  for (let i = 0; i < 60 && game.snapshot().phase === 'solved'; i++) game.update(0.05);
}

async function main() {
  const vite = await createServer({
    root,
    configFile: false,
    cacheDir: path.join(os.tmpdir(), 'vite-play-crate-shift'),
    server: { middlewareMode: true },
    appType: 'custom',
  });
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });
  try {
    const { getGame } = await vite.ssrLoadModule('/src/games/registry.ts');
    const manifest = getGame('crate-shift');
    check('registered', manifest?.id === 'crate-shift', `getGame('crate-shift') -> ${manifest?.title}`);
    if (!manifest) throw new Error("no game registered as 'crate-shift'");
    const { CrateShift } = await vite.ssrLoadModule('/src/games/crate-shift/game.ts');
    const levels = await vite.ssrLoadModule('/src/games/crate-shift/levels.ts');

    /* ---------------------------- manifest --------------------------- */
    {
      const got = Object.fromEntries(
        manifest.config.map((f) => [f.key, f.type === 'select' ? [f.type, f.options.map((o) => o.value).join('|'), f.default] : [f.type, f.min, f.max, f.step, f.default]]),
      );
      const want = {
        size: ['select', 'small|medium|large', 'medium'],
        crates: ['range', 2, 6, 1, 3],
        seed: ['range', 0, 9999, 1, 0],
        levels: ['range', 3, 20, 1, 10],
      };
      check('manifest-config', JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));
      check('manifest-pad', manifest.pad?.west === 'KeyZ' && manifest.pad?.north === 'KeyR', JSON.stringify(manifest.pad));
    }

    /* --------------------------- solvability ------------------------- */
    {
      // Every level, replayed forward through onKey from its own reverse-play
      // trace, ends with every crate on a target, at exactly par, for 1000.
      const bad = [];
      let played = 0;
      for (const size of SIZES) {
        for (const crates of [2, 6]) {
          for (let seed = 1; seed <= SEEDS; seed++) {
            const { game, h } = started(CrateShift, { size, crates, seed });
            const start = game.snapshot();
            const end = solve(game);
            played++;
            const tag = `${size}/${crates}/seed ${seed}`;
            if (start.solved) bad.push(`${tag}: starts solved`);
            else if (!end.solved || end.phase !== 'solved') bad.push(`${tag}: solution did not solve (phase=${end.phase})`);
            else if (end.moves !== start.par) bad.push(`${tag}: moves ${end.moves} != par ${start.par}`);
            else if (end.score !== 1000 || h.submitted.at(-1) !== 1000) bad.push(`${tag}: score ${end.score}, submitted ${h.submitted.join(',')}`);
          }
        }
      }
      check('solvable', bad.length === 0, bad.length ? bad.slice(0, 5).join(' | ') : `${played} levels solved by their own solution at par`);
    }
    {
      // Deeper levels too: one long run per size, every level solved in turn.
      const bad = [];
      for (const size of SIZES) {
        const { game, h } = started(CrateShift, { size, crates: 4, seed: 77, levels: 20 });
        for (let n = 1; n <= 20; n++) {
          const end = solve(game);
          if (!end.solved) { bad.push(`${size} level ${n} unsolved`); break; }
          next(game);
        }
        const s = game.snapshot();
        if (s.phase !== 'done' || h.overlay?.variant !== 'win' || h.submitted.at(-1) !== s.score || s.score !== 20000) {
          bad.push(`${size}: phase=${s.phase} overlay=${h.overlay?.variant} score=${s.score} last submit=${h.submitted.at(-1)}`);
        }
      }
      check('full-runs', bad.length === 0, bad.length ? bad.join(' | ') : '3 sizes × 20 levels solved; run ends with a win overlay and the total submitted');
    }

    /* --------------------------- determinism ------------------------- */
    {
      const boards = (seed) => {
        const { game } = started(CrateShift, { seed, levels: 5 });
        const out = [];
        for (let n = 0; n < 3; n++) {
          out.push(game.snapshot().board);
          solve(game);
          next(game);
        }
        return out.join('\n=\n');
      };
      const a = boards(1234), b = boards(1234), c = boards(0), d = boards(0);
      check('seed-repeats', a === b, 'seed 1234 twice -> identical boards for levels 1–3');
      check('seed-zero-varies', c !== d, 'seed 0 twice -> different boards');
      const g1 = levels.generateLevel(99, 'large', 6, 4), g2 = levels.generateLevel(99, 'large', 6, 4);
      check('generator-deterministic', levels.boardKey(g1) === levels.boardKey(g2) && g1.solution.join() === g2.solution.join(), `par ${g1.par}`);
    }

    /* ------------------------------ rules ---------------------------- */
    {
      const { game } = started(CrateShift, {});
      const load = (rows) => {
        game.level = levels.parseLevel(rows);
        game.resetLevel();
        return game.snapshot().board;
      };
      // Crate with a crate behind it: nothing moves.
      const twoInRow = load(['#######', '#.$$@ #', '#.    #', '#######']);
      press(game, 'ArrowLeft');
      const blockedByCrate = game.snapshot();
      // Crate against a wall: nothing moves.
      const wallBehind = load(['######', '#$@ .#', '######']);
      press(game, 'ArrowLeft');
      const blockedByWall = game.snapshot();
      // No pull: stepping away from a crate leaves it where it was.
      const pullStart = load(['#######', '#. $@ #', '#######']);
      press(game, 'ArrowRight');
      const afterStepAway = game.snapshot();
      const crateStayed = afterStepAway.board.split('\n')[1] === '#. $ @#';
      // A free push moves the crate one square.
      load(['#######', '#. $@ #', '#######']);
      press(game, 'ArrowLeft');
      const pushed = game.snapshot().board.split('\n')[1];
      check(
        'rules',
        blockedByCrate.board === twoInRow && blockedByCrate.moves === 0 &&
          blockedByWall.board === wallBehind && blockedByWall.moves === 0 &&
          afterStepAway.board !== pullStart && crateStayed &&
          pushed === '#.$@  #',
        `crate-crate moves=${blockedByCrate.moves}, crate-wall moves=${blockedByWall.moves}, step-away row=${JSON.stringify(afterStepAway.board.split('\n')[1])}, push row=${JSON.stringify(pushed)}`,
      );
      // Pushing the last crate home solves the level.
      load(['######', '#.$@ #', '######']);
      press(game, 'ArrowLeft');
      check('solve-detect', game.snapshot().phase === 'solved', `phase=${game.snapshot().phase}`);
    }

    /* ------------------------------ undo ----------------------------- */
    {
      const { game } = started(CrateShift, { size: 'large', crates: 4, seed: 9 });
      const start = game.snapshot();
      const n = Math.min(12, start.par - 1);
      for (const d of start.solution.slice(0, n)) press(game, ARROWS[d]);
      const mid = game.snapshot();
      for (let i = 0; i < n; i++) press(game, ['KeyZ', 'KeyU', 'Backspace'][i % 3]);
      const undone = game.snapshot();
      check(
        'undo-to-start',
        mid.moves === n && mid.board !== start.board && undone.board === start.board && undone.moves === 0,
        `${n} moves then ${n} undos: moves ${mid.moves} -> ${undone.moves}, board restored=${undone.board === start.board}`,
      );

      for (const d of start.solution.slice(0, n)) press(game, ARROWS[d]);
      press(game, 'KeyR');
      const reset = game.snapshot();
      check('restart', reset.board === start.board && reset.moves === 0, `KeyR after ${n} moves: moves=${reset.moves}`);

      // An OS auto-repeat (down, down, … with no up) must not unwind more than once.
      for (const d of start.solution.slice(0, 3)) press(game, ARROWS[d]);
      game.onKey('KeyZ', true);
      game.onKey('KeyZ', true);
      game.onKey('KeyZ', true);
      game.onKey('KeyZ', false);
      check('undo-ignores-repeat', game.snapshot().moves === 2, `held Z: moves 3 -> ${game.snapshot().moves}`);
    }

    /* ----------------------------- scoring --------------------------- */
    {
      const { game, h } = started(CrateShift, { seed: 5, levels: 3 });
      const par1 = game.snapshot().par;
      solve(game);
      const after1 = [...h.submitted];
      next(game);
      solve(game);
      check(
        'scoring',
        par1 > 0 && after1.join() === '1000' && h.submitted.join() === '1000,2000' && game.snapshot().score === 2000,
        `level 1 at par ${par1} -> submitted ${after1.join(',')}; level 2 at par -> running total ${h.submitted.join(',')}`,
      );
      // Over par: a hand-built level with par 1, solved in `moves`.
      const overPar = (pairs) => {
        game.phase = 'playing';
        game.level = { ...levels.parseLevel(['########', '#.$@   #', '########']), par: 1 };
        game.resetLevel();
        const before = game.snapshot().score;
        for (let i = 0; i < pairs; i++) { press(game, 'ArrowRight'); press(game, 'ArrowLeft'); }
        press(game, 'ArrowLeft');
        return game.snapshot().score - before;
      };
      const plus2 = overPar(1), floor = overPar(25);
      check('score-over-par', plus2 === 960 && floor === 100, `3 moves on par 1 -> +${plus2} (want 960); 51 moves -> +${floor} (floor 100)`);
    }

    /* ----------------------------- menus ----------------------------- */
    {
      const { game, h } = started(CrateShift, {});
      const hud = h.hud;
      const labels = (hud.stats || []).map((s) => s.label).join(',');
      check('hud', labels === 'Level,Moves,Par,Score,Best' && hud.badge === 'LEVEL 1/3', `stats=${labels} badge=${hud.badge}`);
      const before = game.snapshot();
      for (const code of ['Space', 'Enter', 'Escape', 'KeyP']) press(game, code);
      check('ignores-system-keys', game.snapshot().board === before.board && game.snapshot().moves === 0, 'Space/Enter/Escape/KeyP change nothing');
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
    console.log('\nCrate Shift checks ok');
  }
}

await main();
