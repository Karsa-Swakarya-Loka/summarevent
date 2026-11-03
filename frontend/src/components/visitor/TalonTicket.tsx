/**
 * The e-ticket as a card-stock ticket: the body carries the event and the QR, and below a perforation the stub carries
 * the seat. Adapted from «Talón» by Moxen (moxen.cl/recursos, licence in docs/lisensi/moxen-talon.txt).
 *
 * A new ticket's real QR assembles the way a scanner reads it: the three finder squares drop in, the fixed marks appear,
 * the data modules arrive in reading order and a green line validates it. Once the gate has scanned the ticket, its stub
 * tears off along the perforation and falls, the way an usher tears it at the door. Both play once; reduced motion shows
 * the end state.
 */
import { useEffect, useRef, useState } from 'react'
import { Check, Gift, Maximize2, UserRound } from 'lucide-react'
import { encode, QrCodeDataType } from 'uqr'
import type { PassItem } from '@/api/contract'
import { BrandAppIcon } from '@/components/common/Brand'
import { accessMethodNote, TICKET_STATUS_LABEL } from '@/domain/labels'
import { fmtDate, fmtRange, fmtTime } from '@/lib/format'
import { cn } from '@/lib/utils'

const INK = '#14241a'
const OK = '#0b7a35'
const RAD = Math.PI / 180
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
  g.strokeStyle = INK
  g.lineWidth = 1.4 * dpr
  g.lineCap = 'round'
  g.globalAlpha = 0.38 * (t < 0 ? 1 : 1 - 0.6 * smooth((t - 1.2) / 0.4))
  corners()
  g.fillStyle = INK
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
  // timing, alignment and format marks, together
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
    trail.addColorStop(0, 'rgba(11,122,53,0)')
    trail.addColorStop(1, OK)
    g.globalAlpha = 0.28
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

export function TalonTicket({
  item,
  status,
  live,
  issue = false,
  tear = false,
  torn = false,
  onZoom,
  onIssued,
  onTorn,
}: {
  item: PassItem
  /** what the ticket says next to the QR, e.g. "Mulai dalam 2 hari" */
  status: string
  live: boolean
  /** play the QR assembly (a ticket just issued) */
  issue?: boolean
  /** play the stub tearing off (a ticket the gate has just scanned) */
  tear?: boolean
  /** the stub is already gone (checked in) */
  torn?: boolean
  onZoom?: () => void
  /** the assembly or the tear started playing: the screen remembers it so it plays once */
  onIssued?: () => void
  onTorn?: () => void
}) {
  const { ticket, event, venue, session, category } = item
  const seat = splitSeat(ticket.seatLabel)
  const body = useRef<HTMLElement>(null)
  const stub = useRef<HTMLDivElement>(null)
  const paper = useRef<HTMLDivElement>(null)
  const curl = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<'issuing' | 'reading' | 'valid'>(issue && !reduced() ? 'issuing' : 'valid')
  const [stubGone, setStubGone] = useState(torn && !tear)
  const [falling, setFalling] = useState(false)
  const seed = hash(ticket.id)

  // the QR: drawn once, or assembled over three seconds for a new ticket
  useEffect(() => {
    const el = canvas.current
    const g = el?.getContext('2d')
    if (!el || !g) return
    const q = modelQr(ticket.qrToken)
    const dpr = Math.min(2, devicePixelRatio || 1)
    const css = el.offsetWidth
    el.width = Math.round(css * dpr)
    el.height = Math.round(css * dpr)
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
      if (next !== shown) setStage((shown = next))
      if (t < T.end) raf = requestAnimationFrame(frame)
      else drawQr(g, q, el.width, dpr, DONE)
    }
    // it assembles once the visitor can see it, not below the fold
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

  // the stub tears off: pulled on a spring until the paper gives, then it falls free, turning and fluttering
  useEffect(() => {
    if (!tear || stubGone) return
    const s = stub.current
    const p = paper.current
    const cv = curl.current
    if (!s || !p || !cv) return
    const collapse = () => {
      const h = s.offsetHeight
      const done = () => setStubGone(true)
      if (reduced() || !s.animate) return done()
      s.style.visibility = 'hidden'
      s.animate([{ height: `${h}px`, marginTop: '-4px' }, { height: '0px', marginTop: '0px' }], { duration: 320, easing: 'cubic-bezier(.22,1,.36,1)' }).onfinish = done
    }
    if (reduced()) {
      onTorn?.()
      s.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' })
      const t = window.setTimeout(collapse, 240)
      return () => window.clearTimeout(t)
    }
    const MAX = 17
    const side = -1
    const w = s.offsetWidth
    const h = s.offsetHeight
    const pivot: Pt = [w, 2]
    const centre: Pt = [w / 2, h / 2]
    s.style.transformOrigin = `${pivot[0]}px ${pivot[1]}px`
    p.style.transformOrigin = '50% 0'
    let phase: 'pull' | 'fall' | 'gone' = 'pull'
    let ang = 0
    let vang = 0
    const target = side * MAX * 1.1
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
    const paint = () => {
      if (phase === 'fall') {
        s.style.transform = `translate(${(shift[0] + x).toFixed(1)}px, ${(shift[1] + y).toFixed(1)}px) rotate(${ang.toFixed(2)}deg)`
        p.style.transform = `perspective(900px) rotateX(${(Math.sin(flutter) * 38 + 14).toFixed(1)}deg)`
        cv.style.opacity = (0.35 + 0.3 * Math.abs(Math.sin(flutter))).toFixed(3)
        return
      }
      const k = clamp(Math.abs(ang) / MAX, 0, 1)
      s.style.transform = ang ? `rotate(${ang.toFixed(2)}deg)` : ''
      p.style.transform = k ? `perspective(900px) rotateX(${(k * 16).toFixed(2)}deg)` : ''
      cv.style.opacity = (k * 0.85).toFixed(3)
    }
    const release = () => {
      const r = ang * RAD
      const dx = pivot[0] - centre[0]
      const dy = pivot[1] - centre[1]
      shift = [dx - (dx * Math.cos(r) - dy * Math.sin(r)), dy - (dx * Math.sin(r) + dy * Math.cos(r))]
      s.style.transformOrigin = `${centre[0]}px ${centre[1]}px`
      vx = -200 * 0.6 + side * -60
      vy = 500 * 0.6 + 120
      vang = vang * 0.5 + side * 110
      baseY = s.getBoundingClientRect().top
      phase = 'fall'
      setFalling(true)
    }
    const step = (now: number) => {
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60)
      last = now
      const hstep = 1 / 240
      for (let k = Math.max(1, Math.round(dt / hstep)); k > 0; k--) {
        if (phase === 'pull') {
          vang += (320 * (target - ang) - 19 * vang) * hstep
          ang += vang * hstep
        } else if (phase === 'fall') {
          vy += 2600 * hstep
          vx *= 1 - 0.7 * hstep
          vy *= 1 - 0.25 * hstep
          x += vx * hstep
          y += vy * hstep
          ang += vang * hstep
          vang *= 1 - 0.3 * hstep
          flutter += 7.5 * hstep
          fallTime += hstep
        }
      }
      if (phase === 'pull' && Math.abs(ang) >= MAX * 0.97) release()
      if (phase === 'fall' && (baseY + y > innerHeight + 80 || fallTime > 2.6)) {
        phase = 'gone'
        collapse()
        return
      }
      paint()
      raf = requestAnimationFrame(step)
    }
    // once the stub is on screen, a beat for the eye to land on it, then the tear
    let start = 0
    const io = whenVisible(s, 0.6, () => {
      onTorn?.()
      start = window.setTimeout(() => (raf = requestAnimationFrame(step)), 650)
    })
    return () => {
      io()
      window.clearTimeout(start)
      cancelAnimationFrame(raf)
    }
  }, [tear, stubGone]) // eslint-disable-line react-hooks/exhaustive-deps

  const valid = stage === 'valid'
  const usedAt = ticket.usedAt ? fmtTime(ticket.usedAt) : null
  return (
    <article
      className={cn('relative drop-shadow-[0_1px_1px_rgb(0_0_0/0.18)] drop-shadow-[0_18px_22px_rgb(20_36_26/0.16)]', falling && 'z-20')}
      aria-label={`E-ticket ${ticket.seatLabel ? `kursi ${ticket.seatLabel}` : category.name}${torn ? ', sudah dipakai' : ''}`}
    >
      <section ref={body} className="talon-paper relative overflow-hidden rounded-t-[1.25rem] px-5 pt-5 pb-7 text-[#14241a]">
        <i className="talon-grain" aria-hidden />
        <div className="relative flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-1.5 text-[0.66rem] font-bold tracking-[0.18em] text-[#5b5f55] uppercase">
            <BrandAppIcon className="size-5 shrink-0 rounded-md" />
            <span className="truncate">E-ticket</span>
          </p>
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-bold ring-1',
              ticket.status === 'ACTIVE' ? 'text-[#0b7a35] ring-[#0b7a35]/30' : 'text-[#5b5f55] ring-[#14241a]/15',
            )}
          >
            {ticket.status === 'ACTIVE' && <span className="size-1.5 rounded-full bg-[#0b7a35]" aria-hidden />}
            {TICKET_STATUS_LABEL[ticket.status]}
          </span>
        </div>
        <h3 className="relative mt-4 text-[1.6rem] leading-[1.08] font-extrabold tracking-tight text-balance">{event.title}</h3>
        <dl className="relative mt-4 grid grid-cols-[auto_auto_1fr] gap-x-5 border-t border-[#14241a]/14 pt-3">
          <div>
            <dt className="talon-label">Tanggal</dt>
            <dd className="talon-value">{session.demoLive ? 'Hari ini' : fmtDate(session.startAt, { weekday: 'short', day: 'numeric', month: 'short' })}</dd>
          </div>
          <div>
            <dt className="talon-label">Jam</dt>
            <dd className="talon-value">{fmtRange(session.startAt, session.endAt).replace(' WIB', '')}</dd>
          </div>
          <div className="min-w-0">
            <dt className="talon-label">Lokasi</dt>
            <dd className="talon-value truncate">{venue.name}</dd>
          </div>
        </dl>

        <div className="relative mt-4 flex items-center gap-4">
          <button
            type="button"
            onClick={onZoom}
            disabled={torn}
            className="group relative shrink-0 rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-[#14241a]/10 transition active:scale-95 disabled:opacity-60"
            aria-label={`Perbesar QR tiket ${ticket.code}`}
          >
            <canvas ref={canvas} className="block size-36" aria-hidden />
            {!torn && (
              <span className="absolute right-1 bottom-1 flex size-7 items-center justify-center rounded-full bg-ink/80 text-white" aria-hidden>
                <Maximize2 className="size-3.5" />
              </span>
            )}
          </button>
          <div className="min-w-0 flex-1 space-y-1.5">
            <p
              className={cn('flex h-5 items-center gap-1.5 text-[0.7rem] font-bold tracking-[0.16em] uppercase transition-colors', torn ? 'text-[#5b5f55]' : valid ? 'text-[#0b7a35]' : 'text-[#5b5f55]')}
              aria-live="polite"
            >
              {valid && !torn && <Check className="size-4" strokeWidth={3} aria-hidden />}
              {torn ? `Masuk ${usedAt ?? ''} WIB` : stage === 'issuing' ? 'Menerbitkan…' : stage === 'reading' ? 'Membaca…' : 'Siap dipindai'}
            </p>
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <UserRound className="size-4 shrink-0 text-[#5b5f55]" aria-hidden />
              <span className="truncate">{ticket.attendeeName ?? 'Nama belum diisi'}</span>
            </p>
            <p className="font-mono text-[0.95rem] font-bold tracking-wider">{ticket.code}</p>
            {status && (
              <p className={cn('flex items-center gap-1.5 text-xs font-semibold', live ? 'text-[#0b7a35]' : 'text-[#5b5f55]')}>
                {live && <span className="size-2 rounded-full bg-[#0b7a35]" aria-hidden />}
                {status}
              </p>
            )}
          </div>
        </div>
        {ticket.bonus && (
          <p className="relative mt-4 flex items-center gap-1.5 rounded-xl bg-[#0b7a35]/10 px-3 py-2 text-xs font-semibold text-[#0b6b35]">
            <Gift className="size-4 shrink-0" aria-hidden /> Bonus: {ticket.bonus}. Tunjukkan ke petugas.
          </p>
        )}
      </section>

      {!stubGone && (
        <div ref={stub} className="relative -mt-1 will-change-transform" aria-hidden={tear || undefined}>
          <div ref={paper} className="talon-paper relative flex items-end gap-4 rounded-b-[1.25rem] px-5 pt-6 pb-5 text-[#14241a] will-change-transform">
            <i className="talon-grain" aria-hidden />
            <p className="relative flex flex-col">
              <span className="talon-label">Untuk</span>
              <span className="text-[3.4rem] leading-[0.9] font-extrabold tabular-nums">1</span>
              <span className="text-[0.7rem] font-semibold text-[#5b5f55]">orang</span>
            </p>
            {seat ? (
              <dl className="relative mb-1 flex gap-4">
                <div>
                  <dt className="talon-label">Baris</dt>
                  <dd className="text-2xl leading-tight font-extrabold">{seat.row}</dd>
                </div>
                <div>
                  <dt className="talon-label">Kursi</dt>
                  <dd className="text-2xl leading-tight font-extrabold tabular-nums">{seat.number}</dd>
                </div>
              </dl>
            ) : (
              <p className="relative mb-1">
                <span className="talon-label block">Area</span>
                <span className="text-lg leading-tight font-extrabold">Tanpa nomor kursi</span>
              </p>
            )}
            <p className="relative mb-1 ml-auto text-right">
              <span className="flex items-center justify-end gap-1.5 text-sm font-bold">
                <span className="size-3 shrink-0 rounded-[4px]" style={{ background: category.color }} aria-hidden />
                {category.name}
              </span>
              {accessMethodNote(category) && <span className="block text-xs text-[#5b5f55]">{accessMethodNote(category)}</span>}
            </p>
            <i ref={curl} className="talon-curl" aria-hidden />
          </div>
        </div>
      )}
    </article>
  )
}
