import type { ReactNode } from 'react';

export interface Col<T> {
  k: string;
  label: string;
  cls?: string;
  hint?: string;
  sort?: (row: T) => string | number;
  cell: (row: T) => ReactNode;
}

export interface SortState {
  key: string;
  dir: 1 | -1;
}

export function sortRows<T extends { t?: string }>(
  rows: T[],
  cols: Col<T>[],
  sort: SortState,
): T[] {
  const col = cols.find((c) => c.k === sort.key) ?? cols[0];
  const get = col.sort ?? ((r: T) => String((r as Record<string, unknown>)[col.k] ?? '').toLowerCase());
  return rows.slice().sort((a, b) => {
    const x = get(a);
    const y = get(b);
    if (x < y) return -sort.dir;
    if (x > y) return sort.dir;
    return String(a.t ?? '').localeCompare(String(b.t ?? ''));
  });
}

export function SortTable<T>({
  columns,
  rows,
  sort,
  onSort,
  onRow,
  rowKey,
  empty,
}: {
  columns: Col<T>[];
  rows: T[];
  sort: SortState;
  onSort: (key: string) => void;
  onRow?: (row: T) => void;
  rowKey: (row: T) => string;
  empty: ReactNode;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.k}
                className={sort.key === c.k ? 'sorted' : ''}
                title={c.hint}
                onClick={() => onSort(c.k)}
              >
                {c.label}
                {sort.key === c.k ? <span className="mono">{sort.dir > 0 ? ' ↑' : ' ↓'}</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>{empty}</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRow ? () => onRow(row) : undefined}
                className={onRow ? 'is-click' : undefined}
              >
                {columns.map((c) => (
                  <td key={c.k} className={c.cls}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
