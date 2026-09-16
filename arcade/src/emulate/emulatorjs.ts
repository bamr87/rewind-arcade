/**
 * Where EmulatorJS itself is loaded from.
 *
 * A vendored build (`npm run emulatorjs`, served at `<base>/emulatorjs/`) is preferred, so
 * a session touches no third-party host at all. When it has not been fetched the CDN still
 * works, and the player says which one it used.
 */

const CDN = 'https://cdn.emulatorjs.org/stable/data/';

export interface EmulatorData {
  /** Absolute URL, with trailing slash: EmulatorJS resolves everything against it. */
  path: string;
  local: boolean;
}

let resolved: Promise<EmulatorData> | null = null;

export function emulatorData(): Promise<EmulatorData> {
  if (!resolved) {
    resolved = (async () => {
      const local = new URL(`${import.meta.env.BASE_URL}emulatorjs/`, window.location.href).href;
      try {
        const res = await fetch(`${local}version.json`, { cache: 'no-store' });
        if (res.ok) return { path: local, local: true };
      } catch {
        /* not vendored: fall through to the CDN */
      }
      return { path: CDN, local: false };
    })();
  }
  return resolved;
}
