import type { GameContext, GameInstance } from '../../engine/types';
import { cfgInt, cfgStr, clamp, fmt } from '../../engine/util';
import {
  BAR,
  BRICK,
  COLS,
  DX,
  DY,
  EMPTY,
  ESCAPE,
  LADDER,
  LEVELS,
  ROWS,
  SOLID,
  canStep,
  parseLevel,
  supported,
  type Pt,
  type Terrain,
} from './levels';

const TILE = 32;
/** Running, climbing and hanging speed in tiles per second; guards are a percentage of it. */
const RUN_SPEED = 5;
const FALL_SPEED = 7.5;
/** Holes refill on this beat, so digging is a timing game (the signature twist). */
const BEAT = 0.5;
/** The closing cue — a tick and a visible fill — runs over a hole's last four beats. */
const CLOSE_BEATS = 4;
const DIG_TIME = 0.25;
/** A trapped guard climbs out after this share of the refill time, if the hole is still open. */
const HOLD_SHARE = 0.55;
const READY_TIME = 1.5;
const DIE_TIME = 1.4;
const CLEAR_TIME = 2.2;
const GOLD_POINTS = 250;
const TRAP_POINTS = 75;
const CLEAR_POINTS = 1500;
const PAR_SECONDS = 600;
/** Actors closer than this (in tiles, on both axes) have touched. */
const HIT = 0.7;

const KEY_DIRS: Record<string, number> = {
  ArrowUp: 0, KeyW: 0, ArrowLeft: 1, KeyA: 1, ArrowDown: 2, KeyS: 2, ArrowRight: 3, KeyD: 3,
};
/** Dig left (-1) or right (+1). */
const DIG_KEYS: Record<string, number> = { KeyZ: -1, KeyQ: -1, KeyX: 1, KeyE: 1 };
const RESTART_KEY = 'KeyR';

const SKY = '#06060f';
const BRICK_FILL = '#9a3412';
const MORTAR = '#431407';
const SOLID_FILL = '#334155';
const RAIL = '#cbd5e1';
const GOLD_FILL = '#facc15';
const PLAYER_FILL = '#38bdf8';
const GUARD_FILL = '#f43f5e';

type Phase = 'menu' | 'ready' | 'playing' | 'dying' | 'clear' | 'over' | 'won';
type GuardState = 'free' | 'trapped' | 'escaping';

/** Tile-centred movement: `t` (0..1) is progress from tile (tx,ty) toward the next one; dir -1 is standing. */
interface Mover {
  tx: number;
  ty: number;
  dir: number;
  t: number;
  falling: boolean;
}
interface Runner extends Mover {
  /** Seconds left frozen over a dig. */
  digT: number;
  /** A dig pressed mid-step, taken at the next tile centre (-1 / +1, 0 = none). */
  pendingDig: number;
}
interface Guard extends Mover {
  state: GuardState;
  hold: number;
  gold: boolean;
  /** Tile centres to go before dropping the gold it carries. */
  carry: number;
}
interface Hole {
  x: number;
  y: number;
  dugAt: number;
  /** Level time it refills at — always a whole number of beats. */
  closeAt: number;
}
interface Popup {
  x: number;
  y: number;
  text: string;
  age: number;
}

const opposite = (d: number) => (d + 2) % 4;

/**
 * Lode Digger — an original platformer in the spirit of the 1983 home-computer
 * classic. Take every piece of gold on a grid of bricks, ladders and bars while
 * guards chase you, and dig holes to trap them. Holes refill on a steady beat,
 * so a dig is a bet on timing: a guard that falls in late is still inside when
 * the brick comes back.
 */
export class LodeDigger implements GameInstance {
  readonly design = { width: COLS * TILE, height: ROWS * TILE };

  private host: GameContext;
  private g: CanvasRenderingContext2D;

  private startLevel: number;
  private maxLives: number;
  private guardPct: number;
  private refillSecs: number;

  private phase: Phase = 'menu';
  private level = 1;
  private lives = 0;
  private score = 0;
  private bestBefore = 0;
  private submitted = false;

  private tiles: string[] = [];
  private gold: Uint8Array = new Uint8Array(COLS * ROWS);
  private goldTotal = 0;
  private collected = 0;
  private escapeShown = false;
  private revealedAt = 0;
  private holes = new Map<number, Hole>();
  private player: Runner = { tx: 0, ty: 0, dir: -1, t: 0, falling: false, digT: 0, pendingDig: 0 };
  private guards: Guard[] = [];

  /** Seconds of play on this level: drives the beat, the holes and the time bonus. */
  private levelTime = 0;
  private lastBonus = 0;
  private timer = 0;
  private clock = 0;
  private popups: Popup[] = [];
  /** Held key codes, oldest first; the newest held direction wins. */
  private heldCodes: string[] = [];
  private down = new Set<string>();

  /** The board as the movement rules see it: dug holes open, trapped guards stood on. */
  private terrain: Terrain = {
    blocked: (x, y) => this.blocked(x, y),
    floor: (x, y) => this.blocked(x, y) || this.trappedAt(x, y),
    climbable: (x, y) => {
      const c = this.tileAt(x, y);
      return c === LADDER || (this.escapeShown && c === ESCAPE);
    },
    bar: (x, y) => this.tileAt(x, y) === BAR,
  };

  constructor(ctx: GameContext) {
    this.host = ctx;
    this.g = ctx.ctx;
    const c = ctx.config;
    // Config is read here and only here: a changed setting rebuilds the session.
    this.startLevel = clamp(parseInt(cfgStr(c.startLevel, '1'), 10) || 1, 1, LEVELS.length);
    this.maxLives = clamp(cfgInt(c.lives, 5), 1, 9);
    this.guardPct = clamp(cfgInt(c.guardSpeed, 80), 50, 120);
    this.refillSecs = clamp(cfgInt(c.refill, 6), 3, 10);
    this.level = this.startLevel;
    this.loadLevel();
    this.showMenu();
  }

  /* -------------------------------- Flow -------------------------------- */
  private showMenu() {
    this.level = this.startLevel;
    this.loadLevel();
    this.phase = 'menu';
    this.host.setHud({ badge: 'LODE DIGGER', stats: [{ label: 'Best', value: fmt(this.host.getBest()) }] });
    this.host.setOverlay({
      variant: 'menu',
      title: 'LODE DIGGER',
      subtitle: 'Take all the gold, dodge the guards, and climb out. Holes refill on the beat.',
      bullets: [
        { icon: '⬆', text: 'Run and climb with the arrow keys or W A S D. Down drops you off a bar.' },
        { icon: '⛏️', text: 'Z or Q digs down-left, X or E digs down-right. Guards that fall in are stuck.' },
        { icon: '🥁', text: 'A hole refills on the beat: listen for the ticks. Never be inside one when it closes.' },
        { icon: '🪜', text: 'Take every piece of gold and the escape ladder appears. Climb off the top.' },
        { icon: '↺', text: 'R restarts the level, and costs a life.' },
      ],
      buttons: [{ action: 'start', label: 'Start game', primary: true }],
    });
  }

  private startGame() {
    this.score = 0;
    this.lives = this.maxLives;
    this.level = this.startLevel;
    this.bestBefore = this.host.getBest();
    this.submitted = false;
    this.loadLevel();
    this.host.setOverlay(null);
    this.emitHud();
  }

  /** (Re)build the current level from its text grid: gold back, guards home, holes filled. */
  private loadLevel() {
    const lv = parseLevel(LEVELS[this.level - 1]);
    this.tiles = lv.tiles.slice();
    this.gold = new Uint8Array(COLS * ROWS);
    for (const p of lv.gold) this.gold[p.y * COLS + p.x] = 1;
    this.goldTotal = lv.gold.length;
    this.collected = 0;
    this.escapeShown = false;
    this.holes.clear();
    this.player = { tx: lv.player.x, ty: lv.player.y, dir: -1, t: 0, falling: false, digT: 0, pendingDig: 0 };
    this.guards = lv.guards.map((p) => ({
      tx: p.x, ty: p.y, dir: -1, t: 0, falling: false, state: 'free' as GuardState, hold: 0, gold: false, carry: 0,
    }));
    this.levelTime = 0;
    this.popups.length = 0;
    this.timer = READY_TIME;
    this.phase = 'ready';
  }

  private die() {
    this.phase = 'dying';
    this.timer = DIE_TIME;
    this.host.audio.arp([523, 466, 392, 330, 262], { type: 'square', dur: 0.12, vol: 0.06, gap: 0.1 });
  }

  /** R: start the level again, for a life. */
  private restartLevel() {
    this.lives--;
    if (this.lives <= 0) {
      this.lives = 0;
      this.gameOver();
      return;
    }
    this.host.audio.tone(220, { type: 'square', dur: 0.15, vol: 0.05, slideTo: 110 });
    this.loadLevel();
    this.emitHud();
  }

  private levelClear() {
    const seconds = Math.floor(this.levelTime);
    this.lastBonus = CLEAR_POINTS + Math.max(0, PAR_SECONDS - seconds) * 2;
    this.score += this.lastBonus;
    this.phase = 'clear';
    this.timer = CLEAR_TIME;
    this.popups.push({ x: this.player.tx + 0.5, y: this.player.ty + 1, text: `+${this.lastBonus}`, age: 0 });
    this.host.audio.arp([523, 659, 784, 1047, 1319], { type: 'triangle', dur: 0.14, vol: 0.07, gap: 0.09 });
    this.emitHud();
  }

  /** The score goes to the host exactly once per game, however the game ends. */
  private submitOnce(): boolean {
    if (this.submitted) return false;
    this.submitted = true;
    return this.host.submitScore(this.score);
  }

  private gameOver() {
    this.phase = 'over';
    const record = this.submitOnce();
    this.host.audio.arp([392, 311, 233, 155], { type: 'sawtooth', dur: 0.24, vol: 0.07, gap: 0.15 });
    this.host.setOverlay({
      variant: 'lose',
      kicker: 'Game over',
      title: `Level ${this.level} — ${LEVELS[this.level - 1].name}`,
      bigStat: {
        label: 'Final score',
        value: fmt(this.score),
        note: record && this.score > this.bestBefore ? '★ New best!' : undefined,
      },
      rows: [{ label: 'Best', value: fmt(Math.max(this.score, this.host.getBest())) }],
      buttons: [
        { action: 'start', label: 'Play again', primary: true },
        { action: 'menu', label: 'Title', ghost: true },
      ],
    });
    this.emitHud();
  }

  private win() {
    this.phase = 'won';
    const record = this.submitOnce();
    this.host.setOverlay({
      variant: 'win',
      kicker: 'All levels cleared',
      title: 'You got out with the gold',
      bigStat: {
        label: 'Final score',
        value: fmt(this.score),
        note: record && this.score > this.bestBefore ? '★ New best!' : undefined,
      },
      rows: [
        { label: 'Last clear bonus', value: fmt(this.lastBonus) },
        { label: 'Lives left', value: String(this.lives) },
      ],
      buttons: [
        { action: 'start', label: 'Play again', primary: true },
        { action: 'menu', label: 'Title', ghost: true },
      ],
    });
    this.emitHud();
  }

  private emitHud() {
    const best = Math.max(this.bestBefore, this.score);
    this.host.setHud({
      badge: `LEVEL ${this.level}`,
      lives: { current: Math.max(0, this.lives), max: this.maxLives },
      stats: [
        { label: 'Gold left', value: String(this.goldTotal - this.collected), accent: this.escapeShown },
        { label: 'Level', value: `${this.level}/${LEVELS.length}` },
        { label: 'Score', value: fmt(this.score) },
        { label: 'Best', value: fmt(best), accent: this.score > 0 && this.score >= best },
      ],
    });
  }

  /* ------------------------------- Board -------------------------------- */
  private tileAt(x: number, y: number): string {
    return x < 0 || x >= COLS || y < 0 || y >= ROWS ? SOLID : this.tiles[y * COLS + x];
  }

  private blocked(x: number, y: number): boolean {
    const c = this.tileAt(x, y);
    return c === SOLID || (c === BRICK && !this.holes.has(y * COLS + x));
  }

  private trappedAt(x: number, y: number): boolean {
    return this.guards.some((g) => g.state === 'trapped' && g.tx === x && g.ty === y);
  }

  /** The tile an actor mostly occupies. */
  private cellOf(m: Mover): Pt {
    return m.dir >= 0 && m.t >= 0.5 ? { x: m.tx + DX[m.dir], y: m.ty + DY[m.dir] } : { x: m.tx, y: m.ty };
  }

  private pos(m: Mover): Pt {
    return m.dir < 0 ? { x: m.tx, y: m.ty } : { x: m.tx + DX[m.dir] * m.t, y: m.ty + DY[m.dir] * m.t };
  }

  /* ------------------------------ Movement ------------------------------ */
  /** Move `dist` tiles, calling `atCenter` on each tile reached; it returns false to stop. */
  private advance(m: Mover, dist: number, atCenter: () => boolean) {
    // Steps are at most 0.375 tiles at the 50 ms dt cap, so this never skips a centre.
    let guard = 0;
    while (dist > 0 && m.dir >= 0 && guard++ < 8) {
      const left = 1 - m.t;
      if (dist < left) {
        m.t += dist;
        return;
      }
      dist -= left;
      m.tx += DX[m.dir];
      m.ty += DY[m.dir];
      m.t = 0;
      if (!atCenter()) return;
    }
  }

  /** Turn around on the spot, mid-tile. */
  private reverse(m: Mover) {
    m.tx += DX[m.dir];
    m.ty += DY[m.dir];
    m.t = 1 - m.t;
    m.dir = opposite(m.dir);
  }

  private wantDir(): number {
    for (let i = this.heldCodes.length - 1; i >= 0; i--) {
      const d = KEY_DIRS[this.heldCodes[i]];
      if (d !== undefined) return d;
    }
    return -1;
  }

  private movePlayer(dt: number) {
    const p = this.player;
    if (p.digT > 0) {
      p.digT -= dt;
      return;
    }
    const want = this.wantDir();
    if (p.dir >= 0 && p.t > 0 && !p.falling && want >= 0 && want === opposite(p.dir)) this.reverse(p);
    if (p.dir < 0) {
      this.decidePlayer();
      if (p.dir < 0) return;
    }
    this.advance(p, (p.falling ? FALL_SPEED : RUN_SPEED) * dt, () => this.playerAtCenter());
  }

  private playerAtCenter(): boolean {
    const p = this.player;
    this.collectAt(p.tx, p.ty);
    if (this.phase !== 'playing') return false;
    if (this.escapeShown && p.ty === 0) {
      this.levelClear();
      return false;
    }
    const dig = p.pendingDig;
    p.pendingDig = 0;
    if (dig && this.tryDig(dig)) return false;
    this.decidePlayer();
    return p.dir >= 0;
  }

  /** At a tile centre: fall if nothing holds you up, else take the newest held direction that works. */
  private decidePlayer() {
    const p = this.player;
    if (!supported(this.terrain, p.tx, p.ty)) {
      p.falling = true;
      p.dir = 2;
      return;
    }
    if (p.falling) {
      p.falling = false;
      this.host.audio.tone(140, { type: 'triangle', dur: 0.05, vol: 0.04 });
    }
    p.dir = -1;
    for (let i = this.heldCodes.length - 1; i >= 0; i--) {
      const d = KEY_DIRS[this.heldCodes[i]];
      if (d !== undefined && canStep(this.terrain, p.tx, p.ty, d)) {
        p.dir = d;
        return;
      }
    }
  }

  /**
   * Dig the brick below-left (-1) or below-right (+1). Only from a standing
   * start, only into intact brick under open air, so a held or repeating dig
   * button can never open a second hole.
   */
  private tryDig(side: number): boolean {
    const p = this.player;
    if (p.falling || p.t !== 0 || !supported(this.terrain, p.tx, p.ty)) return false;
    const x = p.tx + side;
    const y = p.ty + 1;
    if (x < 0 || x >= COLS || y >= ROWS) return false;
    if (this.tileAt(x, y) !== BRICK || this.holes.has(y * COLS + x)) return false;
    if (this.tileAt(x, p.ty) !== EMPTY || this.gold[p.ty * COLS + x]) return false;
    if (this.guards.some((g) => { const c = this.cellOf(g); return c.x === x && c.y === p.ty; })) return false;
    // Round the refill up to the next whole beat: every hole closes on the rhythm.
    const closeAt = Math.ceil((this.levelTime + this.refillSecs) / BEAT - 1e-9) * BEAT;
    this.holes.set(y * COLS + x, { x, y, dugAt: this.levelTime, closeAt });
    p.digT = DIG_TIME;
    p.dir = -1;
    this.host.audio.tone(180, { type: 'sawtooth', dur: 0.12, vol: 0.05, slideTo: 90 });
    return true;
  }

  private guardSpeed(g: Guard): number {
    if (g.falling) return FALL_SPEED;
    const base = RUN_SPEED * (this.guardPct / 100);
    return g.state === 'escaping' ? base * 0.6 : base;
  }

  private moveGuard(g: Guard, dt: number) {
    if (g.state === 'trapped') {
      if ((g.hold -= dt) <= 0) {
        // Climb out: up first, then off to one side at the next centre.
        g.state = 'escaping';
        g.dir = 0;
        g.t = 0;
      }
      return;
    }
    if (g.dir < 0) {
      this.decideGuard(g);
      if (g.dir < 0) return;
    }
    this.advance(g, this.guardSpeed(g) * dt, () => this.guardAtCenter(g));
  }

  private guardAtCenter(g: Guard): boolean {
    const k = g.ty * COLS + g.tx;
    if (g.state === 'free' && this.holes.has(k)) {
      this.trap(g);
      return false;
    }
    if (g.state === 'escaping') {
      g.state = 'free';
      const toward = this.player.tx < g.tx ? 1 : 3;
      for (const d of [toward, opposite(toward)]) {
        if (!this.blocked(g.tx + DX[d], g.ty) && !this.guardBlocks(g, g.tx + DX[d], g.ty)) {
          g.dir = d;
          return true;
        }
      }
    }
    if (!g.gold && this.gold[k]) {
      this.gold[k] = 0;
      g.gold = true;
      g.carry = 3 + Math.floor(Math.random() * 9);
    } else if (g.gold && --g.carry <= 0 && this.canDropAt(g.tx, g.ty)) {
      this.gold[k] = 1;
      g.gold = false;
    }
    this.decideGuard(g);
    return g.dir >= 0;
  }

  private decideGuard(g: Guard) {
    if (!supported(this.terrain, g.tx, g.ty)) {
      g.falling = true;
      g.dir = 2;
      return;
    }
    g.falling = false;
    g.dir = this.chase(g);
  }

  /** First step of a breadth-first walk to the player, by the same rules the player moves by. */
  private chase(g: Guard): number {
    const target = this.cellOf(this.player);
    const first = new Int8Array(COLS * ROWS).fill(-1);
    const seen = new Uint8Array(COLS * ROWS);
    seen[g.ty * COLS + g.tx] = 1;
    const queue: Pt[] = [{ x: g.tx, y: g.ty }];
    for (let head = 0; head < queue.length; head++) {
      const p = queue[head];
      if (p.x === target.x && p.y === target.y) return first[p.y * COLS + p.x];
      for (let d = 0; d < 4; d++) {
        if (!canStep(this.terrain, p.x, p.y, d)) continue;
        const nx = p.x + DX[d];
        const ny = p.y + DY[d];
        const i = ny * COLS + nx;
        if (seen[i]) continue;
        if (head === 0 && this.guardBlocks(g, nx, ny)) continue;
        seen[i] = 1;
        first[i] = head === 0 ? d : first[p.y * COLS + p.x];
        queue.push({ x: nx, y: ny });
      }
    }
    // No route: edge along the floor toward the player and wait for one to open.
    const side = target.x < g.tx ? 1 : target.x > g.tx ? 3 : -1;
    if (side >= 0 && canStep(this.terrain, g.tx, g.ty, side) && !this.guardBlocks(g, g.tx + DX[side], g.ty)) return side;
    return -1;
  }

  /** Another guard is on, or stepping onto, tile (x, y). */
  private guardBlocks(self: Guard, x: number, y: number): boolean {
    return this.guards.some(
      (o) =>
        o !== self &&
        ((o.tx === x && o.ty === y) || (o.dir >= 0 && o.tx + DX[o.dir] === x && o.ty + DY[o.dir] === y)),
    );
  }

  private canDropAt(x: number, y: number): boolean {
    const k = y * COLS + x;
    return this.tileAt(x, y) === EMPTY && !this.gold[k] && this.blocked(x, y + 1);
  }

  /* ------------------------------- Events ------------------------------- */
  private collectAt(x: number, y: number) {
    const k = y * COLS + x;
    if (!this.gold[k]) return;
    this.gold[k] = 0;
    this.collected++;
    this.score += GOLD_POINTS;
    this.popups.push({ x: x + 0.5, y, text: `+${GOLD_POINTS}`, age: 0 });
    this.host.audio.arp([880, 1175], { type: 'triangle', dur: 0.06, vol: 0.05, gap: 0.05 });
    if (this.collected >= this.goldTotal && !this.escapeShown) {
      this.escapeShown = true;
      this.revealedAt = this.levelTime;
      this.host.audio.arp([392, 523, 659, 784], { type: 'square', dur: 0.1, vol: 0.05, gap: 0.07 });
    }
    this.emitHud();
  }

  private trap(g: Guard) {
    g.state = 'trapped';
    g.dir = -1;
    g.t = 0;
    g.falling = false;
    g.hold = this.refillSecs * HOLD_SHARE;
    this.score += TRAP_POINTS;
    this.popups.push({ x: g.tx + 0.5, y: g.ty - 0.5, text: `+${TRAP_POINTS}`, age: 0 });
    // A trapped guard lets go of its gold, on the lip of the hole.
    if (g.gold && this.tileAt(g.tx, g.ty - 1) === EMPTY && !this.gold[(g.ty - 1) * COLS + g.tx]) {
      this.gold[(g.ty - 1) * COLS + g.tx] = 1;
      g.gold = false;
    }
    this.host.audio.tone(330, { type: 'square', dur: 0.1, vol: 0.05, slideTo: 165 });
    this.emitHud();
  }

  /** The hole's beat came round: brick back, and anyone inside pays for it. */
  private refill(h: Hole) {
    this.holes.delete(h.y * COLS + h.x);
    this.host.audio.tone(98, { type: 'square', dur: 0.12, vol: 0.07 });
    const inside = (m: Mover) => {
      const c = this.cellOf(m);
      return c.x === h.x && c.y === h.y;
    };
    // Still short of the hole's middle: stop on the lip instead of moving into brick.
    const stopIfEntering = (m: Mover) => {
      if (m.dir >= 0 && m.tx + DX[m.dir] === h.x && m.ty + DY[m.dir] === h.y) {
        m.dir = -1;
        m.t = 0;
      }
    };
    for (const g of this.guards) {
      if (inside(g)) this.respawn(g);
      else stopIfEntering(g);
    }
    if (inside(this.player)) this.die();
    else stopIfEntering(this.player);
  }

  /** Back in at the top, as near its old column as a free sky tile allows. Gold it carried comes too. */
  private respawn(g: Guard) {
    let best = -1;
    for (let x = 0; x < COLS; x++) {
      if (this.tileAt(x, 0) !== EMPTY || this.guards.some((o) => o !== g && o.tx === x && o.ty === 0)) continue;
      if (best < 0 || Math.abs(x - g.tx) < Math.abs(best - g.tx)) best = x;
    }
    g.tx = Math.max(0, best);
    g.ty = 0;
    g.dir = -1;
    g.t = 0;
    g.falling = false;
    g.state = 'free';
    g.hold = 0;
  }

  private tickHoles(before: number) {
    const now = this.levelTime;
    const beat = Math.floor(now / BEAT + 1e-9);
    const crossed = beat !== Math.floor(before / BEAT + 1e-9);
    for (const h of [...this.holes.values()]) {
      if (now >= h.closeAt - 1e-9) {
        this.refill(h);
        if (this.phase !== 'playing') return;
        continue;
      }
      // Count down the last beats out loud, rising as the hole closes.
      const left = Math.round((h.closeAt - beat * BEAT) / BEAT);
      if (crossed && left <= CLOSE_BEATS) {
        this.host.audio.tone(440 + (CLOSE_BEATS - left) * 110, { type: 'square', dur: 0.04, vol: 0.035 });
      }
    }
  }

  private collide() {
    const pp = this.pos(this.player);
    for (const g of this.guards) {
      const gp = this.pos(g);
      if (Math.abs(gp.x - pp.x) < HIT && Math.abs(gp.y - pp.y) < HIT) {
        this.die();
        return;
      }
    }
  }

  private tick(dt: number) {
    const before = this.levelTime;
    this.levelTime += dt;
    this.tickHoles(before);
    if (this.phase !== 'playing') return;
    this.movePlayer(dt);
    if (this.phase !== 'playing') return;
    for (const g of this.guards) this.moveGuard(g, dt);
    this.collide();
  }

  /* ------------------------------- Input -------------------------------- */
  onKey(code: string, down: boolean) {
    // A key that is already down is the keyboard's auto-repeat, not a new press.
    const fresh = down && !this.down.has(code);
    this.heldCodes = this.heldCodes.filter((c) => c !== code);
    if (down) {
      this.down.add(code);
      this.heldCodes.push(code);
    } else {
      this.down.delete(code);
    }
    if (!fresh) return;
    if (code === RESTART_KEY && (this.phase === 'playing' || this.phase === 'ready')) {
      this.restartLevel();
      return;
    }
    const side = DIG_KEYS[code];
    if (side !== undefined && this.phase === 'playing') {
      const p = this.player;
      // Pressed mid-step: dig at the next tile centre rather than not at all.
      if (!this.tryDig(side) && p.dir >= 0 && p.t > 0 && !p.falling) p.pendingDig = side;
    }
  }

  onAction(action: string) {
    if (action === 'start') this.startGame();
    else if (action === 'menu') this.showMenu();
  }

  /** Keys released while the page was hidden never arrive; forget them. */
  onPause() {
    this.heldCodes = [];
    this.down.clear();
  }

  /** Plain-data view of the run, for `?debug=1` and the headless play script. */
  snapshot() {
    const p = this.player;
    return {
      phase: this.phase,
      level: this.level,
      lives: this.lives,
      score: this.score,
      goldLeft: this.goldTotal - this.collected,
      escapeShown: this.escapeShown,
      levelTime: this.levelTime,
      player: { x: p.tx, y: p.ty, t: p.t, dir: p.dir, falling: p.falling },
      guards: this.guards.map((g) => ({ x: g.tx, y: g.ty, t: g.t, dir: g.dir, state: g.state, gold: g.gold })),
      holes: [...this.holes.values()].map((h) => ({ ...h })),
    };
  }

  /* ------------------------- GameInstance API --------------------------- */
  update(dt: number) {
    this.clock += dt;
    for (let i = this.popups.length - 1; i >= 0; i--) {
      if ((this.popups[i].age += dt) > 1) this.popups.splice(i, 1);
    }
    switch (this.phase) {
      case 'ready':
        if ((this.timer -= dt) <= 0) this.phase = 'playing';
        return;
      case 'dying':
        if ((this.timer -= dt) <= 0) {
          this.lives--;
          if (this.lives <= 0) {
            this.lives = 0;
            this.gameOver();
          } else {
            this.loadLevel();
            this.emitHud();
          }
        }
        return;
      case 'clear':
        if ((this.timer -= dt) <= 0) {
          if (this.level >= LEVELS.length) this.win();
          else {
            this.level++;
            this.loadLevel();
            this.emitHud();
          }
        }
        return;
      case 'playing':
        this.tick(dt);
        return;
      default:
        return;
    }
  }

  render() {
    const g = this.g;
    const W = this.design.width;
    const H = this.design.height;
    g.fillStyle = SKY;
    g.fillRect(0, 0, W, H);

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const c = this.tiles[y * COLS + x];
        const px = x * TILE;
        const py = y * TILE;
        if (c === BRICK) {
          const h = this.holes.get(y * COLS + x);
          if (h) this.drawHole(h, px, py);
          else this.drawBrick(px, py);
        } else if (c === SOLID) {
          g.fillStyle = SOLID_FILL;
          g.fillRect(px, py, TILE, TILE);
          g.fillStyle = '#475569';
          g.fillRect(px, py, TILE, 4);
          g.fillStyle = '#1e293b';
          g.fillRect(px, py + TILE - 4, TILE, 4);
        } else if (c === LADDER) {
          this.drawLadder(px, py, RAIL);
        } else if (c === ESCAPE && this.escapeShown) {
          g.globalAlpha = 0.75 + 0.25 * Math.sin(this.clock * 8);
          this.drawLadder(px, py, GOLD_FILL);
          g.globalAlpha = 1;
        } else if (c === BAR) {
          g.fillStyle = '#94a3b8';
          g.fillRect(px, py + 5, TILE, 3);
        }
        if (this.gold[y * COLS + x]) this.drawGold(px, py);
      }
    }

    if (this.phase !== 'menu') {
      if (this.phase !== 'dying' || Math.floor(this.clock * 8) % 2 === 0) this.drawFigure(this.pos(this.player), PLAYER_FILL, false);
      for (const gd of this.guards) {
        const at = this.pos(gd);
        // Sunk into its hole while trapped, so only the head shows above the lip.
        if (gd.state === 'trapped') at.y += 0.35;
        this.drawFigure(at, GUARD_FILL, gd.gold);
      }
    }

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 12px "Press Start 2P", monospace';
    for (const p of this.popups) {
      g.globalAlpha = 1 - p.age;
      g.fillStyle = '#fde68a';
      g.fillText(p.text, p.x * TILE, (p.y + 0.5 - p.age) * TILE);
    }
    g.globalAlpha = 1;

    const banner =
      this.phase === 'ready' ? `LEVEL ${this.level}: ${LEVELS[this.level - 1].name.toUpperCase()}`
      : this.phase === 'clear' ? 'LEVEL CLEAR'
      : this.phase === 'playing' && this.escapeShown && this.levelTime - this.revealedAt < 2 && this.levelTime % 0.5 < 0.3 ? 'ESCAPE!'
      : '';
    if (banner) {
      g.font = 'bold 18px "Press Start 2P", monospace';
      g.fillStyle = '#000';
      g.fillText(banner, W / 2 + 2, H / 2 + 2);
      g.fillStyle = this.phase === 'clear' || this.escapeShown ? GOLD_FILL : PLAYER_FILL;
      g.fillText(banner, W / 2, H / 2);
    }
  }

  /* ------------------------------ Drawing ------------------------------- */
  private drawBrick(px: number, py: number) {
    const g = this.g;
    g.fillStyle = BRICK_FILL;
    g.fillRect(px, py, TILE, TILE);
    g.fillStyle = MORTAR;
    g.fillRect(px, py + TILE / 2 - 1, TILE, 2);
    g.fillRect(px, py + TILE - 2, TILE, 2);
    g.fillRect(px + TILE / 2 - 1, py, 2, TILE / 2);
    g.fillRect(px, py + TILE / 2, 2, TILE / 2);
  }

  /** An open hole: crumbling while dug, then filling back up one beat at a time. */
  private drawHole(h: Hole, px: number, py: number) {
    const g = this.g;
    g.fillStyle = '#020205';
    g.fillRect(px, py, TILE, TILE);
    const sinceDig = this.levelTime - h.dugAt;
    if (sinceDig < DIG_TIME) {
      const f = 1 - sinceDig / DIG_TIME;
      g.fillStyle = BRICK_FILL;
      g.fillRect(px, py + TILE * (1 - f), TILE, TILE * f);
      return;
    }
    const beatsLeft = (h.closeAt - this.levelTime) / BEAT;
    if (beatsLeft > CLOSE_BEATS) return;
    // The fill steps up on each beat rather than sliding, so the eye can count it.
    const stage = CLOSE_BEATS - Math.ceil(beatsLeft - 1e-9);
    const f = clamp(stage / CLOSE_BEATS, 0, 1);
    g.fillStyle = BRICK_FILL;
    g.fillRect(px, py + TILE * (1 - f), TILE, TILE * f);
    const pulse = 1 - ((this.levelTime / BEAT) % 1);
    g.strokeStyle = `rgba(253, 224, 71, ${0.25 + 0.6 * pulse})`;
    g.lineWidth = 2;
    g.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2);
  }

  private drawLadder(px: number, py: number, color: string) {
    const g = this.g;
    g.fillStyle = color;
    g.fillRect(px + 6, py, 3, TILE);
    g.fillRect(px + TILE - 9, py, 3, TILE);
    for (let r = 4; r < TILE; r += 8) g.fillRect(px + 6, py + r, TILE - 12, 2);
  }

  private drawGold(px: number, py: number) {
    const g = this.g;
    g.fillStyle = GOLD_FILL;
    g.beginPath();
    g.moveTo(px + 8, py + TILE - 4);
    g.lineTo(px + TILE - 8, py + TILE - 4);
    g.lineTo(px + TILE - 12, py + TILE - 14);
    g.lineTo(px + 12, py + TILE - 14);
    g.closePath();
    g.fill();
    g.fillStyle = '#fef08a';
    g.fillRect(px + 13, py + TILE - 13, 6, 2);
  }

  /** A small original runner figure; `t`-driven legs so movement reads at a glance. */
  private drawFigure(at: Pt, color: string, carrying: boolean) {
    const g = this.g;
    const cx = (at.x + 0.5) * TILE;
    const top = at.y * TILE;
    const stride = Math.sin((at.x + at.y) * Math.PI * 2) * 5;
    g.fillStyle = color;
    g.beginPath();
    g.arc(cx, top + 7, 5, 0, Math.PI * 2);
    g.fill();
    g.fillRect(cx - 4, top + 12, 8, 10);
    g.strokeStyle = color;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx - 2, top + 22);
    g.lineTo(cx - 2 - stride, top + TILE - 1);
    g.moveTo(cx + 2, top + 22);
    g.lineTo(cx + 2 + stride, top + TILE - 1);
    g.moveTo(cx - 4, top + 14);
    g.lineTo(cx - 9, top + 18 + stride / 2);
    g.moveTo(cx + 4, top + 14);
    g.lineTo(cx + 9, top + 18 - stride / 2);
    g.stroke();
    if (carrying) {
      g.fillStyle = GOLD_FILL;
      g.fillRect(cx + 4, top + 10, 7, 6);
    }
  }
}
