import type { GameContext, GameInstance, PointerInfo } from '../../engine/types';
import { clamp, fmt, shade, cfgInt, cfgBool } from '../../engine/util';

const CELL = 28;
const SNAKE_HEAD = '#4ade80';
const SNAKE_TAIL = '#15803d';
const FOOD_COLOR = '#fb7185';

type Phase = 'menu' | 'playing' | 'gameover';
interface Pt { x: number; y: number; }
interface Particle { x: number; y: number; vx: number; vy: number; age: number; life: number; color: string; size: number; }

/**
 * Snake — a second game on the arcade engine. Deliberately different from
 * JezzBall (tick-based grid movement, keyboard/swipe steering) to exercise the
 * plug-in contract: it reuses the host's loop, pause, HUD, overlays, config and
 * high-score plumbing without sharing any code with JezzBall.
 */
export class Snake implements GameInstance {
  readonly design: { width: number; height: number };

  private host: GameContext;
  private g: CanvasRenderingContext2D;

  private cols: number;
  private rows: number;
  private baseSpeed: number;
  private wrap: boolean;
  private growth: number;

  private snake: Pt[] = [];
  private dir: Pt = { x: 1, y: 0 };
  private queue: Pt[] = [];
  private food: Pt = { x: 0, y: 0 };
  private grow = 0;
  private acc = 0;
  private stepInterval = 0.14;
  private eaten = 0;

  private phase: Phase = 'menu';
  private score = 0;
  private bestBefore = 0;
  private particles: Particle[] = [];
  private pulse = 0;
  private foodPhase = 0;
  private swipeStart: Pt | null = null;

  constructor(ctx: GameContext) {
    this.host = ctx;
    this.g = ctx.ctx;
    const c = ctx.config;
    this.cols = cfgInt(c.board, 21);
    this.rows = cfgInt(c.board, 21);
    this.baseSpeed = cfgInt(c.speed, 9);
    this.wrap = cfgBool(c.wrap, false);
    this.growth = cfgInt(c.growth, 1);
    this.design = { width: this.cols * CELL, height: this.rows * CELL };
    this.showMenu();
  }

  /* -------------------------------- Flow -------------------------------- */
  private showMenu() {
    this.phase = 'menu';
    this.snake = this.initialSnake();
    this.dir = { x: 1, y: 0 };
    this.placeFood();
    this.host.setHud({ badge: 'SNAKE', stats: [{ label: 'Score', value: '0' }] });
    this.host.setOverlay({
      variant: 'menu',
      title: 'SNAKE',
      subtitle: 'Eat, grow, and stay off your own tail.',
      bullets: [
        { icon: '⬆', text: 'Steer with arrow keys or W A S D.' },
        { icon: '👆', text: 'On touch, swipe in the direction you want to turn.' },
        { icon: '🍎', text: 'Each apple grows you and speeds things up.' },
        { icon: '💥', text: this.wrap ? 'You wrap around the edges — only your tail can kill you.' : 'Hitting a wall or your tail ends the run.' },
      ],
      buttons: [{ action: 'start', label: 'Start game', primary: true }],
    });
  }

  private initialSnake(): Pt[] {
    const cy = Math.floor(this.rows / 2);
    const cx = Math.floor(this.cols / 2);
    return [
      { x: cx, y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy },
    ];
  }

  private startGame() {
    this.snake = this.initialSnake();
    this.dir = { x: 1, y: 0 };
    this.queue = [];
    this.grow = 0;
    this.acc = 0;
    this.eaten = 0;
    this.score = 0;
    this.stepInterval = 1 / this.baseSpeed;
    this.particles.length = 0;
    this.bestBefore = this.host.getBest();
    this.placeFood();
    this.phase = 'playing';
    this.host.setOverlay(null);
    this.emitHud();
  }

  private gameOver() {
    this.phase = 'gameover';
    const record = this.host.submitScore(this.score);
    this.host.audio.arp([392, 311, 233, 155], { type: 'sawtooth', dur: 0.24, vol: 0.07, gap: 0.15 });
    this.host.setOverlay({
      variant: 'lose',
      kicker: 'Game over',
      title: `${this.eaten} ${this.eaten === 1 ? 'apple' : 'apples'}`,
      bigStat: {
        label: 'Final score', value: fmt(this.score),
        note: record && this.score > this.bestBefore ? '★ New best!' : undefined,
      },
      buttons: [
        { action: 'start', label: 'Play again', primary: true },
        { action: 'menu', label: 'Title', ghost: true },
      ],
    });
  }

  private placeFood() {
    const occupied = new Set(this.snake.map((s) => s.y * this.cols + s.x));
    const free: number[] = [];
    for (let i = 0; i < this.cols * this.rows; i++) if (!occupied.has(i)) free.push(i);
    if (!free.length) return;
    const cell = free[Math.floor(Math.random() * free.length)];
    this.food = { x: cell % this.cols, y: Math.floor(cell / this.cols) };
  }

  private emitHud() {
    this.host.setHud({
      badge: 'SNAKE',
      stats: [
        { label: 'Score', value: fmt(this.score) },
        { label: 'Length', value: String(this.snake.length) },
      ],
    });
  }

  /* ------------------------------ Steering ------------------------------ */
  private turn(nx: number, ny: number) {
    // Ignore reversals relative to the last committed/queued direction.
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
    if (nx === -last.x && ny === -last.y) return;
    if (nx === last.x && ny === last.y) return;
    if (this.queue.length < 3) this.queue.push({ x: nx, y: ny });
  }

  onKey(code: string, down: boolean) {
    if (!down || this.phase !== 'playing') return;
    switch (code) {
      case 'ArrowUp': case 'KeyW': this.turn(0, -1); break;
      case 'ArrowDown': case 'KeyS': this.turn(0, 1); break;
      case 'ArrowLeft': case 'KeyA': this.turn(-1, 0); break;
      case 'ArrowRight': case 'KeyD': this.turn(1, 0); break;
    }
  }

  onPointerDown(p: PointerInfo) { this.swipeStart = { x: p.x, y: p.y }; }
  onPointerUp(p: PointerInfo) {
    if (!this.swipeStart) return;
    const dx = p.x - this.swipeStart.x, dy = p.y - this.swipeStart.y;
    this.swipeStart = null;
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
    if (Math.abs(dx) > Math.abs(dy)) this.turn(dx > 0 ? 1 : -1, 0);
    else this.turn(0, dy > 0 ? 1 : -1);
  }

  onAction(action: string) {
    if (action === 'start') this.startGame();
    else if (action === 'menu') this.showMenu();
  }

  /* -------------------------------- Step -------------------------------- */
  private step() {
    if (this.queue.length) this.dir = this.queue.shift() as Pt;
    const head = this.snake[0];
    let nx = head.x + this.dir.x;
    let ny = head.y + this.dir.y;

    if (this.wrap) {
      nx = (nx + this.cols) % this.cols;
      ny = (ny + this.rows) % this.rows;
    } else if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) {
      this.gameOver();
      return;
    }

    // Self collision (the tail tip will move away this step unless we're growing).
    const willGrow = this.grow > 0 || (nx === this.food.x && ny === this.food.y);
    const bodyEnd = willGrow ? this.snake.length : this.snake.length - 1;
    for (let i = 0; i < bodyEnd; i++) {
      if (this.snake[i].x === nx && this.snake[i].y === ny) { this.gameOver(); return; }
    }

    this.snake.unshift({ x: nx, y: ny });
    if (nx === this.food.x && ny === this.food.y) {
      this.eaten++;
      this.grow += this.growth;
      this.score += 10 + Math.floor(this.eaten / 5) * 5;
      this.stepInterval = Math.max(0.05, this.stepInterval * 0.98);
      this.pulse = 1;
      this.burst(nx, ny);
      this.host.audio.tone(660, { type: 'triangle', dur: 0.08, vol: 0.07 });
      this.host.audio.tone(990, { type: 'triangle', dur: 0.09, vol: 0.06, delay: 0.05 });
      this.placeFood();
      this.emitHud();
    }
    if (this.grow > 0) this.grow--;
    else this.snake.pop();
  }

  private burst(cx: number, cy: number) {
    const x = (cx + 0.5) * CELL, y = (cy + 0.5) * CELL;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 120;
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        age: 0, life: 0.4 + Math.random() * 0.4,
        color: Math.random() < 0.5 ? FOOD_COLOR : '#fda4af',
        size: 2 + Math.random() * 2.5,
      });
    }
  }

  /* ------------------------- GameInstance API --------------------------- */
  update(dt: number) {
    this.foodPhase += dt;
    this.pulse = Math.max(0, this.pulse - dt * 3);
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.age += dt;
      if (p.age >= p.life) { ps.splice(i, 1); continue; }
      p.vx *= 0.94; p.vy *= 0.94;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    if (this.phase !== 'playing') return;
    this.acc += dt;
    let guard = 0;
    while (this.acc >= this.stepInterval && this.phase === 'playing' && guard++ < 4) {
      this.acc -= this.stepInterval;
      this.step();
    }
  }

  render() {
    const g = this.g;
    const W = this.design.width, H = this.design.height;

    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0b1a12'); bg.addColorStop(1, '#071009');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    // Checkerboard cells
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if ((x + y) & 1) continue;
        g.fillStyle = 'rgba(255,255,255,0.018)';
        g.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }

    // Food
    const fp = 0.5 + 0.5 * Math.sin(this.foodPhase * 5);
    const fx = (this.food.x + 0.5) * CELL, fy = (this.food.y + 0.5) * CELL;
    g.save();
    g.shadowColor = FOOD_COLOR; g.shadowBlur = 12 + fp * 8;
    const fg = g.createRadialGradient(fx - 3, fy - 3, 1, fx, fy, CELL * 0.42);
    fg.addColorStop(0, '#ffe4e6'); fg.addColorStop(0.4, FOOD_COLOR); fg.addColorStop(1, shade(FOOD_COLOR, -0.5));
    g.fillStyle = fg;
    g.beginPath(); g.arc(fx, fy, CELL * (0.32 + fp * 0.04), 0, Math.PI * 2); g.fill();
    g.restore();

    // Snake
    const n = this.snake.length;
    for (let i = n - 1; i >= 0; i--) {
      const s = this.snake[i];
      const t = n === 1 ? 0 : i / (n - 1);
      const col = i === 0 ? '#bbf7d0' : mix(SNAKE_HEAD, SNAKE_TAIL, t);
      const pad = i === 0 ? 2 : 3 + t * 1.5;
      const size = CELL - pad * 2;
      const rx = s.x * CELL + pad, ry = s.y * CELL + pad;
      g.fillStyle = col;
      roundRect(g, rx, ry, size, size, 6 - t * 2);
      g.fill();
      if (i === 0) {
        // eyes
        g.fillStyle = '#052e16';
        const ex = s.x * CELL + CELL / 2, ey = s.y * CELL + CELL / 2;
        const ox = this.dir.x, oy = this.dir.y;
        const perp = { x: -oy, y: ox };
        for (const sgn of [-1, 1]) {
          g.beginPath();
          g.arc(ex + ox * 4 + perp.x * 4 * sgn, ey + oy * 4 + perp.y * 4 * sgn, 2.1, 0, Math.PI * 2);
          g.fill();
        }
      }
    }

    // Particles
    for (const p of this.particles) {
      const f = 1 - p.age / p.life;
      g.globalAlpha = Math.max(0, f);
      g.fillStyle = p.color;
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    g.globalAlpha = 1;

    if (this.pulse > 0) {
      g.strokeStyle = `rgba(74,222,128,${(this.pulse * 0.5).toFixed(3)})`;
      g.lineWidth = 4;
      g.strokeRect(2, 2, W - 4, H - 4);
    }
  }
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const gg = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `rgb(${r},${gg},${bl})`;
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
