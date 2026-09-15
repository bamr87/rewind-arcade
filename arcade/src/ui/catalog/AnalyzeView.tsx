import { RANK, usd0 } from '../../catalog/format';
import type { GameRow, InventoryRow } from '../../catalog/types';
import { Empty } from './bits';

function tally<T>(rows: T[], fn: (r: T) => string | undefined, top?: number): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const v = fn(r);
    if (v == null || v === '') continue;
    m.set(v, (m.get(v) || 0) + 1);
  }
  const a = [...m.entries()].sort((x, y) => y[1] - x[1]);
  return top ? a.slice(0, top) : a;
}

function HBars({
  title,
  cap,
  pairs,
  fmt,
  note,
}: {
  title: string;
  cap: string;
  pairs: [string, number][];
  fmt?: (n: number) => string;
  note?: string;
}) {
  const max = Math.max(1, ...pairs.map((p) => p[1]));
  return (
    <div className="card">
      <h3>{title}</h3>
      <div className="cap">{cap}</div>
      <div className="bars-h">
        {pairs.map(([label, n]) => (
          <div className="row-h" key={label} title={`${label}: ${fmt ? fmt(n) : n}`}>
            <span className="l">{label}</span>
            <span className="track"><span className="fill" style={{ width: `${(n / max) * 100}%` }} /></span>
            <span className="v">{fmt ? fmt(n) : n}</span>
          </div>
        ))}
      </div>
      {note ? <div className="legend-note">{note}</div> : null}
    </div>
  );
}

function Cols({
  title,
  cap,
  pairs,
  note,
}: {
  title: string;
  cap: string;
  pairs: [string, number][];
  note?: string;
}) {
  const max = Math.max(1, ...pairs.map((p) => p[1]));
  return (
    <div className="card">
      <h3>{title}</h3>
      <div className="cap">{cap}</div>
      <div className="cols">
        {pairs.map(([label, n]) => (
          <div className="col" key={label} title={`${label}: ${n}`}>
            {n > 0 ? <span className="t">{n}</span> : null}
            <span className="b" style={{ height: `${(n / max) * 88}%` }} />
          </div>
        ))}
      </div>
      <div className="xlabels">
        {pairs.map(([label]) => <span key={label}>{label}</span>)}
      </div>
      {note ? <div className="legend-note">{note}</div> : null}
    </div>
  );
}

export function AnalyzeView({ games, inventory }: { games: GameRow[]; inventory: InventoryRow[] }) {
  if (!games.length) {
    return <Empty title="Nothing to analyze">Load a catalog export first.</Empty>;
  }

  const consoles = [...new Set(games.map((r) => r.cl || r.c))];
  const perConsole = consoles.map((c) => {
    const g = games.filter((r) => (r.cl || r.c) === c);
    const rated = g.filter((r) => r.rb != null);
    const owned = g.filter((r) => r.oc);
    return {
      c,
      n: g.length,
      owned: owned.length,
      val: owned.reduce((a, r) => a + (r.l || 0), 0),
      mean: rated.length ? rated.reduce((a, r) => a + (r.rb || 0), 0) / rated.length : 0,
      cover: g.length ? (owned.length / g.length) * 100 : 0,
      dumps: g.length ? (g.filter((r) => r.rc).length / g.length) * 100 : 0,
    };
  }).sort((a, b) => b.n - a.n);

  const years: [string, number][] = [];
  for (let y = 1983; y <= 2002; y++) years.push([String(y).slice(2), games.filter((r) => r.y === y).length]);

  const rated = games.filter((r) => r.rb != null);
  const bins = new Map<string, number>();
  for (let b = 2.0; b < 5.0; b += 0.25) bins.set(b.toFixed(2), 0);
  rated.forEach((r) => {
    const b = (Math.floor((r.rb || 0) * 4) / 4).toFixed(2);
    if (bins.has(b)) bins.set(b, (bins.get(b) || 0) + 1);
  });
  const wish = games.filter((r) => !r.oc && (RANK[r.rt || ''] || 0) >= 4).sort((a, b) => (b.rb || 0) - (a.rb || 0));
  const complete = tally(inventory, (d) => d.cp || 'unspecified', 8);

  return (
    <div className="grid2">
      <HBars title="Games by platform" cap="Titles in the current catalog" pairs={perConsole.map((p) => [p.c, p.n])} />
      <HBars
        title="Ownership coverage"
        cap="Share of catalog titles on the shelf"
        pairs={perConsole.map((p) => [p.c, +p.cover.toFixed(0)])}
        fmt={(v) => `${v}%`}
        note="Inventory linked by system and title."
      />
      <HBars
        title="Dump coverage"
        cap="Titles with a file reference kept in place"
        pairs={perConsole.map((p) => [p.c, +p.dumps.toFixed(0)])}
        fmt={(v) => `${v}%`}
        note="References only: hashes, paths and identification. Files are never moved."
      />
      <HBars
        title="Owned value by platform"
        cap="Loose value of titles you own"
        pairs={perConsole.map((p) => [p.c, Math.round(p.val)])}
        fmt={(v) => usd0(v)}
      />
      <HBars
        title="Mean rating by platform"
        cap="Vote-weighted, shrunk per platform"
        pairs={perConsole.filter((p) => p.mean).map((p) => [p.c, +p.mean.toFixed(2)])}
        fmt={(v) => v.toFixed(2)}
      />
      <Cols
        title="Rating distribution"
        cap={`Weighted score, 0.25 bins · ${rated.length} rated`}
        pairs={[...bins.entries()].map(([k, n]) => [(+k).toFixed(2).replace(/0$/, ''), n])}
      />
      <Cols title="Releases by year" cap="Across the current selection" pairs={years} />
      <HBars title="Genres" cap="Top 12" pairs={tally(games, (r) => r.g, 12)} />
      <HBars title="Publishers" cap="Top 12" pairs={tally(games, (r) => r.pub, 12)} />
      <HBars
        title="Most valuable owned"
        cap="Loose value, top 12"
        pairs={games.filter((r) => r.oc && r.l != null).sort((a, b) => (b.l || 0) - (a.l || 0)).slice(0, 12).map((r) => [`${r.t} · ${r.cl || r.c}`, Math.round(r.l || 0)])}
        fmt={(v) => usd0(v)}
      />
      <HBars
        title="Wishlist"
        cap="S- and A-tier titles with no physical copy"
        pairs={wish.slice(0, 12).map((r) => [`${r.t} · ${r.cl || r.c}`, +(r.rb || 0).toFixed(2)])}
        fmt={(v) => v.toFixed(2)}
        note={wish.length ? `${wish.length} titles. cartidx query "SELECT * FROM wishlist"` : 'Nothing in the current filter.'}
      />
      <HBars title="Shelf completeness" cap="Physical items by completeness" pairs={complete} />
    </div>
  );
}
