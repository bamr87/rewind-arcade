import type { GameManifest } from '../../engine/types';
import { Patience } from './game';

export const patienceManifest: GameManifest = {
  id: 'patience',
  title: 'Patience 3.1',
  tagline: 'Klondike, dragged by hand. Then the cards bounce.',
  year: '1990',
  accent: '#16a34a',
  icon: '🃏',
  description:
    'Klondike solitaire in the spirit of the one that shipped with Windows 3.0. Build the four foundations up by suit from the ace, and stack the tableau down in alternating colours. Drag cards and runs with the pointer, draw one or three from the stock, and score it standard or Vegas. Clear the deck and the cards leap off the foundations and bounce across the felt.',
  howTo: [
    { icon: '🖱', text: 'Drag a card, or a face-up run, onto a column (alternating colour, one lower) or a foundation (same suit, one higher).' },
    { icon: '🂠', text: 'Click the stock (or press D) to turn cards. Click the empty stock to recycle the waste.' },
    { icon: '⚡', text: 'Double-click a card to send it home. A sends every safe card home. U or Z undoes.' },
    { icon: '★', text: 'Standard: +10 per card home, +5 waste to tableau and per card turned over, time and moves bonuses on a win. Vegas: $5 per card home against a $52 stake.' },
    { icon: '🎮', text: 'Gamepad: south draws, west sends safe cards home. The pointer does the dragging.' },
  ],
  cursor: 'grab',
  pad: { south: 'KeyD', west: 'KeyA' },
  config: [
    {
      key: 'draw', label: 'Draw', type: 'select', default: '1', restart: true,
      options: [
        { value: '1', label: 'Draw one' },
        { value: '3', label: 'Draw three' },
      ],
      help: 'Cards turned from the stock at a time.',
    },
    {
      key: 'scoring', label: 'Scoring', type: 'select', default: 'standard', restart: true,
      options: [
        { value: 'standard', label: 'Standard' },
        { value: 'vegas', label: 'Vegas' },
      ],
      help: 'Vegas pays $5 per card home against a $52 stake; your best is stored as $52 + net.',
    },
    { key: 'timed', label: 'Timed game', type: 'toggle', default: true, restart: true, help: 'Standard scoring loses 2 points every 10 s and earns a time bonus on a win.' },
    { key: 'autoFinish', label: 'Auto-finish', type: 'toggle', default: true, restart: true, help: 'Play every card home by itself once nothing is left face down.' },
  ],
  create: (ctx) => new Patience(ctx),
};
