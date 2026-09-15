import { useEffect, useState } from 'react';
import { coverCandidates, systemIcon } from '../../esde/covers';
import type { EsGame } from '../../esde/library';
import { boxHue } from '../../esde/theme';
import { PlayCover } from './PlayCover';
import { SystemArt } from './SystemArt';

export function CoverArt({
  game,
  systemId,
  systemShort,
  hue,
  media,
  size,
}: {
  game: EsGame;
  systemId: string;
  systemShort: string;
  hue: string;
  media: string;
  size: 'row' | 'hero';
}) {
  if (game.kind === 'play' && game.playId) {
    return (
      <div className={`esde-cover esde-cover--${size}`}>
        <PlayCover id={game.playId} title={game.title} accent={game.accent ?? hue} />
      </div>
    );
  }
  if (game.kind === 'load') {
    return (
      <div className={`esde-cover esde-cover--${size}`}>
        <SystemArt id={systemId} short={systemShort} hue={hue} media={media} icon={systemIcon(systemId)} />
      </div>
    );
  }
  if (size === 'row') {
    return (
      <div className="esde-cover esde-cover--row" style={{ background: boxHue(game.title) }}>
        <span className="esde-cover-fallback">{game.title.slice(0, 1)}</span>
      </div>
    );
  }
  return <RemoteCover game={game} size={size} hue={hue} />;
}

function RemoteCover({ game, size, hue }: { game: EsGame; size: 'row' | 'hero'; hue: string }) {
  const urls = coverCandidates(game.systemId, game.title, game.nointro, game.region, game.boxArt);
  const [i, setI] = useState(0);
  useEffect(() => { setI(0); }, [game.key]);
  const src = urls[i];
  return (
    <div
      className={`esde-cover esde-cover--${size}`}
      style={{ background: boxHue(game.title) }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading={size === 'row' ? 'lazy' : 'eager'}
          onError={() => setI((n) => n + 1)}
        />
      ) : (
        <span className="esde-cover-fallback" style={{ color: hue }}>{game.title.slice(0, 1)}</span>
      )}
    </div>
  );
}
