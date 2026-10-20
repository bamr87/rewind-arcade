/**
 * Rogue's Hour dungeon generation and field of view. Pure functions over a seed,
 * so a seed always rebuilds the same level and the headless checks can compare maps.
 */

export const MAP_W = 80;
export const MAP_H = 28;

export const ROCK = 0;
export const WALL = 1;
export const FLOOR = 2;
export const CORRIDOR = 3;
export const DOOR = 4;

export interface Room { x0: number; y0: number; x1: number; y1: number }

export interface MonsterKind {
  glyph: string;
  name: string;
  hp: number;
  min: number;
  max: number;
  depth: number;
  color: string;
  /** Moves at random half the time, like a bat. */
  erratic?: boolean;
}

export const MONSTERS: MonsterKind[] = [
  { glyph: 'B', name: 'bat', hp: 3, min: 1, max: 2, depth: 1, color: '#a78bfa', erratic: true },
  { glyph: 'K', name: 'kobold', hp: 4, min: 1, max: 3, depth: 1, color: '#86efac' },
  { glyph: 'S', name: 'snake', hp: 5, min: 1, max: 3, depth: 2, color: '#4ade80' },
  { glyph: 'H', name: 'hobgoblin', hp: 8, min: 1, max: 4, depth: 3, color: '#fb923c' },
  { glyph: 'O', name: 'orc', hp: 11, min: 2, max: 5, depth: 4, color: '#facc15' },
  { glyph: 'Z', name: 'zombie', hp: 14, min: 2, max: 6, depth: 5, color: '#94a3b8' },
  { glyph: 'T', name: 'troll', hp: 20, min: 3, max: 8, depth: 7, color: '#f87171' },
];

export interface Spawn { x: number; y: number; kind: number }

export interface Level {
  depth: number;
  seed: number;
  tiles: Uint8Array;
  rooms: Room[];
  start: number;
  stairs: number;
  gold: Map<number, number>;
  potions: Set<number>;
  monsters: Spawn[];
}

/* ---------------------------------- PRNG ---------------------------------- */

export type Rng = () => number;

/** mulberry32: small, fast, and identical on every JS engine. */
export function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const int = (r: Rng, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));

export function hash32(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return h >>> 0;
}

/** The daily seed: the player's LOCAL calendar date as YYYYMMDD. */
export function dailySeed(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export const idx = (x: number, y: number): number => y * MAP_W + x;

/* -------------------------------- Generator ------------------------------- */

/**
 * Rogue's own layout: a 3 × 3 grid of sectors with one room each, joined along a
 * random spanning tree (plus a loop or two) by doglegged corridors that turn in
 * the gap between rooms, so every room is reachable and no corridor runs along a wall.
 */
export function generateLevel(baseSeed: number, depth: number): Level {
  const seed = hash32(baseSeed, depth);
  const r = rng(seed);
  const tiles = new Uint8Array(MAP_W * MAP_H);
  const colW = [26, 27, 27];
  const rowH = [9, 9, 10];
  const rooms: Room[] = [];
  let sy = 0;
  for (let gy = 0; gy < 3; gy++) {
    let sx = 0;
    for (let gx = 0; gx < 3; gx++) {
      const sw = colW[gx], sh = rowH[gy];
      const w = int(r, 6, sw - 4), h = int(r, 4, sh - 2);
      const x0 = int(r, sx + 1, sx + sw - 1 - w), y0 = int(r, sy + 1, sy + sh - 1 - h);
      const room = { x0, y0, x1: x0 + w - 1, y1: y0 + h - 1 };
      rooms.push(room);
      for (let y = room.y0; y <= room.y1; y++) {
        for (let x = room.x0; x <= room.x1; x++) {
          const edge = x === room.x0 || x === room.x1 || y === room.y0 || y === room.y1;
          tiles[idx(x, y)] = edge ? WALL : FLOOR;
        }
      }
      sx += sw;
    }
    sy += rowH[gy];
  }

  // Spanning tree by randomized DFS over the sector grid, then one or two extra links.
  const edges = new Set<string>();
  const seen = new Set<number>([int(r, 0, 8)]);
  const stack = [...seen];
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const next = neighbours(cur).filter((n) => !seen.has(n));
    if (!next.length) { stack.pop(); continue; }
    const n = next[int(r, 0, next.length - 1)];
    edges.add(edgeKey(cur, n));
    seen.add(n);
    stack.push(n);
  }
  for (let extra = int(r, 1, 2); extra > 0; extra--) {
    const a = int(r, 0, 8);
    const ns = neighbours(a);
    edges.add(edgeKey(a, ns[int(r, 0, ns.length - 1)]));
  }
  for (const e of edges) {
    const [a, b] = e.split('-').map(Number);
    connect(tiles, r, rooms[a], rooms[b], b - a === 1);
  }

  const interior = (room: Room) => idx(int(r, room.x0 + 1, room.x1 - 1), int(r, room.y0 + 1, room.y1 - 1));
  const startRoom = int(r, 0, 8);
  let stairsRoom = int(r, 0, 7);
  if (stairsRoom >= startRoom) stairsRoom++;
  const start = interior(rooms[startRoom]);
  const stairs = interior(rooms[stairsRoom]);
  const taken = new Set([start, stairs]);
  const free = (room: Room) => {
    for (let tries = 0; tries < 20; tries++) {
      const i = interior(room);
      if (!taken.has(i)) { taken.add(i); return i; }
    }
    return -1;
  };

  const gold = new Map<number, number>();
  const potions = new Set<number>();
  for (const room of rooms) {
    if (r() < 0.55) {
      const i = free(room);
      if (i >= 0) gold.set(i, int(r, 2, 8) + int(r, 0, depth * 3));
    }
  }
  for (let n = int(r, 1, 2); n > 0; n--) {
    const i = free(rooms[int(r, 0, 8)]);
    if (i >= 0) potions.add(i);
  }

  const monsters: Spawn[] = [];
  const kinds = MONSTERS.map((m, k) => ({ m, k })).filter(({ m }) => m.depth <= depth);
  for (let n = 3 + Math.min(depth, 9); n > 0; n--) {
    let ri = int(r, 0, 8);
    if (ri === startRoom) ri = (ri + 1 + int(r, 0, 7)) % 9;
    const i = free(rooms[ri]);
    if (i < 0) continue;
    // Favour the strongest kinds the depth allows.
    const pick = kinds[Math.min(kinds.length - 1, Math.floor(kinds.length * Math.sqrt(r())))];
    monsters.push({ x: i % MAP_W, y: Math.floor(i / MAP_W), kind: pick.k });
  }

  return { depth, seed, tiles, rooms, start, stairs, gold, potions, monsters };
}

function neighbours(s: number): number[] {
  const x = s % 3, y = Math.floor(s / 3), out: number[] = [];
  if (x > 0) out.push(s - 1);
  if (x < 2) out.push(s + 1);
  if (y > 0) out.push(s - 3);
  if (y < 2) out.push(s + 3);
  return out;
}

const edgeKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

function carve(tiles: Uint8Array, x: number, y: number) {
  const i = idx(x, y);
  if (tiles[i] === ROCK) tiles[i] = CORRIDOR;
}

/** Join two neighbouring rooms (a is left of / above b) with a dogleg through the gap. */
function connect(tiles: Uint8Array, r: Rng, a: Room, b: Room, horizontal: boolean) {
  if (horizontal) {
    const ya = int(r, a.y0 + 1, a.y1 - 1), yb = int(r, b.y0 + 1, b.y1 - 1);
    const mid = int(r, a.x1 + 1, b.x0 - 1);
    tiles[idx(a.x1, ya)] = DOOR;
    tiles[idx(b.x0, yb)] = DOOR;
    for (let x = a.x1 + 1; x <= mid; x++) carve(tiles, x, ya);
    for (let y = Math.min(ya, yb); y <= Math.max(ya, yb); y++) carve(tiles, mid, y);
    for (let x = mid; x < b.x0; x++) carve(tiles, x, yb);
  } else {
    const xa = int(r, a.x0 + 1, a.x1 - 1), xb = int(r, b.x0 + 1, b.x1 - 1);
    const mid = int(r, a.y1 + 1, b.y0 - 1);
    tiles[idx(xa, a.y1)] = DOOR;
    tiles[idx(xb, b.y0)] = DOOR;
    for (let y = a.y1 + 1; y <= mid; y++) carve(tiles, xa, y);
    for (let x = Math.min(xa, xb); x <= Math.max(xa, xb); x++) carve(tiles, x, mid);
    for (let y = mid; y < b.y0; y++) carve(tiles, xb, y);
  }
}

export const walkable = (t: number): boolean => t === FLOOR || t === CORRIDOR || t === DOOR;

/* ---------------------------------- FOV ----------------------------------- */

const OCTANTS = [
  [1, 0, 0, -1, -1, 0, 0, 1],
  [0, 1, -1, 0, 0, -1, 1, 0],
  [0, 1, 1, 0, 0, -1, -1, 0],
  [1, 0, 0, 1, -1, 0, 0, -1],
];

/**
 * Recursive shadowcasting (Björn Bergström's formulation on RogueBasin): marks every
 * tile within `radius` of (cx, cy) that a straight line can reach. Walls and rock
 * block sight but are themselves visible, so room outlines show up.
 */
export function computeFov(tiles: Uint8Array, cx: number, cy: number, radius: number, out: Uint8Array) {
  out.fill(0);
  out[idx(cx, cy)] = 1;
  for (let o = 0; o < 8; o++) {
    cast(tiles, out, cx, cy, 1, 1, 0, radius, OCTANTS[0][o], OCTANTS[1][o], OCTANTS[2][o], OCTANTS[3][o]);
  }
}

function opaque(tiles: Uint8Array, x: number, y: number) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return true;
  const t = tiles[idx(x, y)];
  return t === WALL || t === ROCK;
}

function cast(
  tiles: Uint8Array, out: Uint8Array, cx: number, cy: number, row: number,
  start: number, end: number, radius: number, xx: number, xy: number, yx: number, yy: number,
) {
  if (start < end) return;
  const r2 = radius * radius;
  let newStart = 0;
  for (let j = row; j <= radius; j++) {
    let dx = -j - 1;
    const dy = -j;
    let blocked = false;
    while (dx <= 0) {
      dx++;
      const X = cx + dx * xx + dy * xy, Y = cy + dx * yx + dy * yy;
      const lSlope = (dx - 0.5) / (dy + 0.5), rSlope = (dx + 0.5) / (dy - 0.5);
      if (start < rSlope) continue;
      if (end > lSlope) break;
      if (dx * dx + dy * dy <= r2 && X >= 0 && Y >= 0 && X < MAP_W && Y < MAP_H) out[idx(X, Y)] = 1;
      if (blocked) {
        if (opaque(tiles, X, Y)) { newStart = rSlope; continue; }
        blocked = false;
        start = newStart;
      } else if (opaque(tiles, X, Y) && j < radius) {
        blocked = true;
        cast(tiles, out, cx, cy, j + 1, start, lSlope, radius, xx, xy, yx, yy);
        newStart = rSlope;
      }
    }
    if (blocked) break;
  }
}
