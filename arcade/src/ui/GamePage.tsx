import confetti from 'canvas-confetti';
import { Trophy, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { GameConfig, GameManifest } from '../engine/types';
import { defaultConfig } from '../engine/types';
import { useGameEngine } from '../engine/useGameEngine';
import { audio } from '../engine/audio';
import { storage } from '../engine/storage';
import { navigate } from '../engine/router';
import { fmt } from '../engine/util';
import { addPlayTime, logScore, startSession } from '../profile/store';
import { getSettings, setSetting, useSettings } from '../settings/store';
import { Hud } from './Hud';
import { Overlay } from './Overlay';
import { ConfigPanel } from './ConfigPanel';
import { useMuted } from './hooks';
import { downloadBlob, Kbd } from './kit';

interface Props {
  manifest: GameManifest;
}

function celebrate(accent: string) {
  if (getSettings().motion === 'reduced') return;
  const base = {
    particleCount: 70,
    spread: 70,
    startVelocity: 50,
    ticks: 220,
    zIndex: 80,
    colors: [accent, '#ffffff', '#fbbf24'],
    disableForReducedMotion: getSettings().motion !== 'full',
  };
  void confetti({ ...base, angle: 60, origin: { x: 0, y: 0.8 } });
  void confetti({ ...base, angle: 120, origin: { x: 1, y: 0.8 } });
}

/** Scanline layer sized to the canvas, which the engine scales inside the stage. */
function CrtLayer({ canvas }: { canvas: HTMLCanvasElement | null }) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!canvas) return;
    const read = () => setBox({ w: canvas.offsetWidth, h: canvas.offsetHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [canvas]);
  if (!box) return null;
  return <div className="crt-layer" style={{ width: box.w, height: box.h }} aria-hidden />;
}

export function GamePage({ manifest }: Props) {
  const defaults = useMemo(() => defaultConfig(manifest.config), [manifest]);
  const [config, setConfig] = useState<GameConfig>(() => storage.loadConfig(manifest.id, defaults));
  const [muted, toggleSound] = useMuted();
  const settings = useSettings();
  const [configOpen, setConfigOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const lastCelebration = useRef(0);

  const onScore = useCallback(
    (score: number, record: boolean) => {
      logScore(manifest.id, score, record);
      if (!record || score <= 0) return;
      // Some games submit at every level clear; one celebration per burst is plenty.
      const now = performance.now();
      if (now - lastCelebration.current < 4000) return;
      lastCelebration.current = now;
      toast(`New record in ${manifest.title}`, {
        description: `${fmt(score)} points`,
        icon: <Trophy className="size-4 text-gold" />,
      });
      if (getSettings().confetti) celebrate(manifest.accent);
    },
    [manifest],
  );

  const engine = useGameEngine(manifest, config, { onScore });
  const engineCanvasRef = engine.canvasRef;
  const canvasRef = useCallback(
    (el: HTMLCanvasElement | null) => {
      engineCanvasRef(el);
      setCanvas(el);
    },
    [engineCanvasRef],
  );

  // A session counts once play actually starts, and again after Restart.
  const counted = useRef(false);
  // Play time only accrues while the game is running with no panel up.
  const active = engine.status === 'running' && !engine.overlay;
  useEffect(() => {
    if (!active) return;
    // The first commit is briefly "active" before the game raises its title panel, so
    // only count a session once play has held for a moment.
    const count = window.setTimeout(() => {
      if (counted.current) return;
      counted.current = true;
      startSession(manifest.id);
    }, 1500);
    let t0 = performance.now();
    const flush = () => {
      addPlayTime(manifest.id, (performance.now() - t0) / 1000);
      t0 = performance.now();
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.clearTimeout(count);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [active, manifest.id]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === pageRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const updateConfig = (key: string, value: number | boolean | string) => {
    setConfig((prev) => {
      const next = { ...prev, [key]: value };
      storage.saveConfig(manifest.id, next);
      return next;
    });
  };
  const resetConfig = () => {
    storage.clearConfig(manifest.id);
    setConfig({ ...defaults });
  };
  const back = () => navigate({ name: 'play' });

  const restart = () => {
    engine.restart();
    counted.current = false;
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    pageRef.current?.requestFullscreen().catch(() => toast.error('Fullscreen is not available here'));
  };
  const screenshot = () => {
    canvas?.toBlob((blob) => {
      if (!blob) return;
      const name = `${manifest.id}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`;
      downloadBlob(name, blob);
      toast('Screenshot saved', { description: name });
    }, 'image/png');
  };
  const toggleHelp = () => {
    if (!helpOpen && engine.status === 'running' && !engine.overlay) engine.togglePause();
    setHelpOpen((v) => !v);
  };

  const pauseOverlay =
    engine.status === 'paused'
      ? {
          variant: 'pause' as const,
          kicker: 'Paused',
          title: 'Take a breath',
          buttons: [
            { action: '__resume', label: 'Resume', primary: true },
            { action: '__quit', label: 'Quit to lobby', ghost: true },
          ],
        }
      : null;

  const handleOverlayAction = (action: string) => {
    audio.ensure();
    if (action === '__resume') { engine.togglePause(); return; }
    if (action === '__quit') { back(); return; }
    engine.dispatch(action);
  };

  return (
    <div ref={pageRef} className="game-page [&:fullscreen]:bg-[#060912]" style={{ ['--accent' as string]: manifest.accent }}>
      <Hud
        manifest={manifest}
        hud={engine.hud}
        best={engine.best}
        status={engine.status}
        muted={muted}
        crt={settings.crt}
        fullscreen={fullscreen}
        helpOpen={helpOpen}
        onBack={back}
        onTogglePause={engine.togglePause}
        onToggleSound={toggleSound}
        onOpenConfig={() => setConfigOpen(true)}
        onGameAction={engine.dispatch}
        onRestart={restart}
        onToggleCrt={() => setSetting('crt', !settings.crt)}
        onToggleFullscreen={toggleFullscreen}
        onScreenshot={screenshot}
        onToggleHelp={toggleHelp}
      />

      <div className="stage">
        <canvas
          ref={canvasRef}
          className={`game-canvas${settings.crt ? ' is-crt' : ''}`}
          style={{ cursor: manifest.cursor ?? 'default' }}
        />
        {settings.crt && <CrtLayer canvas={canvas} />}
        {pauseOverlay && <Overlay model={pauseOverlay} onAction={handleOverlayAction} />}
        {!pauseOverlay && engine.overlay && (
          <Overlay model={engine.overlay} onAction={handleOverlayAction} />
        )}
      </div>

      <footer className="game-foot">
        <div className="flex items-center justify-center gap-3">
          <span>{manifest.tagline}</span>
          <span className="flex items-center gap-1.5 text-faint">
            <Kbd>Space</Kbd> pause
          </span>
        </div>
      </footer>

      {helpOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setHelpOpen(false)} />
          <aside className="glass fixed right-4 top-19 z-30 w-[min(360px,calc(100vw-32px))] rounded-2xl p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-pixel text-[9px] uppercase tracking-[0.2em] text-accent">How to play</p>
                <h2 className="mt-2 font-display text-xl font-bold text-fg">{manifest.title}</h2>
              </div>
              <button type="button" aria-label="Close" onClick={() => setHelpOpen(false)} className="text-faint hover:text-fg">
                <X className="size-4" />
              </button>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-dim">{manifest.description}</p>
            <ul className="mt-4 space-y-2.5">
              {manifest.howTo.map((h, i) => (
                <li key={i} className="flex gap-3 text-[13px] leading-snug text-fg/90">
                  <span className="w-5 shrink-0 text-center" aria-hidden>{h.icon}</span>
                  <span>{h.text}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/7 pt-4 text-xs text-dim">
              <span className="flex items-center gap-1.5"><Kbd>Space</Kbd> pause or confirm</span>
              <span className="flex items-center gap-1.5"><Kbd>Esc</Kbd><Kbd>P</Kbd> pause</span>
            </div>
          </aside>
        </>
      )}

      {configOpen && (
        <ConfigPanel
          manifest={manifest}
          config={config}
          onChange={updateConfig}
          onReset={resetConfig}
          onClose={() => setConfigOpen(false)}
        />
      )}
    </div>
  );
}
