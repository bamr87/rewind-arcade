import type { GameConfig } from './types';

/**
 * Thin, crash-proof wrapper over localStorage. All arcade persistence — best
 * scores, per-game config overrides, global settings — funnels through here so
 * private-mode / quota failures never break gameplay.
 */
const PREFIX = 'rewind-arcade:';

class Storage {
  private read(key: string): string | null {
    try {
      return localStorage.getItem(PREFIX + key);
    } catch {
      return null;
    }
  }
  private write(key: string, value: string) {
    try {
      localStorage.setItem(PREFIX + key, value);
    } catch {
      /* ignore */
    }
  }

  getBool(key: string, fallback: boolean): boolean {
    const v = this.read(key);
    return v === null ? fallback : v === '1';
  }
  setBool(key: string, value: boolean) {
    this.write(key, value ? '1' : '0');
  }

  getNumber(key: string, fallback: number): number {
    const v = this.read(key);
    if (v === null) return fallback;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  }
  setNumber(key: string, value: number) {
    this.write(key, String(value));
  }

  /* --- Per-game high score --- */
  bestScore(gameId: string): number {
    return this.getNumber(`best:${gameId}`, 0);
  }
  recordScore(gameId: string, score: number): boolean {
    if (score > this.bestScore(gameId)) {
      this.setNumber(`best:${gameId}`, score);
      return true;
    }
    return false;
  }

  /* --- Per-game config overrides --- */
  loadConfig(gameId: string, defaults: GameConfig): GameConfig {
    const raw = this.read(`config:${gameId}`);
    if (!raw) return { ...defaults };
    try {
      const saved = JSON.parse(raw) as GameConfig;
      // Only keep keys that still exist in the schema defaults.
      const merged: GameConfig = { ...defaults };
      for (const k of Object.keys(defaults)) {
        if (k in saved && typeof saved[k] === typeof defaults[k]) merged[k] = saved[k];
      }
      return merged;
    } catch {
      return { ...defaults };
    }
  }
  saveConfig(gameId: string, config: GameConfig) {
    this.write(`config:${gameId}`, JSON.stringify(config));
  }
  clearConfig(gameId: string) {
    try {
      localStorage.removeItem(PREFIX + `config:${gameId}`);
    } catch {
      /* ignore */
    }
  }

  getJson<T>(key: string, fallback: T): T {
    const raw = this.read(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  setJson(key: string, value: unknown) {
    this.write(key, JSON.stringify(value));
  }
}

export const storage = new Storage();
