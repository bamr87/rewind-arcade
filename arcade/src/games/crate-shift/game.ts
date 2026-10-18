import type { GameContext, GameInstance, PointerInfo } from '../../engine/types';
import { clamp, fmt, cfgInt, cfgStr } from '../../engine/util';
import { DX, DY, SIZES, WALL, boardKey, generateLevel, levelSize, type Level, type SizeName } from './levels';

/** Arrow keys and WASD, both in direction order: up, left, down, right. */
const MOVE_KEYS: Record<string, number> = {
  ArrowUp: 0, ArrowLeft: 1, ArrowDown: 2, ArrowRight: 3,
  KeyW: 0, KeyA: 1, KeyS: 2, KeyD: 3,
};
const UNDO_KEYS = new Set(['KeyZ', 'KeyU', 'Backspace']);
const TWEEN = 0.09;

type Phase = 'menu' | 'playing' | 'solved' | 'done';

/** One undo entry: where the player stood, and the crate it pushed (-1 for a walk). */
interface Step { from: number; dir: number; crate: number }

/**
 * Crate Shift — a turn-based crate-pushing puzzle in the spirit of Sokoban
 * (Thinking Rabbit, 1982). Logic runs entirely in `onKey`; `update` only eases
 * the last move into place. Levels come from `levels.ts`, which builds each one
 * backwards from its solution, so every level is solvable and none is stored.
 */
export class CrateShift implements GameInstance {
  readonly design: { width: number; height: number };

  private host: GameContext;
  private g: CanvasRenderingContext2D;

  private size: SizeName;
  private crateCount: number;
  private seedCfg: number;
  private levels: number;
  /** Drawn once per session when the seed setting is 0, so each run is new. */
  private runSeed: number;

  private phase: Phase = 'menu';
  private phaseTimer = 0;
  private levelNo = 0;
  private level!: Level;
  private crates = new Set<number>();
  private player = 0;
  private history: Step[] = [];
  private moves = 0;
  private score = 0;
  private lastLevelScore = 0;
  private bestBefore = 0;

  /** Keys held down right now, so an OS auto-repeat can't spam undo or restart. */
  private held = new Set<string>();
  private tween = { t: 1, dir: 0, crate: -1 };

  constructor(ctx: GameContext) {
    this.host = ctx;
    this.g = ctx.ctx;
    const c = ctx.config;
    const size = cfgStr(c.size, 'medium');
    this.size = size === 'small' || size === 'large' ? size : 'medium';
    this.crateCount = clamp(cfgInt(c.crates, 3), 2, 6);
    this.seedCfg = clamp(cfgInt(c.seed, 0), 0, 9999);
    this.levels = clamp(cfgInt(c.levels, 10), 3, 20);
    this.runSeed = 1 + Math.floor(Math.random() * 2147483000);
    const s = SIZES[this.size];
    const cell = this.size === 'small' ? 48 : this.size === 'medium' ? 42 : 36;
    this.design = { width: (s.maxCols + 2) * cell, height: (s.maxRows + 2) * cell };
    this.showMenu();
  }

  /* ------------------------------ Levels -------------------------------- */
  /** A fixed `seed` replays the same run of levels; 0 draws a new run each session. */
  private levelSeed(n: number) {
    const base = this.seedCfg > 0 ? this.seedCfg * 1009 : this.runSeed;
    return (base + n * 7919) >>> 0;
  }

  private loadLevel(n: number) {
    this.levelNo = n;
    this.level = generateLevel(this.levelSeed(n), this.size, this.crateCount, n);
    this.resetLevel();
  }

  /** Back to the level's opening position — restart, and the end of a full undo. */
  private resetLevel() {
    this.crates = new Set(this.level.crates);
    this.player = this.level.player;
    this.history.length = 0;
    this.moves = 0;
    this.tween.t = 1;
    this.emitHud();
  }

  private solved() {
    for (const t of this.level.targets) if (!this.crates.has(t)) return false;
    return true;
  }

  /* ------------------------------- Moves -------------------------------- */
  private move(dir: number) {
    const cols = this.level.cols;
    const next = this.player + DY[dir] * cols + DX[dir];
    if (this.level.tiles[next] === WALL) { this.sfxBump(); return; }
    let crate = -1;
    if (this.crates.has(next)) {
      const beyond = next + DY[dir] * cols + DX[dir];
      // Crates are pushed, never pulled, and only into an empty floor square.
      if (this.level.tiles[beyond] === WALL || this.crates.has(beyond)) { this.sfxBump(); return; }
      this.crates.delete(next);
      this.crates.add(beyond);
      crate = beyond;
    }
    this.history.push({ from: this.player, dir, crate });
    this.player = next;
    this.moves++;
    this.tween = { t: 0, dir, crate };
    if (crate >= 0) {
      const home = this.level.targets.includes(crate);
      this.host.audio.tone(home ? 660 : 220, { type: home ? 'triangle' : 'square', dur: 0.06, vol: 0.05 });
      if (this.solved()) { this.finishLevel(); return; }
    } else {
      this.host.audio.tone(140, { type: 'triangle', dur: 0.03, vol: 0.025 });
    }
    this.emitHud();
  }

  private undo() {
    const last = this.history.pop();
    if (!last) { this.sfxBump(); return; }
    if (last.crate >= 0) {
      this.crates.delete(last.crate);
      this.crates.add(last.crate - DY[last.dir] * this.level.cols - DX[last.dir]);
    }
    this.player = last.from;
    this.moves--;
    this.tween.t = 1;
    this.host.audio.tone(300, { type: 'sine', dur: 0.05, vol: 0.035, slideTo: 200 });
    this.emitHud();
  }

  private restartLevel() {
    if (!this.history.length) return;
    this.resetLevel();
    this.host.audio.arp([392, 262], { type: 'sine', dur: 0.07, vol: 0.04, gap: 0.05 });
  }

  /* -------------------------------- Flow -------------------------------- */
  /** Per level: max(100, 1000 + 20 × (par − moves)). Undo takes moves back, so only the final path counts. */
  private finishLevel() {
    this.lastLevelScore = Math.max(100, 1000 + 20 * (this.level.par - this.moves));
    this.score += this.lastLevelScore;
    this.host.submitScore(this.score);
    this.phase = 'solved';
    this.phaseTimer = 0.9;
    this.host.audio.arp([523, 659, 784], { type: 'triangle', dur: 0.12, vol: 0.06, gap: 0.08 });
    this.emitHud();
  }

  private advance() {
    if (this.levelNo + 1 < this.levels) {
      this.phase = 'playing';
      this.loadLevel(this.levelNo + 1);
      return;
    }
    this.phase = 'done';
    this.host.submitScore(this.score);
    this.host.audio.arp([523, 659, 784, 1047], { type: 'triangle', dur: 0.24, vol: 0.07, gap: 0.11 });
    this.emitHud();
    this.host.setOverlay({
      variant: 'win',
      kicker: 'Warehouse cleared',
      title: `${this.levels} levels shifted`,
      rows: [
        { label: 'Last level', value: '+' + fmt(this.lastLevelScore) },
        { label: 'Seed', value: this.seedCfg > 0 ? String(this.seedCfg) : 'random' },
      ],
      bigStat: {
        label: 'Score', value: fmt(this.score),
        note: this.score > this.bestBefore ? '★ New best!' : undefined,
      },
      buttons: [
        { action: 'restart', label: 'New run', primary: true },
        { action: 'menu', label: 'Title', ghost: true },
      ],
    });
  }

  private startRun() {
    this.score = 0;
    this.lastLevelScore = 0;
    this.bestBefore = this.host.getBest();
    this.phase = 'playing';
    this.host.setOverlay(null);
    this.loadLevel(0);
  }

  private showMenu() {
    this.phase = 'menu';
    this.score = 0;
    this.loadLevel(0);
    const inner = levelSize(this.size, 0);
    this.host.setOverlay({
      variant: 'menu',
      title: 'CRATE SHIFT',
      subtitle: `${this.levels} levels · ${this.crateCount} crates · from ${inner.cols} × ${inner.rows}`,
      bullets: [
        { icon: '📦', text: 'Push every crate onto a target. Walk into a crate to push it — crates never pull.' },
        { icon: '↩', text: 'Z, U or Backspace undoes a move, all the way back to the start. R restarts the level.' },
        { icon: '🏁', text: 'Par counts every step of a known solution. Match it for 1,000; beat it for more.' },
        { icon: '🎲', text: 'Levels are generated from the seed setting — 0 builds a new run every game.' },
      ],
      buttons: [{ action: 'start', label: 'Start', primary: true }],
    });
  }

  /* -------------------------------- HUD --------------------------------- */
  private emitHud() {
    const best = Math.max(this.host.getBest(), this.score);
    this.host.setHud({
      badge: `LEVEL ${this.levelNo + 1}/${this.levels}`,
      stats: [
        { label: 'Level', value: String(this.levelNo + 1) },
        { label: 'Moves', value: String(this.moves), accent: this.moves > this.level.par },
        { label: 'Par', value: String(this.level.par) },
        { label: 'Score', value: fmt(this.score) },
        { label: 'Best', value: fmt(best) },
      ],
      actions: [
        { icon: '↩', label: 'Undo — Z', action: 'undo' },
        { icon: '⟲', label: 'Restart level — R', action: 'reset' },
      ],
    });
  }

  private sfxBump() { this.host.audio.tone(110, { type: 'sawtooth', dur: 0.05, vol: 0.03 }); }

  /* ------------------------- GameInstance API --------------------------- */
  update(dt: number) {
    if (this.tween.t < 1) this.tween.t = Math.min(1, this.tween.t + dt / TWEEN);
    if (this.phase === 'solved') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) this.advance();
    }
  }

  onKey(code: string, down: boolean) {
    if (!down) { this.held.delete(code); return; }
    const repeat = this.held.has(code);
    this.held.add(code);
    if (this.phase !== 'playing') return;
    const dir = MOVE_KEYS[code];
    // Holding a direction walks on — handy in a long corridor.
    if (dir !== undefined) { this.move(dir); return; }
    if (repeat) return;
    if (UNDO_KEYS.has(code)) this.undo();
    else if (code === 'KeyR') this.restartLevel();
  }

  /** Touch / mouse: a tap steps one square toward it, along the longer axis. */
  onPointerDown(p: PointerInfo) {
    if (this.phase !== 'playing' || p.button !== 0) return;
    const { cell, ox, oy } = this.layout();
    const cols = this.level.cols;
    const px = ox + ((this.player % cols) + 0.5) * cell, py = oy + (((this.player / cols) | 0) + 0.5) * cell;
    const dx = p.x - px, dy = p.y - py;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < cell / 2) return;
    this.move(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 3) : (dy < 0 ? 0 : 2));
  }

  onAction(action: string) {
    switch (action) {
      case 'start': case 'restart': this.startRun(); break;
      case 'menu': this.showMenu(); break;
      case 'undo': if (this.phase === 'playing') this.undo(); break;
      case 'reset': if (this.phase === 'playing') this.restartLevel(); break;
    }
  }

  onPause() { this.held.clear(); }

  /** Read-only view for the headless checks (`tools/play-crate-shift.mjs`) and `?debug=1`. */
  snapshot() {
    const view = { ...this.level, crates: [...this.crates].sort((a, b) => a - b), player: this.player };
    return {
      phase: this.phase,
      level: this.levelNo + 1,
      levels: this.levels,
      moves: this.moves,
      par: this.level.par,
      score: this.score,
      solved: this.solved(),
      solution: this.level.solution.slice(),
      board: boardKey(view),
      cols: this.level.cols,
      rows: this.level.rows,
      seed: this.level.seed,
    };
  }

  /* ------------------------------ Rendering ----------------------------- */
  /** The board is centred and scaled to fill the design box, so early levels draw larger. */
  private layout() {
    const W = this.design.width, H = this.design.height;
    const cell = Math.floor(Math.min(W / this.level.cols, H / this.level.rows));
    return { cell, ox: Math.floor((W - cell * this.level.cols) / 2), oy: Math.floor((H - cell * this.level.rows) / 2) };
  }

  render() {
    const g = this.g;
    const W = this.design.width, H = this.design.height;
    const { cols, tiles, targets } = this.level;
    const { cell, ox, oy } = this.layout();
    const now = this.host.now();

    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#16120d'); bg.addColorStop(1, '#0b0907');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    for (let i = 0; i < tiles.length; i++) {
      const x = ox + (i % cols) * cell, y = oy + ((i / cols) | 0) * cell;
      if (tiles[i] === WALL) {
        if (!this.touchesFloor(i)) continue;
        g.fillStyle = '#3a3128'; g.fillRect(x, y, cell, cell);
        g.fillStyle = '#4a3f33'; g.fillRect(x + 1, y + 1, cell - 2, cell * 0.45);
        g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1;
        g.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
        continue;
      }
      g.fillStyle = (i + ((i / cols) | 0)) % 2 ? '#211c16' : '#1d1813';
      g.fillRect(x, y, cell, cell);
    }

    for (const t of targets) {
      const cx = ox + ((t % cols) + 0.5) * cell, cy = oy + (((t / cols) | 0) + 0.5) * cell;
      g.strokeStyle = '#fbbf24'; g.lineWidth = Math.max(2, cell * 0.07);
      g.beginPath(); g.arc(cx, cy, cell * 0.22, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(251,191,36,0.18)';
      g.beginPath(); g.arc(cx, cy, cell * 0.12, 0, Math.PI * 2); g.fill();
    }

    // Ease the piece(s) that just moved from where they came from.
    const lag = (1 - this.tween.t) * cell;
    const ldx = -DX[this.tween.dir] * lag, ldy = -DY[this.tween.dir] * lag;

    for (const c of this.crates) {
      const off = c === this.tween.crate;
      this.drawCrate(ox + (c % cols) * cell + (off ? ldx : 0), oy + ((c / cols) | 0) * cell + (off ? ldy : 0), cell, targets.includes(c));
    }
    this.drawPlayer(ox + (this.player % cols) * cell + ldx, oy + ((this.player / cols) | 0) * cell + ldy, cell);

    if (this.phase === 'solved' || this.phase === 'done') {
      const pulse = 0.35 + 0.25 * Math.sin(now / 200);
      g.strokeStyle = `rgba(251,191,36,${pulse.toFixed(3)})`;
      g.lineWidth = 4;
      g.strokeRect(2, 2, W - 4, H - 4);
    }
  }

  /** Only the walls that border the floor are drawn; the rest is dark rock. */
  private touchesFloor(i: number) {
    const cols = this.level.cols, n = this.level.tiles.length;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = (i % cols) + dx, j = i + dy * cols + dx;
        if (x < 0 || x >= cols || j < 0 || j >= n) continue;
        if (this.level.tiles[j] !== WALL) return true;
      }
    }
    return false;
  }

  private drawCrate(x: number, y: number, cell: number, home: boolean) {
    const g = this.g;
    const p = cell * 0.1, s = cell - p * 2;
    g.fillStyle = home ? '#b45309' : '#8b5a2b';
    g.fillRect(x + p, y + p, s, s);
    g.strokeStyle = home ? '#fde68a' : '#5b3a1a';
    g.lineWidth = Math.max(2, cell * 0.06);
    g.strokeRect(x + p, y + p, s, s);
    g.beginPath();
    g.moveTo(x + p, y + p); g.lineTo(x + p + s, y + p + s);
    g.moveTo(x + p + s, y + p); g.lineTo(x + p, y + p + s);
    g.stroke();
  }

  private drawPlayer(x: number, y: number, cell: number) {
    const g = this.g;
    const cx = x + cell / 2, cy = y + cell / 2;
    g.fillStyle = '#38bdf8';
    g.beginPath(); g.arc(cx, cy + cell * 0.06, cell * 0.28, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fde68a';
    g.beginPath(); g.arc(cx, cy - cell * 0.16, cell * 0.15, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0f172a';
    g.fillRect(cx - cell * 0.17, cy - cell * 0.3, cell * 0.34, cell * 0.08);
  }
}
