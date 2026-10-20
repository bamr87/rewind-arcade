import type { GameContext, GameInstance, PointerInfo } from '../../engine/types';
import { cfgBool, cfgStr, fmt } from '../../engine/util';
import { FOUND, Klondike, STOCK, TAB, WASTE, isRed, type Card, type DrawMode, type Scoring } from './klondike';

const W = 960;
const H = 640;
const CW = 96;
const CH = 132;
const TOP_Y = 20;
const TAB_Y = 176;
const DOWN_GAP = 10;
const UP_GAP = 28;
/** Two presses on one card closer together than this are a double-click. */
const DOUBLE_MS = 350;
/** A press that travels less than this is a click, not a drag. */
const DRAG_SLOP = 5;
const FINISH_STEP = 0.07;
const TRAIL_MAX = 1400;
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const DRAW_KEYS = new Set(['KeyD']);
const AUTO_KEYS = new Set(['KeyA']);
const UNDO_KEYS = new Set(['KeyU', 'KeyZ']);

type Phase = 'menu' | 'playing' | 'finishing' | 'won' | 'over';

interface Drag {
  from: number;
  index: number;
  /** Pointer offset from the dragged card's top-left corner. */
  ox: number;
  oy: number;
  x: number;
  y: number;
  sx: number;
  sy: number;
  moved: boolean;
}

/** A card in flight on the win screen. */
interface Bouncer { card: Card; x: number; y: number; vx: number; vy: number }

const colX = (i: number) => 24 + i * 136;

/**
 * Patience 3.1 — Klondike in the spirit of the solitaire that shipped with
 * Windows 3.0 (1990). The rules live in `klondike.ts`; this class lays the
 * piles out, drags cards with the pointer, and plays the bouncing-card finale,
 * whose physics run in `update` so it keeps going under the win panel.
 */
export class Patience implements GameInstance {
  readonly design = { width: W, height: H };

  private host: GameContext;
  private g: CanvasRenderingContext2D;
  private drawMode: DrawMode;
  private scoring: Scoring;
  private timed: boolean;
  private autoFinish: boolean;

  private k: Klondike;
  private phase: Phase = 'menu';
  private paused = false;
  private submitted = false;
  private finishTimer = 0;
  private lastSecond = -1;

  private drag: Drag | null = null;
  private lastDown = { t: -Infinity, pile: -1, index: -1 };
  private held = new Set<string>();

  /** Win screen: cards still to launch (top of each foundation in turn), the one in flight, and its trail. */
  private launchQueue: Card[] = [];
  private bouncer: Bouncer | null = null;
  private trail: { card: Card; x: number; y: number }[] = [];
  private launched = [0, 0, 0, 0];

  constructor(ctx: GameContext) {
    this.host = ctx;
    this.g = ctx.ctx;
    const c = ctx.config;
    this.drawMode = cfgStr(c.draw, '1') === '3' ? 3 : 1;
    this.scoring = cfgStr(c.scoring, 'standard') === 'vegas' ? 'vegas' : 'standard';
    this.timed = cfgBool(c.timed, true);
    this.autoFinish = cfgBool(c.autoFinish, true);
    this.k = new Klondike(this.drawMode, this.scoring, this.timed, this.newSeed());
    this.showMenu();
  }

  private newSeed() { return 1 + Math.floor(Math.random() * 2147483000); }

  /* -------------------------------- Flow -------------------------------- */
  private showMenu() {
    this.phase = 'menu';
    this.emitHud();
    this.host.setOverlay({
      variant: 'menu',
      title: 'PATIENCE 3.1',
      subtitle: `Klondike · draw ${this.drawMode} · ${this.scoring === 'vegas' ? 'Vegas' : 'standard'} scoring`,
      bullets: [
        { icon: '🃏', text: 'Build the four foundations up by suit, ace to king. Stack the tableau down in alternating colours.' },
        { icon: '🖱', text: 'Drag a card, or a face-up run, to move it. Click the stock to draw. Double-click a card to send it home.' },
        { icon: '⌨', text: 'D draws, A sends every safe card home, U or Z undoes.' },
        {
          icon: '★',
          text: this.scoring === 'vegas'
            ? 'Vegas: the deck costs $52 and every card home pays $5. Your best is stored as $52 + net.'
            : 'Standard: +10 to a foundation, +5 waste to tableau and per card turned over. Win fast for a bonus.',
        },
      ],
      buttons: [{ action: 'deal', label: 'Deal', primary: true }],
    });
  }

  /** A fresh deal; the first one keeps the cards already laid out behind the menu. */
  private deal(fresh: boolean) {
    if (fresh) this.k = new Klondike(this.drawMode, this.scoring, this.timed, this.newSeed());
    this.phase = 'playing';
    this.submitted = false;
    this.drag = null;
    this.bouncer = null;
    this.launchQueue = [];
    this.trail = [];
    this.launched = [0, 0, 0, 0];
    this.lastSecond = -1;
    this.host.setOverlay(null);
    this.host.audio.arp([392, 523, 659], { type: 'triangle', dur: 0.06, vol: 0.04, gap: 0.04 });
    this.emitHud();
  }

  /** Submit once per deal, on a win or when the player gives up. */
  private submit(won: boolean) {
    if (this.submitted) return false;
    this.submitted = true;
    return this.host.submitScore(this.k.finalScore(won));
  }

  private giveUp() {
    if (this.phase !== 'playing') return;
    this.phase = 'over';
    this.drag = null;
    const final = this.k.finalScore(false);
    const record = this.submit(false);
    this.host.audio.tone(196, { type: 'triangle', dur: 0.3, vol: 0.05, slideTo: 98 });
    this.emitHud();
    this.host.setOverlay({
      variant: 'lose',
      kicker: 'Hand folded',
      title: `${this.k.homed} of 52 cards home`,
      rows: this.scoring === 'vegas'
        ? [{ label: 'Net', value: this.dollars(this.k.vegasNet) }, { label: 'Stored as', value: `$52 + net = ${final}` }]
        : [{ label: 'Moves', value: String(this.k.moves) }, { label: 'Time', value: this.clock() }],
      bigStat: { label: 'Score', value: fmt(final), note: record ? '★ New best!' : undefined },
      buttons: [{ action: 'deal', label: 'Deal again', primary: true }],
    });
  }

  private win() {
    this.phase = 'won';
    this.drag = null;
    const final = this.k.finalScore(true);
    const record = this.submit(true);
    this.host.audio.arp([523, 659, 784, 1047, 1319], { type: 'triangle', dur: 0.16, vol: 0.06, gap: 0.09 });
    this.startBounce();
    this.emitHud();
    this.host.setOverlay({
      variant: 'win',
      kicker: 'All 52 home',
      title: 'You win!',
      rows: this.scoring === 'vegas'
        ? [{ label: 'Net', value: this.dollars(this.k.vegasNet) }, { label: 'Stored as', value: `$52 + net = ${final}` }]
        : [
            { label: 'Points', value: fmt(this.k.points) },
            { label: 'Time bonus', value: '+' + fmt(this.k.timeBonus()) },
            { label: 'Moves bonus', value: '+' + fmt(this.k.movesBonus()) },
          ],
      bigStat: { label: 'Score', value: fmt(final), note: record ? '★ New best!' : undefined },
      buttons: [{ action: 'deal', label: 'Deal again', primary: true }],
    });
  }

  /** After every change: hand off to auto-finish, or declare the win. */
  private afterMove() {
    if (this.k.won) { this.win(); return; }
    if (this.autoFinish && this.phase === 'playing' && this.k.allRevealed) {
      this.phase = 'finishing';
      this.finishTimer = 0;
    }
    this.emitHud();
  }

  /* ------------------------------ Actions ------------------------------- */
  private drawStock() {
    const r = this.k.drawCards();
    if (r === 'empty') { this.sfxBump(); return; }
    this.host.audio.tone(r === 'drew' ? 520 : 260, { type: 'square', dur: 0.03, vol: 0.025 });
    this.afterMove();
  }

  private tryMove(from: number, index: number, to: number) {
    if (!this.k.move(from, index, to)) return false;
    this.sfxMove(to);
    this.afterMove();
    return true;
  }

  private sendHome(pile: number) {
    const to = this.k.foundationFor(pile);
    if (to < 0) { this.sfxBump(); return; }
    this.tryMove(pile, this.k.piles[pile].length - 1, to);
  }

  /** A: send every card that is safe home, one after another. */
  private autoSafe() {
    let any = false;
    while (this.phase === 'playing' && this.k.autoStep(false)) {
      any = true;
      if (this.k.won) break;
    }
    if (!any) { this.sfxBump(); return; }
    this.host.audio.arp([784, 988], { type: 'triangle', dur: 0.05, vol: 0.04, gap: 0.04 });
    this.afterMove();
  }

  private undo() {
    if (!this.k.undo()) { this.sfxBump(); return; }
    this.host.audio.tone(300, { type: 'sine', dur: 0.05, vol: 0.035, slideTo: 200 });
    this.emitHud();
  }

  private canAct() { return this.phase === 'playing' && !this.paused; }

  /* ------------------------------ Layout -------------------------------- */
  private pileRect(pile: number) {
    if (pile === STOCK) return { x: colX(0), y: TOP_Y };
    if (pile === WASTE) return { x: colX(1), y: TOP_Y };
    if (pile < TAB) return { x: colX(3 + pile - FOUND), y: TOP_Y };
    return { x: colX(pile - TAB), y: TAB_Y };
  }

  /** Face-down and face-up spacing for a column, squeezed so the longest run still fits. */
  private gaps(col: Card[]) {
    let down = 0, up = 0;
    for (let i = 0; i < col.length - 1; i++) if (col[i].up) up++; else down++;
    const room = H - 12 - TAB_Y - CH;
    const need = down * DOWN_GAP + up * UP_GAP;
    const f = need > room ? room / need : 1;
    return { down: DOWN_GAP * f, up: UP_GAP * f };
  }

  /** Top-left of every card in a pile, bottom first. */
  private cardPositions(pile: number) {
    const base = this.pileRect(pile);
    const cards = this.k.piles[pile];
    if (pile === WASTE) {
      // Draw three fans the last three turned cards; draw one stacks them.
      const fan = this.drawMode === 3 ? Math.min(3, cards.length) : 1;
      return cards.map((_, i) => ({ x: base.x + Math.max(0, i - (cards.length - fan)) * 18, y: base.y }));
    }
    if (pile < TAB) return cards.map(() => ({ ...base }));
    const { down, up } = this.gaps(cards);
    const out: { x: number; y: number }[] = [];
    let y = base.y;
    for (let i = 0; i < cards.length; i++) {
      out.push({ x: base.x, y });
      y += cards[i].up ? up : down;
    }
    return out;
  }

  /** The pile and card index under a point; the stock reports index -1 when empty. */
  private hit(x: number, y: number): { pile: number; index: number } | null {
    for (let pile = 0; pile < 13; pile++) {
      const cards = this.k.piles[pile];
      const pos = this.cardPositions(pile);
      for (let i = cards.length - 1; i >= 0; i--) {
        const p = pos[i];
        if (x >= p.x && x < p.x + CW && y >= p.y && y < p.y + CH) return { pile, index: i };
      }
      if (!cards.length && pile === STOCK) {
        const r = this.pileRect(pile);
        if (x >= r.x && x < r.x + CW && y >= r.y && y < r.y + CH) return { pile, index: -1 };
      }
    }
    return null;
  }

  /** Where a drag lands: the legal pile whose top card (or empty slot) the dragged card overlaps most. */
  private dropTarget(d: Drag) {
    const ax = d.x - d.ox, ay = d.y - d.oy;
    let best = -1, bestArea = 0;
    for (let to = FOUND; to < 13; to++) {
      if (to === d.from || !this.k.canMove(d.from, d.index, to)) continue;
      const cards = this.k.piles[to];
      const r = cards.length ? this.cardPositions(to)[cards.length - 1] : this.pileRect(to);
      const w = Math.min(ax + CW, r.x + CW) - Math.max(ax, r.x);
      const h = Math.min(ay + CH, r.y + CH) - Math.max(ay, r.y);
      const area = w > 0 && h > 0 ? w * h : 0;
      if (area > bestArea) { bestArea = area; best = to; }
    }
    return best;
  }

  /* -------------------------------- Input ------------------------------- */
  onPointerDown(p: PointerInfo) {
    if (!this.canAct() || p.button !== 0) return;
    const h = this.hit(p.x, p.y);
    if (!h) return;
    if (h.pile === STOCK) { this.drawStock(); return; }
    const card = this.k.piles[h.pile][h.index];
    if (!card?.up) return;
    if (h.pile === WASTE && h.index !== this.k.waste.length - 1) return;

    const now = this.host.now();
    const top = h.index === this.k.piles[h.pile].length - 1;
    const twice = now - this.lastDown.t < DOUBLE_MS && this.lastDown.pile === h.pile && this.lastDown.index === h.index;
    this.lastDown = { t: now, pile: h.pile, index: h.index };
    if (twice && top) {
      this.lastDown.t = -Infinity;
      this.drag = null;
      this.sendHome(h.pile);
      return;
    }
    const pos = this.cardPositions(h.pile)[h.index];
    this.drag = { from: h.pile, index: h.index, ox: p.x - pos.x, oy: p.y - pos.y, x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false };
  }

  onPointerMove(p: PointerInfo) {
    const d = this.drag;
    if (!d) return;
    if (this.paused) { this.drag = null; return; }
    d.x = p.x;
    d.y = p.y;
    if (!d.moved && Math.hypot(p.x - d.sx, p.y - d.sy) > DRAG_SLOP) d.moved = true;
  }

  onPointerUp(p: PointerInfo) {
    const d = this.drag;
    this.drag = null;
    if (!d || !d.moved || !this.canAct()) return;
    d.x = p.x;
    d.y = p.y;
    const to = this.dropTarget(d);
    // An illegal drop simply snaps back: the cards never left their pile.
    if (to < 0 || !this.tryMove(d.from, d.index, to)) this.sfxBump();
  }

  onPointerLeave() { this.drag = null; }

  onKey(code: string, down: boolean) {
    if (!down) { this.held.delete(code); return; }
    if (this.held.has(code)) return;
    this.held.add(code);
    if (!this.canAct()) return;
    if (DRAW_KEYS.has(code)) this.drawStock();
    else if (AUTO_KEYS.has(code)) this.autoSafe();
    else if (UNDO_KEYS.has(code)) this.undo();
  }

  onAction(action: string) {
    switch (action) {
      case 'deal': this.deal(this.phase !== 'menu'); break;
      case 'undo': if (this.canAct()) this.undo(); break;
      case 'auto': if (this.canAct()) this.autoSafe(); break;
      case 'giveup': this.giveUp(); break;
    }
  }

  onPause() {
    this.paused = true;
    this.drag = null;
    this.held.clear();
  }

  onResume() { this.paused = false; }

  /* -------------------------------- Loop -------------------------------- */
  update(dt: number) {
    if (this.phase === 'playing' || this.phase === 'finishing') {
      this.k.tick(dt);
      const s = Math.floor(this.k.elapsed);
      if (s !== this.lastSecond) { this.lastSecond = s; this.emitHud(); }
    }
    if (this.phase === 'finishing') {
      this.finishTimer -= dt;
      while (this.finishTimer <= 0 && this.phase === 'finishing') {
        this.finishTimer += FINISH_STEP;
        if (!this.k.autoStep(true, false)) { this.phase = 'playing'; break; }
        this.host.audio.tone(660 + this.k.homed * 8, { type: 'triangle', dur: 0.04, vol: 0.03 });
        if (this.k.won) this.win();
      }
    }
    if (this.phase === 'won') this.stepBounce(dt);
  }

  /* ----------------------------- Win bounce ----------------------------- */
  /** Kings first: each foundation's top card in turn, round and round. */
  private startBounce() {
    this.launchQueue = [];
    for (let r = 12; r >= 0; r--) for (let f = 0; f < 4; f++) this.launchQueue.push(this.k.foundation(f)[r]);
    this.launched = [0, 0, 0, 0];
    this.trail = [];
    this.bouncer = null;
  }

  private launch() {
    if (!this.launchQueue.length) {
      // Every card has flown: clear the felt and go again, for as long as the panel is up.
      this.startBounce();
    }
    const n = 52 - this.launchQueue.length;
    const card = this.launchQueue.shift()!;
    const f = n % 4;
    this.launched[f]++;
    const pos = this.pileRect(FOUND + f);
    const r = Math.random();
    const dir = r < 0.5 ? -1 : 1;
    this.bouncer = { card, x: pos.x, y: pos.y, vx: dir * (120 + r * 260), vy: -60 - Math.random() * 240 };
  }

  private stepBounce(dt: number) {
    // Fixed sub-steps, so a 50 ms frame bounces the same as four 12.5 ms ones.
    const steps = Math.max(1, Math.ceil(dt / 0.0125));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      if (!this.bouncer) this.launch();
      const b = this.bouncer!;
      b.vy += 1400 * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
      if (b.y > H - CH) {
        b.y = H - CH;
        b.vy = -b.vy * 0.78;
        if (Math.abs(b.vy) > 60) this.host.audio.tone(180, { type: 'triangle', dur: 0.02, vol: 0.012 });
      }
      this.trail.push({ card: b.card, x: b.x, y: b.y });
      if (this.trail.length > TRAIL_MAX) this.trail.shift();
      if (b.x < -CW || b.x > W) this.bouncer = null;
    }
  }

  /* -------------------------------- HUD --------------------------------- */
  private dollars(n: number) { return (n < 0 ? '−$' : '$') + Math.abs(n); }

  private clock() {
    const s = Math.floor(this.k.elapsed);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  private emitHud() {
    const vegas = this.scoring === 'vegas';
    const best = this.host.getBest();
    this.host.setHud({
      badge: `DRAW ${this.drawMode}`,
      stats: [
        { label: vegas ? 'Net' : 'Score', value: vegas ? this.dollars(this.k.vegasNet) : fmt(this.k.points), accent: true },
        { label: 'Moves', value: String(this.k.moves) },
        { label: 'Time', value: this.clock() },
        { label: 'Best', value: fmt(best) },
      ],
      actions: [
        { icon: '↩', label: 'Undo — U / Z', action: 'undo' },
        { icon: '⇪', label: 'Send safe cards home — A', action: 'auto' },
        { icon: '⚑', label: 'Give up and score this hand', action: 'giveup' },
      ],
    });
  }

  /* -------------------------------- Audio ------------------------------- */
  private sfxMove(to: number) {
    if (to >= FOUND && to < TAB) this.host.audio.tone(880, { type: 'triangle', dur: 0.06, vol: 0.04 });
    else this.host.audio.tone(330, { type: 'square', dur: 0.03, vol: 0.025 });
  }

  private sfxBump() { this.host.audio.tone(110, { type: 'sawtooth', dur: 0.05, vol: 0.03 }); }

  /** Read-only view for the headless checks (`tools/play-patience.mjs`) and `?debug=1`. */
  snapshot() {
    const k = this.k;
    return {
      phase: this.phase,
      paused: this.paused,
      draw: this.drawMode,
      scoring: this.scoring,
      score: k.score,
      points: k.points,
      moves: k.moves,
      elapsed: k.elapsed,
      stock: k.stock.length,
      waste: k.waste.length,
      homed: k.homed,
      columns: Array.from({ length: 7 }, (_, i) => k.column(i).map((c) => (c.up ? RANKS[c.rank] + SUITS[c.suit] : '##')).join(' ')),
      dragging: this.drag !== null,
      bouncing: this.bouncer !== null,
      trail: this.trail.length,
    };
  }

  /* ------------------------------ Rendering ----------------------------- */
  render() {
    const g = this.g;
    g.fillStyle = '#0f6b3a';
    g.fillRect(0, 0, W, H);
    const felt = g.createLinearGradient(0, 0, 0, H);
    felt.addColorStop(0, 'rgba(255,255,255,0.05)');
    felt.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = felt;
    g.fillRect(0, 0, W, H);

    if (this.phase === 'won') { this.renderWin(); return; }

    // Empty slots.
    for (let pile = 0; pile < 13; pile++) {
      if (pile === WASTE) continue;
      const r = this.pileRect(pile);
      this.drawSlot(r.x, r.y, pile === STOCK ? (this.k.waste.length ? '↻' : '') : pile < TAB ? 'A' : '');
    }

    const d = this.drag?.moved ? this.drag : null;
    for (let pile = 0; pile < 13; pile++) {
      const cards = this.k.piles[pile];
      if (!cards.length) continue;
      const pos = this.cardPositions(pile);
      // Stacked piles only need their top two cards drawn.
      const from = pile < TAB ? Math.max(0, cards.length - (pile === WASTE ? 3 : 2)) : 0;
      const until = d && d.from === pile ? d.index : cards.length;
      for (let i = from; i < until; i++) this.drawCard(cards[i], pos[i].x, pos[i].y);
    }

    if (d) {
      const cards = this.k.piles[d.from];
      const pos = this.cardPositions(d.from);
      const x0 = d.x - d.ox, y0 = d.y - d.oy;
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(x0 + 6, y0 + 8, CW, CH + (pos[cards.length - 1].y - pos[d.index].y));
      for (let i = d.index; i < cards.length; i++) this.drawCard(cards[i], x0, y0 + pos[i].y - pos[d.index].y);
    }
  }

  private renderWin() {
    // Foundations shrink as their cards launch; the trail is redrawn from its stamps.
    for (let f = 0; f < 4; f++) {
      const r = this.pileRect(FOUND + f);
      const left = 13 - this.launched[f];
      if (left > 0) this.drawCard(this.k.foundation(f)[left - 1], r.x, r.y);
      else this.drawSlot(r.x, r.y, '');
    }
    for (const t of this.trail) this.drawCard(t.card, t.x, t.y);
    if (this.bouncer) this.drawCard(this.bouncer.card, this.bouncer.x, this.bouncer.y);
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const g = this.g;
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r);
    g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }

  private drawSlot(x: number, y: number, label: string) {
    const g = this.g;
    this.roundRect(x + 0.5, y + 0.5, CW - 1, CH - 1, 8);
    g.strokeStyle = 'rgba(255,255,255,0.28)';
    g.lineWidth = 2;
    g.stroke();
    if (!label) return;
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.font = 'bold 34px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, x + CW / 2, y + CH / 2);
  }

  private drawCard(c: Card, x: number, y: number) {
    const g = this.g;
    this.roundRect(x, y, CW, CH, 8);
    if (!c.up) {
      // A Windows-blue back with a cross-hatch, framed in white.
      g.fillStyle = '#f8fafc';
      g.fill();
      g.strokeStyle = '#0f172a';
      g.lineWidth = 1;
      g.stroke();
      g.fillStyle = '#1d4ed8';
      g.fillRect(x + 6, y + 6, CW - 12, CH - 12);
      g.strokeStyle = 'rgba(147,197,253,0.55)';
      g.beginPath();
      for (let k = -CH; k < CW; k += 10) {
        g.moveTo(x + 6 + Math.max(0, k), y + 6 + Math.max(0, -k));
        g.lineTo(x + 6 + Math.min(CW - 12, k + CH - 12), y + 6 + Math.min(CH - 12, CH - 12 - k));
      }
      g.stroke();
      return;
    }
    g.fillStyle = '#ffffff';
    g.fill();
    g.strokeStyle = '#1f2937';
    g.lineWidth = 1;
    g.stroke();
    const color = isRed(c) ? '#dc2626' : '#111827';
    const rank = RANKS[c.rank], suit = SUITS[c.suit];
    g.fillStyle = color;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.font = 'bold 20px system-ui, sans-serif';
    g.fillText(rank, x + 8, y + 7);
    g.font = '18px system-ui, sans-serif';
    g.fillText(suit, x + 8, y + 29);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (c.rank > 10) {
      // Court cards: a framed panel with the letter over the suit.
      g.strokeStyle = color;
      g.lineWidth = 2;
      g.strokeRect(x + 24, y + 30, CW - 40, CH - 52);
      g.font = 'bold 38px Georgia, serif';
      g.fillText(rank, x + CW / 2 + 4, y + CH / 2 - 6);
      g.font = '22px system-ui, sans-serif';
      g.fillText(suit, x + CW / 2 + 4, y + CH / 2 + 28);
    } else {
      g.font = `${c.rank === 1 ? 54 : 40}px system-ui, sans-serif`;
      g.fillText(suit, x + CW / 2 + 6, y + CH / 2 + 6);
    }
  }
}
