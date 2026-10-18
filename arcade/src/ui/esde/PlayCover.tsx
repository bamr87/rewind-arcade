export function PlayCover({ id, title, accent }: { id: string; title: string; accent: string }) {
  return (
    <svg className="esde-cover-svg" viewBox="0 0 240 320" aria-hidden>
      <rect width="240" height="320" rx="8" fill="#0b1020" />
      {id === 'pong' && <Pong />}
      {id === 'jezzball' && <Jezz accent={accent} />}
      {id === 'breakout' && <Bricks />}
      {id === 'snake' && <Snake />}
      {id === 'asteroids' && <Rocks />}
      {id === 'minesweeper' && <Mines />}
      {id === 'skifree' && <Ski />}
      {id === 'pellet-panic' && <Pellets />}
      {id === 'silo-sentinel' && <Silos />}
      {id === 'touchdown' && <Lander />}
      {!['pong', 'jezzball', 'breakout', 'snake', 'asteroids', 'minesweeper', 'skifree', 'pellet-panic', 'silo-sentinel', 'touchdown'].includes(id) && (
        <rect width="240" height="320" fill={accent} />
      )}
      <rect x="0" y="248" width="240" height="72" fill="#000" opacity="0.55" />
      <text x="16" y="280" fill="#fff" fontSize="18" fontWeight="800">{title}</text>
      <text x="16" y="300" fill={accent} fontSize="11" letterSpacing="1.4">REWIND ARCADE</text>
    </svg>
  );
}

function Pong() {
  return (
    <g>
      <rect width="240" height="320" fill="#050505" />
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x="118" y={16 + i * 22} width="4" height="12" fill="#e2e8f0" opacity="0.7" />
      ))}
      <rect x="24" y="130" width="10" height="52" fill="#e2e8f0" />
      <rect x="206" y="88" width="10" height="52" fill="#e2e8f0" />
      <rect x="150" y="150" width="12" height="12" fill="#e2e8f0" />
    </g>
  );
}

function Jezz({ accent }: { accent: string }) {
  return (
    <g>
      <rect width="240" height="320" fill="#0a1628" />
      <rect x="20" y="24" width="200" height="210" fill="none" stroke={accent} strokeWidth="3" />
      <line x1="20" y1="120" x2="140" y2="120" stroke={accent} strokeWidth="4" />
      <line x1="140" y1="24" x2="140" y2="120" stroke={accent} strokeWidth="4" />
      <circle cx="70" cy="70" r="10" fill="#7dd3fc" />
      <circle cx="176" cy="168" r="10" fill="#38bdf8" />
      <circle cx="92" cy="188" r="10" fill="#bae6fd" />
    </g>
  );
}

function Bricks() {
  const colors = ['#fb7185', '#fbbf24', '#34d399', '#38bdf8', '#a78bfa'];
  return (
    <g>
      <rect width="240" height="320" fill="#140a12" />
      {colors.flatMap((c, row) =>
        Array.from({ length: 6 }, (_, col) => (
          <rect key={`${row}-${col}`} x={16 + col * 36} y={28 + row * 22} width="32" height="18" rx="2" fill={c} />
        )),
      )}
      <rect x="88" y="210" width="64" height="10" rx="2" fill="#e2e8f0" />
      <circle cx="120" cy="190" r="7" fill="#fff" />
    </g>
  );
}

function Snake() {
  return (
    <g>
      <rect width="240" height="320" fill="#052e16" />
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={48 + i * 16} y={120} width="14" height="14" fill="#4ade80" />
      ))}
      <rect x="176" y="120" width="14" height="14" fill="#86efac" />
      <circle cx="72" cy="72" r="9" fill="#ef4444" />
    </g>
  );
}

function Rocks() {
  return (
    <g>
      <rect width="240" height="320" fill="#020617" />
      <polygon points="120,70 132,92 118,108 96,96 102,74" fill="none" stroke="#cbd5e1" strokeWidth="2" />
      <polygon points="60,150 88,140 110,168 78,190 50,172" fill="none" stroke="#94a3b8" strokeWidth="2" />
      <polygon points="160,160 198,148 210,186 176,210 150,188" fill="none" stroke="#e2e8f0" strokeWidth="2" />
      <polygon points="118,200 128,214 112,226 104,210" fill="none" stroke="#38bdf8" strokeWidth="2" />
    </g>
  );
}

function Ski() {
  return (
    <g>
      <rect width="240" height="320" fill="#e0f2fe" />
      <rect width="240" height="72" fill="#7dd3fc" />
      <polyline points="108,40 112,90 118,150 122,210" fill="none" stroke="#94a3b8" strokeWidth="1.5" />
      <polyline points="116,40 120,90 124,150 128,210" fill="none" stroke="#94a3b8" strokeWidth="1.5" />
      <polygon points="48,168 68,112 88,168" fill="#166534" />
      <rect x="64" y="168" width="8" height="12" fill="#7c4a2a" />
      <polygon points="168,150 192,86 216,150" fill="#14532d" />
      <rect x="188" y="150" width="8" height="14" fill="#7c4a2a" />
      <polygon points="20,210 36,168 52,210" fill="#15803d" />
      <rect x="32" y="210" width="7" height="10" fill="#7c4a2a" />
      <ellipse cx="120" cy="58" rx="7" ry="9" fill="#e11d48" />
      <circle cx="120" cy="42" r="6" fill="#fde68a" />
      <path d="M114,42 A7,7 0 0 1 126,42" fill="#0f172a" />
      <line x1="108" y1="40" x2="112" y2="72" stroke="#1e3a8a" strokeWidth="2" />
      <line x1="128" y1="40" x2="132" y2="72" stroke="#1e3a8a" strokeWidth="2" />
      <ellipse cx="120" cy="188" rx="18" ry="22" fill="#f8fafc" stroke="#64748b" />
      <circle cx="120" cy="160" r="12" fill="#f8fafc" stroke="#64748b" />
      <circle cx="116" cy="158" r="2" fill="#0f172a" />
      <circle cx="125" cy="158" r="2" fill="#0f172a" />
    </g>
  );
}

function Pellets() {
  const walls = [
    [16, 16, 208, 8], [16, 16, 8, 216], [216, 16, 8, 216], [16, 224, 208, 8],
    [48, 48, 48, 24], [144, 48, 48, 24], [48, 104, 24, 72], [168, 104, 24, 72],
    [96, 112, 48, 40], [48, 192, 144, 8],
  ];
  return (
    <g>
      <rect width="240" height="320" fill="#03040b" />
      {walls.map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} rx="3" fill="#0b1033" stroke="#6366f1" strokeWidth="2" />
      ))}
      <line x1="108" y1="112" x2="132" y2="112" stroke="#f9a8d4" strokeWidth="3" />
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={50 + i * 16} y="86" width="4" height="4" fill="#fde68a" />
      ))}
      {Array.from({ length: 5 }, (_, i) => (
        <rect key={i} x="32" y={98 + i * 16} width="4" height="4" fill="#fde68a" />
      ))}
      <circle cx="34" cy="36" r="6" fill="#fde68a" />
      <circle cx="206" cy="36" r="6" fill="#fde68a" />
      <path d="M120 172 L136 163 A 18 18 0 1 0 136 181 Z" fill="#facc15" />
      <circle cx="117" cy="164" r="2" fill="#1c1917" />
      <path d="M150 74 q4 4 10 9 q2 2 0 4 l-6 6 q-4 3 -8 0 l-6 -6 q-2 -2 0 -4 q6 -5 10 -9 z" fill="#f43f5e" />
      <path d="M182 146 q4 4 10 9 q2 2 0 4 l-6 6 q-4 3 -8 0 l-6 -6 q-2 -2 0 -4 q6 -5 10 -9 z" fill="#22d3ee" />
      <path d="M56 152 q4 4 10 9 q2 2 0 4 l-6 6 q-4 3 -8 0 l-6 -6 q-2 -2 0 -4 q6 -5 10 -9 z" fill="#1d4ed8" />
    </g>
  );
}

function Silos() {
  return (
    <g>
      <rect width="240" height="320" fill="#04030f" />
      <line x1="30" y1="0" x2="76" y2="200" stroke="#f87171" strokeWidth="1.5" opacity="0.75" />
      <line x1="150" y1="0" x2="120" y2="150" stroke="#f87171" strokeWidth="1.5" opacity="0.75" />
      <line x1="220" y1="0" x2="190" y2="120" stroke="#f87171" strokeWidth="1.5" opacity="0.75" />
      <line x1="120" y1="226" x2="190" y2="120" stroke="#86efac" strokeWidth="1.5" />
      <circle cx="120" cy="150" r="26" fill="#fb923c" opacity="0.9" />
      <circle cx="120" cy="150" r="15" fill="#fde047" />
      <circle cx="190" cy="120" r="12" fill="#fde047" opacity="0.9" />
      <rect x="0" y="228" width="240" height="20" fill="#3f2a14" />
      <path d="M8,228 L16,218 L32,218 L40,228 Z M104,228 L112,218 L128,218 L136,228 Z M200,228 L208,218 L224,218 L232,228 Z" fill="#a16207" />
      {[52, 74, 152, 174].map((x) => (
        <g key={x} fill="#22d3ee">
          <rect x={x} y="220" width="6" height="8" />
          <rect x={x + 7} y="214" width="6" height="14" />
          <rect x={x + 14} y="218" width="6" height="10" />
        </g>
      ))}
    </g>
  );
}

function Lander() {
  return (
    <g>
      <rect width="240" height="320" fill="#03040a" />
      {[[30, 30], [70, 60], [190, 24], [210, 90], [120, 40], [40, 110], [160, 120]].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="2" height="2" fill="#64748b" />
      ))}
      <path d="M0,248 L0,200 L26,182 L44,206 L62,190 L104,190 L122,160 L146,178 L166,214 L196,214 L214,176 L240,196 L240,248 Z" fill="#0b1220" stroke="#94a3b8" strokeWidth="2" />
      <line x1="62" y1="190" x2="104" y2="190" stroke="#fbbf24" strokeWidth="4" />
      <line x1="166" y1="214" x2="196" y2="214" stroke="#fbbf24" strokeWidth="4" />
      <text x="74" y="206" fill="#fbbf24" fontSize="11" fontWeight="800">×2</text>
      <text x="172" y="230" fill="#fbbf24" fontSize="11" fontWeight="800">×4</text>
      <g transform="translate(120 104) rotate(-14)" fill="none" stroke="#e2e8f0" strokeWidth="2">
        <path d="M-10,-6 L-13,-15 L-6,-22 L6,-22 L13,-15 L10,-6 Z" />
        <rect x="-13" y="-6" width="26" height="12" />
        <path d="M-9,6 L-18,18 M9,6 L18,18 M-22,18 L-14,18 M14,18 L22,18" />
        <path d="M-6,8 L0,30 L6,8" stroke="#fb923c" />
      </g>
    </g>
  );
}

function Mines() {
  return (
    <g>
      <rect width="240" height="320" fill="#1c1917" />
      {Array.from({ length: 6 }, (_, r) =>
        Array.from({ length: 6 }, (_, c) => {
          const mine = (r + c) % 4 === 0;
          return (
            <rect
              key={`${r}-${c}`}
              x={36 + c * 28}
              y={36 + r * 28}
              width="24"
              height="24"
              fill={mine ? '#44403c' : '#d6d3d1'}
              stroke="#0c0a09"
            />
          );
        }),
      )}
      <text x="92" y="92" fontSize="16" fontWeight="800" fill="#1d4ed8">2</text>
      <text x="148" y="148" fontSize="16" fontWeight="800" fill="#b91c1c">3</text>
    </g>
  );
}
