import type { ReactNode } from 'react';
import { RANK } from '../../catalog/format';
import type { GameRow } from '../../catalog/types';

export function Meter({ row }: { row: GameRow }) {
  if (row.rb == null) {
    return (
      <span className="meter none">
        <span className="bars"><i /><i /><i /><i /><i /></span>
        <span className="lab">–</span>
      </span>
    );
  }
  const n = RANK[row.rt ?? ''] || 1;
  return (
    <span className="meter" title={`${row.rb.toFixed(2)} — ${row.rt ?? ''} (${row.cr ?? '?'} from ${row.rv || 0} votes)`}>
      <span className="bars">
        {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}
      </span>
      <span className="lab">{row.rb.toFixed(1)}</span>
    </span>
  );
}

export function Pill({ kind, children }: { kind: string; children: ReactNode }) {
  const cls = kind === 'pass' || kind === 'owned' ? 'pass'
    : kind === 'warn' ? 'warn'
    : kind === 'risky' || kind === 'fail' ? 'fail'
    : kind;
  return <span className={`pill ${cls}`}>{children}</span>;
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="tag">{children}</span>;
}

export function Tiles({ items }: { items: [string, string | number, string][] }) {
  return (
    <div className="tiles">
      {items.map(([k, v, s]) => (
        <div className="tile" key={k}>
          <div className="k">{k}</div>
          <div className="v">{v}</div>
          {s ? <div className="s">{s}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <b>{title}</b>
      <p>{children}</p>
    </div>
  );
}
