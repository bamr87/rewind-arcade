/**
 * The one gamepad loop in the app.
 *
 * The Gamepad API has no button events — you poll it. Polling in more than one place
 * duplicates the work and, worse, duplicates the navigation: two mounted views that
 * each poll would both act on the same press. So this module owns the only
 * `requestAnimationFrame` loop, turns raw pad state into press / release / repeat
 * events, and hands those to every subscriber. The loop runs only while something is
 * listening.
 *
 * Buttons are named by POSITION, never by label. Index 0 is the bottom face button:
 * "A" on an Xbox pad, "B" on a Nintendo one. Which position means *confirm* is a user
 * preference, pushed in from `settings/store.ts` — this layer holds it but does not
 * own it, so nothing here imports the frontend.
 */

export type PadButton =
  | 'south' | 'east' | 'west' | 'north'
  | 'l1' | 'r1' | 'l2' | 'r2'
  | 'select' | 'start' | 'l3' | 'r3'
  | 'up' | 'down' | 'left' | 'right';

export type PadLayout = 'xbox' | 'nintendo' | 'playstation';

/** Standard-mapping order. Pads that report a different mapping still tend to follow it. */
const BUTTONS: PadButton[] = [
  'south', 'east', 'west', 'north',
  'l1', 'r1', 'l2', 'r2',
  'select', 'start', 'l3', 'r3',
  'up', 'down', 'left', 'right',
];

/** Only movement auto-repeats; a repeating confirm would launch a game twice. */
const REPEATS = new Set<PadButton>(['up', 'down', 'left', 'right', 'l1', 'r1']);
const REPEAT_DELAY = 420;
const REPEAT_RATE = 90;
/** The stick doubles as the d-pad. Hysteresis stops a wobble at the edge machine-gunning. */
const AXIS_ON = 0.55;
const AXIS_OFF = 0.35;
const TRIGGER_ON = 0.5;

export interface PadEvent {
  button: PadButton;
  down: boolean;
  /** True for auto-repeat while held; false for the initial press and every release. */
  repeat: boolean;
  /** Which pad, in `navigator.getGamepads()` order. */
  index: number;
}

export interface PadInfo {
  index: number;
  id: string;
  mapping: string;
}

type Listener = (event: PadEvent) => void;

const listeners = new Set<Listener>();
const padListeners = new Set<() => void>();
/** Per pad: for each held button, when it went down and when its next repeat is due. */
const state = new Map<number, Map<PadButton, { next: number }>>();

let pads: PadInfo[] = [];
let raf = 0;
let suspended = 0;
/** Set for the first frame after the loop starts; see `start()`. */
let priming = false;

/** Pushed in by settings/store.ts, so consumers need no frontend import to honour it. */
let config: { enabled: boolean; layout: PadLayout; rumble: boolean } = {
  enabled: true,
  layout: 'xbox',
  rumble: true,
};

export function setPadConfig(next: Partial<typeof config>) {
  config = { ...config, ...next };
}

/** Consumers gate navigation on this; the settings tester deliberately ignores it. */
export function padEnabled(): boolean {
  return config.enabled;
}

const FACE: Record<PadLayout, Record<'south' | 'east' | 'west' | 'north', string>> = {
  xbox: { south: 'A', east: 'B', west: 'X', north: 'Y' },
  nintendo: { south: 'B', east: 'A', west: 'Y', north: 'X' },
  playstation: { south: '✕', east: '○', west: '□', north: '△' },
};

const LABELS: Partial<Record<PadButton, string>> = {
  l1: 'L', r1: 'R', l2: 'LT', r2: 'RT', l3: 'L3', r3: 'R3',
  select: 'Select', start: 'Start',
  up: '↑', down: '↓', left: '←', right: '→',
};

/** What this button is printed as on the user's own controller. */
export function padGlyph(button: PadButton): string {
  if (button === 'south' || button === 'east' || button === 'west' || button === 'north') {
    return FACE[config.layout][button];
  }
  return LABELS[button] ?? button;
}

/**
 * Which positions confirm and cancel. Nintendo pads put the confirm button on the
 * right, everyone else puts it on the bottom, and the whole frontend asks here.
 */
export function padRoles(): { confirm: PadButton; cancel: PadButton } {
  return config.layout === 'nintendo'
    ? { confirm: 'east', cancel: 'south' }
    : { confirm: 'south', cancel: 'east' };
}

function readPads(): (Gamepad | null)[] {
  return navigator.getGamepads?.() ?? [];
}

function refresh(list: (Gamepad | null)[]) {
  const next: PadInfo[] = [];
  for (const pad of list) if (pad) next.push({ index: pad.index, id: pad.id, mapping: pad.mapping });
  // useSyncExternalStore compares by reference, so only swap the array when it changed.
  const same =
    next.length === pads.length && next.every((p, i) => p.index === pads[i].index && p.id === pads[i].id);
  if (same) return;
  pads = next;
  for (const fn of padListeners) fn();
}

function emit(event: PadEvent) {
  for (const fn of listeners) fn(event);
}

function axisDown(value: number, sign: number, was: boolean): boolean {
  const v = value * sign;
  return was ? v > AXIS_OFF : v > AXIS_ON;
}

function isDown(pad: Gamepad, button: PadButton, was: boolean): boolean {
  const raw = pad.buttons[BUTTONS.indexOf(button)];
  if (raw) {
    if (raw.pressed) return true;
    // Analog triggers report a value long before they latch as "pressed".
    if ((button === 'l2' || button === 'r2') && raw.value > TRIGGER_ON) return true;
  }
  const [x = 0, y = 0] = pad.axes;
  if (button === 'left') return axisDown(x, -1, was);
  if (button === 'right') return axisDown(x, 1, was);
  if (button === 'up') return axisDown(y, -1, was);
  if (button === 'down') return axisDown(y, 1, was);
  return false;
}

function poll(t: number) {
  raf = requestAnimationFrame(poll);
  const list = readPads();
  refresh(list);
  for (const pad of list) {
    if (!pad) continue;
    let held = state.get(pad.index);
    if (!held) {
      held = new Map();
      state.set(pad.index, held);
    }
    for (const button of BUTTONS) {
      const prev = held.get(button);
      const down = isDown(pad, button, Boolean(prev));
      if (down && !prev) {
        held.set(button, { next: t + REPEAT_DELAY });
        if (!priming) emit({ button, down: true, repeat: false, index: pad.index });
      } else if (down && prev) {
        if (REPEATS.has(button) && t >= prev.next) {
          prev.next = t + REPEAT_RATE;
          emit({ button, down: true, repeat: true, index: pad.index });
        }
      } else if (prev) {
        held.delete(button);
        emit({ button, down: false, repeat: false, index: pad.index });
      }
    }
  }
  priming = false;
}

/** Nothing may be left held when the loop stops, or a game keeps thrusting forever. */
function releaseAll() {
  for (const [index, held] of state) {
    for (const button of held.keys()) emit({ button, down: false, repeat: false, index });
    held.clear();
  }
}

function start() {
  if (raf || suspended || !listeners.size) return;
  // The loop stops whenever the last listener leaves, which happens for one tick every
  // time a view is replaced — and a launch is usually still being held down at that
  // moment. Without this, the next view's first poll would find a pressed button with
  // no history and report it as a brand new press, so one press of confirm would both
  // open a gamelist and launch whatever it landed on. The first frame after a start
  // records what is already held and stays quiet about it.
  priming = true;
  raf = requestAnimationFrame(poll);
}

function stop() {
  if (!raf) return;
  cancelAnimationFrame(raf);
  raf = 0;
  releaseAll();
}

/** Press, release and repeat events from every connected pad. */
export function subscribePad(fn: Listener): () => void {
  listeners.add(fn);
  start();
  return () => {
    listeners.delete(fn);
    if (!listeners.size) stop();
  };
}

/**
 * Hands the pad to something else — an emulator iframe polls it itself, and a frontend
 * that kept polling would navigate the page behind the game. Returns the undo.
 */
export function suspendPad(): () => void {
  suspended += 1;
  stop();
  return () => {
    suspended = Math.max(0, suspended - 1);
    start();
  };
}

/* ------------------------- Connected pads, as a store ------------------------- */

export function subscribePads(fn: () => void): () => void {
  padListeners.add(fn);
  return () => {
    padListeners.delete(fn);
  };
}

export function getPads(): PadInfo[] {
  return pads;
}

// Browsers only surface a pad after the page has seen a gesture, which is what the
// connection events are for. Kept outside the poll loop so the list is right even on a
// page that never subscribes.
if (typeof window !== 'undefined') {
  const sync = () => refresh(readPads());
  window.addEventListener('gamepadconnected', sync);
  window.addEventListener('gamepaddisconnected', sync);
}

/* ---------------------------------- Haptics ---------------------------------- */

interface Actuator {
  playEffect(type: string, params: Record<string, number>): Promise<unknown>;
}

/** A short bump on launch or a record. Silently absent on pads and browsers without it. */
export function rumble(index = 0, strength = 0.4, ms = 90) {
  if (!config.rumble) return;
  const pad = readPads()[index];
  const actuator = (pad as unknown as { vibrationActuator?: Actuator } | null)?.vibrationActuator;
  if (!actuator?.playEffect) return;
  void actuator
    .playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength })
    .catch(() => {});
}
