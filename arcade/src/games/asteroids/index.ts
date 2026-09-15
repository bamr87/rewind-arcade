import type { GameManifest } from '../../engine/types';
import { Asteroids } from './game';

export const asteroidsManifest: GameManifest = {
  id: 'asteroids',
  title: 'Asteroids',
  tagline: 'Thrust, turn, and chip the rocks down to dust.',
  year: '1979',
  accent: '#cbd5e1',
  icon: '☄️',
  description:
    'A vector ship in a wrapping field of rocks. Big asteroids split when shot. Do not fly into the debris.',
  howTo: [
    { icon: '⬆', text: 'Rotate with ← → or A D. Thrust with W or ↑.' },
    { icon: '✦', text: 'Fire with F or K. Space pauses — it never shoots.' },
    { icon: '💫', text: 'Edges wrap. Clear a wave and a larger one arrives.' },
  ],
  config: [
    { key: 'rocks', label: 'Starting rocks', type: 'range', min: 3, max: 8, step: 1, default: 5, restart: true },
    { key: 'shots', label: 'Max shots on screen', type: 'range', min: 2, max: 6, step: 1, default: 4, restart: true },
  ],
  create: (ctx) => new Asteroids(ctx),
};
