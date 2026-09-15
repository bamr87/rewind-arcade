import { useMemo, useState } from 'react';
import { downloadCsv, usd, usd0 } from '../../catalog/format';
import type { InventoryRow } from '../../catalog/types';
import { Empty, Tag, Tiles } from './bits';
import { SortTable, sortRows, type Col, type SortState } from './SortTable';

const COLS: Col<InventoryRow>[] = [
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
  { k: 'cl', label: 'System', cell: (d) => <Tag>{d.cl || d.c}</Tag> },
  { k: 'cp', label: 'Completeness', cell: (d) => d.cp || '—' },
  { k: 'cd', label: 'Condition', cell: (d) => d.cd || '—' },
  { k: 'q', label: 'Qty', cls: 'num', sort: (d) => d.q || 1, cell: (d) => <span className="mono">{d.q || 1}</span> },
  { k: 'pd', label: 'Paid', cls: 'num', sort: (d) => d.pd ?? -1, cell: (d) => <span className="mono">{usd(d.pd)}</span> },
  { k: 'v', label: 'Value', cls: 'num', sort: (d) => d.v ?? -1, cell: (d) => <span className="mono">{usd(d.v)}</span> },
  {
    k: 'rc',
    label: 'Ref',
    cls: 'num',
    sort: (d) => d.rc || 0,
    cell: (d) => (d.rc ? <span className="mark keep" title={d.rs}>{d.rc}</span> : <span className="mark review">none</span>),
  },
  {
    k: 'rb',
    label: 'Rating',
    cls: 'num',
    sort: (d) => d.rb ?? -1,
    cell: (d) => (d.rb != null ? <span className="mono">{d.rb.toFixed(1)}</span> : '—'),
  },
];

export function PhysicalView({ items }: { items: InventoryRow[] }) {
  const [q, setQ] = useState('');
  const [sys, setSys] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'v', dir: -1 });

  const systems = useMemo(() => {
    const m = new Map<string, string>();
    items.forEach((d) => m.set(d.c, d.cl || d.c));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const query = q.trim().toLowerCase();
  const filtered = useMemo(
    () => items.filter((d) => (!sys || d.c === sys) && (!query || d._h.includes(query))),
    [items, sys, query],
  );
  const rows = useMemo(() => sortRows(filtered, COLS, sort), [filtered, sort]);

  if (!items.length) {
    return (
      <Empty title="No inventory yet">
        Import owned rows with <code>cartidx inventory import</code>, or add items with <code>cartidx inventory add</code>.
      </Empty>
    );
  }

  const sum = (k: 'v' | 'pd') => filtered.reduce((a, d) => a + (d[k] || 0), 0);
  const noRom = filtered.filter((d) => !d.rc).length;

  return (
    <div className="cat-main cat-main--solo">
      <Tiles items={[
        ['Items', filtered.length.toLocaleString(), filtered.length === items.length ? 'whole inventory' : 'filtered'],
        ['Systems', new Set(filtered.map((d) => d.c)).size, ''],
        ['Market value', usd0(sum('v')), `${filtered.filter((d) => d.v != null).length} priced`],
        ['Paid', usd0(sum('pd')), `${filtered.filter((d) => d.pd != null).length} with a price paid`],
        ['Have a dump ref', (filtered.length - noRom).toLocaleString(), `${noRom} without one`],
      ]} />
      <div className="toolbar">
        <input className="cat-search" type="search" placeholder="Search the shelf…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={sys} onChange={(e) => setSys(e.target.value)}>
          <option value="">All systems</option>
          {systems.map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        <span className="spacer" />
        <span className="count">{filtered.length.toLocaleString()} shown</span>
        <button
          className="btn btn--ghost"
          onClick={() => {
            const cs = ['id', 'system', 'title', 'completeness', 'condition', 'quantity', 'paid', 'value', 'loose_price', 'cib_price', 'rom_count', 'rating_bayesian', 'location', 'notes'];
            const mp: Record<string, keyof InventoryRow> = {
              id: 'id', system: 'c', title: 't', completeness: 'cp', condition: 'cd', quantity: 'q',
              paid: 'pd', value: 'v', loose_price: 'l', cib_price: 'cb', rom_count: 'rc',
              rating_bayesian: 'rb', location: 'lo', notes: 'nt',
            };
            downloadCsv('inventory.csv', cs, filtered.map((d) => cs.map((c) => d[mp[c]])));
          }}
        >
          Export CSV
        </button>
      </div>
      <SortTable
        columns={COLS}
        rows={rows}
        sort={sort}
        onSort={(key) => setSort((prev) =>
          prev.key === key
            ? { key, dir: prev.dir === 1 ? -1 : 1 }
            : { key, dir: key === 't' || key === 'cl' || key === 'cp' || key === 'cd' ? 1 : -1 },
        )}
        rowKey={(d) => d.id || `${d.c}:${d.t}`}
        empty={<Empty title="Nothing matches">Try another system or search.</Empty>}
      />
    </div>
  );
}
