import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

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

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), catalogDataPlugin()],
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
