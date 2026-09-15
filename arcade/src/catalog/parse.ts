import type { CatalogBundle, GameRow, InventoryRow, PriceRow, RomRow, SystemRow } from './types';

function hay(parts: unknown[]): string {
  return parts.map((p) => (p == null ? '' : String(p))).join(' ').toLowerCase();
}

function asRows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function indexGames(rows: GameRow[]): GameRow[] {
  return rows.map((r) => ({
    ...r,
    _h: hay([r.t, r.s, r.pub, r.dv, r.sr, r.g, r.fr, r.cl, r.c]),
  }));
}

function indexInventory(rows: InventoryRow[]): InventoryRow[] {
  return rows.map((r) => ({
    ...r,
    _h: hay([r.t, r.cl, r.c, r.nt, r.lo, r.cd, r.cp]),
  }));
}

function indexPrices(rows: PriceRow[]): PriceRow[] {
  return rows.map((r) => ({
    ...r,
    _h: hay([r.t, r.p, r.pub, r.nt]),
  }));
}

function gamesFromRoms(roms: RomRow[]): GameRow[] {
  const map = new Map<string, GameRow>();
  for (const r of roms) {
    const title = r.t || r.s || '';
    if (!r.c || !title) continue;
    const k = `${r.c.toLowerCase()}|${title.toLowerCase()}`;
    const prev = map.get(k);
    if (!prev) {
      map.set(k, {
        c: r.c,
        cl: r.cl,
        t: title,
        s: r.s,
        rg: r.rg,
        sr: r.sr,
        g: r.g,
        dv: r.dv,
        pub: r.pub,
        y: r.y,
        fr: r.fr,
        mp: r.mp,
        w: r.w,
        cr: r.cr,
        rv: r.rv,
        rb: r.rb,
        rt: r.rt,
        l: r.l,
        cb: r.cb,
        nw: r.nw,
        pt: r.pt,
        cs: r.cs,
        sl: r.sl,
        sna: r.sna,
        sjp: r.sjp,
        spal: r.spal,
        rc: 1,
        vd: r.vd,
        _h: '',
      });
      continue;
    }
    prev.rc = (prev.rc || 0) + 1;
    if ((r.rb ?? -1) > (prev.rb ?? -1)) prev.rb = r.rb;
    if (!prev.vd && r.vd) prev.vd = r.vd;
  }
  return indexGames([...map.values()]);
}

function overlayOwned(games: GameRow[], items: InventoryRow[]): void {
  if (!items.length) return;
  const map = new Map(games.map((g) => [`${g.c.toLowerCase()}|${g.t.toLowerCase()}`, g]));
  for (const item of items) {
    const g = map.get(`${(item.c || '').toLowerCase()}|${(item.t || '').toLowerCase()}`);
    if (g) g.oc = (g.oc || 0) + (item.q || 1);
  }
}

export function normalizeBundle(raw: {
  games?: unknown;
  roms?: unknown;
  inventory?: unknown;
  prices?: unknown;
  GAMES?: unknown;
  ROMS?: unknown;
  INVENTORY?: unknown;
  PRICES?: unknown;
  systems?: unknown;
  SYSTEMS?: unknown;
}): CatalogBundle {
  const roms = asRows<RomRow>(raw.roms ?? raw.ROMS);
  const exported = indexGames(asRows<GameRow>(raw.games ?? raw.GAMES));
  const inventory = indexInventory(asRows<InventoryRow>(raw.inventory ?? raw.INVENTORY));
  const games = exported.length ? exported : gamesFromRoms(roms);
  if (!exported.length) overlayOwned(games, inventory);
  return {
    games,
    roms,
    inventory,
    prices: indexPrices(asRows<PriceRow>(raw.prices ?? raw.PRICES)),
    systems: asRows<SystemRow>(raw.systems ?? raw.SYSTEMS),
  };
}

export function parseCatalogText(text: string): CatalogBundle {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Empty catalog file');
  if (trimmed.startsWith('{')) {
    return normalizeBundle(JSON.parse(trimmed) as Record<string, unknown>);
  }
  if (!/window\.(GAMES|ROMS|INVENTORY|PRICES)\s*=/.test(trimmed)) {
    throw new Error('Expected cartidx data.js (window.GAMES=…) or a JSON bundle');
  }
  const sandbox: Record<string, unknown> = {};
  const run = new Function('window', `${trimmed}\nreturn window;`);
  return normalizeBundle(run(sandbox) as Record<string, unknown>);
}

export function isEmptyBundle(bundle: CatalogBundle): boolean {
  return (
    bundle.games.length === 0 &&
    bundle.roms.length === 0 &&
    bundle.inventory.length === 0 &&
    bundle.prices.length === 0
  );
}
