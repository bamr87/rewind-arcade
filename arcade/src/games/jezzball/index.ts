import type { GameManifest } from '../../engine/types';
import { JezzBall } from './game';

export const jezzballManifest: GameManifest = {
  id: 'jezzball',
  title: 'JezzBall',
  tagline: 'Trap the bouncing atoms and claim the arena.',
  year: '1992',
  accent: '#38bdf8',
  icon: '🧱',
  description:
    'The Microsoft Entertainment Pack classic. Grow walls to partition the play field and seal off empty space while the balls ricochet — but never let a ball touch a wall mid-build.',
  howTo: [
    { icon: '🧱', text: 'Click to grow a wall in both directions from that point.' },
    { icon: '↕', text: 'Right-click, scroll, or press V to rotate the wall.' },
    { icon: '⚠️', text: 'A ball hitting a growing wall shatters it and costs a life.' },
    { icon: '🏁', text: 'Seal off the target % of the arena to clear the level.' },
    { icon: '🎮', text: 'Gamepad: either face button rotates the wall. Building still wants a pointer.' },
  ],
  // JezzBall paints its own crosshair and chevrons in drawGuide().
  cursor: 'none',
  pad: { south: 'KeyV', east: 'KeyV', west: 'KeyV' },
  config: [
    { key: 'cols', label: 'Arena width', type: 'range', min: 24, max: 56, step: 1, default: 40, unit: ' cols', restart: true, help: 'Number of columns in the play field.' },
    { key: 'rows', label: 'Arena height', type: 'range', min: 16, max: 32, step: 1, default: 25, unit: ' rows', restart: true, help: 'Number of rows in the play field.' },
    { key: 'winTarget', label: 'Capture target', type: 'range', min: 50, max: 90, step: 5, default: 75, unit: '%', restart: true, help: 'Share of the arena you must seal off to clear a level.' },
    { key: 'startBalls', label: 'Starting balls', type: 'range', min: 1, max: 5, step: 1, default: 2, restart: true, help: 'Balls on level 1. Each level adds one more.' },
    { key: 'ballSpeed', label: 'Ball speed', type: 'range', min: 60, max: 160, step: 10, default: 100, unit: '%', restart: true, help: 'Relative speed of the balls.' },
    { key: 'buildSpeed', label: 'Wall speed', type: 'range', min: 6, max: 26, step: 1, default: 13, help: 'How fast walls extend, in cells per second.' },
  ],
  create: (ctx) => new JezzBall(ctx),
};
