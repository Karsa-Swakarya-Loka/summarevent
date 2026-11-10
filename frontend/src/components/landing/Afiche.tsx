/**
 * Afiche: a fan of tall posters, adapted from «Afiche» by Moxen (moxen.cl/recursos, licence in
 * docs/lisensi/moxen-afiche.txt). Every property of every poster (position, turn, scale, opacity) is a spring chasing a
 * resting point computed from ONE number: the continuous position of the fan.
 *
 * - Hovering a poster lifts and straightens it and opens its neighbours (chosen by resting geometry, not the DOM).
 * - Dragging shuffles the fan with inertia and settles on the nearest poster; it is circular.
 * - Clicking a poster opens it: it comes to the front, grows, and the letters of its word climb in one by one.
 *   Escape or a click outside closes it.
 * - The action of each poster is a real button inside it, so keyboard users press it directly; focusing it brings its
 *   poster to the centre. The arrows and ← → move the fan.
 *
 * Only transform and opacity animate; under reduced motion the springs snap to their targets.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import './afiche.css'

export type PosterVariant = 'crema' | 'negro' | 'ambar'

export interface PosterSpec {
  key: string
  variant: PosterVariant
  /** The huge word (letters climb in when the poster opens). */
  word: string
  title: string
  note: string
  /** The two small lines along the top. */
  top?: [string, string]
  /** A short line, with an optional number set big. */
  foot: ReactNode
  /** A sticker or any art placed by the variant. */
  art?: ReactNode
  action: { label: ReactNode; name?: string; onClick?: () => void; href?: string; disabled?: boolean }
  /** A quieter second way in, under the action. */
  secondary?: { label: ReactNode; name?: string; onClick: () => void; disabled?: boolean }
}

const lim = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
/** The legend's height: the posters sit centred in the room above it. */
const LEG = 76
/** How much a hovered poster grows. */
const HOVER_GROW = 1.07
/** The air kept under the scene's top edge, in poster widths. */
const AIR = 0.03
/** Narrower than this the action crowds the poster's word, so on a short screen the rise gives way first. */
const READABLE = 200
const mod = (v: number, n: number) => ((v % n) + n) % n
type Spring = { x: number; v: number; meta: number; k: number; c: number }
const spring = (x: number, k: number, c: number): Spring => ({ x, v: 0, meta: x, k, c })
function step(r: Spring, h: number) {
  r.v += (r.k * (r.meta - r.x) - r.c * r.v) * h
  r.x += r.v * h
}

interface Options {
  paso: number
  giro: number
  radio: number
  sube: number
  muelle: [number, number]
  onCentre: (i: number) => void
  onFocusCard: (i: number) => void
}

/** Mounts the fan on an already rendered scene; returns the controls and a cleanup. */
function mount(scene: HTMLElement, o: Options) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const canHover = matchMedia('(hover: hover)').matches
  const cards = Array.from(scene.querySelectorAll<HTMLElement>('.af-cartel'))
  const N = cards.length
  let kk = 1
  let rise = 0
  let openGrow = 1
  let W = 0
  let H = 0
  const P = cards.map(() => ({ x: spring(0, o.muelle[0], o.muelle[1]), y: spring(0, o.muelle[0], o.muelle[1]), r: spring(0, o.muelle[0], o.muelle[1]), s: spring(1, o.muelle[0] * 1.2, o.muelle[1]), a: spring(1, 150, 20), v: spring(0, 120, 20) }))
  let s = 0
  let sMeta = 0
  let sVel = 0
  let drag: { id: number; x0: number; s0: number; mov: boolean; v: number; j: number; ctl: boolean } | null = null
  // a drag that began on a poster's button must not also press that button when the finger lifts
  let swallowClick = false
  let hover = -1
  let open = -1
  let lastCentre = -1
  let raf = 0

  function measure() {
    W = scene.clientWidth
    H = scene.clientHeight
    // The scene's top edge, just under the notch, cuts whatever passes it. A hovered poster reaches above its resting
    // centre by half its grown height, the corner a turned poster swings up, the air, and its rise.
    const room = (H - LEG) / 2
    const body = 0.7 * HOVER_GROW + 0.02 + AIR
    const withRise = room / (body + o.sube / 345)
    // from the design width, as long as the poster keeps its full rise; on a short screen it stays readable and rises less
    const w = Math.min(W < 700 ? W * 0.62 : 345 * lim(W / 1280, 0.55, 1.05), Math.max(withRise, Math.min(READABLE, room / body)))
    kk = w / 345
    rise = Math.min(o.sube * kk, room - body * w)
    openGrow = Math.min(W < 700 ? 1.12 : 1.16, (room / w - AIR) / 0.7)
    scene.style.setProperty('--af-w', Math.round(w) + 'px')
  }
  const dist = (j: number) => mod(j - s + N / 2, N) - N / 2
  function rest(j: number) {
    const d = dist(j)
    const th = d * o.giro
    const R = o.radio * kk
    return { d, x: Math.sin(th) * R * (o.paso / (o.giro * o.radio)), y: R * (1 - Math.cos(th)) * 0.5, r: th, z: 100 - Math.abs(d) * 10 }
  }
  function targets() {
    const base = cards.map((_, j) => rest(j))
    cards.forEach((c, j) => {
      const b = base[j]
      const p = P[j]
      let x = b.x * kk
      let y = b.y * kk - LEG / 2
      let r = b.r
      let sc = 1
      const op = 1 - lim((Math.abs(b.d) - 2.05) * 4, 0, 1)
      let z = b.z
      let veil = 0
      if (open >= 0) {
        if (j === open) {
          y = -LEG / 2
          r = 0
          sc = openGrow
          z = 300
          x = 0
        } else {
          x *= 1.45
          y += 70 * kk
          sc = 0.84
          r *= 1.15
          veil = 0.5
        }
      } else if (hover >= 0 && !drag) {
        if (j === hover) {
          y -= rise
          r *= 0.35
          sc = HOVER_GROW
          z = 200
        } else {
          const e = b.d - base[hover].d
          const sg = Math.sign(e) || 1
          x += (sg * 78 * kk) / (Math.abs(e) * 0.8 + 0.6)
          r += sg * 0.035
        }
      }
      p.x.meta = x
      p.y.meta = y
      p.r.meta = r
      p.s.meta = sc
      p.a.meta = op
      p.v.meta = veil
      c.style.zIndex = String(Math.round(z))
    })
  }
  /** Which poster is under the pointer: the resting rectangles, top to bottom. */
  function under(px: number, py: number) {
    const w = parseFloat(getComputedStyle(cards[0]).width) || 300
    const h = w * 1.4
    const order = cards.map((_, j) => j).sort((a, b) => rest(b).z - rest(a).z)
    for (const j of order) {
      const b = rest(j)
      if (Math.abs(b.d) > 2.05) continue
      const cx = W / 2 + b.x * kk
      const cy = H / 2 + b.y * kk - LEG / 2
      const dx = px - cx
      const dy = py - cy
      const cs = Math.cos(-b.r)
      const sn = Math.sin(-b.r)
      const lx = dx * cs - dy * sn
      const ly = dx * sn + dy * cs
      if (Math.abs(lx) < w / 2 && Math.abs(ly) < h / 2) return j
    }
    return -1
  }
  const centre = () => mod(Math.round(sMeta), N)
  function goTo(j: number) {
    const dd = mod(j - Math.round(sMeta) + N / 2, N) - N / 2
    sMeta = Math.round(sMeta) + dd
  }
  function openCard(j: number) {
    if (open === j) return
    if (open >= 0) cards[open].classList.remove('af-abierto')
    open = j
    hover = -1
    goTo(j)
    const c = cards[j]
    c.classList.remove('af-abierto')
    void c.offsetWidth
    c.classList.add('af-abierto')
    scene.setAttribute('data-abierto', '')
  }
  function close() {
    if (open < 0) return
    cards[open].classList.remove('af-abierto')
    open = -1
    scene.removeAttribute('data-abierto')
  }
  function move(delta: number) {
    sMeta = Math.round(sMeta) + delta
    if (open >= 0) openCard(mod(Math.round(sMeta), N))
  }

  const pos = (e: PointerEvent): [number, number] => {
    const r = scene.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const onMove = (e: PointerEvent) => {
    const [x, y] = pos(e)
    if (drag && e.pointerId === drag.id) {
      const dx = x - drag.x0
      // a press on a button needs a clearer sideways move, so a tap that wobbles a little still presses it
      if (!drag.mov && Math.abs(dx) > (drag.ctl ? 10 : 6)) {
        drag.mov = true
        // a press on a button only becomes ours once it moves; until then the button keeps its own tap
        if (drag.ctl) {
          try {
            scene.setPointerCapture(drag.id)
          } catch {
            /* fine */
          }
        }
      }
      if (drag.mov) {
        const next = drag.s0 - dx / (o.paso * kk)
        drag.v = drag.v * 0.6 + (next - s) * 0.4
        s = sMeta = next
        if (open >= 0) close()
      }
      return
    }
    if (e.pointerType !== 'mouse' || !canHover || open >= 0) return
    hover = under(x, y)
    scene.style.cursor = hover >= 0 ? 'pointer' : 'default'
  }
  const onLeave = () => {
    if (!drag) hover = -1
  }
  const onDown = (e: PointerEvent) => {
    // On a phone the poster's buttons cover most of it, so a swipe may start on one: track it, capture only once it moves.
    swallowClick = false
    const ctl = !!(e.target as Element).closest('button, a')
    const [x, y] = pos(e)
    drag = { id: e.pointerId, x0: x, s0: s, mov: false, v: 0, j: under(x, y), ctl }
    if (ctl) return
    try {
      scene.setPointerCapture(e.pointerId)
    } catch {
      /* fine */
    }
  }
  const onClickCapture = (e: MouseEvent) => {
    if (!swallowClick) return
    swallowClick = false
    e.preventDefault()
    e.stopPropagation()
  }
  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return
    const g = drag
    drag = null
    if (g.ctl && !g.mov) return
    if (g.mov) {
      swallowClick = g.ctl
      // the click a drag can leave behind comes right after this release; if none comes (a touch drag, a cancelled
      // press), forget it so the next Enter or screen-reader activation on a poster button still works
      if (g.ctl) setTimeout(() => (swallowClick = false), 0)
      // one swipe = one poster in the swipe's direction (the old release subtracted the velocity, so short swipes
      // snapped back and the fan felt stuck); a long drag still lands on the nearest poster
      const moved = s - g.s0
      let steps = Math.round(moved + g.v * 3)
      if (steps === 0 && Math.abs(moved) > 0.2) steps = Math.sign(moved)
      if (Math.abs(moved) < 1.5) steps = lim(steps, -1, 1)
      sMeta = Math.round(g.s0) + steps
      sVel = g.v * 60
      return
    }
    if (open >= 0) {
      if (g.j === open || g.j < 0) close()
      else openCard(g.j)
      return
    }
    if (g.j >= 0) openCard(g.j)
  }
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as Element | null
    if (e.key === 'Escape') return close()
    if (t?.closest('input, textarea, select, [contenteditable]')) return
    if (!scene.contains(t) && !scene.matches(':hover')) return
    if (e.key === 'ArrowRight') move(1)
    else if (e.key === 'ArrowLeft') move(-1)
  }
  scene.addEventListener('pointermove', onMove)
  scene.addEventListener('pointerleave', onLeave)
  scene.addEventListener('pointerdown', onDown)
  scene.addEventListener('pointerup', onUp)
  scene.addEventListener('pointercancel', onUp)
  scene.addEventListener('click', onClickCapture, true)
  document.addEventListener('keydown', onKey)
  // a focused action brings its poster to the centre and shows it whole
  const focusers = cards.map((c, j) => {
    const f = (e: FocusEvent) => {
      // focus that comes from a tap or a swipe must not pull the fan back; only keyboard focus centres a poster
      if (drag || !(e.target as Element).matches(':focus-visible')) return
      hover = canHover ? j : -1
      goTo(j)
      o.onFocusCard(j)
    }
    c.addEventListener('focusin', f)
    return f
  })

  let before = 0
  function frame(ts: number) {
    const dt = lim((ts - (before || ts)) / 1000, 0, 1 / 30)
    before = ts
    if (!drag) {
      const h = dt / 2
      for (let k = 0; k < 2; k++) {
        sVel += (o.muelle[0] * 0.55 * (sMeta - s) - 2 * Math.sqrt(o.muelle[0] * 0.55) * 0.72 * sVel) * h
        s += sVel * h
      }
    }
    targets()
    cards.forEach((c, j) => {
      const p = P[j]
      if (reduce) {
        p.x.x = p.x.meta
        p.y.x = p.y.meta
        p.r.x = p.r.meta
        p.s.x = p.s.meta
        p.a.x = p.a.meta
        p.v.x = p.v.meta
      } else {
        const h = dt / 2
        for (let k = 0; k < 2; k++) {
          step(p.x, h)
          step(p.y, h)
          step(p.r, h)
          step(p.s, h)
          step(p.a, h)
          step(p.v, h)
        }
      }
      c.style.transform = `translate3d(${p.x.x.toFixed(1)}px,${p.y.x.toFixed(1)}px,0) rotate(${p.r.x.toFixed(4)}rad) scale(${p.s.x.toFixed(4)})`
      c.style.opacity = lim(p.a.x, 0, 1).toFixed(3)
      c.style.setProperty('--vel', lim(p.v.x, 0, 0.8).toFixed(3))
      c.style.pointerEvents = p.a.meta < 0.3 ? 'none' : ''
    })
    const cen = centre()
    if (cen !== lastCentre) {
      lastCentre = cen
      o.onCentre(cen)
    }
    raf = requestAnimationFrame(frame)
  }
  measure()
  targets()
  cards.forEach((_, j) => {
    const p = P[j]
    p.x.x = p.x.meta
    p.y.x = p.y.meta
    p.r.x = p.r.meta
    p.s.x = p.s.meta
    p.a.x = p.a.meta
    p.v.x = p.v.meta
  })
  raf = requestAnimationFrame(frame)
  const ro = new ResizeObserver(measure)
  ro.observe(scene)

  return {
    move,
    close,
    destroy() {
      cancelAnimationFrame(raf)
      ro.disconnect()
      scene.removeEventListener('pointermove', onMove)
      scene.removeEventListener('pointerleave', onLeave)
      scene.removeEventListener('pointerdown', onDown)
      scene.removeEventListener('pointerup', onUp)
      scene.removeEventListener('pointercancel', onUp)
      scene.removeEventListener('click', onClickCapture, true)
      document.removeEventListener('keydown', onKey)
      cards.forEach((c, j) => c.removeEventListener('focusin', focusers[j]))
    },
  }
}

export function Afiche({ posters, label, className }: { posters: PosterSpec[]; label: string; className?: string }) {
  const scene = useRef<HTMLDivElement>(null)
  const fan = useRef<ReturnType<typeof mount> | null>(null)
  const [centre, setCentre] = useState(0)

  useEffect(() => {
    const el = scene.current
    if (!el) return
    const f = mount(el, { paso: 150, giro: 0.12, radio: 900, sube: 40, muelle: [190, 21], onCentre: setCentre, onFocusCard: () => undefined })
    fan.current = f
    return () => {
      f.destroy()
      fan.current = null
    }
  }, [posters.length])

  const current = posters[centre] ?? posters[0]
  return (
    <div ref={scene} className={'af-escena' + (className ? ' ' + className : '')}>
      <div className="af-abanico" role="group" aria-label={label}>
        {posters.map((p, i) => (
          <article key={p.key} className={'af-cartel af-' + p.variant} data-titulo={p.title} data-nota={p.note} aria-label={`Poster ${i + 1} dari ${posters.length}: ${p.title}`}>
            {p.variant === 'crema' && <i className="af-sol" aria-hidden />}
            {p.variant === 'negro' && (
              <div className="af-arcos" aria-hidden>
                <i />
                <i />
                <i />
              </div>
            )}
            {p.variant === 'ambar' && (
              <div className="af-medios" aria-hidden>
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
            )}
            {p.top && (
              <p className="af-arriba">
                <span>{p.top[0]}</span>
                <span>{p.top[1]}</span>
              </p>
            )}
            <h2 className="af-palabra" aria-label={p.word}>
              {[...p.word].map((ch, k) => (
                <span key={k} aria-hidden style={{ '--i': k } as React.CSSProperties}>
                  {ch}
                </span>
              ))}
            </h2>
            {p.art && <div className="af-stiker">{p.art}</div>}
            <div className="af-pie">
              <em>{p.foot}</em>
              {p.action.href ? (
                <a className="af-cta" href={p.action.href} aria-label={p.action.name}>
                  {p.action.label}
                </a>
              ) : (
                <button type="button" className="af-cta" onClick={p.action.onClick} disabled={p.action.disabled} aria-label={p.action.name}>
                  {p.action.label}
                </button>
              )}
              {p.secondary && (
                <button type="button" className="af-link" onClick={p.secondary.onClick} disabled={p.secondary.disabled} aria-label={p.secondary.name}>
                  {p.secondary.label}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      <div className="af-leyenda">
        <button className="af-flecha" type="button" aria-label="Poster sebelumnya" onClick={() => fan.current?.move(-1)}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <p className="af-datos" aria-live="polite">
          <b>{current.title}</b>
          <span>{current.note}</span>
        </p>
        <button className="af-flecha" type="button" aria-label="Poster berikutnya" onClick={() => fan.current?.move(1)}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}
