import type { GameManifest } from '../../engine/types';
import { Touchdown } from './game';

export const touchdownManifest: GameManifest = {
  id: 'touchdown',
  title: 'Touchdown',
  tagline: 'Thrust, turn, and set it down softly — again and again.',
  year: '1979',
  accent: '#fbbf24',
  icon: '🌙',
  description:
    'A vector lander over random terrain. Touch down slow and upright on a scoring pad, then fly the next descent on whatever fuel you saved.',
  howTo: [
    { icon: '⬆', text: 'Rotate with ← → or A D. Thrust with ↑ or W; thrust burns fuel.' },
    { icon: '🛬', text: 'Land slow and upright on a pad. Narrow pads pay up to ×5.' },
    { icon: '⛽', text: 'Leftover fuel plus a small top-up carries into the next descent.' },
    { icon: '🎮', text: 'Gamepad: stick or d-pad steers, south button or right trigger thrusts, Start pauses.' },
  ],
  pad: { south: 'ArrowUp', r2: 'ArrowUp' },
  config: [
    {
      key: 'gravity',
      label: 'Gravity',
      type: 'select',
      options: [
        { value: 'moon', label: 'Moon' },
        { value: 'mars', label: 'Mars' },
        { value: 'earth', label: 'Earth' },
      ],
      default: 'moon',
      restart: true,
    },
    { key: 'fuel', label: 'Starting fuel', type: 'range', min: 500, max: 2000, step: 100, default: 1000, restart: true },
    { key: 'rough', label: 'Terrain roughness', type: 'range', min: 1, max: 10, step: 1, default: 5, restart: true },
    { key: 'pads', label: 'Landing pads', type: 'range', min: 2, max: 5, step: 1, default: 3, restart: true },
  ],
  create: (ctx) => new Touchdown(ctx),
};
