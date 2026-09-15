import { useEffect, useState } from 'react';
import { audio } from '../../engine/audio';
import { navigate } from '../../engine/router';
import { useEsdeInput } from '../../esde/input';
import { ImportPanel } from '../catalog/ImportPanel';
import { useCatalog } from '../../catalog/store';

const ITEMS = [
  { id: 'resume', label: 'Resume' },
  { id: 'play', label: 'Play recreations' },
  { id: 'emulate', label: 'Emulate' },
  { id: 'catalog', label: 'Catalog' },
  { id: 'systems', label: 'Systems atlas' },
  { id: 'collection', label: 'Load collection' },
  { id: 'sound', label: 'Sound' },
  { id: 'about', label: 'Other settings' },
] as const;

export function MainMenu({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const [pane, setPane] = useState<'root' | 'collection' | 'sound' | 'about'>('root');
  const catalog = useCatalog();
  const [muted, setMuted] = useState(audio.muted);

  useEsdeInput((action) => {
    if (pane !== 'root') {
      if (action === 'back' || action === 'menu') setPane('root');
      return;
    }
    if (action === 'up') setI((n) => (n + ITEMS.length - 1) % ITEMS.length);
    if (action === 'down') setI((n) => (n + 1) % ITEMS.length);
    if (action === 'back' || action === 'menu') onClose();
    if (action === 'accept') choose(ITEMS[i].id);
  }, true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') e.stopPropagation(); };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  function choose(id: string) {
    if (id === 'resume') onClose();
    else if (id === 'play') { onClose(); navigate({ name: 'play' }); }
    else if (id === 'emulate') { onClose(); navigate({ name: 'emulate' }); }
    else if (id === 'catalog') { onClose(); navigate({ name: 'catalog', tab: 'library' }); }
    else if (id === 'systems') { onClose(); navigate({ name: 'systems' }); }
    else if (id === 'collection') setPane('collection');
    else if (id === 'sound') setPane('sound');
    else if (id === 'about') setPane('about');
  }

  return (
    <div className="esde-menu-scrim" onClick={onClose}>
      <aside className="esde-menu" onClick={(e) => e.stopPropagation()} aria-label="Main menu">
        <div className="esde-menu-kicker">Main Menu</div>
        {pane === 'root' && (
          <ul className="esde-menu-list">
            {ITEMS.map((item, idx) => (
              <li key={item.id}>
                <button
                  className={idx === i ? 'is-on' : ''}
                  onMouseEnter={() => setI(idx)}
                  onClick={() => choose(item.id)}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        {pane === 'collection' && (
          <div className="esde-menu-pane">
            <p>
              {catalog.status === 'ready'
                ? `${catalog.bundle?.games.length.toLocaleString()} titles from ${catalog.source === 'workspace' ? 'cartidx workspace' : 'imported data.js'}.`
                : 'No collection loaded. Drop workspace/web/data.js from cartidx build.'}
            </p>
            <ImportPanel catalog={catalog} />
            <button className="esde-menu-back" onClick={() => setPane('root')}>Back</button>
          </div>
        )}
        {pane === 'sound' && (
          <div className="esde-menu-pane">
            <button
              className="esde-menu-toggle"
              onClick={() => {
                audio.ensure();
                audio.setMuted(!audio.muted);
                setMuted(audio.muted);
              }}
            >
              Frontend sounds: {muted ? 'off' : 'on'}
            </button>
            <button className="esde-menu-back" onClick={() => setPane('root')}>Back</button>
          </div>
        )}
        {pane === 'about' && (
          <div className="esde-menu-pane">
            <p>Rewind Arcade frontend, laid out like ES-DE. Same system ids as retro-pi and cartidx.</p>
            <p>Arrows move. Enter selects. Backspace or B goes back. F1 or Start opens this menu.</p>
            <p>Recreations are original programs. Dumps you load never leave this machine.</p>
            <button className="esde-menu-back" onClick={() => setPane('root')}>Back</button>
          </div>
        )}
      </aside>
    </div>
  );
}
