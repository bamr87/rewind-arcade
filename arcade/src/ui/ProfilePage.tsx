import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import {
  Clock3,
  Crown,
  Download,
  Flame,
  Gamepad2,
  Heart,
  Joystick,
  Medal,
  Moon,
  Play,
  RotateCcw,
  Sparkles,
  Timer,
  Trophy,
  Upload,
} from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { hrefFor } from '../engine/router';
import { storage } from '../engine/storage';
import { fmt } from '../engine/util';
import { GAMES } from '../games/registry';
import { ago, duration } from '../profile/format';
import { exportProfile, importProfile, resetProfile, statsFor, totals, useProfile, type Profile } from '../profile/store';
import { PlayCover } from './esde/PlayCover';
import { Button, buttonClass, downloadText, PageHeader, Panel, pickFile, Sparkline, StatTile } from './kit';

interface Ctx {
  profile: Profile;
  sums: ReturnType<typeof totals>;
  bests: Record<string, number>;
}

const ACHIEVEMENTS: { id: string; title: string; detail: string; icon: LucideIcon; goal: number; progress: (c: Ctx) => number }[] = [
  { id: 'coin', title: 'Insert Coin', detail: 'Start your first session', icon: Joystick, goal: 1, progress: (c) => c.sums.plays },
  { id: 'regular', title: 'Regular', detail: 'Play 25 sessions', icon: Flame, goal: 25, progress: (c) => c.sums.plays },
  { id: 'marathon', title: 'Marathon', detail: 'Log an hour of play', icon: Timer, goal: 3600, progress: (c) => c.sums.seconds },
  { id: 'tour', title: 'Grand Tour', detail: 'Play every recreation', icon: Gamepad2, goal: GAMES.length, progress: (c) => c.sums.played },
  { id: 'records', title: 'Record Breaker', detail: 'Set 5 personal records', icon: Medal, goal: 5, progress: (c) => c.sums.records },
  { id: 'fan', title: 'Superfan', detail: 'Favorite 3 games', icon: Heart, goal: 3, progress: (c) => c.profile.favorites.length },
  { id: 'high', title: 'High Roller', detail: 'Reach 10,000 in any game', icon: Crown, goal: 10000, progress: (c) => Math.max(0, ...Object.values(c.bests)) },
  {
    id: 'owl',
    title: 'Night Owl',
    detail: 'Post a score after midnight',
    icon: Moon,
    goal: 1,
    progress: (c) => (Object.values(c.profile.games).some((g) => g.scores.some((s) => new Date(s.at).getHours() < 5)) ? 1 : 0),
  },
];

const COLS = 'grid grid-cols-[minmax(210px,2fr)_96px_112px_76px_84px_96px_88px] items-center gap-3';

export function ProfilePage() {
  const profile = useProfile();
  const sums = totals(profile);
  const bests: Record<string, number> = Object.fromEntries(GAMES.map((g) => [g.id, storage.bestScore(g.id)] as const));
  const ctx: Ctx = { profile, sums, bests };
  const unlocked = ACHIEVEMENTS.filter((a) => a.progress(ctx) >= a.goal).length;
  const rows = [...GAMES].sort(
    (a, b) => statsFor(profile, b.id).lastPlayed - statsFor(profile, a.id).lastPlayed || a.title.localeCompare(b.title),
  );

  const onExport = () => {
    downloadText(`rewind-arcade-profile-${new Date().toISOString().slice(0, 10)}.json`, exportProfile(GAMES.map((g) => g.id)));
    toast.success('Profile backup downloaded');
  };
  const onImport = async () => {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    try {
      importProfile(await file.text());
      toast.success('Profile restored');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read that backup');
    }
  };
  const onReset = () => {
    if (!window.confirm('Clear play history and favorites? Best scores stay.')) return;
    resetProfile();
    toast('Play history cleared');
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-16 pt-8 sm:px-8">
      <PageHeader
        kicker="Player one"
        title="Hall of Fame"
        actions={
          <>
            <Button onClick={onExport}>
              <Download />
              Export
            </Button>
            <Button onClick={() => void onImport()}>
              <Upload />
              Import
            </Button>
            <Button variant="danger" onClick={onReset}>
              <RotateCcw />
              Reset
            </Button>
          </>
        }
      >
        Sessions, records, and favorites from the recreations, kept on this device since{' '}
        {new Date(profile.since).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}.
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Joystick} label="Sessions" value={sums.plays} />
        <StatTile icon={Clock3} label="Time played" value={sums.seconds} format={duration} />
        <StatTile icon={Gamepad2} label="Games played" value={sums.played} suffix={`/ ${GAMES.length}`} />
        <StatTile icon={Trophy} label="Records set" value={sums.records} />
      </div>

      <Panel
        className="mt-6"
        title="Achievements"
        icon={<Sparkles />}
        aside={<span className="font-mono text-xs text-faint">{unlocked}/{ACHIEVEMENTS.length} unlocked</span>}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ACHIEVEMENTS.map((a, i) => {
            const p = Math.min(1, a.progress(ctx) / a.goal);
            const done = p >= 1;
            return (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={clsx(
                  'rounded-xl p-4 ring-1 ring-inset',
                  done ? 'bg-accent/10 ring-accent/35' : 'bg-white/3 ring-white/7',
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={clsx(
                      'grid size-10 shrink-0 place-items-center rounded-xl',
                      done ? 'bg-accent text-[#04121f] shadow-[0_0_24px_-2px_var(--accent)]' : 'bg-white/6 text-faint',
                    )}
                  >
                    <a.icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <div className={clsx('font-display font-bold', done ? 'text-fg' : 'text-dim')}>{a.title}</div>
                    <div className="truncate text-xs text-faint">{a.detail}</div>
                  </div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/6">
                  <motion.div
                    className={clsx('h-full rounded-full', done ? 'bg-accent' : 'bg-white/30')}
                    initial={{ width: 0 }}
                    animate={{ width: `${p * 100}%` }}
                    transition={{ duration: 0.8, delay: 0.1 + i * 0.04 }}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      </Panel>

      <Panel className="mt-6" title="Scoreboard" icon={<Trophy />}>
        <div className="-mx-2 overflow-x-auto px-2">
          <div role="table" aria-label="Scoreboard" className="min-w-[820px]">
            <div role="row" className={clsx(COLS, 'px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint')}>
              <span role="columnheader">Game</span>
              <span role="columnheader" className="text-right">Best</span>
              <span role="columnheader">Trend</span>
              <span role="columnheader" className="text-right">Sessions</span>
              <span role="columnheader" className="text-right">Time</span>
              <span role="columnheader" className="text-right">Last played</span>
              <span role="columnheader" />
            </div>
            {rows.map((g) => {
              const s = statsFor(profile, g.id);
              return (
                <div
                  key={g.id}
                  role="row"
                  style={{ ['--accent' as string]: g.accent }}
                  className={clsx(COLS, 'rounded-xl px-3 py-2 transition hover:bg-white/4')}
                >
                  <span role="cell" className="flex min-w-0 items-center gap-3">
                    <span className="h-12 w-9 shrink-0 overflow-hidden rounded-md ring-1 ring-white/10">
                      <PlayCover id={g.id} title="" accent={g.accent} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-display font-semibold text-fg">{g.title}</span>
                      <span className="block text-xs text-faint">{g.year}</span>
                    </span>
                  </span>
                  <span role="cell" className="text-right font-mono text-gold">{bests[g.id] ? fmt(bests[g.id]) : '—'}</span>
                  <span role="cell"><Sparkline values={s.scores.map((e) => e.score)} /></span>
                  <span role="cell" className="text-right font-mono text-dim">{s.plays || '—'}</span>
                  <span role="cell" className="text-right font-mono text-dim">{s.seconds ? duration(s.seconds) : '—'}</span>
                  <span role="cell" className="text-right text-sm text-dim">{ago(s.lastPlayed)}</span>
                  <span role="cell" className="text-right">
                    <a href={hrefFor({ name: 'play', gameId: g.id })} className={buttonClass('soft', 'sm')}>
                      <Play fill="currentColor" />
                      Play
                    </a>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Panel>
    </div>
  );
}
