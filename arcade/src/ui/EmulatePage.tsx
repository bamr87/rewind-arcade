import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mb } from '../catalog/format';
import { suspendPad } from '../engine/gamepad';
import { navigate } from '../engine/router';
import { emulatorData, type EmulatorData } from '../emulate/emulatorjs';
import {
  addFiles,
  forgetFolder,
  grantFolder,
  pickFolder,
  removeStored,
  rescanFolder,
  supportsFolder,
  systemForFile,
  useRomLibrary,
} from '../emulate/library';
import { openRom, sourceLabel, useRoms, type RomFile } from '../emulate/roms';
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

/**
 * How this browser gets at your dumps. On a deployed site there is no roms plugin, so
 * this is the whole story: grant a folder once (Chrome and Edge remember it) or add
 * files, which are kept in IndexedDB. Neither uploads anything.
 */
function LibraryBar({ sys }: { sys?: EmuSystem }) {
  const lib = useRomLibrary();
  const roms = useRoms();
  const inputRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);

  const take = async (files: FileList | null) => {
    if (!files?.length) return;
    const result = await addFiles([...files], sys?.id);
    setNote(
      result.rejected.length
        ? `Added ${result.added}. Skipped ${result.rejected.length} the browser could not place or store.`
        : `Added ${result.added} to this browser.`,
    );
  };

  const folder = lib.folderStatus;
  return (
    <div className="emu-library">
      <div className="emu-library-row">
        {folder === 'granted' && lib.folderName ? (
          <>
            <span className="emu-library-name">
              📂 {lib.folderName}
              <em>
                {roms.counts.folder} file{roms.counts.folder === 1 ? '' : 's'}
              </em>
            </span>
            <button className="btn btn--ghost" disabled={lib.busy} onClick={() => void rescanFolder()}>
              Rescan
            </button>
            <button className="btn btn--ghost" disabled={lib.busy} onClick={() => void forgetFolder()}>
              Forget
            </button>
          </>
        ) : folder === 'prompt' ? (
          <>
            <span className="emu-library-name">📂 {lib.folderName ?? 'Your roms folder'}</span>
            <button className="btn" disabled={lib.busy} onClick={() => void grantFolder()}>
              Re-open folder
            </button>
          </>
        ) : folder === 'none' ? (
          <>
            <span className="emu-library-name">Open the roms folder on this machine to play from it.</span>
            <button className="btn" disabled={lib.busy} onClick={() => void pickFolder()}>
              Open roms folder
            </button>
          </>
        ) : (
          <span className="emu-library-name">
            {supportsFolder() ? 'Folder access is unavailable here.' : 'This browser cannot open a folder — add files instead.'}
          </span>
        )}

        <button className="btn btn--ghost" disabled={lib.busy} onClick={() => inputRef.current?.click()}>
          Add files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={sys ? acceptFor(sys) : undefined}
          hidden
          onChange={(e) => {
            void take(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {(note || lib.error) && <p className="emu-legal">{lib.error ?? note}</p>}
    </div>
  );
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
              ? `${roms.count} dumps ready to play, plus anything you add. Cores come from EmulatorJS; nothing in this repo is a game file.`
              : 'Play dumps you own. Open your roms folder or add files — they stay on this device. Cores come from EmulatorJS; nothing in this repo is a game file.'}
          </p>
        </div>
      </header>
      {unknownId && <p className="emu-warn">Unknown system “{unknownId}”. Pick one below.</p>}
      <LibraryBar />
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
        You supply the files. This page never fetches games or BIOS: with the dev server running they come from{' '}
        <code>emulate/roms/&lt;system&gt;/</code>, and on a deployed site from the folder you granted or the files you
        added to this browser. For RetroArch on a Mac or Pi, use <code>./bin/retropi</code> in the emulate pillar.
      </p>
    </div>
  );
}

function RomLoader({ sys, romFile }: { sys: EmuSystem; romFile?: string }) {
  const roms = useRoms();
  const local = roms.bySystem.get(sys.id) ?? [];
  const selected = romFile ? local.find((r) => r.file === romFile) : undefined;
  const [open, setOpen] = useState<{ url: string; name: string; source: RomFile['source'] } | null>(null);
  const [session, setSession] = useState<{ url: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // A browser-held dump has no URL until its bytes are read, so the player waits on this.
  // Keyed on what identifies the file rather than the object, which the index rebuilds.
  const id = selected ? `${selected.system}/${selected.file}` : '';
  useEffect(() => {
    if (!selected) {
      setOpen(null);
      return;
    }
    let live = true;
    let release = () => {};
    setOpen(null);
    void openRom(selected)
      .then((handle) => {
        release = handle.release;
        if (live) setOpen({ url: handle.url, name: selected.file, source: selected.source });
        else handle.release();
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : 'Could not read that dump');
      });
    return () => {
      live = false;
      release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => () => {
    if (session) URL.revokeObjectURL(session.url);
  }, [session]);

  const take = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!systemForFile(file.name, sys.id)) {
        setError(`Expected ${sys.exts.join(', ')} for ${sys.name}`);
        return;
      }
      setError(null);
      const result = await addFiles([file], sys.id);
      if (result.added) {
        // It is in the browser's library now, so play it the same way as anything else.
        navigate({ name: 'emulate', systemId: sys.id, romFile: file.name });
        return;
      }
      // Storage refused it — too large, or private browsing. Still playable right now.
      setSession({ url: URL.createObjectURL(file), name: file.name });
      setError('Could not keep that in this browser, so it is loaded for this session only.');
    },
    [sys],
  );

  const playing = open ?? session;
  const started = Boolean(playing);
  const resolving = Boolean(selected) && !open && !error;
  const waiting = Boolean(romFile) && !selected && roms.status === 'loading';
  const missing = Boolean(romFile) && !selected && roms.status !== 'loading';

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
              else if (session) {
                URL.revokeObjectURL(session.url);
                setSession(null);
              }
            }}
          >
            Eject
          </button>
        )}
      </header>

      {waiting && <p className="emu-legal">Looking for {romFile}…</p>}
      {resolving && <p className="emu-legal">Reading {romFile}…</p>}
      {missing && (
        <p className="emu-warn">
          “{romFile}” is not in your roms folder or this browser any more. Pick another below.
        </p>
      )}

      {!playing && <LibraryBar sys={sys} />}

      {!playing && local.length > 0 && (
        <section>
          <div className="arcade-section-head">
            <h2>Ready to play</h2>
            <p>{local.length} for {sys.short}</p>
          </div>
          <div className="emu-grid">
            {local.map((rom) => (
              <LocalRom key={`${rom.source}:${rom.file}`} rom={rom} />
            ))}
          </div>
        </section>
      )}

      {!playing && (
        <div
          className={`emu-drop${drag ? ' is-drag' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void take(e.dataTransfer.files[0]); }}
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
            onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ''; }}
          />
          <div className="emu-drop-icon">📼</div>
          <h2>{local.length ? `Or drop another ${sys.short} dump` : `Drop a ${sys.short} dump here`}</h2>
          <p>{sys.exts.join(' · ')} — kept in this browser so it is here next time</p>
          {sys.bios && <p className="emu-bios">{sys.bios} — supply it yourself if the core asks.</p>}
          {error && <p className="emu-warn">{error}</p>}
        </div>
      )}

      {playing && (
        <EjsPlayer
          sys={sys}
          url={playing.url}
          name={playing.name}
          from={open ? sourceLabel(open.source) : 'from this device, just for now'}
        />
      )}
    </div>
  );
}

function LocalRom({ rom }: { rom: RomFile }) {
  return (
    <div className="relative">
      <button
        className="emu-card"
        onClick={() => navigate({ name: 'emulate', systemId: rom.system, romFile: rom.file })}
      >
        <span className="emu-card-id text-good">▶ Play</span>
        <strong>{rom.label}</strong>
        <span className="emu-card-ext">{rom.file}</span>
        <span className="emu-card-ext">
          {mb(rom.size)} · {rom.source === 'stored' ? 'in this browser' : 'roms folder'}
        </span>
      </button>
      {rom.source === 'stored' && (
        <button
          className="absolute right-2 top-2 grid size-6 place-items-center rounded-lg bg-white/6 text-xs text-faint ring-1 ring-inset ring-white/10 hover:text-bad"
          aria-label={`Remove ${rom.file} from this browser`}
          title={`Remove ${rom.file} from this browser`}
          onClick={() => void removeStored(rom.system, rom.file)}
        >
          ×
        </button>
      )}
    </div>
  );
}

function EjsPlayer({ sys, url, name, from }: { sys: EmuSystem; url: string; name: string; from: string }) {
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
        Playing {name} {from}.{' '}
        {data?.local
          ? 'Emulator and core served from this machine.'
          : 'Emulator loaded from the EmulatorJS CDN — run npm run emulatorjs to host it locally.'}
      </p>
    </div>
  );
}
