import type { GameManifest } from '../../engine/types';
import { Snake } from './game';

export const snakeManifest: GameManifest = {
  id: 'snake',
  title: 'Snake',
  tagline: 'Eat, grow, and stay off your own tail.',
  year: '1976',
  accent: '#4ade80',
  icon: '🐍',
  description:
    'The arcade staple that shipped on a billion Nokia phones. Steer a hungry snake around the board, eat apples to grow longer and faster, and avoid biting your own tail.',
  howTo: [
    { icon: '⬆', text: 'Steer with arrow keys or W A S D.' },
    { icon: '👆', text: 'On touch, swipe to turn.' },
    { icon: '🍎', text: 'Eat apples to grow and score.' },
    { icon: '💥', text: 'Avoid the walls and your own tail.' },
    { icon: '🎮', text: 'Gamepad: the d-pad or left stick steers, Start pauses.' },
  ],
  config: [
    { key: 'board', label: 'Board size', type: 'range', min: 13, max: 29, step: 2, default: 21, unit: ' sq', restart: true, help: 'Width and height of the square board, in cells.' },
    { key: 'speed', label: 'Starting speed', type: 'range', min: 5, max: 16, step: 1, default: 9, unit: '/s', restart: true, help: 'Steps per second at the start of a run.' },
    { key: 'growth', label: 'Growth per apple', type: 'range', min: 1, max: 4, step: 1, default: 1, restart: true, help: 'How many segments each apple adds.' },
    { key: 'wrap', label: 'Wrap around edges', type: 'toggle', default: false, restart: true, help: 'Pass through walls and reappear on the far side.' },
  ],
  create: (ctx) => new Snake(ctx),
};
