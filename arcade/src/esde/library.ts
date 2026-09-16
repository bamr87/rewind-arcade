import { useMemo } from 'react';
import { useCatalog } from '../catalog/store';
import type { GameRow, SystemRow } from '../catalog/types';
import { findRom, titleKeys, useRoms, type RomFile } from '../emulate/roms';
import { EMU_SYSTEMS, getEmuSystem } from '../emulate/systems';
import { GAMES } from '../games/registry';
import { getPlatform } from '../systems/registry';
import { boxCandidates, systemIcon } from './covers';
import { makerHue, sortName } from './theme';

export const RECREATIONS_ID = 'recreations';

/** How many standout titles a system card offers covers for (it shows the first four that load). */
const STANDOUTS = 6;

export interface EsSystem {
  id: string;
  name: string;
  short: string;
  manufacturer: string;
  year: number;
  media: string;
  hue: string;
  count: number;
  canEmu: boolean;
  /** Dumps for this system in the local roms folder. */
  romCount: number;
  /** libretro's picture of the console, when one exists for this id. */
  icon?: string;
  /** Box-art URL candidates for standout titles, one list per title. */
  covers: string[][];
  /** Hardware facts from the catalog export's systems table. */
  facts?: SystemRow;
}

export interface EsGame {
  key: string;
  systemId: string;
  title: string;
  sort: string;
  year?: number;
  releaseDate?: string;
  releaseType?: string;
  genre?: string;
  developer?: string;
  publisher?: string;
  rating?: number;
  ratingLabel?: string;
  description?: string;
  players?: number;
  esrb?: string;
  owned?: boolean;
  region?: string;
  kind: 'play' | 'catalog' | 'load' | 'rom';
  /** The file in the local roms folder this title launches, when there is one. */
  rom?: RomFile;
  playId?: string;
  slug?: string;
  accent?: string;
  icon?: string;
  nointro?: string;
  /** LaunchBox front-box file name. */
  boxArt?: string;
  video?: string;
}

function fromRow(row: GameRow, nointro?: string): EsGame {
  return {
    key: `${row.c}:${row.s || row.t}`,
    systemId: row.c,
    title: row.t,
    sort: sortName(row.t),
    year: row.y,
    releaseDate: row.rd,
    releaseType: row.ry,
    genre: row.g,
    developer: row.dv,
    publisher: row.pub,
    rating: row.rb,
    ratingLabel: row.rt,
    description: row.ov,
    players: row.mp,
    esrb: row.es,
    owned: Boolean(row.oc),
    region: row.rg,
    kind: 'catalog',
    slug: row.s,
    nointro: row.n ?? nointro,
    boxArt: row.bx,
    video: row.vu,
  };
}

/** A dump in the roms folder that no catalog title claimed. */
function romEntry(rom: RomFile): EsGame {
  return {
    key: `${rom.system}:rom:${rom.file}`,
    systemId: rom.system,
    title: rom.label,
    sort: sortName(rom.label),
    description: 'In your roms folder. Launches straight into the browser core.',
    kind: 'rom',
    rom,
  };
}

function loadEntry(systemId: string, short: string): EsGame {
  return {
    key: `${systemId}:__load`,
    systemId,
    title: `Load a ${short} dump`,
    sort: 'zzz-load',
    description: 'Drop a dump you own. Cores load from EmulatorJS; nothing is fetched.',
    kind: 'load',
  };
}

/** Owned titles first, then the best rated, keeping only those with any cover to try. */
function standouts(entries: EsGame[]): string[][] {
  return entries
    .filter((e) => e.kind === 'catalog')
    .map((e) => ({ e, urls: boxCandidates(e.systemId, e.nointro, e.boxArt) }))
    .filter((x) => x.urls.length > 0)
    .sort((a, b) => Number(Boolean(b.e.owned)) - Number(Boolean(a.e.owned)) || (b.e.rating ?? 0) - (a.e.rating ?? 0))
    .slice(0, STANDOUTS)
    .map((x) => x.urls);
}

export function useEsLibrary(): { systems: EsSystem[]; gamesOf: (id: string) => EsGame[] } {
  const catalog = useCatalog();
  const games = catalog.bundle?.games;
  const roms = catalog.bundle?.roms;
  const systemRows = catalog.bundle?.systems;
  const local = useRoms();

  return useMemo(() => {
    const names = new Map<string, string>();
    for (const r of roms ?? []) {
      if (!r.c || !r.t || !r.n) continue;
      const k = `${r.c.toLowerCase()}|${r.t.toLowerCase()}`;
      if (!names.has(k)) names.set(k, r.n);
    }
    const rows = games ?? [];
    const bySys = new Map<string, EsGame[]>();
    for (const row of rows) {
      const list = bySys.get(row.c);
      const entry = fromRow(row, names.get(`${row.c.toLowerCase()}|${row.t.toLowerCase()}`));
      if (list) list.push(entry);
      else bySys.set(row.c, [entry]);
    }
    const facts = new Map((systemRows ?? []).map((r) => [r.c, r]));

    const recreations: EsGame[] = GAMES.map((g) => ({
      key: `recreations:${g.id}`,
      systemId: RECREATIONS_ID,
      title: g.title,
      sort: sortName(g.title),
      year: Number(g.year) || undefined,
      description: g.description,
      genre: 'Recreation',
      developer: 'Rewind Arcade',
      kind: 'play' as const,
      playId: g.id,
      accent: g.accent,
      icon: g.icon,
    }));
    bySys.set(RECREATIONS_ID, recreations);

    // A dump in the roms folder joins the title it matches; the rest stand on their own.
    for (const [sid, files] of local.bySystem) {
      const entries = bySys.get(sid) ?? [];
      const used = new Set<RomFile>();
      for (const game of entries) {
        if (game.kind !== 'catalog' || game.rom) continue;
        const hit = findRom(local, sid, titleKeys(game.title, game.slug, game.nointro));
        if (hit && !used.has(hit)) {
          game.rom = hit;
          used.add(hit);
        }
      }
      for (const file of files) if (!used.has(file)) entries.push(romEntry(file));
      bySys.set(sid, entries);
    }

    const ids = new Set<string>([RECREATIONS_ID]);
    for (const s of EMU_SYSTEMS) ids.add(s.id);
    for (const id of bySys.keys()) ids.add(id);
    for (const id of local.bySystem.keys()) ids.add(id);

    const systems: EsSystem[] = [];
    for (const id of ids) {
      const emu = getEmuSystem(id);
      const plat = getPlatform(id);
      const entries = bySys.get(id) ?? [];
      if (emu && !entries.some((e) => e.kind === 'load')) {
        entries.push(loadEntry(id, emu.short));
        bySys.set(id, entries);
      }
      if (id === RECREATIONS_ID) {
        systems.push({
          id,
          name: 'Rewind Arcade',
          short: 'Play',
          manufacturer: 'Various',
          year: 1972,
          media: 'software',
          hue: '#38bdf8',
          count: recreations.length,
          canEmu: false,
          romCount: 0,
          covers: [],
        });
        continue;
      }
      if (!plat && !emu) continue;
      const name = plat?.name ?? emu?.name ?? id;
      const short = plat?.short ?? emu?.short ?? id;
      const manufacturer = plat?.manufacturer ?? 'Various';
      systems.push({
        id,
        name,
        short,
        manufacturer,
        year: plat?.year ?? 0,
        media: plat?.media ?? '',
        hue: makerHue(manufacturer),
        count: entries.filter((e) => e.kind !== 'load').length,
        canEmu: Boolean(emu),
        romCount: local.bySystem.get(id)?.length ?? 0,
        icon: systemIcon(id),
        covers: standouts(entries),
        facts: facts.get(id),
      });
    }

    systems.sort((a, b) => {
      if (a.id === RECREATIONS_ID) return -1;
      if (b.id === RECREATIONS_ID) return 1;
      if (a.year !== b.year) return a.year - b.year;
      return a.name.localeCompare(b.name);
    });

    for (const list of bySys.values()) {
      list.sort((a, b) => {
        if (a.kind === 'load') return 1;
        if (b.kind === 'load') return -1;
        return a.sort.localeCompare(b.sort) || a.title.localeCompare(b.title);
      });
    }

    const gamesOf = (id: string) => bySys.get(id) ?? [];
    return { systems, gamesOf };
  }, [games, roms, systemRows, local]);
}
