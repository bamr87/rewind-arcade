#!/usr/bin/env node
/**
 * Vendors an EmulatorJS build into arcade/vendor/emulatorjs/ so the arcade serves the
 * emulator and its cores itself instead of cdn.emulatorjs.org.
 *
 * Emulators and cores, never games: this downloads the same files the CDN serves and
 * writes SOURCE.json beside them recording where each came from and when.
 *
 * Every core ships in several builds and EmulatorJS picks one at run time: `-legacy-wasm`
 * on an ordinary page, `-thread-wasm` when the page is cross-origin isolated. Whatever it
 * asks for and does not find, it quietly re-requests from its own CDN -- so a vendored copy
 * has to carry each variant, not just one. Plain and legacy are fetched by default; add
 * --threads when serving with COOP/COEP headers.
 *
 *   node tools/fetch-emulatorjs.mjs                      every system in src/emulate/systems.ts
 *   node tools/fetch-emulatorjs.mjs --systems nes,snes   just those
 *   node tools/fetch-emulatorjs.mjs --threads            also the threaded core builds
 *   node tools/fetch-emulatorjs.mjs --force              re-download files already present
 *
 * The output folder is gitignored. ARCADE_EMULATORJS overrides where it lands.
 */
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const CDN = 'https://cdn.emulatorjs.org/stable/data/';
const here = path.dirname(fileURLToPath(import.meta.url));
const arcade = path.join(here, '..');
const OUT = path.resolve(process.env.ARCADE_EMULATORJS || path.join(arcade, 'vendor', 'emulatorjs'));

/** What the loader pulls in before any core. */
const BASE = [
  'loader.js',
  'emulator.min.js',
  'emulator.min.css',
  'emulator.css',
  'version.json',
  'compression/extract7z.js',
  'compression/extractzip.js',
  'compression/libunrar.js',
  'compression/libunrar.wasm',
];

/** Translations, loaded when the browser's locale is not en-US. */
const LOCALES = [
  'af-FR', 'ar-AR', 'ben-BEN', 'de-GER', 'el-GR', 'en-US', 'es-ES', 'fa-AF', 'hi-HI', 'it-IT',
  'ja-JA', 'jv-JV', 'ko-KO', 'pt-BR', 'retroarch', 'ro-RO', 'ru-RU', 'tr-TR', 'vi-VN', 'zh-CN',
].map((name) => `localization/${name}.json`);

/**
 * EJS_core (what src/emulate/systems.ts declares) -> core file stem, from EmulatorJS's own
 * getCores() map. `segaMD` is genesis_plus_gx, not "segaMD".
 */
const CORE_FILES = {
  nes: 'fceumm',
  snes: 'snes9x',
  n64: 'mupen64plus_next',
  gb: 'gambatte',
  gba: 'mgba',
  nds: 'melonds',
  vb: 'beetle_vb',
  segaMD: 'genesis_plus_gx',
  segaMS: 'smsplus',
  segaGG: 'genesis_plus_gx',
  sega32x: 'picodrive',
  segaCD: 'genesis_plus_gx',
  segaSaturn: 'yabause',
  psx: 'pcsx_rearmed',
  psp: 'ppsspp',
  atari2600: 'stella2014',
  atari7800: 'prosystem',
  lynx: 'handy',
  jaguar: 'virtualjaguar',
  pce: 'mednafen_pce',
  fbneo: 'fbneo',
  ngp: 'mednafen_ngp',
  ws: 'mednafen_wswan',
  coleco: 'gearcoleco',
  vice_x64: 'vice_x64',
};

/** Extra files a core needs at run time. */
const CORE_EXTRAS = { psp: ['cores/ppsspp-assets.zip'] };

function arg(name) {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes('=') ? hit.split('=').slice(1).join('=') : true;
}

/** stem -> the system ids that need it, read from the one list of systems. */
async function systemCores(only) {
  const src = await readFile(path.join(arcade, 'src', 'emulate', 'systems.ts'), 'utf8');
  const rows = [...src.matchAll(/id: '([\w\d]+)'[^}]*?core: '([\w\d_]+)'/g)].map((m) => ({
    id: m[1],
    core: m[2],
  }));
  const wanted = only ? new Set(String(only).split(',').map((s) => s.trim())) : null;
  const stems = new Map();
  const extras = new Map();
  for (const row of rows) {
    if (wanted && !wanted.has(row.id)) continue;
    const stem = CORE_FILES[row.core];
    if (!stem) {
      console.warn(`  ? no core file known for ${row.id} (EJS_core ${row.core}) — skipped`);
      continue;
    }
    stems.set(stem, [...(stems.get(stem) ?? []), row.id]);
    for (const extra of CORE_EXTRAS[row.core] ?? []) {
      extras.set(extra, [...(extras.get(extra) ?? []), row.id]);
    }
  }
  return { stems, extras };
}

async function download(rel, force, quiet = false) {
  const dest = path.join(OUT, rel);
  const url = CDN + rel;
  const head = await fetch(url, { method: 'HEAD' });
  if (!head.ok) {
    if (!quiet) console.warn(`  ! ${head.status} ${rel}`);
    return { rel, ok: false, bytes: 0 };
  }
  const size = Number(head.headers.get('content-length') || 0);
  if (!force) {
    const have = await stat(dest).catch(() => null);
    if (have && have.size === size) return { rel, ok: true, bytes: have.size, cached: true };
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    if (!quiet) console.warn(`  ! ${res.status} ${rel}`);
    return { rel, ok: false, bytes: 0 };
  }
  await mkdir(path.dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  const written = await stat(dest);
  return { rel, ok: true, bytes: written.size };
}

const force = Boolean(arg('force'));
const threads = Boolean(arg('threads'));
const { stems, extras } = await systemCores(arg('systems'));
const variants = threads ? ['', '-legacy', '-thread'] : ['', '-legacy'];

console.log(`EmulatorJS -> ${OUT}`);
console.log(
  `  ${BASE.length} runtime files, ${LOCALES.length} translations, ` +
    `${stems.size} cores (${variants.join(', ').replace(', ', 'plain, ') || 'plain'} builds)`,
);

const results = [];
const log = (out) => {
  results.push(out);
  if (out.ok && !out.cached) console.log(`  + ${(out.bytes / 1e6).toFixed(2).padStart(7)} MB  ${out.rel}`);
};

for (const rel of [...BASE, ...LOCALES, ...extras.keys()]) log(await download(rel, force));

for (const [stem, ids] of stems) {
  const got = [];
  for (const variant of variants) {
    const out = await download(`cores/${stem}${variant}-wasm.data`, force, true);
    if (out.ok) {
      got.push(out);
      log(out);
    }
  }
  // PSP only ships a threaded build; take it even when --threads was not asked for.
  if (!got.length) {
    const out = await download(`cores/${stem}-thread-wasm.data`, force, true);
    if (out.ok) log(out);
    else console.warn(`  ! no build found for ${stem} (${ids.join(', ')})`);
  }
}

const ok = results.filter((r) => r.ok);
const bytes = ok.reduce((n, r) => n + r.bytes, 0);
const version = await readFile(path.join(OUT, 'version.json'), 'utf8').then(
  (t) => JSON.parse(t).version ?? 'unknown',
  () => 'unknown',
);
await writeFile(
  path.join(OUT, 'SOURCE.json'),
  `${JSON.stringify(
    {
      source: CDN,
      version,
      fetched: new Date().toISOString(),
      files: ok.length,
      bytes,
      variants,
      cores: Object.fromEntries(stems),
    },
    null,
    1,
  )}\n`,
);

const failed = results.filter((r) => !r.ok);
console.log(`\n${ok.length} files, ${(bytes / 1e6).toFixed(1)} MB, EmulatorJS ${version}`);
console.log(
  failed.length
    ? `${failed.length} file(s) missing; EmulatorJS falls back to its CDN for those.`
    : 'The arcade serves the emulator and every core locally.',
);
