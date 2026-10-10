import type { GameManifest } from '../../engine/types';
import { LodeDigger } from './game';
import { LEVELS } from './levels';

export const lodeDiggerManifest: GameManifest = {
  id: 'lode-digger',
  title: 'Lode Digger',
  tagline: 'Take the gold. Dig the traps. Get out before the bricks come back.',
  year: '1983',
  accent: '#f59e0b',
  icon: '⛏️',
  description:
    'An original platformer in the spirit of the 1983 home-computer classic. Run, climb and swing hand over hand across a grid of bricks, ladders and bars, taking every piece of gold while guards chase you. Dig holes to trap them — but holes refill on a steady beat, so every dig is a bet on timing.',
  howTo: [
    { icon: '⬆', text: 'Run and climb with the arrow keys or W A S D. Down lets go of a bar.' },
    { icon: '⛏️', text: 'Z or Q digs the brick down-left, X or E down-right. A guard that falls in is stuck for a while.' },
    { icon: '🥁', text: 'Holes refill on the beat — the last four beats tick and the brick fills in. Never be inside when it closes.' },
    { icon: '🪜', text: 'Take all the gold and the escape ladder appears. Climb off the top to clear the level.' },
    { icon: '↺', text: 'R restarts the level and costs a life.' },
    { icon: '🎮', text: 'Gamepad: d-pad or stick moves; left face button or L1 digs left, right face button or R1 digs right; top face button restarts; Start pauses.' },
  ],
  pad: { west: 'KeyZ', east: 'KeyX', l1: 'KeyZ', r1: 'KeyX', north: 'KeyR' },
  config: [
    {
      key: 'startLevel',
      label: 'Start level',
      type: 'select',
      options: LEVELS.map((lv, i) => ({ value: String(i + 1), label: `${i + 1} — ${lv.name}` })),
      default: '1',
      restart: true,
      help: 'Which built-in level a new game starts on.',
    },
    { key: 'lives', label: 'Lives', type: 'range', min: 1, max: 9, step: 1, default: 5, restart: true, help: 'Lives at the start of a game.' },
    { key: 'guardSpeed', label: 'Guard speed', type: 'range', min: 50, max: 120, step: 10, default: 80, unit: ' %', restart: true, help: "The guards' speed as a share of yours." },
    { key: 'refill', label: 'Hole refill', type: 'range', min: 3, max: 10, step: 1, default: 6, unit: ' s', restart: true, help: 'How long a hole stays open. It always closes on the next beat after this.' },
  ],
  create: (ctx) => new LodeDigger(ctx),
};
