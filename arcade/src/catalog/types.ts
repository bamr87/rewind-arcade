export interface GameRow {
  c: string;
  cl?: string;
  t: string;
  s?: string;
  me?: string;
  rg?: string;
  sr?: string;
  g?: string;
  dv?: string;
  pub?: string;
  y?: number;
  fr?: string;
  mp?: number;
  w?: string;
  cr?: number;
  rv?: number;
  rb?: number;
  rt?: string;
  l?: number;
  cb?: number;
  nw?: number;
  pt?: string;
  cs?: number;
  sl?: number;
  sna?: number;
  sjp?: number;
  spal?: number;
  oc?: number;
  rc?: number;
  vf?: boolean;
  vd?: string;
  n?: string;
  ov?: string;
  rd?: string;
  ry?: string;
  or?: string;
  es?: string;
  ed?: number;
  fm?: number;
  vu?: string;
  lbid?: number;
  bx?: string;
  lg?: string;
  ts?: string;
  ct?: string;
  _h: string;
}

export interface RomRow {
  c: string;
  cl?: string;
  lib?: string;
  p?: string;
  s?: string;
  t?: string;
  n?: string;
  tg?: string;
  rg?: string;
  sr?: string;
  id?: string;
  mm?: string;
  st?: string;
  pt2?: string;
  vd?: string;
  vi?: string;
  nt?: string;
  sz?: number;
  crc?: string;
  mp8?: string;
  g?: string;
  dv?: string;
  pub?: string;
  y?: number;
  fr?: string;
  mp?: number;
  w?: string;
  cr?: number;
  rv?: number;
  rb?: number;
  rt?: string;
  l?: number;
  cb?: number;
  nw?: number;
  pt?: string;
  pm?: string;
  cs?: number;
  sl?: number;
  sna?: number;
  sjp?: number;
  spal?: number;
  sm?: string;
  oc?: number;
  inv?: string;
}

export interface InventoryRow {
  id?: string;
  c: string;
  t: string;
  f?: string;
  cp?: string;
  cd?: string;
  rg?: string;
  q?: number;
  pd?: number;
  ac?: string;
  lo?: string;
  nt?: string;
  cl?: string;
  v?: number;
  l?: number;
  cb?: number;
  nw?: number;
  pt?: string;
  rc?: number;
  rs?: string;
  rb?: number;
  rt?: string;
  g?: string;
  y?: number;
  lm?: string;
  _h: string;
}

export interface PriceRow {
  p: string;
  c?: string;
  t: string;
  l?: number;
  cb?: number;
  nw?: number;
  pd?: number;
  o?: boolean;
  pub?: string;
  nt?: string;
  _h: string;
}

/** One row of the export's systems table: hardware facts plus catalog counts. */
export interface SystemRow {
  c: string;
  cl?: string;
  mf?: string;
  dv?: string;
  rd?: string;
  me?: string;
  cpu?: string;
  mem?: string;
  gfx?: string;
  snd?: string;
  dsp?: string;
  mc?: string;
  ov?: string;
  tn?: number;
  ot?: number;
  tr?: number;
}

export interface CatalogBundle {
  games: GameRow[];
  roms: RomRow[];
  inventory: InventoryRow[];
  prices: PriceRow[];
  /** Absent in exports (and saved imports) from before cartidx wrote a systems table. */
  systems?: SystemRow[];
}

export type CatalogSource = 'workspace' | 'import';

export type CatalogTab = 'library' | 'physical' | 'analyze' | 'guide';
