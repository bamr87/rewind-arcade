/**
 * Crate Shift levels, generated in code — there are no level files.
 *
 * Every level is built by *reverse play*: start from the solved position
 * (every crate on a target) and walk the player around at random, sometimes
 * PULLING the crate behind them. A pull is exactly a push run backwards, so
 * replaying the recorded pulls in reverse order as pushes always solves the
 * level — solvability is a property of the construction, not something a
 * solver has to discover. Between pushes the player walks the shortest route,
 * which makes `par` (the length of that forward replay, walks included) a fair
 * target rather than the length of a random walk.
 */

export const FLOOR = 0;
export const WALL = 1;

/** Directions, in arrow-key order: up, left, down, right. */
export const DX = [0, -1, 0, 1];
export const DY = [-1, 0, 1, 0];

export type SizeName = 'small' | 'medium' | 'large';

/** Interior (floor-area) dimensions per size: the first level and the cap. */
export const SIZES: Record<SizeName, { cols: number; rows: number; maxCols: number; maxRows: number }> = {
  small: { cols: 6, rows: 6, maxCols: 8, maxRows: 8 },
  medium: { cols: 7, rows: 7, maxCols: 10, maxRows: 10 },
  large: { cols: 9, rows: 8, maxCols: 13, maxRows: 12 },
};

export interface Level {
  /** Board size including the outer wall ring. */
  cols: number;
  rows: number;
  /** WALL / FLOOR per cell, row-major. */
  tiles: Uint8Array;
  /** Cell indices. */
  targets: number[];
  crates: number[];
  player: number;
  /** Forward solution as directions (0 up, 1 left, 2 down, 3 right). */
  solution: number[];
  /** Moves in the solution — walks included. */
  par: number;
  seed: number;
}

/** mulberry32 — small, fast, and plenty for laying out a warehouse. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Interior size of the n-th level (0-based): one column, then one row, per level. */
export function levelSize(size: SizeName, n: number): { cols: number; rows: number } {
  const s = SIZES[size];
  return {
    cols: Math.min(s.maxCols, s.cols + Math.ceil(n / 2)),
    rows: Math.min(s.maxRows, s.rows + Math.floor(n / 2)),
  };
}

const step = (cols: number, i: number, d: number) => i + DY[d] * cols + DX[d];

/** Shortest walk from `from` to `to` that touches no wall and no crate, or null. */
export function walkPath(cols: number, tiles: Uint8Array, crates: Set<number>, from: number, to: number): number[] | null {
  if (from === to) return [];
  const prev = new Int32Array(tiles.length).fill(-1);
  const how = new Int8Array(tiles.length);
  prev[from] = from;
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head];
    for (let d = 0; d < 4; d++) {
      const n = step(cols, c, d);
      if (prev[n] !== -1 || tiles[n] === WALL || crates.has(n)) continue;
      prev[n] = c;
      how[n] = d;
      if (n === to) {
        const path: number[] = [];
        for (let k = to; k !== from; k = prev[k]) path.push(how[k]);
        return path.reverse();
      }
      queue.push(n);
    }
  }
  return null;
}

/**
 * Carve a room: an outer wall ring, a sprinkle of inner pillars, and only the
 * largest connected floor region kept so nothing is walled off.
 */
function carveRoom(rand: () => number, inner: { cols: number; rows: number }, density: number) {
  const cols = inner.cols + 2, rows = inner.rows + 2;
  const tiles = new Uint8Array(cols * rows).fill(WALL);
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) tiles[y * cols + x] = rand() < density ? WALL : FLOOR;
  }
  const region = new Int32Array(tiles.length).fill(-1);
  let bestId = -1, bestSize = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === WALL || region[i] !== -1) continue;
    const id = i;
    let size = 0;
    const stack = [i];
    region[i] = id;
    while (stack.length) {
      const c = stack.pop() as number;
      size++;
      for (let d = 0; d < 4; d++) {
        const n = step(cols, c, d);
        if (tiles[n] === FLOOR && region[n] === -1) { region[n] = id; stack.push(n); }
      }
    }
    if (size > bestSize) { bestSize = size; bestId = id; }
  }
  for (let i = 0; i < tiles.length; i++) if (tiles[i] === FLOOR && region[i] !== bestId) tiles[i] = WALL;
  return { cols, rows, tiles, floor: bestSize };
}

interface Pull { from: number; dir: number }

/** One reverse-play attempt from the solved position. */
function reversePlay(rand: () => number, cols: number, tiles: Uint8Array, targets: number[], player: number, steps: number) {
  const crates = new Set(targets);
  const pulls: Pull[] = [];
  let p = player;
  for (let s = 0; s < steps; s++) {
    const d = (rand() * 4) | 0;
    const next = step(cols, p, d);
    if (tiles[next] === WALL || crates.has(next)) continue;
    const behind = step(cols, p, (d + 2) % 4);
    if (crates.has(behind) && rand() < 0.75) {
      crates.delete(behind);
      crates.add(p);
      pulls.push({ from: next, dir: (d + 2) % 4 });
    }
    p = next;
  }
  return { crates, player: p, pulls };
}

/**
 * Replay the pulls backwards as pushes, walking the shortest route between
 * them. Crates are interchangeable, so the replay can cover every target
 * before its last push — it stops there, since that is where the game ends.
 */
function forwardSolution(cols: number, tiles: Uint8Array, targets: number[], startCrates: Set<number>, player: number, pulls: Pull[]): number[] {
  const crates = new Set(startCrates);
  const out: number[] = [];
  let p = player;
  for (let k = pulls.length - 1; k >= 0; k--) {
    const { from, dir } = pulls[k];
    const walk = walkPath(cols, tiles, crates, p, from);
    // Unreachable is impossible: the reverse walk itself went this way.
    if (!walk) throw new Error('crate-shift: reverse trace is not replayable');
    out.push(...walk, dir);
    const crate = step(cols, from, dir);
    crates.delete(crate);
    crates.add(step(cols, crate, dir));
    p = crate;
    if (targets.every((t) => crates.has(t))) break;
  }
  return out;
}

/** Cells where a crate could be pulled away at least once (room for player + step). */
function pullable(cols: number, tiles: Uint8Array, i: number): boolean {
  for (let d = 0; d < 4; d++) {
    const a = step(cols, i, d), b = step(cols, a, d);
    if (tiles[a] === FLOOR && tiles[b] === FLOOR) return true;
  }
  return false;
}

/**
 * Build one level. Deterministic in (`seed`, `size`, `crates`, `n`): the same
 * inputs give a byte-identical board and the same solution.
 */
export function generateLevel(seed: number, size: SizeName, crateCount: number, n: number): Level {
  const rand = rng(seed);
  const inner = levelSize(size, n);
  let best: Level | null = null;
  let bestScore = -1;

  for (let room = 0; room < 12; room++) {
    // Later rooms fall back to fewer pillars, ending in an open floor.
    const density = room < 8 ? 0.14 : room < 11 ? 0.06 : 0;
    const { cols, rows, tiles, floor } = carveRoom(rand, inner, density);
    const spots: number[] = [];
    for (let i = 0; i < tiles.length; i++) if (tiles[i] === FLOOR && pullable(cols, tiles, i)) spots.push(i);
    if (spots.length < crateCount + 2 || floor < crateCount * 3 + 4) continue;

    for (let attempt = 0; attempt < 6; attempt++) {
      // Partial Fisher–Yates: the first `crateCount` spots are the targets.
      const pool = spots.slice();
      for (let k = 0; k < crateCount; k++) {
        const j = k + Math.floor(rand() * (pool.length - k));
        const t = pool[k]; pool[k] = pool[j]; pool[j] = t;
      }
      const targets = pool.slice(0, crateCount).sort((a, b) => a - b);
      const free: number[] = [];
      for (let i = 0; i < tiles.length; i++) if (tiles[i] === FLOOR && !targets.includes(i)) free.push(i);
      const start = free[Math.floor(rand() * free.length)];

      const rev = reversePlay(rand, cols, tiles, targets, start, 60 + 30 * crateCount + 6 * n);
      const off = [...rev.crates].filter((c) => !targets.includes(c)).length;
      if (off === 0) continue;
      const solution = forwardSolution(cols, tiles, targets, rev.crates, rev.player, rev.pulls);
      // Prefer levels where every crate has left its target and there is plenty to push.
      const pushes = rev.pulls.length;
      const score = (off === crateCount ? 1000 : off * 100) + Math.min(pushes, 6 * crateCount) * 10 + Math.min(solution.length, 120);
      if (score > bestScore) {
        bestScore = score;
        best = {
          cols, rows, tiles: tiles.slice(), targets,
          crates: [...rev.crates].sort((a, b) => a - b),
          player: rev.player, solution, par: solution.length, seed,
        };
      }
    }
    if (best && bestScore >= 1000 + 10 * Math.min(4, 2 * crateCount)) break;
  }
  if (!best) throw new Error(`crate-shift: could not build a level (seed ${seed}, ${size}, ${crateCount} crates)`);
  return best;
}

/** A stable text form of a board — handy for comparing levels in tests. */
export function boardKey(level: Pick<Level, 'cols' | 'tiles' | 'targets' | 'crates' | 'player'>): string {
  let out = '';
  for (let i = 0; i < level.tiles.length; i++) {
    if (i && i % level.cols === 0) out += '\n';
    const t = level.targets.includes(i), c = level.crates.includes(i);
    out += level.tiles[i] === WALL ? '#' : i === level.player ? (t ? '+' : '@') : c ? (t ? '*' : '$') : t ? '.' : ' ';
  }
  return out;
}

/**
 * Parse classic Sokoban notation (`#` wall, `.` target, `$` crate, `*` crate on
 * target, `@` player, `+` player on target). Used by the rules checks.
 */
export function parseLevel(lines: string[]): Level {
  const rows = lines.length, cols = Math.max(...lines.map((l) => l.length));
  const tiles = new Uint8Array(cols * rows).fill(WALL);
  const targets: number[] = [], crates: number[] = [];
  let player = -1;
  lines.forEach((line, y) => {
    for (let x = 0; x < cols; x++) {
      const ch = line[x] ?? '#', i = y * cols + x;
      if (ch === '#') continue;
      tiles[i] = FLOOR;
      if (ch === '.' || ch === '*' || ch === '+') targets.push(i);
      if (ch === '$' || ch === '*') crates.push(i);
      if (ch === '@' || ch === '+') player = i;
    }
  });
  return { cols, rows, tiles, targets, crates, player, solution: [], par: 0, seed: 0 };
}
