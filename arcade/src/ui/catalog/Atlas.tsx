import { navigate } from '../../engine/router';
import { catalogPlatforms, identifyPlatforms } from '../../systems/registry';
import { getEmuSystem } from '../../emulate/systems';

export function Atlas() {
  const platforms = catalogPlatforms();
  const identify = identifyPlatforms();
  const makers = [...new Map(platforms.map((p) => [p.manufacturer, 0] as const)).keys()];

  return (
    <div className="atlas">
      <div className="tiles">
        <div className="tile">
          <div className="k">Shelf platforms</div>
          <div className="v">{platforms.length}</div>
          <div className="s">inventory + price guide ids</div>
        </div>
        <div className="tile">
          <div className="k">Dump identify</div>
          <div className="v">{identify.length}</div>
          <div className="s">header + No-Intro from bytes</div>
        </div>
        <div className="tile">
          <div className="k">Manufacturers</div>
          <div className="v">{makers.length}</div>
          <div className="s">from systems/registry.yaml</div>
        </div>
      </div>
      <p className="atlas-lead">
        Collection rows stay on your machine. Load <code>data.js</code> from <code>cartidx build</code> to browse titles, shelf value, and dump refs. Until then, this is the platform atlas the catalog pillar knows.
      </p>
      <div className="emu-grid">
        {platforms.map((p) => (
          <button
            key={p.id}
            className="emu-card"
            onClick={() => navigate({ name: 'systems', systemId: p.id })}
          >
            <span className="emu-card-id">{p.short}</span>
            <strong>{p.name}</strong>
            <span className="emu-card-ext">
              {p.year} · {p.media}
              {p.identify ? ' · ID' : ''}
              {getEmuSystem(p.id) ? ' · browser' : ''}
              {p.emulate ? ' · retro-pi' : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
