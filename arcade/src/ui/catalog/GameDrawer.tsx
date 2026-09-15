import { useEffect, useState } from 'react';
import { gameKey, mb, titleKey, usd } from '../../catalog/format';
import type { CatalogBundle, GameRow, RomRow } from '../../catalog/types';
import { coverCandidates } from '../../esde/covers';
import { navigate } from '../../engine/router';
import { storage } from '../../engine/storage';
import { getEmuSystem } from '../../emulate/systems';
import { getPlatform } from '../../systems/registry';
import { Meter, Pill, Tag } from './bits';

const NOTES = 'catalog-notes-v1';

interface Note {
  star: boolean;
  note: string;
}

function notesMap(): Record<string, Note> {
  return storage.getJson<Record<string, Note>>(NOTES, {});
}

function refsOf(bundle: CatalogBundle, row: GameRow): RomRow[] {
  const k = titleKey(row.c, row.t);
  return bundle.roms.filter((ref) => titleKey(ref.c, ref.t) === k);
}

function Kv({ rows }: { rows: [string, string | number | undefined][] }) {
  const shown = rows.filter(([, v]) => v != null && v !== '');
  if (!shown.length) return null;
  return (
    <dl className="kv">
      {shown.map(([k, v]) => (
        <div key={k} className="kv-row">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function DrawerCover({ row }: { row: GameRow }) {
  const urls = coverCandidates(row.c, row.t, row.n, row.rg, row.bx);
  const [i, setI] = useState(0);
  const src = urls[i];
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      onError={() => setI((n) => n + 1)}
      className="mt-4 block max-h-64 max-w-45 rounded-lg shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)] ring-1 ring-white/10"
    />
  );
}

export function GameDrawer({
  bundle,
  row,
  onClose,
}: {
  bundle: CatalogBundle;
  row: GameRow;
  onClose: () => void;
}) {
  const k = gameKey(row.c, row.s, row.t);
  const [note, setNote] = useState<Note>(() => notesMap()[k] ?? { star: false, note: '' });
  const refs = refsOf(bundle, row);
  const emu = getEmuSystem(row.c);
  const platform = getPlatform(row.c);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const persist = (next: Note) => {
    setNote(next);
    const all = notesMap();
    if (!next.star && !next.note) delete all[k];
    else all[k] = next;
    storage.setJson(NOTES, all);
  };

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer cat-drawer" aria-label="Game detail">
        <button className="icon-btn drawer-close" onClick={onClose} aria-label="Close">✕</button>
        <h2>{row.t}</h2>
        <div className="dslug">{row.cl ?? row.c}{row.s ? ` · ${row.s}` : ''}</div>
        <div className="cat-drawer-badges">
          <Meter row={row} />
          {row.oc ? <Pill kind="owned">owned × {row.oc}</Pill> : null}
          {row.vd ? <Pill kind={row.vd}>{row.vd}</Pill> : null}
          <Tag>{row.cl ?? row.c}</Tag>
          {row.me ? <Tag>{row.me}</Tag> : null}
          {row.rg ? <Tag>{row.rg}</Tag> : null}
        </div>
        <DrawerCover key={k} row={row} />
        {row.ov && <p className="mt-3 text-[13px] leading-relaxed text-dim">{row.ov}</p>}

        <div className="dsec">
          <b>Release</b>
          <Kv rows={[
            ['Publisher', row.pub],
            ['Developer', row.dv],
            ['Released', row.rd ?? row.y],
            ['Type', row.ry],
            ['Genre', row.g],
            ['Series', row.fr],
            ['Players', row.mp],
            ['Serial', row.sr],
            ['Origin', row.or],
            ['ESRB', row.es],
          ]} />
        </div>
        <div className="dsec">
          <b>Rating</b>
          <Kv rows={[
            ['Community', row.cr != null ? `${row.cr} / 5` : undefined],
            ['Votes', row.rv],
            ['Weighted', row.rb != null ? `${row.rb} (${row.rt})` : undefined],
          ]} />
        </div>
        {row.l != null && (
          <div className="dsec">
            <b>Market value</b>
            <Kv rows={[
              ['Loose', usd(row.l)],
              ['Complete', row.cb != null ? usd(row.cb) : undefined],
              ['Sealed', row.nw != null ? usd(row.nw) : undefined],
              ['Listed as', row.pt && row.pt !== row.t ? row.pt : undefined],
            ]} />
          </div>
        )}
        {(row.cs != null || row.sl != null || row.ed != null || row.fm != null) && (
          <div className="dsec">
            <b>Critics and sales</b>
            <Kv rows={[
              ['Critic score', row.cs != null ? `${row.cs} / 10` : undefined],
              ['Edge', row.ed != null ? `${row.ed} / 10` : undefined],
              ['Famitsu', row.fm != null ? `${row.fm} / 40` : undefined],
              ['Known sales', row.sl != null ? `at least ${row.sl}M units` : undefined],
              ['NA / JP / PAL', (row.sna || row.sjp || row.spal)
                ? [row.sna, row.sjp, row.spal].map((x) => (x == null ? '—' : x)).join(' / ')
                : undefined],
            ]} />
          </div>
        )}
        <div className="dsec">
          <b>File references</b>
          {refs.length ? refs.map((ref) => (
            <div className="mrow" key={ref.p ?? ref.s ?? ref.crc}>
              <div>
                <div className="mn">{ref.p || ref.s || '—'}</div>
                <div className="mp">
                  {ref.id}
                  {ref.mm ? ` · ${ref.mm}` : ''}
                  {ref.crc ? ` · ${ref.crc}` : ''}
                  {ref.sz ? ` · ${mb(ref.sz)}` : ''}
                </div>
              </div>
              <div>
                {ref.st ? <Tag>{ref.st}</Tag> : null}
                {ref.vd ? <Pill kind={ref.vd}>{ref.vd}</Pill> : null}
              </div>
            </div>
          )) : (
            <p className="issue">No dump on file. Identification is recorded when a library folder is configured.</p>
          )}
          {(row.w || row.vu) && (
            <p className="cat-wiki">
              {row.w && <a href={row.w} target="_blank" rel="noopener noreferrer">Wikipedia ↗</a>}
              {row.w && row.vu ? ' · ' : null}
              {row.vu && <a href={row.vu} target="_blank" rel="noopener noreferrer">Video ↗</a>}
            </p>
          )}
        </div>
        <div className="dsec cat-jumps">
          {platform && (
            <button className="btn btn--ghost" onClick={() => navigate({ name: 'systems', systemId: row.c })}>
              System atlas
            </button>
          )}
          {emu && (
            <button className="btn btn--ghost" onClick={() => navigate({ name: 'emulate', systemId: row.c })}>
              Emulate {emu.short}
            </button>
          )}
        </div>
        <div className="dsec">
          <b>Your note</b>
          <div className="marks">
            <button className={note.star ? 'on' : ''} onClick={() => persist({ ...note, star: true })}>star</button>
            <button className={!note.star ? 'on' : ''} onClick={() => persist({ ...note, star: false })}>none</button>
          </div>
          <textarea
            value={note.note}
            placeholder="Why does this one matter?"
            onChange={(e) => persist({ ...note, note: e.target.value })}
          />
        </div>
      </aside>
    </>
  );
}
