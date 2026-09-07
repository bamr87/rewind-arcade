import type { GameContext, GameInstance, PointerInfo } from '../../engine/types';
import { clamp, fmt, cfgInt, cfgBool } from '../../engine/util';

const CELL = 34;

/** Cell states. A cell is exactly one of these; mines live in a parallel array. */
const HIDDEN = 0;
const REVEALED = 1;
const FLAGGED = 2;

/** Classic 1–8 palette, brightened for the dark cabinet. */
const NUM_COLORS = ['', '#60a5fa', '#4ade80', '#f87171', '#c084fc', '#fbbf24', '#22d3ee', '#f472b6', '#cbd5e1'];

type Phase = 'menu' | 'playing' | 'boom' | 'lost' | 'clearing' | 'won';
interface Particle { x: number; y: number; vx: number; vy: number; age: number; life: number; color: string; size: number; }

/**
 * Minesweeper — deduction rather than reflexes. It is the third game on the
 * arcade engine and the first that is turn-based: nothing moves on its own, so
 * `update` only drives the clock and the post-mortem effects while `render`
 * paints a pure function of the grid.
 *
 * Mines are placed on the *first* reveal, not at construction, so the opening
 * click can never lose and (with "safe start") always opens a pocket.
 */
export class Minesweeper implements GameInstance {
  readonly design: { width: number; height: number };

  private host: GameContext;
  private g: CanvasRenderingContext2D;

  private cols: number;
  private rows: number;
  private total: number;
  private mineCount: number;
  private safeStart: boolean;
  private chording: boolean;

  private mine: Uint8Array;
  private cell: Uint8Array;
  private near: Uint8Array;
  private placed = false;
  private revealed = 0;
  private flags = 0;

  private phase: Phase = 'menu';
  private phaseTimer = 0;
  private elapsed = 0;
  private lastSecond = -1;
  private score = 0;
  private lastBonus = { mines: 0, time: 0 };
  private bestBefore = 0;
  private newBest = false;

  /** Set when a mine goes off: the whole field is shown, flags and all. */
  private exposed = false;
  private boomAt = -1;
  private flagMode = false;

  private hover = { x: -1, y: -1, over: false };
  private revealAnim = new Map<number, number>();
  private particles: Particle[] = [];
  private shake = 0;
  private lastWheel = 0;

  constructor(ctx: GameContext) {
    this.host = ctx;
    this.g = ctx.ctx;
    const c = ctx.config;
    this.cols = clamp(cfgInt(c.cols, 16), 9, 30);
    this.rows = clamp(cfgInt(c.rows, 16), 9, 20);
    this.total = this.cols * this.rows;
    const density = clamp(cfgInt(c.density, 16), 5, 30) / 100;
    // Leave room for the 9-cell opening pocket no matter how dense the request.
    this.mineCount = clamp(Math.round(this.total * density), 1, this.total - 10);
    this.safeStart = cfgBool(c.safeStart, true);
    this.chording = cfgBool(c.chording, true);
    this.mine = new Uint8Array(this.total);
    this.cell = new Uint8Array(this.total);
    this.near = new Uint8Array(this.total);
    this.design = { width: this.cols * CELL, height: this.rows * CELL };
    this.showMenu();
  }

  /* ------------------------------ Geometry ------------------------------ */
  private idx(x: number, y: number) { return y * this.cols + x; }
  private safeCells() { return this.total - this.mineCount; }

  private eachNeighbor(i: number, fn: (n: number) => void) {
    const x = i % this.cols, y = (i / this.cols) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
        fn(ny * this.cols + nx);
      }
    }
  }

  /* ------------------------------- Field -------------------------------- */
  /**
   * Lay the mines, keeping the opening click (and, with safe start, its whole
   * neighbourhood) clear. Partial Fisher–Yates over the eligible cells so the
   * draw stays uniform without rejection-sampling on dense boards.
   */
  private placeMines(openIdx: number) {
    const banned = new Set<number>([openIdx]);
    if (this.safeStart) this.eachNeighbor(openIdx, (n) => banned.add(n));

    const pool: number[] = [];
    for (let i = 0; i < this.total; i++) if (!banned.has(i)) pool.push(i);

    const n = Math.min(this.mineCount, pool.length);
    for (let k = 0; k < n; k++) {
      const j = k + Math.floor(Math.random() * (pool.length - k));
      const t = pool[k]; pool[k] = pool[j]; pool[j] = t;
      this.mine[pool[k]] = 1;
    }

    for (let i = 0; i < this.total; i++) {
      let count = 0;
      this.eachNeighbor(i, (m) => { if (this.mine[m]) count++; });
      this.near[i] = count;
    }
    this.placed = true;
  }

  /** Open a cell, flood-filling outward through the blank ones. */
  private reveal(i: number) {
    if (this.cell[i] !== HIDDEN) return;
    if (!this.placed) this.placeMines(i);
    if (this.mine[i]) { this.boom(i); return; }

    const now = this.host.now();
    const stack = [i];
    let opened = 0;
    while (stack.length) {
      const c = stack.pop() as number;
      if (this.cell[c] !== HIDDEN) continue;
      this.cell[c] = REVEALED;
      this.revealAnim.set(c, now);
      this.revealed++;
      opened++;
      // Blanks carry the cascade; flagged neighbours block it, as they should.
      if (this.near[c] === 0) {
        this.eachNeighbor(c, (nb) => { if (this.cell[nb] === HIDDEN) stack.push(nb); });
      }
    }

    this.score += opened * 10;
    this.sfxReveal(opened);
    if (this.revealed >= this.safeCells()) this.beginWin();
    else this.emitHud();
  }

  /**
   * Click a satisfied number to open everything still hidden around it — the
   * classic speed-play move, and the only one that can lose you a solved board.
   */
  private chord(i: number) {
    if (this.cell[i] !== REVEALED || this.near[i] === 0) return;
    let flagged = 0;
    const targets: number[] = [];
    this.eachNeighbor(i, (n) => {
      if (this.cell[n] === FLAGGED) flagged++;
      else if (this.cell[n] === HIDDEN) targets.push(n);
    });
    if (flagged !== this.near[i] || !targets.length) { this.sfxDeny(); return; }
    for (const t of targets) {
      if (this.phase !== 'playing') return; // a mine went off mid-chord
      this.reveal(t);
    }
  }

  private toggleFlag(i: number) {
    if (this.cell[i] === REVEALED) { this.sfxDeny(); return; }
    if (this.cell[i] === FLAGGED) {
      this.cell[i] = HIDDEN;
      this.flags--;
      this.host.audio.tone(340, { type: 'square', dur: 0.05, vol: 0.04 });
    } else {
      this.cell[i] = FLAGGED;
      this.flags++;
      this.host.audio.tone(680, { type: 'square', dur: 0.05, vol: 0.05 });
    }
    this.emitHud();
  }

  private toggleFlagMode() {
    this.flagMode = !this.flagMode;
    this.emitHud();
  }

  /* -------------------------------- Flow -------------------------------- */
  private boom(i: number) {
    this.phase = 'boom';
    this.phaseTimer = 1.0;
    this.exposed = true;
    this.boomAt = i;
    this.shake = 16;
    this.newBest = this.score > 0 && this.score > this.bestBefore;
    this.host.submitScore(this.score);
    this.burst(i);
    this.sfxBoom();
    this.emitHud();
  }

  private showLostOverlay() {
    this.phase = 'lost';
    const left = this.safeCells() - this.revealed;
    this.host.setOverlay({
      variant: 'lose',
      kicker: 'Boom',
      title: `${left} ${left === 1 ? 'square' : 'squares'} short`,
      rows: [
        { label: 'Swept', value: `${Math.round((this.revealed / this.safeCells()) * 100)}%` },
        { label: 'Time', value: mmss(this.elapsed) },
      ],
      bigStat: {
        label: 'Final score', value: fmt(this.score),
        note: this.newBest ? '★ New best!' : undefined,
      },
      buttons: [
        { action: 'restart', label: 'Play again', primary: true },
        { action: 'menu', label: 'Title', ghost: true },
      ],
    });
  }

  private beginWin() {
    this.phase = 'clearing';
    this.phaseTimer = 0.9;
    // Courtesy flag on anything the player left unmarked.
    for (let i = 0; i < this.total; i++) {
      if (this.mine[i] && this.cell[i] !== FLAGGED) { this.cell[i] = FLAGGED; this.flags++; }
    }
    const mineBonus = this.mineCount * 100;
    const timeBonus = Math.max(0, 500 - Math.round(this.elapsed)) * 4;
    this.score += mineBonus + timeBonus;
    this.lastBonus = { mines: mineBonus, time: timeBonus };
    this.newBest = this.score > this.bestBefore;
    this.host.submitScore(this.score);
    this.sfxWin();
    this.emitHud();
  }

  private showWonOverlay() {
    this.phase = 'won';
    this.host.setOverlay({
      variant: 'win',
      kicker: 'Field cleared',
      title: mmss(this.elapsed),
      rows: [
        { label: `Mines found (${this.mineCount})`, value: '+' + fmt(this.lastBonus.mines) },
        { label: 'Time bonus', value: '+' + fmt(this.lastBonus.time) },
      ],
      bigStat: {
        label: 'Score', value: fmt(this.score),
        note: this.newBest ? '★ New best!' : undefined,
      },
      buttons: [
        { action: 'restart', label: 'New field', primary: true },
        { action: 'menu', label: 'Title', ghost: true },
      ],
    });
  }

  private startGame() {
    this.mine.fill(0);
    this.cell.fill(0);
    this.near.fill(0);
    this.placed = false;
    this.revealed = 0;
    this.flags = 0;
    this.exposed = false;
    this.boomAt = -1;
    this.elapsed = 0;
    this.lastSecond = -1;
    this.score = 0;
    this.shake = 0;
    this.revealAnim.clear();
    this.particles.length = 0;
    this.bestBefore = this.host.getBest();
    this.phase = 'playing';
    this.host.setOverlay(null);
    this.emitHud();
  }

  private showMenu() {
    this.phase = 'menu';
    this.mine.fill(0);
    this.cell.fill(0);
    this.near.fill(0);
    this.placed = false;
    this.revealed = 0;
    this.flags = 0;
    this.exposed = false;
    this.elapsed = 0;
    this.score = 0;
    this.particles.length = 0;
    this.revealAnim.clear();
    this.emitHud();
    this.host.setOverlay({
      variant: 'menu',
      title: 'MINESWEEPER',
      subtitle: `${this.cols} × ${this.rows} · ${this.mineCount} mines`,
      bullets: [
        { icon: '⛏', text: 'Click a square to uncover it. The first click is always safe.' },
        { icon: '🔢', text: 'A number is how many mines touch that square — all eight neighbours.' },
        { icon: '🚩', text: 'Right-click, scroll, or press F to flag a square you think is a mine.' },
        this.chording
          ? { icon: '⚡', text: 'Click a number with all its mines flagged to clear the rest at once.' }
          : { icon: '🏁', text: 'Uncover every safe square to clear the field.' },
      ],
      buttons: [{ action: 'start', label: 'Start game', primary: true }],
    });
  }

  /* -------------------------------- HUD --------------------------------- */
  private emitHud() {
    const left = this.mineCount - this.flags;
    this.host.setHud({
      badge: `${this.cols} × ${this.rows}`,
      progress: {
        value: this.revealed / this.safeCells(),
        label: `${this.revealed} / ${this.safeCells()}`,
        complete: this.revealed >= this.safeCells(),
      },
      stats: [
        { label: 'Mines', value: String(left), accent: left < 0 },
        { label: 'Time', value: mmss(this.elapsed) },
        { label: 'Score', value: fmt(this.score) },
      ],
      actions: [
        { icon: this.flagMode ? '🚩' : '⛏', label: this.flagMode ? 'Flag mode — F' : 'Dig mode — F', action: 'flag' },
      ],
    });
  }

  /* ------------------------------- Sounds ------------------------------- */
  private sfxReveal(opened: number) {
    if (opened > 1) {
      // A cascade gets a short rising sparkle scaled to how much opened up.
      const notes = Math.min(5, 2 + Math.floor(opened / 8));
      const freqs: number[] = [];
      for (let i = 0; i < notes; i++) freqs.push(520 + i * 110);
      this.host.audio.arp(freqs, { type: 'triangle', dur: 0.07, vol: 0.045, gap: 0.045 });
    } else {
      this.host.audio.tone(420, { type: 'triangle', dur: 0.06, vol: 0.05 });
    }
  }
  private sfxDeny() { this.host.audio.tone(130, { type: 'sawtooth', dur: 0.08, vol: 0.04 }); }
  private sfxBoom() {
    this.host.audio.tone(90, { type: 'sawtooth', dur: 0.5, vol: 0.09, slideTo: 40 });
    this.host.audio.arp([300, 210, 150, 100], { type: 'square', dur: 0.22, vol: 0.05, gap: 0.09 });
  }
  private sfxWin() {
    this.host.audio.arp([523, 659, 784, 1047], { type: 'triangle', dur: 0.26, vol: 0.07, gap: 0.11 });
  }

  /* ------------------------------ Effects ------------------------------- */
  private burst(i: number) {
    const x = (i % this.cols + 0.5) * CELL, y = ((i / this.cols | 0) + 0.5) * CELL;
    for (let k = 0; k < 34; k++) {
      const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 220;
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        age: 0, life: 0.5 + Math.random() * 0.5,
        color: Math.random() < 0.55 ? '#f87171' : Math.random() < 0.5 ? '#fbbf24' : '#fed7aa',
        size: 2 + Math.random() * 3,
      });
    }
  }

  /* ------------------------- GameInstance API --------------------------- */
  update(dt: number) {
    this.shake = Math.max(0, this.shake - dt * 26);
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.age += dt;
      if (p.age >= p.life) { ps.splice(i, 1); continue; }
      p.vx *= 0.93; p.vy *= 0.93;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }

    if (this.phase === 'playing') {
      // The clock only runs once the first square is open, and the host has
      // already stopped calling us when the game is paused or backgrounded.
      if (this.placed) this.elapsed += dt;
      const sec = Math.floor(this.elapsed);
      if (sec !== this.lastSecond) { this.lastSecond = sec; this.emitHud(); }
      return;
    }
    if (this.phase === 'boom' || this.phase === 'clearing') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        if (this.phase === 'boom') this.showLostOverlay();
        else this.showWonOverlay();
      }
    }
  }

  onPointerDown(p: PointerInfo) {
    if (this.phase !== 'playing') return;
    const x = Math.floor(p.x / CELL), y = Math.floor(p.y / CELL);
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    const i = this.idx(x, y);

    if (this.chording && (p.button === 1 || (p.button === 0 && !this.flagMode && this.cell[i] === REVEALED))) {
      this.chord(i);
      return;
    }
    if (p.button === 2 || (p.button === 0 && this.flagMode)) { this.toggleFlag(i); return; }
    if (p.button !== 0) return;
    if (this.cell[i] === FLAGGED) { this.sfxDeny(); return; }
    this.reveal(i);
  }

  onPointerMove(p: PointerInfo) {
    this.hover.x = Math.floor(p.x / CELL);
    this.hover.y = Math.floor(p.y / CELL);
    this.hover.over = p.pointerType !== 'touch';
  }
  onPointerLeave() { this.hover.over = false; }

  onWheel() {
    const now = this.host.now();
    if (now - this.lastWheel > 150) { this.lastWheel = now; this.toggleFlagMode(); }
  }

  onKey(code: string, down: boolean) {
    if (!down) return;
    if (code === 'KeyF') this.toggleFlagMode();
  }

  onAction(action: string) {
    switch (action) {
      case 'start': case 'restart': this.startGame(); break;
      case 'menu': this.showMenu(); break;
      case 'flag': this.toggleFlagMode(); break;
    }
  }

  /* ------------------------------ Rendering ----------------------------- */
  render() {
    const g = this.g;
    const W = this.design.width, H = this.design.height;
    const now = this.host.now();

    g.save();
    if (this.shake > 0.1) g.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1a1611'); bg.addColorStop(1, '#0d0b09');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    const hotIdx = this.hover.over && this.phase === 'playing' &&
      this.hover.x >= 0 && this.hover.y >= 0 && this.hover.x < this.cols && this.hover.y < this.rows
      ? this.idx(this.hover.x, this.hover.y)
      : -1;

    g.textAlign = 'center';
    g.textBaseline = 'middle';

    for (let i = 0; i < this.total; i++) {
      const px = (i % this.cols) * CELL, py = ((i / this.cols) | 0) * CELL;
      const state = this.cell[i];
      const isMine = this.mine[i] === 1;

      if (state === REVEALED) {
        this.drawDug(px, py, this.exposed && isMine);
        if (isMine) this.drawMine(px, py, i === this.boomAt);
        else if (this.near[i] > 0) {
          g.font = `800 ${Math.round(CELL * 0.55)}px ui-sans-serif, system-ui, sans-serif`;
          g.fillStyle = NUM_COLORS[this.near[i]];
          g.fillText(String(this.near[i]), px + CELL / 2, py + CELL / 2 + 1);
        }
        continue;
      }

      // Still covered: a mine only shows through once the field is exposed.
      if (this.exposed && isMine && state !== FLAGGED) {
        this.drawDug(px, py, true);
        this.drawMine(px, py, false);
        continue;
      }
      this.drawCovered(px, py, i === hotIdx);
      if (state === FLAGGED) {
        this.drawFlag(px, py);
        if (this.exposed && !isMine) this.drawWrong(px, py);
      }
    }

    // Fresh reveals flash once, which reads the cascade at a glance.
    for (const [i, t0] of this.revealAnim) {
      const age = (now - t0) / 320;
      if (age >= 1) { this.revealAnim.delete(i); continue; }
      const px = (i % this.cols) * CELL, py = ((i / this.cols) | 0) * CELL;
      g.fillStyle = `rgba(251,191,36,${(0.3 * (1 - age)).toFixed(3)})`;
      g.fillRect(px, py, CELL, CELL);
    }

    for (const p of this.particles) {
      const f = 1 - p.age / p.life;
      g.globalAlpha = Math.max(0, f);
      g.fillStyle = p.color;
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    g.globalAlpha = 1;

    if (this.phase === 'clearing' || this.phase === 'won') {
      const pulse = 0.35 + 0.25 * Math.sin(now / 220);
      g.strokeStyle = `rgba(251,191,36,${pulse.toFixed(3)})`;
      g.lineWidth = 4;
      g.strokeRect(2, 2, W - 4, H - 4);
    }

    g.restore();
  }

  /** A covered, still-clickable square. */
  private drawCovered(px: number, py: number, hot: boolean) {
    const g = this.g;
    const x = px + 1, y = py + 1, s = CELL - 2;
    const grad = g.createLinearGradient(x, y, x, y + s);
    grad.addColorStop(0, hot ? '#5d5445' : '#443f37');
    grad.addColorStop(1, hot ? '#3c362c' : '#2b2822');
    g.fillStyle = grad;
    roundRect(g, x, y, s, s, 5);
    g.fill();

    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(255,255,255,0.11)';
    g.beginPath();
    g.moveTo(x + 2, y + s - 3); g.lineTo(x + 2, y + 3); g.lineTo(x + s - 3, y + 2);
    g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.4)';
    g.beginPath();
    g.moveTo(x + 3, y + s - 2); g.lineTo(x + s - 2, y + s - 2); g.lineTo(x + s - 2, y + 3);
    g.stroke();
  }

  /** An opened square — sunken, so the field reads as terrain. */
  private drawDug(px: number, py: number, danger: boolean) {
    const g = this.g;
    g.fillStyle = danger ? '#3b1414' : '#191510';
    g.fillRect(px, py, CELL, CELL);
    g.strokeStyle = danger ? 'rgba(248,113,113,0.35)' : 'rgba(255,255,255,0.045)';
    g.lineWidth = 1;
    g.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
  }

  private drawMine(px: number, py: number, detonated: boolean) {
    const g = this.g;
    const cx = px + CELL / 2, cy = py + CELL / 2, r = CELL * 0.24;
    g.strokeStyle = detonated ? '#fecaca' : '#8d97a6';
    g.lineWidth = 2;
    g.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 4, dx = Math.cos(a) * r * 1.5, dy = Math.sin(a) * r * 1.5;
      g.moveTo(cx - dx, cy - dy); g.lineTo(cx + dx, cy + dy);
    }
    g.stroke();
    const rg = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    if (detonated) { rg.addColorStop(0, '#fee2e2'); rg.addColorStop(0.4, '#ef4444'); rg.addColorStop(1, '#7f1d1d'); }
    else { rg.addColorStop(0, '#e2e8f0'); rg.addColorStop(0.45, '#64748b'); rg.addColorStop(1, '#1e293b'); }
    g.fillStyle = rg;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  }

  private drawFlag(px: number, py: number) {
    const g = this.g;
    const cx = px + CELL / 2, top = py + CELL * 0.22, bot = py + CELL * 0.75;
    g.strokeStyle = '#cbd5e1';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx + CELL * 0.09, top); g.lineTo(cx + CELL * 0.09, bot); g.stroke();
    g.fillStyle = '#94a3b8';
    g.fillRect(cx - CELL * 0.16, bot - 1, CELL * 0.32, 3);
    g.fillStyle = '#ef4444';
    g.beginPath();
    g.moveTo(cx + CELL * 0.09, top);
    g.lineTo(cx - CELL * 0.21, top + CELL * 0.13);
    g.lineTo(cx + CELL * 0.09, top + CELL * 0.26);
    g.closePath(); g.fill();
  }

  /** Crossed out after a loss: a flag that was never on a mine. */
  private drawWrong(px: number, py: number) {
    const g = this.g;
    const p = CELL * 0.24;
    g.strokeStyle = 'rgba(248,113,113,0.9)';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(px + p, py + p); g.lineTo(px + CELL - p, py + CELL - p);
    g.moveTo(px + CELL - p, py + p); g.lineTo(px + p, py + CELL - p);
    g.stroke();
  }
}

function mmss(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = clamp(r, 0, Math.min(w, h) / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}
