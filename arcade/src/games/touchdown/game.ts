import type { GameContext, GameInstance } from '../../engine/types';
import { cfgInt, cfgStr, fmt } from '../../engine/util';
import { FLOOR_Y, SPAWN_Y, WIDTH, POINTS, STEP, generateTerrain, groundAt, padUnder } from './terrain';
import type { Pad, Terrain } from './terrain';

type Phase = 'menu' | 'flying' | 'landed' | 'over';
type End = 'crash' | 'dry';

/** Gravity in design px/s² per setting. */
export const GRAVITY: Record<string, number> = { moon: 20, mars: 38, earth: 60 };
/** Main-engine acceleration; beats even Earth gravity. */
export const THRUST = 105;
/** Fuel units burned per second of thrust. */
export const BURN = 80;
/** Fuel granted on top of the leftover after each landing. */
export const TOP_UP = 100;
/** Soft-landing limits: vertical (down) and horizontal speed in px/s, tilt in radians. */
export const V_MAX = 45;
export const H_MAX = 25;
export const ANGLE_MAX = 0.2;
const TURN = 2.6;
/** Lander outline in local space, nose up. The feet are the first two points. */
const FOOT = 12;
const HULL: [number, number][] = [[-12, FOOT], [12, FOOT], [-9, -2], [9, -2], [0, -14]];

interface Landing { mult: number; pad: number; soft: number; vSpeed: number; fuelLeft: number; }
interface Bit { x: number; y: number; vx: number; vy: number; a: number; spin: number; }

/** Score for one landing: the pad bonus plus a soft-touch bonus. */
export function landingScore(mult: number, vSpeed: number): { pad: number; soft: number } {
  return { pad: 50 * mult, soft: Math.max(0, Math.round((1 - vSpeed / V_MAX) * 50)) };
}

export class Touchdown implements GameInstance {
  readonly design = { width: WIDTH, height: 600 };

  private host: GameContext;
  private g: CanvasRenderingContext2D;
  private gravity: number;
  private fuelMax: number;
  private rough: number;
  private padCount: number;

  private phase: Phase = 'menu';
  private terrain: Terrain;
  private lander = { x: 400, y: SPAWN_Y, vx: 0, vy: 0, a: 0 };
  private fuel = 0;
  private score = 0;
  private chain = 0;
  private end: End | null = null;
  private last: Landing | null = null;
  private keys = new Set<string>();
  private bits: Bit[] = [];
  private stars: [number, number][] = [];
  private hudClock = 0;
  private rumbleClock = 0;
  private bestBefore = 0;

  constructor(ctx: GameContext) {
    this.host = ctx;
    this.g = ctx.ctx;
    this.gravity = GRAVITY[cfgStr(ctx.config.gravity, 'moon')] ?? GRAVITY.moon;
    this.fuelMax = cfgInt(ctx.config.fuel, 1000);
    this.rough = cfgInt(ctx.config.rough, 5);
    this.padCount = cfgInt(ctx.config.pads, 3);
    for (let i = 0; i < 70; i++) this.stars.push([Math.random() * WIDTH, Math.random() * 300]);
    this.terrain = generateTerrain(this.rough, this.padCount);
    this.showMenu();
  }

  /** Plain-data view of the session, for the headless checks and `?debug=1`. */
  snapshot() {
    const l = this.lander;
    return {
      phase: this.phase, end: this.end, x: l.x, y: l.y, vx: l.vx, vy: l.vy, a: l.a,
      fuel: this.fuel, score: this.score, chain: this.chain, last: this.last,
      pads: this.terrain.pads.map((p) => ({ ...p })),
    };
  }

  private thrusting() {
    return this.phase === 'flying' && this.fuel > 0 && (this.keys.has('ArrowUp') || this.keys.has('KeyW'));
  }

  private showMenu() {
    this.phase = 'menu';
    this.terrain = generateTerrain(this.rough, this.padCount);
    this.fuel = this.fuelMax;
    this.score = 0;
    this.chain = 0;
    this.bits = [];
    this.spawn();
    this.host.setHud({ badge: 'LANDER', progress: { value: 1, label: 'Fuel' }, stats: [{ label: 'Score', value: '0' }] });
    this.host.setOverlay({
      variant: 'menu',
      title: 'TOUCHDOWN',
      subtitle: 'Set it down softly. Then do it again on what is left in the tank.',
      bullets: [
        { icon: '⬆', text: 'Rotate with ← → or A D. Thrust with ↑ or W. Thrust burns fuel.' },
        { icon: '🛬', text: 'Land upright and slow on a pad. Narrow pads pay ×5; anywhere else is a crash.' },
        { icon: '⛽', text: 'Each landing brings new terrain, your leftover fuel and a small top-up.' },
      ],
      buttons: [{ action: 'start', label: 'Launch', primary: true }],
    });
  }

  private startGame() {
    this.score = 0;
    this.chain = 0;
    this.end = null;
    this.last = null;
    this.fuel = this.fuelMax;
    this.bestBefore = this.host.getBest();
    this.terrain = generateTerrain(this.rough, this.padCount);
    this.beginDescent();
  }

  private beginDescent() {
    this.bits = [];
    this.spawn();
    this.phase = 'flying';
    this.host.setOverlay(null);
    this.emitHud();
  }

  private spawn() {
    const l = this.lander;
    l.x = 100 + Math.random() * (WIDTH - 200);
    l.y = SPAWN_Y;
    l.vx = (Math.random() < 0.5 ? -1 : 1) * (25 + Math.random() * 35);
    l.vy = 0;
    l.a = 0;
  }

  private altitude() {
    return Math.max(0, groundAt(this.terrain, this.lander.x) - (this.lander.y + FOOT));
  }

  private emitHud() {
    const l = this.lander;
    this.host.setHud({
      badge: this.chain ? `CHAIN ${this.chain}` : 'LANDER',
      progress: { value: this.fuelMax ? this.fuel / this.fuelMax : 0, label: `Fuel ${fmt(this.fuel)}` },
      stats: [
        { label: 'Score', value: fmt(this.score), accent: true },
        { label: 'Chain', value: String(this.chain) },
        { label: 'Alt', value: fmt(this.altitude()) },
        { label: 'VSpd', value: fmt(l.vy), accent: l.vy > V_MAX },
        { label: 'HSpd', value: fmt(l.vx), accent: Math.abs(l.vx) > H_MAX },
      ],
    });
  }

  /** Rotated hull points in design space. */
  private hull(): [number, number][] {
    const l = this.lander;
    const c = Math.cos(l.a);
    const s = Math.sin(l.a);
    return HULL.map(([x, y]) => [l.x + x * c - y * s, l.y + x * s + y * c]);
  }

  private touchdown() {
    const l = this.lander;
    const [[lx], [rx]] = this.hull();
    const pad = padUnder(this.terrain, Math.min(lx, rx), Math.max(lx, rx));
    const soft = l.vy <= V_MAX && Math.abs(l.vx) <= H_MAX && Math.abs(l.a) <= ANGLE_MAX;
    if (pad && soft) this.land(pad);
    else this.crash();
  }

  private land(pad: Pad) {
    const l = this.lander;
    const vSpeed = Math.max(0, l.vy);
    const { pad: padPts, soft } = landingScore(pad.mult, vSpeed);
    l.y = pad.y - FOOT;
    l.vx = 0;
    l.vy = 0;
    l.a = 0;
    this.chain++;
    this.score += padPts + soft;
    this.last = { mult: pad.mult, pad: padPts, soft, vSpeed, fuelLeft: this.fuel };
    this.host.audio.arp([392, 494, 587, 784], { type: 'triangle', dur: 0.1, vol: 0.05, gap: 0.07 });
    this.emitHud();
    if (this.fuel <= 0) {
      this.gameOver('dry');
      return;
    }
    this.phase = 'landed';
    const rows = [
      { label: `Pad ×${pad.mult}`, value: `+${padPts}` },
      { label: `Soft touch (${fmt(vSpeed)} px/s)`, value: `+${soft}` },
      { label: 'Fuel left', value: fmt(this.fuel) },
      { label: 'Top-up', value: `+${TOP_UP}`, highlight: true },
    ];
    this.host.setOverlay({
      variant: 'win',
      kicker: `Landed on ×${pad.mult}`,
      title: `Chain ${this.chain}`,
      rows,
      bigStat: { label: 'Chain total', value: fmt(this.score) },
      buttons: [
        { action: 'next', label: 'Next descent', primary: true },
        { action: 'menu', label: 'Title', ghost: true },
      ],
    });
  }

  private nextDescent() {
    if (this.phase !== 'landed') return;
    this.fuel = Math.min(this.fuelMax, this.fuel + TOP_UP);
    this.terrain = generateTerrain(this.rough, this.padCount);
    this.beginDescent();
  }

  private crash() {
    const l = this.lander;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 120;
      this.bits.push({ x: l.x, y: l.y, vx: Math.cos(a) * sp + l.vx * 0.3, vy: Math.sin(a) * sp - 60, a, spin: (Math.random() - 0.5) * 8 });
    }
    this.host.audio.tone(90, { type: 'sawtooth', dur: 0.4, vol: 0.08, slideTo: 40 });
    this.gameOver('crash');
  }

  private gameOver(end: End) {
    this.phase = 'over';
    this.end = end;
    const record = this.host.submitScore(this.score);
    this.emitHud();
    this.host.setOverlay({
      variant: 'lose',
      kicker: end === 'crash' ? 'Crashed' : 'Tank dry',
      title: `Chain of ${this.chain}`,
      subtitle: end === 'dry' ? 'You stuck the landing — with nothing left to lift off.' : undefined,
      bigStat: {
        label: 'Score',
        value: fmt(this.score),
        note: record && this.score > this.bestBefore ? '★ New best!' : undefined,
      },
      buttons: [
        { action: 'start', label: 'Fly again', primary: true },
        { action: 'menu', label: 'Title', ghost: true },
      ],
    });
  }

  onKey(code: string, down: boolean) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  onAction(action: string) {
    if (action === 'start') this.startGame();
    else if (action === 'next') this.nextDescent();
    else if (action === 'menu') this.showMenu();
  }

  onPause() {
    this.keys.clear();
  }

  update(dt: number) {
    for (const b of this.bits) {
      b.vy += this.gravity * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.a += b.spin * dt;
      const floor = groundAt(this.terrain, Math.min(Math.max(b.x, 0), WIDTH));
      if (b.y > floor) {
        b.y = floor;
        b.vx *= 0.5;
        b.vy *= -0.3;
        b.spin *= 0.5;
      }
    }
    if (this.phase !== 'flying') return;

    const l = this.lander;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) l.a -= TURN * dt;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) l.a += TURN * dt;
    l.a = Math.atan2(Math.sin(l.a), Math.cos(l.a));

    // Semi-implicit Euler: velocity first, then position from the new velocity.
    let ax = 0;
    let ay = this.gravity;
    if (this.thrusting()) {
      const burn = Math.min(this.fuel, BURN * dt);
      const k = burn / (BURN * dt);
      this.fuel = Math.max(0, this.fuel - burn);
      ax += Math.sin(l.a) * THRUST * k;
      ay -= Math.cos(l.a) * THRUST * k;
      this.rumbleClock -= dt;
      if (this.rumbleClock <= 0) {
        this.rumbleClock = 0.09;
        this.host.audio.tone(52 + Math.random() * 12, { type: 'square', dur: 0.11, vol: 0.025 });
      }
    }
    l.vx += ax * dt;
    l.vy += ay * dt;
    l.x += l.vx * dt;
    l.y += l.vy * dt;
    if (l.x < 14 || l.x > WIDTH - 14) {
      l.x = Math.min(Math.max(l.x, 14), WIDTH - 14);
      l.vx = 0;
    }

    if (this.hull().some(([x, y]) => y >= groundAt(this.terrain, x))) {
      this.touchdown();
      return;
    }
    this.hudClock -= dt;
    if (this.hudClock <= 0) {
      this.hudClock = 0.1;
      this.emitHud();
    }
  }

  render() {
    const g = this.g;
    const H = this.design.height;
    g.fillStyle = '#03040a';
    g.fillRect(0, 0, WIDTH, H);
    g.fillStyle = '#64748b';
    for (const [x, y] of this.stars) g.fillRect(x, y, 1.5, 1.5);

    const ys = this.terrain.ys;
    g.beginPath();
    g.moveTo(0, H);
    for (let i = 0; i < POINTS; i++) g.lineTo(i * STEP, ys[i]);
    g.lineTo(WIDTH, H);
    g.closePath();
    g.fillStyle = '#0b1220';
    g.fill();
    g.beginPath();
    for (let i = 0; i < POINTS; i++) {
      if (i === 0) g.moveTo(0, ys[0]);
      else g.lineTo(i * STEP, ys[i]);
    }
    g.strokeStyle = '#94a3b8';
    g.lineWidth = 1.5;
    g.lineJoin = 'round';
    g.stroke();

    g.font = 'bold 13px monospace';
    g.textAlign = 'center';
    for (const p of this.terrain.pads) {
      g.strokeStyle = '#fbbf24';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(p.x0, p.y);
      g.lineTo(p.x1, p.y);
      g.stroke();
      g.fillStyle = '#fbbf24';
      g.fillText(`×${p.mult}`, (p.x0 + p.x1) / 2, Math.min(p.y + 18, FLOOR_Y + 16));
    }

    g.strokeStyle = '#e2e8f0';
    g.lineWidth = 1.5;
    for (const b of this.bits) {
      g.beginPath();
      g.moveTo(b.x - Math.cos(b.a) * 5, b.y - Math.sin(b.a) * 5);
      g.lineTo(b.x + Math.cos(b.a) * 5, b.y + Math.sin(b.a) * 5);
      g.stroke();
    }
    if (this.end !== 'crash') this.drawLander();
  }

  private drawLander() {
    const g = this.g;
    const l = this.lander;
    g.save();
    g.translate(l.x, l.y);
    g.rotate(l.a);
    g.strokeStyle = '#e2e8f0';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(-7, -4);
    g.lineTo(-9, -10);
    g.lineTo(-4, -15);
    g.lineTo(4, -15);
    g.lineTo(9, -10);
    g.lineTo(7, -4);
    g.closePath();
    g.stroke();
    g.strokeRect(-9, -4, 18, 8);
    g.beginPath();
    g.moveTo(-6, 4);
    g.lineTo(-12, FOOT);
    g.moveTo(6, 4);
    g.lineTo(12, FOOT);
    g.moveTo(-15, FOOT);
    g.lineTo(-9, FOOT);
    g.moveTo(9, FOOT);
    g.lineTo(15, FOOT);
    g.stroke();
    if (this.thrusting()) {
      g.strokeStyle = '#fb923c';
      g.beginPath();
      g.moveTo(-4, 5);
      g.lineTo(0, 12 + Math.random() * 10);
      g.lineTo(4, 5);
      g.stroke();
    }
    g.restore();
  }
}
