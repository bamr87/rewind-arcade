import type { GameContext, GameInstance, PointerInfo } from '../../engine/types';
import { clamp, cfgInt, fmt } from '../../engine/util';

type Phase = 'menu' | 'playing' | 'win' | 'lose';
interface Brick { x: number; y: number; w: number; h: number; hp: number; color: string; }

const COLORS = ['#fb7185', '#fb923c', '#fbbf24', '#34d399', '#38bdf8', '#a78bfa'];

export class Breakout implements GameInstance {
  readonly design = { width: 720, height: 540 };

  private host: GameContext;
  private g: CanvasRenderingContext2D;
  private rows: number;
  private cols: number;
  private speed: number;

  private phase: Phase = 'menu';
  private paddleX = 0;
  private paddleW = 92;
  private ball = { x: 0, y: 0, vx: 0, vy: 0, r: 6, stuck: true };
  private bricks: Brick[] = [];
  private lives = 3;
  private score = 0;
  private bestBefore = 0;
  private keys = new Set<string>();

  constructor(ctx: GameContext) {
    this.host = ctx;
    this.g = ctx.ctx;
    this.rows = cfgInt(ctx.config.rows, 6);
    this.cols = cfgInt(ctx.config.cols, 10);
    this.speed = cfgInt(ctx.config.speed, 320);
    this.layout();
    this.showMenu();
  }

  private layout() {
    this.bricks = [];
    const gap = 6;
    const top = 56;
    const w = (this.design.width - 32 - gap * (this.cols - 1)) / this.cols;
    const h = 18;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.bricks.push({
          x: 16 + c * (w + gap),
          y: top + r * (h + gap),
          w, h,
          hp: this.rows - r,
          color: COLORS[r % COLORS.length],
        });
      }
    }
  }

  private showMenu() {
    this.phase = 'menu';
    this.lives = 3;
    this.score = 0;
    this.layout();
    this.resetBall(true);
    this.host.setHud({ badge: 'BREAKOUT', lives: { current: 3, max: 3 }, stats: [{ label: 'Score', value: '0' }] });
    this.host.setOverlay({
      variant: 'menu',
      title: 'BREAKOUT',
      subtitle: 'Clear the wall. Do not drop the ball.',
      bullets: [
        { icon: '🖱', text: 'Slide the paddle with the mouse or ← →.' },
        { icon: '🟢', text: 'Click or press F to launch a stuck ball.' },
        { icon: '🧱', text: 'Upper rows are worth more. Clear them all to win.' },
      ],
      buttons: [{ action: 'start', label: 'Start game', primary: true }],
    });
  }

  private startGame() {
    this.lives = 3;
    this.score = 0;
    this.bestBefore = this.host.getBest();
    this.layout();
    this.resetBall(true);
    this.phase = 'playing';
    this.host.setOverlay(null);
    this.emitHud();
  }

  private resetBall(stuck: boolean) {
    this.paddleX = this.design.width / 2 - this.paddleW / 2;
    this.ball.stuck = stuck;
    this.ball.x = this.paddleX + this.paddleW / 2;
    this.ball.y = this.design.height - 36 - this.ball.r;
    this.ball.vx = 0;
    this.ball.vy = 0;
  }

  private launch() {
    if (!this.ball.stuck) return;
    this.ball.stuck = false;
    const dir = Math.random() < 0.5 ? -1 : 1;
    this.ball.vx = dir * this.speed * 0.55;
    this.ball.vy = -this.speed;
    this.host.audio.tone(520, { type: 'triangle', dur: 0.06, vol: 0.06 });
  }

  private emitHud() {
    this.host.setHud({
      badge: 'BREAKOUT',
      lives: { current: this.lives, max: 3 },
      stats: [
        { label: 'Score', value: fmt(this.score) },
        { label: 'Bricks', value: String(this.bricks.length) },
      ],
    });
  }

  private end(won: boolean) {
    this.phase = won ? 'win' : 'lose';
    const record = this.host.submitScore(this.score);
    this.host.audio.arp(won ? [523, 659, 784, 1046] : [392, 311, 247], {
      type: 'triangle', dur: 0.14, vol: 0.06, gap: 0.1,
    });
    this.host.setOverlay({
      variant: won ? 'win' : 'lose',
      kicker: won ? 'Wall cleared' : 'Balls gone',
      title: won ? 'Clean sweep' : 'Missed',
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
  }

  onKey(code: string, down: boolean) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
    if (down && (code === 'KeyF' || code === 'KeyZ')) this.launch();
  }

  onPointerMove(p: PointerInfo) {
    this.paddleX = clamp(p.x - this.paddleW / 2, 8, this.design.width - this.paddleW - 8);
  }

  onPointerDown() { this.launch(); }

  onAction(action: string) {
    if (action === 'start') this.startGame();
    else if (action === 'menu') this.showMenu();
  }

  update(dt: number) {
    if (this.phase !== 'playing') return;
    const W = this.design.width;
    const H = this.design.height;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) this.paddleX -= 520 * dt;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) this.paddleX += 520 * dt;
    this.paddleX = clamp(this.paddleX, 8, W - this.paddleW - 8);

    if (this.ball.stuck) {
      this.ball.x = this.paddleX + this.paddleW / 2;
      this.ball.y = H - 36 - this.ball.r;
      return;
    }

    this.ball.x += this.ball.vx * dt;
    this.ball.y += this.ball.vy * dt;

    if (this.ball.x - this.ball.r < 8) {
      this.ball.x = 8 + this.ball.r;
      this.ball.vx *= -1;
    }
    if (this.ball.x + this.ball.r > W - 8) {
      this.ball.x = W - 8 - this.ball.r;
      this.ball.vx *= -1;
    }
    if (this.ball.y - this.ball.r < 8) {
      this.ball.y = 8 + this.ball.r;
      this.ball.vy *= -1;
    }

    const py = H - 28;
    if (
      this.ball.vy > 0 &&
      this.ball.y + this.ball.r >= py &&
      this.ball.y + this.ball.r <= py + 18 &&
      this.ball.x >= this.paddleX - this.ball.r &&
      this.ball.x <= this.paddleX + this.paddleW + this.ball.r
    ) {
      const rel = (this.ball.x - (this.paddleX + this.paddleW / 2)) / (this.paddleW / 2);
      const mag = Math.min(520, Math.hypot(this.ball.vx, this.ball.vy) * 1.03);
      this.ball.vx = mag * rel * 0.85;
      this.ball.vy = -Math.abs(Math.cos(rel * 0.7) * mag);
      this.ball.y = py - this.ball.r;
      this.host.audio.tone(300, { type: 'square', dur: 0.04, vol: 0.05 });
    }

    for (let i = this.bricks.length - 1; i >= 0; i--) {
      const b = this.bricks[i];
      if (
        this.ball.x + this.ball.r < b.x ||
        this.ball.x - this.ball.r > b.x + b.w ||
        this.ball.y + this.ball.r < b.y ||
        this.ball.y - this.ball.r > b.y + b.h
      ) continue;
      const overlapX = Math.min(this.ball.x + this.ball.r - b.x, b.x + b.w - (this.ball.x - this.ball.r));
      const overlapY = Math.min(this.ball.y + this.ball.r - b.y, b.y + b.h - (this.ball.y - this.ball.r));
      if (overlapX < overlapY) this.ball.vx *= -1;
      else this.ball.vy *= -1;
      this.bricks.splice(i, 1);
      this.score += 40 + b.hp * 10;
      this.host.audio.tone(660 + b.hp * 40, { type: 'triangle', dur: 0.05, vol: 0.05 });
      this.emitHud();
      break;
    }

    if (!this.bricks.length) {
      this.end(true);
      return;
    }
    if (this.ball.y > H + 20) {
      this.lives--;
      this.emitHud();
      if (this.lives <= 0) this.end(false);
      else {
        this.resetBall(true);
        this.host.audio.tone(160, { type: 'sawtooth', dur: 0.18, vol: 0.05 });
      }
    }
  }

  render() {
    const g = this.g;
    const W = this.design.width;
    const H = this.design.height;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#12081a');
    bg.addColorStop(1, '#07040d');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    for (const b of this.bricks) {
      g.fillStyle = b.color;
      round(g, b.x, b.y, b.w, b.h, 4);
      g.fill();
    }

    g.fillStyle = '#f8fafc';
    round(g, this.paddleX, H - 28, this.paddleW, 12, 6);
    g.fill();
    g.beginPath();
    g.arc(this.ball.x, this.ball.y, this.ball.r, 0, Math.PI * 2);
    g.fill();
  }
}

function round(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
