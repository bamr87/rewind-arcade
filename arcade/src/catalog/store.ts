import { useSyncExternalStore } from 'react';
import { isEmptyBundle, parseCatalogText } from './parse';
import type { CatalogBundle, CatalogSource } from './types';

export type CatalogStatus = 'loading' | 'empty' | 'ready';

export interface CatalogState {
  status: CatalogStatus;
  bundle: CatalogBundle | null;
  source: CatalogSource | null;
  error: string | null;
}

const empty: CatalogState = { status: 'loading', bundle: null, source: null, error: null };

let state: CatalogState = empty;
const listeners = new Set<() => void>();

function emit(next: CatalogState) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const DB = 'rewind-arcade';
const STORE = 'kv';
const KEY = 'catalog-bundle';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(): Promise<CatalogBundle | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as CatalogBundle | undefined) ?? null);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

async function idbSet(bundle: CatalogBundle): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(bundle, KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* quota / private mode */
  }
}

async function idbClear(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

async function fetchWorkspace(): Promise<CatalogBundle | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}catalog-data.js`, { cache: 'no-store' });
    if (!res.ok) return null;
    const text = await res.text();
    const bundle = parseCatalogText(text);
    return isEmptyBundle(bundle) ? null : bundle;
  } catch {
    return null;
  }
}

let booted = false;

async function boot() {
  if (booted) return;
  booted = true;
  const workspace = await fetchWorkspace();
  if (workspace) {
    emit({ status: 'ready', bundle: workspace, source: 'workspace', error: null });
    return;
  }
  const saved = await idbGet();
  if (saved && !isEmptyBundle(saved)) {
    emit({ status: 'ready', bundle: saved, source: 'import', error: null });
    return;
  }
  emit({ status: 'empty', bundle: null, source: null, error: null });
}

void boot();

export function useCatalog(): CatalogState {
  return useSyncExternalStore(subscribe, () => state, () => empty);
}

export async function importCatalogFile(file: File): Promise<void> {
  const text = await file.text();
  const bundle = parseCatalogText(text);
  if (isEmptyBundle(bundle)) throw new Error('That file has no games, inventory, or prices');
  await idbSet(bundle);
  emit({ status: 'ready', bundle, source: 'import', error: null });
}

export async function clearCatalog(): Promise<void> {
  await idbClear();
  const workspace = await fetchWorkspace();
  if (workspace) {
    emit({ status: 'ready', bundle: workspace, source: 'workspace', error: null });
    return;
  }
  emit({ status: 'empty', bundle: null, source: null, error: null });
}
