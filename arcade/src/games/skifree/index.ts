import type { GameManifest } from '../../engine/types';
import { SkiFree } from './game';

export const skifreeManifest: GameManifest = {
  id: 'skifree',
  title: 'SkiFree',
  tagline: 'Ski the slope. Dodge the trees. Do not feed the yeti.',
  year: '1991',
  accent: '#38bdf8',
  icon: '🎿',
  description:
    'An original downhill run in the spirit of the Windows entertainment-pack classic. Weave a skier through pines and rocks, tuck for speed, and stay ahead of the yeti waiting downslope.',
  howTo: [
    { icon: '↔', text: 'Steer with ← → or A D. The mouse or a finger also leans you.' },
    { icon: '⬇', text: 'Hold ↓ or S to tuck. Hold ↑ or W to snowplow and slow down.' },
    { icon: '🌲', text: 'Hit a tree or rock and you wipe out — then get back up.' },
    { icon: '👾', text: 'Pass the marker and the yeti comes looking for a snack.' },
    { icon: '🎮', text: 'Gamepad: stick or d-pad steers, Start pauses.' },
  ],
  pad: { south: 'ArrowDown', north: 'ArrowUp' },
  config: [
    { key: 'density', label: 'Tree density', type: 'range', min: 2, max: 10, step: 1, default: 5, restart: true, help: 'How thick the woods get once you leave the lodge.' },
    { key: 'yeti', label: 'Yeti distance', type: 'range', min: 1000, max: 4000, step: 250, default: 2000, unit: ' m', restart: true, help: 'How far downslope the yeti starts the chase.' },
    { key: 'speed', label: 'Ski speed', type: 'range', min: 180, max: 340, step: 10, default: 240, restart: true, help: 'Base downhill speed before tuck or snowplow.' },
  ],
  create: (ctx) => new SkiFree(ctx),
};
