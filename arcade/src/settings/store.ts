import { useSyncExternalStore } from 'react';
import { storage } from '../engine/storage';

/**
 * Frontend preferences (theme, CRT filter, motion). Applied as data attributes on
 * <html> so plain CSS can react; sound stays in the engine's audio bus.
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

export interface Settings {
  phosphor: Phosphor;
  crt: boolean;
  ambient: boolean;
  confetti: boolean;
  motion: MotionPref;
}

export const DEFAULT_SETTINGS: Settings = {
  phosphor: 'cyan',
  crt: false,
  ambient: true,
  confetti: true,
  motion: 'system',
};

const KEY = 'settings-v1';

function load(): Settings {
  const raw = storage.getJson<Record<string, unknown>>(KEY, {});
  const bool = (k: 'crt' | 'ambient' | 'confetti') => (typeof raw[k] === 'boolean' ? (raw[k] as boolean) : DEFAULT_SETTINGS[k]);
  return {
    phosphor: PHOSPHORS.some((p) => p.id === raw.phosphor) ? (raw.phosphor as Phosphor) : DEFAULT_SETTINGS.phosphor,
    crt: bool('crt'),
    ambient: bool('ambient'),
    confetti: bool('confetti'),
    motion: raw.motion === 'reduced' || raw.motion === 'full' ? raw.motion : 'system',
  };
}

function apply(s: Settings) {
  const root = document.documentElement;
  root.dataset.phosphor = s.phosphor;
  root.dataset.motion = s.motion;
  root.dataset.ambient = s.ambient ? 'on' : 'off';
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
