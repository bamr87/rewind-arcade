/**
 * Pellet Panic's maze generator — pure, deterministic, and checkable.
 *
 * A maze is built on a lattice of corridor lines (columns `XS`, rows `YS`).
 * Every lattice node starts joined to its neighbours; edges are then removed at
 * random, but only on the left half (the right half is its mirror image) and
 * only when both ends keep at least two exits and the graph stays connected.
 * Because the lines sit at least two tiles apart, corridors never touch except
 * at nodes, so "no node of degree < 2" is exactly "no dead-end tile".
 * `checkMaze()` re-proves the three promises on the finished tiles.
 */

export const COLS = 28;
export const ROWS = 31;

export const WALL = 0;
export const PATH = 1;
export const PEN = 2;
export const DOOR = 3;

export interface Pt {
  x: number;
  y: number;
}

export interface Maze {
  seed: number;
  /** Row-major `ROWS * COLS` grid of WALL / PATH / PEN / DOOR. */
  tiles: Uint8Array;
  /** Rows whose left and right edges wrap into each other. */
  tunnels: number[];
  /** Where the player starts each life (and the bonus fruit appears). */
  spawn: Pt;
  /** The corridor tile directly above the pen door. */
  exit: Pt;
  /** Pen tiles the chasers wait on. */
  slots: Pt[];
  /** The four power pellets. */
  power: Pt[];
}

/* Left-half corridor lines; the right half mirrors them (x -> COLS - 1 - x). */
const XL = [1, 4, 8, 11];
const XS = [...XL, ...XL.map((x) => COLS - 1 - x).reverse()];
const YS = [1, 4, 7, 10, 13, 16, 19, 22, 25, 29];
const CX = XL[XL.length - 1]; // 11: the last left line; its mirror is 16
/* The chaser pen: a walled box with a two-tile door on top. */
const PEN_X0 = 12;
const PEN_X1 = 15;
const PEN_Y0 = 11;
const PEN_Y1 = 15;
const PEN_ROW = 13; // the lattice row the pen sits on; no centre crossing there
const SPAWN_ROW = 22;
const REMOVE_P = 0.7;

export const mirrorX = (x: number): number => COLS - 1 - x;
export const wrapX = (x: number): number => ((x % COLS) + COLS) % COLS;
export const tileAt = (m: Maze, x: number, y: number): number =>
  y < 0 || y >= ROWS ? WALL : m.tiles[y * COLS + wrapX(x)];

/** mulberry32 — small, fast, and good enough to lay out corridors. */
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

interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  on: boolean;
  forced: boolean;
}

const key = (x: number, y: number) => y * COLS + x;

/** The mirror image of a left-half edge (a centre crossing is its own mirror). */
function mirrored(e: Edge): [number, number, number, number] {
  return [mirrorX(e.x2), e.y2, mirrorX(e.x1), e.y1];
}

export function generateMaze(seed: number): Maze {
  const rand = rng(seed);
  const tunnels = [PEN_ROW, ...(rand() < 0.5 ? [rand() < 0.5 ? 7 : 19] : [])];

  // Left-half lattice, plus the centre crossings between x=11 and its mirror.
  const edges: Edge[] = [];
  const add = (x1: number, y1: number, x2: number, y2: number, forced = false) =>
    edges.push({ x1, y1, x2, y2, on: true, forced });
  for (const y of YS) {
    for (let i = 0; i + 1 < XL.length; i++) add(XL[i], y, XL[i + 1], y);
    if (y !== PEN_ROW) {
      const ring = y === PEN_ROW - 3 || y === PEN_ROW + 3 || y === SPAWN_ROW;
      add(CX, y, mirrorX(CX), y, ring);
    }
  }
  for (const x of XL) {
    for (let j = 0; j + 1 < YS.length; j++) {
      const ring = x === CX && YS[j] >= PEN_ROW - 3 && YS[j + 1] <= PEN_ROW + 3;
      add(x, YS[j], x, YS[j + 1], ring);
    }
  }
  for (const y of tunnels) add(0, y, XL[0], y, true);

  const degree = (px: number, y: number): number => {
    // Only left-half edges are stored; a right-half end reads its mirror.
    const x = px > CX ? mirrorX(px) : px;
    let d = 0;
    for (const e of edges) {
      if (!e.on) continue;
      if ((e.x1 === x && e.y1 === y) || (e.x2 === x && e.y2 === y)) d++;
    }
    return d;
  };

  const connected = (): boolean => {
    const adj = new Map<number, number[]>();
    const link = (a: number, b: number) => {
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.has(b)) adj.set(b, []);
      adj.get(a)?.push(b);
      adj.get(b)?.push(a);
    };
    for (const e of edges) {
      if (!e.on) continue;
      link(key(e.x1, e.y1), key(e.x2, e.y2));
      const [a, b, c, d] = mirrored(e);
      link(key(a, b), key(c, d));
    }
    // A tunnel row's two border tiles are one corridor.
    for (const y of tunnels) link(key(0, y), key(COLS - 1, y));
    const nodes = XS.flatMap((x) => YS.map((y) => key(x, y)));
    const seen = new Set<number>([nodes[0]]);
    const queue = [nodes[0]];
    while (queue.length) {
      const n = queue.pop() as number;
      for (const m of adj.get(n) ?? []) {
        if (!seen.has(m)) {
          seen.add(m);
          queue.push(m);
        }
      }
    }
    return nodes.every((n) => seen.has(n));
  };

  const order = edges.filter((e) => !e.forced);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const e of order) {
    if (rand() > REMOVE_P) continue;
    if (degree(e.x1, e.y1) <= 2 || degree(e.x2, e.y2) <= 2) continue;
    e.on = false;
    if (!connected()) e.on = true;
  }

  // Carve the corridors, then the pen.
  const tiles = new Uint8Array(ROWS * COLS);
  const carve = (x1: number, y1: number, x2: number, y2: number) => {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) tiles[key(x, y)] = PATH;
    }
  };
  for (const e of edges) {
    if (!e.on) continue;
    carve(e.x1, e.y1, e.x2, e.y2);
    const [a, b, c, d] = mirrored(e);
    carve(a, b, c, d);
  }
  for (let y = PEN_Y0 + 1; y < PEN_Y1; y++) {
    for (let x = PEN_X0 + 1; x < PEN_X1; x++) tiles[key(x, y)] = PEN;
  }
  for (let x = PEN_X0 + 1; x < PEN_X1; x++) tiles[key(x, PEN_Y0)] = DOOR;

  const top = YS[1];
  const bottom = YS[YS.length - 2];
  return {
    seed,
    tiles,
    tunnels,
    spawn: { x: PEN_X0 + 1, y: SPAWN_ROW },
    exit: { x: PEN_X0 + 1, y: PEN_Y0 - 1 },
    slots: [
      { x: PEN_X0 + 1, y: PEN_ROW },
      { x: PEN_X1 - 1, y: PEN_ROW },
      { x: PEN_X1 - 1, y: PEN_ROW + 1 },
    ],
    power: [
      { x: XS[0], y: top },
      { x: XS[XS.length - 1], y: top },
      { x: XS[0], y: bottom },
      { x: XS[XS.length - 1], y: bottom },
    ],
  };
}

const STEPS: Pt[] = [
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 0 },
];

/** Walkable neighbours of a corridor tile (rows wrap horizontally). */
export function pathNeighbours(m: Maze, x: number, y: number): Pt[] {
  return STEPS.map((s) => ({ x: wrapX(x + s.x), y: y + s.y })).filter(
    (p) => tileAt(m, p.x, p.y) === PATH,
  );
}

/**
 * Re-prove the generator's promises from the finished tiles alone: left-right
 * symmetry, every corridor reachable from the spawn, and no dead ends. Returns
 * a list of problems — empty means the maze is sound.
 */
export function checkMaze(m: Maze): string[] {
  const problems: string[] = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (tileAt(m, x, y) !== tileAt(m, mirrorX(x), y)) {
        problems.push(`asymmetric at (${x},${y})`);
      }
    }
  }
  const corridor: Pt[] = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) if (tileAt(m, x, y) === PATH) corridor.push({ x, y });
  }
  for (const p of corridor) {
    if (pathNeighbours(m, p.x, p.y).length < 2) problems.push(`dead end at (${p.x},${p.y})`);
  }
  if (tileAt(m, m.spawn.x, m.spawn.y) !== PATH) problems.push('spawn is not a corridor');
  if (tileAt(m, m.exit.x, m.exit.y) !== PATH) problems.push('pen exit is not a corridor');
  for (const p of m.power) {
    if (tileAt(m, p.x, p.y) !== PATH) problems.push(`power pellet off-corridor at (${p.x},${p.y})`);
  }
  const seen = new Set<number>([key(m.spawn.x, m.spawn.y)]);
  const queue = [m.spawn];
  while (queue.length) {
    const p = queue.pop() as Pt;
    for (const n of pathNeighbours(m, p.x, p.y)) {
      if (!seen.has(key(n.x, n.y))) {
        seen.add(key(n.x, n.y));
        queue.push(n);
      }
    }
  }
  if (seen.size !== corridor.length) {
    problems.push(`disconnected: reached ${seen.size} of ${corridor.length} corridor tiles`);
  }
  return problems;
}
