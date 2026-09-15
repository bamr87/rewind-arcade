import type { GameManifest, HudModel } from '../engine/types';
import { fmt } from '../engine/util';
import type { EngineStatus } from '../engine/useGameEngine';

interface Props {
  manifest: GameManifest;
  hud: HudModel;
  best: number;
  status: EngineStatus;
  muted: boolean;
  onBack: () => void;
  onTogglePause: () => void;
  onToggleSound: () => void;
  onOpenConfig: () => void;
  onGameAction: (action: string) => void;
}

export function Hud({
  manifest, hud, best, status, muted,
  onBack, onTogglePause, onToggleSound, onOpenConfig, onGameAction,
}: Props) {
  const lives = hud.lives;
  return (
    <header className="hud" style={{ ['--accent' as string]: manifest.accent }}>
      <div className="hud-left">
        <button className="icon-btn" title="Back to arcade" onClick={onBack}>←</button>
        <div className="hud-title">
          <span className="hud-name">{manifest.title}</span>
          {hud.badge && <span className="hud-badge">{hud.badge}</span>}
        </div>
      </div>

      {hud.progress && (
        <div className="hud-center">
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

      <div className="hud-right">
        {hud.stats?.map((s) => (
          <div className="stat" key={s.label}>
            <span className="stat-label">{s.label}</span>
            <span className={`stat-value${s.accent ? ' accent' : ''}`}>{s.value}</span>
          </div>
        ))}
        <div className="stat">
          <span className="stat-label">Best</span>
          <span className="stat-value">{fmt(best)}</span>
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

        <div className="hud-buttons">
          {hud.actions?.map((a) => (
            <button key={a.action} className="icon-btn" title={a.label} onClick={() => onGameAction(a.action)}>
              {a.icon}
            </button>
          ))}
          <button className="icon-btn" title="Settings" onClick={onOpenConfig}>⚙</button>
          <button className="icon-btn" title={muted ? 'Unmute' : 'Mute'} onClick={onToggleSound}>
            {muted ? '🔇' : '🔊'}
          </button>
          <button className="icon-btn" title="Pause" onClick={onTogglePause}>
            {status === 'paused' ? '▶' : '⏸'}
          </button>
        </div>
      </div>
    </header>
  );
}
