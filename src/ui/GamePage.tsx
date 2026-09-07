import { useMemo, useState } from 'react';
import type { GameConfig, GameManifest } from '../engine/types';
import { defaultConfig } from '../engine/types';
import { useGameEngine } from '../engine/useGameEngine';
import { audio } from '../engine/audio';
import { storage } from '../engine/storage';
import { navigate } from '../engine/router';
import { Hud } from './Hud';
import { Overlay } from './Overlay';
import { ConfigPanel } from './ConfigPanel';

interface Props {
  manifest: GameManifest;
}

export function GamePage({ manifest }: Props) {
  const defaults = useMemo(() => defaultConfig(manifest.config), [manifest]);
  const [config, setConfig] = useState<GameConfig>(() => storage.loadConfig(manifest.id, defaults));
  const [muted, setMuted] = useState(audio.muted);
  const [configOpen, setConfigOpen] = useState(false);

  const engine = useGameEngine(manifest, config);

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
  const toggleSound = () => {
    audio.ensure();
    audio.setMuted(!audio.muted);
    setMuted(audio.muted);
  };
  const back = () => navigate({ name: 'arcade' });

  const pauseOverlay =
    engine.status === 'paused'
      ? {
          variant: 'pause' as const,
          kicker: 'Paused',
          title: 'Take a breath',
          buttons: [
            { action: '__resume', label: 'Resume', primary: true },
            { action: '__quit', label: 'Quit to arcade', ghost: true },
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
    <div className="game-page" style={{ ['--accent' as string]: manifest.accent }}>
      <Hud
        manifest={manifest}
        hud={engine.hud}
        best={engine.best}
        status={engine.status}
        muted={muted}
        onBack={back}
        onTogglePause={engine.togglePause}
        onToggleSound={toggleSound}
        onOpenConfig={() => setConfigOpen(true)}
        onGameAction={engine.dispatch}
      />

      <div className="stage">
        <canvas ref={engine.canvasRef} className="game-canvas" />
        {pauseOverlay && <Overlay model={pauseOverlay} onAction={handleOverlayAction} />}
        {!pauseOverlay && engine.overlay && (
          <Overlay model={engine.overlay} onAction={handleOverlayAction} />
        )}
      </div>

      <footer className="game-foot">{manifest.tagline}</footer>

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
