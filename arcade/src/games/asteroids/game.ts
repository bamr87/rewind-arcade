import type { GameContext, GameInstance } from '../../engine/types';
import { cfgInt, fmt } from '../../engine/util';

type Phase = 'menu' | 'playing' | 'win' | 'lose';
interface Body { x: number; y: number; vx: number; vy: number; r: number; }
interface Rock extends Body { verts: number[]; rot: number; spin: number; }
interface Shot extends Body { age: number; }

export class Asteroids implements GameInstance {
  readonly design = { width: 800, height: 600 };

  private host: GameContext;
  private g: CanvasRenderingContext2D;
  private rockCount: number;
  private shotLimit: number;

  private phase: Phase = 'menu';
  private ship = { x: 400, y: 300, vx: 0, vy: 0, a: -Math.PI / 2, r: 11 };
  private rocks: Rock[] = [];
  private shots: Shot[] = [];
  private lives = 3;
  private score = 0;
  private invuln = 0;
  private keys = new Set<string>();
  private fireCd = 0;
  private bestBefore = 0;
  private wave = 1;

  constructor(ctx: GameContext) {
    this.host = ctx;
    this.g = ctx.ctx;
    this.rockCount = cfgInt(ctx.config.rocks, 5);
    this.shotLimit = cfgInt(ctx.config.shots, 4);
    this.spawnWave(this.rockCount);
    this.showMenu();
  }

  private showMenu() {
    this.phase = 'menu';
    this.lives = 3;
    this.score = 0;
    this.wave = 1;
    this.resetShip();
    this.spawnWave(this.rockCount);
    this.host.setHud({ badge: 'VECTOR', lives: { current: 3, max: 3 }, stats: [{ label: 'Score', value: '0' }] });
    this.host.setOverlay({
      variant: 'menu',
      title: 'ASTEROIDS',
      subtitle: 'A needle in a field of rocks. Thrust, turn, shoot.',
      bullets: [
        { icon: '⬆', text: 'Rotate with ← → or A D. Thrust with W or ↑.' },
        { icon: '✦', text: 'Fire with F or K. Space is pause — it never shoots.' },
        { icon: '💫', text: 'Edges wrap. Big rocks split. Do not get hit.' },
      ],
      buttons: [{ action: 'start', label: 'Launch', primary: true }],
    });
  }

  private startGame() {
    this.lives = 3;
    this.score = 0;
    this.wave = 1;
    this.bestBefore = this.host.getBest();
    this.resetShip();
    this.spawnWave(this.rockCount);
    this.shots = [];
    this.phase = 'playing';
    this.invuln = 1.4;
    this.host.setOverlay(null);
    this.emitHud();
  }

  private resetShip() {
    this.ship.x = this.design.width / 2;
    this.ship.y = this.design.height / 2;
    this.ship.vx = 0;
    this.ship.vy = 0;
    this.ship.a = -Math.PI / 2;
  }

  private spawnWave(n: number) {
    this.rocks = [];
    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n + Math.random();
      const dist = 180 + Math.random() * 80;
      this.rocks.push(this.makeRock(
        this.design.width / 2 + Math.cos(ang) * dist,
        this.design.height / 2 + Math.sin(ang) * dist,
        34 + Math.random() * 10,
      ));
    }
  }

  private makeRock(x: number, y: number, r: number): Rock {
    const verts: number[] = [];
    const n = 7 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) verts.push(0.7 + Math.random() * 0.5);
    const a = Math.random() * Math.PI * 2;
    const sp = 28 + Math.random() * 55;
    return {
      x, y, r, verts, rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 1.4,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
    };
  }

  private emitHud() {
    this.host.setHud({
      badge: `WAVE ${this.wave}`,
      lives: { current: this.lives, max: 3 },
      stats: [
        { label: 'Score', value: fmt(this.score) },
        { label: 'Rocks', value: String(this.rocks.length) },
      ],
    });
  }

  private wrap(b: Body) {
    const W = this.design.width;
    const H = this.design.height;
    if (b.x < -b.r) b.x = W + b.r;
    if (b.x > W + b.r) b.x = -b.r;
    if (b.y < -b.r) b.y = H + b.r;
    if (b.y > H + b.r) b.y = -b.r;
  }

  private fire() {
    if (this.fireCd > 0 || this.shots.length >= this.shotLimit) return;
    this.fireCd = 0.18;
    const s = this.ship;
    this.shots.push({
      x: s.x + Math.cos(s.a) * 14,
      y: s.y + Math.sin(s.a) * 14,
      vx: Math.cos(s.a) * 420 + s.vx,
      vy: Math.sin(s.a) * 420 + s.vy,
      r: 2, age: 0,
    });
    this.host.audio.tone(880, { type: 'square', dur: 0.04, vol: 0.04 });
  }

  private hitRock(rock: Rock, idx: number) {
    this.rocks.splice(idx, 1);
    this.score += rock.r > 24 ? 20 : rock.r > 14 ? 50 : 100;
    this.host.audio.tone(140 + (40 - rock.r) * 8, { type: 'sawtooth', dur: 0.08, vol: 0.05 });
    if (rock.r > 16) {
      this.rocks.push(this.makeRock(rock.x, rock.y, rock.r * 0.58));
      this.rocks.push(this.makeRock(rock.x, rock.y, rock.r * 0.58));
    }
    this.emitHud();
    if (!this.rocks.length) {
      this.wave++;
      this.spawnWave(this.rockCount + this.wave - 1);
      this.invuln = 1;
      this.emitHud();
      this.host.audio.arp([392, 523, 659], { type: 'square', dur: 0.08, vol: 0.05, gap: 0.08 });
    }
  }

  private die() {
    this.lives--;
    this.emitHud();
    this.host.audio.tone(110, { type: 'sawtooth', dur: 0.25, vol: 0.07 });
    if (this.lives <= 0) {
      this.phase = 'lose';
      const record = this.host.submitScore(this.score);
      this.host.setOverlay({
        variant: 'lose',
        kicker: 'Ship lost',
        title: `Wave ${this.wave}`,
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
      return;
    }
    this.resetShip();
    this.invuln = 2;
    this.shots = [];
  }

  onKey(code: string, down: boolean) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
    if (down && (code === 'KeyF' || code === 'KeyK')) this.fire();
  }

  onAction(action: string) {
    if (action === 'start') this.startGame();
    else if (action === 'menu') this.showMenu();
  }

  update(dt: number) {
    if (this.phase !== 'playing') {
      for (const r of this.rocks) {
        r.x += r.vx * dt * 0.3;
        r.y += r.vy * dt * 0.3;
        r.rot += r.spin * dt;
        this.wrap(r);
      }
      return;
    }
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    const s = this.ship;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) s.a -= 3.6 * dt;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) s.a += 3.6 * dt;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) {
      s.vx += Math.cos(s.a) * 240 * dt;
      s.vy += Math.sin(s.a) * 240 * dt;
    }
    s.vx *= 0.992;
    s.vy *= 0.992;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    this.wrap(s);

    for (let i = this.shots.length - 1; i >= 0; i--) {
      const sh = this.shots[i];
      sh.age += dt;
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      this.wrap(sh);
      if (sh.age > 0.85) this.shots.splice(i, 1);
    }

    for (const r of this.rocks) {
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.rot += r.spin * dt;
      this.wrap(r);
    }

    for (let i = this.shots.length - 1; i >= 0; i--) {
      const sh = this.shots[i];
      for (let j = this.rocks.length - 1; j >= 0; j--) {
        const r = this.rocks[j];
        const dx = sh.x - r.x;
        const dy = sh.y - r.y;
        if (dx * dx + dy * dy < r.r * r.r) {
          this.shots.splice(i, 1);
          this.hitRock(r, j);
          break;
        }
      }
    }

    if (this.invuln > 0) return;
    for (const r of this.rocks) {
      const dx = s.x - r.x;
      const dy = s.y - r.y;
      if (dx * dx + dy * dy < (r.r + s.r) * (r.r + s.r) * 0.55) {
        this.die();
        break;
      }
    }
  }

  render() {
    const g = this.g;
    const W = this.design.width;
    const H = this.design.height;
    g.fillStyle = '#05070d';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#cbd5e1';
    g.lineWidth = 1.5;
    g.lineJoin = 'round';

    for (const r of this.rocks) {
      g.beginPath();
      r.verts.forEach((v, i) => {
        const a = r.rot + (i / r.verts.length) * Math.PI * 2;
        const x = r.x + Math.cos(a) * r.r * v;
        const y = r.y + Math.sin(a) * r.r * v;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.closePath();
      g.stroke();
    }

    g.fillStyle = '#e2e8f0';
    for (const sh of this.shots) {
      g.beginPath();
      g.arc(sh.x, sh.y, 2.2, 0, Math.PI * 2);
      g.fill();
    }

    if (this.invuln === 0 || Math.floor(this.invuln * 12) % 2 === 0) {
      const s = this.ship;
      g.save();
      g.translate(s.x, s.y);
      g.rotate(s.a);
      g.beginPath();
      g.moveTo(14, 0);
      g.lineTo(-10, 8);
      g.lineTo(-6, 0);
      g.lineTo(-10, -8);
      g.closePath();
      g.stroke();
      if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) {
        g.beginPath();
        g.moveTo(-8, 4);
        g.lineTo(-16, 0);
        g.lineTo(-8, -4);
        g.stroke();
      }
      g.restore();
    }
  }
}
