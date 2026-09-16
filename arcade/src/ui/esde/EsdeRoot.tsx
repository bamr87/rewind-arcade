import { motion } from 'motion/react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useCatalog } from '../../catalog/store';
import { navigate, type Route } from '../../engine/router';
import { useEsdeInput } from '../../esde/input';
import { useEsLibrary } from '../../esde/library';
import { useSpatialNav } from '../../esde/spatial';
import { PlayLobby } from '../PlayLobby';
import { Shell } from '../Shell';
import { GamelistView } from './GamelistView';
import { HelpBar } from './HelpBar';
import { MainMenu } from './MainMenu';
import { SystemView } from './SystemView';

// Heavier pages load on first visit; the cabinet views and lobby stay in the main bundle.
const CatalogPage = lazy(() => import('../CatalogPage').then((m) => ({ default: m.CatalogPage })));
const CommandPalette = lazy(() => import('../CommandPalette').then((m) => ({ default: m.CommandPalette })));
const ProfilePage = lazy(() => import('../ProfilePage').then((m) => ({ default: m.ProfilePage })));
const SettingsPage = lazy(() => import('../SettingsPage').then((m) => ({ default: m.SettingsPage })));
const SystemsPage = lazy(() => import('../SystemsPage').then((m) => ({ default: m.SystemsPage })));

const SCROLL_PAGES: Route['name'][] = ['catalog', 'systems', 'play', 'profile', 'settings'];

export function EsdeRoot({ route }: { route: Route }) {
  const { systems, gamesOf } = useEsLibrary();
  const catalog = useCatalog();
  const [menu, setMenu] = useState(false);
  const [palette, setPalette] = useState(false);
  // The palette chunk loads on first open, so the hotkey lives here rather than in it.
  const [paletteLoaded, setPaletteLoaded] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const system = systems.find((s) => s.id === route.systemId);
  const onMenu = () => setMenu(true);
  const blocked = menu || palette;
  const openPalette = () => {
    setPaletteLoaded(true);
    setPalette(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteLoaded(true);
        setPalette((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const emulateWheel = route.name === 'emulate' && !route.systemId;
  const homeWheel = route.name === 'arcade';
  const cabinet = homeWheel || emulateWheel || route.name === 'gamelist';

  useEsdeInput((action) => {
    if (action === 'menu') onMenu();
    if (action === 'back') navigate({ name: 'arcade' });
    if (action === 'search') openPalette();
  }, !blocked && !cabinet);

  const context = menu ? 'menu'
    : route.name === 'gamelist' ? 'gamelist'
    : homeWheel || emulateWheel ? 'system'
    : 'other';

  const scroll = SCROLL_PAGES.includes(route.name);
  // The ordinary pages have no carousel to steer, so a pad moves a focus ring across
  // whatever they render instead. The whole shell is in range, top bar included.
  useSpatialNav(rootRef, !blocked && scroll);
  const wheel = emulateWheel ? systems.filter((s) => s.canEmu) : systems;
  const readyHint = catalog.status === 'ready'
    ? `${catalog.bundle?.games.length.toLocaleString()} in collection`
    : null;
  const pageKey = route.name === 'gamelist' ? `gamelist:${route.systemId}` : route.name;

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [pageKey]);

  return (
    <div className="esde" ref={rootRef}>
      <Shell route={route} onMenu={onMenu} onSearch={openPalette} collectionLabel={readyHint} />
      <main ref={mainRef} className={`esde-main${scroll ? ' esde-main--scroll' : ''}`}>
        {/* Opacity only: a transform here would re-anchor the catalog's fixed drawers. */}
        <motion.div
          key={pageKey}
          className={scroll ? 'min-h-full' : 'h-full'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.22 }}
        >
          {(homeWheel || emulateWheel || (route.name === 'gamelist' && !system)) && (
            <SystemView
              key={emulateWheel ? 'emu' : 'home'}
              systems={wheel}
              menuOpen={blocked}
              onMenu={onMenu}
              onSearch={openPalette}
            />
          )}
          {route.name === 'gamelist' && system && (
            <GamelistView system={system} games={gamesOf(system.id)} menuOpen={blocked} onMenu={onMenu} />
          )}
          {route.name === 'play' && <PlayLobby />}
          <Suspense fallback={null}>
            {route.name === 'catalog' && <CatalogPage route={route} />}
            {route.name === 'systems' && <SystemsPage route={route} />}
            {route.name === 'profile' && <ProfilePage />}
            {route.name === 'settings' && <SettingsPage />}
          </Suspense>
        </motion.div>
      </main>
      {cabinet && <HelpBar context={context} />}
      {menu && <MainMenu onClose={() => setMenu(false)} />}
      {paletteLoaded && (
        <Suspense fallback={null}>
          <CommandPalette open={palette} onOpenChange={setPalette} />
        </Suspense>
      )}
    </div>
  );
}
