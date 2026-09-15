import { useMemo, useState } from 'react';
import { downloadCsv, gameKey, RANK, usd } from '../../catalog/format';
import type { CatalogBundle, GameRow } from '../../catalog/types';
import { Empty, Meter, Pill, Tag, Tiles } from './bits';
import { SortTable, sortRows, type Col, type SortState } from './SortTable';

interface Facet {
  k: string;
  label: string;
  val: (r: GameRow) => string;
  order?: (a: string) => number;
}

const FACETS: Facet[] = [
  { k: 'cl', label: 'Platform', val: (r) => r.cl || r.c },
  { k: 'me', label: 'Type', val: (r) => r.me || '—' },
  { k: 'rt', label: 'Rating', val: (r) => r.rt || 'Unrated', order: (a) => -(RANK[a] || 0) },
  { k: '_own', label: 'Owned', val: (r) => (r.oc ? 'Owned' : 'Not owned') },
  { k: '_ref', label: 'File reference', val: (r) => (r.rc ? 'Has dump ref' : 'No dump ref') },
  {
    k: '_val',
    label: 'Value',
    order: (a) => ['Unpriced', 'Under $10', '$10–$25', '$25–$50', '$50–$100', '$100+'].indexOf(a),
    val: (r) =>
      r.l == null ? 'Unpriced' : r.l < 10 ? 'Under $10' : r.l < 25 ? '$10–$25' : r.l < 50 ? '$25–$50' : r.l < 100 ? '$50–$100' : '$100+',
  },
  { k: 'g', label: 'Genre', val: (r) => r.g || '—' },
  { k: 'rg', label: 'Region', val: (r) => r.rg || '—' },
  { k: 'y', label: 'Year', val: (r) => (r.y ? String(r.y) : '—') },
  { k: 'pub', label: 'Publisher', val: (r) => r.pub || '—' },
  {
    k: '_cs',
    label: 'Critic',
    order: (a) => ['Unscored', 'Under 7', '7–8', '8–9', '9+'].indexOf(a),
    val: (r) => (r.cs == null ? 'Unscored' : r.cs < 7 ? 'Under 7' : r.cs < 8 ? '7–8' : r.cs < 9 ? '8–9' : '9+'),
  },
];

const COLS: Col<GameRow>[] = [
  {
    k: 't',
    label: 'Title',
    sort: (r) => (r.t || '').toLowerCase(),
    cell: (r) => (
      <>
        <div className="name">{r.t}</div>
        {r.s ? <div className="sub">{r.s}</div> : null}
      </>
    ),
  },
  { k: 'cl', label: 'Platform', cell: (r) => <Tag>{r.cl || r.c}</Tag> },
  { k: 'rb', label: 'Rating', cls: 'num', cell: (r) => <Meter row={r} />, sort: (r) => r.rb ?? -1 },
  {
    k: 'l',
    label: 'Value',
    cls: 'num',
    sort: (r) => r.l ?? -1,
    cell: (r) => <span className="mono">{usd(r.l)}</span>,
  },
  {
    k: 'cs',
    label: 'Critic',
    cls: 'num',
    hint: 'VGChartz critic score out of 10.',
    sort: (r) => r.cs ?? -1,
    cell: (r) => <span className="mono">{r.cs == null ? '—' : r.cs.toFixed(1)}</span>,
  },
  {
    k: 'sl',
    label: 'Sold†',
    cls: 'num',
    hint: 'Millions of units from VGChartz. A floor, not a ranking.',
    sort: (r) => r.sl ?? -1,
    cell: (r) => (
      <span className="mono" title={r.sl != null ? `at least ${r.sl}M units — source is incomplete` : undefined}>
        {r.sl == null ? '—' : `${r.sl.toFixed(2)}M`}
      </span>
    ),
  },
  { k: 'g', label: 'Genre', cell: (r) => r.g || '—' },
  { k: 'y', label: 'Year', cls: 'num', sort: (r) => r.y || 0, cell: (r) => <span className="mono">{r.y || '—'}</span> },
  { k: 'pub', label: 'Publisher', cell: (r) => r.pub || '—' },
  {
    k: 'oc',
    label: 'Owned',
    cls: 'num',
    sort: (r) => r.oc || 0,
    cell: (r) => (r.oc ? <span className="mark keep">{r.oc}</span> : '—'),
  },
  {
    k: 'rc',
    label: 'Refs',
    cls: 'num',
    sort: (r) => r.rc || 0,
    cell: (r) => (r.rc ? <span className="mono">{r.rc}</span> : '—'),
  },
  { k: 'vd', label: 'Dump', cell: (r) => (r.vd ? <Pill kind={r.vd}>{r.vd}</Pill> : '—') },
];

function passes(row: GameRow, q: string, chosen: Record<string, string[]>, skip?: string): boolean {
  if (q && !row._h.includes(q)) return false;
  for (const f of FACETS) {
    if (f.k === skip) continue;
    const sel = chosen[f.k];
    if (sel?.length && !sel.includes(f.val(row))) return false;
  }
  return true;
}

export function LibraryView({
  bundle,
  systemId,
  onOpen,
}: {
  bundle: CatalogBundle;
  systemId?: string;
  onOpen: (row: GameRow) => void;
}) {
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const [sort, setSort] = useState<SortState>({ key: 't', dir: 1 });
  const [limit, setLimit] = useState(150);

  const games = useMemo(() => {
    if (!systemId) return bundle.games;
    return bundle.games.filter((r) => r.c === systemId);
  }, [bundle.games, systemId]);

  const query = q.trim().toLowerCase();
  const filtered = useMemo(
    () => games.filter((r) => passes(r, query, chosen)),
    [games, query, chosen],
  );

  const rows = useMemo(() => sortRows(filtered, COLS, sort).slice(0, limit), [filtered, sort, limit]);

  const toggle = (facet: string, value: string) => {
    setChosen((prev) => {
      const cur = prev[facet] ?? [];
      const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
      return { ...prev, [facet]: next };
    });
    setLimit(150);
  };

  const onSort = (key: string) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 1 ? -1 : 1 }
        : { key, dir: ['rb', 'l', 'y', 'cs', 'sl', 'oc', 'rc'].includes(key) ? -1 : 1 },
    );
    setLimit(150);
  };

  const rated = filtered.filter((r) => r.rb != null);
  const avg = rated.length ? rated.reduce((a, r) => a + (r.rb || 0), 0) / rated.length : null;
  const owned = filtered.filter((r) => r.oc);
  const wish = filtered.filter((r) => !r.oc && (RANK[r.rt || ''] || 0) >= 4);

  return (
    <div className="cat-body">
      <aside className="rail">
        <div className="rail-head">
          <b>Filters</b>
          <button
            className="clear"
            disabled={!query && !FACETS.some((f) => (chosen[f.k] ?? []).length)}
            onClick={() => { setQ(''); setChosen({}); setLimit(150); }}
          >
            Reset
          </button>
        </div>
        {FACETS.map((f) => {
          const counts = new Map<string, number>();
          for (const r of games) {
            if (!passes(r, query, chosen, f.k)) continue;
            const v = f.val(r);
            counts.set(v, (counts.get(v) || 0) + 1);
          }
          let opts = [...counts.entries()];
          const order = f.order;
          if (order) opts.sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]));
          else if (f.k === 'y') opts.sort((a, b) => a[0].localeCompare(b[0]));
          else opts.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
          const sel = chosen[f.k] ?? [];
          const open = sel.length > 0 || f.k === 'cl' || f.k === 'rt' || f.k === '_own';
          return (
            <details key={f.k} className="facet" open={open}>
              <summary>
                {f.label}
                {sel.length ? <span className="cnt">{sel.length}</span> : null}
              </summary>
              <div className="facet-list">
                {opts.map(([label, n]) => (
                  <label key={label} className={`opt${sel.includes(label) ? ' on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={sel.includes(label)}
                      onChange={() => toggle(f.k, label)}
                    />
                    <span className="lab">{label}</span>
                    <span className="cnt">{n}</span>
                  </label>
                ))}
              </div>
            </details>
          );
        })}
      </aside>
      <div className="cat-main">
        <Tiles items={[
          ['Games', filtered.length.toLocaleString(), filtered.length === games.length ? 'whole catalog' : `of ${games.length.toLocaleString()}`],
          ['Platforms', new Set(filtered.map((r) => r.cl || r.c)).size, ''],
          ['Owned', owned.length, filtered.length ? `${Math.round((owned.length / filtered.length) * 100)}% of catalog` : ''],
          ['Shelf value', owned.reduce((a, r) => a + (r.l || 0), 0).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }), `${owned.filter((r) => r.l != null).length} priced`],
          ['Mean rating', avg ? avg.toFixed(2) : '—', `${rated.length} rated`],
          ['File refs', filtered.filter((r) => r.rc).length, 'dump references kept in place'],
          ['Wishlist', wish.length, 'S/A unowned'],
        ]} />
        <div className="toolbar">
          <input
            type="search"
            className="cat-search"
            placeholder="Search title, publisher, franchise…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setLimit(150); }}
          />
          <span className="spacer" />
          <span className="count">{filtered.length.toLocaleString()} shown</span>
          <button
            className="btn btn--ghost"
            onClick={() => {
              const cs = ['system', 'title', 'slug', 'media', 'region', 'publisher', 'genre', 'year', 'rating_bayesian', 'rating_tier', 'critic_score', 'sales_total', 'owned_count', 'rom_count', 'verified', 'best_verdict', 'loose_price', 'cib_price', 'new_price'];
              const mp: Record<string, keyof GameRow> = {
                system: 'c', title: 't', slug: 's', media: 'me', region: 'rg', publisher: 'pub',
                genre: 'g', year: 'y', rating_bayesian: 'rb', rating_tier: 'rt', critic_score: 'cs',
                sales_total: 'sl', owned_count: 'oc', rom_count: 'rc', verified: 'vf', best_verdict: 'vd',
                loose_price: 'l', cib_price: 'cb', new_price: 'nw',
              };
              downloadCsv('cartridge-index.csv', cs, filtered.map((r) => cs.map((c) => r[mp[c]])));
            }}
          >
            Export CSV
          </button>
        </div>
        <SortTable
          columns={COLS}
          rows={rows}
          sort={sort}
          onSort={onSort}
          onRow={onOpen}
          rowKey={(r) => gameKey(r.c, r.s, r.t)}
          empty={<Empty title="No games match">Loosen a filter or clear the search.</Empty>}
        />
        {filtered.length > limit && (
          <button className="btn btn--ghost cat-more" onClick={() => setLimit((n) => n + 200)}>
            Showing {limit} of {filtered.length.toLocaleString()} — load more
          </button>
        )}
      </div>
    </div>
  );
}
