import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DT = 1 / 60;

function mock2d() {
  const noop = () => mock2d;
  const grad = { addColorStop() {} };
  return new Proxy(
    {
      canvas: { width: 800, height: 600 },
      createLinearGradient: () => grad,
      measureText: () => ({ width: 0 }),
    },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        return noop;
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    },
  );
}

function host() {
  let score = 0;
  let best = 0;
  let overlay = null;
  let hud = {};
  return {
    ctx: mock2d(),
    config: {},
    audio: { muted: true, ensure() {}, tone() {}, arp() {} },
    now: () => 0,
    setHud: (m) => {
      hud = m;
    },
    setOverlay: (m) => {
      overlay = m;
    },
    submitScore: (n) => {
      const record = n > best;
      score = n;
      if (record) best = n;
      return record;
    },
    getBest: () => best,
    get overlay() {
      return overlay;
    },
    get hud() {
      return hud;
    },
    get score() {
      return score;
    },
  };
}

const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp'];

function clearKeys(game) {
  for (const k of KEYS) game.onKey(k, false);
}

function steer(game) {
  const s = game.snapshot();
  clearKeys(game);
  if (s.phase !== 'playing' || s.crashT > 0) return s;
  const hazards = s.ahead.filter((o) => o.kind !== 'jump');
  let bias = 0;
  let close = false;
  for (const o of hazards) {
    const dy = o.y - s.y;
    const dx = o.x - s.x;
    const corridor = o.r + 20;
    if (Math.abs(dx) < corridor && dy > 0) {
      const w = 1 - dy / 240;
      bias += (dx >= 0 ? -1 : 1) * (0.6 + w);
      if (dy < 90 && Math.abs(dx) < o.r + 16) close = true;
    }
  }
  if (!close && Math.abs(bias) < 0.35) {
    game.onKey('ArrowDown', true);
    if (s.facing > 0.35) game.onKey('ArrowLeft', true);
    else if (s.facing < -0.35) game.onKey('ArrowRight', true);
  } else if (bias < 0) game.onKey('ArrowLeft', true);
  else if (bias > 0) game.onKey('ArrowRight', true);
  else if (s.facing > 0.2) game.onKey('ArrowLeft', true);
  else if (s.facing < -0.2) game.onKey('ArrowRight', true);
  return s;
}

function tick(game, n = 1) {
  for (let i = 0; i < n; i++) {
    game.update(DT);
    game.render();
  }
}

function play(SkiFree, config, seconds, ai) {
  const h = host();
  h.config = config;
  const game = new SkiFree(h);
  game.render();
  if (h.overlay?.variant !== 'menu') throw new Error('expected title overlay');
  game.onAction('start');
  if (game.snapshot().phase !== 'playing') throw new Error('start did not begin a run');
  const log = [];
  const peak = { air: 0, meters: 0, jumpsSeen: 0 };
  const frames = Math.ceil(seconds / DT);
  for (let i = 0; i < frames; i++) {
    if (ai) ai(game);
    game.update(DT);
    if (i % 8 === 0) game.render();
    const s = game.snapshot();
    if (s.air > peak.air) peak.air = s.air;
    if (s.meters > peak.meters) peak.meters = s.meters;
    if (s.ahead.some((o) => o.kind === 'jump')) peak.jumpsSeen++;
    if (i % Math.round(1 / DT) === 0) log.push({ t: +(i * DT).toFixed(1), ...s, ahead: s.ahead.length });
    if (s.phase === 'lose') {
      log.push({ t: +(i * DT).toFixed(2), ...s, ahead: s.ahead.length });
      break;
    }
  }
  clearKeys(game);
  return { game, host: h, log, snap: game.snapshot(), peak };
}

function steerInto(game, pred) {
  const s = game.snapshot();
  clearKeys(game);
  if (s.phase !== 'playing' || s.crashT > 0) return;
  const target = s.ahead.find(pred);
  if (!target) {
    game.onKey('ArrowDown', true);
    return;
  }
  const dx = target.x - s.x;
  if (dx < -4) game.onKey('ArrowLeft', true);
  else if (dx > 4) game.onKey('ArrowRight', true);
  else game.onKey('ArrowDown', true);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function cdpConnect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });
  let n = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id != null && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message ?? JSON.stringify(msg.error)));
      else res(msg.result);
      return;
    }
    if (msg.method) events.push(msg);
  });
  const send = (method, params = {}) => {
    const id = ++n;
    return new Promise((res, rej) => {
      pending.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };
  return { send, close: () => ws.close(), events };
}

async function waitHttp(url, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 404) return;
    } catch {
      /* not up yet */
    }
    await sleep(150);
  }
  throw new Error(`timeout waiting for ${url}`);
}

async function browserPlay(base) {
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const userDir = path.join('/var/folders/lj/z3skxf_s31n3rzxyby7kx_2c0000gn/T/kilo', `skifree-chrome-${Date.now()}`);
  fs.mkdirSync(userDir, { recursive: true });
  const port = 9333;
  const url = `${base}/?debug=1#/play/skifree`;
  const child = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDir}`,
      '--window-size=1280,800',
      url,
    ],
    { stdio: 'ignore' },
  );
  try {
    await waitHttp(`http://127.0.0.1:${port}/json/version`);
    let page = null;
    const tWait = Date.now();
    while (Date.now() - tWait < 8000) {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
      page = list.find((p) => p.type === 'page' && p.webSocketDebuggerUrl) ?? null;
      if (page) break;
      await sleep(150);
    }
    if (!page) throw new Error('chrome opened no debuggable page');
    const session = await cdpConnect(page.webSocketDebuggerUrl);
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Log.enable');
    await session.send('Network.enable');
    await session.send('Page.navigate', { url });
    await sleep(500);
    let info = null;
    const t0 = Date.now();
    let reloads = 0;
    while (Date.now() - t0 < 20000) {
      const got = await session.send('Runtime.evaluate', {
        expression: `({
          href: location.href,
          title: document.title,
          ready: typeof window.__arcade?.instance?.snapshot === 'function',
          panel: document.querySelector('.panel-title')?.textContent ?? null,
          text: (document.body?.innerText ?? '').slice(0, 240),
        })`,
        returnByValue: true,
      });
      info = got.result?.value ?? null;
      if (info?.ready) break;
      if (reloads < 2 && Date.now() - t0 > 4000 * (reloads + 1)) {
        reloads++;
        await session.send('Page.reload', { ignoreCache: true });
        await sleep(800);
      }
      await sleep(250);
    }
    if (!info?.ready) {
      const html = await session.send('Runtime.evaluate', {
        expression: `({ html: document.documentElement.outerHTML.slice(0, 2500), root: document.getElementById('root')?.innerHTML?.slice(0, 500) ?? null })`,
        returnByValue: true,
      });
      const fails = session.events
        .filter((e) => e.method === 'Network.loadingFailed' || e.method === 'Runtime.exceptionThrown' || e.method === 'Log.entryAdded')
        .slice(0, 12);
      console.error('BROWSER  page not ready', info);
      console.error('BROWSER  html', html.result?.value);
      console.error('BROWSER  events', JSON.stringify(fails, null, 2));
      const png = await session.send('Page.captureScreenshot', { format: 'png' });
      const shot = path.join(userDir, 'skifree.png');
      fs.writeFileSync(shot, Buffer.from(png.data, 'base64'));
      console.error(`BROWSER  shot=${shot}`);
      throw new Error('debug instance never appeared');
    }
    await session.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await sleep(400);
    await session.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
    let snap = null;
    for (let i = 0; i < 10; i++) {
      await sleep(350);
      if (i % 2 === 0) {
        await session.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
      } else {
        await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
      }
      const got = await session.send('Runtime.evaluate', {
        expression: `window.__arcade.instance.snapshot()`,
        returnByValue: true,
      });
      snap = got.result?.value ?? null;
      if (snap?.phase === 'lose') break;
    }
    const png = await session.send('Page.captureScreenshot', { format: 'png' });
    const shot = path.join(userDir, 'skifree.png');
    fs.writeFileSync(shot, Buffer.from(png.data, 'base64'));
    await session.close();
    console.log(`BROWSER  phase=${snap?.phase} m=${Number(snap?.meters || 0).toFixed(0)} crashes=${snap?.crashes} speed=${Number(snap?.speed || 0).toFixed(0)} yeti=${snap?.yetiBorn} shot=${shot}`);
    if (!snap || snap.phase === 'menu' || !(snap.meters > 5)) {
      throw new Error(`browser play did not ski (phase=${snap?.phase} m=${snap?.meters})`);
    }
  } finally {
    child.kill('SIGTERM');
  }
}

async function main() {
  const skipSim = process.argv.includes('--skip-sim');
  if (skipSim) {
    const browserIdx = process.argv.indexOf('--browser');
    if (browserIdx < 0) throw new Error('--skip-sim requires --browser');
    const base = process.argv[browserIdx + 1] || process.env.SKIFREE_URL;
    if (!base) throw new Error('pass --browser http://127.0.0.1:PORT');
    await browserPlay(base.replace(/\/$/, ''));
    return;
  }

  const vite = await createServer({
    root,
    configFile: false,
    cacheDir: path.join('/var/folders/lj/z3skxf_s31n3rzxyby7kx_2c0000gn/T/kilo', 'vite-play-skifree'),
    server: { middlewareMode: true },
    appType: 'custom',
  });
  try {
    const { SkiFree } = await vite.ssrLoadModule('/src/games/skifree/game.ts');
    const results = [];

    {
      const { snap, host: h } = play(SkiFree, { density: 9, yeti: 4000, speed: 240 }, 8, (g) =>
        steerInto(g, (o) => o.kind !== 'jump'),
      );
      const ok = snap.crashes > 0;
      results.push({ name: 'wipeout', ok, detail: `crashes=${snap.crashes} m=${snap.meters.toFixed(0)} overlay=${h.overlay?.variant ?? 'none'}` });
    }

    {
      const h = host();
      h.config = { density: 8, yeti: 4000, speed: 240 };
      const game = new SkiFree(h);
      game.onAction('start');
      let jump = null;
      for (let i = 0; i < 90 * 60 && !jump; i++) {
        game.onKey('ArrowDown', true);
        game.update(DT);
        jump = game.snapshot().ahead.find((o) => o.kind === 'jump') ?? null;
      }
      if (!jump) {
        results.push({ name: 'jump', ok: false, detail: 'no jump spawned in 90s of slope' });
      } else {
        game.x = jump.x;
        game.y = jump.y;
        game.crashT = 0;
        game.invuln = 0;
        game.air = 0;
        game.update(DT);
        const s = game.snapshot();
        results.push({ name: 'jump', ok: s.air > 0.5, detail: `air=${s.air.toFixed(2)} at (${jump.x.toFixed(0)},${jump.y.toFixed(0)})` });
      }
    }

    {
      const { snap, host: h, log } = play(SkiFree, { density: 4, yeti: 700, speed: 260 }, 30, steer);
      const ok = snap.phase === 'lose' && h.score > 0 && snap.yetiBorn;
      results.push({
        name: 'yeti-run',
        ok,
        detail: `phase=${snap.phase} m=${snap.meters.toFixed(0)} score=${h.score} crashes=${snap.crashes} yeti=${snap.yetiBorn} overlay=${h.overlay?.title ?? 'none'} ticks=${log.length}`,
      });
    }

    {
      const { snap } = play(SkiFree, { density: 3, yeti: 4000, speed: 240 }, 6, steer);
      const ok = snap.phase === 'playing' && snap.meters > 80;
      results.push({ name: 'distance', ok, detail: `phase=${snap.phase} m=${snap.meters.toFixed(0)} speed=${snap.speed.toFixed(0)} crashes=${snap.crashes}` });
    }

    let failed = 0;
    for (const r of results) {
      console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail}`);
      if (!r.ok) failed++;
    }
    if (failed) {
      console.error(`\n${failed} scenario(s) failed`);
      process.exitCode = 1;
    } else {
      console.log('\nSkiFree playthroughs ok');
    }
  } finally {
    await vite.close();
  }

  const browserIdx = process.argv.indexOf('--browser');
  if (browserIdx >= 0) {
    const base = process.argv[browserIdx + 1] || process.env.SKIFREE_URL;
    if (!base) throw new Error('pass --browser http://127.0.0.1:PORT');
    await browserPlay(base.replace(/\/$/, ''));
  }
}

await main();
