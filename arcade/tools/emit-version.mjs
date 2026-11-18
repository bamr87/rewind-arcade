// Writes dist/version.json after `vite build` (UPS-BE-11). Static hosting has no server to ask,
// so the build records what it built: package version, commit and time. Never fails the build.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arcadeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(arcadeRoot, 'dist');

function readVersion() {
  for (const dir of [path.join(arcadeRoot, '..'), arcadeRoot]) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg.version) return String(pkg.version);
    } catch {
      // try the next package.json
    }
  }
  return 'dev';
}

function readCommit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { cwd: arcadeRoot, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim() || 'dev';
  } catch {
    return 'dev';
  }
}

const body = { name: 'rewind-arcade', version: readVersion(), commit: readCommit(), built_at: new Date().toISOString() };
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'version.json'), JSON.stringify(body, null, 2) + '\n');
console.log(`version.json: ${body.version} @ ${body.commit}`);
