import { Command } from 'cmdk';
import {
  ChartColumn,
  CornerDownLeft,
  Disc3,
  Gamepad2,
  House,
  Layers,
  LibraryBig,
  Package,
  Palette,
  Search,
  Settings2,
  Shuffle,
  Tag,
  Trophy,
  Tv,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useCatalog } from '../catalog/store';
import type { GameRow } from '../catalog/types';
import { getEmuSystem } from '../emulate/systems';
import { padEnabled, padRoles, subscribePad } from '../engine/gamepad';
import { navigate, type Route } from '../engine/router';
import { storage } from '../engine/storage';
import { fmt } from '../engine/util';
import { GAMES } from '../games/registry';
import { PHOSPHORS, setSetting, useSettings } from '../settings/store';
import { getPlatform, SYSTEMS } from '../systems/registry';
import { useMuted } from './hooks';
import { Kbd, MOD } from './kit';

const PAGES: { label: string; hint: string; icon: ReactNode; route: Route; keywords: string[] }[] = [
  { label: 'Home', hint: 'System carousel', icon: <House />, route: { name: 'arcade' }, keywords: ['wheel', 'esde', 'start'] },
  { label: 'Play', hint: 'Recreations lobby', icon: <Gamepad2 />, route: { name: 'play' }, keywords: ['games', 'lobby'] },
  { label: 'Emulate', hint: 'Load a dump you own', icon: <Disc3 />, route: { name: 'emulate' }, keywords: ['rom', 'emulatorjs', 'core'] },
  { label: 'Catalog: Library', hint: 'Every title in your collection', icon: <LibraryBig />, route: { name: 'catalog', tab: 'library' }, keywords: ['collection', 'cartidx'] },
  { label: 'Catalog: Physical', hint: 'Shelf inventory', icon: <Package />, route: { name: 'catalog', tab: 'physical' }, keywords: ['inventory', 'shelf'] },
  { label: 'Catalog: Analyze', hint: 'Charts over the collection', icon: <ChartColumn />, route: { name: 'catalog', tab: 'analyze' }, keywords: ['charts', 'stats'] },
  { label: 'Catalog: Price guide', hint: 'Loose, complete, sealed', icon: <Tag />, route: { name: 'catalog', tab: 'guide' }, keywords: ['prices', 'value'] },
  { label: 'Systems atlas', hint: 'Every shared system id', icon: <Layers />, route: { name: 'systems' }, keywords: ['registry', 'consoles'] },
  { label: 'Hall of Fame', hint: 'Records, sessions, achievements', icon: <Trophy />, route: { name: 'profile' }, keywords: ['profile', 'stats', 'scores', 'achievements'] },
  { label: 'Settings', hint: 'Theme, CRT, motion, sound', icon: <Settings2 />, route: { name: 'settings' }, keywords: ['preferences', 'options'] },
];

const ITEM =
  'group flex cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2 text-sm text-dim outline-none data-[selected=true]:bg-white/7 data-[selected=true]:text-fg';
const GROUP =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-2 [&_[cmdk-group-heading]]:pt-4 [&_[cmdk-group-heading]]:font-pixel [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.18em] [&_[cmdk-group-heading]]:text-faint';

function Item({
  value,
  keywords,
  icon,
  label,
  hint,
  meta,
  onSelect,
}: {
  value: string;
  keywords?: string[];
  icon: ReactNode;
  label: string;
  hint?: string;
  meta?: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item value={value} keywords={keywords} onSelect={onSelect} className={ITEM}>
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/5 text-[15px] ring-1 ring-inset ring-white/10 group-data-[selected=true]:text-accent group-data-[selected=true]:ring-accent/40 [&_svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        {hint && <span className="block truncate text-xs text-faint">{hint}</span>}
      </span>
      {meta && <span className="shrink-0 font-mono text-xs text-faint">{meta}</span>}
      <CornerDownLeft className="size-3.5 shrink-0 opacity-0 group-data-[selected=true]:opacity-60" />
    </Command.Item>
  );
}

/** Picks the matching row in its ES-DE gamelist, or falls back to the catalog table. */
function openTitle(row: GameRow) {
  if (getPlatform(row.c) || getEmuSystem(row.c)) {
    storage.setJson(`esde:game:${row.c}`, `${row.c}:${row.s || row.t}`);
    navigate({ name: 'gamelist', systemId: row.c });
  } else {
    navigate({ name: 'catalog', tab: 'library', systemId: row.c });
  }
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [search, setSearch] = useState('');
  const catalog = useCatalog();
  const settings = useSettings();
  const [muted, toggleMute] = useMuted();

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  // cmdk owns the list and listens for real key events, so rather than reach into it,
  // the pad speaks to it in its own language.
  useEffect(() => {
    if (!open) return;
    return subscribePad((e) => {
      if (!e.down || !padEnabled()) return;
      const { confirm, cancel } = padRoles();
      if (e.button === cancel) {
        onOpenChange(false);
        return;
      }
      if (e.button === confirm && e.repeat) return;
      const key =
        e.button === confirm ? 'Enter' : e.button === 'up' ? 'ArrowUp' : e.button === 'down' ? 'ArrowDown' : '';
      if (!key) return;
      document
        .querySelector<HTMLInputElement>('[cmdk-input]')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });
  }, [open, onOpenChange]);

  const needle = search.trim().toLowerCase();
  const titles = useMemo(() => {
    const games = catalog.bundle?.games;
    if (needle.length < 2 || !games) return [];
    const out: GameRow[] = [];
    for (const row of games) {
      if (!row._h.includes(needle)) continue;
      out.push(row);
      if (out.length >= 8) break;
    }
    return out;
  }, [needle, catalog.bundle]);

  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };
  const go = (route: Route) => run(() => navigate(route));
  const nextPhosphor = PHOSPHORS[(PHOSPHORS.findIndex((p) => p.id === settings.phosphor) + 1) % PHOSPHORS.length];

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      loop
      overlayClassName="fixed inset-0 z-[60] bg-[#02040a]/65 backdrop-blur-sm"
      contentClassName="glass fixed left-1/2 top-[10vh] z-[61] w-[min(660px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-2xl shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)]"
    >
      <div className="flex items-center gap-3 border-b border-white/7 px-4">
        <Search className="size-[18px] shrink-0 text-accent" />
        <Command.Input
          value={search}
          onValueChange={setSearch}
          placeholder="Search games, systems, your collection…"
          className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-faint"
        />
        <Kbd>Esc</Kbd>
      </div>

      <Command.List className="max-h-[min(62vh,480px)] overflow-y-auto overscroll-contain p-2">
        <Command.Empty className="px-4 py-12 text-center text-sm text-faint">No match for “{search}”.</Command.Empty>

        <Command.Group heading="Recreations" className={GROUP}>
          {GAMES.map((g) => {
            const best = storage.bestScore(g.id);
            return (
              <Item
                key={g.id}
                value={`play ${g.title}`}
                keywords={[g.id, g.year, 'recreation', 'game']}
                icon={g.icon}
                label={g.title}
                hint={g.tagline}
                meta={best ? `★ ${fmt(best)}` : g.year}
                onSelect={() => go({ name: 'play', gameId: g.id })}
              />
            );
          })}
        </Command.Group>

        {titles.length > 0 && (
          <Command.Group heading="In your collection" className={GROUP}>
            {titles.map((row) => (
              <Item
                key={`${row.c}:${row.s || row.t}`}
                value={`title ${row.c} ${row.s || row.t}`}
                // Already matched against the export's search haystack; keep cmdk from re-filtering it out.
                keywords={[needle]}
                icon={<LibraryBig />}
                label={row.t}
                hint={[row.cl || row.c, row.y, row.pub].filter(Boolean).join(' · ')}
                meta={row.oc ? 'owned' : undefined}
                onSelect={() => run(() => openTitle(row))}
              />
            ))}
          </Command.Group>
        )}

        <Command.Group heading="Go to" className={GROUP}>
          {PAGES.map((p) => (
            <Item
              key={p.label}
              value={`page ${p.label}`}
              keywords={p.keywords}
              icon={p.icon}
              label={p.label}
              hint={p.hint}
              onSelect={() => go(p.route)}
            />
          ))}
        </Command.Group>

        <Command.Group heading="Actions" className={GROUP}>
          <Item
            value="action random game"
            keywords={['shuffle', 'surprise', 'lucky', 'insert coin']}
            icon={<Shuffle />}
            label="Insert coin: random game"
            hint="Jump straight into a random recreation"
            onSelect={() => go({ name: 'play', gameId: GAMES[Math.floor(Math.random() * GAMES.length)].id })}
          />
          <Item
            value="action sound"
            keywords={['mute', 'audio', 'volume']}
            icon={muted ? <VolumeX /> : <Volume2 />}
            label={muted ? 'Unmute sound' : 'Mute sound'}
            onSelect={() => run(toggleMute)}
          />
          <Item
            value="action crt filter"
            keywords={['scanlines', 'retro', 'tv']}
            icon={<Tv />}
            label={settings.crt ? 'Turn off CRT filter' : 'Turn on CRT filter'}
            hint="Scanlines and vignette over game canvases"
            onSelect={() => run(() => setSetting('crt', !settings.crt))}
          />
          <Item
            value="action phosphor theme"
            keywords={['color', 'accent', 'theme']}
            icon={<Palette />}
            label={`Switch phosphor to ${nextPhosphor.label}`}
            hint="Stays open so you can keep cycling"
            onSelect={() => setSetting('phosphor', nextPhosphor.id)}
          />
        </Command.Group>

        <Command.Group heading="Systems" className={GROUP}>
          {SYSTEMS.map((s) => (
            <Item
              key={s.id}
              value={`system ${s.name}`}
              keywords={[s.id, s.short, s.manufacturer, String(s.year)]}
              icon={<span className="font-mono text-[10px] font-bold">{s.short.slice(0, 3)}</span>}
              label={s.name}
              hint={`${s.manufacturer} · ${s.year} · ${s.media}`}
              meta={getEmuSystem(s.id) ? 'browser' : undefined}
              onSelect={() => go({ name: 'systems', systemId: s.id })}
            />
          ))}
        </Command.Group>
      </Command.List>

      <div className="flex items-center gap-4 border-t border-white/7 px-4 py-2.5 text-[11px] text-faint">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> move
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd> open
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <Kbd>{MOD}</Kbd>
          <Kbd>K</Kbd> toggle
        </span>
      </div>
    </Command.Dialog>
  );
}
