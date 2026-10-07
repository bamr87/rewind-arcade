import type { GameManifest } from '../../engine/types';
import { PelletPanic } from './game';

export const pelletPanicManifest: GameManifest = {
  id: 'pellet-panic',
  title: 'Pellet Panic',
  tagline: 'Eat every pellet. Outrun four chasers. Never the same maze twice.',
  year: '1980',
  accent: '#facc15',
  icon: '🟡',
  description:
    'An original maze chase in the spirit of the 1980 arcade classic. Clear every pellet while four chasers — each with its own way of hunting — close in. Every level builds a fresh mirrored maze, so there is no route to memorise.',
  howTo: [
    { icon: '⬆', text: 'Steer with the arrow keys or W A S D. Press a turn early and it is taken at the next opening.' },
    { icon: '⚡', text: 'A power pellet turns the chasers blue: they slow, turn back, and can be eaten for 200 / 400 / 800 / 1600.' },
    { icon: '🍒', text: 'Bonus fruit appears twice a level under the pen — 100 to 500 points.' },
    { icon: '↔', text: 'The side tunnels wrap around, and slow the chasers down.' },
    { icon: '🎮', text: 'Gamepad: stick or d-pad steers, Start pauses.' },
  ],
  config: [
    { key: 'lives', label: 'Lives', type: 'range', min: 1, max: 5, step: 1, default: 3, restart: true, help: 'Lives at the start of a game.' },
    { key: 'chaserSpeed', label: 'Chaser speed', type: 'range', min: 70, max: 110, step: 5, default: 85, unit: ' %', restart: true, help: "The chasers' speed as a share of yours, before level scaling." },
    { key: 'fright', label: 'Fright time', type: 'range', min: 2, max: 10, step: 1, default: 6, unit: ' s', restart: true, help: 'How long a power pellet keeps the chasers edible.' },
    { key: 'seed', label: 'Maze seed', type: 'range', min: 0, max: 9999, step: 1, default: 0, restart: true, help: '0 builds a new run of mazes every game; any other number replays the same run.' },
  ],
  create: (ctx) => new PelletPanic(ctx),
};
