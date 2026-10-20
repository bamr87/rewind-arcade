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
      {id === 'gridlock' && <Cycles />}
      {id === 'crate-shift' && <Crates />}
      {id === 'flak-shack' && <Flak />}
      {id === 'rockfall' && <Cave />}
      {id === 'lode-digger' && <Lode />}
      {id === 'blockfall' && <Well />}
      {id === 'rogues-hour' && <Dungeon />}
      {!['pong', 'jezzball', 'breakout', 'snake', 'asteroids', 'minesweeper', 'skifree', 'pellet-panic', 'silo-sentinel', 'touchdown', 'gridlock', 'crate-shift', 'flak-shack', 'rockfall', 'lode-digger', 'blockfall', 'rogues-hour'].includes(id) && (
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

function Cycles() {
  return (
    <g>
      <rect width="240" height="320" fill="#020617" />
      {Array.from({ length: 13 }, (_, i) => (
        <line key={`v${i}`} x1={i * 20} y1="0" x2={i * 20} y2="248" stroke="#38bdf8" strokeOpacity="0.08" />
      ))}
      {Array.from({ length: 13 }, (_, i) => (
        <line key={`h${i}`} x1="0" y1={i * 20} x2="240" y2={i * 20} stroke="#38bdf8" strokeOpacity="0.08" />
      ))}
      <polyline points="20,200 20,60 120,60 120,90 104,90" fill="none" stroke="#22d3ee" strokeWidth="6" strokeLinejoin="miter" />
      <polyline points="80,150 80,170 150,170" fill="none" stroke="#22d3ee" strokeWidth="6" />
      <polyline points="220,40 220,130 170,130 170,210 60,210" fill="none" stroke="#fb923c" strokeWidth="6" />
      <circle cx="150" cy="170" r="7" fill="#f8fafc" stroke="#22d3ee" strokeWidth="3" />
      <circle cx="60" cy="210" r="7" fill="#f8fafc" stroke="#fb923c" strokeWidth="3" />
    </g>
  );
}

function Crates() {
  // A small warehouse: walls ring the floor, two crates are home, one is still out.
  const wall = [
    [24, 24, 192, 24], [24, 24, 24, 200], [192, 24, 24, 200], [24, 200, 192, 24], [96, 96, 24, 24], [144, 144, 24, 24],
  ];
  const crate = (x: number, y: number, home: boolean, key: string) => (
    <g key={key}>
      <rect x={x + 3} y={y + 3} width="18" height="18" fill={home ? '#b45309' : '#8b5a2b'} stroke={home ? '#fde68a' : '#5b3a1a'} strokeWidth="2" />
      <path d={`M${x + 3} ${y + 3} L${x + 21} ${y + 21} M${x + 21} ${y + 3} L${x + 3} ${y + 21}`} stroke={home ? '#fde68a' : '#5b3a1a'} strokeWidth="2" />
    </g>
  );
  return (
    <g>
      <rect width="240" height="320" fill="#120e0a" />
      <rect x="48" y="48" width="144" height="152" fill="#211c16" />
      {wall.map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill="#3a3128" stroke="#4a3f33" strokeWidth="2" />
      ))}
      <circle cx="156" cy="84" r="6" fill="none" stroke="#fbbf24" strokeWidth="2.5" />
      {crate(48, 168, true, 'a')}
      {crate(168, 48, true, 'b')}
      {crate(120, 120, false, 'c')}
      <circle cx="132" cy="156" r="8" fill="#38bdf8" />
      <circle cx="132" cy="145" r="5" fill="#fde68a" />
    </g>
  );
}

function Flak() {
  // CGA palette 1 only: black, cyan, magenta, white.
  return (
    <g>
      <rect width="240" height="320" fill="#000000" />
      <rect x="64" y="52" width="40" height="14" fill="#ff55ff" />
      <rect x="44" y="57" width="20" height="4" fill="#ff55ff" />
      <rect x="92" y="55" width="8" height="6" fill="#55ffff" />
      <rect x="58" y="45" width="52" height="3" fill="#ffffff" />
      <rect x="70" y="68" width="28" height="3" fill="#ffffff" />
      <rect x="150" y="96" width="40" height="14" fill="#ff55ff" />
      <rect x="190" y="101" width="20" height="4" fill="#ff55ff" />
      <rect x="140" y="89" width="52" height="3" fill="#ffffff" />
      <path d="M150 150 A 16 16 0 0 1 182 150 Z" fill="#55ffff" />
      <line x1="152" y1="150" x2="164" y2="166" stroke="#ffffff" strokeWidth="1.5" />
      <line x1="180" y1="150" x2="168" y2="166" stroke="#ffffff" strokeWidth="1.5" />
      <rect x="162" y="166" width="8" height="12" fill="#55ffff" />
      <rect x="58" y="170" width="6" height="10" fill="#55ffff" />
      <rect x="0" y="232" width="240" height="3" fill="#ffffff" />
      <rect x="28" y="220" width="8" height="12" fill="#55ffff" />
      <rect x="40" y="220" width="8" height="12" fill="#55ffff" />
      <rect x="196" y="220" width="8" height="12" fill="#55ffff" />
      <line x1="120" y1="200" x2="146" y2="168" stroke="#ffffff" strokeWidth="6" />
      <path d="M104 202 A 16 16 0 0 1 136 202 Z" fill="#ff55ff" />
      <rect x="92" y="202" width="56" height="30" fill="#55ffff" />
      <rect x="112" y="214" width="16" height="18" fill="#000000" />
      <rect x="148" y="160" width="4" height="4" fill="#ffffff" />
      <rect x="156" y="150" width="4" height="4" fill="#ffffff" />
    </g>
  );
}

function Cave() {
  // 7 × 8 tiles of 32: d = dirt, w = steel, b = boulder, g = gem, . = dug out, p = digger, e = exit.
  const rows = ['wwwwwww', 'wdbdgdw', 'wd.bddw', 'wg.ddbw', 'wd..gdw', 'wbdp.dw', 'wddbgew', 'wwwwwww'];
  return (
    <g>
      <rect width="240" height="320" fill="#0c0a09" />
      {rows.flatMap((row, y) =>
        row.split('').map((t, x) => {
          const px = 8 + x * 32;
          const py = 4 + y * 32;
          const key = `${x}-${y}`;
          if (t === 'd') return <rect key={key} x={px} y={py} width="32" height="32" fill="#7c2d12" />;
          if (t === 'w') return <rect key={key} x={px} y={py} width="32" height="32" fill="#334155" stroke="#64748b" />;
          if (t === 'b') return <circle key={key} cx={px + 16} cy={py + 16} r="14" fill="#a8a29e" stroke="#78716c" strokeWidth="3" />;
          if (t === 'g') return <polygon key={key} points={`${px + 16},${py + 3} ${px + 29},${py + 16} ${px + 16},${py + 29} ${px + 3},${py + 16}`} fill="#22d3ee" stroke="#cffafe" strokeWidth="1.5" />;
          if (t === 'e') return <rect key={key} x={px + 6} y={py + 4} width="20" height="28" fill="#facc15" stroke="#fef9c3" strokeWidth="2" />;
          if (t === 'p')
            return (
              <g key={key}>
                <rect x={px + 10} y={py + 15} width="12" height="10" fill="#2563eb" />
                <circle cx={px + 16} cy={py + 11} r="5" fill="#fcd9b6" />
                <path d={`M${px + 9.5},${py + 9} A6.5,6.5 0 0 1 ${px + 22.5},${py + 9} Z`} fill="#facc15" />
                <rect x={px + 10} y={py + 25} width="4" height="6" fill="#1e293b" />
                <rect x={px + 18} y={py + 25} width="4" height="6" fill="#1e293b" />
              </g>
            );
          return null;
        }),
      )}
    </g>
  );
}

function Lode() {
  const brick = (x: number, y: number, key: string) => (
    <g key={key}>
      <rect x={x} y={y} width="24" height="16" fill="#9a3412" />
      <rect x={x} y={y + 7} width="24" height="2" fill="#431407" />
      <rect x={x + 11} y={y} width="2" height="7" fill="#431407" />
    </g>
  );
  const rows = [
    { y: 88, from: 0, to: 10, skip: [6] },
    { y: 168, from: 0, to: 10, skip: [2] },
    { y: 232, from: 0, to: 10, skip: [] as number[] },
  ];
  return (
    <g>
      <rect width="240" height="320" fill="#06060f" />
      {rows.flatMap((r) =>
        Array.from({ length: r.to - r.from }, (_, i) => r.from + i)
          .filter((i) => !r.skip.includes(i))
          .map((i) => brick(i * 24, r.y, `${r.y}-${i}`)),
      )}
      {/* The dug hole, half refilled, with its beat outline. */}
      <rect x="48" y="168" width="24" height="16" fill="#020205" />
      <rect x="48" y="176" width="24" height="8" fill="#9a3412" />
      <rect x="49" y="169" width="22" height="14" fill="none" stroke="#fde047" strokeWidth="2" />
      {[
        [150, 40, 88],
        [150, 104, 168],
        [30, 184, 232],
      ].map(([x, y1, y2], i) => (
        <g key={i} fill="#cbd5e1">
          <rect x={x} y={y1} width="3" height={y2 - y1} />
          <rect x={x + 15} y={y1} width="3" height={y2 - y1} />
          {Array.from({ length: Math.floor((y2 - y1) / 8) }, (_, r) => (
            <rect key={r} x={x} y={y1 + 4 + r * 8} width="18" height="2" />
          ))}
        </g>
      ))}
      <rect x="96" y="140" width="72" height="3" fill="#94a3b8" />
      <path d="M100 84 L116 84 L113 76 L103 76 Z" fill="#facc15" />
      <path d="M190 164 L206 164 L203 156 L193 156 Z" fill="#facc15" />
      <path d="M120 228 L136 228 L133 220 L123 220 Z" fill="#facc15" />
      <g fill="#38bdf8" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round">
        <circle cx="88" cy="141" r="5" stroke="none" />
        <rect x="84" y="146" width="8" height="10" stroke="none" />
        <line x1="86" y1="156" x2="82" y2="166" />
        <line x1="90" y1="156" x2="95" y2="166" />
      </g>
      <g fill="#f43f5e" stroke="#f43f5e" strokeWidth="3" strokeLinecap="round">
        <circle cx="60" cy="172" r="5" stroke="none" />
        <rect x="56" y="176" width="8" height="5" stroke="none" />
      </g>
      <g fill="#f43f5e" stroke="#f43f5e" strokeWidth="3" strokeLinecap="round">
        <circle cx="180" cy="61" r="5" stroke="none" />
        <rect x="176" y="66" width="8" height="10" stroke="none" />
        <line x1="178" y1="76" x2="174" y2="86" />
        <line x1="182" y1="76" x2="187" y2="86" />
      </g>
    </g>
  );
}

function Well() {
  // A 10-wide well in 20 px cells: a stack with one gap, a T on its way down, and a phosphor burn.
  const colors: Record<string, string> = { i: '#22d3ee', j: '#3b82f6', l: '#f97316', o: '#facc15', s: '#22c55e', t: '#a855f7', z: '#ef4444' };
  const stack = ['..........', '.......o..', 'jj....zoo.', 'jss..zzllo', 'ssjjzzl.lo', 'iiiijjllll'];
  const cell = (x: number, y: number, c: string, key: string) => (
    <g key={key}>
      <rect x={x + 1} y={y + 1} width="18" height="18" fill={c} />
      <rect x={x + 1} y={y + 1} width="18" height="3" fill="#ffffff" opacity="0.35" />
    </g>
  );
  return (
    <g>
      <rect width="240" height="320" fill="#05070d" />
      <rect x="20" y="8" width="200" height="240" fill="#0b1020" stroke="#334155" strokeWidth="2" />
      <rect x="20" y="132" width="200" height="12" fill="#4ade80" opacity="0.22" />
      <rect x="20" y="137" width="200" height="2" fill="#bbf7d0" opacity="0.3" />
      <rect x="20" y="112" width="200" height="12" fill="#4ade80" opacity="0.1" />
      {stack.flatMap((row, r) =>
        row.split('').map((t, c) => (t === '.' ? null : cell(20 + c * 20, 128 + r * 20, colors[t], `${r}-${c}`))),
      )}
      {[[100, 48], [120, 48], [140, 48], [120, 28]].map(([x, y], i) => cell(x, y, colors.t, `t${i}`))}
      {[[100, 168], [120, 168], [140, 168], [120, 148]].map(([x, y], i) => (
        <rect key={`g${i}`} x={x + 3} y={y + 3} width="14" height="14" fill="none" stroke="#a855f7" strokeWidth="2" opacity="0.5" />
      ))}
    </g>
  );
}

function Dungeon() {
  // Two rooms joined by a corridor in glyph cells: the right room is lit, the left one remembered (dim).
  const rows = [
    '------',
    '|....|',
    '|.*..+####',
    '|....|   #',
    '------   #',
    '         #  ------',
    '         ###+..K.|',
    '            |.@..|',
    '            |..!>|',
    '            ------',
  ];
  const lit: Record<string, string> = { '@': '#fde047', K: '#86efac', '*': '#facc15', '!': '#f472b6', '>': '#f8fafc', '+': '#d97706', '.': '#57534e' };
  return (
    <g fontFamily="'Press Start 2P', monospace" fontSize="11" textAnchor="middle">
      <rect width="240" height="320" fill="#05040a" />
      <circle cx="186" cy="174" r="70" fill="#eab308" opacity="0.07" />
      {rows.flatMap((row, y) =>
        row.split('').map((ch, x) =>
          ch === ' ' ? null : (
            <text key={`${x}-${y}`} x={18 + x * 12} y={48 + y * 20} fill={x >= 12 ? (lit[ch] ?? '#a8a29e') : '#334155'}>
              {ch}
            </text>
          ),
        ),
      )}
      <text x="120" y="24" fill="#94a3b8" fontSize="8">DAILY · 9:59 LEFT</text>
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
