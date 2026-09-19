import type { GameContext, GameInstance, PointerInfo } from '../../engine/types';
import { clamp, cfgInt, fmt } from '../../engine/util';

type Phase = 'menu' | 'playing' | 'lose';
type Kind = 'tree' | 'rock' | 'stump' | 'jump' | 'dog';

interface Obs {
  kind: Kind;
  x: number;
  y: number;
  r: number;
  h: number;
  vx: number;
}

interface Track { x: number; y: number; facing: number }
interface Spark { x: number; y: number; vx: number; vy: number; age: number; life: number; c: string; s: number }

const W = 800;
const H = 600;
const METER = 0.18;
const SKIER_R = 7;

export class SkiFree implements GameInstance {
  readonly design = { width: W, height: H };

  private host: GameContext;
  private g: CanvasRenderingContext2D;
  private density: number;
  private yetiAt: number;
  private baseSpeed: number;

  private phase: Phase = 'menu';
  private x = 0;
  private y = 0;
  private facing = 0;
  private tuck = false;
  private plow = false;
  private crashT = 0;
  private invuln = 0;
  private air = 0;
  private airMax = 0.7;
  private keys = new Set<string>();
  private pointer: PointerInfo | null = null;
  private camX = -W / 2;
  private camY = -160;
  private spawnY = 80;
  private obs: Obs[] = [];
  private tracks: Track[] = [];
  private sparks: Spark[] = [];
  private yeti: { x: number; y: number; born: boolean; eat: number } = { x: 0, y: 0, born: false, eat: 0 };
  private crashes = 0;
  private shake = 0;
  private bestBefore = 0;
  private whoosh = 0;
  private hudKey = '';

  constructor(ctx: GameContext) {
    this.host = ctx;
    this.g = ctx.ctx;
    this.density = cfgInt(ctx.config.density, 5);
    this.yetiAt = cfgInt(ctx.config.yeti, 2000);
    this.baseSpeed = cfgInt(ctx.config.speed, 240);
    this.seedSlope();
    this.showMenu();
  }

  private meters(): number {
    return Math.max(0, this.y * METER);
  }

  private seedSlope() {
    this.obs = [];
    this.spawnY = 40;
    this.ensureObs(0, 900);
  }

  private showMenu() {
    this.phase = 'menu';
    this.x = 0;
    this.y = 0;
    this.facing = 0;
    this.crashT = 0;
    this.invuln = 0;
    this.air = 0;
    this.yeti = { x: 0, y: 0, born: false, eat: 0 };
    this.tracks = [];
    this.sparks = [];
    this.crashes = 0;
    this.camX = -W / 2;
    this.camY = -160;
    this.seedSlope();
    this.host.setHud({ badge: 'SKI', stats: [{ label: 'Distance', value: '0 m' }] });
    this.host.setOverlay({
      variant: 'menu',
      title: 'SKIFREE',
      subtitle: 'A free downhill. The woods are optional. The yeti is not.',
      bullets: [
        { icon: '↔', text: 'Steer with ← → or A D. Mouse or touch leans you too.' },
        { icon: '⬇', text: 'Tuck with ↓ / S for speed. Snowplow with ↑ / W to scrub it.' },
        { icon: '🌲', text: 'Wipe out on trees and rocks — you get back up. Jumps send you over them.' },
        { icon: '👾', text: `The yeti waits at ${fmt(this.yetiAt)} m.` },
      ],
      buttons: [{ action: 'start', label: 'Ski', primary: true }],
    });
  }

  private startGame() {
    this.x = 0;
    this.y = 0;
    this.facing = 0;
    this.tuck = false;
    this.plow = false;
    this.crashT = 0;
    this.invuln = 0;
    this.air = 0;
    this.crashes = 0;
    this.shake = 0;
    this.yeti = { x: 0, y: 0, born: false, eat: 0 };
    this.tracks = [];
    this.sparks = [];
    this.keys.clear();
    this.bestBefore = this.host.getBest();
    this.camX = -W / 2;
    this.camY = -160;
    this.seedSlope();
    this.phase = 'playing';
    this.host.setOverlay(null);
    this.emitHud();
    this.host.audio.tone(392, { type: 'triangle', dur: 0.08, vol: 0.05 });
  }

  snapshot() {
    const yetiDist = this.yeti.born ? Math.hypot(this.x - this.yeti.x, this.y - this.yeti.y) : -1;
    const ahead = this.obs
      .filter((o) => o.y > this.y - 12 && o.y < this.y + 240 && Math.abs(o.x - this.x) < 140)
      .map((o) => ({ kind: o.kind, x: o.x, y: o.y, r: o.r }));
    return {
      phase: this.phase,
      x: this.x,
      y: this.y,
      meters: this.meters(),
      facing: this.facing,
      crashT: this.crashT,
      air: this.air,
      crashes: this.crashes,
      yetiBorn: this.yeti.born,
      yetiDist,
      speed: this.phase === 'playing' && this.crashT <= 0 ? this.speed() : 0,
      ahead,
    };
  }

  private emitHud() {
    const m = this.meters();
    const spd = this.crashT > 0 || this.phase !== 'playing' ? 0 : this.speed();
    const key = `${this.phase}|${Math.floor(m)}|${Math.round(spd)}|${this.yeti.born}|${this.crashes}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    this.host.setHud({
      badge: this.yeti.born ? 'YETI' : 'SKI',
      progress: this.yeti.born
        ? undefined
        : { value: clamp(m / this.yetiAt, 0, 1), target: 1, label: `${fmt(this.yetiAt)} m` },
      stats: [
        { label: 'Distance', value: `${fmt(m)} m`, accent: true },
        { label: 'Speed', value: `${Math.round(spd * 0.42)}` },
      ],
    });
  }

  private speed(): number {
    const down = 1.08 - Math.abs(this.facing) * 0.24;
    const tuckMul = this.tuck ? 1.48 : 1;
    const plowMul = this.plow ? 0.42 : 1;
    return this.baseSpeed * down * tuckMul * plowMul;
  }

  private ensureObs(from: number, to: number) {
    while (this.spawnY < to) {
      const band = this.spawnY;
      this.spawnY += 28 + Math.random() * 34;
      if (band < 160) continue;
      const forest = this.density;
      const n = 1 + Math.floor(Math.random() * (1 + forest * 0.45));
      for (let i = 0; i < n; i++) {
        const side = Math.random() < 0.38 ? (Math.random() < 0.5 ? -1 : 1) * (340 + Math.random() * 420) : (Math.random() - 0.5) * 640;
        this.place(band + Math.random() * 22, side);
      }
      const extra = 2 + Math.floor(forest * 0.4);
      for (let i = 0; i < extra; i++) {
        const edge = (Math.random() < 0.5 ? -1 : 1) * (420 + Math.random() * 380);
        this.place(band + Math.random() * 24, edge, 'tree');
      }
    }
    this.obs = this.obs.filter((o) => o.y > from - 140);
  }

  private place(y: number, x: number, force?: Kind) {
    for (const o of this.obs) {
      const dx = o.x - x;
      const dy = o.y - y;
      if (dx * dx + dy * dy < 34 * 34) return;
    }
    const roll = Math.random();
    const kind: Kind = force ?? (roll < 0.52 ? 'tree' : roll < 0.7 ? 'rock' : roll < 0.82 ? 'stump' : roll < 0.93 ? 'jump' : 'dog');
    const r = kind === 'tree' ? 8 : kind === 'rock' ? 11 : kind === 'stump' ? 7 : kind === 'jump' ? 14 : 9;
    const h = kind === 'tree' ? 38 + Math.random() * 18 : kind === 'rock' ? 12 : kind === 'jump' ? 10 : 8;
    this.obs.push({ kind, x, y, r, h, vx: kind === 'dog' ? (Math.random() < 0.5 ? -50 : 50) : 0 });
  }

  private wipeout() {
    if (this.crashT > 0 || this.air > 0) return;
    this.crashT = 0.85;
    this.invuln = 1.35;
    this.crashes++;
    this.shake = 0.28;
    this.facing *= 0.2;
    this.host.audio.tone(90, { type: 'sawtooth', dur: 0.22, vol: 0.07 });
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      this.sparks.push({
        x: this.x, y: this.y, vx: Math.cos(a) * 80, vy: Math.sin(a) * 50 - 20,
        age: 0, life: 0.4 + Math.random() * 0.3, c: '#f8fafc', s: 2 + Math.random() * 2,
      });
    }
    this.emitHud();
  }

  private spawnYeti() {
    this.yeti.born = true;
    this.yeti.x = this.x;
    this.yeti.y = this.y - 260;
    this.yeti.eat = 0;
    this.host.audio.arp([110, 98, 82], { type: 'sawtooth', dur: 0.18, vol: 0.07, gap: 0.12 });
    this.emitHud();
  }

  private eaten() {
    this.phase = 'lose';
    this.yeti.eat = 1;
    const score = Math.floor(this.meters());
    const record = this.host.submitScore(score);
    this.host.audio.arp([196, 147, 98, 65], { type: 'sawtooth', dur: 0.22, vol: 0.08, gap: 0.14 });
    this.host.setOverlay({
      variant: 'lose',
      kicker: 'Snack time',
      title: 'YETI',
      subtitle: 'The yeti caught up. Distance is the score.',
      bigStat: {
        label: 'Distance',
        value: `${fmt(score)} m`,
        note: record && score > this.bestBefore ? '★ New best!' : undefined,
      },
      rows: [
        { label: 'Crashes', value: String(this.crashes) },
        { label: 'Best', value: `${fmt(Math.max(score, this.host.getBest()))} m` },
      ],
      buttons: [
        { action: 'start', label: 'Ski again', primary: true },
        { action: 'menu', label: 'Title', ghost: true },
      ],
    });
  }

  onKey(code: string, down: boolean) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  onPointerDown(p: PointerInfo) {
    this.pointer = p;
  }

  onPointerMove(p: PointerInfo) {
    if (this.pointer) this.pointer = p;
  }

  onPointerUp() {
    this.pointer = null;
  }

  onPointerLeave() {
    this.pointer = null;
  }

  onAction(action: string) {
    if (action === 'start') this.startGame();
    else if (action === 'menu') this.showMenu();
  }

  update(dt: number) {
    this.shake = Math.max(0, this.shake - dt);
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 40 * dt;
      if (p.age >= p.life) this.sparks.splice(i, 1);
    }

    if (this.phase !== 'playing') {
      this.camY += 36 * dt;
      this.ensureObs(this.camY, this.camY + H + 200);
      return;
    }

    this.tuck = this.keys.has('ArrowDown') || this.keys.has('KeyS');
    this.plow = this.keys.has('ArrowUp') || this.keys.has('KeyW');
    const left = this.keys.has('ArrowLeft') || this.keys.has('KeyA');
    const right = this.keys.has('ArrowRight') || this.keys.has('KeyD');
    const turn = (this.tuck ? 1.6 : 3.4) * dt;

    if (this.crashT <= 0) {
      if (left) this.facing -= turn;
      if (right) this.facing += turn;
      if (this.pointer && !left && !right) {
        const sx = this.x - this.camX;
        this.facing = clamp((this.pointer.x - sx) / 86, -2.2, 2.2);
      }
      this.facing = clamp(this.facing, -2.2, 2.2);
    }

    const down = this.crashT > 0;
    this.crashT = Math.max(0, this.crashT - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.air = Math.max(0, this.air - dt);
    if (down && this.crashT === 0) this.y += 32;

    if (this.crashT <= 0) {
      const sp = this.speed();
      this.x += this.facing * sp * 0.5 * dt;
      this.y += sp * dt;
      this.whoosh -= dt;
      if (this.tuck && this.whoosh <= 0) {
        this.whoosh = 0.55;
        this.host.audio.tone(240 + Math.random() * 40, { type: 'triangle', dur: 0.05, vol: 0.02 });
      }
      if (this.tuck && Math.random() < 0.4) {
        this.sparks.push({
          x: this.x + (Math.random() - 0.5) * 8,
          y: this.y + 8,
          vx: (Math.random() - 0.5) * 30,
          vy: -20 - Math.random() * 20,
          age: 0, life: 0.25, c: '#ffffff', s: 1.4,
        });
      }
      if (this.air <= 0) {
        this.tracks.push({ x: this.x, y: this.y, facing: this.facing });
        if (this.tracks.length > 100) this.tracks.shift();
      }
    }

    this.camX += (this.x - W / 2 - this.camX) * Math.min(1, 8 * dt);
    this.camY = this.y - 150;
    this.ensureObs(this.y - 200, this.y + 980);

    for (const o of this.obs) {
      if (o.kind === 'dog') {
        o.x += o.vx * dt;
        if (Math.abs(o.x) > 520) o.vx *= -1;
      }
    }

    if (this.crashT <= 0 && this.yeti.eat <= 0) {
      for (const o of this.obs) {
        const dx = this.x - o.x;
        const dy = this.y - o.y;
        const hit = dx * dx + dy * dy < (o.r + SKIER_R) * (o.r + SKIER_R);
        if (!hit) continue;
        if (o.kind === 'jump' && this.air <= 0) {
          this.airMax = 0.72;
          this.air = this.airMax;
          this.host.audio.tone(520, { type: 'square', dur: 0.07, vol: 0.04, slideTo: 760 });
          break;
        }
        if (this.invuln > 0 || this.air > 0) continue;
        if (o.kind === 'jump') continue;
        this.wipeout();
        break;
      }
    }

    if (!this.yeti.born && this.meters() >= this.yetiAt) this.spawnYeti();
    if (this.yeti.born && this.phase === 'playing') {
      const dx = this.x - this.yeti.x;
      const dy = this.y - this.yeti.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = this.baseSpeed * 1.92;
      this.yeti.x += (dx / d) * sp * dt;
      this.yeti.y += (dy / d) * sp * dt;
      if (d < 22 && this.yeti.eat <= 0) this.eaten();
    }

    this.emitHud();
  }

  render() {
    const g = this.g;
    const ox = this.shake > 0 ? (Math.random() - 0.5) * 10 * this.shake : 0;
    const oy = this.shake > 0 ? (Math.random() - 0.5) * 8 * this.shake : 0;
    g.save();
    g.translate(ox, oy);

    g.fillStyle = '#e8f4fc';
    g.fillRect(0, 0, W, H);
    const sky = g.createLinearGradient(0, 0, 0, 90);
    sky.addColorStop(0, '#7dd3fc');
    sky.addColorStop(1, '#e8f4fc');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, 80);

    g.fillStyle = 'rgba(186, 230, 253, 0.7)';
    for (let i = 0; i < 90; i++) {
      const sx = ((i * 73 + 20) % (W + 40)) - 20;
      const sy = ((i * 47 - this.camY * 0.35) % (H + 40) + (H + 40)) % (H + 40) - 20;
      g.fillRect(sx, sy, 2, 2);
    }

    this.drawTracks(g);
    this.drawMarkers(g);
    this.drawLodge(g);

    const lift = this.air > 0 ? Math.sin((this.air / this.airMax) * Math.PI) : 0;
    const drawables: { y: number; draw: () => void }[] = [];

    for (const o of this.obs) {
      const sx = o.x - this.camX;
      const sy = o.y - this.camY;
      if (sy < -70 || sy > H + 90 || sx < -80 || sx > W + 80) continue;
      drawables.push({ y: o.y, draw: () => this.drawObs(g, o, sx, sy) });
    }

    drawables.push({
      y: this.y,
      draw: () => {
        const sx = this.x - this.camX;
        const sy = this.y - this.camY;
        if (lift > 0) {
          g.fillStyle = 'rgba(148, 163, 184, 0.35)';
          g.beginPath();
          g.ellipse(sx, sy + 10, 10 + lift * 4, 4, 0, 0, Math.PI * 2);
          g.fill();
        }
        this.drawSkier(g, sx, sy - lift * 26);
      },
    });

    if (this.yeti.born) {
      drawables.push({
        y: this.yeti.y,
        draw: () => this.drawYeti(g, this.yeti.x - this.camX, this.yeti.y - this.camY),
      });
    }

    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    for (const p of this.sparks) {
      const a = 1 - p.age / p.life;
      g.fillStyle = p.c;
      g.globalAlpha = a;
      g.beginPath();
      g.arc(p.x - this.camX, p.y - this.camY, p.s, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }

    g.restore();
  }

  private drawTracks(g: CanvasRenderingContext2D) {
    if (this.tracks.length < 2) return;
    g.strokeStyle = 'rgba(148, 163, 184, 0.45)';
    g.lineWidth = 1.4;
    g.lineCap = 'round';
    for (const side of [-3.2, 3.2]) {
      g.beginPath();
      let pen = false;
      for (const t of this.tracks) {
        const sx = t.x - this.camX + side + t.facing * 1.2;
        const sy = t.y - this.camY;
        if (sy < -10 || sy > H + 10) {
          pen = false;
          continue;
        }
        if (!pen) {
          g.moveTo(sx, sy);
          pen = true;
        } else g.lineTo(sx, sy);
      }
      g.stroke();
    }
  }

  private drawMarkers(g: CanvasRenderingContext2D) {
    const step = 500;
    const start = Math.floor(this.meters() / step) * step;
    for (let m = start; m <= start + step * 2; m += step) {
      if (m <= 0) continue;
      const wy = m / METER;
      const sy = wy - this.camY;
      if (sy < 0 || sy > H) continue;
      g.strokeStyle = m === this.yetiAt ? '#e11d48' : 'rgba(56, 189, 248, 0.55)';
      g.lineWidth = m === this.yetiAt ? 2 : 1;
      g.setLineDash([6, 8]);
      g.beginPath();
      g.moveTo(0, sy);
      g.lineTo(W, sy);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = m === this.yetiAt ? '#be123c' : '#0369a1';
      g.font = 'bold 12px ui-sans-serif, system-ui, sans-serif';
      g.fillText(`${fmt(m)} m`, 16, sy - 6);
    }
  }

  private drawLodge(g: CanvasRenderingContext2D) {
    const sx = 0 - this.camX;
    const sy = -20 - this.camY;
    if (sy < -80 || sy > H + 40) return;
    g.fillStyle = '#b45309';
    g.fillRect(sx - 36, sy - 28, 72, 28);
    g.fillStyle = '#7f1d1d';
    g.beginPath();
    g.moveTo(sx - 44, sy - 28);
    g.lineTo(sx, sy - 52);
    g.lineTo(sx + 44, sy - 28);
    g.closePath();
    g.fill();
    g.fillStyle = '#1e3a8a';
    g.fillRect(sx - 8, sy - 18, 12, 18);
    g.fillStyle = '#0f172a';
    g.font = 'bold 10px ui-sans-serif, system-ui, sans-serif';
    g.fillText('LODGE', sx - 18, sy - 34);
  }

  private drawObs(g: CanvasRenderingContext2D, o: Obs, x: number, y: number) {
    g.fillStyle = 'rgba(148, 163, 184, 0.28)';
    g.beginPath();
    g.ellipse(x, y + 4, o.r + 2, 4, 0, 0, Math.PI * 2);
    g.fill();
    if (o.kind === 'tree') {
      g.fillStyle = '#7c4a2a';
      g.fillRect(x - 3, y - 10, 6, 12);
      const layers = [
        { w: 24, top: o.h, c: '#14532d' },
        { w: 18, top: o.h * 0.7, c: '#166534' },
        { w: 12, top: o.h * 0.42, c: '#15803d' },
      ];
      for (const L of layers) {
        g.fillStyle = L.c;
        g.beginPath();
        g.moveTo(x, y - 8 - L.top);
        g.lineTo(x + L.w * 0.5, y - 6 - L.top * 0.15);
        g.lineTo(x - L.w * 0.5, y - 6 - L.top * 0.15);
        g.closePath();
        g.fill();
      }
      return;
    }
    if (o.kind === 'rock') {
      g.fillStyle = '#94a3b8';
      g.beginPath();
      g.moveTo(x - 12, y + 2);
      g.quadraticCurveTo(x - 10, y - 14, x, y - 12);
      g.quadraticCurveTo(x + 12, y - 10, x + 13, y + 2);
      g.closePath();
      g.fill();
      g.fillStyle = '#cbd5e1';
      g.beginPath();
      g.ellipse(x - 3, y - 6, 4, 2.2, -0.4, 0, Math.PI * 2);
      g.fill();
      return;
    }
    if (o.kind === 'stump') {
      g.fillStyle = '#92400e';
      g.fillRect(x - 7, y - 8, 14, 10);
      g.fillStyle = '#d97706';
      g.beginPath();
      g.ellipse(x, y - 8, 7, 3, 0, 0, Math.PI * 2);
      g.fill();
      return;
    }
    if (o.kind === 'jump') {
      g.fillStyle = '#bae6fd';
      g.beginPath();
      g.moveTo(x - 18, y + 6);
      g.lineTo(x + 18, y + 6);
      g.lineTo(x + 10, y - 10);
      g.lineTo(x - 6, y - 4);
      g.closePath();
      g.fill();
      g.strokeStyle = '#0284c7';
      g.lineWidth = 1.5;
      g.stroke();
      return;
    }
    g.fillStyle = '#78716c';
    g.beginPath();
    g.ellipse(x, y - 4, 8, 6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#44403c';
    g.beginPath();
    g.ellipse(x + 8, y - 2, 5, 3.5, 0.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fef3c7';
    g.beginPath();
    g.arc(x + 11, y - 3, 1.2, 0, Math.PI * 2);
    g.fill();
  }

  private drawSkier(g: CanvasRenderingContext2D, x: number, y: number) {
    g.save();
    g.translate(x, y);
    if (this.crashT > 0) {
      g.rotate(1.05);
      g.strokeStyle = '#1e3a8a';
      g.lineWidth = 2.4;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-16, 3);
      g.lineTo(16, 7);
      g.moveTo(-15, 9);
      g.lineTo(16, 13);
      g.stroke();
      g.fillStyle = '#e11d48';
      g.beginPath();
      g.arc(0, 0, 7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fde68a';
      g.beginPath();
      g.arc(7, -3, 5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#0f172a';
      g.beginPath();
      g.arc(7, -6, 4.4, Math.PI, 0);
      g.fill();
      g.restore();
      return;
    }
    g.rotate(this.facing * 0.28);
    const spread = this.tuck ? 3 : 5.6;
    const skiA = this.facing * 0.12;
    g.strokeStyle = '#1e40af';
    g.lineWidth = 2.3;
    g.lineCap = 'round';
    for (const s of [-spread, spread]) {
      g.save();
      g.translate(s, 9);
      g.rotate(skiA);
      g.beginPath();
      g.moveTo(0, -15);
      g.lineTo(0, 15);
      g.stroke();
      g.restore();
    }
    g.strokeStyle = '#1e3a8a';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-3, 2);
    g.lineTo(-spread, 9);
    g.moveTo(3, 2);
    g.lineTo(spread, 9);
    g.stroke();
    const th = this.tuck ? 7 : 12;
    g.fillStyle = '#e11d48';
    g.beginPath();
    g.moveTo(-6, 3);
    g.lineTo(-5, -th);
    g.lineTo(5, -th);
    g.lineTo(6, 3);
    g.closePath();
    g.fill();
    if (!this.tuck) {
      g.strokeStyle = '#334155';
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(-7, -2);
      g.lineTo(-13, 12);
      g.moveTo(7, -2);
      g.lineTo(13, 12);
      g.stroke();
    }
    g.fillStyle = '#fde68a';
    g.beginPath();
    g.arc(this.facing * 1.6, -th - 4, 5.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0f172a';
    g.beginPath();
    g.arc(this.facing * 1.6, -th - 6.5, 5, Math.PI, 0);
    g.fill();
    g.restore();
  }

  private drawYeti(g: CanvasRenderingContext2D, x: number, y: number) {
    g.save();
    g.translate(x, y);
    g.fillStyle = 'rgba(100, 116, 139, 0.3)';
    g.beginPath();
    g.ellipse(0, 8, 16, 5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f8fafc';
    g.strokeStyle = '#64748b';
    g.lineWidth = 1.4;
    g.beginPath();
    g.ellipse(0, -14, 16, 20, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.beginPath();
    g.arc(0, -38, 12, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#0f172a';
    g.beginPath();
    g.arc(-4, -40, 2.1, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(5, -40, 2.1, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#94a3b8';
    g.beginPath();
    g.arc(0, -34, 4, 0.15, Math.PI - 0.15);
    g.stroke();
    g.strokeStyle = '#e2e8f0';
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-14, -18);
    g.lineTo(-24, 4);
    g.moveTo(14, -18);
    g.lineTo(24, 4);
    g.stroke();
    g.fillStyle = '#f8fafc';
    g.beginPath();
    g.arc(-24, 4, 5, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(24, 4, 5, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}
