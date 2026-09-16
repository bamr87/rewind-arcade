import { useSyncExternalStore } from 'react';
import { EMU_SYSTEMS, getEmuSystem } from './systems';

/**
 * The dumps this browser knows about, with no server involved.
 *
 * On a static host (GitHub Pages) there is no roms plugin to list a folder, so the
 * browser keeps its own library in two forms:
 *
 * - **A folder you granted.** Chrome and Edge can hand the page a real directory handle;
 *   it is stored in IndexedDB and re-opened on the next visit, so the same
 *   `roms/<system-id>/` tree the dev server reads works on a deployed site. Nothing is
 *   copied — the files stay where they are and are read on demand.
 * - **Files you added.** Every browser can take a drop, and the bytes go into IndexedDB
 *   so a dump survives a reload. This is the fallback where handles are unsupported.
 *
 * Permission is the awkward part: a handle comes back from storage already knowing what
 * it points at, but the grant does not survive, and it can only be re-requested from a
 * user gesture. So a restored folder sits in `prompt` until someone clicks, which is why
 * that is a state the UI has to render rather than an error.
 */

export type RomSource = 'folder' | 'stored';

export interface LibraryFile {
  system: string;
  file: string;
  size: number;
  source: RomSource;
  /** Folder files are read back through their handle; stored files come out of IndexedDB. */
  handle?: FileSystemFileHandle;
}

/** `none` = never picked one. `prompt` = remembered, but the grant needs a click. */
export type FolderStatus = 'none' | 'granted' | 'prompt' | 'denied' | 'unsupported';

export interface LibraryState {
  ready: boolean;
  folderName: string | null;
  folderStatus: FolderStatus;
  files: LibraryFile[];
  busy: boolean;
  error: string | null;
}

const EMPTY: LibraryState = {
  ready: false,
  folderName: null,
  folderStatus: 'none',
  files: [],
  busy: false,
  error: null,
};

let state = EMPTY;
const listeners = new Set<() => void>();

function emit(next: Partial<LibraryState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function subscribeLibrary(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getLibrary(): LibraryState {
  return state;
}

export function useRomLibrary(): LibraryState {
  return useSyncExternalStore(subscribeLibrary, getLibrary, () => EMPTY);
}

export function supportsFolder(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/* ------------------------------- File matching ------------------------------- */

// A browser core streams a single file, so a sheet pointing at tracks is no use here.
const SKIP = new Set(['.cue', '.m3u']);

function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot).toLowerCase();
}

function accepts(systemId: string, name: string): boolean {
  const sys = getEmuSystem(systemId);
  const ext = extOf(name);
  if (!sys || SKIP.has(ext)) return false;
  return sys.exts.includes(ext) || ext === '.zip';
}

/** Extensions exactly one system claims. `.bin` and `.iso` belong to several, so they need a folder to say. */
const SOLE_CLAIM = (() => {
  const claims = new Map<string, string[]>();
  for (const sys of EMU_SYSTEMS) {
    for (const ext of sys.exts) claims.set(ext, [...(claims.get(ext) ?? []), sys.id]);
  }
  const out = new Map<string, string>();
  for (const [ext, ids] of claims) if (ids.length === 1 && !SKIP.has(ext)) out.set(ext, ids[0]);
  return out;
})();

/** Which system a file belongs to: the page you dropped it on, or its extension. */
export function systemForFile(name: string, hint?: string): string | undefined {
  if (name.startsWith('.')) return undefined;
  if (hint && accepts(hint, name)) return hint;
  if (hint) return undefined;
  return SOLE_CLAIM.get(extOf(name));
}

/* --------------------------------- Storage ---------------------------------- */

// Its own database: the catalog's is opened at version 1 elsewhere, and adding a store
// there would mean a version bump that makes the other opener throw.
const DB = 'rewind-arcade-roms';
const FILES = 'files';
const META = 'meta';
const FOLDER_KEY = 'folder';
const INDEX_KEY = 'stored-index';

interface StoredRecord {
  system: string;
  file: string;
  size: number;
  blob: Blob;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(FILES)) req.result.createObjectStore(FILES);
      if (!req.result.objectStoreNames.contains(META)) req.result.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(store: string, key: string): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

function idbPut(store: string, key: string, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(value, key);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function idbDelete(store: string, key: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      }),
  );
}

const keyOf = (system: string, file: string) => `${system}/${file}`;

/**
 * Stored files are listed from a small index record rather than by reading the store:
 * the values are whole ROMs, and listing them would pull every byte into memory.
 */
type StoredIndex = { system: string; file: string; size: number }[];

async function readStoredIndex(): Promise<StoredIndex> {
  const saved = await idbGet<StoredIndex>(META, INDEX_KEY).catch(() => null);
  return Array.isArray(saved) ? saved : [];
}

/* ------------------------------ Folder scanning ------------------------------ */

async function permissionFor(handle: FileSystemHandle, request: boolean): Promise<FolderStatus> {
  try {
    const query = handle.queryPermission ? await handle.queryPermission({ mode: 'read' }) : 'granted';
    if (query === 'granted') return 'granted';
    if (!request) return query === 'denied' ? 'denied' : 'prompt';
    const asked = handle.requestPermission ? await handle.requestPermission({ mode: 'read' }) : 'denied';
    return asked === 'granted' ? 'granted' : asked === 'denied' ? 'denied' : 'prompt';
  } catch {
    return 'denied';
  }
}

async function filesIn(dir: FileSystemDirectoryHandle, systemId: string): Promise<LibraryFile[]> {
  const out: LibraryFile[] = [];
  for await (const entry of dir.values()) {
    if (entry.kind !== 'file' || entry.name.startsWith('.') || !accepts(systemId, entry.name)) continue;
    const handle = entry as FileSystemFileHandle;
    const file = await handle.getFile();
    out.push({ system: systemId, file: entry.name, size: file.size, source: 'folder', handle });
  }
  return out;
}

/**
 * Reads a `roms/<system-id>/` tree. A folder named for a system is that system's; one
 * level of other folders is walked too, so picking the directory *above* roms/ still
 * works; and loose files are placed by extension when only one system claims it.
 */
async function scanFolder(root: FileSystemDirectoryHandle, depth = 0): Promise<LibraryFile[]> {
  const out: LibraryFile[] = [];
  for await (const entry of root.values()) {
    if (entry.name.startsWith('.')) continue;
    if (entry.kind === 'directory') {
      const id = entry.name.toLowerCase();
      if (getEmuSystem(id)) out.push(...(await filesIn(entry as FileSystemDirectoryHandle, id)));
      else if (depth < 1) out.push(...(await scanFolder(entry as FileSystemDirectoryHandle, depth + 1)));
      continue;
    }
    const id = systemForFile(entry.name);
    if (!id) continue;
    const handle = entry as FileSystemFileHandle;
    const file = await handle.getFile();
    out.push({ system: id, file: entry.name, size: file.size, source: 'folder', handle });
  }
  return out;
}

let folderHandle: FileSystemDirectoryHandle | null = null;

function storedFiles(index: StoredIndex): LibraryFile[] {
  return index.map((r) => ({ system: r.system, file: r.file, size: r.size, source: 'stored' as const }));
}

async function refreshFolder(request: boolean): Promise<LibraryFile[]> {
  if (!folderHandle) return [];
  const status = await permissionFor(folderHandle, request);
  emit({ folderStatus: status, folderName: folderHandle.name });
  if (status !== 'granted') return [];
  try {
    return await scanFolder(folderHandle);
  } catch (err) {
    emit({ error: err instanceof Error ? err.message : 'Could not read that folder' });
    return [];
  }
}

async function recompute(request = false) {
  const [folder, index] = await Promise.all([refreshFolder(request), readStoredIndex()]);
  emit({ files: [...folder, ...storedFiles(index)], ready: true });
}

let booted = false;

async function boot() {
  if (booted) return;
  booted = true;
  try {
    folderHandle = await idbGet<FileSystemDirectoryHandle>(META, FOLDER_KEY);
  } catch {
    folderHandle = null;
  }
  if (!folderHandle) emit({ folderStatus: supportsFolder() ? 'none' : 'unsupported' });
  await recompute(false);
}

void boot();

/* --------------------------------- Controls ---------------------------------- */

/** Ask for a folder. Chrome and Edge only; needs a click, and the grant is remembered. */
export async function pickFolder(): Promise<void> {
  if (!supportsFolder()) {
    emit({ folderStatus: 'unsupported', error: 'This browser cannot open a folder. Add files instead.' });
    return;
  }
  emit({ busy: true, error: null });
  try {
    const handle = await window.showDirectoryPicker?.({ id: 'rewind-roms', mode: 'read' });
    if (!handle) return;
    folderHandle = handle;
    await idbPut(META, FOLDER_KEY, handle).catch(() => {
      // Firefox/Safari cannot structured-clone a handle; the folder still works this session.
      emit({ error: 'This browser cannot remember the folder, so it must be picked again next visit.' });
    });
    await recompute(true);
  } catch (err) {
    // An abort is the user closing the picker, which is not an error worth showing.
    if (!(err instanceof DOMException && err.name === 'AbortError')) {
      emit({ error: err instanceof Error ? err.message : 'Could not open that folder' });
    }
  } finally {
    emit({ busy: false });
  }
}

/** Re-grant a remembered folder. Must be called from a click. */
export async function grantFolder(): Promise<void> {
  emit({ busy: true, error: null });
  try {
    await recompute(true);
  } finally {
    emit({ busy: false });
  }
}

export async function rescanFolder(): Promise<void> {
  emit({ busy: true });
  try {
    await recompute(false);
  } finally {
    emit({ busy: false });
  }
}

export async function forgetFolder(): Promise<void> {
  folderHandle = null;
  await idbDelete(META, FOLDER_KEY).catch(() => {});
  emit({ folderStatus: supportsFolder() ? 'none' : 'unsupported', folderName: null, error: null });
  await recompute(false);
}

export interface AddResult {
  added: number;
  rejected: string[];
}

/**
 * Copies dumps into this browser's storage. `hint` is the system whose page took the
 * drop; without one, only extensions that belong to exactly one system are accepted.
 */
export async function addFiles(files: File[], hint?: string): Promise<AddResult> {
  emit({ busy: true, error: null });
  const result: AddResult = { added: 0, rejected: [] };
  try {
    const index = await readStoredIndex();
    for (const file of files) {
      const system = systemForFile(file.name, hint);
      if (!system) {
        result.rejected.push(file.name);
        continue;
      }
      try {
        await idbPut(FILES, keyOf(system, file.name), {
          system,
          file: file.name,
          size: file.size,
          blob: file,
        } satisfies StoredRecord);
      } catch {
        result.rejected.push(file.name);
        continue;
      }
      const at = index.findIndex((r) => r.system === system && r.file === file.name);
      const record = { system, file: file.name, size: file.size };
      if (at >= 0) index[at] = record;
      else index.push(record);
      result.added += 1;
    }
    await idbPut(META, INDEX_KEY, index);
    // Without this the browser may evict the library to reclaim space.
    if (result.added) await navigator.storage?.persist?.().catch(() => false);
    await recompute(false);
  } finally {
    emit({ busy: false });
  }
  return result;
}

export async function removeStored(system: string, file: string): Promise<void> {
  await idbDelete(FILES, keyOf(system, file)).catch(() => {});
  const index = (await readStoredIndex()).filter((r) => !(r.system === system && r.file === file));
  await idbPut(META, INDEX_KEY, index).catch(() => {});
  await recompute(false);
}

export async function clearStored(): Promise<void> {
  const index = await readStoredIndex();
  for (const r of index) await idbDelete(FILES, keyOf(r.system, r.file)).catch(() => {});
  await idbPut(META, INDEX_KEY, []).catch(() => {});
  await recompute(false);
}

/** The bytes, read on demand — a folder file through its handle, a stored one from IndexedDB. */
export async function readLibraryFile(entry: LibraryFile): Promise<Blob> {
  if (entry.source === 'folder') {
    if (!entry.handle) throw new Error(`${entry.file} is no longer readable — re-open the folder`);
    return entry.handle.getFile();
  }
  const record = await idbGet<StoredRecord>(FILES, keyOf(entry.system, entry.file));
  if (!record?.blob) throw new Error(`${entry.file} is no longer in this browser's library`);
  return record.blob;
}
