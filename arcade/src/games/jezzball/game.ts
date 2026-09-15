import type { GameContext, GameInstance, PointerInfo } from '../../engine/types';
import { clamp, fmt, shade, cfgInt, cfgNum } from '../../engine/util';

const CELL = 24;
const BALL_PALETTE = [
  '#fb7185', '#fbbf24', '#34d399', '#60a5fa', '#c084fc',
  '#f472b6', '#4ade80', '#f97316', '#22d3ee', '#a3e635',
];
const ARM_COLORS = { neg: '#38bdf8', pos: '#fb7185' };
const TILE = '#16233f';
const TILE_EDGE = 'rgba(94,214,255,0.35)';

type Orientation = 'v' | 'h';
type Phase = 'menu' | 'playing' | 'clearing' | 'levelclear' | 'dying' | 'gameover';

interface Ball {
  x: number; y: number; r: number; vx: number; vy: number;
  color: string; trail: { x: number; y: number }[];
}
interface Arm { dir: -1 | 1; len: number; done: boolean; dead: boolean; }
interface Build { o: Orientation; cx: number; cy: number; arms: Arm[]; }
interface Particle {
  x: number; y: number; vx: number; vy: number;
  age: number; life: number; color: string; size: number; grav: number;
}
interface Floater { x: number; y: number; text: string; age: number; life: number; }
interface Rect { x: number; y: number; w: number; h: number; }

/**
 * JezzBall — the classic "trap the bouncing balls" game, ported to the arcade
 * engine. Rendering, physics and effects live here; the host owns the loop,
 * input, pause and scaling.
 */
export class JezzBall implements GameInstance {
  readonly design: { width: number; height: number };

  private host: GameContext;
  private g: CanvasRenderingContext2D;

  // Config-derived
  private cols: number;
  private rows: number;
  private total: number;
  private winPct: number;
  private buildSpeed: number;
  private startBalls: number;
  private speedFactor: number;

  // World
  private grid: Uint8Array;
  private fillAnim = new Map<number, number>();
  private filled = 0;
  private balls: Ball[] = [];
  private build: Build | null = null;
  private orientation: Orientation = 'v';
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private shake = 0;

  // Flow
  private phase: Phase = 'menu';
  private level = 1;
  private score = 0;
  private lives = 0;
  private phaseTimer = 0;
  private lastBonus = { over: 0, life: 0, cleared: 0 };
  private newBest = false;
  private bestBefore = 0;

  // Input
  private mouse = { x: 0, y: 0, over: false };
  private lastWheel = 0;

  constructor(ctx: GameContext) {
    this.host = ctx;
    this.g = ctx.ctx;
    const c = ctx.config;
    this.cols = cfgInt(c.cols, 40);
    this.rows = cfgInt(c.rows, 25);
    this.total = this.cols * this.rows;
    this.winPct = cfgInt(c.winTarget, 75) / 100;
    this.buildSpeed = cfgNum(c.buildSpeed, 13);
    this.startBalls = cfgInt(c.startBalls, 2);
    this.speedFactor = cfgInt(c.ballSpeed, 100) / 100;
    this.grid = new Uint8Array(this.total);
    this.design = { width: this.cols * CELL, height: this.rows * CELL };
    this.showMenu();
  }

  /* ------------------------------ Geometry ------------------------------ */
  private idx(x: number, y: number) { return y * this.cols + x; }
  private solidAt(x: number, y: number) {
    return x < 0 || y < 0 || x >= this.cols || y >= this.rows || this.grid[this.idx(x, y)] === 1;
  }
  private pct() { return this.filled / this.total; }
  private maxLives() { return this.balls.length + 1; }

  /* ------------------------------- Balls -------------------------------- */
  private ballSpeed() {
    return Math.min(170, 84 + 8 * this.level) * this.speedFactor;
  }

  private makeBalls(n: number, speed: number): Ball[] {
    const W = this.design.width, H = this.design.height;
    const balls: Ball[] = [];
    const r = CELL * 0.38;
    for (let i = 0; i < n; i++) {
      let x = 0, y = 0, ok = false;
      for (let t = 0; t < 200 && !ok; t++) {
        x = CELL * 2 + Math.random() * (W - CELL * 4);
        y = CELL * 2 + Math.random() * (H - CELL * 4);
        ok = balls.every((b) => (b.x - x) ** 2 + (b.y - y) ** 2 > (CELL * 2.5) ** 2);
      }
      balls.push({
        x, y, r,
        vx: (Math.random() < 0.5 ? -1 : 1) * speed,
        vy: (Math.random() < 0.5 ? -1 : 1) * speed,
        color: BALL_PALETTE[i % BALL_PALETTE.length],
        trail: [],
      });
    }
    return balls;
  }

  private circleHitsSolid(px: number, py: number, r: number): boolean {
    const W = this.design.width, H = this.design.height;
    if (px - r < 0 || px + r > W || py - r < 0 || py + r > H) return true;
    const x0 = Math.floor((px - r) / CELL), x1 = Math.floor((px + r) / CELL);
    const y0 = Math.floor((py - r) / CELL), y1 = Math.floor((py + r) / CELL);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) continue;
        if (!this.grid[this.idx(x, y)]) continue;
        const rx = x * CELL, ry = y * CELL;
        const qx = clamp(px, rx, rx + CELL), qy = clamp(py, ry, ry + CELL);
        const dx = px - qx, dy = py - qy;
        if (dx * dx + dy * dy < r * r) return true;
      }
    }
    return false;
  }

  private circleHitsRect(b: Ball, rc: Rect): boolean {
    if (rc.w <= 0 || rc.h <= 0) return false;
    const qx = clamp(b.x, rc.x, rc.x + rc.w), qy = clamp(b.y, rc.y, rc.y + rc.h);
    const dx = b.x - qx, dy = b.y - qy;
    return dx * dx + dy * dy < b.r * b.r;
  }

  private unstick(b: Ball) {
    const cx = clamp(Math.floor(b.x / CELL), 0, this.cols - 1);
    const cy = clamp(Math.floor(b.y / CELL), 0, this.rows - 1);
    if (!this.grid[this.idx(cx, cy)]) return;
    for (let ring = 1; ring <= 4; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          const x = cx + dx, y = cy + dy;
          if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) continue;
          if (!this.grid[this.idx(x, y)]) {
            b.x = (x + 0.5) * CELL; b.y = (y + 0.5) * CELL; return;
          }
        }
      }
    }
  }

  private updateBalls(dt: number, interactive: boolean) {
    const balls = this.balls;
    for (const b of balls) {
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 10) b.trail.shift();
      const steps = Math.max(1, Math.ceil((Math.abs(b.vx) + Math.abs(b.vy)) * dt / 8));
      const sdt = dt / steps;
      for (let s = 0; s < steps; s++) {
        const nx = b.x + b.vx * sdt;
        if (this.circleHitsSolid(nx, b.y, b.r)) { b.vx *= -1; this.bounce(); }
        else b.x = nx;
        const ny = b.y + b.vy * sdt;
        if (this.circleHitsSolid(b.x, ny, b.r)) { b.vy *= -1; this.bounce(); }
        else b.y = ny;
      }
      this.unstick(b);
    }

    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i], c = balls[j];
        const dx = c.x - a.x, dy = c.y - a.y;
        const d2 = dx * dx + dy * dy;
        const minD = a.r + c.r;
        if (d2 >= minD * minD || d2 === 0) continue;
        const rvx = c.vx - a.vx, rvy = c.vy - a.vy;
        if (dx * rvx + dy * rvy >= 0) continue;
        if (Math.abs(dx) > Math.abs(dy)) { const t = a.vx; a.vx = c.vx; c.vx = t; }
        else { const t = a.vy; a.vy = c.vy; c.vy = t; }
        const d = Math.sqrt(d2), push = (minD - d) / 2;
        a.x -= dx / d * push; a.y -= dy / d * push;
        c.x += dx / d * push; c.y += dy / d * push;
        this.bounce();
      }
    }

    if (interactive && this.build) {
      for (const b of balls) {
        if (!this.build) break;
        for (const arm of this.build.arms) {
          if (arm.done || arm.dead || arm.len <= 0) continue;
          if (this.circleHitsRect(b, this.armRect(this.build, arm))) { this.killArm(this.build, arm); break; }
        }
      }
    }
  }

  /* ------------------------------- Walls -------------------------------- */
  private startBuild(cx: number, cy: number) {
    if (this.phase !== 'playing') return;
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return;
    if (this.build || this.grid[this.idx(cx, cy)]) { this.sfxDeny(); return; }
    this.build = {
      o: this.orientation, cx, cy,
      arms: [
        { dir: -1, len: 0, done: false, dead: false },
        { dir: 1, len: 0, done: false, dead: false },
      ],
    };
    this.sfxBuild();
  }

  private armRect(b: Build, arm: Arm): Rect {
    const len = arm.len * CELL;
    if (b.o === 'v') {
      const x = b.cx * CELL, mid = (b.cy + 0.5) * CELL;
      return arm.dir < 0 ? { x, y: mid - len, w: CELL, h: len } : { x, y: mid, w: CELL, h: len };
    }
    const y = b.cy * CELL, mid = (b.cx + 0.5) * CELL;
    return arm.dir < 0 ? { x: mid - len, y, w: len, h: CELL } : { x: mid, y, w: len, h: CELL };
  }

  private armMaxLen(b: Build, arm: Arm): number {
    if (b.o === 'v') {
      if (arm.dir < 0) { let k = b.cy; while (!this.solidAt(b.cx, k - 1)) k--; return b.cy + 0.5 - k; }
      let k = b.cy; while (!this.solidAt(b.cx, k + 1)) k++; return k + 0.5 - b.cy;
    }
    if (arm.dir < 0) { let k = b.cx; while (!this.solidAt(k - 1, b.cy)) k--; return b.cx + 0.5 - k; }
    let k = b.cx; while (!this.solidAt(k + 1, b.cy)) k++; return k + 0.5 - b.cx;
  }

  private fillCell(x: number, y: number) {
    const i = this.idx(x, y);
    if (this.grid[i]) return;
    this.grid[i] = 1; this.filled++;
    this.fillAnim.set(i, this.host.now());
  }

  private completeArm(b: Build, arm: Arm) {
    arm.done = true;
    if (b.o === 'v') {
      const y0 = arm.dir < 0 ? Math.round(b.cy + 0.5 - arm.len) : b.cy;
      const y1 = arm.dir < 0 ? b.cy : Math.round(b.cy - 0.5 + arm.len);
      for (let y = y0; y <= y1; y++) this.fillCell(b.cx, y);
    } else {
      const x0 = arm.dir < 0 ? Math.round(b.cx + 0.5 - arm.len) : b.cx;
      const x1 = arm.dir < 0 ? b.cx : Math.round(b.cx - 0.5 + arm.len);
      for (let x = x0; x <= x1; x++) this.fillCell(x, b.cy);
    }
    this.sfxSolidify();
    this.captureCheck();
  }

  private killArm(b: Build, arm: Arm) {
    arm.dead = true;
    this.lives = Math.max(0, this.lives - 1);
    this.shake = 7;
    this.sfxBreak();
    const rc = this.armRect(b, arm);
    const color = arm.dir < 0 ? ARM_COLORS.neg : ARM_COLORS.pos;
    for (let i = 0; i < 36; i++) {
      this.particles.push({
        x: rc.x + Math.random() * Math.max(rc.w, 4),
        y: rc.y + Math.random() * Math.max(rc.h, 4),
        vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.7) * 220,
        age: 0, life: 0.5 + Math.random() * 0.4,
        color, size: 1.5 + Math.random() * 2.5, grav: 320,
      });
    }
    this.emitHud();
    if (this.lives === 0) this.beginGameOver();
  }

  private updateBuild(dt: number) {
    const b = this.build;
    if (!b) return;
    for (const arm of b.arms) {
      if (arm.done || arm.dead) continue;
      const maxL = this.armMaxLen(b, arm);
      arm.len += this.buildSpeed * dt;
      if (arm.len >= maxL) { arm.len = maxL; this.completeArm(b, arm); }
    }
    if (this.build && this.build.arms.every((a) => a.done || a.dead)) this.build = null;
  }

  /* ------------------------------ Capture ------------------------------- */
  private captureCheck() {
    const seen = new Uint8Array(this.total);
    const q: number[] = [];
    const { cols, rows } = this;
    for (const b of this.balls) {
      const x0 = clamp(Math.floor((b.x - b.r) / CELL), 0, cols - 1);
      const x1 = clamp(Math.floor((b.x + b.r) / CELL), 0, cols - 1);
      const y0 = clamp(Math.floor((b.y - b.r) / CELL), 0, rows - 1);
      const y1 = clamp(Math.floor((b.y + b.r) / CELL), 0, rows - 1);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = this.idx(x, y);
        if (!this.grid[i] && !seen[i]) { seen[i] = 1; q.push(i); }
      }
    }
    while (q.length) {
      const i = q.pop() as number;
      const x = i % cols, y = (i / cols) | 0;
      if (x > 0 && !this.grid[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; q.push(i - 1); }
      if (x < cols - 1 && !this.grid[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; q.push(i + 1); }
      if (y > 0 && !this.grid[i - cols] && !seen[i - cols]) { seen[i - cols] = 1; q.push(i - cols); }
      if (y < rows - 1 && !this.grid[i + cols] && !seen[i + cols]) { seen[i + cols] = 1; q.push(i + cols); }
    }

    const captured: number[] = [];
    for (let i = 0; i < this.total; i++) if (!this.grid[i] && !seen[i]) captured.push(i);

    if (captured.length) {
      let sx = 0, sy = 0;
      for (const i of captured) {
        const x = i % cols, y = (i / cols) | 0;
        this.fillCell(x, y);
        sx += (x + 0.5) * CELL; sy += (y + 0.5) * CELL;
        if (Math.random() < 0.18 && this.particles.length < 380) {
          this.particles.push({
            x: (x + 0.5) * CELL, y: (y + 0.5) * CELL,
            vx: (Math.random() - 0.5) * 90, vy: -40 - Math.random() * 110,
            age: 0, life: 0.7 + Math.random() * 0.6,
            color: Math.random() < 0.5 ? '#5ed6ff' : '#c7f0ff',
            size: 1.5 + Math.random() * 2.5, grav: 90,
          });
        }
      }
      const points = captured.length * 10 * this.level;
      this.score += points;
      this.floaters.push({
        x: clamp(sx / captured.length, 60, this.design.width - 60),
        y: clamp(sy / captured.length, 30, this.design.height - 20),
        text: '+' + fmt(points), age: 0, life: 1.3,
      });
      this.sfxCapture();
    }
    this.emitHud();
    if (this.pct() >= this.winPct && this.phase === 'playing') this.beginLevelClear();
  }

  /* -------------------------------- Flow -------------------------------- */
  private beginLevelClear() {
    this.phase = 'clearing';
    this.phaseTimer = 1.0;
    this.build = null;
    this.sfxLevelUp();
    const clearedPct = Math.round(this.pct() * 100);
    const overBonus = Math.max(0, clearedPct - 75) * 40 * this.level;
    const lifeBonus = this.lives * 250 * this.level;
    this.score += overBonus + lifeBonus;
    this.lastBonus = { over: overBonus, life: lifeBonus, cleared: clearedPct };
    this.host.submitScore(this.score);
    this.emitHud();
  }

  private showLevelClearOverlay() {
    this.phase = 'levelclear';
    this.host.setOverlay({
      variant: 'win',
      kicker: `Level ${this.level} clear`,
      title: `${this.lastBonus.cleared}% sealed`,
      rows: [
        { label: 'Overshoot bonus', value: '+' + fmt(this.lastBonus.over) },
        { label: 'Lives bonus', value: '+' + fmt(this.lastBonus.life) },
      ],
      bigStat: { label: 'Score', value: fmt(this.score) },
      buttons: [{ action: 'next', label: 'Next level →', primary: true }],
    });
  }

  private beginGameOver() {
    this.phase = 'dying';
    this.phaseTimer = 0.9;
    this.build = null;
    this.newBest = this.score > 0 && this.score > this.bestBefore;
    this.host.submitScore(this.score);
    this.sfxGameOver();
  }

  private showGameOverOverlay() {
    this.phase = 'gameover';
    this.host.setOverlay({
      variant: 'lose',
      kicker: 'Game over',
      title: `Level ${this.level}`,
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

  private startLevel() {
    this.grid.fill(0);
    this.filled = 0;
    this.fillAnim.clear();
    this.build = null;
    this.particles.length = 0;
    this.floaters.length = 0;
    this.shake = 0;
    const n = this.startBalls + (this.level - 1);
    this.balls = this.makeBalls(n, this.ballSpeed());
    this.lives = n + 1;
    this.phase = 'playing';
    this.host.setOverlay(null);
    this.emitHud();
  }

  private startGame() {
    this.level = 1;
    this.score = 0;
    this.bestBefore = this.host.getBest();
    this.startLevel();
  }

  private nextLevel() {
    this.level++;
    this.startLevel();
  }

  private showMenu() {
    this.phase = 'menu';
    this.grid.fill(0);
    this.filled = 0;
    this.fillAnim.clear();
    this.build = null;
    this.particles.length = 0;
    this.floaters.length = 0;
    this.balls = this.makeBalls(6, 70 * this.speedFactor);
    this.emitHud();
    this.host.setOverlay({
      variant: 'menu',
      title: 'JEZZBALL',
      subtitle: 'Trap the bouncing atoms. Claim the arena.',
      bullets: [
        { icon: '🧱', text: 'Click to grow a wall in two directions from that point.' },
        { icon: '↕', text: 'Right-click, scroll, or press V to switch vertical / horizontal walls.' },
        { icon: '⚠️', text: "A ball hitting a wall while it's still growing shatters it — costing a life." },
        { icon: '🏁', text: `Seal off ${Math.round(this.winPct * 100)}% of the arena to clear the level. Each level adds a ball.` },
      ],
      buttons: [{ action: 'start', label: 'Start game', primary: true }],
    });
  }

  private toggleOrientation() {
    this.orientation = this.orientation === 'v' ? 'h' : 'v';
    this.emitHud();
  }

  /* -------------------------------- HUD --------------------------------- */
  private emitHud() {
    this.host.setHud({
      badge: `LEVEL ${this.level}`,
      progress: {
        value: this.pct(),
        target: this.winPct,
        label: `${Math.floor(this.pct() * 100)}%`,
        complete: this.pct() >= this.winPct,
      },
      lives: { current: this.lives, max: this.maxLives() },
      stats: [{ label: 'Score', value: fmt(this.score) }],
      actions: [
        { icon: this.orientation === 'v' ? '↕' : '↔', label: 'Rotate wall', action: 'rotate' },
      ],
    });
  }

  /* ------------------------------- Sounds ------------------------------- */
  private lastBounceT = 0;
  private bounce() {
    const now = this.host.now();
    if (now - this.lastBounceT < 60) return;
    this.lastBounceT = now;
    this.host.audio.tone(170 + Math.random() * 60, { type: 'sine', dur: 0.06, vol: 0.035 });
  }
  private sfxBuild() { this.host.audio.tone(520, { type: 'triangle', dur: 0.06, vol: 0.06 }); }
  private sfxSolidify() { this.host.audio.tone(240, { type: 'square', dur: 0.07, vol: 0.045 }); }
  private sfxDeny() { this.host.audio.tone(130, { type: 'sawtooth', dur: 0.08, vol: 0.04 }); }
  private sfxBreak() {
    this.host.audio.tone(180, { type: 'sawtooth', dur: 0.28, vol: 0.11, slideTo: 45 });
    this.host.audio.tone(90, { type: 'square', dur: 0.2, vol: 0.07, slideTo: 40 });
  }
  private sfxCapture() {
    this.host.audio.tone(523.25, { type: 'triangle', dur: 0.12, vol: 0.08 });
    this.host.audio.tone(783.99, { type: 'triangle', dur: 0.12, vol: 0.08, delay: 0.07 });
    this.host.audio.tone(1046.5, { type: 'triangle', dur: 0.18, vol: 0.08, delay: 0.14 });
  }
  private sfxLevelUp() {
    this.host.audio.arp([523.25, 659.25, 783.99, 1046.5], { type: 'triangle', dur: 0.16, vol: 0.09, gap: 0.09 });
  }
  private sfxGameOver() {
    this.host.audio.arp([392, 311, 233, 155], { type: 'sawtooth', dur: 0.25, vol: 0.07, gap: 0.16 });
  }

  /* ------------------------------ Effects ------------------------------- */
  private updateEffects(dt: number) {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.age += dt;
      if (p.age >= p.life) { ps.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.vx *= 0.99;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    const fs = this.floaters;
    for (let i = fs.length - 1; i >= 0; i--) {
      const f = fs[i];
      f.age += dt; f.y -= 28 * dt;
      if (f.age >= f.life) fs.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - 26 * dt);
  }

  /* ------------------------- GameInstance API --------------------------- */
  update(dt: number) {
    if (this.phase === 'playing') {
      this.updateBuild(dt);
      this.updateBalls(dt, true);
      this.updateEffects(dt);
      this.emitHud();
    } else {
      this.updateBalls(dt, false);
      this.updateEffects(dt);
      if (this.phase === 'clearing') {
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) this.showLevelClearOverlay();
      } else if (this.phase === 'dying') {
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) this.showGameOverOverlay();
      }
    }
  }

  onPointerDown(p: PointerInfo) {
    if (p.button === 2) { this.toggleOrientation(); return; }
    if (p.button !== 0) return;
    this.mouse.x = p.x; this.mouse.y = p.y;
    this.startBuild(Math.floor(p.x / CELL), Math.floor(p.y / CELL));
  }
  onPointerMove(p: PointerInfo) {
    this.mouse.x = p.x; this.mouse.y = p.y;
    this.mouse.over = p.pointerType !== 'touch';
  }
  onPointerLeave() { this.mouse.over = false; }
  onWheel() {
    const now = this.host.now();
    if (now - this.lastWheel > 150) { this.lastWheel = now; this.toggleOrientation(); }
  }
  onKey(code: string, down: boolean) {
    if (!down) return;
    if (code === 'KeyV' || code === 'KeyX') this.toggleOrientation();
  }
  onAction(action: string) {
    switch (action) {
      case 'start': case 'restart': this.startGame(); break;
      case 'next': this.nextLevel(); break;
      case 'menu': this.showMenu(); break;
      case 'rotate': this.toggleOrientation(); break;
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
    bg.addColorStop(0, '#0c1428'); bg.addColorStop(1, '#080e1d');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    g.strokeStyle = 'rgba(148,163,184,0.05)'; g.lineWidth = 1;
    g.beginPath();
    for (let x = 1; x < this.cols; x++) { g.moveTo(x * CELL + 0.5, 0); g.lineTo(x * CELL + 0.5, H); }
    for (let y = 1; y < this.rows; y++) { g.moveTo(0, y * CELL + 0.5); g.lineTo(W, y * CELL + 0.5); }
    g.stroke();

    g.fillStyle = TILE;
    for (let i = 0; i < this.total; i++) {
      if (!this.grid[i]) continue;
      const x = (i % this.cols) * CELL, y = ((i / this.cols) | 0) * CELL;
      g.fillRect(x, y, CELL + 0.5, CELL + 0.5);
    }
    g.strokeStyle = TILE_EDGE; g.lineWidth = 1.5; g.beginPath();
    for (let i = 0; i < this.total; i++) {
      if (!this.grid[i]) continue;
      const cx = i % this.cols, cy = (i / this.cols) | 0;
      const x = cx * CELL, y = cy * CELL;
      if (cy > 0 && !this.grid[i - this.cols]) { g.moveTo(x, y + 0.75); g.lineTo(x + CELL, y + 0.75); }
      if (cy < this.rows - 1 && !this.grid[i + this.cols]) { g.moveTo(x, y + CELL - 0.75); g.lineTo(x + CELL, y + CELL - 0.75); }
      if (cx > 0 && !this.grid[i - 1]) { g.moveTo(x + 0.75, y); g.lineTo(x + 0.75, y + CELL); }
      if (cx < this.cols - 1 && !this.grid[i + 1]) { g.moveTo(x + CELL - 0.75, y); g.lineTo(x + CELL - 0.75, y + CELL); }
    }
    g.stroke();

    for (const [i, t0] of this.fillAnim) {
      const age = (now - t0) / 400;
      if (age >= 1) { this.fillAnim.delete(i); continue; }
      const x = (i % this.cols) * CELL, y = ((i / this.cols) | 0) * CELL;
      g.fillStyle = `rgba(190,235,255,${(0.5 * (1 - age)).toFixed(3)})`;
      g.fillRect(x, y, CELL, CELL);
    }

    if (this.build) {
      for (const arm of this.build.arms) {
        if (arm.dead || arm.len <= 0) continue;
        const rc = this.armRect(this.build, arm);
        const color = arm.dir < 0 ? ARM_COLORS.neg : ARM_COLORS.pos;
        const grad = this.build.o === 'v'
          ? g.createLinearGradient(rc.x, 0, rc.x + rc.w, 0)
          : g.createLinearGradient(0, rc.y, 0, rc.y + rc.h);
        grad.addColorStop(0, shade(color, -0.35));
        grad.addColorStop(0.5, color);
        grad.addColorStop(1, shade(color, -0.35));
        g.fillStyle = grad; g.fillRect(rc.x, rc.y, rc.w, rc.h);
        if (!arm.done) {
          let tx: number, ty: number;
          if (this.build.o === 'v') { tx = rc.x + rc.w / 2; ty = arm.dir < 0 ? rc.y : rc.y + rc.h; }
          else { tx = arm.dir < 0 ? rc.x : rc.x + rc.w; ty = rc.y + rc.h / 2; }
          g.save();
          g.shadowColor = color; g.shadowBlur = 14;
          g.fillStyle = '#ffffff';
          g.beginPath(); g.arc(tx, ty, 4.5, 0, Math.PI * 2); g.fill();
          g.restore();
        }
      }
    }

    if (this.mouse.over && this.phase === 'playing') this.drawGuide();

    for (const b of this.balls) {
      for (let i = 0; i < b.trail.length; i++) {
        const t = b.trail[i];
        const f = (i + 1) / b.trail.length;
        g.globalAlpha = f * 0.16; g.fillStyle = b.color;
        g.beginPath(); g.arc(t.x, t.y, b.r * (0.35 + 0.55 * f), 0, Math.PI * 2); g.fill();
      }
    }
    g.globalAlpha = 1;

    for (const b of this.balls) {
      const rg = g.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.1, b.x, b.y, b.r);
      rg.addColorStop(0, '#ffffff');
      rg.addColorStop(0.35, b.color);
      rg.addColorStop(1, shade(b.color, -0.55));
      g.fillStyle = rg;
      g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fill();
    }

    for (const p of this.particles) {
      const f = 1 - p.age / p.life;
      g.globalAlpha = Math.max(0, f); g.fillStyle = p.color;
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    g.globalAlpha = 1;

    for (const fl of this.floaters) {
      const f = 1 - fl.age / fl.life;
      g.globalAlpha = Math.max(0, Math.min(1, f * 1.5));
      g.font = '700 20px ui-sans-serif, system-ui, sans-serif';
      g.textAlign = 'center'; g.lineWidth = 4;
      g.strokeStyle = 'rgba(4,10,22,0.8)'; g.strokeText(fl.text, fl.x, fl.y);
      g.fillStyle = '#fde68a'; g.fillText(fl.text, fl.x, fl.y);
    }
    g.globalAlpha = 1;
    g.restore();
  }

  private drawGuide() {
    const g = this.g;
    const cx = Math.floor(this.mouse.x / CELL), cy = Math.floor(this.mouse.y / CELL);
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows || this.grid[this.idx(cx, cy)]) return;
    const o = this.orientation;
    let rc: Rect;
    if (o === 'v') {
      let k1 = cy; while (!this.solidAt(cx, k1 - 1)) k1--;
      let k2 = cy; while (!this.solidAt(cx, k2 + 1)) k2++;
      rc = { x: cx * CELL, y: k1 * CELL, w: CELL, h: (k2 - k1 + 1) * CELL };
    } else {
      let k1 = cx; while (!this.solidAt(k1 - 1, cy)) k1--;
      let k2 = cx; while (!this.solidAt(k2 + 1, cy)) k2++;
      rc = { x: k1 * CELL, y: cy * CELL, w: (k2 - k1 + 1) * CELL, h: CELL };
    }
    const dim = this.build ? 0.4 : 1;
    g.fillStyle = `rgba(56,189,248,${0.07 * dim})`;
    g.fillRect(rc.x, rc.y, rc.w, rc.h);
    g.setLineDash([4, 7]);
    g.strokeStyle = `rgba(125,211,252,${0.35 * dim})`; g.lineWidth = 1;
    g.beginPath();
    if (o === 'v') { g.moveTo((cx + 0.5) * CELL, rc.y); g.lineTo((cx + 0.5) * CELL, rc.y + rc.h); }
    else { g.moveTo(rc.x, (cy + 0.5) * CELL); g.lineTo(rc.x + rc.w, (cy + 0.5) * CELL); }
    g.stroke();
    g.setLineDash([]);

    const px = this.mouse.x, py = this.mouse.y;
    const chevron = (dx: number, dy: number, color: string) => {
      g.fillStyle = color; g.globalAlpha = dim;
      const ox = px + dx * 15, oy = py + dy * 15;
      g.beginPath();
      g.moveTo(ox + dx * 6, oy + dy * 6);
      g.lineTo(ox - dy * 5 - dx * 3, oy - dx * 5 - dy * 3);
      g.lineTo(ox + dy * 5 - dx * 3, oy + dx * 5 - dy * 3);
      g.closePath(); g.fill(); g.globalAlpha = 1;
    };
    if (o === 'v') { chevron(0, -1, ARM_COLORS.neg); chevron(0, 1, ARM_COLORS.pos); }
    else { chevron(-1, 0, ARM_COLORS.neg); chevron(1, 0, ARM_COLORS.pos); }

    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath(); g.arc(px, py, 2.5, 0, Math.PI * 2); g.fill();
  }
}
