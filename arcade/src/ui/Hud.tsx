import {
  ArrowLeft,
  Camera,
  Keyboard,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Tv,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { GameManifest, HudModel } from '../engine/types';
import { fmt } from '../engine/util';
import type { EngineStatus } from '../engine/useGameEngine';
import { IconButton } from './kit';

interface Props {
  manifest: GameManifest;
  hud: HudModel;
  best: number;
  status: EngineStatus;
  muted: boolean;
  crt: boolean;
  fullscreen: boolean;
  helpOpen: boolean;
  onBack: () => void;
  onTogglePause: () => void;
  onToggleSound: () => void;
  onOpenConfig: () => void;
  onGameAction: (action: string) => void;
  onRestart: () => void;
  onToggleCrt: () => void;
  onToggleFullscreen: () => void;
  onScreenshot: () => void;
  onToggleHelp: () => void;
}

export function Hud({
  manifest, hud, best, status, muted, crt, fullscreen, helpOpen,
  onBack, onTogglePause, onToggleSound, onOpenConfig, onGameAction,
  onRestart, onToggleCrt, onToggleFullscreen, onScreenshot, onToggleHelp,
}: Props) {
  const lives = hud.lives;
  const paused = status === 'paused';
  return (
    <header className="hud glass w-[min(100%,1400px)] rounded-2xl px-2.5 py-2" style={{ ['--accent' as string]: manifest.accent }}>
      <div className="hud-left">
        <IconButton label="Back to lobby" onClick={onBack} noFocus>
          <ArrowLeft />
        </IconButton>
        <div className="hud-title">
          <span className="text-xl leading-none" aria-hidden>{manifest.icon}</span>
          <span className="hud-name font-display">{manifest.title}</span>
          {hud.badge && <span className="hud-badge">{hud.badge}</span>}
        </div>
      </div>

      {hud.progress && (
        <div className="hud-center max-w-95">
          <div className="bar">
            <div
              className={`bar-fill${hud.progress.complete ? ' win' : ''}`}
              style={{ width: `${Math.min(100, hud.progress.value * 100).toFixed(1)}%` }}
            />
            {hud.progress.target != null && (
              <div className="bar-marker" style={{ left: `${hud.progress.target * 100}%` }} />
            )}
            {hud.progress.label && <span className="bar-label">{hud.progress.label}</span>}
          </div>
        </div>
      )}

      <div className="hud-right ml-auto">
        {hud.stats?.map((s) => (
          <div className="stat" key={s.label}>
            <span className="stat-label">{s.label}</span>
            <span className={`stat-value font-mono${s.accent ? ' accent' : ''}`}>{s.value}</span>
          </div>
        ))}
        <div className="stat">
          <span className="stat-label">Best</span>
          <span className="stat-value font-mono text-gold">{fmt(best)}</span>
        </div>

        {lives && (
          <div className="stat">
            <span className="stat-label">Lives</span>
            <span className="lives">
              {lives.max <= 8 ? (
                Array.from({ length: lives.max }, (_, i) => (
                  <span key={i} className={`life${i < lives.current ? '' : ' lost'}`} />
                ))
              ) : (
                <span className="lives-num">×{lives.current}</span>
              )}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          {hud.actions?.map((a) => (
            <IconButton key={a.action} label={a.label} onClick={() => onGameAction(a.action)} noFocus>
              <span className="text-base leading-none">{a.icon}</span>
            </IconButton>
          ))}
          <span className="mx-1 h-6 w-px bg-white/10 max-sm:hidden" aria-hidden />
          <IconButton label="Restart" onClick={onRestart} noFocus>
            <RotateCcw />
          </IconButton>
          <IconButton label="How to play" active={helpOpen} onClick={onToggleHelp} noFocus className="max-sm:hidden">
            <Keyboard />
          </IconButton>
          <IconButton label="CRT filter" active={crt} onClick={onToggleCrt} noFocus className="max-sm:hidden">
            <Tv />
          </IconButton>
          <IconButton label="Screenshot" onClick={onScreenshot} noFocus className="max-sm:hidden">
            <Camera />
          </IconButton>
          <IconButton label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={onToggleFullscreen} noFocus>
            {fullscreen ? <Minimize2 /> : <Maximize2 />}
          </IconButton>
          <IconButton label="Game settings" onClick={onOpenConfig} noFocus>
            <Settings2 />
          </IconButton>
          <IconButton label={muted ? 'Unmute' : 'Mute'} onClick={onToggleSound} noFocus>
            {muted ? <VolumeX /> : <Volume2 />}
          </IconButton>
          <IconButton label={paused ? 'Resume' : 'Pause'} active={paused} onClick={onTogglePause} noFocus>
            {paused ? <Play /> : <Pause />}
          </IconButton>
        </div>
      </div>
    </header>
  );
}
