import type { GameManifest } from '../../engine/types';
import { BananaBarrage } from './game';

export const bananaBarrageManifest: GameManifest = {
  id: 'banana-barrage',
  title: 'Banana Barrage',
  tagline: 'Two gorillas, one skyline, and a city that remembers every miss.',
  year: '1991',
  accent: '#facc15',
  icon: '🍌',
  description:
    'An original artillery duel. Two gorillas on a random city skyline take turns lobbing exploding bananas under gravity and wind. Every blast carves a hole in the buildings that stays for the round, so later throws can tunnel through earlier craters.',
  howTo: [
    { icon: '↕', text: '↑ ↓ or W S set the angle; ← → or A D set the power. Hold to sweep.' },
    { icon: '🍌', text: 'Throw with F or K. Space pauses — it never throws.' },
    { icon: '💨', text: 'Wind changes every round; the arrow at street level shows it.' },
    { icon: '★', text: 'Round won: 1000 + up to 500 for fewer throws. Match won: +250.' },
    { icon: '🎮', text: 'Gamepad: d-pad aims, south / east / R1 throws, Start pauses. Two players can each use a pad.' },
  ],
  pad: { south: 'KeyF', east: 'KeyF', r1: 'KeyF' },
  pad2: { south: 'KeyF', east: 'KeyF', r1: 'KeyF' },
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
    { key: 'ai', label: 'CPU accuracy', type: 'range', min: 30, max: 100, step: 5, default: 70, unit: '%', restart: true, help: 'How close the house gorilla throws to its best solution.' },
    { key: 'rounds', label: 'Rounds to win', type: 'range', min: 1, max: 9, step: 1, default: 3, restart: true },
    { key: 'wind', label: 'Max wind', type: 'range', min: 0, max: 10, step: 1, default: 5, restart: true, help: '0 is a calm city every round.' },
    { key: 'gravity', label: 'Gravity', type: 'range', min: 5, max: 20, step: 1, default: 10, unit: ' m/s²', restart: true },
  ],
  create: (ctx) => new BananaBarrage(ctx),
};
