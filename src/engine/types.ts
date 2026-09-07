/**
 * The plug-in contract for the arcade.
 *
 * A game is a self-contained module that exports a `GameManifest`. It knows
 * nothing about React, routing, the DOM, or the other games — it only talks to
 * the host through the `GameContext` it is handed at creation time. Adding a new
 * game means writing one file that satisfies this contract and registering it.
 */

/* ----------------------------- Configuration ----------------------------- */

export type ConfigValue = number | boolean | string;
export type GameConfig = Record<string, ConfigValue>;

interface ConfigFieldBase {
  key: string;
  label: string;
  help?: string;
  /** Reset the running game when this field changes (most setup options do). */
  restart?: boolean;
}

export type ConfigField =
  | (ConfigFieldBase & {
      type: 'range';
      min: number;
      max: number;
      step: number;
      default: number;
      unit?: string;
    })
  | (ConfigFieldBase & { type: 'toggle'; default: boolean })
  | (ConfigFieldBase & {
      type: 'select';
      options: { value: string; label: string }[];
      default: string;
    });

export function defaultConfig(fields: ConfigField[]): GameConfig {
  const out: GameConfig = {};
  for (const f of fields) out[f.key] = f.default;
  return out;
}

/* -------------------------------- HUD model ------------------------------ */

export interface HudStat {
  label: string;
  value: string;
  accent?: boolean;
}

export interface HudModel {
  /** Optional labelled progress bar (0..1), e.g. JezzBall's capture meter. */
  progress?: { value: number; target?: number; label?: string; complete?: boolean };
  /** Lives shown as pips; falls back to a number when there are many. */
  lives?: { current: number; max: number };
  /** Right-aligned stat chips (score, best, length, …). */
  stats?: HudStat[];
  /** Small badge next to the title, e.g. "LEVEL 3". */
  badge?: string;
  /** Game-specific quick-action buttons (e.g. JezzBall's wall rotate). */
  actions?: { icon: string; label: string; action: string }[];
}

/* ------------------------------ Overlay model ---------------------------- */

export interface OverlayButton {
  action: string;
  label: string;
  primary?: boolean;
  ghost?: boolean;
}

export interface OverlayRow {
  label: string;
  value: string;
  highlight?: boolean;
}

export interface OverlayModel {
  variant?: 'menu' | 'win' | 'lose' | 'pause' | 'info';
  kicker?: string;
  title: string;
  subtitle?: string;
  /** Structured "how to play" style lines. */
  bullets?: { icon: string; text: string }[];
  /** Ledger-style rows (bonus breakdowns, etc.). */
  rows?: OverlayRow[];
  /** One large highlighted stat (final score, cleared %). */
  bigStat?: { label: string; value: string; note?: string };
  buttons: OverlayButton[];
}

/* ------------------------------ Runtime I/O ------------------------------ */

export interface PointerInfo {
  x: number;
  y: number;
  button: number;
  pointerType: string;
}

/** Minimal audio surface shared by every game (see audio.ts). */
export interface AudioBus {
  muted: boolean;
  ensure(): void;
  tone(freq: number, opts?: ToneOptions): void;
  /** Play a sequence of notes as a simple arpeggio. */
  arp(freqs: number[], opts?: ToneOptions & { gap?: number }): void;
}

export interface ToneOptions {
  dur?: number;
  type?: OscillatorType;
  vol?: number;
  slideTo?: number;
  delay?: number;
}

/**
 * Everything a game is allowed to touch in the host. Passed once, at creation.
 */
export interface GameContext {
  ctx: CanvasRenderingContext2D;
  config: GameConfig;
  audio: AudioBus;
  /** High-resolution clock in ms (monotonic). */
  now(): number;
  /** Push a new HUD snapshot to the host. */
  setHud(model: HudModel): void;
  /** Show an overlay panel, or clear it with `null`. */
  setOverlay(model: OverlayModel | null): void;
  /** Record a score for this game's best tracking. Returns true if it's a record. */
  submitScore(score: number): boolean;
  /** The best score stored for this game so far. */
  getBest(): number;
}

/**
 * A live game session. The host owns the render loop and input; it calls these.
 * All coordinates are in the game's own design space (see `design`).
 */
export interface GameInstance {
  /** The fixed logical resolution the game renders in. The host scales it. */
  readonly design: { width: number; height: number };

  update(dt: number): void;
  render(): void;

  onPointerDown?(p: PointerInfo): void;
  onPointerMove?(p: PointerInfo): void;
  onPointerUp?(p: PointerInfo): void;
  onPointerLeave?(): void;
  onWheel?(deltaY: number): void;
  onKey?(code: string, down: boolean): void;
  /** A button in the overlay was pressed. */
  onAction?(action: string): void;

  /** Host lifecycle hooks. */
  onPause?(): void;
  onResume?(): void;
  destroy?(): void;
}

export interface GameManifest {
  id: string;
  title: string;
  tagline: string;
  /** Original release year, shown on the arcade card. */
  year: string;
  /** Theme accent color (hex). */
  accent: string;
  /** Emoji used as the card badge / favicon flavor. */
  icon: string;
  description: string;
  howTo: { icon: string; text: string }[];
  config: ConfigField[];
  create(context: GameContext): GameInstance;
}
