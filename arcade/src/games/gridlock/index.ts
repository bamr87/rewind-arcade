import type { GameManifest } from '../../engine/types';
import { Gridlock } from './game';

export const gridlockManifest: GameManifest = {
  id: 'gridlock',
  title: 'Gridlock',
  tagline: 'Two light cycles, two walls of light. Last one moving wins.',
  year: '1982',
  accent: '#22d3ee',
  icon: '🏍️',
  description:
    'An original light-cycle duel in the spirit of the 1982 arcade cycles and QBasic Nibbles. Every move lays down a wall; box the other rider in before they box you. A short boost doubles your speed and leaves a gap in your trail — an escape hatch, or a door for your rival.',
  howTo: [
    { icon: '⬆', text: 'Steer in 90° turns. You can never turn straight back.' },
    { icon: '⚡', text: 'Boost (F, or L for player 2) doubles speed for a moment and draws no trail. Then it has to recharge.' },
    { icon: '🤖', text: 'Solo: the orange cycle is the CPU. Two players: P1 on W A S D + F, P2 on the arrows + L.' },
    { icon: '🏁', text: 'Win a round for 1000 + 10 per second survived; take the match for +500.' },
    { icon: '🎮', text: 'Gamepad: one per player. South or east boosts, Start pauses.' },
  ],
  // P1 steers on WASD so a second pad (arrows, the default) can drive the other cycle.
  pad: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', south: 'KeyF', east: 'KeyF' },
  pad2: { south: 'KeyL', east: 'KeyL' },
  config: [
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
    { key: 'ai', label: 'CPU skill', type: 'range', min: 30, max: 100, step: 5, default: 70, unit: '%', restart: true, help: 'How far ahead the CPU rider looks for open space.' },
    { key: 'rounds', label: 'Rounds to win', type: 'range', min: 1, max: 9, step: 1, default: 3, restart: true },
    { key: 'speed', label: 'Speed', type: 'range', min: 6, max: 20, step: 1, default: 10, unit: ' cells/s', restart: true, help: 'How many cells a cycle covers per second, before boosting.' },
    {
      key: 'arena',
      label: 'Arena',
      type: 'select',
      default: 'medium',
      restart: true,
      options: [
        { value: 'small', label: 'Small (42 × 27)' },
        { value: 'medium', label: 'Medium (56 × 36)' },
        { value: 'large', label: 'Large (70 × 45)' },
      ],
    },
  ],
  create: (ctx) => new Gridlock(ctx),
};
