import { useSyncExternalStore } from 'react';
import { setPadConfig, type PadLayout } from '../engine/gamepad';
import { storage } from '../engine/storage';

/**
 * Frontend preferences (theme, CRT filter, motion, gamepad). Applied as data attributes
 * on <html> so plain CSS can react; sound stays in the engine's audio bus and the pad
 * preferences are pushed into the pad service.
 */

export const PHOSPHORS = [
  { id: 'cyan', label: 'Cyan', color: '#38bdf8' },
  { id: 'magenta', label: 'Magenta', color: '#f472b6' },
  { id: 'amber', label: 'Amber', color: '#fbbf24' },
  { id: 'green', label: 'Green', color: '#4ade80' },
  { id: 'violet', label: 'Violet', color: '#a78bfa' },
] as const;

export type Phosphor = (typeof PHOSPHORS)[number]['id'];
export type MotionPref = 'system' | 'reduced' | 'full';

/** Which controller the button glyphs and the confirm position should match. */
export const PAD_LAYOUTS: { id: PadLayout; label: string; note: string }[] = [
  { id: 'xbox', label: 'Xbox', note: 'A confirms, B goes back' },
  { id: 'nintendo', label: 'Nintendo', note: 'A on the right confirms, B goes back' },
  { id: 'playstation', label: 'PlayStation', note: '✕ confirms, ○ goes back' },
];

export interface Settings {
  phosphor: Phosphor;
  crt: boolean;
  ambient: boolean;
  confetti: boolean;
  motion: MotionPref;
  gamepad: boolean;
  padLayout: PadLayout;
  rumble: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  phosphor: 'cyan',
  crt: false,
  ambient: true,
  confetti: true,
  motion: 'system',
  gamepad: true,
  padLayout: 'xbox',
  rumble: true,
};

const KEY = 'settings-v1';

type BoolKey = 'crt' | 'ambient' | 'confetti' | 'gamepad' | 'rumble';

function load(): Settings {
  const raw = storage.getJson<Record<string, unknown>>(KEY, {});
  const bool = (k: BoolKey) => (typeof raw[k] === 'boolean' ? (raw[k] as boolean) : DEFAULT_SETTINGS[k]);
  return {
    phosphor: PHOSPHORS.some((p) => p.id === raw.phosphor) ? (raw.phosphor as Phosphor) : DEFAULT_SETTINGS.phosphor,
    crt: bool('crt'),
    ambient: bool('ambient'),
    confetti: bool('confetti'),
    motion: raw.motion === 'reduced' || raw.motion === 'full' ? raw.motion : 'system',
    gamepad: bool('gamepad'),
    padLayout: PAD_LAYOUTS.some((l) => l.id === raw.padLayout)
      ? (raw.padLayout as PadLayout)
      : DEFAULT_SETTINGS.padLayout,
    rumble: bool('rumble'),
  };
}

function apply(s: Settings) {
  const root = document.documentElement;
  root.dataset.phosphor = s.phosphor;
  root.dataset.motion = s.motion;
  root.dataset.ambient = s.ambient ? 'on' : 'off';
  // The pad service holds these so nothing under engine/ has to import the frontend.
  setPadConfig({ enabled: s.gamepad, layout: s.padLayout, rumble: s.rumble });
}

let state = load();
apply(state);
const listeners = new Set<() => void>();

function commit(next: Settings) {
  state = next;
  storage.setJson(KEY, next);
  apply(next);
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function getSettings(): Settings {
  return state;
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  commit({ ...state, [key]: value });
}

export function resetSettings() {
  commit({ ...DEFAULT_SETTINGS });
}

/** Maps the preference onto Motion's `MotionConfig reducedMotion`. */
export function reducedMotion(s: Settings): 'user' | 'always' | 'never' {
  return s.motion === 'reduced' ? 'always' : s.motion === 'full' ? 'never' : 'user';
}
