import type { GameContext, GameInstance, PointerInfo } from '../../engine/types';
import { cfgInt, cfgStr, clamp, fmt } from '../../engine/util';

/** Directions: 0 up, 1 left, 2 down, 3 right — so `(d + 2) % 4` is the reverse. */
const DX = [0, -1, 0, 1];
const DY = [-1, 0, 1, 0];
const opposite = (d: number) => (d + 2) % 4;

/** Every arena fills the same 840×540 box; a bigger arena just has smaller cells. */
const ARENAS: Record<string, { cols: number; rows: number; cell: number }> = {
  small: { cols: 42, rows: 27, cell: 20 },
  medium: { cols: 56, rows: 36, cell: 15 },
  large: { cols: 70, rows: 45, cell: 12 },
};

const BOOST_TIME = 0.4;
const BOOST_COOLDOWN = 3;
const READY_TIME = 1.2;
const ROUND_END_TIME = 1.6;
const MAX_QUEUE = 2;
const ROUND_POINTS = 1000;
const SECOND_POINTS = 10;
const MATCH_POINTS = 500;

const P1_KEYS: Record<string, number> = { KeyW: 0, KeyA: 1, KeyS: 2, KeyD: 3 };
const ARROWS: Record<string, number> = { ArrowUp: 0, ArrowLeft: 1, ArrowDown: 2, ArrowRight: 3 };

const BG = '#020617';
const GRID = 'rgba(56,189,248,0.07)';
const COLORS = ['#22d3ee', '#fb923c'];

type Phase = 'menu' | 'ready' | 'playing' | 'round' | 'over';

interface Cycle {
  x: number;
  y: number;
  dir: number;
  /** Turns waiting to be taken, one per step. */
  queue: number[];
  alive: boolean;
  /** Ticks of boost left; counted in ticks so a boost is the same distance at any frame rate. */
  boostT: number;
  cooldown: number;
  /** Half-steps banked toward the next move: a boosting cycle banks two per tick. */
  sub: number;
  /** Occupancy value this cycle's trail writes (1 or 2). */
  mark: number;
}

/**
 * Gridlock — an original light-cycle duel in the spirit of the 1982 arcade
 * cycles and QBasic Nibbles. Two cycles leave solid trails; the last one moving
 * wins the round. A short boost doubles speed and draws no trail, so it can cut
 * an escape hatch through a trap — or leave one for the other rider.
 */
export class Gridlock implements GameInstance {
  readonly design = { width: 840, height: 540 };

  private host: GameContext;
  private g: CanvasRenderingContext2D;

  private mode: string;
  private ai: number;
  private rounds: number;
  private speed: number;
  private cols: number;
  private rows: number;
  private cell: number;

  private phase: Phase = 'menu';
  private grid: Uint8Array;
  private cycles: Cycle[] = [];
  /** Fractional ticks banked from `dt`; one tick is half a cell at base speed. */
  private acc = 0;
  private timer = 0;
  private roundTime = 0;
  private wins = [0, 0];
  private score = 0;
  private bestBefore = 0;
  private lastResult: 'p1' | 'p2' | 'draw' | null = null;
  private crashAt: { x: number; y: number }[] = [];
  private clock = 0;
  private swipeStart: { x: number; y: number } | null = null;

  constructor(ctx: GameContext) {
    this.host = ctx;
    this.g = ctx.ctx;
    const c = ctx.config;
    this.mode = cfgStr(c.mode, 'ai') === 'two' ? 'two' : 'ai';
    this.ai = clamp(cfgInt(c.ai, 70), 30, 100);
    this.rounds = clamp(cfgInt(c.rounds, 3), 1, 9);
    this.speed = clamp(cfgInt(c.speed, 10), 6, 20);
    const arena = ARENAS[cfgStr(c.arena, 'medium')] ?? ARENAS.medium;
    this.cols = arena.cols;
    this.rows = arena.rows;
    this.cell = arena.cell;
    this.grid = new Uint8Array(this.cols * this.rows);
    this.resetRound();
    this.showMenu();
  }

  /* -------------------------------- Flow -------------------------------- */
  private showMenu() {
    this.phase = 'menu';
    this.wins = [0, 0];
    this.score = 0;
    this.resetRound();
    this.phase = 'menu';
    this.host.setHud({ badge: this.badge(), stats: [{ label: 'Best', value: fmt(this.host.getBest()) }] });
    this.host.setOverlay({
      variant: 'menu',
      title: 'GRIDLOCK',
      subtitle: 'Your cycle leaves a wall. Theirs does too. Last one moving wins the round.',
      bullets:
        this.mode === 'ai'
          ? [
              { icon: '⬆', text: 'Steer with W A S D or the arrow keys. You can never turn straight back.' },
              { icon: '⚡', text: 'F boosts: double speed for a moment, and no trail — cut yourself a way out.' },
              { icon: '🏁', text: `First to ${this.rounds} round${this.rounds === 1 ? '' : 's'} takes the match.` },
            ]
          : [
              { icon: '🔵', text: 'Player 1: W A S D to steer, F to boost.' },
              { icon: '🟠', text: 'Player 2: arrow keys to steer, L to boost.' },
              { icon: '⚡', text: 'A boost doubles speed and leaves a gap in the trail.' },
              { icon: '🏁', text: `First to ${this.rounds} round${this.rounds === 1 ? '' : 's'} takes the match.` },
            ],
      buttons: [{ action: 'start', label: 'Start match', primary: true }],
    });
  }

  private startMatch() {
    this.wins = [0, 0];
    this.score = 0;
    this.bestBefore = this.host.getBest();
    this.host.setOverlay(null);
    this.resetRound();
    this.emitHud();
  }

  private resetRound() {
    this.grid.fill(0);
    const y = Math.floor(this.rows / 2);
    const x1 = Math.floor(this.cols / 4);
    const x2 = this.cols - 1 - x1;
    this.cycles = [this.newCycle(x1, y, 3, 1), this.newCycle(x2, y, 1, 2)];
    for (const c of this.cycles) this.grid[c.y * this.cols + c.x] = c.mark;
    this.acc = 0;
    this.roundTime = 0;
    this.crashAt = [];
    this.lastResult = null;
    this.timer = READY_TIME;
    this.phase = 'ready';
  }

  private newCycle(x: number, y: number, dir: number, mark: number): Cycle {
    return { x, y, dir, queue: [], alive: true, boostT: 0, cooldown: 0, sub: 0, mark };
  }

  private endRound(result: 'p1' | 'p2' | 'draw') {
    this.lastResult = result;
    if (result === 'p1') {
      this.wins[0]++;
      this.score += ROUND_POINTS + SECOND_POINTS * Math.floor(this.roundTime);
      this.host.audio.arp([523, 659, 784], { type: 'square', dur: 0.1, vol: 0.06, gap: 0.08 });
    } else if (result === 'p2') {
      this.wins[1]++;
      this.host.audio.arp([392, 330, 262], { type: 'sawtooth', dur: 0.12, vol: 0.06, gap: 0.09 });
    } else {
      this.host.audio.tone(180, { type: 'sawtooth', dur: 0.35, vol: 0.07, slideTo: 60 });
    }
    this.emitHud();
    if (this.wins[0] >= this.rounds || this.wins[1] >= this.rounds) this.endMatch();
    else {
      this.phase = 'round';
      this.timer = ROUND_END_TIME;
    }
  }

  private endMatch() {
    const won = this.wins[0] >= this.rounds;
    if (won) this.score += MATCH_POINTS;
    this.phase = 'over';
    const record = this.host.submitScore(this.score);
    const rival = this.mode === 'ai' ? 'CPU' : 'Player 2';
    this.host.audio.arp(won ? [392, 523, 659, 784] : [330, 247, 196], { type: 'square', dur: 0.12, vol: 0.06, gap: 0.1 });
    this.host.setOverlay({
      variant: won ? 'win' : 'lose',
      kicker: won ? (this.mode === 'ai' ? 'Match won' : 'Player 1 wins') : `${rival} wins`,
      title: `${this.wins[0]} – ${this.wins[1]}`,
      bigStat: {
        label: 'Score',
        value: fmt(this.score),
        note: record && this.score > this.bestBefore ? '★ New best!' : undefined,
      },
      rows: [{ label: 'Best', value: fmt(Math.max(this.score, this.host.getBest())) }],
      buttons: [
        { action: 'start', label: 'Rematch', primary: true },
        { action: 'menu', label: 'Title', ghost: true },
      ],
    });
    this.emitHud();
  }

  private badge() {
    return this.mode === 'ai' ? 'VS CPU' : 'VS P2';
  }

  private emitHud() {
    const best = Math.max(this.bestBefore, this.score);
    const p1 = this.cycles[0];
    const ready = p1.cooldown <= 0;
    this.host.setHud({
      badge: this.badge(),
      progress: {
        value: ready ? 1 : 1 - p1.cooldown / BOOST_COOLDOWN,
        label: ready ? 'Boost ready' : 'Boost',
        complete: ready,
      },
      stats: [
        { label: 'P1', value: String(this.wins[0]), accent: true },
        { label: this.mode === 'ai' ? 'CPU' : 'P2', value: String(this.wins[1]) },
        { label: 'Score', value: fmt(this.score) },
        { label: 'Best', value: fmt(best), accent: this.score > 0 && this.score >= best },
      ],
    });
  }

  /* ------------------------------ Movement ------------------------------ */
  private inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  private free(x: number, y: number) {
    return this.inside(x, y) && this.grid[y * this.cols + x] === 0;
  }

  /** Queue a turn; a reversal of the direction it would follow is ignored. */
  private steer(c: Cycle, d: number) {
    if (!c.alive || c.queue.length >= MAX_QUEUE) return;
    const last = c.queue.length ? c.queue[c.queue.length - 1] : c.dir;
    if (d === last || d === opposite(last)) return;
    c.queue.push(d);
  }

  private boost(c: Cycle) {
    if (!c.alive || c.cooldown > 0 || this.phase !== 'playing') return;
    c.boostT = Math.round(BOOST_TIME * this.speed * 2);
    c.cooldown = BOOST_COOLDOWN;
    this.host.audio.tone(330, { type: 'sawtooth', dur: 0.18, vol: 0.05, slideTo: 990 });
  }

  /**
   * One tick = half a cell at base speed. A cycle moves every second tick, or
   * every tick while boosting, and both cycles move in the same tick so a
   * head-on meeting is seen as one event rather than in whichever order they
   * happened to be updated.
   */
  private tick() {
    const movers: Cycle[] = [];
    const boosted = new Set<Cycle>();
    for (const c of this.cycles) {
      if (!c.alive) continue;
      if (c.boostT > 0) {
        c.boostT--;
        c.sub += 2;
        boosted.add(c);
      } else c.sub += 1;
      if (c.sub < 2) continue;
      c.sub -= 2;
      if (c === this.cycles[1] && this.mode === 'ai') this.think(c);
      const turn = c.queue.shift();
      if (turn !== undefined) c.dir = turn;
      movers.push(c);
    }
    if (!movers.length) return;

    const next = movers.map((c) => ({ x: c.x + DX[c.dir], y: c.y + DY[c.dir] }));
    const crashed = new Set<Cycle>();
    movers.forEach((c, i) => {
      const n = next[i];
      if (!this.free(n.x, n.y)) crashed.add(c);
      // A boosting head leaves no trail cell, so the other head is checked directly.
      for (const o of this.cycles) if (o !== c && o.alive && o.x === n.x && o.y === n.y) crashed.add(c);
    });
    if (movers.length === 2 && next[0].x === next[1].x && next[0].y === next[1].y) {
      crashed.add(movers[0]);
      crashed.add(movers[1]);
    }
    movers.forEach((c, i) => {
      if (crashed.has(c)) {
        c.alive = false;
        this.crashAt.push({ x: next[i].x, y: next[i].y });
        return;
      }
      c.x = next[i].x;
      c.y = next[i].y;
      if (!boosted.has(c)) this.grid[c.y * this.cols + c.x] = c.mark;
    });
    if (crashed.size) {
      const [a, b] = this.cycles;
      this.host.audio.tone(110, { type: 'square', dur: 0.25, vol: 0.07, slideTo: 40 });
      this.endRound(!a.alive && !b.alive ? 'draw' : a.alive ? 'p1' : 'p2');
    }
  }

  /** Count open cells reachable from (x, y), stopping at `cap`. */
  private space(x: number, y: number, cap: number): number {
    if (!this.free(x, y)) return 0;
    const seen = new Uint8Array(this.grid.length);
    const queue = [y * this.cols + x];
    seen[queue[0]] = 1;
    for (let head = 0; head < queue.length && queue.length < cap; head++) {
      const i = queue[head];
      const cx = i % this.cols;
      const cy = (i - cx) / this.cols;
      for (let d = 0; d < 4; d++) {
        const nx = cx + DX[d];
        const ny = cy + DY[d];
        if (!this.free(nx, ny)) continue;
        const j = ny * this.cols + nx;
        if (seen[j]) continue;
        seen[j] = 1;
        queue.push(j);
      }
    }
    return Math.min(queue.length, cap);
  }

  /**
   * The CPU rider: weigh straight, left and right by how much room each leaves
   * (a capped flood fill), preferring straight on a tie. `ai` sets how far it
   * looks and how often it bothers to look at all.
   */
  private think(c: Cycle) {
    if (c.queue.length) return;
    const options = [c.dir, (c.dir + 1) % 4, (c.dir + 3) % 4];
    const lazy = Math.random() * 100 > this.ai + 20;
    const straightOpen = this.free(c.x + DX[c.dir], c.y + DY[c.dir]);
    if (lazy && straightOpen) return;
    // A careless rider only checks the next cell and takes any open one, which is
    // how it wanders into a dead end. The lower the skill, the more often.
    const slack = (100 - this.ai) / 100;
    if (Math.random() < slack * slack * 0.5) {
      const open = options.filter((d) => this.free(c.x + DX[d], c.y + DY[d]));
      const pick = open[Math.floor(Math.random() * open.length)];
      if (pick !== undefined && pick !== c.dir) c.queue.push(pick);
      return;
    }
    const cap = Math.round(8 + this.ai * 4);
    let best = c.dir;
    let bestRoom = -1;
    for (const d of options) {
      let room = this.space(c.x + DX[d], c.y + DY[d], cap);
      // Never steer into the other rider's next cell if a better option exists.
      const o = this.cycles[0];
      if (o.alive && c.x + DX[d] === o.x + DX[o.dir] && c.y + DY[d] === o.y + DY[o.dir]) room = Math.min(room, 1);
      if (room > bestRoom) {
        bestRoom = room;
        best = d;
      }
    }
    if (best !== c.dir) c.queue.push(best);
    // Cornered: a skilled rider boosts and hopes to punch through before it closes.
    if (bestRoom < 6 && this.ai >= 50 && c.cooldown <= 0) this.boost(c);
  }

  /* ------------------------------- Input -------------------------------- */
  onKey(code: string, down: boolean) {
    if (!down || (this.phase !== 'playing' && this.phase !== 'ready')) return;
    const [p1, p2] = this.cycles;
    const two = this.mode === 'two';
    if (P1_KEYS[code] !== undefined) this.steer(p1, P1_KEYS[code]);
    else if (ARROWS[code] !== undefined) this.steer(two ? p2 : p1, ARROWS[code]);
    else if (code === 'KeyF') this.boost(p1);
    else if (code === 'KeyL') this.boost(two ? p2 : p1);
  }

  onPointerDown(p: PointerInfo) {
    this.swipeStart = { x: p.x, y: p.y };
  }

  /** Touch: swipe to steer player 1, tap to boost. */
  onPointerUp(p: PointerInfo) {
    if (!this.swipeStart || this.phase !== 'playing') return;
    const dx = p.x - this.swipeStart.x;
    const dy = p.y - this.swipeStart.y;
    this.swipeStart = null;
    const p1 = this.cycles[0];
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) this.boost(p1);
    else if (Math.abs(dx) > Math.abs(dy)) this.steer(p1, dx > 0 ? 3 : 1);
    else this.steer(p1, dy > 0 ? 2 : 0);
  }

  onAction(action: string) {
    if (action === 'start') this.startMatch();
    else if (action === 'menu') this.showMenu();
  }

  /** Plain-data view of the match, for `?debug=1` and the headless play script. */
  snapshot() {
    return {
      phase: this.phase,
      mode: this.mode,
      cols: this.cols,
      rows: this.rows,
      wins: [...this.wins],
      score: this.score,
      roundTime: this.roundTime,
      lastResult: this.lastResult,
      cycles: this.cycles.map((c) => ({
        x: c.x,
        y: c.y,
        dir: c.dir,
        alive: c.alive,
        boosting: c.boostT > 0,
        cooldown: c.cooldown,
        queue: [...c.queue],
      })),
    };
  }

  /* ------------------------- GameInstance API --------------------------- */
  update(dt: number) {
    this.clock += dt;
    switch (this.phase) {
      case 'ready':
        if ((this.timer -= dt) <= 0) this.phase = 'playing';
        return;
      case 'round':
        if ((this.timer -= dt) <= 0) {
          this.resetRound();
          this.emitHud();
        }
        return;
      case 'playing':
        break;
      default:
        return;
    }
    this.roundTime += dt;
    const hudBefore = this.cycles[0].cooldown > 0;
    // Bank ticks at twice the base speed, then spend them one at a time, so
    // distance per second never depends on the frame rate. The epsilon keeps a
    // tick from being lost to float rounding (1/144 s × 144 is not quite 1).
    this.acc += dt * this.speed * 2;
    const tickDt = 1 / (this.speed * 2);
    while (this.acc >= 1 - 1e-9 && this.phase === 'playing') {
      this.acc -= 1;
      for (const c of this.cycles) c.cooldown = Math.max(0, c.cooldown - tickDt);
      this.tick();
    }
    if (this.phase === 'playing' && (hudBefore || this.cycles[0].cooldown > 0)) this.emitHud();
  }

  render() {
    const g = this.g;
    const W = this.design.width;
    const H = this.design.height;
    const s = this.cell;

    g.fillStyle = BG;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = GRID;
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x <= this.cols; x++) {
      g.moveTo(x * s + 0.5, 0);
      g.lineTo(x * s + 0.5, H);
    }
    for (let y = 0; y <= this.rows; y++) {
      g.moveTo(0, y * s + 0.5);
      g.lineTo(W, y * s + 0.5);
    }
    g.stroke();

    // Trails: solid cells, with a lighter core so a gap reads as a gap.
    for (let i = 0; i < this.grid.length; i++) {
      const v = this.grid[i];
      if (!v) continue;
      const x = (i % this.cols) * s;
      const y = Math.floor(i / this.cols) * s;
      g.fillStyle = COLORS[v - 1];
      g.globalAlpha = 0.55;
      g.fillRect(x, y, s, s);
      g.globalAlpha = 1;
      g.fillRect(x + s * 0.3, y + s * 0.3, s * 0.4, s * 0.4);
    }

    if (this.phase !== 'menu') {
      this.cycles.forEach((c, i) => {
        const cx = (c.x + 0.5) * s;
        const cy = (c.y + 0.5) * s;
        g.fillStyle = c.alive ? '#f8fafc' : '#64748b';
        g.shadowColor = COLORS[i];
        g.shadowBlur = c.boostT > 0 ? 18 : 8;
        g.beginPath();
        g.arc(cx, cy, s * (c.boostT > 0 ? 0.55 : 0.42), 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
      });
      const flash = Math.floor(this.clock * 10) % 2 === 0;
      for (const p of this.crashAt) {
        g.strokeStyle = flash ? '#fde047' : '#ef4444';
        g.lineWidth = 3;
        g.beginPath();
        g.arc((p.x + 0.5) * s, (p.y + 0.5) * s, s * 1.1, 0, Math.PI * 2);
        g.stroke();
      }
    }

    g.strokeStyle = '#38bdf8';
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, W - 3, H - 3);

    let banner = '';
    if (this.phase === 'ready') banner = this.wins[0] + this.wins[1] === 0 ? 'READY' : `ROUND ${this.wins[0] + this.wins[1] + 1}`;
    else if (this.phase === 'round') banner = this.lastResult === 'draw' ? 'DRAW' : this.lastResult === 'p1' ? 'P1 TAKES IT' : this.mode === 'ai' ? 'CPU TAKES IT' : 'P2 TAKES IT';
    if (banner) {
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = 'bold 22px "Press Start 2P", monospace';
      g.fillStyle = this.lastResult === 'p2' ? COLORS[1] : COLORS[0];
      g.fillText(banner, W / 2, H / 2 - 60);
    }
  }
}
