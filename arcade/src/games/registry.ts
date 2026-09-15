import type { GameManifest } from '../engine/types';
import { asteroidsManifest } from './asteroids';
import { breakoutManifest } from './breakout';
import { jezzballManifest } from './jezzball';
import { minesweeperManifest } from './minesweeper';
import { pongManifest } from './pong';
import { snakeManifest } from './snake';

export const GAMES: GameManifest[] = [
  pongManifest,
  jezzballManifest,
  breakoutManifest,
  snakeManifest,
  asteroidsManifest,
  minesweeperManifest,
];

export function getGame(id: string | undefined): GameManifest | undefined {
  return GAMES.find((g) => g.id === id);
}
