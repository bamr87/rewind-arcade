import type { GameManifest } from '../../engine/types';
import { Rockfall } from './game';

export const rockfallManifest: GameManifest = {
  id: 'rockfall',
  title: 'Rockfall',
  tagline: 'Dig for gems. Mind the boulders. Beat the clock.',
  year: '1984',
  accent: '#facc15',
  icon: '💎',
  description:
    'An original cave dig in the spirit of the 1984 home-computer classic. Tunnel through dirt for gems while boulders and gems fall and roll around you, then make the exit before time runs out. Every gem over the target multiplies the time bonus, so greedy-but-fast runs score best. Every cave is generated from its seed.',
  howTo: [
    { icon: '⬆', text: 'Arrows or W A S D to dig and move. Push a single boulder sideways into empty space.' },
    { icon: '✋', text: 'Hold F with a direction to dig or grab the next tile without stepping into it.' },
    { icon: '🪨', text: 'Unsupported boulders and gems fall, and roll off round things. A falling boulder is fatal.' },
    { icon: '🚪', text: 'Collecting the gem target opens the exit. Bonus: 10 per second left, plus 2 × seconds per extra gem.' },
    { icon: '🎮', text: 'Gamepad: d-pad digs, south grabs, north gives up the cave (R), Start pauses.' },
  ],
  pad: { south: 'KeyF', north: 'KeyR' },
  config: [
    {
      key: 'size',
      label: 'Cave size',
      type: 'select',
      default: 'medium',
      restart: true,
      options: [
        { value: 'small', label: 'Small (30 × 18)' },
        { value: 'medium', label: 'Medium (40 × 22)' },
        { value: 'large', label: 'Large (56 × 30)' },
      ],
    },
    { key: 'boulders', label: 'Boulders', type: 'range', min: 5, max: 30, step: 5, default: 15, unit: ' %', restart: true, help: 'Share of the cave that starts as boulders.' },
    { key: 'gems', label: 'Gem target', type: 'range', min: 5, max: 30, step: 1, default: 12, restart: true, help: 'Gems needed to open the exit. A few extra are always placed.' },
    { key: 'time', label: 'Time limit', type: 'range', min: 60, max: 240, step: 10, default: 150, unit: ' s', restart: true, help: 'Seconds per cave.' },
    { key: 'seed', label: 'Cave seed', type: 'range', min: 0, max: 9999, step: 1, default: 0, restart: true, help: '0 builds a new run of caves every game; any other number replays the same run.' },
  ],
  create: (ctx) => new Rockfall(ctx),
};
