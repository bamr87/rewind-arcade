import type { GameContext, GameInstance } from '../../engine/types';
import { cfgInt, cfgStr, clamp, fmt } from '../../engine/util';

type Phase = 'menu' | 'aim' | 'flight' | 'boom' | 'round' | 'over';
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const W = 800;
export const H = 500;
/** Ballistics run on a fixed step so a flight is identical at any frame rate — and to the CPU's simulation. */
export const STEP = 1 / 240;
/** Design pixels per metre, so `gravity` reads in m/s² like the original prompt. */
const PX_PER_M = 30;
const SPEED_PER_POWER = 7;
/** Sideways acceleration per unit of wind, px/s². */
const WIND_ACCEL = 8;
const MAX_FLIGHT = 20;
export const BLAST_R = 22;
export const GOR_HALF = 14;
export const GOR_H = 30;
/** The thrower cannot hit itself in the first moments of a throw. */
const SELF_GRACE = 0.25;
const SKY = '#0b1a3a';
const BUILDING_COLORS = ['#b91c1c', '#0e7490', '#6b7280'];

export interface Building { x: number; w: number; h: number; color: string; lit: boolean[]; }
export interface Gorilla { x: number; y: number; }
interface Shot { x: number; y: number; vx: number; vy: number; t: number; owner: number; }
export interface Outcome { kind: 'building' | 'gorilla' | 'away'; x: number; y: number; who?: number; }
interface Crater { x: number; y: number; r: number; }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; }
interface Aim { angle: number; power: number; }

const ANGLE_UP = ['ArrowUp', 'KeyW'];
const ANGLE_DOWN = ['ArrowDown', 'KeyS'];
const POWER_UP = ['ArrowRight', 'KeyD'];
const POWER_DOWN = ['ArrowLeft', 'KeyA'];

export class BananaBarrage implements GameInstance {
  readonly design = { width: W, height: H };

  private host: GameContext;
  private g: CanvasRenderingContext2D;
  private mode: 'ai' | 'two';
  private ai: number;
  private rounds: number;
  private windMax: number;
  private gravity: number;
  /** Swappable so the headless checks can seed skylines, wind and CPU error. */
  private rng: () => number = Math.random;

  private phase: Phase = 'menu';
  private mask = new Uint8Array(W * H);
  private buildings: Building[] = [];
  private gorillas: Gorilla[] = [];
  private craters: Crater[] = [];
  private sparks: Spark[] = [];
  private layer: OffscreenCanvas | null = null;
  private layerDirty = true;

  private round = 0;
  private wins = [0, 0];
  private throws = [0, 0];
  private totalThrows = 0;
  private turn = 0;
  private wind = 0;
  private aim: Aim[] = [{ angle: 45, power: 50 }, { angle: 45, power: 50 }];
  private shot: Shot | null = null;
  private acc = 0;
  private timer = 0;
  private cpuT = 0;
  private boom: { x: number; y: number; t: number } | null = null;
  private roundWinner = 0;
  private score = 0;
  private best = 0;
  private bestBefore = 0;
  private submitted = false;
  private keys = new Set<string>();
  private heldFor = new Map<string, number>();
  private hudKey = '';

  constructor(ctx: GameContext) {
    this.host = ctx;
    this.g = ctx.ctx;
    this.mode = cfgStr(ctx.config.mode, 'ai') === 'two' ? 'two' : 'ai';
    this.ai = clamp(cfgInt(ctx.config.ai, 70), 30, 100);
    this.rounds = clamp(cfgInt(ctx.config.rounds, 3), 1, 9);
    this.windMax = clamp(cfgInt(ctx.config.wind, 5), 0, 10);
    this.gravity = clamp(cfgInt(ctx.config.gravity, 10), 5, 20);
    // An offscreen layer caches the skyline between explosions; without one (headless) it is drawn directly.
    if (typeof OffscreenCanvas === 'function') this.layer = new OffscreenCanvas(W * 2, H * 2);
    this.showMenu();
  }

  private showMenu() {
    this.phase = 'menu';
    this.buildSkyline();
    this.emitHud();
    this.host.setOverlay({
      variant: 'menu',
      title: 'BANANA BARRAGE',
      subtitle: this.mode === 'ai' ? 'Two gorillas, one skyline. The one on the right is the house.' : 'Two gorillas, one skyline, one keyboard.',
      bullets: [
        { icon: '↕', text: '↑ ↓ or W S set the angle; ← → or A D set the power.' },
        { icon: '🍌', text: 'Throw with F or K. Space pauses — it never throws.' },
        { icon: '💥', text: 'Every blast carves the buildings for the rest of the round. Mind the wind.' },
        { icon: '★', text: 'A round won scores 1000, plus up to 500 for fewer throws. The match adds 250.' },
      ],
      buttons: [{ action: 'start', label: 'Start the match', primary: true }],
    });
  }

  private startMatch() {
    this.round = 0;
    this.wins = [0, 0];
    this.totalThrows = 0;
    this.score = 0;
    this.submitted = false;
    this.bestBefore = this.host.getBest();
    this.best = this.bestBefore;
    this.host.setOverlay(null);
    this.startRound();
  }

  private startRound() {
    this.buildSkyline();
    this.throws = [0, 0];
    this.aim = [{ angle: 45, power: 50 }, { angle: 45, power: 50 }];
    this.shot = null;
    this.boom = null;
    this.sparks = [];
    this.turn = this.round % 2;
    this.beginTurn();
  }

  /* ------------------------------- skyline ------------------------------- */

  private buildSkyline() {
    const r = this.rng;
    const bs: Building[] = [];
    let x = 0;
    while (x < W) {
      let w = 50 + Math.floor(r() * 60);
      if (W - (x + w) < 50) w = W - x;
      const h = 90 + Math.floor(r() * 230);
      const lit: boolean[] = [];
      for (let i = 0; i < 200; i++) lit.push(r() < 0.7);
      bs.push({ x, w, h, color: BUILDING_COLORS[Math.floor(r() * BUILDING_COLORS.length)], lit });
      x += w + 2;
    }
    // The gorillas' own rooftops are kept low enough to throw from.
    for (const i of [1, bs.length - 2]) bs[i].h = Math.min(bs[i].h, 240);
    this.buildings = bs;
    this.gorillas = [1, bs.length - 2].map((i) => ({ x: bs[i].x + bs[i].w / 2, y: H - bs[i].h }));

    const m = new Uint8Array(W * H);
    for (const b of bs) {
      for (let y = H - b.h; y < H; y++) m.fill(1, y * W + b.x, y * W + Math.min(W, b.x + b.w));
    }
    this.mask = m;
    this.craters = [];
    this.layerDirty = true;
    const v = this.windMax ? Math.round((r() * 2 - 1) * this.windMax) : 0;
    this.wind = v === 0 ? 0 : v; // never -0
  }

  /** Blast a circular hole out of the buildings; it stays for the rest of the round. */
  private carve(cx: number, cy: number, rad = BLAST_R) {
    const x0 = Math.max(0, Math.floor(cx - rad));
    const x1 = Math.min(W - 1, Math.ceil(cx + rad));
    const y0 = Math.max(0, Math.floor(cy - rad));
    const y1 = Math.min(H - 1, Math.ceil(cy + rad));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) this.mask[y * W + x] = 0;
      }
    }
    this.craters.push({ x: cx, y: cy, r: rad });
    this.layerDirty = true;
  }

  /* ------------------------------ ballistics ----------------------------- */

  private launch(owner: number, angle: number, power: number): Shot {
    const g = this.gorillas[owner];
    const dir = owner === 0 ? 1 : -1;
    const a = (clamp(angle, 0, 90) * Math.PI) / 180;
    const v = clamp(power, 1, 100) * SPEED_PER_POWER;
    return { x: g.x + dir * (GOR_HALF - 2), y: g.y - GOR_H - 4, vx: Math.cos(a) * v * dir, vy: -Math.sin(a) * v, t: 0, owner };
  }

  /** One fixed ballistic step. Returns how the shot ended, or null while it is still flying. */
  private advance(s: Shot): Outcome | null {
    s.vx += this.wind * WIND_ACCEL * STEP;
    s.vy += this.gravity * PX_PER_M * STEP;
    s.x += s.vx * STEP;
    s.y += s.vy * STEP;
    s.t += STEP;
    for (let i = 0; i < 2; i++) {
      if (i === s.owner && s.t < SELF_GRACE) continue;
      const g = this.gorillas[i];
      if (Math.abs(s.x - g.x) <= GOR_HALF && s.y >= g.y - GOR_H && s.y <= g.y) return { kind: 'gorilla', x: s.x, y: s.y, who: i };
    }
    if (s.x < -60 || s.x > W + 60 || s.y >= H || s.t > MAX_FLIGHT) return { kind: 'away', x: s.x, y: s.y };
    const px = Math.floor(s.x);
    const py = Math.floor(s.y);
    if (px >= 0 && px < W && py >= 0 && this.mask[py * W + px]) return { kind: 'building', x: s.x, y: s.y };
    return null;
  }

  /** Where a throw would end against the current skyline and wind, without throwing it. */
  simulate(owner: number, angle: number, power: number): Outcome {
    const s = this.launch(owner, angle, power);
    for (;;) {
      const out = this.advance(s);
      if (out) return out;
    }
  }

  /** The CPU's search: a throw that hits the other gorilla if one exists, else the closest miss. */
  solve(owner: number): Aim & { hit: boolean } {
    const target = this.gorillas[1 - owner];
    let near = { angle: 45, power: 50, d: Infinity };
    for (let k = 0; k <= 28; k++) {
      // Search outward from 50° so the chosen arc is a comfortable lob.
      const angle = 50 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 2.5;
      if (angle < 10 || angle > 85) continue;
      const hits: number[] = [];
      for (let power = 15; power <= 100; power++) {
        const out = this.simulate(owner, angle, power);
        if (out.kind === 'gorilla' && out.who === 1 - owner) hits.push(power);
        else if (out.kind !== 'gorilla') {
          const d = Math.hypot(out.x - target.x, out.y - (target.y - GOR_H / 2));
          if (d < near.d) near = { angle, power, d };
        }
      }
      // The middle of the hitting band leaves the most room for error.
      if (hits.length) return { angle, power: hits[Math.floor(hits.length / 2)], hit: true };
    }
    return { angle: near.angle, power: near.power, hit: false };
  }

  private throwBanana() {
    const a = this.aim[this.turn];
    this.shot = this.launch(this.turn, a.angle, a.power);
    this.throws[this.turn]++;
    this.totalThrows++;
    this.acc = 0;
    this.phase = 'flight';
    this.host.audio.tone(300, { type: 'triangle', dur: 0.15, vol: 0.04, slideTo: 600 });
    this.emitHud();
  }

  private resolve(out: Outcome) {
    this.shot = null;
    if (out.kind === 'away') {
      this.phase = 'boom';
      this.timer = 0.4;
      return;
    }
    this.boom = { x: out.x, y: out.y, t: 0 };
    this.burst(out.x, out.y, out.kind === 'gorilla' ? 40 : 18);
    if (out.kind === 'building') {
      this.carve(out.x, out.y);
      this.host.audio.tone(120, { type: 'sawtooth', dur: 0.3, vol: 0.06, slideTo: 40 });
      this.phase = 'boom';
      this.timer = 0.6;
      return;
    }
    // A gorilla was hit — the other one takes the round (a self-hit counts for the opponent).
    const winner = 1 - (out.who ?? 0);
    this.carve(out.x, out.y, BLAST_R * 1.4);
    this.host.audio.tone(80, { type: 'sawtooth', dur: 0.6, vol: 0.08, slideTo: 30 });
    this.endRound(winner);
  }

  private endRound(winner: number) {
    this.wins[winner]++;
    this.roundWinner = winner;
    if (winner === 0) this.score += 1000 + Math.max(0, 500 - 100 * (this.throws[0] - 1));
    this.best = Math.max(this.best, this.score);
    this.phase = 'round';
    this.timer = 1.8;
    this.host.audio.arp(winner === 0 ? [392, 523, 659] : [330, 262, 196], { type: 'square', dur: 0.12, vol: 0.04, gap: 0.1, delay: 0.3 });
    this.emitHud();
  }

  private endMatch() {
    const won = this.wins[0] >= this.rounds;
    if (won) this.score += 250;
    this.phase = 'over';
    this.best = Math.max(this.best, this.score);
    const record = this.submitted ? false : this.host.submitScore(this.score);
    this.submitted = true;
    const two = this.mode === 'two';
    this.host.setOverlay({
      variant: won ? 'win' : 'lose',
      kicker: two ? (won ? 'Player 1 wins' : 'Player 2 wins') : won ? 'Match won' : 'Match lost',
      title: won ? 'King of the skyline' : two ? 'The right side holds' : 'The house gorilla wins',
      rows: [
        { label: 'Rounds', value: `${this.wins[0]} – ${this.wins[1]}` },
        { label: 'Throws', value: fmt(this.totalThrows) },
      ],
      bigStat: {
        label: 'Score',
        value: fmt(this.score),
        note: record && this.score > this.bestBefore ? '★ New best!' : undefined,
      },
      buttons: [
        { action: 'start', label: 'Rematch', primary: true },
        { action: 'menu', label: 'Title', ghost: true },
      ],
    });
    this.emitHud();
  }

  private beginTurn() {
    this.phase = 'aim';
    this.cpuT = 0.9;
    this.emitHud();
  }

  private cpuTurn(): boolean {
    return this.mode === 'ai' && this.turn === 1;
  }

  private humanTurn(): boolean {
    return this.phase === 'aim' && !this.cpuTurn();
  }

  private cpuThrow() {
    const plan = this.solve(1);
    const e = (100 - this.ai) / 100;
    this.aim[1] = {
      angle: clamp(plan.angle + (this.rng() * 2 - 1) * e * 20, 5, 89),
      power: clamp(plan.power + (this.rng() * 2 - 1) * e * 25, 5, 100),
    };
    this.throwBanana();
  }

  private burst(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 160;
      this.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4 + Math.random() * 0.4 });
    }
  }

  private emitHud() {
    const a = this.aim[this.turn];
    const windText = this.wind === 0 ? 'calm' : `${this.wind < 0 ? '←' : '→'} ${Math.abs(this.wind)}`;
    const model = {
      badge: this.mode === 'ai' ? 'VS CPU' : 'VS P2',
      stats: [
        { label: 'Wind', value: windText },
        { label: 'Angle', value: `${Math.round(a.angle)}°` },
        { label: 'Power', value: String(Math.round(a.power)) },
        { label: 'Rounds', value: `${this.wins[0]}–${this.wins[1]}` },
        { label: 'Score', value: fmt(this.score), accent: true },
      ],
      progress: { value: a.power / 100, label: this.turn === 0 ? 'P1 power' : this.mode === 'ai' ? 'CPU power' : 'P2 power' },
    };
    const key = JSON.stringify(model);
    if (key === this.hudKey) return;
    this.hudKey = key;
    this.host.setHud(model);
  }

  /* -------------------------------- input -------------------------------- */

  private adjust(code: string, amount: number) {
    const a = this.aim[this.turn];
    if (ANGLE_UP.includes(code)) a.angle = clamp(a.angle + amount, 0, 90);
    else if (ANGLE_DOWN.includes(code)) a.angle = clamp(a.angle - amount, 0, 90);
    else if (POWER_UP.includes(code)) a.power = clamp(a.power + amount, 1, 100);
    else if (POWER_DOWN.includes(code)) a.power = clamp(a.power - amount, 1, 100);
    else return;
    this.emitHud();
  }

  onKey(code: string, down: boolean) {
    if (!down) {
      this.keys.delete(code);
      this.heldFor.delete(code);
      return;
    }
    if (this.keys.has(code)) return; // OS auto-repeat; held keys are handled in update()
    this.keys.add(code);
    this.heldFor.set(code, 0);
    if (!this.humanTurn()) return; // the CPU's turn, or a banana in the air
    if (code === 'KeyF' || code === 'KeyK') this.throwBanana();
    else this.adjust(code, 1);
  }

  onAction(action: string) {
    if (action === 'start') this.startMatch();
    else if (action === 'menu') this.showMenu();
  }

  onPause() {
    this.keys.clear();
    this.heldFor.clear();
  }

  /** Plain-data view of the match, for `?debug=1` and the headless play script. */
  snapshot() {
    return {
      phase: this.phase,
      mode: this.mode,
      round: this.round,
      turn: this.turn,
      wins: [...this.wins],
      throws: [...this.throws],
      score: this.score,
      wind: this.wind,
      aim: this.aim.map((a) => ({ ...a })),
      shot: this.shot ? { x: this.shot.x, y: this.shot.y } : null,
      boom: this.boom ? { x: this.boom.x, y: this.boom.y } : null,
      craters: this.craters.length,
      gorillas: this.gorillas.map((g) => ({ ...g })),
    };
  }

  /* -------------------------------- update ------------------------------- */

  update(dt: number) {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 300 * dt;
      if (s.life <= 0) this.sparks.splice(i, 1);
    }
    if (this.boom) {
      this.boom.t += dt;
      if (this.boom.t > 0.5) this.boom = null;
    }

    if (this.phase === 'aim') {
      if (this.cpuTurn()) {
        this.cpuT -= dt;
        if (this.cpuT <= 0) this.cpuThrow();
      } else {
        // Held keys sweep after a short delay: 30°/s and 30 power/s.
        for (const [code, t] of this.heldFor) {
          const held = t + dt;
          this.heldFor.set(code, held);
          if (held > 0.25) this.adjust(code, 30 * dt);
        }
      }
    } else if (this.phase === 'flight' && this.shot) {
      this.acc += dt;
      while (this.acc >= STEP && this.shot) {
        this.acc -= STEP;
        const out = this.advance(this.shot);
        if (out) this.resolve(out);
      }
    } else if (this.phase === 'boom') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.turn = 1 - this.turn;
        this.beginTurn();
      }
    } else if (this.phase === 'round') {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.wins[this.roundWinner] >= this.rounds) this.endMatch();
        else {
          this.round++;
          this.startRound();
        }
      }
    }
  }

  /* -------------------------------- render ------------------------------- */

  private paintSkyline(g: Ctx2D, cutHoles: boolean) {
    for (const b of this.buildings) {
      const top = H - b.h;
      g.fillStyle = b.color;
      g.fillRect(b.x, top, b.w, b.h);
      let i = 0;
      for (let wy = top + 8; wy < H - 12; wy += 20) {
        for (let wx = b.x + 6; wx < b.x + b.w - 8; wx += 14) {
          g.fillStyle = b.lit[i++ % b.lit.length] ? '#fde047' : '#1f2937';
          g.fillRect(wx, wy, 6, 10);
        }
      }
    }
    // Craters: cut out of the cached layer, or painted over in sky when drawing directly.
    if (cutHoles) g.globalCompositeOperation = 'destination-out';
    g.fillStyle = SKY;
    for (const c of this.craters) {
      g.beginPath();
      g.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }

  private drawGorilla(gor: Gorilla, armUp: boolean, flip: boolean) {
    const g = this.g;
    const { x, y } = gor;
    g.fillStyle = '#d97706';
    g.fillRect(x - 9, y - 30, 18, 10); // head
    g.fillRect(x - 12, y - 20, 24, 12); // chest
    g.fillRect(x - 10, y - 8, 8, 8); // legs
    g.fillRect(x + 2, y - 8, 8, 8);
    const side = flip ? -1 : 1;
    // Arms: the throwing arm goes up while it is this gorilla's throw.
    g.fillRect(x - side * 17 - 3, y - 20, 6, 12);
    if (armUp) g.fillRect(x + side * 17 - 3, y - 34, 6, 14);
    else g.fillRect(x + side * 17 - 3, y - 20, 6, 12);
    g.fillStyle = '#7c2d12';
    g.fillRect(x - 6, y - 26, 12, 3); // brow
    g.fillStyle = '#fef3c7';
    g.fillRect(x - 5, y - 23, 3, 2);
    g.fillRect(x + 2, y - 23, 3, 2);
  }

  render() {
    const g = this.g;
    g.fillStyle = SKY;
    g.fillRect(0, 0, W, H);

    // The sun, who is startled by a banana flying past.
    const near = this.shot && Math.hypot(this.shot.x - W / 2, this.shot.y - 44) < 50;
    g.fillStyle = '#facc15';
    g.beginPath();
    g.arc(W / 2, 44, 20, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = SKY;
    g.fillRect(W / 2 - 8, 38, 4, 4);
    g.fillRect(W / 2 + 4, 38, 4, 4);
    g.beginPath();
    if (near) g.arc(W / 2, 52, 5, 0, Math.PI * 2);
    else g.arc(W / 2, 48, 8, 0.15 * Math.PI, 0.85 * Math.PI);
    g.fill();

    if (this.layer) {
      if (this.layerDirty) {
        const lg = this.layer.getContext('2d');
        if (lg) {
          lg.setTransform(2, 0, 0, 2, 0, 0);
          lg.clearRect(0, 0, W, H);
          this.paintSkyline(lg, true);
        }
        this.layerDirty = false;
      }
      g.drawImage(this.layer, 0, 0, W, H);
    } else {
      this.paintSkyline(g, false);
    }

    const aiming = this.phase === 'aim';
    this.gorillas.forEach((gor, i) => this.drawGorilla(gor, aiming && this.turn === i, i === 1));

    // Aim guide for the player whose throw it is.
    if (aiming && this.gorillas.length && !this.cpuTurn()) {
      const a = this.aim[this.turn];
      const s = this.launch(this.turn, a.angle, a.power);
      const len = 20 + a.power * 0.7;
      const sp = Math.hypot(s.vx, s.vy) || 1;
      g.fillStyle = '#f8fafc';
      for (let d = 8; d < len; d += 8) g.fillRect(s.x + (s.vx / sp) * d - 1.5, s.y + (s.vy / sp) * d - 1.5, 3, 3);
    }

    if (this.shot) {
      const s = this.shot;
      g.strokeStyle = '#fde047';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(s.x, s.y, 5, s.t * 12, s.t * 12 + Math.PI);
      g.stroke();
    }

    if (this.boom) {
      const t = this.boom.t / 0.5;
      g.fillStyle = `rgba(251, 146, 60, ${(0.8 * (1 - t)).toFixed(3)})`;
      g.beginPath();
      g.arc(this.boom.x, this.boom.y, BLAST_R * (0.5 + t), 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#fdba74';
    for (const s of this.sparks) g.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);

    // Wind arrow along the street.
    g.strokeStyle = '#e2e8f0';
    g.fillStyle = '#e2e8f0';
    g.lineWidth = 2;
    if (this.wind) {
      const len = this.wind * 10;
      const y = H - 10;
      g.beginPath();
      g.moveTo(W / 2, y);
      g.lineTo(W / 2 + len, y);
      g.stroke();
      const d = Math.sign(len);
      g.beginPath();
      g.moveTo(W / 2 + len + d * 6, y);
      g.lineTo(W / 2 + len, y - 4);
      g.lineTo(W / 2 + len, y + 4);
      g.closePath();
      g.fill();
    }

    if (this.phase === 'round') {
      const who = this.roundWinner === 0 ? 'PLAYER 1' : this.mode === 'ai' ? 'THE CPU' : 'PLAYER 2';
      g.font = '700 16px "Press Start 2P", monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#f8fafc';
      g.fillText(`${who} TAKES THE ROUND`, W / 2, 110);
    }
  }
}
