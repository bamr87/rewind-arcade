import type { GameManifest } from '../engine/types';
import { jezzballManifest } from './jezzball';
import { minesweeperManifest } from './minesweeper';
import { snakeManifest } from './snake';

/**
 * The arcade catalog. Adding a game to the portal is exactly this: build a
 * module that exports a `GameManifest`, then add it to this array. Everything
 * else — the arcade card, routing, HUD, config panel, high-score tracking —
 * is derived from the manifest automatically.
 */
export const GAMES: GameManifest[] = [jezzballManifest, minesweeperManifest, snakeManifest];

export function getGame(id: string | undefined): GameManifest | undefined {
  return GAMES.find((g) => g.id === id);
}
