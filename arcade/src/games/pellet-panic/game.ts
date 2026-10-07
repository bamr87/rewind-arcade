import type { GameContext, GameInstance, PointerInfo } from '../../engine/types';
import { cfgInt, clamp, fmt } from '../../engine/util';
import {
  CHASERS,
  DX,
  DY,
  chaseTarget,
  frightPoints,
  modeAt,
  opposite,
  type ChaserSpec,
  type Mode,
} from './chasers';
import { COLS, DOOR, PATH, PEN, ROWS, WALL, generateMaze, tileAt, wrapX, type Maze, type Pt } from './maze';

const TILE = 20;
/** Player speed in tiles per second; chasers are a percentage of it. */
const PLAYER_SPEED = 7.6;
const READY_TIME = 1.8;
const DIE_TIME = 1.5;
const CLEAR_TIME = 2;
const FRUIT_AT = [70, 170];
const FRUIT_TIME = 9.5;
const FRUIT_POINTS = [100, 200, 300, 400, 500];
const CLEAR_POINTS = 1000;
const HIT = 0.6;
const KEY_DIRS: Record<string, number> = {
  ArrowUp: 0, KeyW: 0, ArrowLeft: 1, KeyA: 1, ArrowDown: 2, KeyS: 2, ArrowRight: 3, KeyD: 3,
};

const WALL_FILL = '#0b1033';
const WALL_EDGE = '#6366f1';
const FLOOR = '#03040b';
const PELLET = '#fde68a';
const PLAYER = '#facc15';
const FRIGHT = '#1d4ed8';

type Phase = 'menu' | 'ready' | 'playing' | 'dying' | 'clear' | 'over';
type ChaserState = 'house' | 'leaving' | 'active' | 'eaten';

/** Tile-centred movement: `t` (0..1) is progress from tile (tx,ty) toward the next one. */
interface Mover {
  tx: number;
  ty: number;
  dir: number;
  t: number;
}
interface Player extends Mover {
  want: number;
  moving: boolean;
  mouth: number;
}
interface Chaser extends Mover {
  spec: ChaserSpec;
  state: ChaserState;
  frightened: boolean;
  wait: number;
}
interface Popup {
  x: number;
  y: number;
  text: string;
  age: number;
}

/**
 * Pellet Panic — an original maze chase in the spirit of the 1980 arcade
 * classic. Eat every pellet while four chasers hunt you; each level is a freshly
 * generated, left-right-mirrored maze (see maze.ts), so no route can be learned.
 */
export class PelletPanic implements GameInstance {
  readonly design = { width: COLS * TILE, height: ROWS * TILE };

  private host: GameContext;
  private g: CanvasRenderingContext2D;

  private maxLives: number;
  private speedPct: number;
  private frightSecs: number;
  private seedCfg: number;

  private phase: Phase = 'menu';
  private runSeed = 0;
  private level = 1;
  private lives = 0;
  private score = 0;
  private bestBefore = 0;

  private maze: Maze;
  private edges: number[] = [];
  private toExit: Int16Array = new Int16Array(0);
  private toHome: Int16Array = new Int16Array(0);
  private pellets: Uint8Array = new Uint8Array(0);
  private pelletsLeft = 0;
  private eatenThisLevel = 0;

  private player: Player = { tx: 0, ty: 0, dir: 1, t: 0, want: -1, moving: true, mouth: 0 };
  private chasers: Chaser[] = [];
  private mode: Mode = 'scatter';
  private modeClock = 0;
  private frightT = 0;
  private chain = 0;
  private fruit: { t: number; value: number } | null = null;
  private timer = 0;
  private clock = 0;
  private waka = false;
  private popups: Popup[] = [];
  private swipeStart: Pt | null = null;

  constructor(ctx: GameContext) {
    this.host = ctx;
    this.g = ctx.ctx;
    const c = ctx.config;
    this.maxLives = clamp(cfgInt(c.lives, 3), 1, 5);
    this.speedPct = clamp(cfgInt(c.chaserSpeed, 85), 70, 110);
    this.frightSecs = clamp(cfgInt(c.fright, 6), 2, 10);
    this.seedCfg = clamp(cfgInt(c.seed, 0), 0, 9999);
    this.maze = this.buildMaze(1);
    this.showMenu();
  }

  /* -------------------------------- Flow -------------------------------- */
  private showMenu() {
    this.phase = 'menu';
    this.runSeed = Math.floor(Math.random() * 0x7fffffff);
    this.level = 1;
    this.maze = this.buildMaze(1);
    this.pellets = this.freshPellets();
    this.resetActors();
    this.phase = 'menu';
    this.host.setHud({ badge: 'PELLET PANIC', stats: [{ label: 'Best', value: fmt(this.host.getBest()) }] });
    this.host.setOverlay({
      variant: 'menu',
      title: 'PELLET PANIC',
      subtitle: 'Clear the maze before the chasers clear you. Every level is a new maze.',
      bullets: [
        { icon: '⬆', text: 'Steer with the arrow keys or W A S D. Press early to turn at the next opening.' },
        { icon: '👆', text: 'On touch, swipe the way you want to go.' },
        { icon: '⚡', text: 'Power pellets turn the chasers blue — eat them for 200, 400, 800, 1600.' },
        { icon: '👻', text: 'Rook chases, Lark ambushes, Moth flanks, and Wisp keeps its distance.' },
      ],
      buttons: [{ action: 'start', label: 'Start game', primary: true }],
    });
  }

  private startGame() {
    this.runSeed = Math.floor(Math.random() * 0x7fffffff);
    this.score = 0;
    this.lives = this.maxLives;
    this.level = 1;
    this.bestBefore = this.host.getBest();
    this.popups.length = 0;
    this.loadLevel();
    this.host.setOverlay(null);
    this.emitHud();
  }

  /** A fixed `seed` replays the same run of mazes; 0 draws a new run each game. */
  private levelSeed(level: number): number {
    const base = this.seedCfg > 0 ? this.seedCfg * 1009 : this.runSeed;
    return (base + level * 7919) >>> 0;
  }

  private buildMaze(level: number): Maze {
    const m = generateMaze(this.levelSeed(level));
    this.edges = wallEdges(m);
    this.toExit = distanceMap(m, m.exit);
    this.toHome = distanceMap(m, m.slots[0]);
    return m;
  }

  private loadLevel() {
    this.maze = this.buildMaze(this.level);
    this.pellets = this.freshPellets();
    this.eatenThisLevel = 0;
    this.fruit = null;
    this.resetActors();
  }

  private freshPellets(): Uint8Array {
    const m = this.maze;
    const out = new Uint8Array(ROWS * COLS);
    this.pelletsLeft = 0;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        if (tileAt(m, x, y) !== PATH) continue;
        if (x === m.spawn.x && y === m.spawn.y) continue;
        // Leave the strip above the pen door clear, as the chasers come out there.
        if (y === m.exit.y && x > m.exit.x - 2 && x < COLS - m.exit.x + 1) continue;
        out[y * COLS + x] = 1;
        this.pelletsLeft++;
      }
    }
    for (const p of m.power) out[p.y * COLS + p.x] = 2;
    return out;
  }

  /** Start (or restart) a life: everyone home, clocks reset, pellets kept. */
  private resetActors() {
    const m = this.maze;
    this.player = { tx: m.spawn.x, ty: m.spawn.y, dir: 1, t: 0, want: -1, moving: true, mouth: 0 };
    this.chasers = CHASERS.map((spec, i) => {
      const at = i === 0 ? m.exit : m.slots[i - 1];
      return {
        spec,
        tx: at.x,
        ty: at.y,
        dir: i === 0 ? 1 : 0,
        t: 0,
        state: i === 0 ? 'active' : 'house',
        frightened: false,
        wait: spec.release,
      };
    });
    this.mode = 'scatter';
    this.modeClock = 0;
    this.frightT = 0;
    this.chain = 0;
    this.timer = READY_TIME;
    this.phase = 'ready';
  }

  private die() {
    this.phase = 'dying';
    this.timer = DIE_TIME;
    this.fruit = null;
    this.host.audio.arp([494, 440, 392, 349, 294, 247], { type: 'square', dur: 0.12, vol: 0.06, gap: 0.11 });
  }

  private levelClear() {
    this.score += CLEAR_POINTS;
    this.phase = 'clear';
    this.timer = CLEAR_TIME;
    this.fruit = null;
    this.popups.push({ x: this.player.tx + 0.5, y: this.player.ty, text: `+${CLEAR_POINTS}`, age: 0 });
    this.host.audio.arp([523, 659, 784, 1047], { type: 'triangle', dur: 0.14, vol: 0.07, gap: 0.09 });
    this.emitHud();
  }

  private gameOver() {
    this.phase = 'over';
    const record = this.host.submitScore(this.score);
    this.host.audio.arp([392, 311, 233, 155], { type: 'sawtooth', dur: 0.24, vol: 0.07, gap: 0.15 });
    this.host.setOverlay({
      variant: 'lose',
      kicker: 'Game over',
      title: `Level ${this.level}`,
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
    this.host.setHud({
      badge: `LEVEL ${this.level}`,
      lives: { current: Math.max(0, this.lives), max: this.maxLives },
      stats: [
        { label: 'Score', value: fmt(this.score) },
        { label: 'Level', value: String(this.level) },
        { label: 'Best', value: fmt(best), accent: this.score > 0 && this.score >= best },
      ],
    });
  }

  /* ------------------------------ Movement ------------------------------ */
  private open(x: number, y: number, door = false): boolean {
    const t = tileAt(this.maze, x, y);
    return t === PATH || (door && (t === DOOR || t === PEN));
  }

  private canGo(m: Mover, d: number, door = false): boolean {
    return d >= 0 && this.open(m.tx + DX[d], m.ty + DY[d], door);
  }

  /** Turn around on the spot, mid-tile or not. */
  private reverse(m: Mover, door = false) {
    if (m.dir < 0) return;
    if (m.t > 0) {
      m.tx = wrapX(m.tx + DX[m.dir]);
      m.ty += DY[m.dir];
      m.t = 1 - m.t;
      m.dir = opposite(m.dir);
    } else if (this.canGo(m, opposite(m.dir), door)) {
      m.dir = opposite(m.dir);
    }
  }

  /** Move `dist` tiles, calling `atCenter` on each tile reached; it returns false to stop. */
  private advance(m: Mover, dist: number, atCenter: () => boolean) {
    let guard = 0;
    while (dist > 0 && m.dir >= 0 && guard++ < 8) {
      const left = 1 - m.t;
      if (dist < left) {
        m.t += dist;
        return;
      }
      dist -= left;
      m.tx = wrapX(m.tx + DX[m.dir]);
      m.ty += DY[m.dir];
      m.t = 0;
      if (!atCenter()) return;
    }
  }

  private pos(m: Mover): Pt {
    return m.dir < 0 ? { x: m.tx, y: m.ty } : { x: m.tx + DX[m.dir] * m.t, y: m.ty + DY[m.dir] * m.t };
  }

  private movePlayer(dt: number) {
    const p = this.player;
    if (p.want >= 0 && p.want !== p.dir) {
      if (p.moving && p.t > 0 && p.want === opposite(p.dir)) this.reverse(p);
      else if (p.t === 0 && this.canGo(p, p.want)) {
        p.dir = p.want;
        p.moving = true;
      }
    }
    if (!p.moving) return;
    p.mouth += dt;
    this.advance(p, PLAYER_SPEED * dt, () => this.playerAtCenter());
  }

  private playerAtCenter(): boolean {
    const p = this.player;
    this.eatAt(p.tx, p.ty);
    if (this.phase !== 'playing') return false;
    // Buffered turn: a direction pressed early is taken at the first opening.
    if (this.canGo(p, p.want)) p.dir = p.want;
    if (!this.canGo(p, p.dir)) {
      p.moving = false;
      return false;
    }
    return true;
  }

  private chaserSpeed(c: Chaser): number {
    if (c.state === 'eaten') return PLAYER_SPEED * 2;
    if (c.state === 'leaving') return PLAYER_SPEED * 0.5;
    if (c.frightened) return PLAYER_SPEED * 0.55;
    const base = PLAYER_SPEED * (this.speedPct / 100) * Math.min(1.2, 1 + 0.04 * (this.level - 1));
    const inTunnel = this.maze.tunnels.includes(c.ty) && (c.tx < 4 || c.tx > COLS - 5);
    return inTunnel ? base * 0.5 : base;
  }

  private moveChaser(c: Chaser, dt: number) {
    if (c.state === 'house') {
      c.wait -= dt;
      if (c.wait <= 0) {
        c.state = 'leaving';
        c.dir = this.chooseDir(c);
      }
      return;
    }
    if (c.dir < 0 || (c.t === 0 && !this.canGo(c, c.dir, c.state !== 'active'))) c.dir = this.chooseDir(c);
    this.advance(c, this.chaserSpeed(c) * dt, () => this.chaserAtCenter(c));
  }

  private chaserAtCenter(c: Chaser): boolean {
    const here = tileAt(this.maze, c.tx, c.ty);
    if (c.state === 'leaving' && here === PATH) c.state = 'active';
    else if (c.state === 'eaten' && here === PEN) {
      c.state = 'leaving';
      c.frightened = false;
    }
    c.dir = this.chooseDir(c);
    return c.dir >= 0;
  }

  /** The chaser's current target tile — scatter corner or its chase rule. */
  targetOf(c: Chaser): Pt {
    if (this.mode === 'scatter') return c.spec.corner;
    const p = this.player;
    const rook = this.chasers[0];
    return chaseTarget(c.spec.rule, { x: p.tx, y: p.ty, dir: p.dir }, { x: c.tx, y: c.ty }, { x: rook.tx, y: rook.ty }, c.spec.corner);
  }

  private chooseDir(c: Chaser): number {
    if (c.state === 'leaving' || c.state === 'eaten') {
      // Through the door: follow the precomputed distance map, never a guess.
      const map = c.state === 'leaving' ? this.toExit : this.toHome;
      let best = -1;
      let bestD = Infinity;
      for (let d = 0; d < 4; d++) {
        if (!this.canGo(c, d, true)) continue;
        const v = map[(c.ty + DY[d]) * COLS + wrapX(c.tx + DX[d])];
        if (v >= 0 && v < bestD) {
          bestD = v;
          best = d;
        }
      }
      return best;
    }
    const options = [0, 1, 2, 3].filter((d) => (c.dir < 0 || d !== opposite(c.dir)) && this.canGo(c, d));
    if (!options.length) return this.canGo(c, opposite(c.dir)) ? opposite(c.dir) : -1;
    if (c.frightened) return options[Math.floor(Math.random() * options.length)];
    const target = this.targetOf(c);
    let best = options[0];
    let bestD = Infinity;
    for (const d of options) {
      const dist = Math.hypot(c.tx + DX[d] - target.x, c.ty + DY[d] - target.y);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  }

  /* ------------------------------- Events ------------------------------- */
  private eatAt(x: number, y: number) {
    const i = y * COLS + x;
    const v = this.pellets[i];
    if (!v) return;
    this.pellets[i] = 0;
    this.pelletsLeft--;
    this.eatenThisLevel++;
    if (v === 2) {
      this.score += 50;
      this.frighten();
    } else {
      this.score += 10;
      this.waka = !this.waka;
      this.host.audio.tone(this.waka ? 520 : 390, { type: 'triangle', dur: 0.05, vol: 0.04 });
    }
    if (FRUIT_AT.includes(this.eatenThisLevel)) {
      this.fruit = { t: FRUIT_TIME, value: FRUIT_POINTS[Math.min(this.level - 1, FRUIT_POINTS.length - 1)] };
    }
    if (this.pelletsLeft <= 0) this.levelClear();
    else this.emitHud();
  }

  private frighten() {
    this.frightT = this.frightSecs;
    this.chain = 0;
    for (const c of this.chasers) {
      if (c.state !== 'active' || c.frightened) continue;
      c.frightened = true;
      this.reverse(c);
    }
    this.host.audio.arp([330, 440, 660], { type: 'square', dur: 0.08, vol: 0.05, gap: 0.05 });
  }

  private eatChaser(c: Chaser) {
    const pts = frightPoints(this.chain++);
    this.score += pts;
    c.state = 'eaten';
    c.frightened = false;
    const at = this.pos(c);
    this.popups.push({ x: at.x + 0.5, y: at.y, text: String(pts), age: 0 });
    this.host.audio.tone(260, { type: 'square', dur: 0.22, vol: 0.06, slideTo: 1300 });
    this.emitHud();
  }

  private collide() {
    const pp = this.pos(this.player);
    const near = (q: Pt) => {
      const dx = Math.abs(pp.x - q.x);
      return Math.hypot(Math.min(dx, COLS - dx), pp.y - q.y) < HIT;
    };
    if (this.fruit && near(this.maze.spawn)) {
      const v = this.fruit.value;
      this.score += v;
      this.popups.push({ x: this.maze.spawn.x + 0.5, y: this.maze.spawn.y, text: String(v), age: 0 });
      this.fruit = null;
      this.host.audio.arp([784, 988, 1175], { type: 'triangle', dur: 0.07, vol: 0.06, gap: 0.05 });
      this.emitHud();
    }
    for (const c of this.chasers) {
      if (c.state !== 'active' || !near(this.pos(c))) continue;
      if (c.frightened) this.eatChaser(c);
      else {
        this.die();
        return;
      }
    }
  }

  private tick(dt: number) {
    if (this.frightT > 0) {
      this.frightT -= dt;
      if (this.frightT <= 0) {
        this.frightT = 0;
        for (const c of this.chasers) c.frightened = false;
      }
    } else {
      // The scatter/chase clock stands still while the chasers are frightened.
      this.modeClock += dt;
      const m = modeAt(this.modeClock);
      if (m !== this.mode) {
        this.mode = m;
        for (const c of this.chasers) if (c.state === 'active') this.reverse(c);
      }
    }
    if (this.fruit && (this.fruit.t -= dt) <= 0) this.fruit = null;
    this.movePlayer(dt);
    if (this.phase !== 'playing') return;
    for (const c of this.chasers) this.moveChaser(c, dt);
    this.collide();
  }

  /* ------------------------------- Input -------------------------------- */
  onKey(code: string, down: boolean) {
    if (!down || this.phase === 'menu' || this.phase === 'over') return;
    const d = KEY_DIRS[code];
    if (d !== undefined) this.player.want = d;
  }

  onPointerDown(p: PointerInfo) {
    this.swipeStart = { x: p.x, y: p.y };
  }

  onPointerUp(p: PointerInfo) {
    if (!this.swipeStart) return;
    const dx = p.x - this.swipeStart.x;
    const dy = p.y - this.swipeStart.y;
    this.swipeStart = null;
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
    if (Math.abs(dx) > Math.abs(dy)) this.player.want = dx > 0 ? 3 : 1;
    else this.player.want = dy > 0 ? 2 : 0;
  }

  onAction(action: string) {
    if (action === 'start') this.startGame();
    else if (action === 'menu') this.showMenu();
  }

  /** Plain-data view of the run, for `?debug=1` and the headless play script. */
  snapshot() {
    const p = this.player;
    return {
      phase: this.phase,
      level: this.level,
      lives: this.lives,
      score: this.score,
      seed: this.maze.seed,
      pelletsLeft: this.pelletsLeft,
      mode: this.mode,
      frightT: this.frightT,
      player: { x: p.tx, y: p.ty, t: p.t, dir: p.dir, want: p.want, moving: p.moving },
      chasers: this.chasers.map((c) => ({
        name: c.spec.name,
        rule: c.spec.rule,
        state: c.state,
        frightened: c.frightened,
        x: c.tx,
        y: c.ty,
        dir: c.dir,
        target: this.targetOf(c),
      })),
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
          if (this.lives <= 0) this.gameOver();
          else {
            this.resetActors();
            this.emitHud();
          }
        }
        return;
      case 'clear':
        if ((this.timer -= dt) <= 0) {
          this.level++;
          this.loadLevel();
          this.emitHud();
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
    const m = this.maze;

    g.fillStyle = WALL_FILL;
    g.fillRect(0, 0, W, H);
    g.fillStyle = FLOOR;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) if (tileAt(m, x, y) !== WALL) g.fillRect(x * TILE, y * TILE, TILE, TILE);
    }

    const flash = this.phase === 'clear' && Math.floor(this.clock * 6) % 2 === 0;
    g.strokeStyle = flash ? '#ffffff' : WALL_EDGE;
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i < this.edges.length; i += 4) {
      g.moveTo(this.edges[i], this.edges[i + 1]);
      g.lineTo(this.edges[i + 2], this.edges[i + 3]);
    }
    g.stroke();

    g.strokeStyle = '#f9a8d4';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo((m.exit.x) * TILE, (m.exit.y + 1.5) * TILE);
    g.lineTo((COLS - m.exit.x) * TILE, (m.exit.y + 1.5) * TILE);
    g.stroke();

    // Pellets; the power pellets blink.
    const blink = Math.floor(this.clock * 4) % 2 === 0 || this.phase !== 'playing';
    for (let i = 0; i < this.pellets.length; i++) {
      const v = this.pellets[i];
      if (!v) continue;
      const cx = (i % COLS) * TILE + TILE / 2;
      const cy = Math.floor(i / COLS) * TILE + TILE / 2;
      g.fillStyle = PELLET;
      if (v === 1) g.fillRect(cx - 2, cy - 2, 4, 4);
      else if (blink) {
        g.beginPath();
        g.arc(cx, cy, 6, 0, Math.PI * 2);
        g.fill();
      }
    }

    if (this.fruit) this.drawFruit((m.spawn.x + 0.5) * TILE, (m.spawn.y + 0.5) * TILE);
    if (this.phase !== 'menu') for (const c of this.chasers) if (this.phase !== 'dying' || c.state === 'eaten') this.drawChaser(c);
    if (this.phase !== 'menu') this.drawPlayer();

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 11px "Press Start 2P", monospace';
    for (const p of this.popups) {
      g.globalAlpha = 1 - p.age;
      g.fillStyle = '#a5f3fc';
      g.fillText(p.text, p.x * TILE, (p.y + 0.5 - p.age) * TILE);
    }
    g.globalAlpha = 1;

    const banner = this.phase === 'ready' ? 'READY!' : this.phase === 'clear' ? 'MAZE CLEAR' : '';
    if (banner) {
      g.font = 'bold 16px "Press Start 2P", monospace';
      g.fillStyle = this.phase === 'ready' ? PLAYER : '#a5f3fc';
      g.fillText(banner, W / 2, (m.exit.y + 7.5) * TILE);
    }
  }

  /* ------------------------------ Drawing ------------------------------- */
  private drawPlayer() {
    const g = this.g;
    const p = this.player;
    const at = this.pos(p);
    const cx = (at.x + 0.5) * TILE;
    const cy = (at.y + 0.5) * TILE;
    const facing = [-Math.PI / 2, Math.PI, Math.PI / 2, 0][p.dir];
    let mouth = p.moving ? 0.08 + 0.62 * Math.abs(Math.sin(p.mouth * 14)) : 0.35;
    let r = 8.5;
    if (this.phase === 'dying') {
      const f = 1 - this.timer / DIE_TIME;
      mouth = 0.35 + f * (Math.PI - 0.35);
      r = 8.5 * (1 - f * 0.4);
    }
    g.fillStyle = PLAYER;
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, r, facing + mouth / 2, facing + Math.PI * 2 - mouth / 2);
    g.closePath();
    g.fill();
    if (this.phase !== 'dying') {
      // A single eye on the "upper" side of the direction of travel.
      const side = facing - Math.PI / 2 + (p.dir === 1 ? Math.PI : 0);
      g.fillStyle = '#1c1917';
      g.beginPath();
      g.arc(cx + Math.cos(side) * 4 + Math.cos(facing) * 1.5, cy + Math.sin(side) * 4 + Math.sin(facing) * 1.5, 1.6, 0, Math.PI * 2);
      g.fill();
    }
  }

  private drawChaser(c: Chaser) {
    const g = this.g;
    const at = this.pos(c);
    const bob = c.state === 'house' ? Math.sin(this.clock * 6 + c.spec.release) * 2 : 0;
    const cx = (at.x + 0.5) * TILE;
    const cy = (at.y + 0.5) * TILE + bob;
    if (c.state !== 'eaten') {
      const ending = this.frightT < 2 && Math.floor(this.clock * 6) % 2 === 0;
      g.fillStyle = c.frightened ? (ending ? '#e2e8f0' : FRIGHT) : c.spec.color;
      // A rounded diamond with a crest — original, not the arcade silhouette.
      g.beginPath();
      g.moveTo(cx, cy - 10);
      g.quadraticCurveTo(cx + 3, cy - 6, cx + 9, cy - 1);
      g.quadraticCurveTo(cx + 10, cy + 1, cx + 8, cy + 3);
      g.lineTo(cx + 2, cy + 9);
      g.quadraticCurveTo(cx, cy + 10.5, cx - 2, cy + 9);
      g.lineTo(cx - 8, cy + 3);
      g.quadraticCurveTo(cx - 10, cy + 1, cx - 9, cy - 1);
      g.quadraticCurveTo(cx - 3, cy - 6, cx, cy - 10);
      g.closePath();
      g.fill();
      if (c.frightened) {
        g.strokeStyle = ending ? FRIGHT : '#e2e8f0';
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(cx - 5, cy + 4);
        g.lineTo(cx - 2.5, cy + 2);
        g.lineTo(cx, cy + 4);
        g.lineTo(cx + 2.5, cy + 2);
        g.lineTo(cx + 5, cy + 4);
        g.stroke();
        g.fillStyle = '#e2e8f0';
        g.fillRect(cx - 4, cy - 3, 2, 2);
        g.fillRect(cx + 2, cy - 3, 2, 2);
        return;
      }
    }
    const lx = c.dir >= 0 ? DX[c.dir] * 1.5 : 0;
    const ly = c.dir >= 0 ? DY[c.dir] * 1.5 : 0;
    for (const s of [-1, 1]) {
      g.fillStyle = '#f8fafc';
      g.beginPath();
      g.arc(cx + s * 3.6, cy - 1.5, 2.8, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1e3a8a';
      g.beginPath();
      g.arc(cx + s * 3.6 + lx, cy - 1.5 + ly, 1.4, 0, Math.PI * 2);
      g.fill();
    }
  }

  private drawFruit(cx: number, cy: number) {
    const g = this.g;
    g.strokeStyle = '#4ade80';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(cx - 3, cy - 1);
    g.lineTo(cx + 1, cy - 8);
    g.lineTo(cx + 4, cy);
    g.stroke();
    g.fillStyle = '#e11d48';
    for (const [ox, oy] of [[-3.5, 2], [4, 3]]) {
      g.beginPath();
      g.arc(cx + ox, cy + oy, 3.6, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** Wall outline segments (x1,y1,x2,y2 in pixels) wherever a wall meets open floor. */
function wallEdges(m: Maze): number[] {
  const out: number[] = [];
  const open = (x: number, y: number) => x >= 0 && x < COLS && tileAt(m, x, y) !== WALL;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (tileAt(m, x, y) !== WALL) continue;
      const l = x * TILE;
      const t = y * TILE;
      if (open(x, y - 1)) out.push(l, t, l + TILE, t);
      if (open(x, y + 1)) out.push(l, t + TILE, l + TILE, t + TILE);
      if (open(x - 1, y)) out.push(l, t, l, t + TILE);
      if (open(x + 1, y)) out.push(l + TILE, t, l + TILE, t + TILE);
    }
  }
  return out;
}

/** Breadth-first step counts to `goal` through corridors, the door and the pen (-1 = unreachable). */
function distanceMap(m: Maze, goal: Pt): Int16Array {
  const dist = new Int16Array(ROWS * COLS).fill(-1);
  const passable = (x: number, y: number) => tileAt(m, x, y) !== WALL;
  dist[goal.y * COLS + goal.x] = 0;
  const queue: Pt[] = [goal];
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    const d = dist[p.y * COLS + p.x];
    for (let k = 0; k < 4; k++) {
      const nx = wrapX(p.x + DX[k]);
      const ny = p.y + DY[k];
      if (!passable(nx, ny) || dist[ny * COLS + nx] >= 0) continue;
      dist[ny * COLS + nx] = d + 1;
      queue.push({ x: nx, y: ny });
    }
  }
  return dist;
}
