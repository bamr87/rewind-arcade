import type { GameContext, GameInstance, PointerInfo } from '../../engine/types';
import { clamp, cfgInt, cfgStr, fmt } from '../../engine/util';

type Phase = 'menu' | 'playing' | 'win' | 'lose';

export class Pong implements GameInstance {
  readonly design = { width: 840, height: 480 };

  private host: GameContext;
  private g: CanvasRenderingContext2D;
  private winScore: number;
  private aiSkill: number;
  private mode: string;

  private phase: Phase = 'menu';
  private leftY = 0;
  private rightY = 0;
  private paddleH = 78;
  private paddleW = 12;
  private ball = { x: 0, y: 0, vx: 0, vy: 0, r: 7 };
  private leftScore = 0;
  private rightScore = 0;
  private keys = new Set<string>();
  private serveT = 0;
  private pulse = 0;

  constructor(ctx: GameContext) {
    this.host = ctx;
    this.g = ctx.ctx;
    this.winScore = cfgInt(ctx.config.winScore, 7);
    this.aiSkill = cfgInt(ctx.config.ai, 70);
    this.mode = cfgStr(ctx.config.mode, 'ai');
    this.resetPositions();
    this.showMenu();
  }

  private resetPositions() {
    const H = this.design.height;
    this.leftY = H / 2 - this.paddleH / 2;
    this.rightY = H / 2 - this.paddleH / 2;
    this.ball.x = this.design.width / 2;
    this.ball.y = H / 2;
    this.ball.vx = 0;
    this.ball.vy = 0;
  }

  private showMenu() {
    this.phase = 'menu';
    this.leftScore = 0;
    this.rightScore = 0;
    this.resetPositions();
    this.host.setHud({ badge: 'PONG', stats: [{ label: 'First to', value: String(this.winScore) }] });
    this.host.setOverlay({
      variant: 'menu',
      title: 'PONG',
      subtitle: 'Two paddles. One bouncing square. First to the target wins.',
      bullets: [
        { icon: '🖱', text: 'Move the left paddle with the mouse or W / S.' },
        { icon: '↔', text: this.mode === 'ai' ? 'The right paddle is the house. Beat it.' : 'Player 2 uses the arrow keys.' },
        { icon: '🏁', text: `First to ${this.winScore} points takes the table.` },
      ],
      buttons: [{ action: 'start', label: 'Serve', primary: true }],
    });
  }

  private startGame() {
    this.leftScore = 0;
    this.rightScore = 0;
    this.phase = 'playing';
    this.host.setOverlay(null);
    this.serve(Math.random() < 0.5 ? 1 : -1);
    this.emitHud();
  }

  private serve(dir: number) {
    this.resetPositions();
    const angle = (Math.random() * 0.7 - 0.35);
    const speed = 340;
    this.ball.vx = dir * speed * Math.cos(angle);
    this.ball.vy = speed * Math.sin(angle);
    this.serveT = 0.55;
    this.host.audio.tone(220, { type: 'square', dur: 0.07, vol: 0.05 });
  }

  private emitHud() {
    this.host.setHud({
      badge: this.mode === 'ai' ? 'VS CPU' : 'VS P2',
      stats: [
        { label: 'You', value: String(this.leftScore), accent: true },
        { label: 'Them', value: String(this.rightScore) },
      ],
    });
  }

  private finish(won: boolean) {
    this.phase = won ? 'win' : 'lose';
    const score = this.leftScore * 100 + (won ? 50 : 0);
    const record = this.host.submitScore(score);
    this.host.audio.arp(won ? [392, 523, 659, 784] : [330, 247, 196], {
      type: 'square', dur: 0.12, vol: 0.06, gap: 0.1,
    });
    this.host.setOverlay({
      variant: won ? 'win' : 'lose',
      kicker: won ? 'Table won' : 'Table lost',
      title: `${this.leftScore} – ${this.rightScore}`,
      bigStat: {
        label: 'Score',
        value: fmt(score),
        note: record ? '★ New best!' : undefined,
      },
      buttons: [
        { action: 'start', label: 'Rematch', primary: true },
        { action: 'menu', label: 'Title', ghost: true },
      ],
    });
  }

  onKey(code: string, down: boolean) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  onPointerMove(p: PointerInfo) {
    this.leftY = clamp(p.y - this.paddleH / 2, 8, this.design.height - this.paddleH - 8);
  }

  onAction(action: string) {
    if (action === 'start') this.startGame();
    else if (action === 'menu') this.showMenu();
  }

  update(dt: number) {
    this.pulse += dt;
    if (this.phase !== 'playing') return;
    const H = this.design.height;
    const W = this.design.width;
    const speed = 420;

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp') && this.mode === 'ai') {
      this.leftY -= speed * dt;
    }
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown') && this.mode === 'ai') {
      this.leftY += speed * dt;
    }
    this.leftY = clamp(this.leftY, 8, H - this.paddleH - 8);

    if (this.mode === 'two') {
      if (this.keys.has('ArrowUp')) this.rightY -= speed * dt;
      if (this.keys.has('ArrowDown')) this.rightY += speed * dt;
    } else {
      const target = this.ball.y - this.paddleH / 2;
      const max = (80 + this.aiSkill * 3.2) * dt;
      const delta = clamp(target - this.rightY, -max, max);
      this.rightY += delta;
    }
    this.rightY = clamp(this.rightY, 8, H - this.paddleH - 8);

    if (this.serveT > 0) {
      this.serveT -= dt;
      return;
    }

    this.ball.x += this.ball.vx * dt;
    this.ball.y += this.ball.vy * dt;

    if (this.ball.y - this.ball.r < 8) {
      this.ball.y = 8 + this.ball.r;
      this.ball.vy *= -1;
      this.host.audio.tone(880, { type: 'square', dur: 0.04, vol: 0.04 });
    }
    if (this.ball.y + this.ball.r > H - 8) {
      this.ball.y = H - 8 - this.ball.r;
      this.ball.vy *= -1;
      this.host.audio.tone(880, { type: 'square', dur: 0.04, vol: 0.04 });
    }

    const hitPaddle = (x: number, y: number, w: number, h: number, dir: number) => {
      const b = this.ball;
      if (b.x + b.r < x || b.x - b.r > x + w || b.y + b.r < y || b.y - b.r > y + h) return;
      b.x = dir > 0 ? x + w + b.r : x - b.r;
      const rel = (b.y - (y + h / 2)) / (h / 2);
      const mag = Math.min(560, Math.hypot(b.vx, b.vy) * 1.05 + 12);
      b.vx = dir * mag * Math.cos(rel * 0.6);
      b.vy = mag * Math.sin(rel * 0.75);
      this.host.audio.tone(440 + Math.abs(rel) * 220, { type: 'square', dur: 0.05, vol: 0.05 });
    };
    hitPaddle(24, this.leftY, this.paddleW, this.paddleH, 1);
    hitPaddle(W - 24 - this.paddleW, this.rightY, this.paddleW, this.paddleH, -1);

    if (this.ball.x < -20) {
      this.rightScore++;
      this.emitHud();
      if (this.rightScore >= this.winScore) this.finish(false);
      else this.serve(1);
    } else if (this.ball.x > W + 20) {
      this.leftScore++;
      this.emitHud();
      if (this.leftScore >= this.winScore) this.finish(true);
      else this.serve(-1);
    }
  }

  render() {
    const g = this.g;
    const W = this.design.width;
    const H = this.design.height;
    g.fillStyle = '#071018';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(226,232,240,0.12)';
    g.lineWidth = 2;
    g.setLineDash([8, 10]);
    g.beginPath();
    g.moveTo(W / 2, 12);
    g.lineTo(W / 2, H - 12);
    g.stroke();
    g.setLineDash([]);

    g.fillStyle = 'rgba(226,232,240,0.18)';
    g.font = '700 64px ui-sans-serif, sans-serif';
    g.textAlign = 'center';
    g.fillText(String(this.leftScore), W / 2 - 80, 78);
    g.fillText(String(this.rightScore), W / 2 + 80, 78);

    g.fillStyle = '#e2e8f0';
    round(g, 24, this.leftY, this.paddleW, this.paddleH, 5);
    g.fill();
    round(g, W - 24 - this.paddleW, this.rightY, this.paddleW, this.paddleH, 5);
    g.fill();

    if (this.serveT <= 0 || Math.sin(this.pulse * 18) > 0) {
      g.beginPath();
      g.arc(this.ball.x, this.ball.y, this.ball.r, 0, Math.PI * 2);
      g.fill();
    }
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
