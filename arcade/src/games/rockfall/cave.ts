/**
 * Rockfall's cave generator. Pure data and a local seeded PRNG — no canvas, no
 * host — so the headless play script can prove its promises over many seeds.
 */

export const EMPTY = 0;
export const DIRT = 1;
export const WALL = 2;
export const BOULDER = 3;
export const GEM = 4;
export const EXIT = 5;
export const PLAYER = 6;

export type Size = 'small' | 'medium' | 'large';
export const SIZES: Record<Size, { cols: number; rows: number }> = {
  small: { cols: 30, rows: 18 },
  medium: { cols: 40, rows: 22 },
  large: { cols: 56, rows: 30 },
};

export interface Pt {
  x: number;
  y: number;
}

export interface Cave {
  seed: number;
  cols: number;
  rows: number;
  tiles: Uint8Array;
  start: Pt;
  exit: Pt;
  /** Gems needed to open the exit. */
  target: number;
}

export interface CaveOptions {
  seed: number;
  size: Size;
  /** Share of interior cells that start as boulders, 0..100. */
  boulders: number;
  /** The gem target; a few extra gems are placed so going over it is possible. */
  gems: number;
}

/** mulberry32: small, fast, and the same stream on every engine. */
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

export const extraGems = (target: number) => Math.max(3, Math.ceil(target * 0.4));

export function generateCave(o: CaveOptions): Cave {
  const { cols, rows } = SIZES[o.size] ?? SIZES.medium;
  const rand = rng(o.seed);
  const int = (n: number) => Math.floor(rand() * n);
  const tiles = new Uint8Array(cols * rows).fill(DIRT);
  const at = (x: number, y: number) => y * cols + x;
  for (let x = 0; x < cols; x++) {
    tiles[at(x, 0)] = WALL;
    tiles[at(x, rows - 1)] = WALL;
  }
  for (let y = 0; y < rows; y++) {
    tiles[at(0, y)] = WALL;
    tiles[at(cols - 1, y)] = WALL;
  }

  const start = { x: 2, y: 2 };
  const nearStart = (x: number, y: number) => Math.abs(x - start.x) <= 2 && Math.abs(y - start.y) <= 2;

  // A few steel ledges for boulders to pile against.
  const ledges = Math.round((cols * rows) / 140);
  for (let i = 0; i < ledges; i++) {
    const len = 3 + int(6);
    const y = 3 + int(rows - 5);
    const x0 = 1 + int(cols - len - 2);
    for (let x = x0; x < x0 + len; x++) if (!nearStart(x, y)) tiles[at(x, y)] = WALL;
  }

  // Exit somewhere in the far third of the cave.
  const exit = { x: Math.floor(cols * 0.67) + int(Math.floor(cols * 0.33) - 1), y: 1 + int(rows - 2) };
  exit.x = Math.min(exit.x, cols - 2);
  tiles[at(exit.x, exit.y)] = EXIT;

  const free = () => {
    for (let tries = 0; tries < 1000; tries++) {
      const x = 1 + int(cols - 2);
      const y = 1 + int(rows - 2);
      if (tiles[at(x, y)] === DIRT && !nearStart(x, y)) return at(x, y);
    }
    return -1;
  };
  const interior = (cols - 2) * (rows - 2);
  const boulders = Math.round((interior * Math.max(0, Math.min(100, o.boulders))) / 100);
  for (let i = 0; i < boulders; i++) {
    const k = free();
    if (k >= 0) tiles[k] = BOULDER;
  }
  const gems = o.gems + extraGems(o.gems);
  for (let i = 0; i < gems; i++) {
    const k = free();
    if (k >= 0) tiles[k] = GEM;
  }

  tiles[at(start.x, start.y)] = PLAYER;
  const cave: Cave = { seed: o.seed, cols, rows, tiles, start, exit, target: o.gems };
  ensureReachable(cave);
  return cave;
}

/** Tiles a digger can pass through on the initial grid, boulder dynamics ignored. */
const passable = (t: number) => t === DIRT || t === EMPTY || t === GEM || t === PLAYER;

/**
 * 4-neighbour flood fill from the start through dirt / empty / gem: how many
 * gems it touches, and whether it reaches the exit.
 */
export function reach(c: Cave): { gems: number; exit: boolean; seen: Uint8Array } {
  const seen = new Uint8Array(c.tiles.length);
  const s = c.start.y * c.cols + c.start.x;
  seen[s] = 1;
  const queue = [s];
  let gems = 0;
  let exit = false;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % c.cols;
    const y = (i - x) / c.cols;
    for (const [dx, dy] of [[0, -1], [-1, 0], [0, 1], [1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= c.cols || ny >= c.rows) continue;
      const j = ny * c.cols + nx;
      if (seen[j]) continue;
      const t = c.tiles[j];
      if (t === EXIT) {
        exit = true;
        seen[j] = 1;
        continue;
      }
      if (!passable(t)) continue;
      seen[j] = 1;
      if (t === GEM) gems++;
      queue.push(j);
    }
  }
  return { gems, exit, seen };
}

/**
 * Carve an L-shaped dirt tunnel from the start to `to`, turning interior
 * boulders and steel into dirt. Both endpoints are interior, so the tunnel
 * never touches the border. `verticalFirst` picks the other corner, for when
 * the first L runs through the (closed) exit.
 */
function carve(c: Cave, to: Pt, verticalFirst = false) {
  const dig = (x: number, y: number) => {
    const i = y * c.cols + x;
    if (c.tiles[i] === BOULDER || c.tiles[i] === WALL) c.tiles[i] = DIRT;
  };
  const { x: sx, y: sy } = c.start;
  const corner = verticalFirst ? { x: sx, y: to.y } : { x: to.x, y: sy };
  for (let x = sx; x !== corner.x; x += Math.sign(corner.x - sx)) dig(x, sy);
  for (let y = sy; y !== corner.y; y += Math.sign(corner.y - sy)) dig(sx, y);
  for (let x = corner.x; x !== to.x; x += Math.sign(to.x - corner.x)) dig(x, corner.y);
  for (let y = corner.y; y !== to.y; y += Math.sign(to.y - corner.y)) dig(corner.x, y);
  dig(corner.x, corner.y);
}

const index = (c: Cave, p: Pt) => p.y * c.cols + p.x;

/** Make the exit and at least `target` gems reachable, carving the fewest tunnels needed. */
function ensureReachable(c: Cave) {
  let r = reach(c);
  if (!r.exit) {
    carve(c, c.exit);
    r = reach(c);
  }
  if (!r.exit) {
    carve(c, c.exit, true);
    r = reach(c);
  }
  if (r.gems >= c.target) return;
  const stranded: Pt[] = [];
  for (let i = 0; i < c.tiles.length; i++) {
    if (c.tiles[i] === GEM && !r.seen[i]) stranded.push({ x: i % c.cols, y: Math.floor(i / c.cols) });
  }
  stranded.sort((a, b) => Math.abs(a.x - c.start.x) + Math.abs(a.y - c.start.y) - (Math.abs(b.x - c.start.x) + Math.abs(b.y - c.start.y)));
  for (const g of stranded) {
    if (r.seen[index(c, g)]) continue; // an earlier tunnel already opened it
    carve(c, g);
    r = reach(c);
    if (!r.seen[index(c, g)]) {
      carve(c, g, true);
      r = reach(c);
    }
    if (r.gems >= c.target) return;
  }
}
