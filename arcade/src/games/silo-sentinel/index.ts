import type { GameManifest } from '../../engine/types';
import { SiloSentinel } from './game';

export const siloSentinelManifest: GameManifest = {
  id: 'silo-sentinel',
  title: 'Silo Sentinel',
  tagline: 'Blast the warheads out of the sky. Every city saved multiplies the next wave.',
  year: '1980',
  accent: '#f97316',
  icon: '🚀',
  description:
    'Warheads fall on six cities. Click the sky and the nearest silo detonates a counter-blast there; blasts chain. Cities standing at the end of a wave become the next wave\'s score multiplier.',
  howTo: [
    { icon: '🎯', text: 'Click or tap the sky to fire from the nearest silo with ammo.' },
    { icon: '⌨', text: 'Or move the crosshair with arrows / WASD and fire with F or K.' },
    { icon: '🏙', text: 'Cities left standing set the next wave\'s multiplier.' },
    { icon: '🎮', text: 'Gamepad: stick or d-pad moves the crosshair, any face button or right shoulder fires, Start pauses.' },
  ],
  cursor: 'crosshair',
  pad: { south: 'KeyF', east: 'KeyF', r1: 'KeyF', r2: 'KeyF' },
  config: [
    { key: 'startWave', label: 'Starting wave', type: 'range', min: 1, max: 10, step: 1, default: 1, restart: true },
    { key: 'ammo', label: 'Ammo per silo', type: 'range', min: 6, max: 15, step: 1, default: 10, restart: true },
    { key: 'speed', label: 'Warhead speed', type: 'range', min: 50, max: 150, step: 10, default: 100, unit: '%', restart: true },
    { key: 'wind', label: 'Wind drift', type: 'toggle', default: false, help: 'Pushes counter-missiles and blasts sideways; shown in the HUD.', restart: true },
  ],
  create: (ctx) => new SiloSentinel(ctx),
};
