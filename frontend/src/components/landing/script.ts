/**
 * The script and the layout behind the Sticker Slap landing, pure and testable: a fat single-stroke alphabet drawn as
 * SVG paths, the layout of a word in it, hand-cut stars, and where the stickers land on a word.
 */
/** A small deterministic hash → [0, 1), so every render places things the same way. */
const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

export const round = (v: number): number => Math.round(v * 100) / 100

export const clamp = (v: number, lo: number, hi: number): number => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo)

/**
 * A fat single-stroke script: [advance, main stroke, pen-lift strokes, lifts after?]. x-height 10, baseline 0, y runs
 * down. Every main stroke starts at (0, -1) and, unless it lifts, ends at (advance, -1), so letters chain into one
 * continuous path. Absolute M / L / C only, so x and y simply alternate.
 */
export const SCRIPT: Record<string, [number, string, string?, number?]> = {
  a: [10.2, 'M0 -1C1.4 -1.4 1.4 -9.6 4.3 -10C2.5 -10 1 -7.8 1 -5C1 -2.2 2.5 0 4.3 0C6.1 0 7.6 -2.2 7.6 -5L7.8 -10L7.8 -3C7.8 -0.8 8.8 -1 10.2 -1'],
  b: [9.4, 'M0 -1C2.8 -3 6.2 -12 6 -16.4C5.8 -19.8 1.8 -20 1.8 -16.4L1.8 -1L1.8 -6C2.4 -9 3.4 -10 4.8 -10C6.8 -10 8.2 -8 8.2 -5C8.2 -2 6.6 0 4.8 0C3.4 0 2.4 -0.6 1.8 -1.6C2.4 -0.6 3.4 0 4.8 0C6.6 0 7.8 -0.8 9.4 -1'],
  c: [8.8, 'M0 -1C1.4 -1.4 1.4 -9.6 4.3 -10C5.6 -10 6.6 -9.6 7 -8.6C6.6 -9.6 5.6 -10 4.3 -10C2.5 -10 1 -7.8 1 -5C1 -2.2 2.5 0 4.3 0C6 0 7 -1 8.8 -1'],
  d: [10.2, 'M0 -1C1.4 -1.4 1.4 -9.6 4.3 -10C2.5 -10 1 -7.8 1 -5C1 -2.2 2.5 0 4.3 0C6.1 0 7.6 -2.2 7.6 -5L7.8 -19L7.8 -3C7.8 -0.8 8.8 -1 10.2 -1'],
  e: [9.4, 'M0 -1C3.4 -2.4 8 -4.4 8 -7.6C8 -9.4 6.6 -10.4 4.8 -10.4C2.2 -10.4 0.8 -7.8 0.8 -5C0.8 -1.8 2.6 0 5 0C6.8 0 8 -1 9.4 -1'],
  f: [7, 'M0 -1C2.8 -3 6.2 -12 6 -16.4C5.8 -19.8 1.8 -20 1.8 -16.4L1.8 7.2C1.8 9.6 3.2 9.6 3.8 7.6C4.4 5 4.8 -1 7 -1', 'M-0.4 -9.4L5.4 -9.4'],
  g: [9.6, 'M0 -1C1.4 -1.4 1.4 -9.6 4.3 -10C2.5 -10 1 -7.8 1 -5C1 -2.2 2.5 0 4.3 0C6.1 0 7.6 -2.2 7.6 -5L7.8 -10L7.8 4C7.8 8.6 5.8 9.6 4.2 9.6C2 9.6 1.4 7.6 2.8 6C4.6 4 7.4 1.4 9.6 -1'],
  h: [10, 'M0 -1C2.8 -3 6.2 -12 6 -16.4C5.8 -19.8 1.8 -20 1.8 -16.4L1.8 -1L1.8 -5.6C2.6 -8.6 4 -10 5.6 -10C7.2 -10 7.8 -8.8 7.8 -7L7.8 -3C7.8 -0.8 8.8 -1 10 -1'],
  i: [5, 'M0 -1C1.2 -1.4 2 -6 2.2 -10L2.2 -3C2.2 -0.8 3.4 -1 5 -1', 'M2.4 -15.2L2.5 -15.3'],
  j: [5.4, 'M0 -1C1.2 -1.4 2 -6 2.2 -10L2.2 4.6C2.2 9.6 -0.6 9.8 -0.2 7.4C0.2 5 3.4 1.4 5.4 -1', 'M2.4 -15.2L2.5 -15.3'],
  k: [9.6, 'M0 -1C2.8 -3 6.2 -12 6 -16.4C5.8 -19.8 1.8 -20 1.8 -16.4L1.8 -1L1.8 -4.6C3 -8 5.6 -10.4 7 -9.6C8.4 -8.6 7 -5.6 3.6 -5C5.6 -4.6 6.6 -1 9.6 -1'],
  l: [6.4, 'M0 -1C2.8 -3 6.2 -12 6 -16.4C5.8 -19.8 1.8 -20 1.8 -16.4L1.8 -3.2C1.8 -0.6 4 -1 6.4 -1'],
  m: [14.6, 'M0 -1C1.2 -1.6 1.6 -6 1.8 -9.6L1.8 -1L1.8 -5.6C2.4 -8.6 3.4 -10 4.8 -10C6.2 -10 7 -9 7 -7L7 -1L7 -5.6C7.6 -8.6 8.6 -10 10 -10C11.4 -10 12.2 -9 12.2 -7L12.2 -3C12.2 -0.8 13.2 -1 14.6 -1'],
  n: [9.6, 'M0 -1C1.2 -1.6 1.6 -6 1.8 -9.6L1.8 -1L1.8 -5.6C2.4 -8.6 3.4 -10 4.8 -10C6.4 -10 7.2 -9 7.2 -7L7.2 -3C7.2 -0.8 8.2 -1 9.6 -1'],
  o: [9, 'M0 -1C1.4 -1.4 1.4 -9.6 4.3 -10C2.5 -10 1 -7.8 1 -5C1 -2.2 2.5 0 4.3 0C6.1 0 7.6 -2.2 7.6 -5C7.6 -7.8 6.1 -10 4.3 -10C6 -10 7.4 -9.2 9 -9', '', 1],
  p: [9.6, 'M0 -1C1.2 -1.6 1.6 -6 1.8 -9.6L1.8 9L1.8 -5.6C2.4 -8.6 3.4 -10 5 -10C7 -10 8.2 -8 8.2 -5C8.2 -2 6.6 0 4.8 0C3.4 0 2.4 -0.6 1.8 -1.6C2.4 -0.6 3.4 0 4.8 0C6.6 0 7.8 -0.8 9.6 -1'],
  q: [10.4, 'M0 -1C1.4 -1.4 1.4 -9.6 4.3 -10C2.5 -10 1 -7.8 1 -5C1 -2.2 2.5 0 4.3 0C6.1 0 7.6 -2.2 7.6 -5L7.8 -10L7.8 9C8.8 6 9 0 10.4 -1'],
  r: [8.6, 'M0 -1C1.2 -1.6 1.6 -6 1.8 -9.6L1.8 -1L1.8 -5.6C2.6 -8.6 4.2 -10 5.8 -10C6.8 -10 7.6 -9.6 8.2 -8.8', '', 1],
  s: [8.4, 'M0 -1C1.6 -2 3 -7 4.4 -10.2C5.6 -8 7.4 -6 7.4 -3.6C7.4 -1.2 5.6 0 3.6 0C2 0 1 -0.6 0.6 -1.6C1 -0.6 2 0 3.6 0C5.6 0 6.8 -0.8 8.4 -1'],
  t: [6.6, 'M0 -1C1 -1.4 2.2 -8 2.4 -15L2.4 -3.2C2.4 -0.8 4 -1 6.6 -1', 'M-0.8 -9.6L6.2 -9.6'],
  u: [10, 'M0 -1C1.2 -1.6 1.6 -6 1.8 -9.6L1.8 -3.6C1.8 -1 3 0 4.6 0C6.2 0 7.4 -1.4 7.6 -4L7.6 -9.8L7.6 -3C7.6 -0.8 8.6 -1 10 -1'],
  v: [9, 'M0 -1C1.2 -1.6 1.6 -6 1.6 -9.6C1.6 -6 2.6 0 4.4 0C6.4 0 7.6 -6 7.6 -9.6C8 -9 8.4 -8.8 9 -8.8', '', 1],
  w: [12.6, 'M0 -1C1.2 -1.6 1.6 -6 1.6 -9.6L1.6 -3.6C1.6 -1 2.6 0 4 0C5.4 0 6.2 -1 6.2 -3.6L6.2 -8L6.2 -3.6C6.2 -1 7 0 8.4 0C9.8 0 10.8 -1 10.8 -3.6L10.8 -9.6C11.2 -9 11.8 -8.8 12.6 -8.8', '', 1],
  x: [9, 'M0 -1C1.6 -2 2 -8.6 3 -9.6L7 -1C7.6 -0.4 8.4 -1 9 -1', 'M7.4 -9.6L2.4 -0.4'],
  y: [9.6, 'M0 -1C1.2 -1.6 1.6 -6 1.8 -9.6L1.8 -3.6C1.8 -1 3 0 4.6 0C6.2 0 7.4 -1.4 7.6 -4L7.6 -9.8L7.6 4.4C7.6 9 5.6 9.6 4.2 9.6C2 9.6 1.4 7.6 2.8 6C4.6 4 7.4 1.6 9.6 -1'],
  z: [8.8, 'M0 -1C1 -2 1.4 -9.6 2.6 -9.6L7.4 -9.6L1.6 -0.2L6 -0.2C7 -0.2 7.8 -1 8.8 -1'],
  '!': [4, 'M2 -16L2 -4.4', 'M2 -0.6L2.1 -0.7', 1],
  '.': [3.6, 'M1.8 -0.6L1.9 -0.7', '', 1],
}

/** Horizontal stretch and the gap between letters, in script units. */
const SX = 1.22
const TRACK = 1
const WORD_GAP = 6

/** Shifts and stretches every x in an absolute M/L/C path. */
const place = (d: string, dx: number, sx: number = SX): string => {
  let k = 0
  return d.replace(/-?\d*\.?\d+/g, (n) => (k++ % 2 === 0 ? String(round(+n * sx + dx)) : n))
}

type ScriptBox = { x0: number; x1: number; top: number }
export type ScriptWord = { main: string; extra: string[]; width: number; top: number; bottom: number; boxes: ScriptBox[] }

const extent = (d: string): number[] => {
  const n = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number)
  return n.filter((_, i) => i % 2 === 1)
}

/**
 * Lays text out in the script: one continuous main stroke (moves only where a letter lifts or a space falls) plus
 * the pen-lift strokes, drawn after. Case is ignored, accents are stripped, anything unknown is a space.
 */
export const layoutScript = (text: string): ScriptWord => {
  const clean = String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
  let x = 0
  let main = ''
  const extra: string[] = []
  const boxes: ScriptBox[] = []
  let lift = true
  let top = 0
  let bottom = 0
  for (const ch of clean) {
    const g = SCRIPT[ch]
    if (!g) {
      if (main) x += WORD_GAP
      lift = true
      continue
    }
    const d = place(g[1], x)
    main += lift ? d : 'L' + d.slice(1)
    if (g[2]) extra.push(place(g[2], x))
    const ys = extent(g[1] + (g[2] ?? ''))
    const t = Math.min(...ys)
    top = Math.min(top, t)
    bottom = Math.max(bottom, ...ys)
    boxes.push({ x0: round(x), x1: round(x + g[0] * SX), top: t })
    lift = !!g[3]
    x += g[0] * SX + TRACK
  }
  return { main, extra, width: boxes.length ? round(x - TRACK) : 0, top, bottom, boxes }
}

/** A closed star: `points` spikes, alternating radii. `wobble` makes the spikes uneven, like a hand-cut sticker. */
export const starPath = (points: number, outer: number, inner: number, cx: number = 0, cy: number = 0, wobble: number = 0, seed: number = 0): string => {
  const n = Math.max(3, Math.floor(points) || 3)
  const pts: string[] = []
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 ? inner : outer * (1 + (hash(i * 9.7 + seed) - 0.5) * wobble)
    pts.push(round(cx + Math.cos(a) * r) + ' ' + round(cy + Math.sin(a) * r))
  }
  return 'M' + pts.join('L') + 'Z'
}

export type Spot = { x: number; y: number; size: number; rotate: number; depth: number }

/**
 * Where n stickers land on a word, in script units: spread evenly along it, each riding the top of the letter
 * underneath (some perched above it, some slapped across the stroke), with a seeded tilt and a parallax depth.
 */
export const stickerSpots = (word: ScriptWord, n: number, seed: number = 0): Spot[] => {
  const count = Math.max(0, Math.floor(n) || 0)
  if (!count || !word.width) return []
  return Array.from({ length: count }, (_, i) => {
    const x = ((i + 0.5) / count) * word.width
    const box = word.boxes.find((b) => x >= b.x0 && x <= b.x1 + TRACK) ?? word.boxes[word.boxes.length - 1]
    const lift = [1.5, -5, -1, -7, 0.5, -4, -2][i % 7]
    return {
      x: round(x + (hash(i * 4.1 + seed) - 0.5) * 3),
      y: round(clamp(box.top + 2.5 + lift, word.top - 4, -4)),
      size: round(6.4 + hash(i * 2.3 + seed + 1) * 2.4),
      rotate: round((hash(i * 7.7 + seed + 2) - 0.5) * 34),
      depth: round(0.4 + hash(i * 5.5 + seed + 3) * 0.8),
    }
  })
}
