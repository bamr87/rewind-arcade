import type { GameManifest } from '../../engine/types';
import { Minesweeper } from './game';

export const minesweeperManifest: GameManifest = {
  id: 'minesweeper',
  title: 'Minesweeper',
  tagline: 'Read the numbers. Find every mine.',
  year: '1990',
  accent: '#fbbf24',
  icon: '💣',
  description:
    'The Microsoft Entertainment Pack puzzle that came to define the coffee break. Every number tells you how many mines touch it — deduce the rest of the field from that alone, flag the mines, and uncover every safe square.',
  howTo: [
    { icon: '⛏', text: 'Click a square to uncover it. The first click is always safe.' },
    { icon: '🔢', text: 'A number counts the mines in the eight squares around it.' },
    { icon: '🚩', text: 'Right-click, scroll, or press F to flag a suspected mine.' },
    { icon: '⚡', text: 'Click a fully flagged number to clear its remaining neighbours.' },
    { icon: '🎮', text: 'Gamepad: either face button switches flag mode. Digging still wants a pointer.' },
  ],
  pad: { south: 'KeyF', east: 'KeyF' },
  config: [
    { key: 'cols', label: 'Field width', type: 'range', min: 9, max: 30, step: 1, default: 16, unit: ' cols', restart: true, help: 'Number of columns in the mine field.' },
    { key: 'rows', label: 'Field height', type: 'range', min: 9, max: 20, step: 1, default: 16, unit: ' rows', restart: true, help: 'Number of rows in the mine field.' },
    { key: 'density', label: 'Mine density', type: 'range', min: 8, max: 28, step: 1, default: 16, unit: '%', restart: true, help: 'Share of the field that is mined. 16% is close to the classic intermediate board.' },
    { key: 'safeStart', label: 'Safe opening', type: 'toggle', default: true, restart: true, help: 'Guarantee the first click opens a blank pocket instead of a lone number.' },
    { key: 'chording', label: 'Chording', type: 'toggle', default: true, restart: true, help: 'Let a click on a satisfied number clear the squares around it.' },
  ],
  create: (ctx) => new Minesweeper(ctx),
};
