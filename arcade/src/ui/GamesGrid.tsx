import clsx from 'clsx';
import { Clock3, Heart, Play, Trophy } from 'lucide-react';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import type { PointerEvent } from 'react';
import { hrefFor } from '../engine/router';
import { storage } from '../engine/storage';
import type { GameManifest } from '../engine/types';
import { fmt } from '../engine/util';
import { GAMES } from '../games/registry';
import { ago } from '../profile/format';
import { statsFor, toggleFavorite, useProfile, type GameStats } from '../profile/store';
import { PlayCover } from './esde/PlayCover';

export function GamesGrid({ games = GAMES }: { games?: GameManifest[] }) {
  const profile = useProfile();
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-5">
      <AnimatePresence initial={false}>
        {games.map((game, i) => (
          <GameCard
            key={game.id}
            game={game}
            index={i}
            favorite={profile.favorites.includes(game.id)}
            stats={statsFor(profile, game.id)}
          />
        ))}
      </AnimatePresence>
    </ul>
  );
}

function GameCard({ game, index, favorite, stats }: { game: GameManifest; index: number; favorite: boolean; stats: GameStats }) {
  const best = storage.bestScore(game.id);
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const spring = { stiffness: 260, damping: 22 };
  const rotateX = useSpring(useTransform(my, [0, 1], [8, -8]), spring);
  const rotateY = useSpring(useTransform(mx, [0, 1], [-10, 10]), spring);

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width);
    my.set((e.clientY - r.top) / r.height);
  };
  const reset = () => {
    mx.set(0.5);
    my.set(0.5);
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0, transition: { delay: Math.min(index, 10) * 0.04 } }}
      exit={{ opacity: 0, scale: 0.94 }}
      style={{ ['--accent' as string]: game.accent }}
      className="perspective-[900px]"
    >
      <motion.div
        onPointerMove={onMove}
        onPointerLeave={reset}
        style={{ rotateX, rotateY }}
        className="card-sheen group relative flex h-full flex-col overflow-hidden rounded-2xl bg-[#0b1224]/85 shadow-[0_24px_50px_-24px_rgba(0,0,0,0.9)] transition-shadow duration-300 hover:shadow-[0_30px_70px_-22px_color-mix(in_srgb,var(--accent)_55%,transparent)]"
      >
        <div className="relative aspect-3/4 overflow-hidden">
          <div className="absolute inset-0 transition duration-500 group-hover:scale-[1.05]">
            <PlayCover id={game.id} title={game.title} accent={game.accent} />
          </div>
          <div className="absolute inset-0 bg-linear-to-t from-[#050814] via-[#050814]/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2 py-0.5 font-mono text-[11px] text-dim backdrop-blur">
            {game.year}
          </span>
          <span className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="grid size-14 scale-75 place-items-center rounded-full bg-accent text-[#04121f] opacity-0 shadow-[0_0_44px_var(--accent)] transition duration-300 group-hover:scale-100 group-hover:opacity-100">
              <Play className="ml-0.5 size-6" fill="currentColor" />
            </span>
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-1.5 p-4">
          <h3 className="font-display text-lg font-bold leading-tight text-fg">{game.title}</h3>
          <p className="line-clamp-2 text-[13px] leading-snug text-dim">{game.tagline}</p>
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/6 pt-3 text-xs">
            {best > 0 ? (
              <span className="flex items-center gap-1.5">
                <Trophy className="size-3.5 text-gold" />
                <b className="font-mono font-semibold text-gold">{fmt(best)}</b>
              </span>
            ) : (
              <span className="text-faint">Not played yet</span>
            )}
            {stats.lastPlayed > 0 && (
              <span className="flex items-center gap-1 text-faint">
                <Clock3 className="size-3.5" />
                {ago(stats.lastPlayed)}
              </span>
            )}
          </div>
        </div>

        <a href={hrefFor({ name: 'play', gameId: game.id })} className="absolute inset-0 z-1 rounded-2xl" aria-label={`Play ${game.title}`} />
        <button
          type="button"
          onClick={() => toggleFavorite(game.id)}
          aria-pressed={favorite}
          aria-label={favorite ? `Unfavorite ${game.title}` : `Favorite ${game.title}`}
          className={clsx(
            'absolute right-3 top-3 z-2 grid size-9 place-items-center rounded-full backdrop-blur transition',
            favorite
              ? 'bg-bad/25 text-bad'
              : 'bg-black/50 text-white/75 opacity-0 hover:text-white focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100',
          )}
        >
          <motion.span key={String(favorite)} initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 15 }}>
            <Heart className="size-4" fill={favorite ? 'currentColor' : 'none'} />
          </motion.span>
        </button>
      </motion.div>
    </motion.li>
  );
}
