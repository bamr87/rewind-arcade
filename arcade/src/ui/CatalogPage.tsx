import { useState } from 'react';
import { hrefFor, type Route } from '../engine/router';
import { useCatalog } from '../catalog/store';
import type { CatalogTab, GameRow } from '../catalog/types';
import { getPlatform } from '../systems/registry';
import { AnalyzeView } from './catalog/AnalyzeView';
import { Atlas } from './catalog/Atlas';
import { GameDrawer } from './catalog/GameDrawer';
import { GuideView } from './catalog/GuideView';
import { ImportPanel } from './catalog/ImportPanel';
import { LibraryView } from './catalog/LibraryView';
import { PhysicalView } from './catalog/PhysicalView';

const TABS: { id: CatalogTab; label: string }[] = [
  { id: 'library', label: 'Library' },
  { id: 'physical', label: 'Physical' },
  { id: 'analyze', label: 'Analyze' },
  { id: 'guide', label: 'Price guide' },
];

export function CatalogPage({ route }: { route: Route }) {
  const catalog = useCatalog();
  const tab = route.tab ?? 'library';
  const [open, setOpen] = useState<GameRow | null>(null);
  const platform = route.systemId ? getPlatform(route.systemId) : undefined;
  const bundle = catalog.bundle;
  const ready = catalog.status === 'ready' && bundle;

  const sub =
    catalog.status === 'loading' ? 'loading'
    : ready
      ? `${bundle.games.length.toLocaleString()} games · ${new Set(bundle.games.map((r) => r.cl || r.c)).size} platforms · ${bundle.games.filter((r) => r.oc).length} owned`
      : 'platform atlas · load a collection to browse titles';

  return (
    <div className="cat">
      <header className="page-hero">
        <div>
          <h1>Catalog</h1>
          <p>{sub}</p>
          {platform && (
            <p className="page-filter">
              Filtered to <b>{platform.name}</b>
              {' · '}
              <a href={hrefFor({ name: 'catalog', tab: 'library' })}>all platforms</a>
            </p>
          )}
          {catalog.source && (
            <p className="page-filter">
              Source: {catalog.source === 'workspace' ? 'local cartidx workspace' : 'imported data.js'}
            </p>
          )}
        </div>
      </header>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <a
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            href={hrefFor({ name: 'catalog', tab: t.id, systemId: t.id === 'library' ? route.systemId : undefined })}
            className={tab === t.id ? 'is-on' : ''}
          >
            {t.label}
          </a>
        ))}
      </div>

      {catalog.status === 'loading' && <p className="atlas-lead">Looking for a local catalog export…</p>}

      {catalog.status === 'empty' && (
        <>
          <ImportPanel catalog={catalog} />
          <Atlas />
        </>
      )}

      {ready && (
        <details className="cat-replace">
          <summary>Replace collection</summary>
          <ImportPanel catalog={catalog} />
        </details>
      )}

      {bundle && tab === 'library' && (
        <LibraryView bundle={bundle} systemId={route.systemId} onOpen={setOpen} />
      )}
      {bundle && tab === 'physical' && <PhysicalView items={bundle.inventory} />}
      {bundle && tab === 'analyze' && <AnalyzeView games={bundle.games} inventory={bundle.inventory} />}
      {bundle && tab === 'guide' && <GuideView prices={bundle.prices} />}

      {bundle && open && <GameDrawer bundle={bundle} row={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
