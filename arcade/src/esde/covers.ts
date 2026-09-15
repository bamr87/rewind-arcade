const LIBRETRO: Record<string, string> = {
  nes: 'Nintendo - Nintendo Entertainment System',
  snes: 'Nintendo - Super Nintendo Entertainment System',
  n64: 'Nintendo - Nintendo 64',
  gb: 'Nintendo - Game Boy',
  gbc: 'Nintendo - Game Boy Color',
  gba: 'Nintendo - Game Boy Advance',
  nds: 'Nintendo - Nintendo DS',
  virtualboy: 'Nintendo - Virtual Boy',
  megadrive: 'Sega - Mega Drive - Genesis',
  mastersystem: 'Sega - Master System - Mark III',
  gamegear: 'Sega - Game Gear',
  sega32x: 'Sega - 32X',
  segacd: 'Sega - Mega-CD - Sega CD',
  saturn: 'Sega - Saturn',
  dreamcast: 'Sega - Dreamcast',
  sg1000: 'Sega - SG-1000',
  psx: 'Sony - PlayStation',
  psp: 'Sony - PlayStation Portable',
  atari2600: 'Atari - 2600',
  atari5200: 'Atari - 5200',
  atari7800: 'Atari - 7800',
  atari800: 'Atari - 8-bit',
  lynx: 'Atari - Lynx',
  jaguar: 'Atari - Jaguar',
  pcengine: 'NEC - PC Engine - TurboGrafx 16',
  pcenginecd: 'NEC - PC Engine CD - TurboGrafx-CD',
  neogeo: 'SNK - Neo Geo',
  ngp: 'SNK - Neo Geo Pocket',
  wonderswan: 'Bandai - WonderSwan',
  colecovision: 'Coleco - ColecoVision',
  intellivision: 'Mattel - Intellivision',
  c64: 'Commodore - 64',
  amiga: 'Commodore - Amiga',
  dos: 'DOS',
  arcade: 'Arcade',
  vectrex: 'GCE - Vectrex',
  '3do': 'The 3DO Company - 3DO',
  n64dd: 'Nintendo - Nintendo 64DD',
};

const CDN = 'https://thumbnails.libretro.com';
const LAUNCHBOX = 'https://images.launchbox-app.com';
// libretro's "systematic" XMB theme: one hardware render per console, named like its playlists.
const ICONS = 'https://cdn.jsdelivr.net/gh/libretro/retroarch-assets@master/xmb/systematic/png';
const ICON_NAME: Record<string, string> = {
  atari800: 'Atari - 8-bit Family',
  arcade: 'FBNeo - Arcade Games',
};

function clean(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
}

/** A LaunchBox image file name from the catalog (`bx`, `lg`, `ts`, `ct`) as a URL. */
export function launchboxImage(file: string | undefined): string | undefined {
  return file ? `${LAUNCHBOX}/${encodeURIComponent(file)}` : undefined;
}

/** libretro's picture of the console itself, when there is one for this id. */
export function systemIcon(systemId: string): string | undefined {
  const name = ICON_NAME[systemId] ?? LIBRETRO[systemId];
  return name ? `${ICONS}/${encodeURIComponent(name)}.png` : undefined;
}

function boxUrl(pack: string, name: string): string {
  return `${CDN}/${encodeURIComponent(pack)}/Named_Boxarts/${encodeURIComponent(clean(name))}.png`;
}

/** Front boxes only, most trustworthy first: the exact No-Intro name, then LaunchBox's match. */
export function boxCandidates(systemId: string, nointro?: string, launchbox?: string): string[] {
  const out: string[] = [];
  const pack = LIBRETRO[systemId];
  if (pack && nointro) out.push(boxUrl(pack, nointro));
  const lb = launchboxImage(launchbox);
  if (lb) out.push(lb);
  return out;
}

/**
 * Cover URLs to try in order: libretro's box for the exact No-Intro name, LaunchBox's box
 * for the matched title, then libretro boxes and title screens guessed from the title.
 */
export function coverCandidates(
  systemId: string,
  title: string,
  nointro?: string,
  region?: string,
  launchbox?: string,
): string[] {
  const pack = LIBRETRO[systemId];
  const lb = launchboxImage(launchbox);
  if (!pack) return lb ? [lb] : [];
  const names: string[] = [];
  const add = (n?: string) => {
    if (!n) return;
    const c = clean(n);
    if (c && !names.includes(c)) names.push(c);
  };
  add(nointro);
  add(title);
  if (region) add(`${title} (${region})`);
  add(`${title} (USA)`);
  add(`${title} (World)`);
  add(`${title} (Europe)`);
  add(`${title} (Japan)`);
  const head = title.split(':')[0].trim();
  if (head !== title) add(head);
  const exact = nointro ? clean(nointro) : '';
  const shot = (n: string) => `${CDN}/${encodeURIComponent(pack)}/Named_Titles/${encodeURIComponent(n)}.png`;
  return [
    ...(exact ? [boxUrl(pack, exact)] : []),
    ...(lb ? [lb] : []),
    ...names.flatMap((n) => (n === exact ? [shot(n)] : [boxUrl(pack, n), shot(n)])),
  ];
}
