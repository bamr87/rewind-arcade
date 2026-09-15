export const RANK: Record<string, number> = {
  'S - classic': 5,
  'A - great': 4,
  'B - good': 3,
  'C - average': 2,
  'D - weak': 1,
};

export function usd(v: number | undefined | null): string {
  if (v == null) return '—';
  return '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function usd0(v: number): string {
  return '$' + Math.round(v || 0).toLocaleString();
}

export function mb(b: number | undefined): string {
  if (!b) return '—';
  return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB';
}

export function csvCell(v: unknown): string {
  const t = v == null ? '' : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function downloadCsv(filename: string, header: string[], rows: unknown[][]): void {
  const body = [header.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type: 'text/csv' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function titleKey(system: string | undefined, title: string | undefined): string {
  return `${system ?? ''}`.toLowerCase() + '|' + `${title ?? ''}`.toLowerCase();
}

export function gameKey(system: string | undefined, slug: string | undefined, title: string | undefined): string {
  return `${system ?? ''}:${slug || title || ''}`;
}
