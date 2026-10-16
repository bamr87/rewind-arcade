import type { GameManifest } from '../../engine/types';
import { CrateShift } from './game';

export const crateShiftManifest: GameManifest = {
  id: 'crate-shift',
  title: 'Crate Shift',
  tagline: 'Push every crate home. Never pull.',
  year: '1982',
  accent: '#f59e0b',
  icon: '📦',
  description:
    'A warehouse puzzle in the spirit of Thinking Rabbit’s Sokoban. Walk into a crate to push it; crates never pull, so one careless shove into a corner can trap it for good. Every level is generated backwards from its own solution, so each one can be solved — and undo is unlimited.',
  howTo: [
    { icon: '⬆', text: 'Arrows / WASD move. Walk into a crate to push it one square.' },
    { icon: '📦', text: 'Get every crate onto a target to clear the level. Crates cannot be pulled.' },
    { icon: '↩', text: 'Z, U or Backspace undoes a move, back to the level start. R restarts the level.' },
    { icon: '🏁', text: 'Par counts every step of a known solution: match it for 1,000, beat it for more.' },
    { icon: '🎮', text: 'Gamepad: d-pad moves, the west button undoes, north restarts the level.' },
  ],
  pad: { west: 'KeyZ', north: 'KeyR' },
  config: [
    {
      key: 'size', label: 'Warehouse size', type: 'select', default: 'medium', restart: true,
      options: [
        { value: 'small', label: 'Small' },
        { value: 'medium', label: 'Medium' },
        { value: 'large', label: 'Large' },
      ],
      help: 'Floor area of the first level; each later level grows a little, up to the size’s cap.',
    },
    { key: 'crates', label: 'Crates', type: 'range', min: 2, max: 6, step: 1, default: 3, restart: true, help: 'Crates (and targets) per level.' },
    { key: 'seed', label: 'Level seed', type: 'range', min: 0, max: 9999, step: 1, default: 0, restart: true, help: '0 builds a new run of levels every game; any other number replays the same run.' },
    { key: 'levels', label: 'Levels per run', type: 'range', min: 3, max: 20, step: 1, default: 10, restart: true, help: 'How many levels a run lasts.' },
  ],
  create: (ctx) => new CrateShift(ctx),
};
