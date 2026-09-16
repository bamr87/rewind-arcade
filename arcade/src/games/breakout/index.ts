import type { GameManifest } from '../../engine/types';
import { Breakout } from './game';

export const breakoutManifest: GameManifest = {
  id: 'breakout',
  title: 'Breakout',
  tagline: 'Bounce the ball, clear the wall, do not drop it.',
  year: '1976',
  accent: '#fb7185',
  icon: '🧱',
  description:
    'A paddle, a ball, and a wall of bricks. Knock every brick out before you run out of balls. Upper rows score more.',
  howTo: [
    { icon: '🖱', text: 'Slide the paddle with the mouse or arrow keys.' },
    { icon: '🟢', text: 'Click or press F to serve a stuck ball.' },
    { icon: '🧱', text: 'Clear every brick to win the round.' },
    { icon: '🎮', text: 'Gamepad: the d-pad slides the paddle, either face button serves.' },
  ],
  pad: { south: 'KeyF', east: 'KeyF', r1: 'KeyF' },
  config: [
    { key: 'rows', label: 'Brick rows', type: 'range', min: 3, max: 8, step: 1, default: 6, restart: true },
    { key: 'cols', label: 'Brick columns', type: 'range', min: 6, max: 14, step: 1, default: 10, restart: true },
    { key: 'speed', label: 'Ball speed', type: 'range', min: 240, max: 440, step: 20, default: 320, restart: true },
  ],
  create: (ctx) => new Breakout(ctx),
};
