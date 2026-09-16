import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { EMU_SYSTEMS } from './src/emulate/systems.ts';

const arcadeRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(arcadeRoot, '..');
const catalogData = path.join(repoRoot, 'catalog/workspace/web/data.js');

function catalogDataPlugin(): Plugin {
  const send = (_req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = _req.url?.split('?')[0];
    if (url !== '/catalog-data.js') {
      next();
      return;
    }
    if (!fs.existsSync(catalogData)) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(catalogData).pipe(res);
  };
  return {
    name: 'catalog-data',
    configureServer(server) {
      server.middlewares.use(send);
    },
    configurePreviewServer(server) {
      server.middlewares.use(send);
    },
  };
}

/**
 * Serves the dumps you already keep in emulate/roms/<system>/ so the frontend can launch
 * them without a file picker. Dev and preview only: a production build copies no game
 * files, and `RETROPI_PATHS_ROMS` / `ARCADE_ROMS` point this at a drive instead.
 */
function romsPlugin(): Plugin {
  const romsRoot = path.resolve(
    process.env.ARCADE_ROMS || process.env.RETROPI_PATHS_ROMS || path.join(repoRoot, 'emulate/roms'),
  );

  const index = () => {
    const out: { system: string; file: string; size: number }[] = [];
    for (const sys of EMU_SYSTEMS) {
      const dir = path.join(romsRoot, sys.id);
      let names: string[];
      try {
        names = fs.readdirSync(dir).sort();
      } catch {
        continue;
      }
      const exts = new Set([...sys.exts, '.zip']);
      for (const name of names) {
        const ext = path.extname(name).toLowerCase();
        // A browser core streams one file: .cue and .m3u point at tracks it cannot fetch.
        if (name.startsWith('.') || ext === '.cue' || ext === '.m3u' || !exts.has(ext)) continue;
        const stat = fs.statSync(path.join(dir, name));
        if (stat.isFile()) out.push({ system: sys.id, file: name, size: stat.size });
      }
    }
    return out;
  };

  const send = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = (req.url ?? '').split('?')[0];
    if (url === '/roms-index.json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ root: romsRoot, roms: index() }));
      return;
    }
    if (!url.startsWith('/roms/')) {
      next();
      return;
    }
    const file = path.resolve(romsRoot, decodeURIComponent(url.slice('/roms/'.length)));
    // Never serve outside the roms root, whatever the URL asks for.
    if (!file.startsWith(romsRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(fs.statSync(file).size));
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(file).pipe(res);
  };

  return {
    name: 'roms',
    configureServer(server) {
      server.middlewares.use(send);
    },
    configurePreviewServer(server) {
      server.middlewares.use(send);
    },
  };
}

const MIME: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
  '.data': 'application/octet-stream',
};

/**
 * Serves the vendored EmulatorJS build (`npm run emulatorjs`) at /emulatorjs/ and copies it
 * into dist/ so a deploy is self-hosted too. Without it the frontend falls back to the CDN.
 */
function emulatorJsPlugin(): Plugin {
  const root = path.resolve(process.env.ARCADE_EMULATORJS || path.join(arcadeRoot, 'vendor/emulatorjs'));

  const send = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = (req.url ?? '').split('?')[0];
    if (!url.startsWith('/emulatorjs/')) {
      next();
      return;
    }
    const file = path.resolve(root, decodeURIComponent(url.slice('/emulatorjs/'.length)));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
    res.setHeader('Content-Length', String(fs.statSync(file).size));
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(file).pipe(res);
  };

  return {
    name: 'emulatorjs',
    configureServer(server) {
      server.middlewares.use(send);
    },
    configurePreviewServer(server) {
      server.middlewares.use(send);
    },
    closeBundle() {
      if (!fs.existsSync(root)) {
        this.warn('no vendored EmulatorJS (npm run emulatorjs); the build will use the CDN');
        return;
      }
      fs.cpSync(root, path.join(arcadeRoot, 'dist/emulatorjs'), { recursive: true });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), catalogDataPlugin(), romsPlugin(), emulatorJsPlugin()],
  build: {
    rolldownOptions: {
      output: {
        // Long-lived vendor code gets its own cacheable chunks.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'motion', test: /node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    fs: { allow: [repoRoot] },
  },
});
