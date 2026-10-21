import type { GameManifest } from '../engine/types';
import { asteroidsManifest } from './asteroids';
import { bananaBarrageManifest } from './banana-barrage';
import { blockfallManifest } from './blockfall';
import { breakoutManifest } from './breakout';
import { gridlockManifest } from './gridlock';
import { crateShiftManifest } from './crate-shift';
import { flakShackManifest } from './flak-shack';
import { jezzballManifest } from './jezzball';
import { lodeDiggerManifest } from './lode-digger';
import { minesweeperManifest } from './minesweeper';
import { pelletPanicManifest } from './pellet-panic';
import { pongManifest } from './pong';
import { siloSentinelManifest } from './silo-sentinel';
import { rockfallManifest } from './rockfall';
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
  crateShiftManifest,
  flakShackManifest,
  rockfallManifest,
  lodeDiggerManifest,
  bananaBarrageManifest,
  blockfallManifest,
];

export function getGame(id: string | undefined): GameManifest | undefined {
  return GAMES.find((g) => g.id === id);
}
