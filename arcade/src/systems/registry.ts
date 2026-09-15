import registryYaml from '../../../systems/registry.yaml?raw';
import { parseRegistry } from './parse';
import type { Platform } from './types';

export type { Platform };

export const SYSTEMS: Platform[] = parseRegistry(registryYaml);

export function getPlatform(id: string | undefined): Platform | undefined {
  return SYSTEMS.find((s) => s.id === id);
}

export function catalogPlatforms(): Platform[] {
  return SYSTEMS.filter((s) => s.catalog);
}

export function playPlatforms(): Platform[] {
  return SYSTEMS.filter((s) => s.arcade);
}

export function emulatePlatforms(): Platform[] {
  return SYSTEMS.filter((s) => s.emulate);
}

export function identifyPlatforms(): Platform[] {
  return SYSTEMS.filter((s) => s.identify);
}

export function manufacturers(): string[] {
  return [...new Set(SYSTEMS.map((s) => s.manufacturer))].sort((a, b) => a.localeCompare(b));
}

export function groupedByManufacturer(): { manufacturer: string; systems: Platform[] }[] {
  const map = new Map<string, Platform[]>();
  for (const s of SYSTEMS) {
    const list = map.get(s.manufacturer);
    if (list) list.push(s);
    else map.set(s.manufacturer, [s]);
  }
  return [...map.entries()]
    .map(([manufacturer, systems]) => ({ manufacturer, systems }))
    .sort((a, b) => a.manufacturer.localeCompare(b.manufacturer));
}
