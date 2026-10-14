import type { GameContext, GameInstance, PointerInfo } from '../../engine/types';
import { cfgInt, cfgStr, clamp, fmt } from '../../engine/util';
import {
  BOULDER,
  DIRT,
  EMPTY,
  EXIT,
  GEM,
  PLAYER,
  SIZES,
  WALL,
  generateCave,
  type Cave,
  type Size,
} from './cave';

const TILE = 28;
const VIEW_COLS = 30;
const VIEW_ROWS = 18;
/** Seconds per physics tick: the player and every falling thing move on this beat. */
const PHYS = 1 / 8;
const MAX_LIVES = 3;
const DIE_TIME = 1.6;
const CLEAR_TIME = 2.2;
const GEM_POINTS = 10;
const BONUS_GEM_POINTS = 25;

/** Directions: 0 up, 1 left, 2 down, 3 right. */
const DX = [0, -1, 0, 1];
const DY = [-1, 0, 1, 0];
const KEY_DIRS: Record<string, number> = {
  ArrowUp: 0, KeyW: 0, ArrowLeft: 1, KeyA: 1, ArrowDown: 2, KeyS: 2, ArrowRight: 3, KeyD: 3,
};

const SIZE_KEYS = Object.keys(SIZES) as Size[];

type Phase = 'menu' | 'playing' | 'dying' | 'clear' | 'over';

interface Popup {
  x: number;
  y: number;
  text: string;
  age: number;
}

/**
 * Rockfall — an original cave dig in the spirit of the 1984 home-computer
 * classic. Tunnel through dirt for gems while boulders and gems fall and roll
 * under simple tile physics; reach the exit before the clock runs out. Every gem
 * over the target multiplies the time bonus, so greed pays if you are quick.
 */
export class Rockfall implements GameInstance {
  readonly design = { width: VIEW_COLS * TILE, height: VIEW_ROWS * TILE };

  private host: GameContext;
  private g: CanvasRenderingContext2D;

  private size: Size;
  private boulderPct: number;
  private target: number;
  private timeLimit: number;
  private seedCfg: number;

  private phase: Phase = 'menu';
  private runSeed = 0;
  private level = 1;
  private lives = 0;
  private score = 0;
  private caveStartScore = 0;
  private bestBefore = 0;

  private cave: Cave;
  private tiles: Uint8Array;
  /** 1 where a boulder or gem moved down (or rolled) on the last tick — only those can crush. */
  private falling: Uint8Array;
  private px = 0;
  private py = 0;
  private collected = 0;
  private time = 0;
  private acc = 0;
  private timer = 0;
  private lastBonus = 0;
  private deathAt: { x: number; y: number } | null = null;

  /** Held directions, most recent last; a tap between ticks still counts once. */
  private held: number[] = [];
  private pending: number | null = null;
  private grab = false;

  private cam = { x: 0, y: 0 };
  private clock = 0;
  private popups: Popup[] = [];

  constructor(ctx: GameContext) {
    this.host = ctx;
    this.g = ctx.ctx;
    const c = ctx.config;
    const size = cfgStr(c.size, 'medium');
    this.size = SIZE_KEYS.includes(size as Size) ? (size as Size) : 'medium';
    this.boulderPct = clamp(cfgInt(c.boulders, 15), 5, 30);
    this.target = clamp(cfgInt(c.gems, 12), 5, 30);
    this.timeLimit = clamp(cfgInt(c.time, 150), 60, 240);
    this.seedCfg = clamp(cfgInt(c.seed, 0), 0, 9999);
    this.cave = this.buildCave(1);
    this.tiles = this.cave.tiles;
    this.falling = new Uint8Array(this.tiles.length);
    this.showMenu();
  }

  /* -------------------------------- Flow -------------------------------- */
  private showMenu() {
    this.phase = 'menu';
    this.runSeed = Math.floor(Math.random() * 0x7fffffff);
    this.level = 1;
    this.loadCave();
    this.phase = 'menu';
    this.host.setHud({ badge: 'ROCKFALL', stats: [{ label: 'Best', value: fmt(this.host.getBest()) }] });
    this.host.setOverlay({
      variant: 'menu',
      title: 'ROCKFALL',
      subtitle: 'Dig for gems, dodge the falling rock, and make the exit before the clock does.',
      bullets: [
        { icon: '⬆', text: 'Arrows or W A S D dig and move. Push a single boulder sideways into empty space.' },
        { icon: '✋', text: 'Hold F with a direction to dig or grab the next tile without stepping into it.' },
        { icon: '💎', text: `Collect ${this.target} gems to open the exit. Every gem past that multiplies the time bonus.` },
        { icon: '🪨', text: 'Anything with nothing under it falls, and round things roll. A falling boulder is fatal.' },
        { icon: '↺', text: 'Stuck? R gives up the cave for a life.' },
      ],
      buttons: [{ action: 'start', label: 'Start digging', primary: true }],
    });
  }

  private startGame() {
    this.runSeed = Math.floor(Math.random() * 0x7fffffff);
    this.score = 0;
    this.lives = MAX_LIVES;
    this.level = 1;
    this.bestBefore = this.host.getBest();
    this.popups.length = 0;
    this.host.setOverlay(null);
    this.loadCave();
    this.emitHud();
  }

  /** A fixed `seed` replays the same run of caves; 0 draws a new run each game. */
  private caveSeed(level: number): number {
    const base = this.seedCfg > 0 ? this.seedCfg * 1009 : this.runSeed;
    return (base + level * 7919) >>> 0;
  }

  private buildCave(level: number): Cave {
    return generateCave({ seed: this.caveSeed(level), size: this.size, boulders: this.boulderPct, gems: this.target });
  }

  /** (Re)build the current level's cave from its seed: a retry after a death is the same cave. */
  private loadCave() {
    this.cave = this.buildCave(this.level);
    this.tiles = this.cave.tiles;
    this.falling = new Uint8Array(this.tiles.length);
    this.px = this.cave.start.x;
    this.py = this.cave.start.y;
    this.collected = 0;
    this.time = this.timeLimit;
    this.acc = 0;
    this.pending = null;
    this.deathAt = null;
    this.caveStartScore = this.score;
    this.phase = 'playing';
    this.cam = this.camTarget();
  }

  private die() {
    if (this.phase !== 'playing') return;
    this.phase = 'dying';
    this.timer = DIE_TIME;
    this.deathAt = { x: this.px, y: this.py };
    this.tiles[this.py * this.cave.cols + this.px] = EMPTY;
    this.host.audio.tone(140, { type: 'sawtooth', dur: 0.5, vol: 0.08, slideTo: 40 });
    this.host.audio.tone(70, { type: 'square', dur: 0.4, vol: 0.06, delay: 0.05 });
  }

  private exitCave() {
    const rem = Math.ceil(this.time);
    const over = Math.max(0, this.collected - this.target);
    this.lastBonus = rem * 10 + over * rem * 2;
    this.score += this.lastBonus;
    this.phase = 'clear';
    this.timer = CLEAR_TIME;
    this.popups.push({ x: this.px + 0.5, y: this.py, text: `+${fmt(this.lastBonus)}`, age: 0 });
    this.host.audio.arp([523, 659, 784, 1047, 1319], { type: 'triangle', dur: 0.12, vol: 0.07, gap: 0.08 });
    this.emitHud();
  }

  private gameOver() {
    this.phase = 'over';
    const record = this.host.submitScore(this.score);
    this.host.audio.arp([392, 311, 233, 155], { type: 'sawtooth', dur: 0.24, vol: 0.07, gap: 0.15 });
    this.host.setOverlay({
      variant: 'lose',
      kicker: 'Game over',
      title: `Cave ${this.level}`,
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

  private emitHud() {
    const best = Math.max(this.bestBefore, this.score);
    const open = this.collected >= this.target;
    this.host.setHud({
      badge: `CAVE ${this.level}`,
      lives: { current: Math.max(0, this.lives), max: MAX_LIVES },
      stats: [
        { label: 'Gems', value: `${this.collected}/${this.target}`, accent: open },
        { label: 'Time', value: String(Math.ceil(this.time)), accent: this.time <= 15 },
        { label: 'Score', value: fmt(this.score) },
        { label: 'Best', value: fmt(best), accent: this.score > 0 && this.score >= best },
      ],
    });
  }

  /* ------------------------------ The tick ------------------------------ */
  private tick() {
    const d = this.pending ?? (this.held.length ? this.held[this.held.length - 1] : -1);
    this.pending = null;
    if (d >= 0) this.act(d);
    if (this.phase === 'playing') this.physics();
  }

  /** Move (or, holding grab, reach) one tile in direction `d`. */
  private act(d: number) {
    const C = this.cave.cols;
    const nx = this.px + DX[d];
    const ny = this.py + DY[d];
    const n = ny * C + nx;
    const t = this.tiles[n];
    if (t === DIRT || t === EMPTY) {
      if (t === DIRT) this.host.audio.tone(90 + Math.random() * 30, { type: 'triangle', dur: 0.04, vol: 0.03 });
      if (this.grab) this.tiles[n] = EMPTY;
      else this.step(nx, ny);
    } else if (t === GEM) {
      this.collect(nx, ny);
      if (this.grab) this.tiles[n] = EMPTY;
      else this.step(nx, ny);
    } else if (t === EXIT && this.exitOpen() && !this.grab) {
      this.step(nx, ny);
      this.exitCave();
    } else if (t === BOULDER && DY[d] === 0 && !this.grab) {
      const beyond = n + DX[d];
      if (this.tiles[beyond] === EMPTY && !this.falling[n]) {
        this.tiles[beyond] = BOULDER;
        this.falling[n] = 0;
        this.step(nx, ny);
        this.host.audio.tone(70, { type: 'square', dur: 0.06, vol: 0.04 });
      }
    }
  }

  private step(nx: number, ny: number) {
    const C = this.cave.cols;
    this.tiles[this.py * C + this.px] = EMPTY;
    this.px = nx;
    this.py = ny;
    this.tiles[ny * C + nx] = PLAYER;
    this.falling[ny * C + nx] = 0;
  }

  private collect(x: number, y: number) {
    const bonus = this.collected >= this.target;
    const pts = bonus ? BONUS_GEM_POINTS : GEM_POINTS;
    this.collected++;
    this.score += pts;
    this.popups.push({ x: x + 0.5, y, text: `+${pts}`, age: 0 });
    if (this.collected === this.target) {
      this.host.audio.arp([784, 988, 1175, 1568], { type: 'square', dur: 0.08, vol: 0.06, gap: 0.05 });
    } else {
      this.host.audio.tone(bonus ? 1568 : 1175, { type: 'triangle', dur: 0.08, vol: 0.05, slideTo: bonus ? 2093 : 1568 });
    }
    this.emitHud();
  }

  exitOpen() {
    return this.collected >= this.target;
  }

  /**
   * One physics pass, scanned bottom-up so a thing that falls is never moved
   * twice in a tick. Unsupported boulders and gems drop a tile; ones resting on
   * a boulder or gem roll off to a side that is open at both levels. A boulder
   * that was already falling and lands on the player crushes them.
   */
  private physics() {
    const C = this.cave.cols;
    const R = this.cave.rows;
    const t = this.tiles;
    const done = new Uint8Array(t.length);
    let landed = false;
    for (let y = R - 2; y >= 1; y--) {
      for (let x = 1; x < C - 1; x++) {
        const i = y * C + x;
        const v = t[i];
        if ((v !== BOULDER && v !== GEM) || done[i]) continue;
        const below = i + C;
        const under = t[below];
        if (under === EMPTY) {
          this.moveThing(i, below, done);
          continue;
        }
        if (under === PLAYER) {
          if (this.falling[i] && v === BOULDER) {
            this.die();
            return;
          }
          this.falling[i] = 0;
          continue;
        }
        if (under === BOULDER || under === GEM) {
          if (t[i - 1] === EMPTY && t[below - 1] === EMPTY) {
            this.moveThing(i, i - 1, done);
            continue;
          }
          if (t[i + 1] === EMPTY && t[below + 1] === EMPTY) {
            this.moveThing(i, i + 1, done);
            continue;
          }
        }
        if (this.falling[i]) landed = true;
        this.falling[i] = 0;
      }
    }
    if (landed) this.host.audio.tone(60, { type: 'square', dur: 0.07, vol: 0.05 });
  }

  private moveThing(from: number, to: number, done: Uint8Array) {
    this.tiles[to] = this.tiles[from];
    this.tiles[from] = EMPTY;
    this.falling[from] = 0;
    this.falling[to] = 1;
    done[to] = 1;
  }

  /* ------------------------------- Input -------------------------------- */
  onKey(code: string, down: boolean) {
    if (code === 'KeyF') {
      this.grab = down;
      return;
    }
    if (code === 'KeyR') {
      if (down && this.phase === 'playing') this.die();
      return;
    }
    const d = KEY_DIRS[code];
    if (d === undefined) return;
    this.held = this.held.filter((h) => h !== d);
    if (down) {
      this.held.push(d);
      this.pending = d;
    }
  }

  /** Touch: tap on a side of the digger to take one step that way. */
  onPointerDown(p: PointerInfo) {
    if (this.phase !== 'playing') return;
    const dx = p.x - (this.px + 0.5 - this.cam.x) * TILE;
    const dy = p.y - (this.py + 0.5 - this.cam.y) * TILE;
    if (Math.abs(dx) < TILE / 2 && Math.abs(dy) < TILE / 2) return;
    this.pending = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 1) : dy > 0 ? 2 : 0;
  }

  onPause() {
    this.held = [];
    this.grab = false;
  }

  onAction(action: string) {
    if (action === 'start') this.startGame();
    else if (action === 'menu') this.showMenu();
  }

  /** Plain-data view of the run, for `?debug=1` and the headless play script. */
  snapshot() {
    return {
      phase: this.phase,
      level: this.level,
      lives: this.lives,
      score: this.score,
      seed: this.cave.seed,
      cols: this.cave.cols,
      rows: this.cave.rows,
      collected: this.collected,
      target: this.target,
      time: this.time,
      exitOpen: this.exitOpen(),
      player: { x: this.px, y: this.py },
      exit: { ...this.cave.exit },
    };
  }

  /* ------------------------- GameInstance API --------------------------- */
  update(dt: number) {
    this.clock += dt;
    for (let i = this.popups.length - 1; i >= 0; i--) {
      if ((this.popups[i].age += dt) > 1) this.popups.splice(i, 1);
    }
    const target = this.camTarget();
    const k = Math.min(1, dt * 8);
    this.cam.x += (target.x - this.cam.x) * k;
    this.cam.y += (target.y - this.cam.y) * k;

    switch (this.phase) {
      case 'dying':
        if ((this.timer -= dt) <= 0) {
          this.lives--;
          if (this.lives <= 0) this.gameOver();
          else {
            this.score = this.caveStartScore;
            this.loadCave();
            this.emitHud();
          }
        }
        return;
      case 'clear':
        if ((this.timer -= dt) <= 0) {
          this.level++;
          this.loadCave();
          this.emitHud();
        }
        return;
      case 'playing':
        break;
      default:
        return;
    }

    const shown = Math.ceil(this.time);
    this.time = Math.max(0, this.time - dt);
    if (this.time <= 0) {
      this.die();
      return;
    }
    this.acc += dt;
    while (this.acc >= PHYS && this.phase === 'playing') {
      this.acc -= PHYS;
      this.tick();
    }
    if (Math.ceil(this.time) !== shown) this.emitHud();
  }

  private camTarget() {
    return {
      x: clamp(this.px + 0.5 - VIEW_COLS / 2, 0, this.cave.cols - VIEW_COLS),
      y: clamp(this.py + 0.5 - VIEW_ROWS / 2, 0, this.cave.rows - VIEW_ROWS),
    };
  }

  render() {
    const g = this.g;
    const W = this.design.width;
    const H = this.design.height;
    const C = this.cave.cols;
    g.fillStyle = '#0c0a09';
    g.fillRect(0, 0, W, H);

    const ox = Math.round(this.cam.x * TILE);
    const oy = Math.round(this.cam.y * TILE);
    const x0 = Math.max(0, Math.floor(this.cam.x));
    const y0 = Math.max(0, Math.floor(this.cam.y));
    const x1 = Math.min(C, x0 + VIEW_COLS + 1);
    const y1 = Math.min(this.cave.rows, y0 + VIEW_ROWS + 1);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const v = this.tiles[y * C + x];
        const sx = x * TILE - ox;
        const sy = y * TILE - oy;
        if (v === DIRT) this.drawDirt(sx, sy, x, y);
        else if (v === WALL) this.drawWall(sx, sy);
        else if (v === BOULDER) this.drawBoulder(sx, sy);
        else if (v === GEM) this.drawGem(sx, sy, x + y);
        else if (v === EXIT) this.drawExit(sx, sy);
        else if (v === PLAYER) this.drawPlayer(sx, sy);
      }
    }

    if (this.phase === 'dying' && this.deathAt) {
      const f = 1 - this.timer / DIE_TIME;
      const cx = (this.deathAt.x + 0.5) * TILE - ox;
      const cy = (this.deathAt.y + 0.5) * TILE - oy;
      for (let r = 0; r < 3; r++) {
        g.strokeStyle = ['#fde047', '#fb923c', '#ef4444'][r];
        g.globalAlpha = Math.max(0, 1 - f);
        g.lineWidth = 3;
        g.beginPath();
        g.arc(cx, cy, TILE * (0.3 + f * (1.2 + r * 0.5)), 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;
    }

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 11px "Press Start 2P", monospace';
    for (const p of this.popups) {
      g.globalAlpha = 1 - p.age;
      g.fillStyle = '#a5f3fc';
      g.fillText(p.text, p.x * TILE - ox, (p.y + 0.3 - p.age) * TILE - oy);
    }
    g.globalAlpha = 1;

    if (this.phase === 'clear') {
      g.font = 'bold 18px "Press Start 2P", monospace';
      g.fillStyle = '#facc15';
      g.fillText('CAVE CLEAR', W / 2, H / 2 - 24);
      g.font = 'bold 12px "Press Start 2P", monospace';
      g.fillStyle = '#a5f3fc';
      g.fillText(`TIME BONUS +${fmt(this.lastBonus)}`, W / 2, H / 2 + 8);
    } else if (this.phase === 'playing' && this.time <= 10 && Math.floor(this.clock * 4) % 2 === 0) {
      g.font = 'bold 14px "Press Start 2P", monospace';
      g.fillStyle = '#ef4444';
      g.fillText(`${Math.ceil(this.time)}`, W / 2, 20);
    }
  }

  /* ------------------------------ Drawing ------------------------------- */
  private drawDirt(sx: number, sy: number, x: number, y: number) {
    const g = this.g;
    g.fillStyle = '#7c2d12';
    g.fillRect(sx, sy, TILE, TILE);
    g.fillStyle = '#9a3412';
    // Speckles from a cheap per-tile hash so the dirt doesn't shimmer.
    let h = (x * 374761393 + y * 668265263) >>> 0;
    for (let i = 0; i < 5; i++) {
      h = (h ^ (h >>> 13)) * 1274126177 >>> 0;
      g.fillRect(sx + (h % 24) + 2, sy + ((h >>> 8) % 24) + 2, 3, 2);
    }
  }

  private drawWall(sx: number, sy: number) {
    const g = this.g;
    g.fillStyle = '#334155';
    g.fillRect(sx, sy, TILE, TILE);
    g.strokeStyle = '#64748b';
    g.lineWidth = 1;
    g.strokeRect(sx + 1.5, sy + 1.5, TILE - 3, TILE / 2 - 2);
    g.strokeRect(sx + 1.5, sy + TILE / 2 + 0.5, TILE - 3, TILE / 2 - 2);
  }

  private drawBoulder(sx: number, sy: number) {
    const g = this.g;
    const cx = sx + TILE / 2;
    const cy = sy + TILE / 2;
    g.fillStyle = '#78716c';
    g.beginPath();
    g.arc(cx, cy, TILE * 0.45, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#a8a29e';
    g.beginPath();
    g.arc(cx - 3, cy - 3, TILE * 0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#d6d3d1';
    g.beginPath();
    g.arc(cx - 6, cy - 6, 3, 0, Math.PI * 2);
    g.fill();
  }

  private drawGem(sx: number, sy: number, phase: number) {
    const g = this.g;
    const cx = sx + TILE / 2;
    const cy = sy + TILE / 2;
    const r = TILE * 0.4;
    const hue = (this.clock * 90 + phase * 25) % 360;
    g.fillStyle = `hsl(${hue}, 85%, 60%)`;
    g.beginPath();
    g.moveTo(cx, cy - r);
    g.lineTo(cx + r, cy);
    g.lineTo(cx, cy + r);
    g.lineTo(cx - r, cy);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath();
    g.moveTo(cx, cy - r);
    g.lineTo(cx + r * 0.45, cy - r * 0.1);
    g.lineTo(cx, cy);
    g.lineTo(cx - r * 0.45, cy - r * 0.1);
    g.closePath();
    g.fill();
  }

  private drawExit(sx: number, sy: number) {
    const g = this.g;
    this.drawWall(sx, sy);
    const open = this.exitOpen();
    g.fillStyle = open ? (Math.floor(this.clock * 5) % 2 === 0 ? '#facc15' : '#fef08a') : '#1e293b';
    g.fillRect(sx + 6, sy + 4, TILE - 12, TILE - 4);
    g.strokeStyle = open ? '#fef9c3' : '#94a3b8';
    g.lineWidth = 2;
    g.strokeRect(sx + 6, sy + 4, TILE - 12, TILE - 4);
  }

  private drawPlayer(sx: number, sy: number) {
    const g = this.g;
    const cx = sx + TILE / 2;
    // Helmet with a lamp, a face, a body and two legs that shuffle while moving.
    const walk = this.held.length && Math.floor(this.clock * 10) % 2 === 0 ? 2 : 0;
    g.fillStyle = '#2563eb';
    g.fillRect(cx - 6, sy + 13, 12, 9);
    g.fillStyle = '#1e293b';
    g.fillRect(cx - 6, sy + 22, 4, 5 - walk);
    g.fillRect(cx + 2, sy + 22, 4, 5 - (2 - walk));
    g.fillStyle = '#fcd9b6';
    g.beginPath();
    g.arc(cx, sy + 10, 5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#facc15';
    g.beginPath();
    g.arc(cx, sy + 8, 6.5, Math.PI, 0);
    g.fill();
    g.fillStyle = '#fef9c3';
    g.fillRect(cx - 1.5, sy + 2, 3, 3);
    g.fillStyle = '#0f172a';
    g.fillRect(cx - 3, sy + 10, 2, 2);
    g.fillRect(cx + 1, sy + 10, 2, 2);
  }
}
