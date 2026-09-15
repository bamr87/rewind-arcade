const MAKER: Record<string, string> = {
  Nintendo: '#e60012',
  Sega: '#1a73c7',
  Sony: '#2e6db4',
  Atari: '#ed1c24',
  Microsoft: '#7cbb00',
  Commodore: '#8a7cd4',
  NEC: '#00a0e9',
  SNK: '#f5c518',
  Bandai: '#e94b3c',
  Panasonic: '#3b6ea5',
  Mattel: '#ff6a00',
  Coleco: '#c41e3a',
  GCE: '#94a3b8',
  Various: '#64748b',
};

export function makerHue(manufacturer: string): string {
  return MAKER[manufacturer] ?? '#64748b';
}

export function boxHue(title: string): string {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 33 + title.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 32% 26%)`;
}

export function sortName(title: string): string {
  return title.replace(/^(the|a|an)\s+/i, '').toLowerCase();
}
