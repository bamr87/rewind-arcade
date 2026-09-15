import clsx from 'clsx';
import { Disc3, Gamepad2, House, Layers, LibraryBig, Menu, Search, Settings2, Trophy, Volume2, VolumeX } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { hrefFor, type Route } from '../engine/router';
import { Clock } from './esde/Clock';
import { useMuted } from './hooks';
import { IconButton, iconButtonClass, MOD } from './kit';

const LINKS: { label: string; icon: LucideIcon; route: Route; match: Route['name'][] }[] = [
  { label: 'Home', icon: House, route: { name: 'arcade' }, match: ['arcade', 'gamelist'] },
  { label: 'Play', icon: Gamepad2, route: { name: 'play' }, match: ['play'] },
  { label: 'Emulate', icon: Disc3, route: { name: 'emulate' }, match: ['emulate'] },
  { label: 'Catalog', icon: LibraryBig, route: { name: 'catalog', tab: 'library' }, match: ['catalog'] },
  { label: 'Systems', icon: Layers, route: { name: 'systems' }, match: ['systems'] },
  { label: 'Hall of Fame', icon: Trophy, route: { name: 'profile' }, match: ['profile'] },
];

export function Shell({
  route,
  onMenu,
  onSearch,
  collectionLabel,
}: {
  route: Route;
  onMenu: () => void;
  onSearch: () => void;
  collectionLabel?: string | null;
}) {
  const [muted, toggleMute] = useMuted();
  return (
    <header className="glass relative z-40 flex h-16 shrink-0 items-center gap-2 border-x-0 border-t-0 px-3 sm:gap-3 sm:px-5">
      <a href={hrefFor({ name: 'arcade' })} className="group flex shrink-0 items-center gap-2.5" aria-label="Rewind Arcade home">
        <span className="grid size-9 place-items-center rounded-xl bg-accent/15 text-accent shadow-[0_0_24px_-6px_var(--accent)] ring-1 ring-inset ring-accent/40 transition group-hover:bg-accent/25">
          <Gamepad2 className="size-5" />
        </span>
        <span className="hidden font-pixel text-[10px] leading-none tracking-wider text-fg xl:block">
          REWIND
          <span className="ml-1.5 bg-linear-to-r from-accent to-accent-2 bg-clip-text text-transparent">ARCADE</span>
        </span>
      </a>

      <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-none md:justify-center" aria-label="Primary">
        {LINKS.map((l) => {
          const on = l.match.includes(route.name);
          return (
            <a
              key={l.label}
              href={hrefFor(l.route)}
              aria-current={on ? 'page' : undefined}
              title={l.label}
              className={clsx(
                'relative flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-[13px] font-semibold transition-colors',
                on ? 'text-fg' : 'text-faint hover:text-dim',
              )}
            >
              {on && (
                <motion.span
                  layoutId="nav-pill"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  className="absolute inset-0 rounded-full bg-white/8 ring-1 ring-inset ring-white/10"
                />
              )}
              <l.icon className={clsx('relative size-4', on && 'text-accent')} />
              <span className="relative hidden lg:inline">{l.label}</span>
            </a>
          );
        })}
      </nav>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onSearch}
          className="flex h-9 items-center gap-2 rounded-xl bg-white/5 pl-3 pr-1.5 text-sm text-faint ring-1 ring-inset ring-white/10 transition hover:text-dim max-md:hidden"
        >
          <Search className="size-4" />
          <span className="w-20 text-left lg:w-28">Search…</span>
          <kbd className="kbd">{MOD} K</kbd>
        </button>
        <IconButton label="Search" onClick={onSearch} className="md:hidden">
          <Search />
        </IconButton>
        {collectionLabel && (
          <span className="rounded-full px-2 font-mono text-[11px] text-faint max-2xl:hidden">{collectionLabel}</span>
        )}
        <IconButton label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute} className="max-sm:hidden">
          {muted ? <VolumeX /> : <Volume2 />}
        </IconButton>
        <a
          href={hrefFor({ name: 'settings' })}
          aria-label="Settings"
          title="Settings"
          className={iconButtonClass(route.name === 'settings')}
        >
          <Settings2 />
        </a>
        <IconButton label="Main menu (F1)" onClick={onMenu}>
          <Menu />
        </IconButton>
        <span className="pl-1 max-xl:hidden [&_.esde-clock]:text-sm [&_.esde-clock]:text-dim">
          <Clock />
        </span>
      </div>
    </header>
  );
}
