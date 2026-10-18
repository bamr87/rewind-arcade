/**
 * Touchdown terrain: a midpoint-displacement ridge line with flattened landing
 * pads. Pure functions, so the headless checker can prove every `rough` × `pads`
 * combination over many generations without a canvas.
 */

export const WIDTH = 800;
/** Ridge vertices; a power of two plus one so midpoint displacement divides evenly. */
export const POINTS = 129;
export const STEP = WIDTH / (POINTS - 1);
/** Highest (smallest y) and lowest the ridge may reach. */
export const TOP_Y = 270;
export const FLOOR_Y = 580;
/** The lander spawns at this y, well above the highest possible pad. */
export const SPAWN_Y = 60;
/** Distance between the lander's feet; every pad must be wider than this. */
export const LANDER_SPAN = 24;
/** Narrower pads pay more. Width is in ridge steps (6.25 px each). */
export const PAD_STEPS: Record<number, number> = { 2: 13, 3: 10, 4: 7, 5: 5 };
const MARGIN = 3;

export interface Pad {
  /** Ridge vertex indices; the pad spans vertices i0..i1 inclusive. */
  i0: number;
  i1: number;
  x0: number;
  x1: number;
  y: number;
  mult: number;
}

export interface Terrain {
  ys: number[];
  pads: Pad[];
}

export type Rand = () => number;

/** Ground height (y, down is positive) at any x, interpolated between vertices. */
export function groundAt(t: Terrain, x: number): number {
  const f = Math.min(Math.max(x / STEP, 0), POINTS - 1);
  const i = Math.min(Math.floor(f), POINTS - 2);
  const k = f - i;
  return t.ys[i] * (1 - k) + t.ys[i + 1] * k;
}

/** The pad under the span [xl, xr], if both ends rest on the same one. */
export function padUnder(t: Terrain, xl: number, xr: number): Pad | undefined {
  return t.pads.find((p) => xl >= p.x0 && xr <= p.x1);
}

/**
 * `rough` 1..10 scales the displacement; `pads` 2..5 flat pads are cut into
 * equal-width slots so they never overlap, each with a ×2..×5 multiplier.
 */
export function generateTerrain(rough: number, pads: number, rand: Rand = Math.random): Terrain {
  const ys = new Array<number>(POINTS).fill(0);
  const mid = (TOP_Y + FLOOR_Y) / 2;
  ys[0] = mid + (rand() - 0.5) * 120;
  ys[POINTS - 1] = mid + (rand() - 0.5) * 120;
  let amp = 30 + rough * 18;
  for (let size = POINTS - 1; size > 1; size /= 2) {
    for (let i = size / 2; i < POINTS; i += size) {
      ys[i] = (ys[i - size / 2] + ys[i + size / 2]) / 2 + (rand() - 0.5) * amp;
    }
    amp *= 0.5 + rough * 0.02;
  }
  for (let i = 0; i < POINTS; i++) ys[i] = Math.min(Math.max(ys[i], TOP_Y), FLOOR_Y);

  // Shuffle the multipliers so a high-value pad is not always in the same slot.
  const mults = [2, 3, 4, 5];
  for (let i = mults.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [mults[i], mults[j]] = [mults[j], mults[i]];
  }
  const slot = (POINTS - 1) / pads;
  const out: Pad[] = [];
  for (let n = 0; n < pads; n++) {
    const mult = mults[n % mults.length];
    const w = PAD_STEPS[mult];
    const lo = Math.ceil(n * slot) + MARGIN;
    const hi = Math.floor((n + 1) * slot) - MARGIN - w;
    const i0 = lo + Math.floor(rand() * (hi - lo + 1));
    const i1 = i0 + w;
    let sum = 0;
    for (let i = i0; i <= i1; i++) sum += ys[i];
    const y = Math.round(sum / (w + 1));
    for (let i = i0; i <= i1; i++) ys[i] = y;
    out.push({ i0, i1, x0: i0 * STEP, x1: i1 * STEP, y, mult });
  }
  return { ys, pads: out };
}

/** Every broken promise of `generateTerrain`; empty means the terrain is sound. */
export function checkTerrain(t: Terrain, pads: number): string[] {
  const problems: string[] = [];
  if (t.ys.length !== POINTS) problems.push(`${t.ys.length} vertices, want ${POINTS}`);
  if (t.pads.length !== pads) problems.push(`${t.pads.length} pads, want ${pads}`);
  for (const y of t.ys) {
    if (!(y >= TOP_Y && y <= FLOOR_Y)) {
      problems.push(`vertex y=${y} outside ${TOP_Y}..${FLOOR_Y}`);
      break;
    }
  }
  t.pads.forEach((p, n) => {
    if (!PAD_STEPS[p.mult]) problems.push(`pad ${n}: multiplier ×${p.mult}`);
    if (p.x1 - p.x0 <= LANDER_SPAN) problems.push(`pad ${n}: ${p.x1 - p.x0}px is not wider than the lander`);
    if (p.y <= SPAWN_Y) problems.push(`pad ${n}: y=${p.y} is not below the spawn`);
    if (p.i0 < 0 || p.i1 >= POINTS) problems.push(`pad ${n}: off the map`);
    for (let i = p.i0; i <= p.i1; i++) {
      if (t.ys[i] !== p.y) {
        problems.push(`pad ${n}: vertex ${i} is not flat`);
        break;
      }
    }
    const next = t.pads[n + 1];
    if (next && next.i0 <= p.i1) problems.push(`pads ${n} and ${n + 1} overlap`);
  });
  return problems;
}
