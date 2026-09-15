import { useEffect, useId, useState } from 'react';

type Kind = 'cabinet' | 'disc' | 'computer' | 'handheld' | 'cart';

const COVER_W = 66;
const COVER_H = 90;
const NO_SLOTS: string[][] = [];

function kindOf(id: string, media: string): Kind {
  if (id === 'recreations' || id === 'arcade') return 'cabinet';
  if (media === 'disc' || id === 'psx' || id === 'psp') return 'disc';
  if (media === 'floppy' || media === 'directory') return 'computer';
  if (
    id === 'gb' || id === 'gbc' || id === 'gba' || id === 'nds' || id === 'lynx'
    || id === 'gamegear' || id === 'ngp' || id === 'wonderswan' || id === 'psvita'
    || id === '3ds' || id === 'switch' || id === 'virtualboy'
  ) return 'handheld';
  return 'cart';
}

const loads = new Map<string, Promise<string | null>>();

/** The first URL in the list that loads as an image, or null. Shared across every card. */
function firstLoading(urls: string[]): Promise<string | null> {
  const key = urls.join('\n');
  let pending = loads.get(key);
  if (!pending) {
    pending = urls.reduce<Promise<string | null>>(
      (prev, url) => prev.then((hit) => hit ?? new Promise<string | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(url);
        img.onerror = () => resolve(null);
        img.src = url;
      })),
      Promise.resolve(null),
    );
    loads.set(key, pending);
  }
  return pending;
}

/** Images that actually load, in slot order, up to `max`, so missing art never leaves a gap. */
function useLoaded(slots: string[][], max: number): string[] {
  const key = slots.map((s) => s.join('\n')).join('\n\n');
  const [hits, setHits] = useState<string[]>([]);
  useEffect(() => {
    if (!slots.length) {
      setHits([]);
      return;
    }
    let live = true;
    void Promise.all(slots.map(firstLoading)).then((urls) => {
      if (live) setHits(urls.filter((u): u is string => u !== null).slice(0, max));
    });
    return () => {
      live = false;
    };
  }, [key, max]);
  return hits;
}

/**
 * A system card: libretro's render of the console on top and a fan of box covers from its
 * standout titles below. Without either, the hand-drawn console stands in.
 */
export function SystemArt({
  id,
  short,
  hue,
  media,
  icon,
  covers = NO_SLOTS,
}: {
  id: string;
  short: string;
  hue: string;
  media: string;
  icon?: string;
  /** Cover URL candidates, one list per title. */
  covers?: string[][];
}) {
  const uid = useId().replace(/:/g, '');
  const kind = kindOf(id, media);
  const [iconUrl] = useLoaded(icon ? [[icon]] : NO_SLOTS, 1);
  const boxes = useLoaded(covers, 4);
  const fan = boxes.length > 0;

  return (
    <svg className="esde-sys-art" viewBox="0 0 280 360" aria-hidden>
      <defs>
        <linearGradient id={`g-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={hue} stopOpacity="0.95" />
          <stop offset="100%" stopColor="#10141c" />
        </linearGradient>
        <radialGradient id={`s-${uid}`} cx="50%" cy="18%" r="70%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        {boxes.map((url, i) => (
          <clipPath key={url} id={`c-${uid}-${i}`}>
            <rect width={COVER_W} height={COVER_H} rx="5" />
          </clipPath>
        ))}
      </defs>
      <rect width="280" height="360" rx="18" fill={`url(#g-${uid})`} />
      <rect width="280" height="360" rx="18" fill={`url(#s-${uid})`} />
      {iconUrl ? (
        <image
          href={iconUrl}
          x={fan ? 60 : 40}
          y={fan ? 20 : 44}
          width={fan ? 160 : 200}
          height={fan ? 160 : 200}
          preserveAspectRatio="xMidYMid meet"
        />
      ) : (
        <g transform={fan ? 'translate(49 4) scale(0.65)' : undefined}>
          {kind === 'cabinet' && <Cabinet hue={hue} />}
          {kind === 'disc' && <Disc hue={hue} />}
          {kind === 'computer' && <Computer hue={hue} />}
          {kind === 'handheld' && <Handheld hue={hue} id={id} />}
          {kind === 'cart' && <Cart hue={hue} id={id} />}
        </g>
      )}
      {fan && <CoverFan urls={boxes} uid={uid} />}
      <text
        x="140"
        y="324"
        textAnchor="middle"
        fill="#fff"
        fontSize="22"
        fontWeight="800"
        letterSpacing="1.5"
        stroke="#000"
        strokeOpacity="0.35"
        strokeWidth="4"
        paintOrder="stroke"
      >
        {short}
      </text>
    </svg>
  );
}

function CoverFan({ urls, uid }: { urls: string[]; uid: string }) {
  const mid = (urls.length - 1) / 2;
  const cards = urls.map((url, i) => ({ url, i, off: i - mid }));
  // Outer covers first, so the middle of the fan sits on top.
  cards.sort((a, b) => Math.abs(b.off) - Math.abs(a.off));
  return (
    <g>
      {cards.map(({ url, i, off }) => (
        <g
          key={url}
          transform={`translate(${140 + off * 50 - COVER_W / 2} ${190 + Math.abs(off) * 7}) rotate(${off * 8} ${COVER_W / 2} ${COVER_H})`}
        >
          <rect x="3" y="5" width={COVER_W} height={COVER_H} rx="5" fill="#000" opacity="0.45" />
          <image
            href={url}
            width={COVER_W}
            height={COVER_H}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#c-${uid}-${i})`}
          />
          <rect width={COVER_W} height={COVER_H} rx="5" fill="none" stroke="#fff" strokeOpacity="0.25" />
        </g>
      ))}
    </g>
  );
}

function Cart({ hue, id }: { hue: string; id: string }) {
  const wide = id === 'snes' || id === 'n64' || id === 'megadrive' || id === 'sega32x';
  const w = wide ? 150 : 110;
  const x = (280 - w) / 2;
  return (
    <g>
      <rect x={x} y="72" width={w} height="168" rx="8" fill="#1a1f28" stroke={hue} strokeWidth="3" />
      <rect x={x + 10} y="86" width={w - 20} height="88" rx="4" fill="#0d1118" />
      <rect x={x + 18} y="98" width={w - 36} height="12" rx="2" fill={hue} opacity="0.7" />
      <rect x={x + 18} y="118" width={w - 52} height="8" rx="2" fill="#3a4454" />
      <rect x={x + 18} y="132" width={w - 64} height="8" rx="2" fill="#3a4454" />
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={x + 16 + i * ((w - 32) / 9)} y="214" width="6" height="16" rx="1" fill="#c9a227" />
      ))}
    </g>
  );
}

function Handheld({ hue, id }: { hue: string; id: string }) {
  const clamshell = id === 'nds' || id === '3ds';
  if (clamshell) {
    return (
      <g>
        <rect x="78" y="54" width="124" height="88" rx="10" fill="#1a1f28" stroke={hue} strokeWidth="3" />
        <rect x="90" y="66" width="100" height="64" rx="4" fill="#0b1220" />
        <rect x="78" y="152" width="124" height="108" rx="10" fill="#1a1f28" stroke={hue} strokeWidth="3" />
        <rect x="90" y="164" width="100" height="64" rx="4" fill="#111827" />
        <circle cx="108" cy="242" r="10" fill={hue} />
        <circle cx="172" cy="242" r="10" fill="#e11d48" />
      </g>
    );
  }
  return (
    <g>
      <rect x="86" y="64" width="108" height="196" rx="22" fill="#1a1f28" stroke={hue} strokeWidth="3" />
      <rect x="100" y="84" width="80" height="72" rx="6" fill="#0b1220" />
      <circle cx="118" cy="188" r="14" fill="#2a3344" />
      <circle cx="160" cy="210" r="9" fill={hue} />
      <circle cx="178" cy="192" r="9" fill="#e11d48" />
      <rect x="108" y="230" width="28" height="8" rx="4" fill="#3a4454" />
    </g>
  );
}

function Disc({ hue }: { hue: string }) {
  return (
    <g>
      <circle cx="140" cy="150" r="86" fill="#1a1f28" stroke={hue} strokeWidth="4" />
      <circle cx="140" cy="150" r="70" fill="#0d1118" />
      <circle cx="140" cy="150" r="48" fill={hue} opacity="0.35" />
      <circle cx="140" cy="150" r="16" fill="#1a1f28" stroke="#94a3b8" strokeWidth="2" />
      <circle cx="140" cy="150" r="6" fill="#0b1220" />
    </g>
  );
}

function Cabinet({ hue }: { hue: string }) {
  return (
    <g>
      <rect x="70" y="48" width="140" height="90" rx="8" fill="#1a1f28" stroke={hue} strokeWidth="3" />
      <rect x="86" y="62" width="108" height="62" rx="4" fill="#071018" />
      <rect x="78" y="148" width="124" height="28" rx="4" fill="#252b36" />
      <rect x="96" y="184" width="88" height="70" rx="6" fill="#1a1f28" />
      <circle cx="118" cy="218" r="8" fill={hue} />
      <circle cx="162" cy="218" r="8" fill="#e11d48" />
    </g>
  );
}

function Computer({ hue }: { hue: string }) {
  return (
    <g>
      <rect x="58" y="70" width="164" height="112" rx="8" fill="#1a1f28" stroke={hue} strokeWidth="3" />
      <rect x="72" y="84" width="136" height="84" rx="4" fill="#0b1220" />
      <rect x="78" y="198" width="124" height="36" rx="6" fill="#252b36" />
      <rect x="96" y="208" width="88" height="10" rx="2" fill="#3a4454" />
    </g>
  );
}
