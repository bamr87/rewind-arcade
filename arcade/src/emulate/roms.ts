import { useSyncExternalStore } from 'react';

/**
 * The dumps already sitting in `emulate/roms/<system>/`, as listed by the roms plugin in
 * `vite.config.ts`. A production build serves no such folder: the index 404s, the frontend
 * finds no local games, and every emulate route falls back to asking for a file.
 *
 * Files are named however their owner named them, so a dump is matched to a catalog title
 * by a set of keys rather than one: the bare slug, the No-Intro name without its tags, and
 * the slug without the tail cartidx adds (`-unverified-dump`) or a region (`-japan`).
 */

export interface RomFile {
  system: string;
  file: string;
  size: number;
  /** Shown when no catalog title claims this file. */
  label: string;
  keys: string[];
}

export type RomStatus = 'loading' | 'ready' | 'empty';

export interface RomIndex {
  status: RomStatus;
  /** The folder being served, for the UI to name. */
  root: string | null;
  count: number;
  bySystem: Map<string, RomFile[]>;
  /** `${system}|${key}` → file. */
  keyed: Map<string, RomFile>;
}

const CARTIDX_SUFFIX = /-(?:unverified-dump|overdump|headered|bad-dump|dup-\d+)$/;
const REGION_SUFFIX =
  /-(?:japan|usa|us|europe|world|brazil|korea|france|germany|spain|italy|australia|asia|china|taiwan|sweden|netherlands|canada|uk)$/;

function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Every key a file name could match a title on, most literal first. */
export function fileKeys(name: string): string[] {
  const stem = name.replace(/\.[^.]+$/, '');
  const keys = [norm(stem), norm(stem.replace(/[([].*$/, ' '))];
  for (const key of [...keys]) {
    const trimmed = key.replace(CARTIDX_SUFFIX, '');
    if (trimmed !== key) keys.push(trimmed);
    const regionless = trimmed.replace(REGION_SUFFIX, '');
    if (regionless !== trimmed) keys.push(regionless);
  }
  return [...new Set(keys.filter(Boolean))];
}

/** The keys a catalog title offers: its slug, its title, and its No-Intro name without tags. */
export function titleKeys(title: string, slug?: string, nointro?: string): string[] {
  const keys = [slug ? norm(slug) : '', norm(title)];
  if (nointro) keys.push(norm(nointro.replace(/[([].*$/, ' ')));
  return [...new Set(keys.filter(Boolean))];
}

function labelOf(file: string): string {
  const stem = file.replace(/\.[^.]+$/, '');
  if (/\s/.test(stem)) return stem;
  return stem.split('-').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const EMPTY: RomIndex = {
  status: 'loading',
  root: null,
  count: 0,
  bySystem: new Map(),
  keyed: new Map(),
};

let state = EMPTY;
const listeners = new Set<() => void>();

function emit(next: RomIndex) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function build(root: string | null, raw: unknown[]): RomIndex {
  const bySystem = new Map<string, RomFile[]>();
  const keyed = new Map<string, RomFile>();
  let count = 0;
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const r = entry as { system?: unknown; file?: unknown; size?: unknown };
    if (typeof r.system !== 'string' || typeof r.file !== 'string') continue;
    const rom: RomFile = {
      system: r.system,
      file: r.file,
      size: typeof r.size === 'number' ? r.size : 0,
      label: labelOf(r.file),
      keys: fileKeys(r.file),
    };
    const list = bySystem.get(rom.system);
    if (list) list.push(rom);
    else bySystem.set(rom.system, [rom]);
    for (const key of rom.keys) {
      const id = `${rom.system}|${key}`;
      if (!keyed.has(id)) keyed.set(id, rom);
    }
    count += 1;
  }
  return { status: count ? 'ready' : 'empty', root, count, bySystem, keyed };
}

let booted = false;

async function boot() {
  if (booted) return;
  booted = true;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}roms-index.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`roms index: ${res.status}`);
    const data = (await res.json()) as { root?: unknown; roms?: unknown };
    emit(build(typeof data.root === 'string' ? data.root : null, Array.isArray(data.roms) ? data.roms : []));
  } catch {
    emit({ ...EMPTY, status: 'empty' });
  }
}

void boot();

export function useRoms(): RomIndex {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY);
}

export function findRom(index: RomIndex, system: string, keys: string[]): RomFile | undefined {
  for (const key of keys) {
    const hit = index.keyed.get(`${system}|${key}`);
    if (hit) return hit;
  }
  return undefined;
}

export function romUrl(rom: RomFile): string {
  const rel = `${import.meta.env.BASE_URL}roms/${rom.system}/${encodeURIComponent(rom.file)}`;
  return new URL(rel, window.location.href).href;
}
