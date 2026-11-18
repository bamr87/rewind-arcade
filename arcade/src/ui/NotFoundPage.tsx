import { Disc3, Gamepad2, House, Layers, LibraryBig, Search, Settings2, Trophy } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { hrefFor, type Route } from '../engine/router';
import { issueFormUrl, reportMissingUrl } from './feedback';
import { Button, Kbd, MOD, PageHeader } from './kit';

const PLACES: { label: string; hint: string; icon: LucideIcon; route: Route }[] = [
  { label: 'Home', hint: 'The system carousel', icon: House, route: { name: 'arcade' } },
  { label: 'Play', hint: 'Original recreations', icon: Gamepad2, route: { name: 'play' } },
  { label: 'Emulate', hint: 'Load a dump you own', icon: Disc3, route: { name: 'emulate' } },
  { label: 'Catalog', hint: 'Your collection', icon: LibraryBig, route: { name: 'catalog', tab: 'library' } },
  { label: 'Systems atlas', hint: 'Every shared system id', icon: Layers, route: { name: 'systems' } },
  { label: 'Hall of Fame', hint: 'Records and sessions', icon: Trophy, route: { name: 'profile' } },
  { label: 'Settings', hint: 'Theme, CRT, motion, sound', icon: Settings2, route: { name: 'settings' } },
];

/**
 * What an unknown route renders (UPS-FE-15): the places that do exist, a search, and a
 * way to report the link that led here. Never a silent bounce to the home wheel.
 */
export function NotFoundPage({ onSearch }: { onSearch: () => void }) {
  const missing = window.location.hash || window.location.pathname;
  return (
    <div className="mx-auto w-full max-w-4xl px-5 pb-16 pt-8 sm:px-8">
      <PageHeader
        kicker="404 · Not found"
        title="Nothing plays here"
        actions={
          <Button onClick={onSearch}>
            <Search /> Search <Kbd>{MOD} K</Kbd>
          </Button>
        }
      >
        There is no page at <code className="break-all font-mono text-[13px] text-accent">{missing}</code>. The link may be
        old or mistyped. These are the places that exist:
      </PageHeader>

      <nav aria-label="Pages in the arcade" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PLACES.map((p) => (
          <a
            key={p.label}
            href={hrefFor(p.route)}
            className="glass flex items-center gap-3 rounded-2xl p-4 transition hover:bg-white/6"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
              <p.icon className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-fg">{p.label}</span>
              <span className="block text-sm text-dim">{p.hint}</span>
            </span>
          </a>
        ))}
      </nav>

      <p className="mt-8 text-sm text-dim">
        Followed a link to get here?{' '}
        <a
          href={issueFormUrl(window.location.href)}
          target="_blank"
          rel="noreferrer"
          onClick={reportMissingUrl}
          className="font-semibold text-accent underline underline-offset-2"
        >
          Report this URL
        </a>{' '}
        and it can be fixed.
      </p>
    </div>
  );
}
