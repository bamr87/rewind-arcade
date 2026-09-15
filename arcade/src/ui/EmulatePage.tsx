import { useCallback, useEffect, useRef, useState } from 'react';
import { navigate } from '../engine/router';
import { acceptFor, EMU_SYSTEMS, getEmuSystem, type EmuSystem } from '../emulate/systems';

declare global {
  interface Window {
    EJS_player?: string;
    EJS_core?: string;
    EJS_gameUrl?: string;
    EJS_pathtodata?: string;
    EJS_startOnLoaded?: boolean;
    EJS_gameName?: string;
  }
}

const DATA = 'https://cdn.emulatorjs.org/stable/data/';

export function EmulatePage({ systemId }: { systemId?: string }) {
  const sys = getEmuSystem(systemId);
  if (!systemId) return <SystemPicker />;
  if (!sys) return <SystemPicker unknownId={systemId} />;
  return <RomLoader key={sys.id} sys={sys} />;
}

function SystemPicker({ unknownId }: { unknownId?: string }) {
  return (
    <div className="emu">
      <header className="emu-hero">
        <button className="icon-btn" title="Back to arcade" onClick={() => navigate({ name: 'arcade' })}>←</button>
        <div>
          <h1>Emulate</h1>
          <p>Load a dump you own. Cores come from EmulatorJS; nothing in this repo is a game file.</p>
        </div>
      </header>
      {unknownId && <p className="emu-warn">Unknown system “{unknownId}”. Pick one below.</p>}
      <div className="emu-grid">
        {EMU_SYSTEMS.map((s) => (
          <button
            key={s.id}
            className="emu-card"
            onClick={() => navigate({ name: 'emulate', systemId: s.id })}
          >
            <span className="emu-card-id">{s.short}</span>
            <strong>{s.name}</strong>
            <span className="emu-card-ext">{s.exts.join(' ')}</span>
          </button>
        ))}
      </div>
      <p className="emu-legal">
        You supply the file. This page never fetches games or BIOS. Disc systems may ask for firmware you dumped from hardware you own.
        For RetroArch on a Mac or Pi, use <code>./bin/retropi</code> in the emulate pillar.
      </p>
    </div>
  );
}

function RomLoader({ sys }: { sys: EmuSystem }) {
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

  return (
    <div className="emu emu--play">
      <header className="emu-bar">
        <button className="icon-btn" title="Systems" onClick={() => navigate({ name: 'emulate' })}>←</button>
        <div className="emu-bar-title">
          <span className="hud-name">{sys.name}</span>
          <span className="hud-badge">{sys.short}</span>
        </div>
        {file && (
          <button className="btn btn--ghost" onClick={() => { setFile(null); setUrl(null); }}>
            Eject
          </button>
        )}
      </header>

      {!url && (
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
          <h2>Drop a {sys.short} dump here</h2>
          <p>{sys.exts.join(' · ')}</p>
          {sys.bios && <p className="emu-bios">{sys.bios} — supply it yourself if the core asks.</p>}
          {error && <p className="emu-warn">{error}</p>}
        </div>
      )}

      {url && file && <EjsPlayer sys={sys} url={url} name={file.name} />}
    </div>
  );
}

function EjsPlayer({ sys, url, name }: { sys: EmuSystem; url: string; name: string }) {
  useEffect(() => {
    const w = window;
    w.EJS_player = '#ejs-target';
    w.EJS_core = sys.core;
    w.EJS_gameUrl = url;
    w.EJS_pathtodata = DATA;
    w.EJS_startOnLoaded = true;
    w.EJS_gameName = name;
    const script = document.createElement('script');
    script.src = `${DATA}loader.js`;
    script.async = true;
    document.body.appendChild(script);
    return () => {
      script.remove();
      const node = document.getElementById('ejs-target');
      if (node) node.replaceChildren();
      delete w.EJS_player;
      delete w.EJS_core;
      delete w.EJS_gameUrl;
      delete w.EJS_gameName;
    };
  }, [sys, url, name]);

  return (
    <div className="emu-stage">
      <div id="ejs-target" className="emu-player" />
      <p className="emu-legal">Playing {name} locally. Core loaded from EmulatorJS CDN — not a game download.</p>
    </div>
  );
}

