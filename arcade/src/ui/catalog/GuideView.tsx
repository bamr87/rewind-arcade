import { useMemo, useState } from 'react';
import { downloadCsv, usd, usd0 } from '../../catalog/format';
import type { PriceRow } from '../../catalog/types';
import { Empty, Tag, Tiles } from './bits';
import { SortTable, sortRows, type Col, type SortState } from './SortTable';

const COLS: Col<PriceRow>[] = [
  {
    k: 't',
    label: 'Title',
    cell: (d) => (
      <>
        <div className="name">{d.t}</div>
        {d.nt ? <div className="sub">{d.nt}</div> : null}
      </>
    ),
  },
  { k: 'p', label: 'Platform', cell: (d) => <Tag>{d.p}</Tag> },
  { k: 'l', label: 'Loose', cls: 'num', sort: (d) => d.l ?? -1, cell: (d) => <span className="mono">{usd(d.l)}</span> },
  { k: 'cb', label: 'Complete', cls: 'num', sort: (d) => d.cb ?? -1, cell: (d) => <span className="mono">{usd(d.cb)}</span> },
  { k: 'nw', label: 'Sealed', cls: 'num', sort: (d) => d.nw ?? -1, cell: (d) => <span className="mono">{usd(d.nw)}</span> },
  { k: 'pd', label: 'Paid', cls: 'num', sort: (d) => d.pd ?? -1, cell: (d) => <span className="mono">{usd(d.pd)}</span> },
  { k: 'o', label: 'Owned', cell: (d) => (d.o ? <span className="mark keep">owned</span> : '—') },
];

export function GuideView({ prices }: { prices: PriceRow[] }) {
  const [q, setQ] = useState('');
  const [plat, setPlat] = useState('');
  const [owned, setOwned] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: 'l', dir: -1 });
  const [limit, setLimit] = useState(120);

  const plats = useMemo(() => {
    const m = new Map<string, number>();
    prices.forEach((d) => m.set(d.p, (m.get(d.p) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [prices]);

  const query = q.trim().toLowerCase();
  const filtered = useMemo(
    () => prices.filter((d) => {
      if (plat && d.p !== plat) return false;
      if (owned && !d.o) return false;
      if (query && !d._h.includes(query)) return false;
      return true;
    }),
    [prices, plat, owned, query],
  );
  const rows = useMemo(() => sortRows(filtered, COLS, sort).slice(0, limit), [filtered, sort, limit]);

  if (!prices.length) {
    return (
      <Empty title="No price guide">
        Import a workbook with <code>cartidx prices import</code>, then rebuild.
      </Empty>
    );
  }

  const sum = (k: 'l' | 'cb' | 'pd') => filtered.reduce((a, d) => a + (d[k] || 0), 0);

  return (
    <div className="cat-main cat-main--solo">
      <Tiles items={[
        ['Listings', filtered.length.toLocaleString(), filtered.length === prices.length ? 'whole workbook' : 'filtered'],
        ['Platforms', plat ? 1 : plats.length, 'incl. consoles with no dump refs here'],
        ['Loose value', usd0(sum('l')), ''],
        ['Complete value', usd0(sum('cb')), 'boxed with manual'],
        ['Marked owned', filtered.filter((d) => d.o).length, ''],
        ['Recorded spend', usd0(sum('pd')), `${filtered.filter((d) => d.pd != null).length} with a paid price`],
      ]} />
      <div className="toolbar">
        <input className="cat-search" type="search" placeholder="Search the price guide…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(120); }} />
        <select value={plat} onChange={(e) => { setPlat(e.target.value); setLimit(120); }}>
          <option value="">All platforms</option>
          {plats.map(([p, n]) => (
            <option key={p} value={p}>{p} ({n})</option>
          ))}
        </select>
        <label className="opt opt--inline">
          <input type="checkbox" checked={owned} onChange={(e) => { setOwned(e.target.checked); setLimit(120); }} />
          owned only
        </label>
        <span className="spacer" />
        <span className="count">{filtered.length.toLocaleString()} shown</span>
        <button
          className="btn btn--ghost"
          onClick={() => {
            const cs = ['platform', 'title', 'loose', 'cib', 'new', 'paid', 'owned', 'note'];
            const mp: Record<string, keyof PriceRow> = {
              platform: 'p', title: 't', loose: 'l', cib: 'cb', new: 'nw', paid: 'pd', owned: 'o', note: 'nt',
            };
            downloadCsv('price-guide.csv', cs, filtered.map((d) => cs.map((c) => d[mp[c]])));
          }}
        >
          Export CSV
        </button>
      </div>
      <SortTable
        columns={COLS}
        rows={rows}
        sort={sort}
        onSort={(key) => {
          setSort((prev) =>
            prev.key === key
              ? { key, dir: prev.dir === 1 ? -1 : 1 }
              : { key, dir: key === 't' || key === 'p' || key === 'o' ? 1 : -1 },
          );
          setLimit(120);
        }}
        rowKey={(d) => `${d.p}:${d.t}`}
        empty={<Empty title="Nothing matches">Try another platform.</Empty>}
      />
      {filtered.length > limit && (
        <button className="btn btn--ghost cat-more" onClick={() => setLimit((n) => n + 200)}>
          Showing {limit} of {filtered.length.toLocaleString()} — load more
        </button>
      )}
      <p className="legend-note">
        Your price guide: {prices.length.toLocaleString()} listings across {plats.length} platforms. Prices are market estimates.
      </p>
    </div>
  );
}
