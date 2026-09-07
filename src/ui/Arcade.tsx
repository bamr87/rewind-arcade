import { navigate } from '../engine/router';
import { storage } from '../engine/storage';
import { GAMES } from '../games/registry';
import { fmt } from '../engine/util';

export function Arcade() {
  return (
    <div className="arcade">
      <header className="arcade-hero">
        <div className="arcade-brand">
          <span className="arcade-mark">🕹️</span>
          <div>
            <h1>
              REWIND<span>ARCADE</span>
            </h1>
            <p>Classic computer games, recreated for the browser.</p>
          </div>
        </div>
        <div className="arcade-count">
          {GAMES.length} game{GAMES.length === 1 ? '' : 's'} · zero installs · plays offline
        </div>
      </header>

      <main className="game-grid">
        {GAMES.map((game) => {
          const best = storage.bestScore(game.id);
          return (
            <button
              key={game.id}
              className="game-card"
              style={{ ['--accent' as string]: game.accent }}
              onClick={() => navigate({ name: 'play', gameId: game.id })}
            >
              <div className="game-card-art">
                <span className="game-card-icon">{game.icon}</span>
                <span className="game-card-year">{game.year}</span>
              </div>
              <div className="game-card-body">
                <h2>{game.title}</h2>
                <p>{game.tagline}</p>
                <div className="game-card-foot">
                  <span className="game-card-best">
                    {best > 0 ? <>Best <b>{fmt(best)}</b></> : 'Not played yet'}
                  </span>
                  <span className="game-card-play">Play ▸</span>
                </div>
              </div>
            </button>
          );
        })}

        <div className="game-card game-card--soon" aria-hidden="true">
          <div className="game-card-art">
            <span className="game-card-icon">➕</span>
          </div>
          <div className="game-card-body">
            <h2>More soon</h2>
            <p>Drop a game manifest into the registry and it appears here.</p>
          </div>
        </div>
      </main>

      <footer className="arcade-foot">
        Built on a pluggable canvas engine · <span>React + TypeScript + Vite</span>
      </footer>
    </div>
  );
}
