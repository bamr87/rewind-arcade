import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mb } from '../catalog/format';
import { suspendPad } from '../engine/gamepad';
import { navigate } from '../engine/router';
import { emulatorData, type EmulatorData } from '../emulate/emulatorjs';
import { romUrl, useRoms, type RomFile } from '../emulate/roms';
import { acceptFor, EMU_SYSTEMS, getEmuSystem, type EmuSystem } from '../emulate/systems';
import { useEsdeInput } from '../esde/input';
import { useSpatialNav } from '../esde/spatial';

/**
 * EmulatorJS is a page-level script: it declares globals and boots from `window.EJS_*` the
 * moment it loads. Loading it twice in one document throws ("EJS_STORAGE has already been
 * declared") and leaves the first emulator behind, so each game gets its own iframe and
 * switching games is just a new frame.
 */
function playerDoc(core: string, gameUrl: string, name: string, data: string): string {
  const config = JSON.stringify({ core, gameUrl, name, data }).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}#game{width:100%;height:100%}</style>
</head><body><div id="game"></div>
<script>
  const c = ${config};
  window.EJS_player = '#game';
  window.EJS_core = c.core;
  window.EJS_gameUrl = c.gameUrl;
  window.EJS_gameName = c.name;
  window.EJS_pathtodata = c.data;
  window.EJS_startOnLoaded = true;
</script>
<script src="${data}loader.js"></script>
</body></html>`;
}

export function EmulatePage({ systemId, romFile }: { systemId?: string; romFile?: string }) {
  const sys = getEmuSystem(systemId);
  if (!systemId) return <SystemPicker />;
  if (!sys) return <SystemPicker unknownId={systemId} />;
  return <RomLoader key={`${sys.id}:${romFile ?? ''}`} sys={sys} romFile={romFile} />;
}

function SystemPicker({ unknownId }: { unknownId?: string }) {
  const roms = useRoms();
  const ref = useRef<HTMLDivElement>(null);
  useSpatialNav(ref, true);
  useEsdeInput((action) => {
    if (action === 'back') navigate({ name: 'arcade' });
  }, true);
  return (
    <div className="emu" ref={ref}>
      <header className="page-hero">
        <div>
          <h1>Emulate</h1>
          <p>
            {roms.count > 0
              ? `${roms.count} dumps in your roms folder, plus anything you drop in. Cores come from EmulatorJS; nothing in this repo is a game file.`
              : 'Load a dump you own. Cores come from EmulatorJS; nothing in this repo is a game file.'}
          </p>
        </div>
      </header>
      {unknownId && <p className="emu-warn">Unknown system “{unknownId}”. Pick one below.</p>}
      <div className="emu-grid">
        {EMU_SYSTEMS.map((s) => {
          const local = roms.bySystem.get(s.id)?.length ?? 0;
          return (
            <button
              key={s.id}
              className="emu-card"
              onClick={() => navigate({ name: 'emulate', systemId: s.id })}
            >
              <span className="emu-card-id">{s.short}</span>
              <strong>{s.name}</strong>
              <span className="emu-card-ext">{s.exts.join(' ')}</span>
              {local > 0 && (
                <span className="font-semibold text-good">{local} ready to play</span>
              )}
            </button>
          );
        })}
      </div>
      <p className="emu-legal">
        You supply the files. This page never fetches games or BIOS: local dumps come from{' '}
        <code>emulate/roms/&lt;system&gt;/</code> while the dev server is running, and a production build ships none of them.
        For RetroArch on a Mac or Pi, use <code>./bin/retropi</code> in the emulate pillar.
      </p>
    </div>
  );
}

function RomLoader({ sys, romFile }: { sys: EmuSystem; romFile?: string }) {
  const roms = useRoms();
  const local = roms.bySystem.get(sys.id) ?? [];
  const selected = romFile ? local.find((r) => r.file === romFile) : undefined;
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const take = useCallback((f: File | undefined) => {
    if (!f) return;
    const lower = f.name.toLowerCase();
    const ok = sys.exts.some((e) => lower.endsWith(e));
    if (!ok) {
      setError(`Expected ${sys.exts.join(', ')} for ${sys.name}`);
      return;
    }
    setError(null);
    setFile(f);
    setUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
  }, [sys]);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    take(e.dataTransfer.files[0]);
  };

  const playing = selected
    ? { url: romUrl(selected), name: selected.file }
    : url && file
      ? { url, name: file.name }
      : null;
  const waiting = Boolean(romFile) && !selected && roms.status === 'loading';
  const missing = Boolean(romFile) && !selected && roms.status !== 'loading';
  const started = Boolean(playing);

  // Once a core is running the pad belongs to it: EmulatorJS polls the same pad from
  // inside the iframe, and a frontend that kept polling would move the page behind the
  // game on every press. Picking a dump, though, is ours to navigate.
  const ref = useRef<HTMLDivElement>(null);
  useSpatialNav(ref, !started);
  useEffect(() => (started ? suspendPad() : undefined), [started]);
  useEsdeInput((action) => {
    if (action === 'back') navigate({ name: 'gamelist', systemId: sys.id });
  }, !started);

  return (
    <div className="emu emu--play" ref={ref}>
      <header className="emu-bar">
        <button
          className="icon-btn"
          title="Gamelist"
          onClick={() => navigate({ name: 'gamelist', systemId: sys.id })}
        >
          ←
        </button>
        <div className="emu-bar-title">
          <span className="hud-name">{selected ? selected.label : sys.name}</span>
          <span className="hud-badge">{sys.short}</span>
        </div>
        {playing && (
          <button
            className="btn btn--ghost"
            onClick={() => {
              if (selected) navigate({ name: 'emulate', systemId: sys.id });
              else { setFile(null); setUrl(null); }
            }}
          >
            Eject
          </button>
        )}
      </header>

      {waiting && <p className="emu-legal">Looking for {romFile} in your roms folder…</p>}
      {missing && (
        <p className="emu-warn">
          “{romFile}” is not in <code>emulate/roms/{sys.id}/</code> any more. Pick another below.
        </p>
      )}

      {!playing && local.length > 0 && (
        <section>
          <div className="arcade-section-head">
            <h2>In your roms folder</h2>
            <p>{local.length} for {sys.short}</p>
          </div>
          <div className="emu-grid">
            {local.map((rom) => (
              <LocalRom key={rom.file} rom={rom} />
            ))}
          </div>
        </section>
      )}

      {!playing && (
        <div
          className={`emu-drop${drag ? ' is-drag' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        >
          <input
            ref={inputRef}
            type="file"
            accept={acceptFor(sys)}
            hidden
            onChange={(e) => take(e.target.files?.[0])}
          />
          <div className="emu-drop-icon">📼</div>
          <h2>{local.length ? `Or drop another ${sys.short} dump` : `Drop a ${sys.short} dump here`}</h2>
          <p>{sys.exts.join(' · ')}</p>
          {sys.bios && <p className="emu-bios">{sys.bios} — supply it yourself if the core asks.</p>}
          {error && <p className="emu-warn">{error}</p>}
        </div>
      )}

      {playing && <EjsPlayer sys={sys} url={playing.url} name={playing.name} local={Boolean(selected)} />}
    </div>
  );
}

function LocalRom({ rom }: { rom: RomFile }) {
  return (
    <button
      className="emu-card"
      onClick={() => navigate({ name: 'emulate', systemId: rom.system, romFile: rom.file })}
    >
      <span className="emu-card-id text-good">▶ Play</span>
      <strong>{rom.label}</strong>
      <span className="emu-card-ext">{rom.file}</span>
      <span className="emu-card-ext">{mb(rom.size)}</span>
    </button>
  );
}

function EjsPlayer({ sys, url, name, local }: { sys: EmuSystem; url: string; name: string; local: boolean }) {
  const [data, setData] = useState<EmulatorData | null>(null);
  useEffect(() => {
    let live = true;
    void emulatorData().then((d) => { if (live) setData(d); });
    return () => { live = false; };
  }, []);
  const doc = useMemo(() => (data ? playerDoc(sys.core, url, name, data.path) : ''), [data, sys.core, url, name]);

  return (
    <div className="emu-stage">
      {doc ? (
        <iframe
          key={url}
          title={`${sys.name}: ${name}`}
          className="emu-player w-full border-0"
          srcDoc={doc}
          allow="autoplay; fullscreen; gamepad; xr-spatial-tracking"
        />
      ) : (
        <div className="emu-player grid place-items-center text-sm text-dim">Starting the emulator…</div>
      )}
      <p className="emu-legal">
        Playing {name} {local ? 'from your roms folder' : 'from this device'}.{' '}
        {data?.local
          ? 'Emulator and core served from this machine.'
          : 'Emulator loaded from the EmulatorJS CDN — run npm run emulatorjs to host it locally.'}
      </p>
    </div>
  );
}
