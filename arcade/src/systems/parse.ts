import type { Platform } from './types';

function unquote(raw: string): string {
  const v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

export function parseRegistry(yaml: string): Platform[] {
  const systems: Platform[] = [];
  let cur: Partial<Platform> | null = null;

  const flush = () => {
    if (cur?.id && cur.name) {
      systems.push({
        id: cur.id,
        name: cur.name,
        short: cur.short ?? cur.id,
        manufacturer: cur.manufacturer ?? 'Various',
        year: cur.year ?? 0,
        media: cur.media ?? '',
        arcade: cur.arcade ?? false,
        emulate: cur.emulate ?? false,
        emulateEnabled: cur.emulateEnabled ?? false,
        identify: cur.identify ?? false,
        catalog: cur.catalog ?? false,
      });
    }
    cur = null;
  };

  for (const raw of yaml.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line || line.trimStart().startsWith('#')) continue;
    const idMatch = line.match(/^\s*-\s+id:\s*(.+)$/);
    if (idMatch) {
      flush();
      cur = { id: unquote(idMatch[1]) };
      continue;
    }
    if (!cur) continue;
    const m = line.match(/^\s+([A-Za-z_]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const v = unquote(m[2]);
    switch (key) {
      case 'name':
        cur.name = v;
        break;
      case 'short':
        cur.short = v;
        break;
      case 'manufacturer':
        cur.manufacturer = v;
        break;
      case 'year':
        cur.year = Number(v) || 0;
        break;
      case 'media':
        cur.media = v;
        break;
      case 'arcade':
        cur.arcade = v === 'true';
        break;
      case 'emulate':
        cur.emulate = v === 'true';
        break;
      case 'emulate_enabled':
        cur.emulateEnabled = v === 'true';
        break;
      case 'identify':
        cur.identify = v === 'true';
        break;
      case 'catalog':
        cur.catalog = v === 'true';
        break;
      default:
        break;
    }
  }
  flush();
  return systems;
}
