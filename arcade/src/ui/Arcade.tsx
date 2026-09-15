import { navigate } from '../engine/router';
import { EMU_SYSTEMS } from '../emulate/systems';
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
            <p>Recreated classics, plus a cabinet for dumps you already own.</p>
          </div>
        </div>
        <div className="arcade-count">
          {GAMES.length} games · {EMU_SYSTEMS.length} systems · no content shipped
        </div>
      </header>

      <section className="arcade-section">
        <div className="arcade-section-head">
          <h2>Play</h2>
          <p>Original recreations. No ROM required.</p>
        </div>
        <div className="game-grid">
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
        </div>
      </section>

      <section className="arcade-section">
        <div className="arcade-section-head">
          <h2>Emulate</h2>
          <p>Drop a dump you own. Same system ids as retro-pi.</p>
        </div>
        <button className="game-card game-card--emu" onClick={() => navigate({ name: 'emulate' })}>
          <div className="game-card-art">
            <span className="game-card-icon">📼</span>
            <span className="game-card-year">LOAD</span>
          </div>
          <div className="game-card-body">
            <h2>Console loader</h2>
            <p>NES through PSP, plus arcade. You supply the file; cores load from EmulatorJS.</p>
            <div className="game-card-foot">
              <span className="game-card-best">{EMU_SYSTEMS.length} systems</span>
              <span className="game-card-play">Emulate ▸</span>
            </div>
          </div>
        </button>
        <div className="emu-chip-row">
          {EMU_SYSTEMS.slice(0, 12).map((s) => (
            <button
              key={s.id}
              className="emu-chip"
              onClick={() => navigate({ name: 'emulate', systemId: s.id })}
            >
              {s.short}
            </button>
          ))}
          <button className="emu-chip emu-chip--more" onClick={() => navigate({ name: 'emulate' })}>
            All {EMU_SYSTEMS.length} ▸
          </button>
        </div>
      </section>

      <footer className="arcade-foot">
        Recreations are original programs · dumps stay on your machine · <span>React + TypeScript + Vite</span>
      </footer>
    </div>
  );
}
