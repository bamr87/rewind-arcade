import { useSyncExternalStore } from 'react';

/**
 * The catalog's own artwork (`cartidx media`), served at media/ beside the page: the same
 * files ES-DE shows on the desktop. index.json lists what exists per dump, so the page asks
 * for an image only when it is there. Without the folder everything falls back to the CDNs.
 */
export type MediaKind = 'covers' | 'marquees' | 'titlescreens' | 'physicalmedia' | 'screenshots';

type Entry = { t?: string } & Partial<Record<MediaKind, string>>;

interface MediaIndex {
  byStem: Map<string, Entry>;
  byTitle: Map<string, string>;
}

let index: MediaIndex | null = null;
const listeners = new Set<() => void>();

function key(systemId: string, title: string): string {
  return `${systemId.toLowerCase()}|${title.toLowerCase()}`;
}

async function load(): Promise<void> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}media/index.json`, { cache: 'no-store' });
    if (!res.ok) return;
    const raw = (await res.json()) as Record<string, Entry>;
    const byStem = new Map<string, Entry>();
    const byTitle = new Map<string, string>();
    for (const [stem, entry] of Object.entries(raw)) {
      byStem.set(stem, entry);
      const system = stem.split('/')[0];
      if (entry.t && !byTitle.has(key(system, entry.t))) byTitle.set(key(system, entry.t), stem);
    }
    index = { byStem, byTitle };
    listeners.forEach((l) => l());
  } catch {
    /* no media folder served: the CDNs remain */
  }
}

void load();

/** Re-render when the index arrives. */
export function useMediaIndex(): MediaIndex | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => index,
    () => null,
  );
}

function stemOf(file: string): string {
  const base = file.split('/').pop() ?? file;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/**
 * A local image URL for a game, found by its dump's file name when known (a file in the
 * roms folder) or else by system and title.
 */
export function localMedia(
  kind: MediaKind,
  systemId: string,
  title?: string,
  file?: string,
): string | undefined {
  if (!index) return undefined;
  let stem = file ? `${systemId}/${stemOf(file)}` : undefined;
  if (!stem || !index.byStem.has(stem)) stem = title ? index.byTitle.get(key(systemId, title)) : undefined;
  const ext = stem ? index.byStem.get(stem)?.[kind] : undefined;
  if (!stem || !ext) return undefined;
  const [system, name] = [stem.slice(0, stem.indexOf('/')), stem.slice(stem.indexOf('/') + 1)];
  return `${import.meta.env.BASE_URL}media/${encodeURIComponent(system)}/${kind}/${encodeURIComponent(name)}${ext}`;
}
