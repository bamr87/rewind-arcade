/**
 * Klondike rules and scoring, with no canvas and no host: `game.ts` draws and
 * drags, this decides what is legal and what it is worth. Kept apart so the
 * headless checks (`tools/play-patience.mjs`) can prove the rules directly.
 */

export interface Card {
  /** 0 ♠, 1 ♥, 2 ♦, 3 ♣ — hearts and diamonds are red. */
  suit: number;
  /** 1 (ace) … 13 (king). */
  rank: number;
  up: boolean;
}

export type DrawMode = 1 | 3;
export type Scoring = 'standard' | 'vegas';

/** Pile ids: 0 stock, 1 waste, 2–5 foundations, 6–12 tableau columns. */
export const STOCK = 0;
export const WASTE = 1;
export const FOUND = 2;
export const TAB = 6;
export const PILES = 13;

export const isRed = (c: Card) => c.suit === 1 || c.suit === 2;

/** Points for the standard (Windows-style) table; Vegas counts foundation cards only. */
export const PTS = {
  wasteToTab: 5,
  toFoundation: 10,
  turnOver: 5,
  foundationToTab: -15,
  recycleDraw1: -100,
  recycleDraw3: -20,
  /** Draw three recycles free for the first two (passes two and three). */
  freeRecyclesDraw3: 2,
  timeStep: 10,
  timePenalty: 2,
} as const;

/** A small seeded PRNG (mulberry32), so a deal can be replayed from its seed. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Undo { piles: Card[][]; points: number; recycles: number; timeSteps: number }

export class Klondike {
  readonly draw: DrawMode;
  readonly scoring: Scoring;
  readonly timed: boolean;

  piles: Card[][] = [];
  /** Standard-mode running score, floored at 0. */
  points = 0;
  moves = 0;
  recycles = 0;
  /** Seconds of play, advanced by `tick`. */
  elapsed = 0;
  private timeSteps = 0;
  private history: Undo[] = [];

  constructor(draw: DrawMode, scoring: Scoring, timed: boolean, seed: number) {
    this.draw = draw;
    this.scoring = scoring;
    this.timed = timed;
    this.deal(seed);
  }

  /** Shuffle and lay out 1–7 cards per column, top card face up; 24 stay in the stock. */
  deal(seed: number) {
    const deck: Card[] = [];
    for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) deck.push({ suit: s, rank: r, up: false });
    const rand = rng(seed);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    this.piles = Array.from({ length: PILES }, () => []);
    for (let col = 0; col < 7; col++) {
      for (let k = 0; k <= col; k++) {
        const c = deck.pop()!;
        c.up = k === col;
        this.piles[TAB + col].push(c);
      }
    }
    this.piles[STOCK] = deck;
    this.points = 0;
    this.moves = 0;
    this.recycles = 0;
    this.elapsed = 0;
    this.timeSteps = 0;
    this.history = [];
  }

  /* ------------------------------ Queries ------------------------------- */
  get stock() { return this.piles[STOCK]; }
  get waste() { return this.piles[WASTE]; }
  foundation(i: number) { return this.piles[FOUND + i]; }
  column(i: number) { return this.piles[TAB + i]; }
  top(pile: number): Card | undefined { const p = this.piles[pile]; return p[p.length - 1]; }

  /** Cards on the foundations, 0–52. */
  get homed() {
    let n = 0;
    for (let i = 0; i < 4; i++) n += this.foundation(i).length;
    return n;
  }
  get won() { return this.homed === 52; }

  /** Nothing left to turn over: the stock and waste are empty and every tableau card shows. */
  get allRevealed() {
    if (this.stock.length || this.waste.length) return false;
    for (let i = 0; i < 7; i++) if (this.column(i).some((c) => !c.up)) return false;
    return true;
  }

  /** Vegas net in dollars: −52 for the deck, +5 for every card on a foundation. */
  get vegasNet() { return this.homed * 5 - 52; }

  /** The score the HUD shows: points, or Vegas dollars. */
  get score() { return this.scoring === 'vegas' ? this.vegasNet : this.points; }

  /**
   * The non-negative, higher-is-better integer the host stores as the best.
   * Standard adds the time and moves bonuses on a win; Vegas stores 52 + net (0–260).
   */
  finalScore(won: boolean) {
    if (this.scoring === 'vegas') return 52 + this.vegasNet;
    if (!won) return this.points;
    return this.points + this.timeBonus() + this.movesBonus();
  }
  timeBonus() { return this.timed ? Math.round(700000 / Math.max(30, Math.floor(this.elapsed))) : 0; }
  movesBonus() { return Math.max(0, (200 - this.moves) * 5); }

  /** Can `pile[index..]` be placed on `to`? */
  canMove(from: number, index: number, to: number): boolean {
    if (from === to || to === STOCK || to === WASTE) return false;
    const src = this.piles[from];
    const card = src[index];
    if (!card || !card.up) return false;
    const run = src.length - index;
    if (run > 1) {
      // Only the tableau holds runs, and only a valid alternating, descending one moves.
      if (from < TAB) return false;
      for (let k = index; k < src.length - 1; k++) {
        if (!src[k + 1].up || isRed(src[k]) === isRed(src[k + 1]) || src[k].rank !== src[k + 1].rank + 1) return false;
      }
    }
    if ((from === STOCK) || (from === WASTE && index !== src.length - 1)) return false;
    const dest = this.top(to);
    if (to >= FOUND && to < TAB) {
      if (run !== 1) return false;
      return dest ? dest.suit === card.suit && dest.rank + 1 === card.rank : card.rank === 1;
    }
    return dest ? dest.up && isRed(dest) !== isRed(card) && dest.rank === card.rank + 1 : card.rank === 13;
  }

  /** The foundation `pile`'s top card can go to, or -1. */
  foundationFor(pile: number): number {
    const src = this.piles[pile];
    if (!src.length || pile === STOCK || (pile >= FOUND && pile < TAB)) return -1;
    for (let i = 0; i < 4; i++) if (this.canMove(pile, src.length - 1, FOUND + i)) return FOUND + i;
    return -1;
  }

  /* ------------------------------ Actions ------------------------------- */
  /** Move `pile[index..]` to `to`. Returns false (and changes nothing) when illegal. */
  move(from: number, index: number, to: number, counted = true): boolean {
    if (!this.canMove(from, index, to)) return false;
    this.remember();
    const cards = this.piles[from].splice(index);
    this.piles[to].push(...cards);
    const toFound = to >= FOUND && to < TAB;
    const fromFound = from >= FOUND && from < TAB;
    if (toFound) this.addPoints(PTS.toFoundation);
    else if (from === WASTE) this.addPoints(PTS.wasteToTab);
    else if (fromFound) this.addPoints(PTS.foundationToTab);
    const exposed = this.top(from);
    if (from >= TAB && exposed && !exposed.up) {
      exposed.up = true;
      this.addPoints(PTS.turnOver);
    }
    if (counted) this.moves++;
    return true;
  }

  /** Turn one or three cards from the stock, or recycle the waste when the stock is empty. */
  drawCards(): 'drew' | 'recycled' | 'empty' {
    if (this.stock.length) {
      this.remember();
      for (let k = 0; k < this.draw && this.stock.length; k++) {
        const c = this.stock.pop()!;
        c.up = true;
        this.waste.push(c);
      }
      this.moves++;
      return 'drew';
    }
    if (!this.waste.length) return 'empty';
    this.remember();
    while (this.waste.length) {
      const c = this.waste.pop()!;
      c.up = false;
      this.stock.push(c);
    }
    this.recycles++;
    if (this.draw === 1) this.addPoints(PTS.recycleDraw1);
    else if (this.recycles > PTS.freeRecyclesDraw3) this.addPoints(PTS.recycleDraw3);
    this.moves++;
    return 'recycled';
  }

  /**
   * A card is safe to send home when nothing could still need it in the tableau:
   * an ace or two, or both opposite-colour foundations are already at rank − 1.
   */
  isSafe(card: Card) {
    if (card.rank <= 2) return true;
    let reds = 0, blacks = 0;
    for (let i = 0; i < 4; i++) {
      const t = this.top(FOUND + i);
      if (!t || t.rank < card.rank - 1) continue;
      if (isRed(t)) reds++; else blacks++;
    }
    return (isRed(card) ? blacks : reds) >= 2;
  }

  /** Send one card home — any card when `anyCard`, otherwise only a safe one. Returns false if none. */
  autoStep(anyCard: boolean, counted = true): boolean {
    const sources = [WASTE, TAB, TAB + 1, TAB + 2, TAB + 3, TAB + 4, TAB + 5, TAB + 6];
    // The lowest candidate first, so an auto-finish never strands a lower card.
    let best = -1, bestRank = 99, bestTo = -1;
    for (const p of sources) {
      const to = this.foundationFor(p);
      const c = this.top(p);
      if (to < 0 || !c || (!anyCard && !this.isSafe(c))) continue;
      if (c.rank < bestRank) { best = p; bestRank = c.rank; bestTo = to; }
    }
    return best >= 0 && this.move(best, this.piles[best].length - 1, bestTo, counted);
  }

  undo(): boolean {
    const last = this.history.pop();
    if (!last) return false;
    this.piles = last.piles;
    // Undo takes the move back, never the time spent: penalties since then still count.
    this.points = Math.max(0, last.points - (this.timeSteps - last.timeSteps) * PTS.timePenalty);
    this.recycles = last.recycles;
    return true;
  }
  get canUndo() { return this.history.length > 0; }

  /** Advance the clock; in timed standard play every 10 s costs 2 points. */
  tick(dt: number) {
    this.elapsed += dt;
    if (!this.timed || this.scoring !== 'standard') return;
    const steps = Math.floor(this.elapsed / PTS.timeStep);
    while (this.timeSteps < steps) {
      this.timeSteps++;
      this.addPoints(-PTS.timePenalty);
    }
  }

  private addPoints(n: number) { this.points = Math.max(0, this.points + n); }

  private remember() {
    this.history.push({
      piles: this.piles.map((p) => p.map((c) => ({ ...c }))),
      points: this.points,
      recycles: this.recycles,
      timeSteps: this.timeSteps,
    });
    if (this.history.length > 500) this.history.shift();
  }
}
