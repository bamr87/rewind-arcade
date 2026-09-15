import { useCatalog } from '../catalog/store';
import { EMU_SYSTEMS } from '../emulate/systems';
import { navigate } from '../engine/router';
import { GAMES } from '../games/registry';
import { SYSTEMS } from '../systems/registry';
import { GamesGrid } from './GamesGrid';

export function Arcade() {
  const catalog = useCatalog();
  const games = catalog.bundle?.games.length ?? 0;
  const owned = catalog.bundle?.games.filter((r) => r.oc).length ?? 0;

  return (
    <div className="arcade">
      <header className="arcade-hero">
        <div>
          <p className="arcade-kicker">Three pillars, one set of ids</p>
          <h1>Play, emulate, catalog.</h1>
          <p>Original recreations, a cabinet for dumps you own, and the shelf index — same system ids as retro-pi and cartidx.</p>
        </div>
        <div className="arcade-count">
          {GAMES.length} games · {EMU_SYSTEMS.length} browser cores · {SYSTEMS.length} registry ids
        </div>
      </header>

      <div className="pillar-grid">
        <button className="pillar" style={{ ['--accent' as string]: '#38bdf8' }} onClick={() => navigate({ name: 'play' })}>
          <span className="pillar-kicker">Play</span>
          <h2>Recreations</h2>
          <p>Original programs. No ROM required.</p>
          <span className="pillar-foot">{GAMES.length} titles ▸</span>
        </button>
        <button className="pillar" style={{ ['--accent' as string]: '#818cf8' }} onClick={() => navigate({ name: 'emulate' })}>
          <span className="pillar-kicker">Emulate</span>
          <h2>Console loader</h2>
          <p>You supply the file. Cores load from EmulatorJS.</p>
          <span className="pillar-foot">{EMU_SYSTEMS.length} systems ▸</span>
        </button>
        <button className="pillar" style={{ ['--accent' as string]: '#34d399' }} onClick={() => navigate({ name: 'catalog', tab: 'library' })}>
          <span className="pillar-kicker">Catalog</span>
          <h2>Collection</h2>
          <p>Library, shelf, prices. Metadata only — never game files.</p>
          <span className="pillar-foot">
            {catalog.status === 'ready' ? `${games.toLocaleString()} titles · ${owned} owned ▸` : 'Load data.js ▸'}
          </span>
        </button>
      </div>

      <section className="arcade-section">
        <div className="arcade-section-head">
          <h2>Play</h2>
          <p>Original recreations. No ROM required.</p>
        </div>
        <GamesGrid />
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

      <section className="arcade-section">
        <div className="arcade-section-head">
          <h2>Catalog</h2>
          <p>From <code>systems/registry.yaml</code> plus your cartidx export.</p>
        </div>
        <div className="emu-chip-row">
          {SYSTEMS.filter((s) => s.catalog).slice(0, 16).map((s) => (
            <button
              key={s.id}
              className="emu-chip emu-chip--cat"
              onClick={() => navigate({ name: 'systems', systemId: s.id })}
            >
              {s.short}
            </button>
          ))}
          <button className="emu-chip emu-chip--more" onClick={() => navigate({ name: 'catalog', tab: 'library' })}>
            Open catalog ▸
          </button>
        </div>
      </section>

      <footer className="arcade-foot">
        Recreations are original programs · dumps stay on your machine · collection data is never shipped
      </footer>
    </div>
  );
}
