import type { GameManifest } from '../engine/types';
import { asteroidsManifest } from './asteroids';
import { breakoutManifest } from './breakout';
import { flakShackManifest } from './flak-shack';
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
  flakShackManifest,
];

export function getGame(id: string | undefined): GameManifest | undefined {
  return GAMES.find((g) => g.id === id);
}
