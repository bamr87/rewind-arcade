import { MotionConfig } from 'motion/react';
import { lazy, Suspense } from 'react';
import { Toaster } from 'sonner';
import { useHashRoute, type Route } from './engine/router';
import { getGame } from './games/registry';
import { reducedMotion, useSettings } from './settings/store';
import { EsdeRoot } from './ui/esde/EsdeRoot';

const EmulatePage = lazy(() => import('./ui/EmulatePage').then((m) => ({ default: m.EmulatePage })));
const GamePage = lazy(() => import('./ui/GamePage').then((m) => ({ default: m.GamePage })));

function Page({ route }: { route: Route }) {
  if (route.name === 'play' && route.gameId) {
    const manifest = getGame(route.gameId);
    if (manifest) return <GamePage key={manifest.id} manifest={manifest} />;
  }
  if (route.name === 'emulate' && route.systemId) {
    return (
      <div className="app app--immersive">
        <EmulatePage systemId={route.systemId} />
      </div>
    );
  }
  return <EsdeRoot route={route} />;
}

export function App() {
  const route = useHashRoute();
  const settings = useSettings();

  return (
    <MotionConfig reducedMotion={reducedMotion(settings)}>
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
        toastOptions={{
          style: {
            background: 'rgba(11, 18, 36, 0.92)',
            border: '1px solid rgba(148, 163, 184, 0.18)',
            color: '#e6edf7',
            backdropFilter: 'blur(14px)',
          },
        }}
      />
    </MotionConfig>
  );
}
