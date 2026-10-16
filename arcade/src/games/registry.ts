import type { GameManifest } from '../engine/types';
import { asteroidsManifest } from './asteroids';
import { breakoutManifest } from './breakout';
import { crateShiftManifest } from './crate-shift';
import { jezzballManifest } from './jezzball';
import { minesweeperManifest } from './minesweeper';
import { pelletPanicManifest } from './pellet-panic';
import { pongManifest } from './pong';
import { skifreeManifest } from './skifree';
import { snakeManifest } from './snake';

export const GAMES: GameManifest[] = [
  pongManifest,
  jezzballManifest,
  breakoutManifest,
  snakeManifest,
  asteroidsManifest,
  minesweeperManifest,
  skifreeManifest,
  pelletPanicManifest,
  crateShiftManifest,
];

export function getGame(id: string | undefined): GameManifest | undefined {
  return GAMES.find((g) => g.id === id);
}
