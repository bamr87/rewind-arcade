import type { GameContext, GameInstance } from '../../engine/types';
import { cfgBool, cfgInt, cfgStr, clamp, fmt, shade } from '../../engine/util';

type Phase = 'menu' | 'playing' | 'over';

export const COLS = 10;
export const ROWS = 20;
const CELL = 30;
const WX = 20;
const WY = 20;
const W = 520;
const H = 640;
const PANEL = WX + COLS * CELL + 24;

/** Delayed auto shift and auto repeat rate, in seconds. The OS key repeat is ignored. */
export const DAS = 0.17;
export const ARR = 0.05;
export const LOCK_DELAY = 0.5;
const MAX_LOCK_RESETS = 15;
/** Soft drop falls at least this fast, whatever the level. */
const SOFT_INTERVAL = 0.05;
/** Seconds a phosphor-burn mark takes to fade out completely. */
export const PHOSPHOR_LIFE = 20;
/** Points for clearing 1 / 2 / 3 / 4 lines at once, multiplied by the level. */
export const LINE_SCORES = [0, 100, 300, 500, 800];

export const KINDS = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'] as const;
export type Kind = (typeof KINDS)[number];
type Cell = [number, number];

const COLORS: Record<Kind, string> = {
  I: '#22d3ee',
  J: '#3b82f6',
  L: '#f97316',
  O: '#facc15',
  S: '#22c55e',
  T: '#a855f7',
  Z: '#ef4444',
};

/** Spawn orientation of each piece inside its n×n box (x right, y down). */
const BASE: Record<Kind, { n: number; cells: Cell[] }> = {
  I: { n: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  J: { n: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { n: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
  O: { n: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  S: { n: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  T: { n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  Z: { n: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
};

/** SHAPES[kind][rotation] lists the four cells; rotation 0..3 is spawn, R, 2, L. */
export const SHAPES = {} as Record<Kind, Cell[][]>;
for (const k of KINDS) {
  const { n, cells } = BASE[k];
  const rots: Cell[][] = [cells];
  for (let r = 1; r < 4; r++) rots.push(rots[r - 1].map(([x, y]) => [n - 1 - y, x] as Cell));
  SHAPES[k] = rots;
}

// Super Rotation System wall kicks, written as on the reference chart (+y is UP).
const KICKS_JLSTZ: Record<string, Cell[]> = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICKS_I: Record<string, Cell[]> = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

/** True when `kind` in rotation `rot` with its box at (x, y) overlaps nothing. Rows above the well are open. */
export function fits(board: Uint8Array, kind: Kind, rot: number, x: number, y: number): boolean {
  for (const [dx, dy] of SHAPES[kind][rot]) {
    const cx = x + dx;
    const cy = y + dy;
    if (cx < 0 || cx >= COLS || cy >= ROWS) return false;
    if (cy >= 0 && board[cy * COLS + cx]) return false;
  }
  return true;
}

/** Seconds per gravity row at a level (the guideline curve): 1 s at level 1, ~7 ms at 15. */
export function gravityInterval(level: number): number {
  const l = clamp(level, 1, 30);
  return Math.pow(0.8 - (l - 1) * 0.007, l - 1);
}

function spawnX(kind: Kind): number {
  return kind === 'O' ? 4 : 3;
}

interface Piece { kind: Kind; rot: number; x: number; y: number; }
interface Mark { row: number; age: number; }

const LEFT = ['ArrowLeft', 'KeyA'];
const RIGHT = ['ArrowRight', 'KeyD'];
const SOFT = ['ArrowDown', 'KeyS'];

export class Blockfall implements GameInstance {
  readonly design = { width: W, height: H };

  private host: GameContext;
  private g: CanvasRenderingContext2D;
  private startLevel: number;
  private ghostOn: boolean;
  private phosphorOn: boolean;
  private randomizer: 'bag' | 'random';
  /** Swappable so the headless checks can seed the piece order. */
  private rng: () => number = Math.random;

  private phase: Phase = 'menu';
  private board = new Uint8Array(COLS * ROWS);
  private cur: Piece | null = null;
  private queue: Kind[] = [];
  private bag: Kind[] = [];
  private hold: Kind | null = null;
  private holdUsed = false;
  private score = 0;
  private lines = 0;
  private level = 1;
  private best = 0;
  private bestBefore = 0;

  private keys = new Set<string>();
  private hDir = 0;
  private hTimer = 0;
  private arrAcc = 0;
  private gravAcc = 0;
  private lockT = 0;
  private lockResets = 0;
  private lowestY = 0;

  private marks: Mark[] = [];
  private flashes: Mark[] = [];

  constructor(ctx: GameContext) {
    this.host = ctx;
    this.g = ctx.ctx;
    this.startLevel = clamp(cfgInt(ctx.config.startLevel, 1), 1, 15);
    this.ghostOn = cfgBool(ctx.config.ghost, true);
    this.phosphorOn = cfgBool(ctx.config.phosphor, true);
    this.randomizer = cfgStr(ctx.config.randomizer, 'bag') === 'random' ? 'random' : 'bag';
    this.showMenu();
  }

  private showMenu() {
    this.phase = 'menu';
    this.reset();
    this.emitHud();
    this.host.setOverlay({
      variant: 'menu',
      title: 'BLOCKFALL',
      subtitle: 'Seven shapes, one well, and every cleared line burns into the glass.',
      bullets: [
        { icon: '↔', text: 'Move with ← → or A D. ↓ / S soft drops, ↑ / W hard drops.' },
        { icon: '⟳', text: 'Rotate with X / K (clockwise) and Z / J (counter-clockwise). C / L holds.' },
        { icon: '★', text: '1 / 2 / 3 / 4 lines score 100 / 300 / 500 / 800 × level. Every 10 lines speeds it up.' },
      ],
      buttons: [{ action: 'start', label: 'Drop in', primary: true }],
    });
  }

  private reset() {
    this.board = new Uint8Array(COLS * ROWS);
    this.cur = null;
    this.queue = [];
    this.bag = [];
    this.hold = null;
    this.holdUsed = false;
    this.score = 0;
    this.lines = 0;
    this.level = this.startLevel;
    this.hDir = 0;
    this.gravAcc = 0;
    this.marks = [];
    this.flashes = [];
  }

  private startGame() {
    this.reset();
    this.bestBefore = this.host.getBest();
    this.best = this.bestBefore;
    this.phase = 'playing';
    this.host.setOverlay(null);
    this.spawn(this.nextKind());
    this.emitHud();
  }

  /* -------------------------------- pieces -------------------------------- */

  private draw(): Kind {
    if (this.randomizer === 'random') return KINDS[Math.floor(this.rng() * KINDS.length)];
    if (!this.bag.length) {
      const b = [...KINDS] as Kind[];
      for (let i = b.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [b[i], b[j]] = [b[j], b[i]];
      }
      this.bag = b;
    }
    return this.bag.shift() as Kind;
  }

  private nextKind(): Kind {
    while (this.queue.length < 4) this.queue.push(this.draw());
    return this.queue.shift() as Kind;
  }

  /** Put a new piece at the top. False (and game over) when it cannot fit. */
  private spawn(kind: Kind): boolean {
    while (this.queue.length < 3) this.queue.push(this.draw());
    const p: Piece = { kind, rot: 0, x: spawnX(kind), y: kind === 'I' ? -1 : 0 };
    this.cur = p;
    this.gravAcc = 0;
    this.lockT = 0;
    this.lockResets = 0;
    this.lowestY = p.y;
    if (!fits(this.board, p.kind, p.rot, p.x, p.y)) {
      this.gameOver('Topped out');
      return false;
    }
    return true;
  }

  private grounded(): boolean {
    const p = this.cur;
    return !!p && !fits(this.board, p.kind, p.rot, p.x, p.y + 1);
  }

  private shift(dx: number, dy: number): boolean {
    const p = this.cur;
    if (!p || !fits(this.board, p.kind, p.rot, p.x + dx, p.y + dy)) return false;
    p.x += dx;
    p.y += dy;
    if (p.y > this.lowestY) {
      this.lowestY = p.y;
      this.lockResets = 0;
    }
    return true;
  }

  /** A player move or rotation on the ground restarts the lock delay, a limited number of times. */
  private moved() {
    if (this.grounded() && this.lockResets < MAX_LOCK_RESETS) {
      this.lockT = 0;
      this.lockResets++;
    }
  }

  private move(dir: number): boolean {
    if (!this.shift(dir, 0)) return false;
    this.moved();
    this.host.audio.tone(220, { type: 'square', dur: 0.02, vol: 0.02 });
    return true;
  }

  private rotate(dir: 1 | -1) {
    const p = this.cur;
    if (!p || p.kind === 'O') return;
    const to = (p.rot + dir + 4) % 4;
    const table = p.kind === 'I' ? KICKS_I : KICKS_JLSTZ;
    for (const [kx, ky] of table[`${p.rot}>${to}`]) {
      if (fits(this.board, p.kind, to, p.x + kx, p.y - ky)) {
        p.rot = to;
        p.x += kx;
        p.y -= ky;
        if (p.y > this.lowestY) {
          this.lowestY = p.y;
          this.lockResets = 0;
        }
        this.moved();
        this.host.audio.tone(330, { type: 'triangle', dur: 0.03, vol: 0.025 });
        return;
      }
    }
  }

  private hardDrop() {
    let cells = 0;
    while (this.shift(0, 1)) cells++;
    this.score += cells * 2;
    this.lock();
  }

  private holdPiece() {
    const p = this.cur;
    if (!p || this.holdUsed) return;
    const back = this.hold;
    this.hold = p.kind;
    this.holdUsed = true;
    this.spawn(back ?? this.nextKind());
    this.host.audio.tone(440, { type: 'triangle', dur: 0.05, vol: 0.025 });
  }

  /** Write the piece into the board, clear lines, and bring on the next piece. */
  private lock() {
    const p = this.cur;
    if (!p) return;
    let visible = false;
    for (const [dx, dy] of SHAPES[p.kind][p.rot]) {
      const y = p.y + dy;
      if (y < 0) continue;
      visible = true;
      this.board[y * COLS + p.x + dx] = KINDS.indexOf(p.kind) + 1;
    }
    this.cur = null;
    this.holdUsed = false;
    if (!visible) {
      this.gameOver('Locked out');
      return;
    }
    const cleared = this.clearLines();
    if (cleared) {
      this.score += LINE_SCORES[cleared] * this.level;
      this.lines += cleared;
      const level = this.startLevel + Math.floor(this.lines / 10);
      if (level > this.level) {
        this.level = level;
        this.host.audio.arp([392, 523, 659, 784], { type: 'square', dur: 0.08, vol: 0.04, gap: 0.07 });
      } else if (cleared === 4) {
        this.host.audio.arp([523, 659, 784, 1047], { type: 'square', dur: 0.08, vol: 0.045, gap: 0.06 });
      } else {
        this.host.audio.tone(523 + cleared * 80, { type: 'square', dur: 0.1, vol: 0.04 });
      }
    } else {
      this.host.audio.tone(90, { type: 'triangle', dur: 0.06, vol: 0.05 });
    }
    this.best = Math.max(this.best, this.score);
    if (this.spawn(this.nextKind())) this.emitHud();
  }

  private clearLines(): number {
    const full: number[] = [];
    for (let r = 0; r < ROWS; r++) {
      let n = 0;
      for (let c = 0; c < COLS; c++) if (this.board[r * COLS + c]) n++;
      if (n === COLS) full.push(r);
    }
    if (!full.length) return 0;
    const next = new Uint8Array(COLS * ROWS);
    let w = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (full.includes(r)) continue;
      next.set(this.board.subarray(r * COLS, r * COLS + COLS), w * COLS);
      w--;
    }
    this.board = next;
    for (const row of full) {
      this.flashes.push({ row, age: 0 });
      if (this.phosphorOn) this.marks.push({ row, age: 0 });
    }
    return full.length;
  }

  private gameOver(kicker: string) {
    this.phase = 'over';
    this.cur = null;
    this.hDir = 0;
    this.best = Math.max(this.best, this.score);
    this.host.audio.tone(160, { type: 'sawtooth', dur: 0.6, vol: 0.07, slideTo: 50 });
    const record = this.host.submitScore(this.score);
    this.host.setOverlay({
      variant: 'lose',
      kicker,
      title: 'The well is full',
      rows: [
        { label: 'Lines', value: fmt(this.lines) },
        { label: 'Level', value: String(this.level) },
      ],
      bigStat: {
        label: 'Score',
        value: fmt(this.score),
        note: record && this.score > this.bestBefore ? '★ New best!' : undefined,
      },
      buttons: [
        { action: 'start', label: 'Play again', primary: true },
        { action: 'menu', label: 'Title', ghost: true },
      ],
    });
    this.emitHud();
  }

  private emitHud() {
    this.host.setHud({
      badge: `LEVEL ${this.level}`,
      stats: [
        { label: 'Score', value: fmt(this.score), accent: true },
        { label: 'Lines', value: fmt(this.lines) },
        { label: 'Level', value: String(this.level) },
        { label: 'Best', value: fmt(this.best) },
      ],
    });
  }

  /* --------------------------------- input -------------------------------- */

  onKey(code: string, down: boolean) {
    if (!down) {
      this.keys.delete(code);
      const releasedDir = LEFT.includes(code) ? -1 : RIGHT.includes(code) ? 1 : 0;
      if (releasedDir && releasedDir === this.hDir) {
        // Fall back to the other direction if it is still held, without an extra step.
        const l = LEFT.some((k) => this.keys.has(k));
        const r = RIGHT.some((k) => this.keys.has(k));
        this.hDir = r ? 1 : l ? -1 : 0;
        this.hTimer = 0;
        this.arrAcc = 0;
      }
      return;
    }
    // A key that is already down is the OS auto-repeat: sliding is our own DAS/ARR.
    if (this.keys.has(code)) return;
    this.keys.add(code);
    if (this.phase !== 'playing' || !this.cur) return;

    if (LEFT.includes(code) || RIGHT.includes(code)) {
      this.hDir = LEFT.includes(code) ? -1 : 1;
      this.hTimer = 0;
      this.arrAcc = 0;
      this.move(this.hDir);
    } else if (code === 'ArrowUp' || code === 'KeyW') {
      this.hardDrop();
    } else if (code === 'KeyX' || code === 'KeyK') {
      this.rotate(1);
    } else if (code === 'KeyZ' || code === 'KeyJ') {
      this.rotate(-1);
    } else if (code === 'KeyC' || code === 'KeyL') {
      this.holdPiece();
    }
  }

  onAction(action: string) {
    if (action === 'start') this.startGame();
    else if (action === 'menu') this.showMenu();
  }

  onPause() {
    // Keys released while the game is paused never reach it, so forget what was held.
    this.keys.clear();
    this.hDir = 0;
  }

  /** Plain-data view of the run, for `?debug=1` and the headless play script. */
  snapshot() {
    return {
      phase: this.phase,
      score: this.score,
      lines: this.lines,
      level: this.level,
      piece: this.cur ? { ...this.cur } : null,
      next: this.queue.slice(0, 3),
      hold: this.hold,
      marks: this.marks.map((m) => ({ ...m })),
      board: Array.from(this.board),
      lockT: this.lockT,
    };
  }

  /* -------------------------------- update -------------------------------- */

  update(dt: number) {
    for (const list of [this.marks, this.flashes]) for (const m of list) m.age += dt;
    this.marks = this.marks.filter((m) => m.age < PHOSPHOR_LIFE);
    this.flashes = this.flashes.filter((m) => m.age < 0.3);
    if (this.phase !== 'playing' || !this.cur) return;

    // Delayed auto shift: one step on press, nothing until DAS, then one step per ARR.
    if (this.hDir) {
      const before = this.hTimer;
      this.hTimer += dt;
      if (this.hTimer >= DAS) {
        this.arrAcc += this.hTimer - Math.max(before, DAS);
        if (before < DAS) this.move(this.hDir);
        while (this.arrAcc >= ARR) {
          this.arrAcc -= ARR;
          if (!this.move(this.hDir)) {
            this.arrAcc = 0;
            break;
          }
        }
      }
    }

    const soft = SOFT.some((k) => this.keys.has(k));
    const gravity = gravityInterval(this.level);
    const interval = soft ? Math.min(gravity, SOFT_INTERVAL) : gravity;
    this.gravAcc += dt;
    while (this.gravAcc >= interval) {
      this.gravAcc -= interval;
      if (!this.shift(0, 1)) {
        this.gravAcc = 0;
        break;
      }
      if (soft) this.score += 1;
    }

    if (this.grounded()) {
      this.lockT += dt;
      if (this.lockT >= LOCK_DELAY) this.lock();
    } else {
      this.lockT = 0;
    }
  }

  /* -------------------------------- render -------------------------------- */

  private cell(x: number, y: number, color: string, size = CELL) {
    const g = this.g;
    g.fillStyle = color;
    g.fillRect(x + 1, y + 1, size - 2, size - 2);
    g.fillStyle = shade(color, 0.4);
    g.fillRect(x + 1, y + 1, size - 2, 3);
    g.fillStyle = shade(color, -0.4);
    g.fillRect(x + 1, y + size - 4, size - 2, 3);
  }

  private preview(kind: Kind, x: number, y: number) {
    const size = 18;
    const cells = SHAPES[kind][0];
    const n = BASE[kind].n;
    const ox = x + ((4 - n) * size) / 2;
    const oy = y + (kind === 'I' ? -size / 2 : 0);
    for (const [dx, dy] of cells) this.cell(ox + dx * size, oy + dy * size, COLORS[kind], size);
  }

  render() {
    const g = this.g;
    g.fillStyle = '#05070d';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#0b1020';
    g.fillRect(WX, WY, COLS * CELL, ROWS * CELL);

    // Phosphor burn: a fading glow where each line was cleared, behind the stack.
    for (const m of this.marks) {
      const a = 0.32 * (1 - m.age / PHOSPHOR_LIFE);
      g.fillStyle = `rgba(74, 222, 128, ${a.toFixed(3)})`;
      g.fillRect(WX, WY + m.row * CELL + 4, COLS * CELL, CELL - 8);
      g.fillStyle = `rgba(187, 247, 208, ${(a * 0.8).toFixed(3)})`;
      g.fillRect(WX, WY + m.row * CELL + CELL / 2 - 1, COLS * CELL, 2);
    }

    g.strokeStyle = 'rgba(148, 163, 184, 0.08)';
    g.lineWidth = 1;
    g.beginPath();
    for (let c = 1; c < COLS; c++) {
      g.moveTo(WX + c * CELL + 0.5, WY);
      g.lineTo(WX + c * CELL + 0.5, WY + ROWS * CELL);
    }
    for (let r = 1; r < ROWS; r++) {
      g.moveTo(WX, WY + r * CELL + 0.5);
      g.lineTo(WX + COLS * CELL, WY + r * CELL + 0.5);
    }
    g.stroke();

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = this.board[r * COLS + c];
        if (v) this.cell(WX + c * CELL, WY + r * CELL, COLORS[KINDS[v - 1]]);
      }
    }

    const p = this.cur;
    if (p) {
      if (this.ghostOn) {
        let gy = p.y;
        while (fits(this.board, p.kind, p.rot, p.x, gy + 1)) gy++;
        g.strokeStyle = COLORS[p.kind];
        g.lineWidth = 2;
        g.globalAlpha = 0.45;
        for (const [dx, dy] of SHAPES[p.kind][p.rot]) {
          if (gy + dy < 0) continue;
          g.strokeRect(WX + (p.x + dx) * CELL + 3, WY + (gy + dy) * CELL + 3, CELL - 6, CELL - 6);
        }
        g.globalAlpha = 1;
      }
      for (const [dx, dy] of SHAPES[p.kind][p.rot]) {
        if (p.y + dy < 0) continue;
        this.cell(WX + (p.x + dx) * CELL, WY + (p.y + dy) * CELL, COLORS[p.kind]);
      }
    }

    for (const f of this.flashes) {
      g.fillStyle = `rgba(255, 255, 255, ${(0.8 * (1 - f.age / 0.3)).toFixed(3)})`;
      g.fillRect(WX, WY + f.row * CELL, COLS * CELL, CELL);
    }

    g.strokeStyle = '#334155';
    g.lineWidth = 2;
    g.strokeRect(WX - 1, WY - 1, COLS * CELL + 2, ROWS * CELL + 2);

    // Side panel: the next three pieces, the held piece, and the run's numbers.
    g.fillStyle = '#94a3b8';
    g.font = '700 14px "Press Start 2P", monospace';
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText('NEXT', PANEL, WY);
    this.queue.slice(0, 3).forEach((k, i) => this.preview(k, PANEL + 8, WY + 36 + i * 60));
    g.fillStyle = '#94a3b8';
    g.fillText('HOLD', PANEL, WY + 230);
    if (this.hold) this.preview(this.hold, PANEL + 8, WY + 266);
    g.fillStyle = '#94a3b8';
    g.fillText('LEVEL', PANEL, WY + 360);
    g.fillText('LINES', PANEL, WY + 430);
    g.fillStyle = '#f8fafc';
    g.fillText(String(this.level), PANEL, WY + 384);
    g.fillText(fmt(this.lines), PANEL, WY + 454);
  }
}
