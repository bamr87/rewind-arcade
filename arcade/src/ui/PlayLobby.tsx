import { Clock3, Gamepad2, Heart, Joystick, Play, Search, Shuffle, Trophy } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { hrefFor, navigate } from '../engine/router';
import { storage } from '../engine/storage';
import type { GameManifest } from '../engine/types';
import { fmt } from '../engine/util';
import { GAMES, getGame } from '../games/registry';
import { duration } from '../profile/format';
import { recentlyPlayed, statsFor, toggleFavorite, totals, useProfile, type Profile } from '../profile/store';
import { PlayCover } from './esde/PlayCover';
import { GamesGrid } from './GamesGrid';
import { Button, buttonClass, EmptyState, Segmented, StatTile } from './kit';

type Filter = 'all' | 'favorites' | 'played' | 'fresh';
type Sort = 'featured' | 'title' | 'year' | 'recent' | 'most';

const FILTERS: Filter[] = ['all', 'favorites', 'played', 'fresh'];
const SORTS: { value: Sort; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'recent', label: 'Recently played' },
  { value: 'most', label: 'Most played' },
  { value: 'title', label: 'Title' },
  { value: 'year', label: 'Release year' },
];

function matches(game: GameManifest, filter: Filter, profile: Profile): boolean {
  const s = statsFor(profile, game.id);
  if (filter === 'favorites') return profile.favorites.includes(game.id);
  if (filter === 'played') return s.plays > 0;
  if (filter === 'fresh') return s.plays === 0;
  return true;
}

function randomGame() {
  navigate({ name: 'play', gameId: GAMES[Math.floor(Math.random() * GAMES.length)].id });
}

export function PlayLobby() {
  const profile = useProfile();
  const [filter, setFilterState] = useState<Filter>(() => {
    const saved = storage.getJson<string>('lobby:filter', 'all');
    return FILTERS.includes(saved as Filter) ? (saved as Filter) : 'all';
  });
  const [sort, setSort] = useState<Sort>('featured');
  const [q, setQ] = useState('');
  const setFilter = (f: Filter) => {
    setFilterState(f);
    storage.setJson('lobby:filter', f);
  };

  const recent = recentlyPlayed(profile, 1)[0];
  // Continue the last game, or rotate a spotlight daily so the lobby changes.
  const featured = getGame(recent?.[0]) ?? GAMES[Math.floor(Date.now() / 86_400_000) % GAMES.length];
  const sums = totals(profile);

  const games = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = GAMES.filter(
      (g) => matches(g, filter, profile) && (!needle || `${g.title} ${g.tagline} ${g.year}`.toLowerCase().includes(needle)),
    );
    const s = (g: GameManifest) => statsFor(profile, g.id);
    if (sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'year') list.sort((a, b) => Number(a.year) - Number(b.year));
    if (sort === 'recent') list.sort((a, b) => s(b).lastPlayed - s(a).lastPlayed);
    if (sort === 'most') list.sort((a, b) => s(b).plays - s(a).plays || s(b).seconds - s(a).seconds);
    return list;
  }, [filter, sort, q, profile]);

  const count = (f: Filter) => GAMES.filter((g) => matches(g, f, profile)).length;

  return (
    <div className="mx-auto w-full max-w-7xl px-5 pb-16 pt-6 sm:px-8 sm:pt-8">
      <Hero game={featured} resume={Boolean(recent)} profile={profile} />

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Joystick} label="Sessions" value={sums.plays} href={hrefFor({ name: 'profile' })} />
        <StatTile icon={Clock3} label="Time played" value={sums.seconds} format={duration} href={hrefFor({ name: 'profile' })} />
        <StatTile icon={Gamepad2} label="Games played" value={sums.played} suffix={`/ ${GAMES.length}`} href={hrefFor({ name: 'profile' })} />
        <StatTile icon={Trophy} label="Records set" value={sums.records} href={hrefFor({ name: 'profile' })} />
      </div>

      <div className="mb-5 mt-10 flex flex-wrap items-center gap-3">
        <h2 className="mr-auto font-display text-2xl font-bold text-fg">All recreations</h2>
        <Segmented
          id="lobby-filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: count('all') },
            { value: 'favorites', label: 'Favorites', count: count('favorites') },
            { value: 'played', label: 'Played', count: count('played') },
            { value: 'fresh', label: 'New to you', count: count('fresh') },
          ]}
        />
        <label className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3 size-4 text-faint" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter games"
            className="h-9 w-44 rounded-xl bg-white/5 pl-9 pr-3 text-sm text-fg outline-none ring-1 ring-inset ring-white/10 placeholder:text-faint focus:ring-accent/50"
          />
        </label>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort games"
          className="h-9 w-auto rounded-xl bg-white/5 px-3 text-sm text-dim outline-none ring-1 ring-inset ring-white/10"
        >
          {SORTS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {games.length ? (
        <GamesGrid games={games} />
      ) : (
        <EmptyState
          icon={filter === 'favorites' ? <Heart /> : <Search />}
          title={filter === 'favorites' ? 'No favorites yet' : 'Nothing matches'}
          action={
            <Button onClick={() => { setFilter('all'); setQ(''); }}>Show all games</Button>
          }
        >
          {filter === 'favorites' ? 'Hover a cabinet and tap the heart to pin it here.' : 'Try a different filter or clear the search.'}
        </EmptyState>
      )}
    </div>
  );
}

function Hero({ game, resume, profile }: { game: GameManifest; resume: boolean; profile: Profile }) {
  const s = statsFor(profile, game.id);
  const best = storage.bestScore(game.id);
  const favorite = profile.favorites.includes(game.id);
  return (
    <section
      style={{ ['--accent' as string]: game.accent }}
      className="glass relative overflow-hidden rounded-3xl p-6 sm:p-10"
    >
      <div aria-hidden className="pointer-events-none absolute -right-32 -top-40 size-[520px] rounded-full bg-accent/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 left-1/4 size-[420px] rounded-full bg-accent-2/10 blur-3xl" />

      <div className="relative grid items-center gap-10 md:grid-cols-[1fr_auto]">
        <AnimatePresence mode="wait">
          <motion.div
            key={game.id}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="min-w-0"
          >
            <p className="text-glow font-pixel text-[10px] uppercase tracking-[0.22em] text-accent">
              {resume ? 'Continue playing' : "Today's cabinet"}
            </p>
            <h1 className="mt-4 font-display text-5xl font-bold leading-[0.95] tracking-tight text-fg sm:text-7xl">
              {game.title}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-dim sm:text-lg">{game.description}</p>

            <div className="mt-5 flex flex-wrap gap-2 text-xs">
              <Chip>{game.year}</Chip>
              {best > 0 && <Chip><Trophy className="size-3.5 text-gold" />Best {fmt(best)}</Chip>}
              {s.plays > 0 && <Chip><Joystick className="size-3.5" />{s.plays} sessions</Chip>}
              {s.seconds > 0 && <Chip><Clock3 className="size-3.5" />{duration(s.seconds)}</Chip>}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <a href={hrefFor({ name: 'play', gameId: game.id })} className={buttonClass('primary', 'lg')}>
                <Play fill="currentColor" />
                {resume ? 'Play again' : 'Insert coin'}
              </a>
              <Button size="lg" onClick={randomGame}>
                <Shuffle />
                Random
              </Button>
              <Button
                size="lg"
                variant="ghost"
                aria-pressed={favorite}
                onClick={() => toggleFavorite(game.id)}
                className={favorite ? 'text-bad hover:text-bad' : undefined}
              >
                <Heart fill={favorite ? 'currentColor' : 'none'} />
                {favorite ? 'Favorited' : 'Favorite'}
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>

        <motion.a
          href={hrefFor({ name: 'play', gameId: game.id })}
          aria-label={`Play ${game.title}`}
          className="relative mx-auto block w-48 sm:w-60"
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          whileHover={{ rotate: 0, scale: 1.03 }}
          initial={{ rotate: 4 }}
        >
          <span aria-hidden className="absolute inset-6 rounded-2xl bg-accent/60 blur-3xl" />
          <span className="relative block overflow-hidden rounded-2xl shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)] ring-1 ring-white/15">
            <PlayCover id={game.id} title={game.title} accent={game.accent} />
          </span>
        </motion.a>
      </div>
    </section>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/6 px-2.5 py-1 font-mono text-dim ring-1 ring-inset ring-white/10">
      {children}
    </span>
  );
}
