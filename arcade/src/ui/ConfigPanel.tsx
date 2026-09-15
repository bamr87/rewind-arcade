import type { ConfigField, GameConfig, GameManifest } from '../engine/types';

interface Props {
  manifest: GameManifest;
  config: GameConfig;
  onChange: (key: string, value: number | boolean | string) => void;
  onReset: () => void;
  onClose: () => void;
}

/**
 * A schema-driven settings drawer. It renders whatever config fields a game
 * declares in its manifest — no game-specific UI code lives here, so every new
 * game gets a full settings panel for free.
 */
export function ConfigPanel({ manifest, config, onChange, onReset, onClose }: Props) {
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" style={{ ['--accent' as string]: manifest.accent }}>
        <div className="drawer-head">
          <div>
            <div className="drawer-kicker">Settings</div>
            <h3>{manifest.title}</h3>
          </div>
          <button className="icon-btn" title="Close" onClick={onClose}>✕</button>
        </div>

        <p className="drawer-note">
          Changes apply immediately and restart the current game. Saved on this device.
        </p>

        <div className="drawer-fields">
          {manifest.config.map((field) => (
            <Field key={field.key} field={field} value={config[field.key]} onChange={onChange} />
          ))}
        </div>

        <div className="drawer-foot">
          <button className="btn btn--ghost" onClick={onReset}>Reset to defaults</button>
          <button className="btn btn--primary" onClick={onClose}>Done</button>
        </div>
      </aside>
    </>
  );
}

function Field({
  field, value, onChange,
}: {
  field: ConfigField;
  value: number | boolean | string;
  onChange: (key: string, value: number | boolean | string) => void;
}) {
  if (field.type === 'range') {
    const v = typeof value === 'number' ? value : field.default;
    return (
      <label className="field">
        <div className="field-top">
          <span className="field-label">{field.label}</span>
          <span className="field-value">{v}{field.unit ?? ''}</span>
        </div>
        <input
          type="range"
          min={field.min}
          max={field.max}
          step={field.step}
          value={v}
          onChange={(e) => onChange(field.key, Number(e.target.value))}
        />
        {field.help && <span className="field-help">{field.help}</span>}
      </label>
    );
  }

  if (field.type === 'toggle') {
    const v = typeof value === 'boolean' ? value : field.default;
    return (
      <label className="field field--row">
        <div>
          <span className="field-label">{field.label}</span>
          {field.help && <span className="field-help">{field.help}</span>}
        </div>
        <button
          type="button"
          className={`toggle${v ? ' on' : ''}`}
          role="switch"
          aria-checked={v}
          onClick={() => onChange(field.key, !v)}
        >
          <span className="toggle-knob" />
        </button>
      </label>
    );
  }

  // select
  const v = typeof value === 'string' ? value : field.default;
  return (
    <label className="field">
      <div className="field-top">
        <span className="field-label">{field.label}</span>
      </div>
      <select value={v} onChange={(e) => onChange(field.key, e.target.value)}>
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {field.help && <span className="field-help">{field.help}</span>}
    </label>
  );
}
