import { useMemo, useState } from 'react';
import { useCatalog } from '../catalog/store';
import { systemIcon } from '../esde/covers';
import { getEmuSystem } from '../emulate/systems';
import { hrefFor, navigate, type Route } from '../engine/router';
import { getGame } from '../games/registry';
import { groupedByManufacturer, getPlatform, SYSTEMS } from '../systems/registry';
import type { Platform } from '../systems/types';

function badges(p: Platform) {
  const emu = getEmuSystem(p.id);
  return (
    <span className="sys-badges">
      {p.arcade && getGame(p.id) ? <span className="sys-badge sys-badge--play">Play</span> : null}
      {emu ? <span className="sys-badge sys-badge--emu">Browser</span> : null}
      {p.emulate ? <span className="sys-badge sys-badge--ra">{p.emulateEnabled ? 'RetroArch' : 'Manifest'}</span> : null}
      {p.identify ? <span className="sys-badge sys-badge--id">Identify</span> : null}
      {p.catalog ? <span className="sys-badge sys-badge--cat">Catalog</span> : null}
    </span>
  );
}

function SystemIcon({ id, className }: { id: string; className: string }) {
  const [ok, setOk] = useState(true);
  const src = systemIcon(id);
  if (!src || !ok) return null;
  return <img src={src} alt="" loading="lazy" onError={() => setOk(false)} className={className} />;
}

function SystemDetail({ p }: { p: Platform }) {
  const game = getGame(p.id);
  const emu = getEmuSystem(p.id);
  const facts = useCatalog().bundle?.systems?.find((s) => s.c === p.id);
  const hardware: [string, string | number | undefined][] = facts
    ? [
        ['Manufacturer', facts.mf],
        ['Developer', facts.dv],
        ['Released', facts.rd],
        ['CPU', facts.cpu],
        ['Memory', facts.mem],
        ['Graphics', facts.gfx],
        ['Sound', facts.snd],
        ['Display', facts.dsp],
        ['Media', facts.me],
        ['Controllers', facts.mc],
        ['Titles in catalog', facts.tn],
        ['Titles owned', facts.ot],
      ]
    : [];
  return (
    <div className="sys-detail">
      <a className="sys-back" href={hrefFor({ name: 'systems' })}>← All systems</a>
      <div className="flex flex-wrap items-center gap-6">
        <SystemIcon id={p.id} className="size-28 shrink-0 object-contain" />
        <div className="min-w-0">
          <h1>{p.name}</h1>
          <p className="sys-meta">
            <code>{p.id}</code> · {p.manufacturer} · {p.year} · {p.media}
          </p>
          {badges(p)}
        </div>
      </div>
      {facts?.ov && <p className="atlas-lead">{facts.ov}</p>}
      <p className="atlas-lead">
        Shared id across the monorepo. A folder named <code>roms/{p.id}</code> is the same id catalog uses for dumps, inventory, and the price guide.
      </p>
      <div className="sys-actions">
        {game && (
          <button className="btn btn--primary" onClick={() => navigate({ name: 'play', gameId: p.id })}>
            Play {game.title}
          </button>
        )}
        {emu && (
          <button className="btn btn--ghost" onClick={() => navigate({ name: 'emulate', systemId: p.id })}>
            Load a {emu.short} dump
          </button>
        )}
        {p.catalog && (
          <button className="btn btn--ghost" onClick={() => navigate({ name: 'catalog', tab: 'library', systemId: p.id })}>
            Open in catalog
          </button>
        )}
      </div>
      <dl className="kv">
        <div className="kv-row"><dt>Browser recreation</dt><dd>{game ? 'yes' : '—'}</dd></div>
        <div className="kv-row"><dt>EmulatorJS</dt><dd>{emu ? emu.core : '—'}</dd></div>
        <div className="kv-row"><dt>retro-pi manifest</dt><dd>{p.emulate ? (p.emulateEnabled ? 'enabled' : 'present') : '—'}</dd></div>
        <div className="kv-row"><dt>Dump identification</dt><dd>{p.identify ? 'yes' : '—'}</dd></div>
        <div className="kv-row"><dt>Shelf / prices</dt><dd>{p.catalog ? 'yes' : '—'}</dd></div>
      </dl>
      {hardware.some(([, v]) => v != null && v !== '') && (
        <>
          <h2 className="mb-2 mt-8 font-sans text-xs font-semibold uppercase tracking-[0.16em] text-faint">Hardware</h2>
          <dl className="kv">
            {hardware.filter(([, v]) => v != null && v !== '').map(([k, v]) => (
              <div key={k} className="kv-row"><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-faint">Hardware facts from the LaunchBox Games Database, via your cartidx export.</p>
        </>
      )}
    </div>
  );
}

export function SystemsPage({ route }: { route: Route }) {
  const selected = getPlatform(route.systemId);
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();

  const groups = useMemo(() => {
    const all = groupedByManufacturer();
    if (!query) return all;
    return all
      .map((g) => ({
        ...g,
        systems: g.systems.filter((s) =>
          [s.id, s.name, s.short, s.manufacturer, s.media].join(' ').toLowerCase().includes(query),
        ),
      }))
      .filter((g) => g.systems.length);
  }, [query]);

  if (route.systemId && !selected) {
    return (
      <div className="sys">
        <header className="page-hero">
          <h1>Systems</h1>
          <p className="emu-warn">Unknown id “{route.systemId}”.</p>
        </header>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="sys">
        <SystemDetail p={selected} />
      </div>
    );
  }

  return (
    <div className="sys">
      <header className="page-hero">
        <div>
          <h1>Systems</h1>
          <p>{SYSTEMS.length} ids from <code>systems/registry.yaml</code> — play, emulate, and catalog share them.</p>
        </div>
        <div className="tiles tiles--inline">
          <div className="tile"><div className="k">Play</div><div className="v">{SYSTEMS.filter((s) => s.arcade).length}</div></div>
          <div className="tile"><div className="k">Emulate</div><div className="v">{SYSTEMS.filter((s) => s.emulate).length}</div></div>
          <div className="tile"><div className="k">Identify</div><div className="v">{SYSTEMS.filter((s) => s.identify).length}</div></div>
          <div className="tile"><div className="k">Catalog</div><div className="v">{SYSTEMS.filter((s) => s.catalog).length}</div></div>
        </div>
      </header>
      <div className="toolbar">
        <input className="cat-search" type="search" placeholder="Search id, name, maker…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="spacer" />
        <span className="count">{groups.reduce((n, g) => n + g.systems.length, 0)} shown</span>
      </div>
      {groups.map((g) => (
        <section key={g.manufacturer} className="arcade-section">
          <div className="arcade-section-head">
            <h2>{g.manufacturer}</h2>
            <p>{g.systems.length}</p>
          </div>
          <div className="emu-grid">
            {g.systems.map((s) => (
              <button key={s.id} className="emu-card" onClick={() => navigate({ name: 'systems', systemId: s.id })}>
                <SystemIcon id={s.id} className="mb-1 size-12 object-contain" />
                <span className="emu-card-id">{s.short}</span>
                <strong>{s.name}</strong>
                <span className="emu-card-ext">{s.year} · {s.media}</span>
                {badges(s)}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
