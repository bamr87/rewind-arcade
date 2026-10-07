/**
 * The four chasers' personalities and the scatter/chase clock, kept pure so
 * the rules can be checked without running a game.
 */

import { COLS, ROWS, type Pt } from './maze';

/** Directions in tie-break order: up, left, down, right. */
export const DX = [0, -1, 0, 1];
export const DY = [-1, 0, 1, 0];
export const opposite = (d: number): number => (d + 2) % 4;

export type Rule = 'direct' | 'ambush' | 'flank' | 'shy';

export interface ChaserSpec {
  name: string;
  rule: Rule;
  color: string;
  /** Scatter corner — deliberately outside the maze so they circle near it. */
  corner: Pt;
  /** Seconds after a life starts before this chaser leaves the pen. */
  release: number;
}

export const CHASERS: ChaserSpec[] = [
  { name: 'Rook', rule: 'direct', color: '#f43f5e', corner: { x: COLS - 3, y: -3 }, release: 0 },
  { name: 'Lark', rule: 'ambush', color: '#f472b6', corner: { x: 2, y: -3 }, release: 1 },
  { name: 'Moth', rule: 'flank', color: '#22d3ee', corner: { x: COLS - 1, y: ROWS + 1 }, release: 4 },
  { name: 'Wisp', rule: 'shy', color: '#fb923c', corner: { x: 0, y: ROWS + 1 }, release: 8 },
];

/** How far ahead the ambusher aims, how far the flanker pivots, when the shy one flees. */
export const AMBUSH_AHEAD = 4;
export const FLANK_PIVOT = 2;
export const SHY_RADIUS = 8;

/**
 * Where a chaser aims in chase mode.
 * - direct: the player's tile.
 * - ambush: four tiles ahead of the player.
 * - flank: double the vector from the direct chaser to two tiles ahead of the player.
 * - shy: the player while far away, its own corner once within `SHY_RADIUS`.
 */
export function chaseTarget(
  rule: Rule,
  player: Pt & { dir: number },
  self: Pt,
  direct: Pt,
  corner: Pt,
): Pt {
  const dx = player.dir >= 0 ? DX[player.dir] : 0;
  const dy = player.dir >= 0 ? DY[player.dir] : 0;
  switch (rule) {
    case 'direct':
      return { x: player.x, y: player.y };
    case 'ambush':
      return { x: player.x + dx * AMBUSH_AHEAD, y: player.y + dy * AMBUSH_AHEAD };
    case 'flank': {
      const px = player.x + dx * FLANK_PIVOT;
      const py = player.y + dy * FLANK_PIVOT;
      return { x: px * 2 - direct.x, y: py * 2 - direct.y };
    }
    case 'shy':
      return Math.hypot(self.x - player.x, self.y - player.y) > SHY_RADIUS
        ? { x: player.x, y: player.y }
        : { x: corner.x, y: corner.y };
  }
}

/** Alternating scatter / chase phases, in seconds; the last chase never ends. */
export const SCHEDULE = [7, 20, 7, 20, 5, 20, 5, Infinity];

export type Mode = 'scatter' | 'chase';

/** The mode in force after `t` seconds of un-frightened play this life. */
export function modeAt(t: number): Mode {
  let acc = 0;
  for (let i = 0; i < SCHEDULE.length; i++) {
    acc += SCHEDULE[i];
    if (t < acc) return i % 2 === 0 ? 'scatter' : 'chase';
  }
  return 'chase';
}

/** Points for the n-th chaser (0-based) eaten during one fright: 200, 400, 800, 1600. */
export const frightPoints = (n: number): number => 200 * 2 ** Math.min(n, 3);
