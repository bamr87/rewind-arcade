import type { OverlayModel } from '../engine/types';

interface Props {
  model: OverlayModel;
  onAction: (action: string) => void;
}

/** Renders a game's declarative overlay (menu / win / lose / pause / info). */
export function Overlay({ model, onAction }: Props) {
  return (
    <div className="overlay">
      <div className={`panel panel--${model.variant ?? 'info'}`}>
        {model.kicker && <div className="panel-kicker">{model.kicker}</div>}
        <h2 className={model.variant === 'menu' ? 'panel-title panel-title--brand' : 'panel-title'}>
          {model.title}
        </h2>
        {model.subtitle && <p className="panel-sub">{model.subtitle}</p>}

        {model.bullets && (
          <ul className="panel-bullets">
            {model.bullets.map((b, i) => (
              <li key={i}>
                <i>{b.icon}</i>
                <span>{b.text}</span>
              </li>
            ))}
          </ul>
        )}

        {model.rows && (
          <div className="panel-rows">
            {model.rows.map((r, i) => (
              <div key={i} className={r.highlight ? 'panel-row hi' : 'panel-row'}>
                <span>{r.label}</span>
                <b>{r.value}</b>
              </div>
            ))}
          </div>
        )}

        {model.bigStat && (
          <div className="panel-big">
            <span>{model.bigStat.label}</span>
            <b>{model.bigStat.value}</b>
            {model.bigStat.note && <em className="panel-note">{model.bigStat.note}</em>}
          </div>
        )}

        <div className="panel-buttons">
          {model.buttons.map((b) => (
            <button
              key={b.action}
              className={`btn ${b.primary ? 'btn--primary' : b.ghost ? 'btn--ghost' : ''}`}
              onClick={() => onAction(b.action)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
