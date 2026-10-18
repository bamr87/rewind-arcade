import type { GameContext, GameInstance, PointerInfo } from '../../engine/types';
import { cfgBool, cfgInt, clamp, fmt } from '../../engine/util';

type Phase = 'menu' | 'playing' | 'summary' | 'over';

export const GROUND = 560;
/** Clicks below this line are not "sky" and never fire. */
export const SKY_FLOOR = 510;
export const SILO_X = [70, 400, 730];
export const CITY_X = [150, 220, 290, 510, 580, 650];
export const WARHEAD_POINTS = 25;
export const CITY_BONUS = 100;
export const AMMO_BONUS = 5;
/** Counter-missile speed in px/s. */
const MISSILE_SPEED = 520;
/** Blast envelope: grow, hold, shrink (seconds) up to BLAST_R px. */
export const BLAST_R = 40;
const GROW = 0.45;
const HOLD = 0.25;
const SHRINK = 0.45;
const CHAIN_R = 0.6;
const RETICLE_SPEED = 420;

interface Warhead { x0: number; y0: number; x: number; y: number; tx: number; vx: number; vy: number; target: number; }
interface Missile { x: number; y: number; sx: number; sy: number; tx: number; ty: number; }
interface Blast { x: number; y: number; t: number; scale: number; }

/** End-of-wave bonus for `cities` standing and `ammo` unused, at multiplier `mult`. */
export function waveBonus(cities: number, ammo: number, mult: number): number {
  return (CITY_BONUS * cities + AMMO_BONUS * ammo) * mult;
}

/** The silo with ammo nearest in x to `x`; ties go to the left silo. -1 if none. */
export function pickSilo(ammo: number[], x: number): number {
  let best = -1;
  for (let i = 0; i < SILO_X.length; i++) {
    if (ammo[i] <= 0) continue;
    if (best < 0 || Math.abs(SILO_X[i] - x) < Math.abs(SILO_X[best] - x)) best = i;
  }
  return best;
}

export class SiloSentinel implements GameInstance {
  readonly design = { width: 800, height: 600 };

  private host: GameContext;
  private g: CanvasRenderingContext2D;
  private startWave: number;
  private ammoPerSilo: number;
  private speed: number;
  private windOn: boolean;

  private phase: Phase = 'menu';
  private wave = 1;
  private mult = 1;
  private score = 0;
  private cities: boolean[] = CITY_X.map(() => true);
  private ammo: number[] = SILO_X.map(() => 0);
  private warheads: Warhead[] = [];
  private missiles: Missile[] = [];
  private blasts: Blast[] = [];
  private queue: number[] = [];
  private clock = 0;
  private wind = 0;
  private reticle = { x: 400, y: 260 };
  private keys = new Set<string>();
  private bestBefore = 0;

  constructor(ctx: GameContext) {
    this.host = ctx;
    this.g = ctx.ctx;
    this.startWave = cfgInt(ctx.config.startWave, 1);
    this.ammoPerSilo = cfgInt(ctx.config.ammo, 10);
    this.speed = cfgInt(ctx.config.speed, 100) / 100;
    this.windOn = cfgBool(ctx.config.wind, false);
    this.showMenu();
  }

  /** Plain-data view of the session, for the headless checks and `?debug=1`. */
  snapshot() {
    return {
      phase: this.phase, wave: this.wave, mult: this.mult, score: this.score, wind: this.wind,
      cities: this.cities.filter(Boolean).length, ammo: this.ammo.slice(),
      warheads: this.warheads.length, pending: this.queue.length,
      missiles: this.missiles.map((m) => ({ ...m })), blasts: this.blasts.map((b) => ({ ...b })),
    };
  }

  private showMenu() {
    this.phase = 'menu';
    this.warheads = [];
    this.missiles = [];
    this.blasts = [];
    this.cities = CITY_X.map(() => true);
    this.ammo = SILO_X.map(() => this.ammoPerSilo);
    this.host.setHud({ badge: 'DEFENCE', stats: [{ label: 'Score', value: '0' }] });
    this.host.setOverlay({
      variant: 'menu',
      title: 'SILO SENTINEL',
      subtitle: 'Six cities, three silos, and the sky is falling.',
      bullets: [
        { icon: '🎯', text: 'Click or tap the sky: the nearest silo with ammo fires a counter-blast there.' },
        { icon: '⌨', text: 'Or move the crosshair with ← → ↑ ↓ / WASD and fire with F or K.' },
        { icon: '🏙', text: 'Cities standing at the end of a wave become the next wave\'s multiplier.' },
      ],
      buttons: [{ action: 'start', label: 'Defend', primary: true }],
    });
  }

  private startGame() {
    this.score = 0;
    this.wave = this.startWave;
    this.mult = 1;
    this.cities = CITY_X.map(() => true);
    this.bestBefore = this.host.getBest();
    this.beginWave();
  }

  private beginWave() {
    this.ammo = SILO_X.map(() => this.ammoPerSilo);
    this.warheads = [];
    this.missiles = [];
    this.blasts = [];
    this.clock = 0;
    const count = 8 + this.wave * 2;
    const span = 6 + this.wave * 0.8;
    this.queue = Array.from({ length: count }, (_, i) => 0.6 + (i / count) * span + Math.random() * 0.8).sort((a, b) => a - b);
    this.wind = this.windOn ? (Math.random() < 0.5 ? -1 : 1) * (20 + Math.random() * 25) : 0;
    this.phase = 'playing';
    this.host.setOverlay(null);
    this.emitHud();
  }

  private emitHud() {
    const stats = [
      { label: 'Score', value: fmt(this.score), accent: true },
      { label: 'Wave', value: String(this.wave) },
      { label: '×Mult', value: `×${this.mult}` },
      { label: 'Best', value: fmt(Math.max(this.host.getBest(), this.score)) },
      { label: 'Ammo', value: this.ammo.join(' · ') },
    ];
    if (this.windOn) stats.push({ label: 'Wind', value: `${this.wind < 0 ? '←' : '→'} ${fmt(Math.abs(this.wind))}` });
    this.host.setHud({ badge: `WAVE ${this.wave}`, stats });
  }

  /** Launch from the nearest silo with ammo toward (x, y). Returns the silo, or -1. */
  private fire(x: number, y: number): number {
    if (this.phase !== 'playing') return -1;
    const ty = Math.min(y, SKY_FLOOR);
    const s = pickSilo(this.ammo, x);
    if (s < 0) {
      this.host.audio.tone(140, { type: 'square', dur: 0.05, vol: 0.03 });
      return -1;
    }
    this.ammo[s]--;
    this.missiles.push({ x: SILO_X[s], y: GROUND - 18, sx: SILO_X[s], sy: GROUND - 18, tx: clamp(x, 0, 800), ty });
    this.host.audio.tone(660, { type: 'square', dur: 0.06, vol: 0.04, slideTo: 990 });
    this.emitHud();
    return s;
  }

  private spawnWarhead() {
    const x0 = 20 + Math.random() * 760;
    // Aim at a city or a silo, standing or not.
    const target = Math.floor(Math.random() * (CITY_X.length + SILO_X.length));
    const tx = target < CITY_X.length ? CITY_X[target] : SILO_X[target - CITY_X.length];
    const sp = (36 + this.wave * 6) * this.speed;
    const len = Math.hypot(tx - x0, GROUND);
    this.warheads.push({ x0, y0: 0, x: x0, y: 0, tx, vx: ((tx - x0) / len) * sp, vy: (GROUND / len) * sp, target });
  }

  private blastRadius(b: Blast): number {
    const r = BLAST_R * b.scale;
    if (b.t < GROW) return r * (b.t / GROW);
    if (b.t < GROW + HOLD) return r;
    return r * Math.max(0, 1 - (b.t - GROW - HOLD) / SHRINK);
  }

  private impact(w: Warhead) {
    this.blasts.push({ x: w.x, y: GROUND - 6, t: GROW * 0.5, scale: CHAIN_R });
    this.host.audio.tone(80, { type: 'sawtooth', dur: 0.3, vol: 0.07, slideTo: 40 });
    if (w.target < CITY_X.length) this.cities[w.target] = false;
    else this.ammo[w.target - CITY_X.length] = 0;
    this.emitHud();
    if (!this.cities.some(Boolean)) this.gameOver();
  }

  private endWave() {
    const k = this.cities.filter(Boolean).length;
    const a = this.ammo.reduce((s, n) => s + n, 0);
    const bonus = waveBonus(k, a, this.mult);
    this.score += bonus;
    const next = Math.max(1, k);
    this.phase = 'summary';
    this.emitHud();
    this.host.audio.arp([523, 659, 784], { type: 'triangle', dur: 0.1, vol: 0.05, gap: 0.08 });
    this.host.setOverlay({
      variant: 'win',
      kicker: `Wave ${this.wave} held`,
      title: `${k} ${k === 1 ? 'city' : 'cities'} standing`,
      rows: [
        { label: `Cities ${k} × ${CITY_BONUS}`, value: fmt(CITY_BONUS * k) },
        { label: `Unused ammo ${a} × ${AMMO_BONUS}`, value: fmt(AMMO_BONUS * a) },
        { label: 'Multiplier', value: `×${this.mult}` },
        { label: 'Wave bonus', value: `+${fmt(bonus)}`, highlight: true },
        { label: 'Next wave multiplier', value: `×${next}` },
      ],
      bigStat: { label: 'Score', value: fmt(this.score) },
      buttons: [{ action: 'next', label: 'Next wave', primary: true }],
    });
    this.mult = next;
  }

  private nextWave() {
    if (this.phase !== 'summary') return;
    this.wave++;
    this.beginWave();
  }

  private gameOver() {
    this.phase = 'over';
    const record = this.host.submitScore(this.score);
    this.emitHud();
    this.host.setOverlay({
      variant: 'lose',
      kicker: 'The last city fell',
      title: `Wave ${this.wave}`,
      bigStat: {
        label: 'Score',
        value: fmt(this.score),
        note: record && this.score > this.bestBefore ? '★ New best!' : undefined,
      },
      buttons: [
        { action: 'start', label: 'Defend again', primary: true },
        { action: 'menu', label: 'Title', ghost: true },
      ],
    });
  }

  onPointerDown(p: PointerInfo) {
    this.reticle.x = p.x;
    this.reticle.y = p.y;
    if (p.y < SKY_FLOOR) this.fire(p.x, p.y);
  }

  onPointerMove(p: PointerInfo) {
    this.reticle.x = p.x;
    this.reticle.y = p.y;
  }

  onKey(code: string, down: boolean) {
    const isFire = code === 'KeyF' || code === 'KeyK';
    // Keyboard auto-repeat reaches the game; one press is one shot.
    if (isFire && down && !this.keys.has(code)) this.fire(this.reticle.x, this.reticle.y);
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  onAction(action: string) {
    if (action === 'start') this.startGame();
    else if (action === 'next') this.nextWave();
    else if (action === 'menu') this.showMenu();
  }

  onPause() {
    this.keys.clear();
  }

  update(dt: number) {
    if (this.phase !== 'playing') return;
    const k = this.keys;
    const dx = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
    const dy = (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0) - (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0);
    this.reticle.x = clamp(this.reticle.x + dx * RETICLE_SPEED * dt, 0, 800);
    this.reticle.y = clamp(this.reticle.y + dy * RETICLE_SPEED * dt, 0, SKY_FLOOR - 1);

    this.clock += dt;
    while (this.queue.length && this.queue[0] <= this.clock) {
      this.queue.shift();
      this.spawnWarhead();
    }

    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.tx += this.wind * dt;
      const ddx = m.tx - m.x;
      const ddy = m.ty - m.y;
      const d = Math.hypot(ddx, ddy);
      const stepLen = MISSILE_SPEED * dt;
      if (d <= stepLen) {
        this.missiles.splice(i, 1);
        this.blasts.push({ x: m.tx, y: m.ty, t: 0, scale: 1 });
        this.host.audio.tone(220, { type: 'triangle', dur: 0.18, vol: 0.05, slideTo: 110 });
      } else {
        m.x += (ddx / d) * stepLen;
        m.y += (ddy / d) * stepLen;
      }
    }

    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      b.t += dt;
      b.x += this.wind * dt;
      if (b.t >= GROW + HOLD + SHRINK) this.blasts.splice(i, 1);
    }

    for (let i = this.warheads.length - 1; i >= 0; i--) {
      const w = this.warheads[i];
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      const hit = this.blasts.find((b) => {
        const r = this.blastRadius(b);
        return (w.x - b.x) ** 2 + (w.y - b.y) ** 2 <= r * r;
      });
      if (hit) {
        this.warheads.splice(i, 1);
        this.score += WARHEAD_POINTS * this.mult;
        // A destroyed warhead bursts too, so blasts can chain.
        this.blasts.push({ x: w.x, y: w.y, t: 0, scale: CHAIN_R });
        this.host.audio.tone(320 + Math.random() * 80, { type: 'square', dur: 0.06, vol: 0.04 });
        this.emitHud();
      } else if (w.y >= GROUND) {
        this.warheads.splice(i, 1);
        this.impact(w);
        if (this.phase !== 'playing') return;
      }
    }

    if (!this.queue.length && !this.warheads.length && !this.missiles.length && !this.blasts.length) this.endWave();
  }

  render() {
    const g = this.g;
    const W = this.design.width;
    const H = this.design.height;
    g.fillStyle = '#04030f';
    g.fillRect(0, 0, W, H);

    g.fillStyle = '#3f2a14';
    g.fillRect(0, GROUND, W, H - GROUND);
    g.fillStyle = '#a16207';
    g.fillRect(0, GROUND, W, 3);

    this.cities.forEach((up, i) => {
      const x = CITY_X[i];
      if (up) {
        g.fillStyle = '#22d3ee';
        g.fillRect(x - 18, GROUND - 12, 10, 12);
        g.fillRect(x - 6, GROUND - 20, 10, 20);
        g.fillRect(x + 6, GROUND - 14, 12, 14);
      } else {
        g.fillStyle = '#44403c';
        g.fillRect(x - 18, GROUND - 4, 36, 4);
      }
    });
    g.font = 'bold 11px monospace';
    g.textAlign = 'center';
    SILO_X.forEach((x, i) => {
      g.fillStyle = this.ammo[i] > 0 ? '#a16207' : '#57534e';
      g.beginPath();
      g.moveTo(x - 26, GROUND);
      g.lineTo(x - 12, GROUND - 18);
      g.lineTo(x + 12, GROUND - 18);
      g.lineTo(x + 26, GROUND);
      g.closePath();
      g.fill();
      g.fillStyle = '#fef3c7';
      g.fillText(String(this.ammo[i]), x, GROUND + 18);
    });

    g.lineWidth = 1.5;
    for (const w of this.warheads) {
      g.strokeStyle = 'rgba(248,113,113,0.7)';
      g.beginPath();
      g.moveTo(w.x0, w.y0);
      g.lineTo(w.x, w.y);
      g.stroke();
      g.fillStyle = '#fecaca';
      g.fillRect(w.x - 1.5, w.y - 1.5, 3, 3);
    }
    for (const m of this.missiles) {
      g.strokeStyle = 'rgba(134,239,172,0.8)';
      g.beginPath();
      g.moveTo(m.sx, m.sy);
      g.lineTo(m.x, m.y);
      g.stroke();
      g.strokeStyle = '#86efac';
      g.beginPath();
      g.moveTo(m.tx - 4, m.ty - 4);
      g.lineTo(m.tx + 4, m.ty + 4);
      g.moveTo(m.tx + 4, m.ty - 4);
      g.lineTo(m.tx - 4, m.ty + 4);
      g.stroke();
    }
    for (const b of this.blasts) {
      const r = this.blastRadius(b);
      if (r <= 0) continue;
      g.fillStyle = Math.floor(b.t * 20) % 2 ? 'rgba(253,224,71,0.85)' : 'rgba(251,146,60,0.85)';
      g.beginPath();
      g.arc(b.x, b.y, r, 0, Math.PI * 2);
      g.fill();
    }

    if (this.phase === 'playing') {
      const { x, y } = this.reticle;
      g.strokeStyle = '#e2e8f0';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x - 10, y);
      g.lineTo(x - 3, y);
      g.moveTo(x + 3, y);
      g.lineTo(x + 10, y);
      g.moveTo(x, y - 10);
      g.lineTo(x, y - 3);
      g.moveTo(x, y + 3);
      g.lineTo(x, y + 10);
      g.stroke();
    }
  }
}
