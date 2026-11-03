// Summarevent stickers on the fun-isometric kit. kursi and tiket are drawn for Summarevent; coins, gift, notes, padlock,
// mailbox, search and camera are the kit's own icons, copied unchanged.
import { RISO, VIEWS, arc, ellipse, line, onFace, pill, poly, rect, ring, spark, star } from './fun'
import { SNAP, bounce, clasp, erase, glint, hop, impact, jolt, latch, press, shackle, slide, sparkle, springTurn, sway, twinkle, twist } from './motions'
import type { Icon, Layer, Motion, Palette, Shape, Vec } from './fun'

/** Summarecon colours: orange bodies, green for the dark parts, the brand yellow for stars, brand ink for outlines. */
export const SUMMA: Palette = {
  ...RISO,
  main: '#F26F22',
  deep: '#006426',
  tint: '#FFE3CC',
  gold: '#FEDC01',
  ok: '#0B7A35',
  hot: '#C2410C',
  grey: '#D8D2C4',
  paper: '#FBF8F1',
  ink: '#14241A',
}

const LINE = 5
const { tilt: FACE, extrude: EXT } = VIEWS.right

// a white sparkle riding a parent, popped by whatever motion it is given
const glow = (parent: string, p: Vec, r: number, m: Motion | ReadonlyArray<Motion>, extra: { ip?: number; op?: number } = {}): Layer => ({
  parent,
  a: p,
  p,
  m,
  ...extra,
  shapes: [{ d: spark(p[0], p[1], r), fill: 'white' }],
})

// a green check badge on a leaned face, popped in on the beat
const check = (parent: string, at: Vec, m: Motion | ReadonlyArray<Motion>): Layer => ({
  parent,
  a: at,
  p: at,
  m,
  shapes: [
    { d: ellipse(at[0], at[1], 40), fill: 'ok', depth: 0.7 },
    { d: line([at[0] - 18, at[1]], [at[0] - 5, at[1] + 13], [at[0] + 20, at[1] - 14]), line: 7 },
  ],
})

/* ---------------- kursi: a theatre seat that hops when it is picked ---------------- */

const SEAT_BADGE = onFace(FACE, [92, -146])

export const kursi: Icon = {
  name: 'kursi',
  frames: 150,
  line: LINE,
  extrude: EXT,
  still: 110,
  layers: [
    // placed so the seat, its badge and its hop sit in the middle of the square and never touch an edge
    { id: 'seat', a: [0, 140], p: [236, 392], m: hop, shapes: [] },
    {
      parent: 'seat',
      tilt: FACE,
      shapes: [
        // legs first, so the cushion covers their tops
        ...[-90, 68].map((x): Shape => ({ d: rect(x, 74, 22, 70, 6), fill: 'deep', depth: 0.6 })),
        // a tall theatre back with the row and number plate on top
        { d: rect(-88, -172, 176, 212, 48), fill: 'main', depth: 1 },
        { d: pill(-36, -154, 72, 30), fill: 'white', depth: 0.3 },
        { d: line([-14, -139], [14, -139]) },
        { d: line([-50, -94], [-50, 8]), line: 4 },
        { d: line([50, -94], [50, 8]), line: 4 },
        ...[-1, 1].map((s): Shape => ({ d: rect(s < 0 ? -136 : 100, -36, 36, 130, 14), fill: 'deep', depth: 1 })),
        { d: rect(-106, 18, 212, 64, 24), fill: 'main', depth: 1 },
        { d: line([-74, 50], [74, 50]) },
      ],
    },
    check('seat', SEAT_BADGE, [twinkle(52), twinkle(136, true)]),
    glow('seat', [-146, -146], 24, glint(50, 112)),
    glow('seat', [158, 30], 18, glint(58, 120)),
  ],
}

/* ---------------- tiket: an e-ticket with a QR, jolted in, checked off ---------------- */

// rounded corners, with a notch each side at the tear line
const TICKET =
  'M-86 -150H86A24 24 0 0 1 110 -126V-36A16 16 0 0 0 110 -4V126A24 24 0 0 1 86 150H-86A24 24 0 0 1 -110 126V-4A16 16 0 0 0 -110 -36V-126A24 24 0 0 1 -86 -150Z'
const finder = (x: number, y: number): ReadonlyArray<Shape> => [
  { d: rect(x, y, 40, 40, 8), fill: 'ink', line: false },
  { d: rect(x + 10, y + 10, 20, 20, 4), fill: 'white', line: false },
]
const TICKET_BADGE = onFace(FACE, [100, 132])

export const tiket: Icon = {
  name: 'tiket',
  frames: 180,
  line: LINE,
  extrude: EXT,
  still: 120,
  layers: [
    { id: 'tkt', p: [246, 258], m: jolt(), shapes: [] },
    {
      parent: 'tkt',
      tilt: FACE,
      shapes: [
        { d: TICKET, fill: 'white', depth: 1 },
        { d: poly([[-110, -150], [110, -150], [110, -84], [-110, -84]], [24, 24, 0, 0]), fill: 'main' },
        { d: pill(-84, -128, 92, 20), fill: 'white', line: false },
        { d: pill(-84, -104, 56, 12), fill: 'white', line: false },
        ...[-84, -56, -28, 0, 28, 56].map((x) => ({ d: line([x, -20], [x + 14, -20]), line: 4 })),
        ...finder(-58, 8),
        ...finder(18, 8),
        ...finder(-58, 82),
        { d: rect(18, 84, 16, 16, 3), fill: 'ink', line: false },
        { d: rect(42, 108, 16, 16, 3), fill: 'ink', line: false },
        { d: rect(18, 108, 16, 16, 3), fill: 'deep', line: false },
      ],
    },
    check('tkt', TICKET_BADGE, [twinkle(40), twinkle(150, true)]),
    glow('tkt', [-150, -146], 26, glint(38, 110)),
    glow('tkt', [150, -60], 18, glint(46, 118)),
  ],
}

/* ---------------- the kit's own icons ---------------- */

const COIN = (cx: number, cy: number) => ellipse(cx, cy, 112, 80)

export const coins: Icon = {
  name: 'coins',
  frames: 180,
  line: LINE,
  extrude: [-2, 18],
  layers: [
    { p: [252, 352], r: -10, shapes: [{ d: COIN(0, 0), fill: 'gold', depth: 1 }] },
    { p: [246, 318], r: -10, shapes: [{ d: COIN(0, 0), fill: 'gold', depth: 1 }] },
    {
      id: 'coin',
      p: [240, 278],
      r: -10,
      m: bounce,
      shapes: [{ d: COIN(0, 0), fill: 'gold', depth: 1 }, { d: ellipse(0, 0, 86, 58) }, { d: star(0, 2, 40, 0.46, 5, 4), fill: 'ink', line: false }],
    },
    glow('coin', [96, -66], 26, glint(2, 98)),
    glow('coin', [-104, -48], 26, glint(6, 122)),
    glow('coin', [-26, 70], 22, glint(12, 107)),
    glow('coin', [92, -70], 28, glint(65, 125)),
  ],
}

const BOW = 'M0 -80C-18 -126 -86 -136 -76 -98C-70 -80 -30 -80 0 -80ZM0 -80C18 -126 86 -136 76 -98C70 -80 30 -80 0 -80Z'

export const gift: Icon = {
  name: 'gift',
  frames: 180,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: 'box', p: [250, 306], m: impact([3, 12]), shapes: [] },
    {
      id: 'crate',
      parent: 'box',
      tilt: FACE,
      // the ribbon carries its own depth, so it wraps down the side
      shapes: [{ d: rect(-112, -40, 224, 136, 16), fill: 'tint', depth: 1 }, { d: rect(-22, -40, 44, 136), fill: 'gold', depth: 1 }],
    },
    {
      parent: 'crate',
      p: [0, -44],
      m: latch([0, 44]),
      shapes: [
        { d: BOW, fill: 'gold', depth: 0.5 },
        { d: rect(-130, -80, 260, 52, 16), fill: 'tint', depth: 0.8 },
        { d: rect(-24, -80, 48, 52), fill: 'gold', depth: 0.8 },
        { d: pill(-20, -96, 40, 30), fill: 'gold', depth: 0.5 },
      ],
    },
    // they swell as the lid lifts and finish after the seam, so at wraps them round the loop
    glow('box', [-128, -128], 24, { ...glint(0, 110), at: 140 }),
    glow('box', [122, -146], 30, { ...glint(0, 120), at: 146 }),
  ],
}

export const notes: Icon = {
  name: 'notes',
  frames: 180,
  still: 0,
  line: LINE,
  extrude: EXT,
  layers: [
    {
      id: 'pad',
      a: [0, 136],
      p: [250, 374],
      tilt: FACE,
      m: { ...sway, k: 0.8 },
      shapes: [
        { d: rect(-118, -136, 236, 272, 24), fill: 'main', depth: 1 },
        { d: rect(-96, -108, 192, 222, 10), fill: 'white', depth: 0.2 },
        { d: pill(-52, -154, 104, 42), fill: 'grey', depth: 0.6 },
        { d: pill(-20, -140, 40, 12), fill: 'ink', line: false },
        ...[0, 1, 2, 3].map((i): Shape => ({ d: line([-68, -66 + i * 40], [i === 3 ? 10 : 68, -66 + i * 40]), trim: erase(22 - i * 5, 80 + i * 5) })),
      ],
    },
  ],
}

const KEYHOLE = ellipse(0, -4, 17) + poly([[-8, 6], [8, 6], [13, 42], [-13, 42]], 3)
const SHACKLE = 'M-74 -40L-74 -122A74 74 0 0 1 74 -122L74 -40L42 -40L42 -122A42 42 0 0 0 -42 -122L-42 -40Z'

export const padlock: Icon = {
  name: 'padlock',
  frames: 130,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: 'lock', p: [256, 300], m: clasp, shapes: [] },
    { parent: 'body', a: [-58, -62], p: [-58, -62], m: shackle, shapes: [{ d: SHACKLE, fill: 'grey', depth: 0.7 }] },
    {
      id: 'body',
      parent: 'lock',
      tilt: FACE,
      shapes: [
        { d: rect(-112, -80, 224, 176, 24), fill: 'ok', depth: 1 },
        { d: ellipse(0, 8, 36, 50), fill: 'white', depth: 0.25 },
        { d: KEYHOLE, fill: 'ink', line: false },
      ],
    },
    glow('lock', [-142, -70], 30, twinkle(0, true), { op: 30 }),
    glow('lock', [-142, -70], 30, twinkle(75), { ip: 75 }),
  ],
}

const BOX: Vec = FACE

export const mailbox: Icon = {
  name: 'mailbox',
  frames: 180,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: 'mail', a: [0, 150], p: [250, 392], m: jolt([-4, 10]), shapes: [] },
    { parent: 'mail', tilt: BOX, shapes: [{ d: rect(-18, 40, 36, 150, 6), fill: 'grey', depth: 0.8 }] },
    {
      parent: 'box',
      a: [70, 0],
      p: [70, 0],
      m: slide([56, 0], 24, 72, 40),
      shapes: [{ d: rect(30, -40, 96, 62, 6), fill: 'white', depth: 0.25 }, { d: line([44, -24], [78, -6], [112, -24]) }],
    },
    {
      id: 'box',
      parent: 'mail',
      tilt: BOX,
      shapes: [
        { d: poly([[-136, -96], [136, -96], [136, 56], [-136, 56]], [72, 72, 10, 10]), fill: 'deep', depth: 1 },
        { d: poly([[96, -96], [136, -96], [136, 56], [96, 56]], [0, 72, 10, 0]), fill: 'main', depth: 1 },
      ],
    },
    {
      parent: 'box',
      a: [-60, -10],
      p: [-60, -10],
      r: 84,
      m: { r: [...springTurn(-84, 18), [128, -84, SNAP], [168, 0]] },
      shapes: [{ d: rect(-68, -130, 16, 124, 4), fill: 'grey', depth: 0.5 }, { d: rect(-68, -130, 70, 44, 6), fill: 'hot', depth: 0.5 }],
    },
  ],
}

export const search: Icon = {
  name: 'search',
  frames: 180,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: 'lens', p: [222, 226], m: twist, shapes: [] },
    {
      parent: 'lens',
      tilt: [-20, 28],
      shapes: [
        { d: poly([[54, 90], [90, 54], [178, 142], [142, 178]], [0, 0, 24, 24]), fill: 'hot', depth: 1 },
        { d: poly([[48, 93], [93, 48], [113, 68], [68, 113]], 6), fill: 'grey', depth: 1 },
        { d: ellipse(0, 0, 80), fill: 'white' },
        { d: ring(0, 0, 104, 78), fill: 'main', depth: 1 },
        { d: arc(0, 0, 56, 200, 255) },
      ],
    },
    glow('lens', [30, -26], 22, sparkle(20)),
    glow('lens', [-32, 30], 14, sparkle(96)),
  ],
}

const SHUTTER = onFace(FACE, [92, -104])
const FLASH = onFace(FACE, [-96, -48])

export const camera: Icon = {
  name: 'camera',
  frames: 180,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: 'cam', a: [0, 100], p: [250, 366], m: { ...sway, k: 0.6 }, shapes: [] },
    { parent: 'cam', tilt: FACE, shapes: [{ d: rect(-64, -126, 128, 50, 14), fill: 'deep', depth: 0.8 }] },
    { parent: 'cam', a: SHUTTER, p: SHUTTER, m: { ...press, k: 0.35 }, tilt: FACE, shapes: [{ d: pill(70, -118, 46, 28), fill: 'hot', depth: 0.6 }] },
    {
      parent: 'cam',
      tilt: FACE,
      shapes: [
        { d: rect(-146, -90, 292, 192, 32), fill: 'deep', depth: 1 },
        { d: rect(-146, -24, 292, 64), fill: 'tint' },
        { d: rect(-124, -66, 52, 30, 8), fill: 'gold', depth: 0.3 },
        { d: ellipse(20, 8, 82), fill: 'white', depth: 0.6 },
        { d: ring(20, 8, 70, 46), fill: 'main', depth: 0.8 },
        { d: ellipse(20, 8, 46), fill: 'deep' },
        { d: arc(20, 8, 30, 200, 260) },
      ],
    },
    glow('cam', FLASH, 28, glint(36, 120)),
  ],
}
