import type { GameManifest } from '../../engine/types';
import { Blockfall } from './game';

export const blockfallManifest: GameManifest = {
  id: 'blockfall',
  title: 'Blockfall',
  tagline: 'Seven shapes, one well, and lines that burn into the glass.',
  year: '1984',
  accent: '#a855f7',
  icon: '🧱',
  description:
    'An original falling-block puzzle. Slide, rotate and drop seven tetrominoes into a 10 × 20 well, clear full lines, and keep up as gravity speeds up every 10 lines. Each cleared line leaves a fading phosphor burn on the glass.',
  howTo: [
    { icon: '↔', text: 'Move with ← → or A D. Hold to slide.' },
    { icon: '↓', text: '↓ / S soft drops (+1 a row), ↑ / W hard drops (+2 a row). Space pauses — it never drops.' },
    { icon: '⟳', text: 'X / K rotates clockwise, Z / J counter-clockwise. C / L holds a piece for later.' },
    { icon: '★', text: '1 / 2 / 3 / 4 lines score 100 / 300 / 500 / 800 × level. Every 10 lines is a level.' },
    { icon: '🎮', text: 'Gamepad: d-pad moves and drops, south rotates clockwise, east counter-clockwise, west holds, Start pauses.' },
  ],
  // Rotation is on face buttons only: the shoulders auto-repeat in engine/gamepad.ts.
  pad: { south: 'KeyX', east: 'KeyZ', west: 'KeyC' },
  config: [
    { key: 'startLevel', label: 'Start level', type: 'range', min: 1, max: 15, step: 1, default: 1, restart: true },
    {
      key: 'ghost',
      label: 'Ghost piece',
      type: 'toggle',
      default: true,
      help: 'Outline where the falling piece will land.',
      restart: true,
    },
    {
      key: 'phosphor',
      label: 'Phosphor burn',
      type: 'toggle',
      default: true,
      help: 'Each cleared line leaves a glow on the glass that fades over about 20 seconds.',
      restart: true,
    },
    {
      key: 'randomizer',
      label: 'Piece order',
      type: 'select',
      options: [
        { value: 'bag', label: '7-bag — every shape once per seven' },
        { value: 'random', label: 'Random — anything goes' },
      ],
      default: 'bag',
      restart: true,
    },
  ],
  create: (ctx) => new Blockfall(ctx),
};
