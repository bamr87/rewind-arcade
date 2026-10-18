import type { GameManifest } from '../engine/types';
import { asteroidsManifest } from './asteroids';
import { breakoutManifest } from './breakout';
import { gridlockManifest } from './gridlock';
import { jezzballManifest } from './jezzball';
import { minesweeperManifest } from './minesweeper';
import { pelletPanicManifest } from './pellet-panic';
import { pongManifest } from './pong';
import { siloSentinelManifest } from './silo-sentinel';
import { skifreeManifest } from './skifree';
import { snakeManifest } from './snake';
import { touchdownManifest } from './touchdown';

export const GAMES: GameManifest[] = [
  pongManifest,
  jezzballManifest,
  breakoutManifest,
  snakeManifest,
  asteroidsManifest,
  minesweeperManifest,
  skifreeManifest,
  pelletPanicManifest,
  siloSentinelManifest,
  touchdownManifest,
  gridlockManifest,
];

export function getGame(id: string | undefined): GameManifest | undefined {
  return GAMES.find((g) => g.id === id);
}
