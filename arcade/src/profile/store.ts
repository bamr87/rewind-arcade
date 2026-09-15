import { useSyncExternalStore } from 'react';
import { storage } from '../engine/storage';

/**
 * Host-side play history for the recreations: sessions, time played, recent
 * scores, favorites. Games never see this. `GamePage` feeds it from the engine's
 * lifecycle and score callbacks; best scores stay where the engine keeps them.
 */

const KEY = 'profile-v1';
const MAX_SCORES = 24;

export interface ScoreEntry {
  score: number;
  at: number;
  record: boolean;
}

export interface GameStats {
  plays: number;
  seconds: number;
  lastPlayed: number;
  scores: ScoreEntry[];
}

export interface Profile {
  games: Record<string, GameStats>;
  favorites: string[];
  since: number;
}

const EMPTY_STATS: GameStats = { plays: 0, seconds: 0, lastPlayed: 0, scores: [] };

function blank(): Profile {
  return { games: {}, favorites: [], since: Date.now() };
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
}

function sanitize(raw: unknown): Profile {
  const out = blank();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  if (num(r.since)) out.since = num(r.since);
  if (Array.isArray(r.favorites)) {
    out.favorites = [...new Set(r.favorites.filter((f): f is string => typeof f === 'string'))];
  }
  if (r.games && typeof r.games === 'object') {
    for (const [id, g] of Object.entries(r.games as Record<string, unknown>)) {
      if (!g || typeof g !== 'object') continue;
      const s = g as Record<string, unknown>;
      const scores = Array.isArray(s.scores)
        ? s.scores.flatMap((e): ScoreEntry[] => {
            if (!e || typeof e !== 'object') return [];
            const x = e as Record<string, unknown>;
            return num(x.score) ? [{ score: num(x.score), at: num(x.at), record: x.record === true }] : [];
          })
        : [];
      out.games[id] = {
        plays: Math.round(num(s.plays)),
        seconds: Math.round(num(s.seconds)),
        lastPlayed: num(s.lastPlayed),
        scores: scores.slice(-MAX_SCORES),
      };
    }
  }
  return out;
}

let state: Profile = sanitize(storage.getJson<unknown>(KEY, null));
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function commit(next: Profile) {
  state = next;
  storage.setJson(KEY, next);
  emit();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// Another tab finished a game: pick up its history.
window.addEventListener('storage', (e) => {
  if (!e.key?.endsWith(KEY)) return;
  state = sanitize(storage.getJson<unknown>(KEY, null));
  emit();
});

export function useProfile(): Profile {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function statsFor(profile: Profile, id: string): GameStats {
  return profile.games[id] ?? EMPTY_STATS;
}

function update(id: string, fn: (s: GameStats) => GameStats) {
  commit({ ...state, games: { ...state.games, [id]: fn(state.games[id] ?? EMPTY_STATS) } });
}

export function startSession(id: string) {
  update(id, (s) => ({ ...s, plays: s.plays + 1, lastPlayed: Date.now() }));
}

export function addPlayTime(id: string, seconds: number) {
  if (!(seconds >= 1)) return;
  update(id, (s) => ({ ...s, seconds: s.seconds + Math.round(seconds), lastPlayed: Date.now() }));
}

export function logScore(id: string, score: number, record: boolean) {
  if (!(score > 0)) return;
  update(id, (s) => ({ ...s, scores: [...s.scores, { score, at: Date.now(), record }].slice(-MAX_SCORES) }));
}

export function toggleFavorite(id: string) {
  const has = state.favorites.includes(id);
  commit({ ...state, favorites: has ? state.favorites.filter((f) => f !== id) : [...state.favorites, id] });
  return !has;
}

export function recentlyPlayed(profile: Profile, limit = 6): [string, GameStats][] {
  return Object.entries(profile.games)
    .filter(([, s]) => s.lastPlayed > 0)
    .sort((a, b) => b[1].lastPlayed - a[1].lastPlayed)
    .slice(0, limit);
}

export function totals(profile: Profile) {
  const all = Object.values(profile.games);
  return {
    plays: all.reduce((n, s) => n + s.plays, 0),
    seconds: all.reduce((n, s) => n + s.seconds, 0),
    played: all.filter((s) => s.plays > 0).length,
    records: all.reduce((n, s) => n + s.scores.filter((e) => e.record).length, 0),
  };
}

export function resetProfile() {
  commit(blank());
}

/** A portable JSON backup: history, favorites, and the engine's best scores. */
export function exportProfile(gameIds: string[]): string {
  const bests: Record<string, number> = {};
  for (const id of gameIds) {
    const b = storage.bestScore(id);
    if (b > 0) bests[id] = b;
  }
  return JSON.stringify(
    { app: 'rewind-arcade', kind: 'profile', version: 1, exportedAt: new Date().toISOString(), profile: state, bests },
    null,
    2,
  );
}

/** Replaces history with a backup. Best scores only ever move up. */
export function importProfile(text: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not JSON');
  }
  const doc = parsed as Record<string, unknown> | null;
  if (!doc || doc.app !== 'rewind-arcade' || doc.kind !== 'profile') {
    throw new Error('That is not a Rewind Arcade profile backup');
  }
  const bests = (doc.bests && typeof doc.bests === 'object' ? doc.bests : {}) as Record<string, unknown>;
  for (const [id, n] of Object.entries(bests)) {
    if (num(n)) storage.recordScore(id, Math.round(num(n)));
  }
  commit(sanitize(doc.profile));
}
