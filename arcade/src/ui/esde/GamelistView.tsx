import { useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '../../engine/router';
import { storage } from '../../engine/storage';
import { getEmuSystem } from '../../emulate/systems';
import { useEsdeInput } from '../../esde/input';
import type { EsGame, EsSystem } from '../../esde/library';
import { CoverArt } from './CoverArt';

function launch(game: EsGame) {
  if (game.kind === 'play' && game.playId) {
    navigate({ name: 'play', gameId: game.playId });
    return;
  }
  if (getEmuSystem(game.systemId)) {
    navigate({ name: 'emulate', systemId: game.systemId });
  }
}

export function GamelistView({
  system,
  games,
  menuOpen,
  onMenu,
}: {
  system: EsSystem;
  games: EsGame[];
  menuOpen: boolean;
  onMenu: () => void;
}) {
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return games;
    return games.filter((g) => g.title.toLowerCase().includes(needle) || (g.genre ?? '').toLowerCase().includes(needle));
  }, [games, q]);

  const saved = storage.getJson<string>(`esde:game:${system.id}`, '');
  const [index, setIndex] = useState(() => Math.max(0, filtered.findIndex((g) => g.key === saved)));

  useEffect(() => {
    setIndex((n) => Math.min(n, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  useEffect(() => {
    const g = filtered[index];
    if (g) storage.setJson(`esde:game:${system.id}`, g.key);
  }, [filtered, index, system.id]);

  useEffect(() => {
    const row = listRef.current?.querySelector('[data-on="1"]');
    row?.scrollIntoView({ block: 'nearest' });
  }, [index, filtered]);

  useEffect(() => {
    if (searching) searchRef.current?.focus();
  }, [searching]);

  const current = filtered[index];

  useEsdeInput((action, letter) => {
    if (searching) {
      if (action === 'back') { setSearching(false); setQ(''); }
      return;
    }
    if (action === 'up') setIndex((n) => (n + filtered.length - 1) % Math.max(1, filtered.length));
    if (action === 'down') setIndex((n) => (n + 1) % Math.max(1, filtered.length));
    if (action === 'left' || action === 'back') navigate({ name: 'arcade' });
    if (action === 'accept' && current) launch(current);
    if (action === 'menu') onMenu();
    if (action === 'search') setSearching(true);
    if (action === 'letter' && letter) {
      const at = filtered.findIndex((g) => g.sort.startsWith(letter) || g.title.toLowerCase().startsWith(letter));
      if (at >= 0) setIndex(at);
    }
  }, !menuOpen);

  return (
    <div className="esde-list">
      <header className="esde-list-head">
        <button className="esde-back" onClick={() => navigate({ name: 'arcade' })} aria-label="Back">◂</button>
        <div>
          <div className="esde-list-sys">{system.name}</div>
          <div className="esde-list-count">{filtered.length.toLocaleString()} games</div>
        </div>
        {searching ? (
          <input
            ref={searchRef}
            className="esde-search"
            value={q}
            placeholder="Search…"
            onChange={(e) => { setQ(e.target.value); setIndex(0); }}
            onBlur={() => { if (!q) setSearching(false); }}
            onKeyDown={(e) => { if (e.key === 'Escape') { setSearching(false); setQ(''); } }}
          />
        ) : (
          <button className="esde-search-btn" onClick={() => setSearching(true)}>/</button>
        )}
      </header>
      <div className="esde-list-body">
        <div className="esde-rows" ref={listRef} role="listbox" aria-label={system.name}>
          {filtered.map((g, i) => (
            <button
              key={g.key}
              role="option"
              aria-selected={i === index}
              data-on={i === index ? '1' : undefined}
              className={`esde-row${i === index ? ' is-on' : ''}${g.kind === 'load' ? ' is-load' : ''}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => { if (i === index) launch(g); else setIndex(i); }}
            >
              <CoverArt game={g} systemId={system.id} systemShort={system.short} hue={system.hue} media={system.media} size="row" />
              <span className="esde-row-title">{g.title}</span>
              {g.owned ? <span className="esde-fav">★</span> : null}
              {g.year ? <span className="esde-row-year">{g.year}</span> : null}
            </button>
          ))}
          {!filtered.length && <div className="esde-empty">No games in this system.</div>}
        </div>
        {current && <Meta game={current} system={system} />}
      </div>
    </div>
  );
}

function Meta({ game, system }: { game: EsGame; system: EsSystem }) {
  const bars = game.rating == null ? 0 : Math.max(1, Math.min(5, Math.round(game.rating)));
  const canPlay = game.kind === 'play' || Boolean(getEmuSystem(game.systemId));
  return (
    <aside className="esde-meta">
      <CoverArt
        game={game}
        systemId={system.id}
        systemShort={system.short}
        hue={system.hue}
        media={system.media}
        size="hero"
      />
      <h2>{game.title}</h2>
      {game.rating != null && (
        <div className="esde-stars" title={game.ratingLabel}>
          {[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= bars ? 'on' : ''} />)}
          <em>{game.rating.toFixed(1)}</em>
        </div>
      )}
      {game.description && <p className="esde-desc">{game.description}</p>}
      <dl className="esde-kv">
        {game.developer && <><dt>Developer</dt><dd>{game.developer}</dd></>}
        {game.publisher && <><dt>Publisher</dt><dd>{game.publisher}</dd></>}
        {game.genre && <><dt>Genre</dt><dd>{game.genre}</dd></>}
        {(game.releaseDate || game.year) && <><dt>Released</dt><dd>{game.releaseDate ?? game.year}</dd></>}
        {game.players && <><dt>Players</dt><dd>{game.players}</dd></>}
        {game.region && <><dt>Region</dt><dd>{game.region}</dd></>}
        {game.esrb && <><dt>ESRB</dt><dd>{game.esrb}</dd></>}
      </dl>
      {canPlay && (
        <button className="esde-launch" onClick={() => launch(game)}>
          {game.kind === 'play' ? 'Start' : 'Load dump'}
        </button>
      )}
    </aside>
  );
}
