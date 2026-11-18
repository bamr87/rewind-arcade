import { MotionConfig } from 'motion/react';
import { lazy, Suspense } from 'react';
import { Toaster } from 'sonner';
import { useHashRoute, type Route } from './engine/router';
import { getGame } from './games/registry';
import { reducedMotion, useSettings } from './settings/store';
import { EsdeRoot } from './ui/esde/EsdeRoot';
import { Feedback } from './ui/feedback';

const EmulatePage = lazy(() => import('./ui/EmulatePage').then((m) => ({ default: m.EmulatePage })));
const GamePage = lazy(() => import('./ui/GamePage').then((m) => ({ default: m.GamePage })));

/** Toasts sit left of the feedback button's column, so neither covers the other. */
const FAB_CLEARANCE = 'calc(var(--fleet-space-fab-offset) + var(--fleet-space-fab-size) + var(--fleet-space-fab-gap))';

/** A running game or an emulator owns the whole screen: no floating button there. */
function immersive(route: Route): boolean {
  if (route.name === 'play') return Boolean(route.gameId && getGame(route.gameId));
  return route.name === 'emulate' && Boolean(route.systemId);
}

function Page({ route }: { route: Route }) {
  if (route.name === 'play' && route.gameId) {
    const manifest = getGame(route.gameId);
    return manifest ? <GamePage key={manifest.id} manifest={manifest} /> : <EsdeRoot route={{ name: 'notfound' }} />;
  }
  if (route.name === 'emulate' && route.systemId) {
    return (
      <main id="main-content" tabIndex={-1} className="app app--immersive">
        <EmulatePage systemId={route.systemId} romFile={route.romFile} />
      </main>
    );
  }
  return <EsdeRoot route={route} />;
}

/**
 * The first focusable element on every page (UPS-FE-11). Routing reads location.hash,
 * so a real jump to #main-content would leave the page; it moves focus instead.
 */
function SkipLink() {
  return (
    <a
      href="#main-content"
      className="skip-link"
      onClick={(e) => {
        e.preventDefault();
        document.getElementById('main-content')?.focus();
      }}
    >
      Skip to content
    </a>
  );
}

export function App() {
  const route = useHashRoute();
  const settings = useSettings();
  const fab = !immersive(route);
  const offset = fab ? { right: FAB_CLEARANCE } : undefined;

  return (
    <MotionConfig reducedMotion={reducedMotion(settings)}>
      <SkipLink />
      <div className="ambient" aria-hidden>
        <div className="ambient-noise" />
        <div className="ambient-grid" />
      </div>
      <div className="relative z-1 h-full">
        <Suspense fallback={null}>
          <Page route={route} />
        </Suspense>
      </div>
      <Toaster
        theme="dark"
        position="bottom-right"
        offset={offset}
        mobileOffset={offset}
        toastOptions={{
          style: {
            background: 'rgba(11, 18, 36, 0.92)',
            border: '1px solid rgba(148, 163, 184, 0.18)',
            color: '#e6edf7',
            backdropFilter: 'blur(14px)',
          },
        }}
      />
      <Feedback fab={fab} route={window.location.hash || '#/'} />
    </MotionConfig>
  );
}
