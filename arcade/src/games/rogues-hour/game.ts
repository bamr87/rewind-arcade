import type { GameContext, GameInstance } from '../../engine/types';
import { clamp, fmt, cfgInt, cfgStr } from '../../engine/util';
import {
  CORRIDOR, DOOR, FLOOR, MAP_H, MAP_W, MONSTERS, WALL,
  computeFov, dailySeed, generateLevel, idx, int, rng, walkable,
  type Level, type Rng,
} from './dungeon';

const CELL_W = 12;
const CELL_H = 20;
/** Map rows start under the message line. */
const TOP = CELL_H;
const FONT = '10px "Press Start 2P", monospace';

/** Direction keys → [dx, dy]. Arrows/WASD are orthogonal; the numpad adds diagonals. */
const MOVES: Record<string, [number, number]> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0],
  Numpad8: [0, -1], Numpad2: [0, 1], Numpad4: [-1, 0], Numpad6: [1, 0],
  Numpad7: [-1, -1], Numpad9: [1, -1], Numpad1: [-1, 1], Numpad3: [1, 1],
};
const WAIT_KEYS = new Set(['KeyZ', 'Numpad5']);
const DESCEND_KEYS = new Set(['KeyX', 'Period']);
const QUAFF_KEYS = new Set(['KeyQ']);

const PLAYER_HP = 24;
const POTION_HEAL = 10;

type Phase = 'menu' | 'playing' | 'over';

interface Monster { x: number; y: number; kind: number; hp: number; awake: boolean }

/**
 * Rogue's Hour — a turn-based ASCII dungeon crawl in the spirit of Rogue (1980),
 * squeezed into a timed run. Every turn happens in `onKey`; `update` only runs the
 * play clock and the hit flash, so the host's pause stops the clock for free.
 * The host still forwards gameplay keys while paused, so the game tracks
 * `onPause`/`onResume` itself and takes no turn in between.
 */
export class RoguesHour implements GameInstance {
  readonly design = { width: MAP_W * CELL_W, height: (MAP_H + 2) * CELL_H };

  private host: GameContext;
  private g: CanvasRenderingContext2D;

  private seedMode: 'daily' | 'random';
  private minutes: number;
  private fov: number;
  /** YYYYMMDD of the local date this session was created on. */
  private daily: number;
  private baseSeed = 0;

  private phase: Phase = 'menu';
  private paused = false;
  private level!: Level;
  private depth = 1;
  private gold = 0;
  private hp = PLAYER_HP;
  private maxHp = PLAYER_HP;
  private potions = 0;
  private turn = 0;
  private px = 0;
  private py = 0;
  private monsters: Monster[] = [];
  private visible = new Uint8Array(MAP_W * MAP_H);
  private seen = new Uint8Array(MAP_W * MAP_H);
  private timeLeft = 0;
  private shownSecond = -1;
  private message = '';
  private flash = 0;
  private combat: Rng = rng(1);
  private bestBefore = 0;
  private endReason = '';
  private held = new Set<string>();

  constructor(ctx: GameContext, today: Date = new Date()) {
    this.host = ctx;
    this.g = ctx.ctx;
    const c = ctx.config;
    this.seedMode = cfgStr(c.seedMode, 'daily') === 'random' ? 'random' : 'daily';
    this.minutes = clamp(cfgInt(c.minutes, 10), 5, 20);
    this.fov = clamp(cfgInt(c.fov, 7), 4, 10);
    this.daily = dailySeed(today);
    this.timeLeft = this.minutes * 60;
    this.newRun();
    this.showMenu();
  }

  /* ------------------------------- Run flow ------------------------------- */
  /** Daily mode replays today's dungeon on every attempt; random rolls a new one. */
  private newRun() {
    this.baseSeed = this.seedMode === 'daily' ? this.daily : (Math.random() * 4294967296) >>> 0;
    this.combat = rng(this.baseSeed ^ 0x5eed);
    this.depth = 1;
    this.gold = 0;
    this.hp = this.maxHp = PLAYER_HP;
    this.potions = 0;
    this.turn = 0;
    this.timeLeft = this.minutes * 60;
    this.shownSecond = -1;
    this.endReason = '';
    this.loadLevel();
  }

  private loadLevel() {
    this.level = generateLevel(this.baseSeed, this.depth);
    this.px = this.level.start % MAP_W;
    this.py = Math.floor(this.level.start / MAP_W);
    this.monsters = this.level.monsters.map((s) => ({ x: s.x, y: s.y, kind: s.kind, hp: MONSTERS[s.kind].hp, awake: false }));
    this.seen.fill(0);
    this.see();
    this.message = this.depth === 1 ? 'The clock is running. Find the stairs (>) and grab gold (*).' : `You descend to depth ${this.depth}.`;
    this.emitHud();
  }

  private startRun() {
    this.newRun();
    this.bestBefore = this.host.getBest();
    this.phase = 'playing';
    this.host.setOverlay(null);
    this.host.audio.arp([196, 262, 330], { type: 'square', dur: 0.08, vol: 0.04, gap: 0.06 });
  }

  private showMenu() {
    this.phase = 'menu';
    const day = String(this.daily);
    this.host.setOverlay({
      variant: 'menu',
      title: "ROGUE'S HOUR",
      subtitle: this.seedMode === 'daily'
        ? `Daily dungeon ${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)} · ${this.minutes} minutes`
        : `Random dungeon · ${this.minutes} minutes`,
      bullets: [
        { icon: '@', text: 'Arrows / WASD move, numpad 1–9 diagonals. Walk into a monster to attack it.' },
        { icon: '>', text: 'X or . descends on the stairs. Z or numpad 5 waits. Q quaffs a healing potion (!).' },
        { icon: '⏱', text: 'The run clock only runs while you play. When it hits zero, the run is over.' },
        { icon: '★', text: 'Score = depth × gold. Dive deep, but come back with your pockets full.' },
      ],
      buttons: [{ action: 'start', label: 'Enter the dungeon', primary: true }],
    });
    this.emitHud();
  }

  /** Death or time-out: one score submission, then the result panel. */
  private endRun(reason: string) {
    if (this.phase !== 'playing') return;
    this.phase = 'over';
    this.endReason = reason;
    const score = this.score();
    this.host.submitScore(score);
    this.emitHud();
    this.host.audio.arp(reason === 'time' ? [523, 392, 262] : [220, 165, 110], { type: 'triangle', dur: 0.18, vol: 0.06, gap: 0.12 });
    this.host.setOverlay({
      variant: reason === 'time' ? 'win' : 'lose',
      kicker: reason === 'time' ? 'Time is up' : `Killed by ${reason}`,
      title: reason === 'time' ? 'The hour is over' : 'R.I.P.',
      rows: [
        { label: 'Depth', value: String(this.depth) },
        { label: 'Gold', value: fmt(this.gold) },
        { label: 'Turns', value: fmt(this.turn) },
        { label: 'Dungeon', value: this.seedMode === 'daily' ? `daily ${this.daily}` : 'random' },
      ],
      bigStat: { label: 'Depth × gold', value: fmt(score), note: score > this.bestBefore ? '★ New best!' : undefined },
      buttons: [
        { action: 'restart', label: this.seedMode === 'daily' ? "Retry today's dungeon" : 'New dungeon', primary: true },
        { action: 'menu', label: 'Title', ghost: true },
      ],
    });
  }

  private score() { return Math.max(0, Math.floor(this.depth * this.gold)); }

  /* --------------------------------- Turns -------------------------------- */
  private blocked(x: number, y: number) {
    return x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || !walkable(this.level.tiles[idx(x, y)]);
  }

  private monsterAt(x: number, y: number) {
    return this.monsters.find((m) => m.x === x && m.y === y);
  }

  private tryMove(dx: number, dy: number) {
    const nx = this.px + dx, ny = this.py + dy;
    const m = this.monsterAt(nx, ny);
    if (m) { this.attack(m); this.endTurn(); return; }
    if (this.blocked(nx, ny)) {
      this.host.audio.tone(90, { type: 'sawtooth', dur: 0.04, vol: 0.025 });
      return; // bumping a wall costs no turn
    }
    this.px = nx;
    this.py = ny;
    this.pickUp();
    this.endTurn();
  }

  private pickUp() {
    const i = idx(this.px, this.py);
    const amount = this.level.gold.get(i);
    if (amount !== undefined) {
      this.level.gold.delete(i);
      this.gold += amount;
      this.say(`You pick up ${amount} gold pieces.`);
      this.host.audio.arp([880, 1175], { type: 'square', dur: 0.05, vol: 0.035, gap: 0.04 });
    }
    if (this.level.potions.delete(i)) {
      this.potions++;
      this.say('You find a healing potion.');
      this.host.audio.tone(660, { type: 'sine', dur: 0.08, vol: 0.04 });
    }
    if (i === this.level.stairs) this.say('There is a staircase down here (X).');
  }

  private attack(m: Monster) {
    const kind = MONSTERS[m.kind];
    if (this.combat() < 0.8) {
      const dmg = int(this.combat, 2, 5) + Math.floor(this.depth / 3);
      m.hp -= dmg;
      if (m.hp <= 0) {
        this.monsters.splice(this.monsters.indexOf(m), 1);
        this.say(`You defeat the ${kind.name}.`);
        this.host.audio.arp([330, 494], { type: 'square', dur: 0.05, vol: 0.04, gap: 0.04 });
      } else {
        this.say(`You hit the ${kind.name}.`);
        this.host.audio.tone(260, { type: 'square', dur: 0.04, vol: 0.035 });
      }
    } else {
      this.say(`You miss the ${kind.name}.`);
      this.host.audio.tone(150, { type: 'triangle', dur: 0.04, vol: 0.03 });
    }
    m.awake = true;
  }

  /** Messages from one turn share the line, newest last. */
  private say(text: string) {
    this.message = this.message ? `${this.message} ${text}` : text;
  }

  private wait() {
    this.say('You rest a moment.');
    if (this.turn % 3 === 0) this.hp = Math.min(this.maxHp, this.hp + 1);
    this.endTurn();
  }

  private descend() {
    if (idx(this.px, this.py) !== this.level.stairs) {
      this.say('There are no stairs here.');
      this.emitHud();
      return;
    }
    this.turn++;
    this.depth++;
    this.maxHp += 2;
    this.hp = Math.min(this.maxHp, this.hp + 4);
    this.host.audio.arp([392, 330, 262, 196], { type: 'triangle', dur: 0.08, vol: 0.05, gap: 0.05 });
    this.loadLevel();
  }

  private quaff() {
    if (!this.potions) {
      this.say('You have no potions.');
      this.emitHud();
      return;
    }
    this.potions--;
    this.hp = Math.min(this.maxHp, this.hp + POTION_HEAL);
    this.say('You feel much better.');
    this.host.audio.arp([523, 659, 784], { type: 'sine', dur: 0.07, vol: 0.04, gap: 0.05 });
    this.endTurn();
  }

  /** Monsters act after every player turn: wake on sight, close in, and bite. */
  private endTurn() {
    this.turn++;
    for (const m of [...this.monsters]) {
      if (this.phase !== 'playing') break;
      if (!m.awake && this.visible[idx(m.x, m.y)]) m.awake = true;
      if (!m.awake) continue;
      const kind = MONSTERS[m.kind];
      const adjacent = Math.max(Math.abs(m.x - this.px), Math.abs(m.y - this.py)) === 1;
      if (adjacent && !(kind.erratic && this.combat() < 0.5)) {
        if (this.combat() < 0.65) {
          const dmg = int(this.combat, kind.min, kind.max);
          this.hp -= dmg;
          this.flash = 0.25;
          this.say(`The ${kind.name} hits you for ${dmg}.`);
          this.host.audio.tone(120, { type: 'sawtooth', dur: 0.08, vol: 0.05, slideTo: 70 });
          if (this.hp <= 0) { this.hp = 0; this.endRun(`a ${kind.name}`); return; }
        }
        continue;
      }
      this.step(m, kind.erratic === true && this.combat() < 0.5);
    }
    this.see();
    this.emitHud();
  }

  private step(m: Monster, random: boolean) {
    let best: [number, number] | null = null;
    let bestD = random ? Infinity : Math.max(Math.abs(m.x - this.px), Math.abs(m.y - this.py));
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = m.x + dx, ny = m.y + dy;
        if (this.blocked(nx, ny) || this.monsterAt(nx, ny) || (nx === this.px && ny === this.py)) continue;
        const d = random ? this.combat() : Math.max(Math.abs(nx - this.px), Math.abs(ny - this.py)) + Math.abs(nx - this.px) * 0.01 + Math.abs(ny - this.py) * 0.01;
        if (d < bestD) { bestD = d; best = [nx, ny]; }
      }
    }
    if (best) { m.x = best[0]; m.y = best[1]; }
  }

  private see() {
    computeFov(this.level.tiles, this.px, this.py, this.fov, this.visible);
    for (let i = 0; i < this.visible.length; i++) if (this.visible[i]) this.seen[i] = 1;
  }

  /* ---------------------------------- HUD --------------------------------- */
  private emitHud() {
    const best = Math.max(this.host.getBest(), this.phase === 'menu' ? 0 : this.score());
    const total = this.minutes * 60;
    const secs = Math.ceil(this.timeLeft);
    this.shownSecond = secs;
    this.host.setHud({
      badge: this.seedMode === 'daily' ? `DAILY ${this.daily}` : 'RANDOM',
      progress: { value: clamp(this.timeLeft / total, 0, 1), label: 'Time left' },
      stats: [
        { label: 'Depth', value: String(this.depth) },
        { label: 'Gold', value: fmt(this.gold) },
        { label: 'HP', value: `${this.hp}/${this.maxHp}`, accent: this.hp <= this.maxHp / 3 },
        { label: 'Time', value: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` },
        { label: 'Best', value: fmt(best) },
      ],
    });
  }

  /* --------------------------- GameInstance API --------------------------- */
  update(dt: number) {
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
    if (this.phase !== 'playing' || this.paused) return;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.timeLeft <= 0) { this.endRun('time'); return; }
    if (Math.ceil(this.timeLeft) !== this.shownSecond) this.emitHud();
  }

  onKey(code: string, down: boolean) {
    if (!down) { this.held.delete(code); return; }
    const repeat = this.held.has(code);
    this.held.add(code);
    // The host forwards gameplay keys even while paused; a turn then would cheat the clock.
    if (this.phase !== 'playing' || this.paused) return;
    const move = MOVES[code];
    const acts = move || WAIT_KEYS.has(code) || (!repeat && (DESCEND_KEYS.has(code) || QUAFF_KEYS.has(code)));
    if (acts) this.message = '';
    // Holding a direction keeps walking, as in a long corridor.
    if (move) { this.tryMove(move[0], move[1]); return; }
    if (WAIT_KEYS.has(code)) { this.wait(); return; }
    if (repeat) return;
    if (DESCEND_KEYS.has(code)) this.descend();
    else if (QUAFF_KEYS.has(code)) this.quaff();
  }

  onAction(action: string) {
    switch (action) {
      case 'start': case 'restart': this.startRun(); break;
      case 'menu': this.showMenu(); break;
    }
  }

  onPause() { this.paused = true; this.held.clear(); }
  onResume() { this.paused = false; }

  /** Read-only view for the headless checks (`tools/play-rogues-hour.mjs`) and `?debug=1`. */
  snapshot() {
    return {
      phase: this.phase,
      paused: this.paused,
      seed: this.baseSeed,
      daily: this.daily,
      depth: this.depth,
      gold: this.gold,
      hp: this.hp,
      potions: this.potions,
      turn: this.turn,
      timeLeft: this.timeLeft,
      player: { x: this.px, y: this.py },
      stairs: this.level.stairs,
      goldAt: [...this.level.gold.keys()],
      monsters: this.monsters.map((m) => ({ x: m.x, y: m.y, glyph: MONSTERS[m.kind].glyph })),
      tiles: Array.from(this.level.tiles),
      visible: Array.from(this.visible),
      seen: Array.from(this.seen),
      map: this.mapText(),
      message: this.message,
      score: this.score(),
      endReason: this.endReason,
    };
  }

  /** The whole level as text, ignoring FOV: the dungeon a seed produces. */
  private mapText() {
    const rows: string[] = [];
    for (let y = 0; y < MAP_H; y++) {
      let row = '';
      for (let x = 0; x < MAP_W; x++) row += this.glyphAt(x, y, true).ch;
      rows.push(row);
    }
    return rows.join('\n');
  }

  /* ------------------------------- Rendering ------------------------------ */
  private terrain(t: number, x: number, y: number) {
    if (t === FLOOR) return '.';
    if (t === CORRIDOR) return '#';
    if (t === DOOR) return '+';
    if (t === WALL) {
      const above = y > 0 ? this.level.tiles[idx(x, y - 1)] : 0;
      const below = y < MAP_H - 1 ? this.level.tiles[idx(x, y + 1)] : 0;
      const vertical = (above === WALL || above === DOOR) && (below === WALL || below === DOOR);
      return vertical ? '|' : '-';
    }
    return ' ';
  }

  /** What to draw at (x, y): live things only where visible, terrain where remembered. */
  private glyphAt(x: number, y: number, truth: boolean): { ch: string; color: string } {
    const i = idx(x, y);
    const lit = truth || this.visible[i] === 1;
    if (!truth && !lit && !this.seen[i]) return { ch: ' ', color: '' };
    if (x === this.px && y === this.py) return { ch: '@', color: '#fde047' };
    if (lit) {
      const m = this.monsterAt(x, y);
      if (m) { const k = MONSTERS[m.kind]; return { ch: k.glyph, color: k.color }; }
      if (this.level.gold.has(i)) return { ch: '*', color: '#facc15' };
      if (this.level.potions.has(i)) return { ch: '!', color: '#f472b6' };
    }
    if (i === this.level.stairs) return { ch: '>', color: lit ? '#f8fafc' : '#64748b' };
    const t = this.level.tiles[i];
    const ch = this.terrain(t, x, y);
    if (!lit) return { ch, color: '#334155' };
    const color = t === DOOR ? '#d97706' : t === WALL ? '#a8a29e' : t === CORRIDOR ? '#78716c' : '#57534e';
    return { ch, color };
  }

  render() {
    const g = this.g;
    const W = this.design.width, H = this.design.height;
    g.fillStyle = '#05040a';
    g.fillRect(0, 0, W, H);
    if (this.flash > 0) {
      g.fillStyle = `rgba(239,68,68,${(this.flash * 0.6).toFixed(3)})`;
      g.fillRect(0, 0, W, H);
    }
    g.font = FONT;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const { ch, color } = this.glyphAt(x, y, false);
        if (ch === ' ') continue;
        g.fillStyle = color;
        g.fillText(ch, x * CELL_W + CELL_W / 2, TOP + y * CELL_H + CELL_H / 2);
      }
    }
    g.textAlign = 'left';
    g.fillStyle = '#e2e8f0';
    g.fillText(this.message.length > 90 ? '…' + this.message.slice(-89) : this.message, 4, CELL_H / 2);
    const secs = Math.ceil(this.timeLeft);
    g.fillStyle = this.timeLeft < 60 ? '#f87171' : '#94a3b8';
    g.fillText(
      `Depth:${this.depth}  Gold:${this.gold}  HP:${this.hp}(${this.maxHp})  Potions:${this.potions}  Turn:${this.turn}  ` +
        `Time:${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`,
      4, H - CELL_H / 2,
    );
  }
}
