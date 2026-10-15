import type { GameContext, GameInstance } from '../../engine/types';
import { cfgBool, cfgInt, cfgStr, clamp, fmt } from '../../engine/util';

type Phase = 'menu' | 'playing' | 'storm' | 'over';
type Side = 'L' | 'R';
type TrooperState = 'jump' | 'chute' | 'plummet' | 'landed';

/** Four colours, as a CGA mode would give you: background plus three inks. */
export interface Palette { bg: string; a: string; b: string; c: string; }

export const PALETTES: Record<string, Palette> = {
  // CGA 320×200 palette 1, high intensity: black / cyan / magenta / white.
  cga1: { bg: '#000000', a: '#55ffff', b: '#ff55ff', c: '#ffffff' },
  // CGA palette 0, low intensity: black / green / red / brown.
  cga0: { bg: '#000000', a: '#00aa00', b: '#aa0000', c: '#aa5500' },
  // A green phosphor monitor: black and three greens.
  mono: { bg: '#000000', a: '#1f7a1f', b: '#33cc33', c: '#66ff66' },
};

interface Shot { x: number; y: number; vx: number; vy: number; }
interface Heli { x: number; y: number; vx: number; drops: number[]; t: number; }
interface Trooper { x: number; y: number; vy: number; state: TrooperState; t: number; }
interface Jet { x: number; y: number; vx: number; dropped: boolean; }
interface Bomb { x: number; y: number; vx: number; vy: number; }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; ink: 'b' | 'c'; }

const W = 640;
const H = 400;
const GROUND = 380;
const TX = W / 2;
const BASE_HALF = 22;
const PIVOT_Y = GROUND - 26;
const BARREL = 24;
const SHOT_SPEED = 520;
const FIRE_CD = 0.14;
const CHUTE_SPEED = 42;
const PLUMMET_MAX = 520;
const STORM_AT = 4;
/** Helicopters never drop a trooper this close to the turret, so troopers land beside it. */
const NO_DROP = 60;

export class FlakShack implements GameInstance {
  readonly design = { width: W, height: H };

  private host: GameContext;
  private g: CanvasRenderingContext2D;
  private pal: Palette;
  private spawnRate: number;
  private jetsOn: boolean;

  private phase: Phase = 'menu';
  private angle = -Math.PI / 2;
  private keys = new Set<string>();
  private fireCd = 0;
  private score = 0;
  private best = 0;
  private bestBefore = 0;
  private shotsFired = 0;
  private clock = 0;
  private heliTimer = 0;
  private jetTimer = 0;
  private jetsSeen = 0;
  private stormT = 0;
  private stormSide: Side = 'L';

  private shots: Shot[] = [];
  private helis: Heli[] = [];
  private troopers: Trooper[] = [];
  private jets: Jet[] = [];
  private bombs: Bomb[] = [];
  private sparks: Spark[] = [];

  constructor(ctx: GameContext) {
    this.host = ctx;
    this.g = ctx.ctx;
    this.pal = PALETTES[cfgStr(ctx.config.palette, 'cga1')] ?? PALETTES.cga1;
    this.spawnRate = clamp(cfgInt(ctx.config.spawn, 5), 1, 10);
    this.jetsOn = cfgBool(ctx.config.jets, false);
    this.showMenu();
  }

  private showMenu() {
    this.phase = 'menu';
    this.reset();
    this.host.setHud({ badge: 'CGA', stats: this.stats() });
    this.host.setOverlay({
      variant: 'menu',
      title: 'FLAK SHACK',
      subtitle: 'One gun, a sky full of rotors, and nowhere to retreat.',
      bullets: [
        { icon: '↔', text: 'Rotate the gun with ← → or A D.' },
        { icon: '✦', text: 'Fire with F or K. Space is pause — it never shoots.' },
        { icon: '🪂', text: 'Helicopter +10, trooper +5, every shot −1. Shoot a chute and the trooper drops like a stone.' },
        { icon: '⚠', text: 'Four troopers landed on one side storm the gun.' },
      ],
      buttons: [{ action: 'start', label: 'Man the gun', primary: true }],
    });
  }

  private reset() {
    this.angle = -Math.PI / 2;
    this.score = 0;
    this.shotsFired = 0;
    this.clock = 0;
    this.fireCd = 0;
    this.heliTimer = 1;
    this.jetTimer = this.nextJetDelay();
    this.stormT = 0;
    this.shots = [];
    this.helis = [];
    this.troopers = [];
    this.jets = [];
    this.bombs = [];
    this.sparks = [];
  }

  private startGame() {
    this.reset();
    this.bestBefore = this.host.getBest();
    this.best = this.bestBefore;
    this.phase = 'playing';
    this.host.setOverlay(null);
    this.emitHud();
  }

  /* --------------------------------- scoring -------------------------------- */

  private landed(side: Side): number {
    let n = 0;
    for (const t of this.troopers) if (t.state === 'landed' && this.sideOf(t.x) === side) n++;
    return n;
  }

  private sideOf(x: number): Side {
    return x < TX ? 'L' : 'R';
  }

  private addScore(n: number) {
    this.score = Math.max(0, this.score + n);
    this.best = Math.max(this.best, this.score);
  }

  private stats() {
    return [
      { label: 'Score', value: fmt(this.score) },
      { label: 'Landed L/R', value: `${this.landed('L')}/${this.landed('R')}` },
      { label: 'Best', value: fmt(this.best) },
    ];
  }

  private emitHud() {
    this.host.setHud({ badge: 'CGA', stats: this.stats() });
  }

  /* --------------------------------- spawning ------------------------------- */

  /** Seconds between helicopters: 4.1 s at spawn 1, 1 s at spawn 10, tightening a little over a run. */
  private nextHeliDelay(): number {
    const base = 4.45 - this.spawnRate * 0.345;
    const ramp = Math.max(0.6, 1 - this.clock / 300);
    return base * ramp * (0.75 + Math.random() * 0.5);
  }

  private nextJetDelay(): number {
    return 9 + Math.random() * 7;
  }

  private spawnHeli() {
    const fromLeft = Math.random() < 0.5;
    const lanes = [52, 92, 132];
    const y = lanes[Math.floor(Math.random() * lanes.length)];
    const speed = 90 + Math.random() * 50;
    const drops: number[] = [];
    const count = Math.random() < 0.7 ? 1 : 2;
    while (drops.length < count) {
      const x = 30 + Math.random() * (W - 60);
      if (Math.abs(x - TX) > NO_DROP) drops.push(x);
    }
    this.helis.push({ x: fromLeft ? -30 : W + 30, y, vx: fromLeft ? speed : -speed, drops, t: 0 });
  }

  private spawnJet() {
    const fromLeft = Math.random() < 0.5;
    this.jets.push({ x: fromLeft ? -30 : W + 30, y: 28, vx: fromLeft ? 240 : -240, dropped: false });
    this.jetsSeen++;
    this.host.audio.tone(220, { type: 'sawtooth', dur: 0.5, vol: 0.03, slideTo: 90 });
  }

  /* ---------------------------------- firing -------------------------------- */

  private fire() {
    if (this.phase !== 'playing' || this.fireCd > 0) return;
    this.fireCd = FIRE_CD;
    this.shotsFired++;
    this.addScore(-1);
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    this.shots.push({
      x: TX + cos * BARREL,
      y: PIVOT_Y + sin * BARREL,
      vx: cos * SHOT_SPEED,
      vy: sin * SHOT_SPEED,
    });
    this.host.audio.tone(660, { type: 'square', dur: 0.03, vol: 0.035 });
    this.emitHud();
  }

  private burst(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 120;
      this.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.4, ink: i % 2 ? 'b' : 'c' });
    }
  }

  /** Test one shot position against everything that can be shot. True if it hit. */
  private hit(sx: number, sy: number): boolean {
    for (let i = this.helis.length - 1; i >= 0; i--) {
      const h = this.helis[i];
      if (Math.abs(sx - h.x) < 20 && Math.abs(sy - h.y) < 9) {
        this.helis.splice(i, 1);
        this.addScore(10);
        this.burst(h.x, h.y, 14);
        this.host.audio.tone(150, { type: 'sawtooth', dur: 0.18, vol: 0.06, slideTo: 60 });
        return true;
      }
    }
    for (let i = this.jets.length - 1; i >= 0; i--) {
      const j = this.jets[i];
      if (Math.abs(sx - j.x) < 16 && Math.abs(sy - j.y) < 6) {
        this.jets.splice(i, 1);
        this.addScore(10);
        this.burst(j.x, j.y, 14);
        this.host.audio.tone(180, { type: 'sawtooth', dur: 0.2, vol: 0.06, slideTo: 50 });
        return true;
      }
    }
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      if (Math.abs(sx - b.x) < 6 && Math.abs(sy - b.y) < 6) {
        this.bombs.splice(i, 1);
        this.burst(b.x, b.y, 8);
        this.host.audio.tone(300, { type: 'triangle', dur: 0.08, vol: 0.05 });
        return true;
      }
    }
    for (let i = this.troopers.length - 1; i >= 0; i--) {
      const t = this.troopers[i];
      if (t.state === 'landed') continue;
      if (Math.abs(sx - t.x) < 4 && sy > t.y - 11 && sy < t.y + 1) {
        this.troopers.splice(i, 1);
        this.addScore(5);
        this.burst(t.x, t.y - 5, 6);
        this.host.audio.tone(440, { type: 'square', dur: 0.05, vol: 0.04, slideTo: 220 });
        return true;
      }
      if (t.state === 'chute' && Math.abs(sx - t.x) < 10 && sy > t.y - 31 && sy < t.y - 14) {
        // A shot chute is a lost trooper: score it now and let it fall.
        t.state = 'plummet';
        t.vy = Math.max(t.vy, CHUTE_SPEED);
        this.addScore(5);
        this.host.audio.tone(520, { type: 'triangle', dur: 0.25, vol: 0.04, slideTo: 140 });
        return true;
      }
    }
    return false;
  }

  /* --------------------------------- endings -------------------------------- */

  private beginStorm(side: Side) {
    this.phase = 'storm';
    this.stormSide = side;
    this.stormT = 0;
    this.host.audio.arp([196, 185, 175, 165], { type: 'square', dur: 0.14, vol: 0.05, gap: 0.12 });
  }

  private gameOver(kicker: string) {
    this.phase = 'over';
    this.burst(TX, PIVOT_Y, 24);
    this.host.audio.tone(90, { type: 'sawtooth', dur: 0.5, vol: 0.08, slideTo: 40 });
    const record = this.host.submitScore(this.score);
    this.host.setOverlay({
      variant: 'lose',
      kicker,
      title: 'The shack has fallen',
      rows: [{ label: 'Shots fired', value: fmt(this.shotsFired) }],
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
    this.emitHud();
  }

  /* ---------------------------------- input --------------------------------- */

  onKey(code: string, down: boolean) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
    if (down && (code === 'KeyF' || code === 'KeyK')) this.fire();
  }

  onAction(action: string) {
    if (action === 'start') this.startGame();
    else if (action === 'menu') this.showMenu();
  }

  /** Plain-data view of the run, for `?debug=1` and the headless play script. */
  snapshot() {
    return {
      phase: this.phase,
      score: this.score,
      angle: this.angle,
      shotsFired: this.shotsFired,
      shots: this.shots.length,
      helis: this.helis.length,
      jets: this.jets.length,
      jetsSeen: this.jetsSeen,
      bombs: this.bombs.length,
      landed: { L: this.landed('L'), R: this.landed('R') },
      troopers: this.troopers.map((t) => ({ x: t.x, y: t.y, state: t.state })),
    };
  }

  /* --------------------------------- update --------------------------------- */

  update(dt: number) {
    this.updateSparks(dt);
    if (this.phase === 'storm') {
      this.updateStorm(dt);
      return;
    }
    if (this.phase !== 'playing') return;

    this.clock += dt;
    this.fireCd = Math.max(0, this.fireCd - dt);
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) this.angle -= 2.6 * dt;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) this.angle += 2.6 * dt;
    this.angle = clamp(this.angle, -Math.PI + 0.12, -0.12);

    this.heliTimer -= dt;
    if (this.heliTimer <= 0) {
      this.spawnHeli();
      this.heliTimer = this.nextHeliDelay();
    }
    if (this.jetsOn) {
      this.jetTimer -= dt;
      if (this.jetTimer <= 0) {
        this.spawnJet();
        this.jetTimer = this.nextJetDelay();
      }
    }

    this.updateShots(dt);
    this.updateHelis(dt);
    this.updateJets(dt);
    if (this.updateBombs(dt)) return;
    this.updateTroopers(dt);

    for (const side of ['L', 'R'] as Side[]) {
      if (this.landed(side) >= STORM_AT) {
        this.beginStorm(side);
        return;
      }
    }
  }

  private updateShots(dt: number) {
    // Sub-step so a fast shot cannot tunnel through a trooper at the 50 ms dt cap.
    const steps = Math.max(1, Math.ceil((SHOT_SPEED * dt) / 5));
    const h = dt / steps;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      let gone = false;
      for (let k = 0; k < steps && !gone; k++) {
        s.x += s.vx * h;
        s.y += s.vy * h;
        if (this.hit(s.x, s.y)) gone = true;
      }
      if (gone || s.x < -10 || s.x > W + 10 || s.y < -10) {
        this.shots.splice(i, 1);
        if (gone) this.emitHud();
      }
    }
  }

  private updateHelis(dt: number) {
    for (let i = this.helis.length - 1; i >= 0; i--) {
      const h = this.helis[i];
      const before = h.x;
      h.x += h.vx * dt;
      h.t += dt;
      for (let d = h.drops.length - 1; d >= 0; d--) {
        const x = h.drops[d];
        if ((before - x) * (h.x - x) <= 0) {
          h.drops.splice(d, 1);
          this.troopers.push({ x: h.x, y: h.y + 8, vy: 20, state: 'jump', t: 0 });
        }
      }
      if (h.x < -40 || h.x > W + 40) this.helis.splice(i, 1);
    }
  }

  private updateJets(dt: number) {
    for (let i = this.jets.length - 1; i >= 0; i--) {
      const j = this.jets[i];
      j.x += j.vx * dt;
      const approaching = (TX - j.x) * j.vx > 0;
      if (!j.dropped && approaching && Math.abs(TX - j.x) < 180) {
        j.dropped = true;
        const dx = TX - j.x;
        const dy = PIVOT_Y - j.y;
        const len = Math.hypot(dx, dy);
        this.bombs.push({ x: j.x, y: j.y + 6, vx: (dx / len) * 140, vy: (dy / len) * 140 });
        this.host.audio.tone(880, { type: 'triangle', dur: 0.3, vol: 0.03, slideTo: 440 });
      }
      if (j.x < -40 || j.x > W + 40) this.jets.splice(i, 1);
    }
  }

  /** Move bombs; true when one reached the gun and ended the game. */
  private updateBombs(dt: number): boolean {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (Math.abs(b.x - TX) < BASE_HALF && b.y >= PIVOT_Y - 10) {
        this.bombs.splice(i, 1);
        this.gameOver('Direct hit');
        return true;
      }
      if (b.y > GROUND || b.x < -20 || b.x > W + 20) this.bombs.splice(i, 1);
    }
    return false;
  }

  private updateTroopers(dt: number) {
    let changed = false;
    for (let i = this.troopers.length - 1; i >= 0; i--) {
      const t = this.troopers[i];
      if (t.state === 'landed') continue;
      t.t += dt;
      if (t.state === 'jump') {
        t.vy = Math.min(t.vy + 300 * dt, 160);
        if (t.t > 0.45) t.state = 'chute';
      } else if (t.state === 'chute') {
        t.vy = Math.max(CHUTE_SPEED, t.vy - 600 * dt);
      } else {
        t.vy = Math.min(t.vy + 600 * dt, PLUMMET_MAX);
      }
      t.y += t.vy * dt;

      if (t.state === 'plummet') {
        // A falling trooper takes out the one standing where it lands.
        const below = this.troopers.findIndex((o) => o.state === 'landed' && Math.abs(o.x - t.x) < 8);
        if (below >= 0 && t.y >= GROUND - 10) {
          const other = this.troopers[below];
          this.burst(other.x, GROUND - 5, 10);
          this.troopers.splice(Math.max(i, below), 1);
          this.troopers.splice(Math.min(i, below), 1);
          // Two entries left the array; keep the loop index valid.
          if (below < i) i--;
          this.host.audio.tone(120, { type: 'square', dur: 0.12, vol: 0.06 });
          changed = true;
          continue;
        }
        if (t.y >= GROUND) {
          this.burst(t.x, GROUND - 2, 6);
          this.troopers.splice(i, 1);
          changed = true;
        }
        continue;
      }
      if (t.y >= GROUND) {
        t.y = GROUND;
        t.vy = 0;
        t.state = 'landed';
        changed = true;
        this.host.audio.tone(110, { type: 'triangle', dur: 0.08, vol: 0.04 });
      }
    }
    if (changed) this.emitHud();
  }

  private updateStorm(dt: number) {
    this.stormT += dt;
    const edge = this.stormSide === 'L' ? TX - BASE_HALF - 4 : TX + BASE_HALF + 4;
    for (const t of this.troopers) {
      if (t.state !== 'landed' || this.sideOf(t.x) !== this.stormSide) continue;
      const step = 70 * dt;
      t.x = t.x < edge ? Math.min(edge, t.x + step) : Math.max(edge, t.x - step);
    }
    if (this.stormT >= 2) this.gameOver('Overrun');
  }

  private updateSparks(dt: number) {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 220 * dt;
      if (s.life <= 0) this.sparks.splice(i, 1);
    }
  }

  /* --------------------------------- render --------------------------------- */

  render() {
    const g = this.g;
    const p = this.pal;
    g.fillStyle = p.bg;
    g.fillRect(0, 0, W, H);

    // Ground.
    g.fillStyle = p.c;
    g.fillRect(0, GROUND, W, 2);

    // Helicopters: body, tail, and a rotor that flickers.
    for (const h of this.helis) {
      const dir = Math.sign(h.vx) || 1;
      g.fillStyle = p.b;
      g.fillRect(h.x - 12, h.y - 5, 24, 10);
      g.fillRect(h.x - dir * 24, h.y - 2, 12, 3);
      g.fillStyle = p.a;
      g.fillRect(h.x + dir * 6 - 3, h.y - 3, 6, 4);
      g.fillStyle = p.c;
      const span = Math.floor(h.t * 20) % 2 ? 30 : 18;
      g.fillRect(h.x - span / 2, h.y - 9, span, 2);
      g.fillRect(h.x - 8, h.y + 6, 16, 2);
    }

    // Jets.
    for (const j of this.jets) {
      const dir = Math.sign(j.vx) || 1;
      g.fillStyle = p.a;
      g.fillRect(j.x - 15, j.y - 3, 30, 6);
      g.beginPath();
      g.moveTo(j.x - dir * 10, j.y - 3);
      g.lineTo(j.x - dir * 16, j.y - 10);
      g.lineTo(j.x - dir * 4, j.y - 3);
      g.closePath();
      g.fill();
    }

    g.fillStyle = p.b;
    for (const b of this.bombs) g.fillRect(b.x - 3, b.y - 3, 6, 6);

    // Troopers: a chute canopy while it holds, then a little body.
    for (const t of this.troopers) {
      if (t.state === 'chute') {
        g.fillStyle = p.a;
        g.beginPath();
        g.arc(t.x, t.y - 20, 10, Math.PI, 0);
        g.closePath();
        g.fill();
        g.strokeStyle = p.c;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(t.x - 9, t.y - 20);
        g.lineTo(t.x - 1, t.y - 10);
        g.moveTo(t.x + 9, t.y - 20);
        g.lineTo(t.x + 1, t.y - 10);
        g.stroke();
      }
      g.fillStyle = p.c;
      g.fillRect(t.x - 2, t.y - 10, 4, 4);
      g.fillStyle = t.state === 'plummet' ? p.b : p.a;
      g.fillRect(t.x - 3, t.y - 6, 6, 6);
    }

    // The gun: barrel, dome, and the shack it sits on.
    g.strokeStyle = p.c;
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(TX, PIVOT_Y);
    g.lineTo(TX + Math.cos(this.angle) * BARREL, PIVOT_Y + Math.sin(this.angle) * BARREL);
    g.stroke();
    g.fillStyle = p.b;
    g.beginPath();
    g.arc(TX, PIVOT_Y, 10, Math.PI, 0);
    g.closePath();
    g.fill();
    g.fillStyle = p.a;
    g.fillRect(TX - BASE_HALF, PIVOT_Y, BASE_HALF * 2, GROUND - PIVOT_Y);
    g.fillStyle = p.bg;
    g.fillRect(TX - 6, PIVOT_Y + 10, 12, GROUND - PIVOT_Y - 10);

    g.fillStyle = p.c;
    for (const s of this.shots) g.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);

    for (const s of this.sparks) {
      g.fillStyle = s.ink === 'b' ? p.b : p.c;
      g.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
    }
  }
}
