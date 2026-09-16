export interface EmuSystem {
  id: string;
  name: string;
  short: string;
  core: string;
  exts: string[];
  bios?: string;
}

export const EMU_SYSTEMS: EmuSystem[] = [
  { id: 'nes', name: 'NES', short: 'NES', core: 'nes', exts: ['.nes', '.unf', '.unif', '.fds'] },
  { id: 'snes', name: 'Super Nintendo', short: 'SNES', core: 'snes', exts: ['.sfc', '.smc'] },
  { id: 'n64', name: 'Nintendo 64', short: 'N64', core: 'n64', exts: ['.z64', '.n64', '.v64'] },
  { id: 'gb', name: 'Game Boy', short: 'GB', core: 'gb', exts: ['.gb'] },
  { id: 'gbc', name: 'Game Boy Color', short: 'GBC', core: 'gb', exts: ['.gbc'] },
  { id: 'gba', name: 'Game Boy Advance', short: 'GBA', core: 'gba', exts: ['.gba'] },
  { id: 'nds', name: 'Nintendo DS', short: 'NDS', core: 'nds', exts: ['.nds'] },
  { id: 'virtualboy', name: 'Virtual Boy', short: 'VB', core: 'vb', exts: ['.vb', '.vboy'] },
  { id: 'megadrive', name: 'Mega Drive / Genesis', short: 'Genesis', core: 'segaMD', exts: ['.md', '.gen', '.bin', '.smd'] },
  { id: 'mastersystem', name: 'Master System', short: 'SMS', core: 'segaMS', exts: ['.sms'] },
  { id: 'gamegear', name: 'Game Gear', short: 'GG', core: 'segaGG', exts: ['.gg'] },
  // The Master System core (Genesis Plus GX) also runs SG-1000 cartridges.
  { id: 'sg1000', name: 'SG-1000', short: 'SG-1000', core: 'segaMS', exts: ['.sg'] },
  { id: 'sega32x', name: '32X', short: '32X', core: 'sega32x', exts: ['.32x'] },
  { id: 'segacd', name: 'Sega CD', short: 'Sega CD', core: 'segaCD', exts: ['.cue', '.chd', '.iso'], bios: 'BIOS required' },
  // EmulatorJS knows the Saturn as "segaSaturn"; plain "saturn" finds no core.
  { id: 'saturn', name: 'Saturn', short: 'Saturn', core: 'segaSaturn', exts: ['.cue', '.chd', '.iso'], bios: 'BIOS required' },
  { id: 'psx', name: 'PlayStation', short: 'PS1', core: 'psx', exts: ['.cue', '.chd', '.iso', '.pbp', '.m3u'], bios: 'BIOS required' },
  { id: 'psp', name: 'PSP', short: 'PSP', core: 'psp', exts: ['.iso', '.cso', '.pbp'] },
  { id: 'atari2600', name: 'Atari 2600', short: '2600', core: 'atari2600', exts: ['.a26', '.bin'] },
  { id: 'atari7800', name: 'Atari 7800', short: '7800', core: 'atari7800', exts: ['.a78', '.bin'] },
  { id: 'lynx', name: 'Atari Lynx', short: 'Lynx', core: 'lynx', exts: ['.lnx'] },
  { id: 'jaguar', name: 'Atari Jaguar', short: 'Jaguar', core: 'jaguar', exts: ['.j64', '.jag'] },
  { id: 'pcengine', name: 'PC Engine / TG-16', short: 'PCE', core: 'pce', exts: ['.pce'] },
  { id: 'neogeo', name: 'Neo Geo', short: 'Neo Geo', core: 'fbneo', exts: ['.zip'], bios: 'neogeo.zip required' },
  { id: 'ngp', name: 'Neo Geo Pocket', short: 'NGP', core: 'ngp', exts: ['.ngp', '.ngc'] },
  { id: 'wonderswan', name: 'WonderSwan', short: 'WS', core: 'ws', exts: ['.ws', '.wsc'] },
  { id: 'colecovision', name: 'ColecoVision', short: 'Coleco', core: 'coleco', exts: ['.col', '.bin'], bios: 'coleco.rom required' },
  { id: 'c64', name: 'Commodore 64', short: 'C64', core: 'vice_x64', exts: ['.d64', '.t64', '.prg', '.crt'] },
  { id: 'arcade', name: 'Arcade', short: 'Arcade', core: 'fbneo', exts: ['.zip'] },
];

export function getEmuSystem(id: string | undefined): EmuSystem | undefined {
  return EMU_SYSTEMS.find((s) => s.id === id);
}

export function acceptFor(sys: EmuSystem): string {
  return sys.exts.join(',');
}
