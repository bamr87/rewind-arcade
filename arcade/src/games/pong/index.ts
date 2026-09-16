import type { GameManifest } from '../../engine/types';
import { Pong } from './game';

export const pongManifest: GameManifest = {
  id: 'pong',
  title: 'Pong',
  tagline: 'Two paddles, one bouncing square, first to the target.',
  year: '1972',
  accent: '#e2e8f0',
  icon: '🏓',
  description:
    'The table-tennis machine that launched the arcade. Keep the square in play with the left paddle and out-score the house — or a second player.',
  howTo: [
    { icon: '🖱', text: 'Move with the mouse, or W / S.' },
    { icon: '↔', text: 'Solo: the right paddle is CPU. Two-player: arrows for P2.' },
    { icon: '🏁', text: 'First to the target score wins the table.' },
    { icon: '🎮', text: 'Gamepad: one per player — the left paddle is pad 1, the right is pad 2.' },
  ],
  // The only two-player game here, so the only one that cares which pad is which.
  pad: { up: 'KeyW', down: 'KeyS' },
  pad2: { up: 'ArrowUp', down: 'ArrowDown' },
  config: [
    { key: 'winScore', label: 'Points to win', type: 'range', min: 3, max: 15, step: 1, default: 7, restart: true },
    { key: 'ai', label: 'CPU skill', type: 'range', min: 30, max: 100, step: 5, default: 70, unit: '%', restart: true, help: 'How quickly the house paddle tracks the ball.' },
    {
      key: 'mode',
      label: 'Players',
      type: 'select',
      default: 'ai',
      restart: true,
      options: [
        { value: 'ai', label: 'You vs CPU' },
        { value: 'two', label: 'Two players' },
      ],
    },
  ],
  create: (ctx) => new Pong(ctx),
};
