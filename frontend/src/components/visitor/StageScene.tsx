/**
 * Beranda's hero: the SUMMABA stage, drawn in the sticker style (flat fills, ink outlines). The top stays plain ceiling
 * for the greeting. Spotlights sway, the bunting flutters, two notes float, and one seat in the audience is yours.
 * Decorative; every motion stops under reduced motion.
 */
const INK = '#231f20'
const SEATS = ['#8b2c6a', '#0e7c7b', '#f26f22', '#2d4c8f', '#8a5a2b', '#0e7c7b', '#8b2c6a', '#2d4c8f']
const FLAGS = ['#f26f22', '#fedc01', '#fff6e6']
const SPARKLES = [
  [22, 140],
  [368, 134],
  [44, 226],
  [346, 232],
]

/** A point on the bunting's curve, t from 0 to 1. */
function bunting(t: number): [number, number] {
  const u = 1 - t
  return [-10 * u * u + 390 * 2 * u * t + 400 * t * t, 100 * u * u + 140 * 2 * u * t + 100 * t * t]
}

/** A seat seen from behind: its back, rounded on top. */
function Seat({ x, y, w, h, fill }: { x: number; y: number; w: number; h: number; fill: string }) {
  const r = w * 0.32
  return (
    <path
      d={`M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`}
      fill={fill}
      stroke={INK}
      strokeWidth="3"
      strokeLinejoin="round"
    />
  )
}

export function StageScene({ className }: { className?: string }) {
  const flags = Array.from({ length: 11 }, (_, i) => bunting((i + 1) / 12))
  const scallops = Array(10).fill('q-13.1 15 -26.2 0').join(' ')
  const line = { stroke: INK, strokeWidth: 3, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 390 376" preserveAspectRatio="xMidYMax slice" className={className} aria-hidden focusable="false">
      <defs>
        <pattern id="scene-dots" width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="9" cy="9" r="1.6" fill="#fff6e6" fillOpacity=".13" />
        </pattern>
        <radialGradient id="scene-glow" cx="50%" cy="62%" r="60%">
          <stop offset="0" stopColor="#0f8a3d" />
          <stop offset="1" stopColor="#006426" />
        </radialGradient>
        <linearGradient id="scene-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbfaf7" stopOpacity="0" />
          <stop offset="1" stopColor="#fbfaf7" />
        </linearGradient>
      </defs>

      <rect width="390" height="376" fill="url(#scene-glow)" />
      <rect width="390" height="280" fill="url(#scene-dots)" />
      {SPARKLES.map(([x, y], i) => (
        <path
          key={i}
          className="scene-twinkle"
          style={{ animationDelay: `${-i * 0.6}s` }}
          d={`M${x} ${y - 7}L${x + 2} ${y - 2}L${x + 7} ${y}L${x + 2} ${y + 2}L${x} ${y + 7}L${x - 2} ${y + 2}L${x - 7} ${y}L${x - 2} ${y - 2}Z`}
          fill="#fff6e6"
        />
      ))}

      <g transform="translate(0 56)">
        {/* spotlights from the ceiling */}
        <g opacity=".2">
          <polygon className="scene-beam" points="34,-66 74,-66 214,214 132,214" fill="#fedc01" />
          <polygon className="scene-beam" points="316,-66 356,-66 258,214 176,214" fill="#fedc01" />
        </g>

        {/* the stage: proscenium, curtains, the valance with the mall's name, and a microphone in the light */}
        <rect x="70" y="88" width="250" height="120" rx="8" fill="#0b3d1f" {...line} />
        <ellipse cx="195" cy="208" rx="70" ry="10" fill="#fedc01" opacity=".5" />
        <path d="M70 92H140Q128 150 112 208H70Z" fill="#f26f22" {...line} />
        <path d="M88 96Q86 150 82 206M108 96Q104 150 96 206" fill="none" stroke="#c9520f" strokeWidth="3" strokeLinecap="round" />
        <path d="M320 92H250Q262 150 278 208H320Z" fill="#f26f22" {...line} />
        <path d="M302 96Q304 150 308 206M282 96Q286 150 294 206" fill="none" stroke="#c9520f" strokeWidth="3" strokeLinecap="round" />
        <path d={`M64 78H326V98 ${scallops}Z`} fill="#f9a61b" {...line} />
        <text x="195" y="94" textAnchor="middle" fontFamily="Anton, Impact, sans-serif" fontSize="13" letterSpacing="3.5" fill={INK}>
          SUMMABA
        </text>
        <path d="M195 206V164" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
        <ellipse cx="195" cy="207" rx="12" ry="3.5" fill={INK} />
        <rect x="188" y="146" width="14" height="22" rx="7" fill="#fff6e6" {...line} />
        <g className="scene-note">
          <path d="M232 150V128L250 124V144" fill="none" {...line} />
          <ellipse cx="228" cy="151" rx="6" ry="4.5" fill="#fff6e6" {...line} />
          <ellipse cx="246" cy="145" rx="6" ry="4.5" fill="#fff6e6" {...line} />
        </g>
        <g className="scene-note [animation-delay:-1.8s]">
          <path d="M150 140V120Q158 124 160 132" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <ellipse cx="146" cy="141" rx="6" ry="4.5" fill="#fedc01" {...line} />
        </g>
        <path d="M54 208H336L350 232H40Z" fill="#8a5a2b" {...line} />
        <path d="M100 214L92 228M160 214L157 228M230 214L233 228M290 214L298 228" stroke="#6e4520" strokeWidth="2.5" strokeLinecap="round" />
        <rect x="40" y="232" width="310" height="12" fill="#6e4520" {...line} />

        {/* the audience: two rows of seats, and the yellow one with a check is yours */}
        {SEATS.slice(0, 7).map((fill, i) => (
          <Seat key={`a${i}`} x={20 + i * 52} y={252} w={42} h={40} fill={fill} />
        ))}
        <g className="scene-mine">
          <Seat x={176} y={252} w={42} h={40} fill="#fedc01" />
          <path d="M188 273l6 6 12-13" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        {SEATS.map((fill, i) => (
          <Seat key={`b${i}`} x={-14 + i * 56} y={282} w={48} h={46} fill={fill} />
        ))}
      </g>

      {/* bunting across the atrium, in front of the stage */}
      <path d="M-10 100Q195 140 400 100" fill="none" stroke="#fff6e6" strokeOpacity=".7" strokeWidth="2" />
      {flags.map(([x, y], i) => (
        <polygon
          key={i}
          className="scene-flag"
          style={{ animationDelay: `${-i * 0.37}s` }}
          points={`${x - 9},${y} ${x + 9},${y} ${x},${y + 19}`}
          fill={FLAGS[i % FLAGS.length]}
          stroke={INK}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      ))}

      <rect y="334" width="390" height="42" fill="url(#scene-fade)" />
    </svg>
  )
}
