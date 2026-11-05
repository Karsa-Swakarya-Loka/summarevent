/**
 * The team slide: every member is a risograph poster; moving between them crumples the current poster into a paper
 * ball and unfolds the next. Adapted from «Crumple Changelog» by Kedhareswer.
 *
 * - Posters are painted from data on a canvas: two-ink riso print (one loud colour + black), halftone where the ink
 *   runs thin, worn edges, grain and a misregistered black plate. A portrait prints on the black plate as a halftone.
 * - The crumple is a real deformation: a 110 × 156 plane wraps onto a sphere with its arc length preserved, buckles,
 *   twists, and takes a per-poster crease map (a few hundred random folds at three scales). Faceted lighting comes
 *   from screen-space derivatives, so every crease catches light.
 * - `three` and `gsap` are heavy and only this slide needs them: TeamSlide.tsx loads this module on demand.
 */

import * as React from 'react'
import * as THREE from 'three'
import { gsap } from 'gsap'
import '@fontsource/permanent-marker/latin-400.css'
import './crumple.css'
import { scrubToView } from './crumple'
import { TEAM, type TeamIcon, type TeamMember } from './team'

const list = TEAM
const n = list.length
const TITLE = ['Lima orang,', 'satu pass']
/** Printed upside down along the top of every poster. */
const BRAND = 'Tim Summarevent'
/** Printed vertically down the left edge of every poster. */
const EDITION = 'Bandung Build Challenge 2026'
/** Minor ruler ticks between two members. */
const per = Math.max(3, Math.min(12, Math.round(44 / (n - 1))))
const tickCount = (n - 1) * per + 1

/* ------------------------------------------------------------------ */
/* what a poster needs before it can be printed                        */
/* ------------------------------------------------------------------ */

const loadFonts = () => Promise.all([document.fonts.load('100px "Permanent Marker"'), document.fonts.load('500 34px "Plus Jakarta Sans Variable"')]).catch(() => [])

/** A portrait that does not load leaves the poster with its icon. */
const loadPhoto = (src?: string) =>
  new Promise<HTMLImageElement | null>((done) => {
    if (!src) return done(null)
    const img = new Image()
    img.onload = () => done(img)
    img.onerror = () => done(null)
    img.src = src
  })

const hasWebGL = () => {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
/* poster painting                                                     */
/* ------------------------------------------------------------------ */

const PW = 1000
const PH = 1414
const ASPECT = PH / PW
const SANS = '"Plus Jakarta Sans Variable", ui-sans-serif, system-ui, sans-serif'
const PAPER = [251, 243, 228]
const BLACK = [35, 31, 32]
const MARKER = '"Permanent Marker", cursive'

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hexRgb(hex: string): number[] {
  const h = hex.replace('#', '')
  const v =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  const n = parseInt(v, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function luminance(rgb: number[]): number {
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255
}

/** A lattice of random values sampled with smooth bilinear interpolation. */
function lattice(cell: number, rng: () => number) {
  const cols = Math.ceil(PW / cell) + 2
  const rows = Math.ceil(PH / cell) + 2
  const g = new Float32Array(cols * rows)
  for (let i = 0; i < g.length; i++) g[i] = rng()
  return (x: number, y: number) => {
    const fx = x / cell
    const fy = y / cell
    const ix = fx | 0
    const iy = fy | 0
    let u = fx - ix
    let v = fy - iy
    u = u * u * (3 - 2 * u)
    v = v * v * (3 - 2 * v)
    const o = iy * cols + ix
    const a = g[o] + (g[o + 1] - g[o]) * u
    const b = g[o + cols] + (g[o + cols + 1] - g[o + cols]) * u
    return a + (b - a) * v
  }
}

function drawIcon(ctx: CanvasRenderingContext2D, icon: TeamIcon, x: number, y: number, r: number, rng: () => number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((rng() - 0.5) * 0.18)
  ctx.beginPath()
  if (icon === 'star') {
    ctx.rotate(-0.22)
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const rr = i % 2 ? r * 0.4 : r * (i === 0 ? 1.12 : 1)
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
    }
    ctx.closePath()
    ctx.fill()
    // a printed star always has a heavy inner cut
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const rr = i % 2 ? r * 0.17 : r * 0.42
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr + r * 0.03)
    }
    ctx.closePath()
    ctx.fill()
  } else if (icon === 'heart') {
    const s = r / 1.05
    ctx.moveTo(0, s * 0.92)
    ctx.bezierCurveTo(-s * 0.18, s * 0.72, -s * 1.08, s * 0.22, -s * 1.02, -s * 0.34)
    ctx.bezierCurveTo(-s * 0.96, -s * 0.86, -s * 0.28, -s * 1.02, 0, -s * 0.5)
    ctx.bezierCurveTo(s * 0.28, -s * 1.02, s * 0.96, -s * 0.86, s * 1.02, -s * 0.34)
    ctx.bezierCurveTo(s * 1.08, s * 0.22, s * 0.18, s * 0.72, 0, s * 0.92)
    ctx.fill()
  } else if (icon === 'moon') {
    ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(r * 0.42, -r * 0.3, r * 0.78, 0, Math.PI * 2)
    ctx.fill()
  } else if (icon === 'smiley') {
    ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.ellipse(-r * 0.33, -r * 0.26, r * 0.11, r * 0.19, 0, 0, Math.PI * 2)
    ctx.ellipse(r * 0.33, -r * 0.26, r * 0.11, r * 0.19, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.lineWidth = r * 0.13
    ctx.lineCap = 'round'
    ctx.arc(0, r * 0.05, r * 0.52, 0.18 * Math.PI, 0.82 * Math.PI)
    ctx.stroke()
  } else {
    const s = r
    ctx.moveTo(s * 0.28, -s * 1.05)
    ctx.lineTo(-s * 0.58, s * 0.14)
    ctx.lineTo(-s * 0.04, s * 0.14)
    ctx.lineTo(-s * 0.32, s * 1.08)
    ctx.lineTo(s * 0.62, -s * 0.2)
    ctx.lineTo(s * 0.06, -s * 0.2)
    ctx.lineTo(s * 0.36, -s * 1.05)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

function letter(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, rng: () => number, jitter = 1) {
  // hand-lettered: every glyph sits a little off, then gets a brush outline
  ctx.font = size + 'px ' + MARKER
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.lineJoin = 'round'
  ctx.lineWidth = size * 0.03
  const chars = Array.from(text)
  const widths = chars.map((c) => ctx.measureText(c).width)
  const track = -size * 0.015
  const total = widths.reduce((a, b) => a + b, 0) + track * (chars.length - 1)
  let cx = x - total / 2
  chars.forEach((c, i) => {
    ctx.save()
    ctx.translate(cx + widths[i] / 2, y + (rng() - 0.5) * size * 0.05 * jitter)
    ctx.rotate((rng() - 0.5) * 0.09 * jitter)
    const k = 1 + (rng() - 0.5) * 0.08 * jitter
    ctx.scale(k, k)
    ctx.fillText(c, -widths[i] / 2, 0)
    ctx.strokeText(c, -widths[i] / 2, 0)
    ctx.restore()
    cx += widths[i] + track
  })
}

function fitSize(ctx: CanvasRenderingContext2D, text: string, max: number, width: number, family: string) {
  ctx.font = '100px ' + family
  const w = ctx.measureText(text).width || 1
  return Math.min(max, (width / w) * 100)
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? line + ' ' + w : w
    if (ctx.measureText(next).width > width && line) {
      lines.push(line)
      line = w
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

/** A cut-out portrait on the black plate: shadows print as big dots, highlights let the poster's ink through. */
function printPortrait(plate: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, top: number, height: number) {
  const h = Math.round(height)
  const w = Math.round((img.naturalWidth / img.naturalHeight) * h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const t = c.getContext('2d', { willReadFrequently: true })!
  t.drawImage(img, 0, 0, w, h)
  const data = t.getImageData(0, 0, w, h)
  const d = data.data
  const grey = (i: number) => 0.5 * d[i] + 0.4 * d[i + 1] + 0.1 * d[i + 2]
  // stretch the person's own tones, so a dark studio photo and a bright snapshot print alike
  const hist = new Uint32Array(256)
  let total = 0
  for (let i = 0; i < d.length; i += 4)
    if (d[i + 3] > 128) {
      hist[grey(i) | 0]++
      total++
    }
  let low = 0
  let high = 255
  let seen = 0
  for (let v = 0; v < 256; v++) {
    seen += hist[v]
    if (seen < total * 0.02) low = v
    if (seen < total * 0.98) high = v
  }
  const span = Math.max(1, high - low)
  const period = 8
  const ca = (Math.cos(Math.PI / 4) * 2 * Math.PI) / period
  const sa = (Math.sin(Math.PI / 4) * 2 * Math.PI) / period
  for (let y = 0; y < h; y++) {
    // the figure dissolves into the ink instead of ending in a cut line
    const fade = Math.min(1, (h - y) / (h * 0.2))
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const tone = Math.min(1, Math.max(0, (grey(i) - low) / span))
      const dark = (1 - Math.pow(tone, 0.72)) * (d[i + 3] / 255) * fade
      const spot = (Math.cos(x * ca + y * sa) + Math.cos(-x * sa + y * ca) + 2) / 4
      d[i] = d[i + 1] = d[i + 2] = 0
      d[i + 3] = Math.min(1, Math.max(0, (dark * 1.08 - 0.04 - spot) / 0.16 + 0.5)) * 255
    }
  }
  t.putImageData(data, 0, 0)
  plate.drawImage(c, cx - w / 2, top)
}

function paintPoster(u: TeamMember, photo: HTMLImageElement | null, seed: number): HTMLCanvasElement {
  const rng = mulberry32(seed)
  const mk = () => {
    const c = document.createElement('canvas')
    c.width = PW
    c.height = PH
    return c
  }
  const blackC = mk()
  const knockC = mk()
  const b = blackC.getContext('2d', { willReadFrequently: true })!
  const k = knockC.getContext('2d', { willReadFrequently: true })!
  const ink = hexRgb(u.ink)
  const light = luminance(ink) > 0.62
  // small print knocks out to paper on dark inks, prints black on pale ones
  const small = light ? b : k

  // the black plate never lands exactly on the colour plate
  b.translate(PW / 2, PH / 2)
  b.rotate((rng() - 0.5) * 0.007)
  b.translate(-PW / 2 + (rng() - 0.5) * 9, -PH / 2 + (rng() - 0.5) * 9)
  b.fillStyle = b.strokeStyle = '#000'
  k.fillStyle = k.strokeStyle = '#000'

  // headline
  const head = u.name.toUpperCase()
  const hs = fitSize(b, head, 270, 800, MARKER)
  b.save()
  b.translate(PW / 2, 0)
  b.rotate(-0.025)
  letter(b, head, 0, 118 + hs * 0.8, hs, rng)
  b.restore()
  let y = 118 + hs * 0.8

  // subline: up to three words spread and staggered like hand lettering
  const words = u.role.split(/\s+/).filter(Boolean)
  if (words.length && words.length <= 3) {
    const ss = Math.min(96, ...words.map((w) => fitSize(b, w, 96, words.length === 1 ? 700 : 300, MARKER)))
    const xs = words.length === 1 ? [500] : words.length === 2 ? [330, 670] : [235, 500, 765]
    const ys = words.length === 3 ? [0.62, 0, 0.7] : words.length === 2 ? [0.1, 0.55] : [0.2]
    words.forEach((w, i) => letter(b, w, xs[i], y + ss * 1.15 + ys[i] * ss, ss, rng))
    y += ss * 1.15 + ss * (words.length === 1 ? 0.45 : 0.75)
  } else if (words.length) {
    b.font = '80px ' + MARKER
    const lines = wrap(b, u.role, 820)
    lines.forEach((l, i) => letter(b, l, 500, y + 100 + i * 92, 80, rng, 0.7))
    y += 100 + (lines.length - 1) * 92
  }

  // the portrait or icon takes everything down to the print shop's line
  const bottom = 1250
  if (photo) printPortrait(b, photo, 500, y + 6, bottom - y - 6)
  else drawIcon(b, u.icon, 500, (y + bottom) / 2, Math.min(300, (bottom - y) / 2 - 40), rng)

  // the project's name where a print shop would put its mark
  small.save()
  small.font = '700 44px ' + SANS
  small.textAlign = 'left'
  small.fillText('Summarevent', 92, 1346)
  small.restore()

  // barcode + venue
  b.font = '600 22px ' + SANS
  b.textAlign = 'right'
  b.fillText('Summarecon Mall Bandung', 908, 1272)
  const br = mulberry32(hashStr(u.name))
  let bx = 908
  while (bx > 682) {
    const w = [3, 3, 5, 8, 4][(br() * 5) | 0]
    b.fillRect(bx - w, 1284, w, 66 - (br() < 0.12 ? 8 : 0))
    bx -= w + [3, 4, 6][(br() * 3) | 0]
  }

  // brand upside down along the top, edition down the left edge
  small.save()
  small.font = '500 24px ' + SANS
  small.translate(PW - 92, 58)
  small.rotate(Math.PI)
  small.textAlign = 'left'
  small.fillText(BRAND, 0, 0)
  small.restore()
  small.save()
  small.font = '600 22px ' + SANS
  small.translate(40, 112)
  small.rotate(Math.PI / 2)
  small.textAlign = 'left'
  const ed = EDITION.toUpperCase().split('').join(String.fromCharCode(8202))
  small.fillText(ed, 0, 0)
  small.restore()

  // --- print: paper + colour plate (halftone where thin) + black plate ---
  const out = mk()
  const o = out.getContext('2d')!
  const img = o.createImageData(PW, PH)
  const d = img.data
  const ba = b.getImageData(0, 0, PW, PH).data
  const ka = k.getImageData(0, 0, PW, PH).data
  const low = lattice(150, rng)
  const mid = lattice(26, rng)
  const fine = lattice(6, rng)
  const ang = 0.26
  const ca = Math.cos(ang) / 7.5
  const sa = Math.sin(ang) / 7.5
  const s0 = seed | 0
  for (let py = 0; py < PH; py++) {
    for (let px = 0; px < PW; px++) {
      const i = (py * PW + px) * 4
      const n1 = low(px, py)
      const n2 = mid(px, py)
      const n3 = fine(px, py)
      let h = Math.imul(px * 374761393 + py * 668265263, 1274126177) ^ s0
      h = Math.imul(h ^ (h >>> 13), 1274126177)
      const g = ((h ^ (h >>> 16)) >>> 0) / 4294967296
      const edgeD = Math.min(px, py, PW - 1 - px, PH - 1 - py)
      // ragged cut edge
      if (edgeD < 1.5 + n2 * 4 + n3 * 2) {
        d[i + 3] = 0
        continue
      }
      // worn edges and pale, ink-starved patches
      const e = Math.min(1, Math.max(0, (edgeD + (n2 - 0.5) * 30 - 5) / (16 + n1 * 46)))
      let tone = e * e * (3 - 2 * e) * (0.95 + 0.05 * n1)
      if (n2 > 0.83) tone -= (n2 - 0.83) * 2 * (0.4 + n1)
      let cov: number
      if (tone > 0.93) cov = 1
      else {
        const hx = px * ca - py * sa
        const hy = px * sa + py * ca
        const fx = hx - Math.floor(hx) - 0.5
        const fy = hy - Math.floor(hy) - 0.5
        const dist = Math.sqrt(fx * fx + fy * fy)
        const r = Math.sqrt(Math.max(0, tone)) * 0.6
        cov = Math.min(1, Math.max(0, (r - dist) / 0.09 + 0.5))
      }
      cov *= 1 - ka[i + 3] / 255
      if (g > 0.975) cov *= 0.25
      cov *= 0.86 + 0.14 * n3
      let r = PAPER[0] + (ink[0] - PAPER[0]) * cov
      let gg = PAPER[1] + (ink[1] - PAPER[1]) * cov
      let bb = PAPER[2] + (ink[2] - PAPER[2]) * cov
      const a = ba[i + 3]
      if (a) {
        let kb = (a / 255) * (0.8 + 0.2 * n2) * (0.55 + 0.45 * e)
        if (g < 0.045 || n3 > 0.86) kb *= 0.4
        r *= 1 - kb * (1 - BLACK[0] / 255)
        gg *= 1 - kb * (1 - BLACK[1] / 255)
        bb *= 1 - kb * (1 - BLACK[2] / 255)
      }
      const fibre = 0.955 + 0.045 * g + 0.02 * (n1 - 0.5)
      d[i] = r * fibre
      d[i + 1] = gg * fibre
      d[i + 2] = bb * fibre
      d[i + 3] = 255
    }
  }
  o.putImageData(img, 0, 0)
  return out
}

/* ------------------------------------------------------------------ */
/* crease map                                                          */
/* ------------------------------------------------------------------ */

/** Hundreds of short random folds at three scales. Each fold is a V across a
 *  line, faded out along its length, so the sum is a field of flat facets
 *  meeting at creases — the way crushed paper actually breaks. */
function creaseField(pos: ArrayLike<number>, cols: number, rows: number, seed: number): Float32Array {
  const count = cols * rows
  const rng = mulberry32(seed ^ 0x9e3779b9)
  // long folds cross the whole sheet: their sum is exactly piecewise flat
  const lines: number[][] = []
  for (let i = 0; i < 64; i++) {
    const a = rng() * Math.PI
    const amp = (0.25 + rng() * 0.75) * (rng() < 0.5 ? -1 : 1)
    lines.push([(rng() - 0.5) * 1.1, (rng() - 0.5) * 1.5, Math.cos(a), Math.sin(a), amp])
  }
  // short creases break the facets up near where the hand squeezed hardest
  const folds: number[][] = []
  for (let i = 0; i < 150; i++) {
    const a = rng() * Math.PI
    const len = 0.06 + rng() * 0.2
    folds.push([(rng() - 0.5) * 1.2, (rng() - 0.5) * 1.6, Math.cos(a), Math.sin(a), len, (rng() < 0.5 ? -1 : 1) * 1.4])
  }
  const fine = new Float32Array(count)
  const coarse = new Float32Array(count)
  for (let v = 0; v < count; v++) {
    const x = pos[v * 3]
    const y = pos[v * 3 + 1]
    let h = 0
    for (let i = 0; i < lines.length; i++) {
      const [cx, cy, nx, ny, amp] = lines[i]
      h += amp * Math.abs((x - cx) * nx + (y - cy) * ny)
      // the first few folds alone make the big faces of the finished ball
      if (i === 15) coarse[v] = h
    }
    for (const [cx, cy, nx, ny, len, amp] of folds) {
      const dx = x - cx
      const dy = y - cy
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d >= len) continue
      h += amp * (1 - d / len) * (Math.abs(dx * nx + dy * ny) - len * 0.25)
    }
    fine[v] = h
  }
  // high-pass: subtract a blurred copy so only crease-scale relief is left
  // (the raw sums are a big shallow bowl that would swallow every facet)
  const highpass = (src: Float32Array, rad: number) => {
    const blur = Float32Array.from(src)
    const tmp = new Float32Array(count)
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          let s = 0
          let k = 0
          for (let j = Math.max(0, x - rad); j <= Math.min(cols - 1, x + rad); j++, k++) s += blur[y * cols + j]
          tmp[y * cols + x] = s / k
        }
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          let s = 0
          let k = 0
          for (let j = Math.max(0, y - rad); j <= Math.min(rows - 1, y + rad); j++, k++) s += tmp[j * cols + x]
          blur[y * cols + x] = s / k
        }
    }
    let sq = 0
    for (let v = 0; v < count; v++) {
      src[v] -= blur[v]
      sq += src[v] * src[v]
    }
    const rms = Math.sqrt(sq / count) || 1
    for (let v = 0; v < count; v++) src[v] = Math.max(-1, Math.min(1, src[v] / (rms * 2.6)))
  }
  highpass(fine, 6)
  highpass(coarse, 16)
  const out = new Float32Array(count * 2)
  for (let v = 0; v < count; v++) {
    out[v * 2] = fine[v]
    out[v * 2 + 1] = coarse[v]
  }
  return out
}

/* ------------------------------------------------------------------ */
/* shaders                                                             */
/* ------------------------------------------------------------------ */

const PAPER_VS = /* glsl */ `
attribute vec2 aCrease;
uniform float uC;
uniform float uSeed;
uniform vec3 uHover;
varying vec2 vUv;
varying vec3 vView;
varying float vAO;

const float RMAX = 0.8660254;
const float PI = 3.14159265;

void main() {
  vUv = uv;
  vec2 p = position.xy;
  float c = clamp(uC, 0.0, 1.0);
  float bend = sin(PI * c);
  float r = length(p);
  float e = r / RMAX;
  // offset: software GL breaks atan on the exact y = 0 row
  float th = atan(p.y + 1e-5, p.x + 1e-5);

  // wrinkles take up slack, so the sheet shrinks a little as it crumples
  float shrink = 1.0 - 0.17 * smoothstep(0.0, 0.7, c);
  // wrap angle: the sheet closes around a sphere, arc length preserved
  float Phi = max(mix(0.0, 2.8, smoothstep(0.04, 0.9, c)), 0.0015);
  float lump = 1.0 + c * (0.09 * sin(3.0 * th + uSeed * 6.283) + 0.06 * sin(5.0 * th - uSeed * 17.0));
  float phi = Phi * e * lump;
  float R = RMAX * shrink / Phi;
  float tw = (uSeed - 0.5) * 2.6 * bend * e;
  vec2 pr = vec2(p.x * cos(tw) - p.y * sin(tw), p.x * sin(tw) + p.y * cos(tw));
  vec2 dir = pr / max(r, 1e-5);
  float sp = sin(phi);
  float hs = sin(phi * 0.5);
  // R * sin(phi) / r without the angle, so the flat sheet maps exactly onto itself
  float sinc = phi < 1e-4 ? 1.0 : sp / phi;
  vec3 P = vec3(pr * shrink * lump * sinc, -2.0 * R * hs * hs);
  vec3 N = vec3(dir * sp, cos(phi));

  // big buckles mid-crumple, then the crease map
  float s = uSeed * 40.0;
  float buckle = bend * 0.075 * (sin(p.x * 7.0 + s) * cos(p.y * 5.0 - s * 0.7) + 0.6 * sin((p.x + p.y) * 11.0 + s * 1.3));
  // fine creases while the sheet is open, big flat faces once it's a ball
  float ball = smoothstep(0.35, 1.0, c);
  float crease = aCrease.x * 0.05 * smoothstep(0.0, 0.3, c) * (1.0 - 0.65 * ball) + aCrease.y * 0.095 * ball;
  // the rim rolls back first, like a hand gathering the corners
  float roll = smoothstep(0.5, 1.0, e) * bend * 0.16 * (0.6 + 0.4 * sin(th * 4.0 + s));

  // touch: the sheet dents and wrinkles a little under the pointer
  vec2 hd = p - uHover.xy;
  float touch = uHover.z * exp(-dot(hd, hd) / 0.03) * (1.0 - c);
  P += N * (buckle - roll + crease + aCrease.x * 0.022 * touch - 0.024 * touch);

  // recentre on the ball as it closes
  P.z += R * smoothstep(0.3, 1.0, c);

  vAO = 1.0 - 0.55 * clamp(-mix(aCrease.x, aCrease.y, ball) * 1.7, 0.0, 1.0) * smoothstep(0.0, 0.5, c + touch * 0.4)
            - 0.22 * smoothstep(1.6, 3.0, phi) * c;
  vec4 mv = modelViewMatrix * vec4(P, 1.0);
  vView = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`

const PAPER_FS = /* glsl */ `
uniform sampler2D uMap;
uniform sampler2D uMap2;
uniform float uMix;
uniform float uC;
uniform float uOpacity;
uniform float uTouch;
uniform vec3 uBack;
varying vec2 vUv;
varying vec3 vView;
varying float vAO;

void main() {
  vec4 t = mix(texture2D(uMap, vUv), texture2D(uMap2, vUv), uMix);
  if (t.a < 0.5) discard;
  // faceted normal from screen-space derivatives: every crease catches light
  vec3 N = normalize(cross(dFdx(vView), dFdy(vView)));
  vec3 L = normalize(vec3(-0.42, 0.58, 0.72));
  vec3 V = normalize(-vView);
  float flatRef = 0.3 + 0.7 * L.z;
  float diff = (0.3 + 0.7 * max(dot(N, L), 0.0) + 0.12 * max(dot(N, vec3(0.6, -0.3, 0.5)), 0.0)) / flatRef;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.18;
  float spec = pow(max(dot(N, normalize(L + V)), 0.0), 18.0) * 0.2;
  float k = max(smoothstep(0.0, 0.25, uC), uTouch);
  // the back of the sheet is bare paper with the print ghosting through
  vec3 base = gl_FrontFacing ? t.rgb : mix(uBack, t.rgb, 0.14);
  vec3 col = base * mix(1.0, diff * vAO, k) + (spec - rim * 0.5) * k;
  gl_FragColor = vec4(col, uOpacity);
}
`

const SHADOW_VS = /* glsl */ `
varying vec2 vP;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vP = w.xy;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`

const SHADOW_FS = /* glsl */ `
uniform vec2 uCenter;
uniform vec2 uHalf;
uniform float uRound;
uniform float uBlur;
uniform float uAlpha;
uniform float uAngle;
varying vec2 vP;
float box(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
  vec2 p = vP - uCenter;
  float cs = cos(uAngle), sn = sin(uAngle);
  p = vec2(cs * p.x + sn * p.y, -sn * p.x + cs * p.y);
  float d = box(p, uHalf, uRound);
  float soft = 1.0 - smoothstep(-uBlur * 0.5, uBlur, d);
  float contact = 1.0 - smoothstep(-6.0, 7.0, box(p + vec2(6.0, -9.0), uHalf * 0.985, uRound));
  gl_FragColor = vec4(0.0, 0.0, 0.0, uAlpha * (soft * soft + 0.35 * contact));
}
`

/* ------------------------------------------------------------------ */
/* component                                                           */
/* ------------------------------------------------------------------ */

type Api = { next(): void; prev(): void; toggle(): void }

export default function CrumpleTeam() {
  const rootRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const fallbackRef = React.useRef<HTMLImageElement>(null)
  const stageRef = React.useRef<HTMLDivElement>(null)
  const hitRef = React.useRef<HTMLButtonElement>(null)
  const trackRef = React.useRef<HTMLDivElement>(null)
  const knobRef = React.useRef<HTMLDivElement>(null)
  const ticksRef = React.useRef<HTMLDivElement>(null)
  const metaRef = React.useRef<HTMLDivElement>(null)
  const headRef = React.useRef<HTMLElement>(null)
  const controlsRef = React.useRef<HTMLButtonElement>(null)
  const apiRef = React.useRef<Api | null>(null)

  const [active, setActive] = React.useState(0)
  const [playing, setPlaying] = React.useState(false)
  const [atEnd, setAtEnd] = React.useState(n <= 1)

  React.useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    const stage = stageRef.current
    const hit = hitRef.current
    const track = trackRef.current
    const knob = knobRef.current
    const ticksEl = ticksRef.current
    if (!root || !canvas || !stage || !hit || !track || !knob || !ticksEl) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const last = Math.max(0, n - 1)
    const ticks = Array.from(ticksEl.children) as HTMLElement[]
    let disposed = false

    /* ---------- state ---------- */
    const st = { p: 0, shown: -1, c: 1, opacity: 0, drop: 0, spin: 0, ticksIn: 0, hoverX: 0, hoverY: 0, hover: 0, hx: 0, hy: 0 }
    let pShown = 0 // the smoothed knob position the stage follows
    let dragging = false
    let mode: 'intro' | 'scrub' | 'jump' = 'intro'
    const jump = { idx: 0, c: 1 }
    let tl: gsap.core.Timeline | null = null
    let playTimer: gsap.core.Tween | null = null
    let isPlaying = false
    let visible = true
    const L = { rw: 1, rh: 1, cx: 0, cy: 0, w: 1, h: 1, trackW: 1 }

    const seeds = list.map((u, i) => hashStr(u.name + i))
    const posters: (HTMLCanvasElement | null)[] = list.map(() => null)
    const photos: (HTMLImageElement | null)[] = list.map(() => null)
    const poster = (i: number) => (posters[i] ??= paintPoster(list[i], photos[i], seeds[i]))

    /* ---------- GL ---------- */
    let renderer: THREE.WebGLRenderer | null = null
    try {
      if (hasWebGL()) renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
    } catch {
      renderer = null
    }
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(22, 1, 10, 40000)
    const geo = new THREE.PlaneGeometry(1, ASPECT, 110, 156)
    const vCount = geo.attributes.position.count
    const crease = new THREE.BufferAttribute(new Float32Array(vCount * 2), 2)
    geo.setAttribute('aCrease', crease)
    const creases: (Float32Array | null)[] = list.map(() => null)
    const creaseFor = (i: number) => (creases[i] ??= creaseField(geo.attributes.position.array, 111, 157, seeds[i]))
    const blank = new THREE.DataTexture(new Uint8Array([251, 243, 228, 255]), 1, 1)
    blank.needsUpdate = true
    const textures: (THREE.CanvasTexture | null)[] = list.map(() => null)
    const maxAniso = renderer ? renderer.capabilities.getMaxAnisotropy() : 1
    const texFor = (i: number) => {
      let t = textures[i]
      if (!t) {
        t = new THREE.CanvasTexture(poster(i))
        t.anisotropy = Math.min(8, maxAniso)
        t.minFilter = THREE.LinearMipmapLinearFilter
        textures[i] = t
      }
      return t
    }
    const mat = new THREE.ShaderMaterial({
      vertexShader: PAPER_VS,
      fragmentShader: PAPER_FS,
      side: THREE.DoubleSide,
      transparent: true,
      forceSinglePass: true,
      uniforms: {
        uMap: { value: blank },
        uMap2: { value: blank },
        uMix: { value: 0 },
        uC: { value: 1 },
        uSeed: { value: 0.5 },
        uHover: { value: new THREE.Vector3() },
        uOpacity: { value: 0 },
        uTouch: { value: 0 },
        uBack: { value: new THREE.Color(0.93, 0.92, 0.9) },
      },
    })
    const paper = new THREE.Mesh(geo, mat)
    scene.add(paper)
    const shadowMat = new THREE.ShaderMaterial({
      vertexShader: SHADOW_VS,
      fragmentShader: SHADOW_FS,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uCenter: { value: new THREE.Vector2() },
        uHalf: { value: new THREE.Vector2(1, 1) },
        uRound: { value: 2 },
        uBlur: { value: 30 },
        uAlpha: { value: 0 },
        uAngle: { value: 0 },
      },
    })
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat)
    shadow.renderOrder = -1
    scene.add(shadow)

    const fallback = fallbackRef.current
    if (!renderer && fallback) fallback.style.display = 'block'

    /* ---------- show a poster ---------- */
    const show = (i: number) => {
      if (i === st.shown) return
      st.shown = i
      if (renderer) {
        mat.uniforms.uMap.value = texFor(i)
        crease.array.set(creaseFor(i))
        crease.needsUpdate = true
        mat.uniforms.uSeed.value = (seeds[i] % 1000) / 1000
      } else if (fallback) fallback.src = poster(i).toDataURL('image/webp', 0.9)
      setActive(i)
      if (mode !== 'intro') warm(i)
    }
    // print the neighbours while the user looks at this one, one per idle slot,
    // so the swap inside the ball never waits on a paint
    const warm = (i: number) => {
      const j = [i + 1, i - 1, i + 2].find((k) => k >= 0 && k <= last && !creases[k])
      if (j === undefined) return
      const idle = (cb: () => void) => (typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(cb) : window.setTimeout(cb, 200))
      idle(() => {
        if (disposed) return
        if (renderer) renderer.initTexture(texFor(j))
        else poster(j)
        creaseFor(j)
        warm(i)
      })
    }

    /* ---------- layout ---------- */
    const layout = () => {
      const r = root.getBoundingClientRect()
      const s = stage.getBoundingClientRect()
      L.rw = Math.max(1, r.width)
      L.rh = Math.max(1, r.height)
      const pad = Math.min(28, s.height * 0.05)
      L.h = Math.max(60, Math.min(s.height - pad * 2, (s.width - 32) * ASPECT, 820))
      L.w = L.h / ASPECT
      L.cx = s.left - r.left + s.width / 2 - L.rw / 2
      L.cy = L.rh / 2 - (s.top - r.top + s.height / 2)
      Object.assign(hit.style, {
        left: (s.width - L.w) / 2 + 'px',
        top: (s.height - L.h) / 2 + 'px',
        width: L.w + 'px',
        height: L.h + 'px',
      })
      if (fallback)
        Object.assign(fallback.style, {
          left: s.left - r.left + (s.width - L.w) / 2 + 'px',
          top: s.top - r.top + (s.height - L.h) / 2 + 'px',
          width: L.w + 'px',
          height: L.h + 'px',
        })
      L.trackW = track.getBoundingClientRect().width || 1
      if (renderer) {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
        renderer.setSize(L.rw, L.rh, false)
        camera.aspect = L.rw / L.rh
        const dist = L.rh / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
        camera.position.set(0, 0, dist)
        camera.near = dist * 0.2
        camera.far = dist * 4
        camera.updateProjectionMatrix()
        shadow.scale.set(L.rw * 1.2, L.rh * 1.2, 1)
      }
      dirty = true
    }

    /* ---------- per-frame ---------- */
    let dirty = true
    let lastSig = ''
    let lastRuler = ''
    const view = () => (mode === 'scrub' ? scrubToView(pShown, n) : { index: jump.idx, crumple: jump.c })

    let ready = false
    const frame = () => {
      if (disposed || !visible || !ready) return
      // the stage eases after the hand while dragging, and is exact otherwise
      pShown = dragging ? pShown + (st.p - pShown) * 0.3 : st.p
      if (Math.abs(st.p - pShown) < 1e-4) pShown = st.p
      st.hoverX += (st.hx - st.hoverX) * 0.18
      st.hoverY += (st.hy - st.hoverY) * 0.18
      const v = view()
      show(v.index)
      const c = v.crumple
      st.c = c

      // knob + ruler: they only need writing when the knob or the entrance has moved
      const kf = last ? pShown / last : 0
      const grow = st.ticksIn
      const rulerSig = kf + ',' + grow + ',' + L.trackW
      if (rulerSig !== lastRuler) {
        lastRuler = rulerSig
        knob.style.transform = 'translateX(' + kf * L.trackW + 'px)'
        for (let t = 0; t < ticks.length; t++) {
          const f = ticks.length > 1 ? t / (ticks.length - 1) : 0
          const dpx = (f - kf) * L.trackW
          const g = Math.exp(-(dpx / 34) * (dpx / 34))
          const major = t % per === 0
          const base = (major ? 15 : 8) + 24 * g
          const local = Math.min(1, Math.max(0, grow * 1.7 - Math.abs(f - kf) * 0.7))
          const e = 1 - Math.pow(1 - local, 3)
          ticks[t].style.transform = 'scaleY(' + ((base / 40) * e).toFixed(3) + ')'
          ticks[t].style.opacity = ((major ? 0.62 : 0.26) + 0.66 * g).toFixed(3)
        }
      }

      if (!renderer) {
        if (fallback) fallback.style.opacity = String(st.opacity * (1 - c))
        return
      }
      // paper transform: each poster balls up with its own spin
      const s = (seeds[v.index] % 1000) / 1000
      const sgn = s < 0.5 ? -1 : 1
      const cc = c * c * (3 - 2 * c)
      const hov = st.hover * (1 - c)
      paper.scale.setScalar(L.w)
      paper.position.set(L.cx, L.cy + Math.sin(Math.PI * c) * L.h * 0.03 + st.drop, 0)
      paper.rotation.set((s * 2 - 1) * 0.5 * cc - st.hoverY * 0.1 * hov + st.spin * 0.4, sgn * 0.45 * Math.sin(Math.PI * c) + st.hoverX * 0.14 * hov, sgn * (0.35 + s * 0.85) * cc + st.spin)
      mat.uniforms.uC.value = c
      mat.uniforms.uOpacity.value = st.opacity
      mat.uniforms.uTouch.value = hov * 0.85
      ;(mat.uniforms.uHover.value as THREE.Vector3).set(st.hoverX, st.hoverY, hov)

      // soft shadow: the poster's rectangle melts into the ball's disc
      const k = THREE.MathUtils.smoothstep(c, 0.04, 0.9)
      const ball = L.w * 0.29
      const lift = st.drop * 0.35
      shadowMat.uniforms.uHalf.value.set(THREE.MathUtils.lerp(L.w / 2, ball * 0.9, Math.pow(k, 0.7)), THREE.MathUtils.lerp(L.h / 2, ball * 0.86, Math.pow(k, 0.7)))
      shadowMat.uniforms.uRound.value = THREE.MathUtils.lerp(3, ball * 0.86, k)
      shadowMat.uniforms.uCenter.value.set(L.cx + THREE.MathUtils.lerp(16, 26, k) + lift * 0.3, L.cy - THREE.MathUtils.lerp(24, 42, k) - lift)
      shadowMat.uniforms.uBlur.value = THREE.MathUtils.lerp(34, 30, k) + lift * 0.4
      shadowMat.uniforms.uAlpha.value = THREE.MathUtils.lerp(0.2, 0.26, k) * st.opacity * (1 - Math.min(0.85, st.drop / (L.h * 0.45)))
      shadowMat.uniforms.uAngle.value = paper.rotation.z * (1 - k)

      const sig = [c, st.opacity, st.drop, st.spin, hov, st.hoverX, st.hoverY, pShown, mat.uniforms.uMix.value, L.w, L.cx, L.cy, st.shown].join()
      if (sig === lastSig && !dirty) return
      lastSig = sig
      dirty = false
      renderer.render(scene, camera)
    }
    gsap.ticker.add(frame)

    /* ---------- moving between posters ---------- */
    const settleUi = () => {
      const at = Math.round(st.p)
      setAtEnd(at >= last)
    }
    const stopPlay = () => {
      isPlaying = false
      playTimer?.kill()
      playTimer = null
      setPlaying(false)
    }
    const goTo = (to: number, done?: () => void) => {
      to = Math.min(Math.max(to, 0), last)
      tl?.kill()
      const from = pShown
      st.p = from
      if (Math.abs(to - from) < 1e-3) {
        done?.()
        return
      }
      if (reduce) {
        // simple crossfade, the knob just slides
        const fromIdx = scrubToView(from, n).index
        mode = 'jump'
        jump.idx = fromIdx
        jump.c = 0
        mat.uniforms.uMap2.value = texFor(to)
        tl = gsap.timeline({
          onComplete: () => {
            mode = 'scrub'
            mat.uniforms.uMix.value = 0
            settleUi()
            done?.()
          },
        })
        tl.to(st, { p: to, duration: 0.45, ease: 'power2.inOut' }, 0)
        tl.to(mat.uniforms.uMix, { value: 1, duration: 0.45, ease: 'power1.inOut' }, 0)
        tl.add(() => {
          jump.idx = to
          st.shown = -1
          show(to)
          mat.uniforms.uMix.value = 0
        })
        return
      }
      tl = gsap.timeline({
        onComplete: () => {
          mode = 'scrub'
          settleUi()
          done?.()
        },
      })
      if (Math.abs(to - from) <= 1.0001) {
        // adjacent: crumple into the ball (accelerating), unfold the next (settling)
        mode = 'scrub'
        const dir = Math.sign(to - from)
        const ball = Math.floor(Math.min(from, to)) + 0.5
        const crossesBall = (ball - from) * dir > 0
        if (crossesBall) {
          tl.to(st, { p: ball, duration: 0.25 + 0.5 * Math.abs(ball - from) * 2, ease: 'power2.in' })
          tl.to(st, { p: to, duration: 0.95, ease: 'power3.out' })
        } else tl.to(st, { p: to, duration: 0.3 + 0.75 * Math.abs(to - from) * 2, ease: 'power3.out' })
      } else {
        // far jump: one crumple, swap inside the ball, one unfold
        const v = view()
        mode = 'jump'
        jump.idx = v.index
        jump.c = v.crumple
        tl.to(jump, { c: 1, duration: 0.6 * (1 - jump.c) + 0.15, ease: 'power2.in' }, 0)
        tl.add(() => {
          jump.idx = to
        })
        tl.to(jump, { c: 0, duration: 0.95, ease: 'power3.out' })
        tl.to(st, { p: to, duration: tl.duration(), ease: 'power2.inOut' }, 0)
      }
    }
    const next = () => {
      stopPlay()
      const i = Math.round(pShown)
      goTo(i >= last ? 0 : i + 1)
    }
    const prev = () => {
      stopPlay()
      const i = Math.round(pShown)
      goTo(i <= 0 ? last : i - 1)
    }
    const step = () => {
      if (!isPlaying) return
      const i = Math.round(st.p)
      if (i >= last) {
        stopPlay()
        return
      }
      goTo(i + 1, () => {
        if (!isPlaying) return
        if (Math.round(st.p) >= last) stopPlay()
        else playTimer = gsap.delayedCall(1.15, step)
      })
    }
    const toggle = () => {
      if (isPlaying) {
        stopPlay()
        return
      }
      isPlaying = true
      setPlaying(true)
      if (Math.round(pShown) >= last) goTo(0, () => isPlaying && (playTimer = gsap.delayedCall(1.15, step)))
      else step()
    }
    apiRef.current = { next, prev, toggle }

    /* ---------- timeline drag ---------- */
    const trackP = (clientX: number) => {
      const r = track.getBoundingClientRect()
      return Math.min(Math.max((clientX - r.left) / (r.width || 1), 0), 1) * last
    }
    const onTrackDown = (e: PointerEvent) => {
      if (mode === 'intro') return
      e.preventDefault()
      stopPlay()
      tl?.kill()
      mode = 'scrub'
      dragging = true
      track.setPointerCapture(e.pointerId)
      st.p = trackP(e.clientX)
      track.focus({ preventScroll: true })
    }
    const onTrackMove = (e: PointerEvent) => {
      if (dragging) st.p = trackP(e.clientX)
    }
    const release = () => {
      if (!dragging) return
      dragging = false
      st.p = pShown
      const to = Math.round(pShown)
      tl?.kill()
      tl = gsap.timeline({ onComplete: settleUi })
      tl.to(st, { p: to, duration: 0.35 + Math.abs(to - pShown) * 0.9, ease: 'power3.out' })
    }
    const onTrackKey = (e: KeyboardEvent) => {
      if (mode === 'intro') return
      const map: Record<string, () => void> = {
        ArrowRight: next,
        ArrowDown: next,
        ArrowLeft: prev,
        ArrowUp: prev,
        Home: () => (stopPlay(), goTo(0)),
        End: () => (stopPlay(), goTo(last)),
      }
      if (map[e.key]) {
        e.preventDefault()
        map[e.key]()
      }
    }
    track.addEventListener('pointerdown', onTrackDown)
    track.addEventListener('pointermove', onTrackMove)
    track.addEventListener('pointerup', release)
    track.addEventListener('pointercancel', release)
    track.addEventListener('keydown', onTrackKey)

    /* ---------- poster: hover, swipe, click ---------- */
    let swipe: { x: number; y: number; p0: number; id: number; moved: boolean } | null = null
    let suppressClick = false
    const local = (e: PointerEvent) => {
      const r = hit.getBoundingClientRect()
      return [(e.clientX - r.left) / r.width - 0.5, (0.5 - (e.clientY - r.top) / r.height) * ASPECT]
    }
    const onHitDown = (e: PointerEvent) => {
      if (mode === 'intro') return
      swipe = { x: e.clientX, y: e.clientY, p0: Math.round(pShown), id: e.pointerId, moved: false }
    }
    const onHitMove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && !swipe) {
        const [x, y] = local(e)
        st.hx = x
        st.hy = y
      }
      if (!swipe || swipe.id !== e.pointerId) return
      const dx = e.clientX - swipe.x
      const dy = e.clientY - swipe.y
      if (!swipe.moved && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        swipe.moved = true
        stopPlay()
        tl?.kill()
        mode = 'scrub'
        dragging = true
        hit.setPointerCapture(e.pointerId)
      }
      if (swipe.moved) {
        // swipe left = forward in time-order (newest → oldest)
        const p = swipe.p0 - dx / (L.w * 1.1)
        st.p = Math.min(Math.max(p, Math.max(0, swipe.p0 - 1)), Math.min(last, swipe.p0 + 1))
      }
    }
    const onHitUp = (e: PointerEvent) => {
      if (!swipe || swipe.id !== e.pointerId) return
      const s = swipe
      swipe = null
      if (!s.moved) return
      suppressClick = true
      dragging = false
      const delta = pShown - s.p0
      const to = Math.abs(delta) > 0.22 ? s.p0 + Math.sign(delta) : s.p0
      goTo(to)
    }
    const onHitCancel = () => {
      if (swipe?.moved) {
        dragging = false
        goTo(swipe.p0)
      }
      swipe = null
    }
    const onHitEnter = () => gsap.to(st, { hover: 1, duration: 0.5, ease: 'power2.out' })
    const onHitLeave = () => gsap.to(st, { hover: 0, duration: 0.7, ease: 'power2.out' })
    const onHitClick = () => {
      if (suppressClick) {
        suppressClick = false
        return
      }
      if (mode === 'intro') return
      next()
    }
    hit.addEventListener('pointerdown', onHitDown)
    hit.addEventListener('pointermove', onHitMove)
    hit.addEventListener('pointerup', onHitUp)
    hit.addEventListener('pointercancel', onHitCancel)
    hit.addEventListener('pointerenter', onHitEnter)
    hit.addEventListener('pointerleave', onHitLeave)
    hit.addEventListener('click', onHitClick)

    /* ---------- arrow keys anywhere while it's on screen ---------- */
    const onKey = (e: KeyboardEvent) => {
      if (!visible || mode === 'intro' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      if (t && t !== document.body && !root.contains(t) && !t.closest('.ssf-notch')) return
      if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)

    /* ---------- observers ---------- */
    const ro = new ResizeObserver(layout)
    ro.observe(root)
    ro.observe(stage)
    let seen = false
    const io = new IntersectionObserver(
      ([en]) => {
        visible = en.isIntersecting
        dirty = true
        if (en.intersectionRatio >= 0.25) {
          seen = true
          begin()
        }
      },
      { threshold: [0, 0.25] },
    )
    io.observe(root)
    layout()

    /* ---------- the entrance ---------- */
    const head = headRef.current
    const lines = head ? head.querySelectorAll<HTMLElement>('.cc-line-in') : []
    const by = head ? Array.from(head.querySelectorAll<HTMLElement>('.cc-by')) : []
    const meta = metaRef.current
    const controls = controlsRef.current
    const intro = gsap.timeline({ paused: true })
    // software GL (old machines) can't animate this smoothly: land settled
    const gl = renderer?.getContext()
    const dbg = gl?.getExtension('WEBGL_debug_renderer_info')
    const software = !renderer || /swiftshader|llvmpipe|software/i.test(dbg ? String(gl!.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '')
    // the hidden start state is set only when the entrance actually runs
    const build = () => {
      gsap.set(knob, { scale: 0 })
      if (reduce) {
        gsap.set(lines, { yPercent: 0 })
        gsap.set([by, meta, controls], { opacity: 0 })
        intro.to(st, { opacity: 1, ticksIn: 1, c: 0, duration: 0.5 }, 0).to(jump, { c: 0, duration: 0.01 }, 0).to([by, meta, controls], { opacity: 1, duration: 0.5 }, 0).set(knob, { scale: 1 }, 0)
      } else {
        gsap.set(lines, { yPercent: 115, rotate: 4 })
        gsap.set(by, { opacity: 0, y: 8 })
        gsap.set(meta, { opacity: 0, y: 14 })
        gsap.set(controls, { opacity: 0, y: 10 })
        st.drop = L.h * 0.55
        st.spin = 1.6
        intro
          .to(lines, { yPercent: 0, rotate: 0, duration: 1.1, ease: 'expo.out', stagger: 0.09 }, 0)
          .to(by, { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' }, 0.35)
          // the first poster arrives as a ball, lands, and opens
          .to(st, { opacity: 1, duration: 0.25, ease: 'none' }, 0.1)
          .to(st, { drop: 0, duration: 0.7, ease: 'power2.in' }, 0.1)
          .to(st, { drop: L.h * 0.035, duration: 0.16, ease: 'power1.out' }, 0.8)
          .to(st, { drop: 0, duration: 0.2, ease: 'power1.in' }, 0.96)
          .to(st, { spin: 0, duration: 1.9, ease: 'power3.out' }, 0.1)
          .to(jump, { c: 0, duration: 1.25, ease: 'power3.out' }, 1.0)
          .to(st, { ticksIn: 1, duration: 1.3, ease: 'power2.out' }, 0.55)
          .to(knob, { scale: 1, duration: 0.7, ease: 'back.out(2.2)' }, 1.0)
          .to(meta, { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out' }, 1.45)
          .to(controls, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' }, 1.6)
      }
    }
    let begun = false
    function begin() {
      if (begun || !ready || disposed) return
      begun = true
      build()
      if (software) intro.progress(1)
      else intro.play()
    }
    intro.eventCallback('onComplete', () => {
      mode = 'scrub'
      st.p = pShown = 0
      warm(0)
      root.dataset.ready = 'true'
    })

    // the posters need their fonts before the first one is printed; all the
    // heavy first-time work (print, creases, shader compile, upload) happens
    // here, before the entrance starts, so the drop never stutters
    Promise.all([loadFonts(), ...list.map((m, i) => loadPhoto(m.photo).then((img) => (photos[i] = img)))]).then(() => {
      if (disposed) return
      show(0)
      if (renderer) {
        renderer.compile(scene, camera)
        renderer.initTexture(texFor(0))
      }
      ready = true
      dirty = true
      if (seen) begin()
    })

    return () => {
      disposed = true
      apiRef.current = null
      gsap.ticker.remove(frame)
      tl?.kill()
      playTimer?.kill()
      intro.kill()
      gsap.killTweensOf(st)
      ro.disconnect()
      io.disconnect()
      window.removeEventListener('keydown', onKey)
      track.removeEventListener('pointerdown', onTrackDown)
      track.removeEventListener('pointermove', onTrackMove)
      track.removeEventListener('pointerup', release)
      track.removeEventListener('pointercancel', release)
      track.removeEventListener('keydown', onTrackKey)
      hit.removeEventListener('pointerdown', onHitDown)
      hit.removeEventListener('pointermove', onHitMove)
      hit.removeEventListener('pointerup', onHitUp)
      hit.removeEventListener('pointercancel', onHitCancel)
      hit.removeEventListener('pointerenter', onHitEnter)
      hit.removeEventListener('pointerleave', onHitLeave)
      hit.removeEventListener('click', onHitClick)
      textures.forEach((t) => t?.dispose())
      blank.dispose()
      geo.dispose()
      mat.dispose()
      shadow.geometry.dispose()
      shadowMat.dispose()
      renderer?.dispose()
    }
  }, [])

  // pill + summary swap with the poster
  const first = React.useRef(true)
  React.useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const meta = metaRef.current
    if (!meta || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.fromTo(meta.children, { y: 9, opacity: 0, filter: 'blur(3px)' }, { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.55, ease: 'power3.out', stagger: 0.07, overwrite: true })
  }, [active])

  const u = list[active]
  const playLabel = playing ? 'Jeda' : atEnd ? 'Putar lagi' : 'Putar semua poster'

  return (
    <div ref={rootRef} className="cc-root">
      <canvas ref={canvasRef} className="cc-gl" aria-hidden="true" />
      <img ref={fallbackRef} className="cc-fallback" alt="" aria-hidden="true" />

      <div className="cc-wrap">
        <header ref={headRef} className="cc-head">
          <h2 className="cc-title">
            {TITLE.map((l) => (
              <span className="cc-line" key={l}>
                <span className="cc-line-in">{l}</span>
              </span>
            ))}
          </h2>
          <p className="cc-by">Bandung Build Challenge 2026</p>
        </header>

        <div ref={stageRef} className="cc-stage">
          <button ref={hitRef} type="button" className="cc-hit" aria-label={'Poster ' + u.name + ', ' + u.role + '. Tampilkan anggota berikutnya.'} />
        </div>

        <div className="cc-side">
          <div className="cc-legend">
            <button type="button" className="cc-round cc-prev" aria-label="Anggota sebelumnya" onClick={() => apiRef.current?.prev()}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <div ref={metaRef} className="cc-meta" aria-live="polite">
              <p className="cc-name">{u.name}</p>
              <p className="cc-role">{u.role}</p>
            </div>
            <button type="button" className="cc-round cc-next" aria-label="Anggota berikutnya" onClick={() => apiRef.current?.next()}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="cc-rail">
            <button ref={controlsRef} type="button" className="cc-round cc-play" aria-label={playLabel} onClick={() => apiRef.current?.toggle()}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={playing ? 'M8 5v14M16 5v14' : 'M7 4.5v15l12-7.5z'} />
              </svg>
            </button>
            <div
              ref={trackRef}
              className="cc-track"
              role="slider"
              tabIndex={0}
              aria-label="Anggota tim"
              aria-valuemin={1}
              aria-valuemax={n}
              aria-valuenow={active + 1}
              aria-valuetext={u.name + ', ' + u.role}
            >
              <div ref={ticksRef} className="cc-ticks" aria-hidden="true">
                {Array.from({ length: tickCount }, (_, i) => (
                  <i key={i} className="cc-tick" />
                ))}
              </div>
              <div ref={knobRef} className="cc-knob" aria-hidden="true">
                <svg width="20" height="10" viewBox="0 0 20 10" fill="currentColor">
                  <path d="M0 5 8 0v10zM20 5 12 0v10z" />
                </svg>
              </div>
              <div className="cc-labels" aria-hidden="true">
                {list.map((m, i) => (
                  <span key={m.name} data-on={i === active} style={{ left: (i / (n - 1)) * 100 + '%' }}>
                    {m.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
