import { useSyncExternalStore } from 'react';
import { getLibrary, readLibraryFile, subscribeLibrary, type LibraryFile } from './library';

/**
 * Every dump the frontend can launch, from whichever source has it.
 *
 * Two of them exist. The dev server lists `emulate/roms/<system>/` through the roms
 * plugin in `vite.config.ts`; a deployed site has no such folder, so there the browser's
 * own library answers instead (see `library.ts`) — a folder you granted, or files you
 * added. Both arrive here in the same shape, which is what lets gamelists, ROM badges
 * and one-click launch behave identically on a static host and in development.
 *
 * Files are named however their owner named them, so a dump is matched to a catalog
 * title by a set of keys rather than one: the bare slug, the No-Intro name without its
 * tags, and the slug without the tail cartidx adds (`-unverified-dump`) or a region.
 */

export type RomSource = 'server' | 'folder' | 'stored';

export interface RomFile {
  system: string;
  file: string;
  size: number;
  /** Shown when no catalog title claims this file. */
  label: string;
  keys: string[];
  source: RomSource;
  /** Present for browser-held files; how the bytes are read back. */
  lib?: LibraryFile;
}

export type RomStatus = 'loading' | 'ready' | 'empty';

export interface RomIndex {
  status: RomStatus;
  /** Where the files came from, for the UI to name. */
  root: string | null;
  count: number;
  bySystem: Map<string, RomFile[]>;
  /** `${system}|${key}` → file. */
  keyed: Map<string, RomFile>;
  counts: Record<RomSource, number>;
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

/** How a file is described to the person who owns it. */
export function sourceLabel(source: RomSource): string {
  return source === 'stored' ? 'saved in this browser' : 'from your roms folder';
}

const EMPTY: RomIndex = {
  status: 'loading',
  root: null,
  count: 0,
  bySystem: new Map(),
  keyed: new Map(),
  counts: { server: 0, folder: 0, stored: 0 },
};

let state = EMPTY;
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

interface ServerRom {
  system: string;
  file: string;
  size: number;
}

let serverRoot: string | null = null;
let serverRoms: ServerRom[] = [];
let serverDone = false;

function build(): RomIndex {
  const library = getLibrary();
  const bySystem = new Map<string, RomFile[]>();
  const keyed = new Map<string, RomFile>();
  const counts: Record<RomSource, number> = { server: 0, folder: 0, stored: 0 };
  const seen = new Set<string>();

  const add = (system: string, file: string, size: number, source: RomSource, lib?: LibraryFile) => {
    // The same dump can be both on disk and in the browser; the first source wins.
    const id = `${system}|${file.toLowerCase()}`;
    if (seen.has(id)) return;
    seen.add(id);
    const rom: RomFile = { system, file, size, label: labelOf(file), keys: fileKeys(file), source, lib };
    const list = bySystem.get(system);
    if (list) list.push(rom);
    else bySystem.set(system, [rom]);
    for (const key of rom.keys) {
      const at = `${system}|${key}`;
      if (!keyed.has(at)) keyed.set(at, rom);
    }
    counts[source] += 1;
  };

  for (const r of serverRoms) add(r.system, r.file, r.size, 'server');
  for (const f of library.files) add(f.system, f.file, f.size, f.source, f);

  const count = counts.server + counts.folder + counts.stored;
  const loading = !serverDone || !library.ready;
  return {
    status: loading && !count ? 'loading' : count ? 'ready' : 'empty',
    root: serverRoot ?? library.folderName,
    count,
    bySystem,
    keyed,
    counts,
  };
}

function publish() {
  state = build();
  listeners.forEach((l) => l());
}

subscribeLibrary(publish);

let booted = false;

async function boot() {
  if (booted) return;
  booted = true;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}roms-index.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`roms index: ${res.status}`);
    const data = (await res.json()) as { root?: unknown; roms?: unknown };
    serverRoot = typeof data.root === 'string' ? data.root : null;
    serverRoms = (Array.isArray(data.roms) ? data.roms : []).filter(
      (r): r is ServerRom =>
        Boolean(r) && typeof r === 'object' && typeof r.system === 'string' && typeof r.file === 'string',
    );
  } catch {
    // A static deploy serves no index; the browser's own library is the whole story.
    serverRoot = null;
    serverRoms = [];
  }
  serverDone = true;
  publish();
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

export interface OpenRom {
  url: string;
  /** Frees the object URL for a browser-held file. Safe to call for any source. */
  release: () => void;
}

/**
 * A URL the emulator can load. Dev-server files already have one; a browser-held file
 * becomes an object URL, which the player must release when it ejects. The iframe that
 * runs the core is `srcDoc`, so it shares this document's origin and can read it.
 */
export async function openRom(rom: RomFile): Promise<OpenRom> {
  if (rom.source === 'server') {
    const rel = `${import.meta.env.BASE_URL}roms/${rom.system}/${encodeURIComponent(rom.file)}`;
    return { url: new URL(rel, window.location.href).href, release: () => {} };
  }
  if (!rom.lib) throw new Error(`${rom.file} cannot be read from here`);
  const blob = await readLibraryFile(rom.lib);
  const url = URL.createObjectURL(blob);
  return { url, release: () => URL.revokeObjectURL(url) };
}
