import type { GameManifest } from '../../engine/types';
import { RoguesHour } from './game';

export const roguesHourManifest: GameManifest = {
  id: 'rogues-hour',
  title: "Rogue's Hour",
  tagline: 'One dungeon a day. Ten minutes to plunder it.',
  year: '1980',
  accent: '#eab308',
  icon: '🗡️',
  description:
    'A turn-based ASCII dungeon crawl in the spirit of Rogue: rooms and corridors revealed by your torchlight, monsters that move when you move, gold to grab and stairs to dive. The dungeon is seeded from today’s date, so every attempt today faces the same levels, and the run clock only ticks while you play. Score is depth × gold.',
  howTo: [
    { icon: '@', text: 'Arrows / WASD move; numpad 1–9 moves diagonally. Walk into a monster to attack it.' },
    { icon: '>', text: 'X or . descends when you stand on the stairs. Z or numpad 5 waits a turn.' },
    { icon: '!', text: 'Q quaffs a healing potion. Gold (*) and potions are picked up by walking over them.' },
    { icon: '⏱', text: 'The run lasts the configured minutes of play time; pausing stops the clock.' },
    { icon: '🎮', text: 'Gamepad: d-pad moves, south descends, west quaffs, north waits.' },
  ],
  pad: { south: 'KeyX', west: 'KeyQ', north: 'KeyZ' },
  config: [
    {
      key: 'seedMode', label: 'Dungeon', type: 'select', default: 'daily', restart: true,
      options: [
        { value: 'daily', label: 'Daily (same for the date)' },
        { value: 'random', label: 'Random' },
      ],
      help: 'Daily seeds the dungeon from your local date (YYYYMMDD); random rolls a new one each run.',
    },
    { key: 'minutes', label: 'Run length', type: 'range', min: 5, max: 20, step: 1, default: 10, unit: 'min', restart: true, help: 'Minutes of play time before the run ends.' },
    { key: 'fov', label: 'Sight radius', type: 'range', min: 4, max: 10, step: 1, default: 7, restart: true, help: 'How far your torchlight reaches, in tiles.' },
  ],
  create: (ctx) => new RoguesHour(ctx),
};
