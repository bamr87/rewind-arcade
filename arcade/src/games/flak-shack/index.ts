import type { GameManifest } from '../../engine/types';
import { FlakShack } from './game';

export const flakShackManifest: GameManifest = {
  id: 'flak-shack',
  title: 'Flak Shack',
  tagline: 'One gun, a sky full of rotors, four colours to see them in.',
  year: '1982',
  accent: '#55ffff',
  icon: '🪂',
  description:
    'A ground turret against waves of helicopters and their paratroopers, in a CGA palette. Let four troopers land on one side of the gun and they storm it.',
  howTo: [
    { icon: '↔', text: 'Rotate the gun with ← → or A D.' },
    { icon: '✦', text: 'Fire with F or K. Space pauses — it never shoots.' },
    { icon: '🪂', text: 'Helicopter +10, trooper +5, every shot −1. A shot chute drops its trooper onto whoever is below.' },
    { icon: '⚠', text: 'Four troopers landed on one side storm the gun and end the game.' },
    { icon: '🎮', text: 'Gamepad: stick or d-pad rotates, either face button fires, Start pauses.' },
  ],
  // Fire sits on both face buttons and the right shoulder, so no layout is wrong.
  pad: { south: 'KeyF', east: 'KeyF', r1: 'KeyF', r2: 'KeyF' },
  config: [
    {
      key: 'palette',
      label: 'CGA palette',
      type: 'select',
      options: [
        { value: 'cga1', label: 'Palette 1 — cyan / magenta / white' },
        { value: 'cga0', label: 'Palette 0 — green / red / brown' },
        { value: 'mono', label: 'Mono green' },
      ],
      default: 'cga1',
      restart: true,
    },
    { key: 'spawn', label: 'Helicopter frequency', type: 'range', min: 1, max: 10, step: 1, default: 5, restart: true },
    {
      key: 'jets',
      label: 'Bomber waves',
      type: 'toggle',
      default: false,
      help: 'Jets cross high and drop one bomb aimed at the gun. Shoot the bomb down, or it ends the game.',
      restart: true,
    },
  ],
  create: (ctx) => new FlakShack(ctx),
};
