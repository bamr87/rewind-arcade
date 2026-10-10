/**
 * Lode Digger's built-in levels, plus the movement rules they are played by.
 *
 * The rules live here rather than in game.ts so the headless checker
 * (`tools/play-lode-digger.mjs`) proves every level completable with exactly
 * the moves the game allows — not with a second, drifting copy of them.
 *
 * Legend: `#` brick (diggable), `@` solid, `H` ladder, `-` bar, `$` gold,
 * `E` guard, `P` player, `S` escape ladder (hidden until the gold is gone).
 * Every level is 28 × 16 tiles. Levels are original; none is copied.
 */

export const COLS = 28;
export const ROWS = 16;

export const EMPTY = ' ';
export const BRICK = '#';
export const SOLID = '@';
export const LADDER = 'H';
export const BAR = '-';
export const GOLD = '$';
export const GUARD = 'E';
export const PLAYER = 'P';
export const ESCAPE = 'S';

const LEGAL = new Set([EMPTY, BRICK, SOLID, LADDER, BAR, GOLD, GUARD, PLAYER, ESCAPE]);

/** 0 up, 1 left, 2 down, 3 right — the same order Pellet Panic uses. */
export const DX = [0, -1, 0, 1];
export const DY = [-1, 0, 1, 0];

export interface Pt {
  x: number;
  y: number;
}

export interface LevelDef {
  name: string;
  rows: string[];
}

export const LEVELS: LevelDef[] = [
  {
    name: 'Foothold',
    rows: [
      '                        S   ',
      '                        S   ',
      '  $       E             S   ',
      '####H###################H###',
      '    H                   H   ',
      '    H                   H   ',
      '    H      $     E   $  H   ',
      '###########H#####H##########',
      '           H     H          ',
      '           H     H          ',
      '  $        H     H        $ ',
      '####H####################H##',
      '    H                    H  ',
      '    H                    H  ',
      ' P  H        $           H  ',
      '@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
    ],
  },
  {
    name: 'Hand over Hand',
    rows: [
      '   S                        ',
      '   S                        ',
      '   S  $        E      $     ',
      '###H##########H#############',
      '   H          H             ',
      '   H          H             ',
      '   H       ---H   $      E  ',
      '###H#######    #####H#######',
      '                    H       ',
      '                    H       ',
      '  $      --------   H    $  ',
      '####H####        ###H####H##',
      '    H               H    H  ',
      '    H               H    H  ',
      ' P  H      $       EH    H  ',
      '@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
    ],
  },
  {
    name: 'Crossroads',
    rows: [
      '             S              ',
      '             S              ',
      '  $          S          $   ',
      '######H######H######H#######',
      '      H      H      H       ',
      '      H------H------H       ',
      '  E   H  $   H   $  H   E   ',
      '##########H#####H###########',
      '          H     H           ',
      '          H     H           ',
      '   $      H  E  H      $    ',
      '##H########@@@@@#########H##',
      '  H                      H  ',
      '  H                      H  ',
      '  H   P     $        E   H  ',
      '############################',
    ],
  },
  {
    name: 'The Pit',
    rows: [
      '                           S',
      '                           S',
      ' $     E           $       S',
      '@@@@@@@@@H@@@@@@@@@@@@H@@@@H',
      '         H            H    H',
      '         H            H    H',
      '   $     H E       $  H    H',
      '#####H#######   ###########H',
      '     H                     H',
      '     H                     H',
      '  $  H   E   $$$          $H',
      '#####H#####@@@@@@######H###H',
      '     H                 H   H',
      '     H                 H   H',
      '  P  H        $        H   H',
      '@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
    ],
  },
  {
    name: 'Rhythm Section',
    rows: [
      'S                           ',
      'S                           ',
      'S   $    E     $         $  ',
      'H#######H#########H#######H#',
      'H       H         H       H ',
      'H  ---- H  -----  H ----  H ',
      'H $     H   E  $  H  $    H ',
      'H###H########H#########H####',
      'H   H        H         H    ',
      'H   H        H         H    ',
      'H $ H  E  $  H   $     H $  ',
      'H##########H#########H######',
      'H          H         H      ',
      'H          H         H      ',
      'H    P     H    $    H   E  ',
      '############################',
    ],
  },
];

export interface ParsedLevel {
  /** Terrain only: gold, guards and the player are lifted out onto empty tiles. */
  tiles: string[];
  gold: Pt[];
  guards: Pt[];
  player: Pt;
}

export function parseLevel(def: LevelDef): ParsedLevel {
  const tiles: string[] = [];
  const gold: Pt[] = [];
  const guards: Pt[] = [];
  let player: Pt = { x: 0, y: 0 };
  for (let y = 0; y < ROWS; y++) {
    const row = def.rows[y] ?? '';
    for (let x = 0; x < COLS; x++) {
      const ch = row[x] ?? EMPTY;
      if (ch === GOLD) gold.push({ x, y });
      else if (ch === GUARD) guards.push({ x, y });
      else if (ch === PLAYER) player = { x, y };
      tiles.push(ch === GOLD || ch === GUARD || ch === PLAYER ? EMPTY : ch);
    }
  }
  return { tiles, gold, guards, player };
}

/**
 * What the movement rules need to know about a board. The game answers these
 * with its dug holes and trapped guards folded in; the checker answers them
 * from the bare level.
 */
export interface Terrain {
  /** Nothing may enter this tile (intact brick, solid, off the board). */
  blocked(x: number, y: number): boolean;
  /** Something can be stood on here (a blocked tile, or a guard stuck in a hole). */
  floor(x: number, y: number): boolean;
  climbable(x: number, y: number): boolean;
  bar(x: number, y: number): boolean;
}

/** Standing, climbing or hanging: anything but falling. */
export function supported(t: Terrain, x: number, y: number): boolean {
  return t.climbable(x, y) || t.bar(x, y) || t.floor(x, y + 1) || t.climbable(x, y + 1);
}

/** Can an actor at the centre of (x, y) take one step in direction `d`? */
export function canStep(t: Terrain, x: number, y: number, d: number): boolean {
  if (!supported(t, x, y)) return d === 2 && !t.blocked(x, y + 1);
  const nx = x + DX[d];
  const ny = y + DY[d];
  if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return false;
  if (d === 0) return t.climbable(x, y) && !t.blocked(nx, ny);
  // Down: onto a ladder, off a ladder or bar into the air — never into a floor.
  if (d === 2) return !t.floor(nx, ny);
  return !t.blocked(nx, ny);
}

/** Every tile reachable from `from` by legal steps, falls included. */
export function reachable(t: Terrain, from: Pt): Uint8Array {
  const seen = new Uint8Array(COLS * ROWS);
  seen[from.y * COLS + from.x] = 1;
  const queue: Pt[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    for (let d = 0; d < 4; d++) {
      if (!canStep(t, p.x, p.y, d)) continue;
      const nx = p.x + DX[d];
      const ny = p.y + DY[d];
      if (seen[ny * COLS + nx]) continue;
      seen[ny * COLS + nx] = 1;
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

/** The bare level as a `Terrain`, with the escape ladder shown or hidden. */
export function staticTerrain(tiles: string[], escapeShown: boolean): Terrain {
  const at = (x: number, y: number) =>
    x < 0 || x >= COLS || y < 0 || y >= ROWS ? SOLID : tiles[y * COLS + x];
  const blocked = (x: number, y: number) => {
    const c = at(x, y);
    return c === BRICK || c === SOLID;
  };
  return {
    blocked,
    floor: blocked,
    climbable: (x, y) => {
      const c = at(x, y);
      return c === LADDER || (escapeShown && c === ESCAPE);
    },
    bar: (x, y) => at(x, y) === BAR,
  };
}

/**
 * Everything wrong with a level, or `[]`. Shape first (28 × 16, one `P`, at
 * least one `$` and one `S`, legal characters only), then completability
 * without digging: every `$` must be reachable from `P` with the escape
 * hidden, `P` reachable back from every `$` (so the gold can be taken in any
 * order), and the top row reachable from `P` once the escape is shown.
 */
export function checkLevel(def: LevelDef): string[] {
  const problems: string[] = [];
  if (def.rows.length !== ROWS) problems.push(`${def.rows.length} rows, want ${ROWS}`);
  def.rows.forEach((row, y) => {
    if (row.length !== COLS) problems.push(`row ${y} is ${row.length} wide, want ${COLS}`);
    for (const ch of row) if (!LEGAL.has(ch)) problems.push(`row ${y} has illegal ${JSON.stringify(ch)}`);
  });
  const count = (ch: string) => def.rows.reduce((n, row) => n + row.split(ch).length - 1, 0);
  if (count(PLAYER) !== 1) problems.push(`${count(PLAYER)} players, want exactly 1`);
  if (count(GOLD) < 1) problems.push('no gold');
  if (count(ESCAPE) < 1) problems.push('no escape ladder');
  if (problems.length) return problems;

  const level = parseLevel(def);
  const hidden = staticTerrain(level.tiles, false);
  const fromStart = reachable(hidden, level.player);
  for (const g of level.gold) {
    if (!fromStart[g.y * COLS + g.x]) problems.push(`gold at ${g.x},${g.y} unreachable from P`);
    else if (!reachable(hidden, g)[level.player.y * COLS + level.player.x]) {
      problems.push(`no way back to P from the gold at ${g.x},${g.y}`);
    }
  }
  const shown = reachable(staticTerrain(level.tiles, true), level.player);
  const topRow = (seen: Uint8Array) => seen.subarray(0, COLS).some((v) => v === 1);
  if (!topRow(shown)) problems.push('the top row is unreachable from P with the escape shown');
  // …and only with it: a level you can leave early does not need its gold.
  if (topRow(fromStart)) problems.push('the top row is reachable without the escape ladder');
  return problems;
}
