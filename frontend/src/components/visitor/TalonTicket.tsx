/**
 * The e-ticket as a black card-stock ticket, adapted from «Talón» by Moxen (moxen.cl/recursos, licence in
 * docs/lisensi/moxen-talon.txt). The body carries the event and the real QR; below the perforation the stub carries the
 * seat and a Code 128 barcode of the ticket code.
 *
 * - A new ticket assembles its QR the way a scanner reads it: the finder squares drop in, the fixed marks appear, the
 *   data modules arrive in reading order and a green line validates it.
 * - After the gate has scanned the ticket, the stub tears off once by itself: it gives way at the perforation, falls
 *   turning and fluttering, and stays gone. Before that it is printed paper, so the visitor never tears a valid ticket
 *   by accident and the page scrolls under the finger as anywhere else.
 *
 * Reduced motion shows the end states.
 */
import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { encode, QrCodeDataType } from 'uqr'
import '@fontsource/libre-barcode-128-text/latin-400.css'
import type { PassItem } from '@/api/contract'
import { Poster } from '@/components/common/Poster'
import { posterColors } from '@/components/common/posterThemes'
import { fmtDate, fmtTime } from '@/lib/format'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/utils'

const QR_INK = '#231f20'
const OK = '#2fb36d'
const RAD = Math.PI / 180
const MAX = 17 // degrees of turn at which the paper gives
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))
const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u))
// a spring already solved: 0 to 1 with a small bounce, for things that land
const settle = (u: number) => (u <= 0 ? 0 : 1 - Math.exp(-7.5 * u) * Math.cos(11 * u))
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
function seeded(s: number) {
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}
function hash(text: string) {
  let h = 2166136261
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return ((h >>> 0) % 2147483645) + 1
}

/** Code 128 B with its start, check and stop characters, so the barcode font draws a code a reader can scan. */
function code128(t: string) {
  let sum = 104
  for (let i = 0; i < t.length; i++) sum += (t.charCodeAt(i) - 32) * (i + 1)
  const v = sum % 103
  return 'Ì' + t + (v === 0 ? 'Â' : String.fromCharCode(v < 95 ? v + 32 : v + 100)) + 'Î'
}

/* ---------- the QR: the real code, plus the order in which a reader meets it ---------- */
interface QrModel {
  n: number
  on: Uint8Array
  fixed: number[]
  data: number[]
  eyes: Array<[number, number]>
}
function modelQr(text: string): QrModel {
  const qr = encode(text, { ecc: 'M', border: 0 })
  const n = qr.size
  const on = new Uint8Array(n * n)
  const structure = new Uint8Array(n * n)
  const fixed: number[] = []
  for (let f = 0; f < n; f++)
    for (let c = 0; c < n; c++) {
      const i = f * n + c
      const type = qr.types[f][c]
      on[i] = qr.data[f][c] ? 1 : 0
      if (type !== QrCodeDataType.Data) structure[i] = 1
      if (on[i] && type !== QrCodeDataType.Data && type !== QrCodeDataType.Position) fixed.push(i)
    }
  // data modules in reading order: two columns at a time, zigzag from the bottom right, past the timing column
  const data: number[] = []
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    const up = ((right + 1) & 2) === 0
    for (let v = 0; v < n; v++)
      for (let j = 0; j < 2; j++) {
        const c = right - j
        const f = up ? n - 1 - v : v
        const i = f * n + c
        if (!structure[i] && on[i]) data.push(i)
      }
  }
  return { n, on, fixed, data, eyes: [[0, 0], [0, n - 7], [n - 7, 0]] }
}

// when each part of the assembly happens, in seconds
const T = { eyes: 0.05, eye: 0.11, fixed: 0.36, data: 0.46, dataDur: 0.95, scan: 1.52, scanDur: 0.72, valid: 2.26, end: 3.05 }
const DONE = 99

function drawQr(g: CanvasRenderingContext2D, q: QrModel, s: number, dpr: number, t: number) {
  const quiet = 1.6
  const m = s / (q.n + 2 * quiet)
  const o0 = quiet * m
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.clearRect(0, 0, s, s)
  // the viewfinder corners guide the eye, and fade once the code stands
  const e = m * 2.4
  const a = m * 0.35
  const b = s - m * 0.35
  const corners = () => {
    g.beginPath()
    g.moveTo(a, a + e)
    g.lineTo(a, a)
    g.lineTo(a + e, a)
    g.moveTo(b - e, a)
    g.lineTo(b, a)
    g.lineTo(b, a + e)
    g.moveTo(b, b - e)
    g.lineTo(b, b)
    g.lineTo(b - e, b)
    g.moveTo(a + e, b)
    g.lineTo(a, b)
    g.lineTo(a, b - e)
    g.stroke()
  }
  g.strokeStyle = QR_INK
  g.lineWidth = 1.4 * dpr
  g.lineCap = 'round'
  g.globalAlpha = 0.38 * (t < 0 ? 1 : 1 - 0.6 * smooth((t - 1.2) / 0.4))
  corners()
  g.fillStyle = QR_INK
  if (t < 0) {
    // not issued yet: a faint grid of the modules to come
    g.globalAlpha = 0.13
    for (let f = 0; f < q.n; f += 2) for (let c = 0; c < q.n; c += 2) g.fillRect(o0 + (c + 0.5) * m - dpr * 0.8, o0 + (f + 0.5) * m - dpr * 0.8, dpr * 1.6, dpr * 1.6)
    g.globalAlpha = 1
    return
  }
  const cell = (i: number, k: number) => {
    if (k <= 0) return
    const f = (i / q.n) | 0
    const c = i % q.n
    const z = m * k
    g.fillRect(Math.round(o0 + (c + 0.5) * m - z / 2), Math.round(o0 + (f + 0.5) * m - z / 2), Math.ceil(z), Math.ceil(z))
  }
  // the three finder squares drop onto the paper with their shadow
  q.eyes.forEach(([f0, c0], k) => {
    const u = t - (T.eyes + k * T.eye)
    if (u <= 0) return
    const p = settle((u / 0.55) * 1.4)
    const scale = 1 + (1 - p) * 0.9
    const alpha = smooth(u / 0.12)
    g.save()
    g.translate(o0 + (c0 + 3.5) * m, o0 + (f0 + 3.5) * m)
    if (scale > 1.01) {
      g.globalAlpha = 0.16 * alpha * (scale - 1)
      g.fillRect(-3.5 * m + (scale - 1) * 7 * dpr, -3.5 * m + (scale - 1) * 10 * dpr, 7 * m, 7 * m)
    }
    g.scale(scale, scale)
    g.globalAlpha = alpha
    for (let df = 0; df < 7; df++)
      for (let dc = 0; dc < 7; dc++) {
        if (!q.on[(f0 + df) * q.n + c0 + dc]) continue
        g.fillRect(Math.round((dc - 3.5) * m), Math.round((df - 3.5) * m), Math.ceil(m), Math.ceil(m))
      }
    g.restore()
  })
  g.globalAlpha = 1
  const kf = smooth((t - T.fixed) / 0.18)
  q.fixed.forEach((i) => cell(i, kf))
  // the data, in reading order: each module jumps a little as it lands
  const total = q.data.length
  for (let k = 0; k < total; k++) {
    const u = t - (T.data + (T.dataDur * k) / total)
    if (u <= 0) break
    const size = u >= 0.16 ? 1 : settle((u / 0.16) * 0.9) * (1 + 0.25 * Math.sin(Math.min(1, u / 0.16) * Math.PI))
    cell(q.data[k], Math.min(1.25, size))
  }
  // the reading line sweeps down with its trail
  const ul = (t - T.scan) / T.scanDur
  if (ul > 0 && ul < 1) {
    const y = (-0.04 + 1.08 * (ul < 0.5 ? 4 * ul * ul * ul : 1 - Math.pow(-2 * ul + 2, 3) / 2)) * s
    const trail = g.createLinearGradient(0, y - m * 7, 0, y)
    trail.addColorStop(0, 'rgba(47,179,109,0)')
    trail.addColorStop(1, OK)
    g.globalAlpha = 0.3
    g.fillStyle = trail
    g.fillRect(0, y - m * 7, s, m * 7)
    g.globalAlpha = 1
    g.fillStyle = OK
    g.fillRect(0, y - dpr, s, 2 * dpr)
  }
  // validated: the corners flash green for a moment
  const uv = t - T.valid
  if (uv > 0 && uv < 0.7) {
    g.globalAlpha = 1 - uv / 0.7
    g.strokeStyle = OK
    g.lineWidth = 2.4 * dpr
    corners()
  }
  g.globalAlpha = 1
}

/* ---------- the perforation: matching torn edges for the body and the stub ---------- */
type Pt = [number, number]
function seam(L: number, seed: number) {
  const r = seeded(seed)
  const R = 13
  const step = 11.5
  const ra = 2.6
  const n = Math.max(1, Math.floor((L - 2 * R - 10) / step))
  const start = (L - (n - 1) * step) / 2
  const body: Pt[] = []
  const stub: Pt[] = []
  const both = (u: number, d: number) => {
    body.push([u, d])
    stub.push([u, d])
  }
  both(R, 0)
  let prev = R
  for (let k = 0; k < n; k++) {
    const y = start + k * step
    for (let j = 1; j <= 2; j++) both(prev + ((y - ra - prev) * j) / 3, (r() - 0.5) * 3.2)
    for (let a = -90; a <= 90; a += 30) {
      const c = Math.cos(a * RAD)
      const s = Math.sin(a * RAD)
      body.push([y + ra * s, -ra * c])
      stub.push([y + ra * s, ra * c])
    }
    prev = y + ra
  }
  for (let j = 1; j <= 2; j++) both(prev + ((L - R - prev) * j) / 3, (r() - 0.5) * 3.2)
  both(L - R, 0)
  return { body, stub, R }
}
function arc(cu: number, cv: number, R: number, a0: number, a1: number, sign: number): Pt[] {
  const p: Pt[] = []
  for (let k = 0; k <= 6; k++) {
    const a = (a0 + ((a1 - a0) * k) / 6) * RAD
    p.push([cu + R * Math.sin(a), cv + sign * R * Math.cos(a)])
  }
  return p
}
const polygon = (pts: Pt[], base: number) => `polygon(${pts.map(([u, v]) => `${u.toFixed(1)}px ${(base + v).toFixed(1)}px`).join(',')})`

/** Run `go` once when `el` is at least `share` visible. Returns the cleanup. */
function whenVisible(el: Element, share: number, go: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    go()
    return () => undefined
  }
  const io = new IntersectionObserver(
    ([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      go()
    },
    { threshold: share },
  )
  io.observe(el)
  return () => io.disconnect()
}

function splitSeat(label: string | null): { row: string; number: string } | null {
  const m = label?.match(/^([A-Z]+)(\d+)$/)
  return m ? { row: m[1], number: m[2] } : null
}

/** Long event titles step down a size, so the display type always fits the ticket. */
function titleSize(title: string) {
  return title.length <= 14 ? 'text-[3.6rem]' : title.length <= 26 ? 'text-[3rem]' : 'text-[2.45rem]'
}

export function TalonTicket({
  item,
  issue = false,
  tear = false,
  onIssued,
  onTorn,
}: {
  item: PassItem
  /** play the QR assembly (a ticket just issued) */
  issue?: boolean
  /** a ticket the gate has just scanned: its stub tears off once by itself */
  tear?: boolean
  /** the assembly or the check-in tear started playing: the screen remembers it so it plays once */
  onIssued?: () => void
  onTorn?: () => void
}) {
  const { ticket, event, venue, session, category } = item
  const used = ticket.status === 'USED'
  const seat = splitSeat(ticket.seatLabel)
  const body = useRef<HTMLElement>(null)
  const stub = useRef<HTMLDivElement>(null)
  const paper = useRef<HTMLDivElement>(null)
  const curl = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<'issuing' | 'reading' | 'valid'>(issue && !reduced() ? 'issuing' : 'valid')
  const [stubGone, setStubGone] = useState(used && !tear)
  const [falling, setFalling] = useState(false)
  const seed = hash(ticket.id)

  // the QR: drawn once, or assembled over three seconds for a new ticket, once it is on screen
  useEffect(() => {
    const el = canvas.current
    const g = el?.getContext('2d')
    if (!el || !g) return
    const q = modelQr(ticket.qrToken)
    const dpr = Math.min(2, devicePixelRatio || 1)
    el.width = Math.round(el.offsetWidth * dpr)
    el.height = Math.round(el.offsetWidth * dpr)
    if (!issue || reduced()) {
      drawQr(g, q, el.width, dpr, DONE)
      return
    }
    let raf = 0
    let t0 = 0
    let shown = ''
    drawQr(g, q, el.width, dpr, -1)
    const frame = (now: number) => {
      t0 ||= now
      const t = (now - t0) / 1000
      drawQr(g, q, el.width, dpr, t)
      const next = t >= T.valid ? 'valid' : t >= T.scan ? 'reading' : 'issuing'
      if (next !== shown) {
        if (next === 'valid') haptic('success')
        setStage((shown = next))
      }
      if (t < T.end) raf = requestAnimationFrame(frame)
      else drawQr(g, q, el.width, dpr, DONE)
    }
    const io = whenVisible(el, 0.6, () => {
      onIssued?.()
      raf = requestAnimationFrame(frame)
    })
    return () => {
      io()
      cancelAnimationFrame(raf)
    }
  }, [ticket.qrToken, issue]) // eslint-disable-line react-hooks/exhaustive-deps

  // the perforation, cut to the ticket's width with this ticket's own teeth
  useEffect(() => {
    const b = body.current
    if (!b) return
    const cut = () => {
      const s = stub.current
      const p = paper.current
      const L = b.offsetWidth
      const c = seam(L, seed + 7)
      const D = b.offsetHeight
      b.style.clipPath = polygon([[0, -D], [0, -c.R], ...arc(0, 0, c.R, 0, 90, -1), ...c.body, ...arc(L, 0, c.R, -90, 0, -1), [L, -c.R], [L, -D]], D - 2)
      if (s && p) {
        const S = s.offsetHeight
        p.style.clipPath = polygon([[0, S], [0, c.R], ...arc(0, 0, c.R, 0, 90, 1), ...c.stub, ...arc(L, 0, c.R, -90, 0, 1), [L, c.R], [L, S]], 2)
      }
    }
    cut()
    const ro = new ResizeObserver(cut)
    ro.observe(b)
    return () => ro.disconnect()
  }, [seed, stubGone])

  // the stub after check-in: pulled on a spring until the paper gives, then a free body with gravity, air and spin that
  // flutters as it falls; gone, its room closes for good
  useEffect(() => {
    if (stubGone || !tear) return
    const s = stub.current
    const p = paper.current
    const cv = curl.current
    if (!s || !p || !cv) return
    const side = -1
    let phase: 'on' | 'pull' | 'fall' | 'gone' = 'on'
    let ang = 0
    let vang = 0
    let target = 0
    let x = 0
    let y = 0
    let vx = 0
    let vy = 0
    let flutter = 0
    let fallTime = 0
    let shift: Pt = [0, 0]
    let baseY = 0
    let raf = 0
    let last = 0
    let speed: Pt = [0, 0]
    const pivotOf = (): Pt => [s.offsetWidth, 2]
    const centreOf = (): Pt => [s.offsetWidth / 2, s.offsetHeight / 2]
    const home = () => {
      s.style.transformOrigin = `${pivotOf()[0]}px 2px`
      p.style.transformOrigin = '50% 0'
    }
    home()
    const paint = () => {
      if (phase === 'fall') {
        s.style.transform = `translate(${(shift[0] + x).toFixed(1)}px, ${(shift[1] + y).toFixed(1)}px) rotate(${ang.toFixed(2)}deg)`
        p.style.transform = `perspective(900px) rotateX(${(Math.sin(flutter) * 38 + 14).toFixed(1)}deg)`
        cv.style.opacity = (0.35 + 0.3 * Math.abs(Math.sin(flutter))).toFixed(3)
        return
      }
      const k = clamp(Math.abs(ang) / MAX, 0, 1)
      s.style.transform = ang ? `rotate(${ang.toFixed(2)}deg)` : ''
      p.style.transform = k && !reduced() ? `perspective(900px) rotateX(${(k * 16).toFixed(2)}deg)` : ''
      cv.style.opacity = (k * 0.85).toFixed(3)
    }
    const gone = () => {
      // the gate has taken this stub for good: its room closes
      phase = 'gone'
      s.style.visibility = 'hidden'
      setFalling(false)
      const h = s.offsetHeight
      if (reduced() || !s.animate) return setStubGone(true)
      s.animate([{ height: `${h}px`, marginTop: '-4px' }, { height: '0px', marginTop: '0px' }], { duration: 320, easing: 'cubic-bezier(.22,1,.36,1)' }).onfinish = () => setStubGone(true)
    }
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(step)
    }
    const release = () => {
      if (phase === 'fall' || phase === 'gone') return
      haptic('tap')
      if (reduced()) {
        phase = 'gone'
        const fade = s.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 220 })
        if (fade) fade.onfinish = gone
        else gone()
        return
      }
      const r = ang * RAD
      const pivot = pivotOf()
      const centre = centreOf()
      const dx = pivot[0] - centre[0]
      const dy = pivot[1] - centre[1]
      // turning about the pivot equals turning about the centre and moving by (I − R)(P − C): no jump when the axis changes
      shift = [dx - (dx * Math.cos(r) - dy * Math.sin(r)), dy - (dx * Math.sin(r) + dy * Math.cos(r))]
      s.style.transformOrigin = `${centre[0]}px ${centre[1]}px`
      vx = clamp(speed[0], -1800, 1800) * 0.6 + side * -60
      vy = clamp(speed[1], -600, 1800) * 0.6 + 120
      vang = vang * 0.5 + side * 110
      x = y = flutter = fallTime = 0
      baseY = s.getBoundingClientRect().top
      phase = 'fall'
      setFalling(true)
      wake()
    }
    function step(now: number) {
      raf = 0
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60)
      last = now
      const h = 1 / 240
      for (let k = Math.max(1, Math.round(dt / h)); k > 0; k--) {
        if (phase === 'on' || phase === 'pull') {
          vang += (320 * (target - ang) - 19 * vang) * h
          ang += vang * h
        } else if (phase === 'fall') {
          vy += 2600 * h
          vx *= 1 - 0.7 * h
          vy *= 1 - 0.25 * h
          x += vx * h
          y += vy * h
          ang += vang * h
          vang *= 1 - 0.3 * h
          flutter += 7.5 * h
          fallTime += h
        }
      }
      if (phase === 'pull' && Math.abs(ang) >= MAX * 0.97) release()
      if (phase === 'fall' && (baseY + y > innerHeight + 80 || fallTime > 2.6)) {
        last = 0
        return gone()
      }
      paint()
      const still = phase === 'on' && Math.abs(target - ang) + Math.abs(vang) < 0.01
      if (still) {
        ang = target
        vang = 0
        paint()
      }
      if (!still) wake()
      else last = 0
    }
    // the tear: a real pull, with its spring, until the paper gives
    const tearNow = () => {
      if (phase !== 'on') return
      if (reduced()) return release()
      phase = 'pull'
      target = side * MAX * 1.1
      speed = [-200, 500]
      wake()
    }
    // it waits until the stub is on screen, then a beat for the eye to land on it
    let auto = 0
    const io = whenVisible(s, 0.6, () => {
      onTorn?.()
      auto = window.setTimeout(tearNow, 650)
    })
    return () => {
      io()
      window.clearTimeout(auto)
      cancelAnimationFrame(raf)
    }
  }, [stubGone, tear]) // eslint-disable-line react-hooks/exhaustive-deps

  const valid = stage === 'valid'
  const colors = posterColors(event.posterTheme, event.posterPalette)
  const day = session.demoLive ? 'Hari ini' : fmtDate(session.startAt, { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')
  return (
    <article
      className={cn('relative mx-auto w-full max-w-[24rem] drop-shadow-[0_1px_1px_rgb(0_0_0/0.4)] drop-shadow-[0_26px_30px_rgb(0_0_0/0.28)]', falling && 'z-20')}
      aria-label={`E-ticket ${ticket.seatLabel ? `kursi ${ticket.seatLabel}` : category.name}${used ? ', sudah dipakai' : ''}`}
    >
      <section ref={body} className="talon-card relative overflow-hidden rounded-t-[1.1rem] px-6 pt-6 pb-8">
        {/* the event's poster printed along the top, in the panitia's colours */}
        <div className={cn('relative -mx-6 -mt-6 mb-5 h-12 overflow-hidden', used && 'opacity-50 saturate-0')} aria-hidden>
          <Poster theme={event.posterTheme} palette={event.posterPalette} title={event.title} bare className="absolute inset-0" />
          <span className="absolute bottom-2.5 left-6 rounded-full px-2 py-0.5 text-[0.6rem] font-bold tracking-[0.16em] uppercase" style={{ background: colors.accent, color: '#231f20' }}>
            {colors.label}
          </span>
        </div>
        <i className="talon-grain" aria-hidden />
        <div className="relative flex items-center justify-between gap-3">
          <p className="talon-label truncate">E-ticket · {category.name}</p>
          <span className="talon-chip">{used ? 'Sudah dipakai' : 'SUMMABA'}</span>
        </div>
        <h2 className={cn('relative mt-3 font-poster leading-[0.9] text-balance uppercase', titleSize(event.title))}>{event.title}</h2>
        <dl className="relative mt-5 grid grid-cols-[auto_auto_1fr] gap-x-5 border-t border-white/14 pt-4">
          <div>
            <dt className="talon-label">Tanggal</dt>
            <dd className="talon-value">{day}</dd>
          </div>
          <div>
            <dt className="talon-label">Jam</dt>
            <dd className="talon-value">{fmtTime(session.startAt)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="talon-label">Lokasi</dt>
            <dd className="talon-value talon-wrap line-clamp-2">{venue.name}</dd>
          </div>
        </dl>

        <div className="relative mt-5 flex items-center gap-5">
          <div className={cn('shrink-0 rounded-[0.9rem] bg-[#f4f1ea] p-1.5 transition-opacity', used && 'opacity-40')}>
            <canvas ref={canvas} className="block size-[8.25rem]" aria-hidden />
          </div>
          <p className={cn('talon-label flex items-center gap-1.5 transition-colors', valid && !used && 'text-[#2fb36d]')} aria-live="polite">
            {valid && !used && <Check className="size-4" strokeWidth={3} aria-hidden />}
            {used ? `Masuk ${ticket.usedAt ? fmtTime(ticket.usedAt) : ''}` : stage === 'issuing' ? 'Menerbitkan…' : stage === 'reading' ? 'Membaca…' : 'Siap dipindai'}
          </p>
        </div>
      </section>

      {!stubGone && (
        <div ref={stub} className="relative -mt-1 will-change-transform select-none">
          <div ref={paper} className="talon-card relative rounded-b-[1.1rem] px-6 pt-6 pb-5 will-change-transform">
            <i className="talon-grain" aria-hidden />
            <p className="talon-label absolute top-6 right-6 tabular-nums">Nº {ticket.code.replace('TKT-', '')}</p>
            <div className="relative flex items-end gap-4">
              {seat ? (
                <dl className="mb-1.5 shrink-0 space-y-1">
                  <div className="flex items-baseline gap-2.5">
                    <dt className="talon-label w-12">Baris</dt>
                    <dd className="font-poster text-2xl leading-none">{seat.row}</dd>
                  </div>
                  <div className="flex items-baseline gap-2.5">
                    <dt className="talon-label w-12">Kursi</dt>
                    <dd className="font-poster text-2xl leading-none tabular-nums">{seat.number}</dd>
                  </div>
                </dl>
              ) : (
                <p className="mb-1.5 min-w-0">
                  <span className="talon-label block">Area</span>
                  <span className="block font-poster text-2xl leading-none break-words uppercase">{category.name}</span>
                </p>
              )}
              <p className="talon-barcode mb-0.5 ml-auto shrink-0" aria-hidden>
                {code128(ticket.code)}
              </p>
            </div>
            <i ref={curl} className="talon-curl" aria-hidden />
          </div>
        </div>
      )}
    </article>
  )
}
