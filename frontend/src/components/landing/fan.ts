/**
 * The motion of the poster fan (Afiche.tsx). One number drives it: `s`, the fan's position in posters (0 = the first
 * poster in front). Every poster's resting pose is a linear function of its distance to `s`, and while a finger is
 * down `s` is the finger's travel over one poster width: a third of the way across moves every poster a third of its
 * way, half way the two posters stand level (and swap on top), and nothing chases anything. Letting go, the arrows, a
 * sideways trackpad swipe or an arrow key eases `s` to a whole poster, never more than one on, in one calm ease-out
 * curve (no overshoot).
 *
 * The order is a circle (with three posters: the previous role on the left, the next on the right), so at rest the
 * arrangement is always the same: the front poster straight, whole and centred, its neighbours behind it, offset,
 * turned and shrunk by the same amount on each side, fully opaque, everything inside the scene. The one poster that
 * has to change sides slides in behind the two posters in front, hidden and opaque, and out at the other side, so
 * nothing crosses the front. The stacking order is only ever which poster is closest to the centre. A drag past one
 * poster resists. Tapping a neighbour brings it to the front; a tap on the front poster's body does nothing.
 *
 * The posters stay put under the mouse: no hover lift. Only transforms change; under reduced motion everything lands
 * at once.
 */
const lim = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const mod = (v: number, n: number) => ((v % n) + n) % n
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

/** The arrows under the fan and the gap above them: the poster and the arrows are centred together. */
const LEG = 64
/** The air kept under the scene's top edge and beside the posters, in px. */
const EDGE = 12
/** A poster's height over its width. */
const TALL = 1.4
const MAX_W = 345

// in poster widths and radians: neighbour offset, drop, turn and scale
const OFF = 0.21
const DROP = 0.05
const TURN = 0.07
const SIDE = 0.86

/** Settling to a poster: the duration of the ease. */
const SETTLE_MS = [380, 450] as const
/** How far past the middle the front poster has to go before it hands over, so the stacking cannot flicker. */
const HYSTERESIS = 0.01
/** A press becomes a swipe past this many px sideways, if it went more sideways than up or down. */
const SLOP = 8
/** One poster per this much finger travel, in front-poster widths. */
const DRAG_STEP = 1
/** A release this fast, in px per ms, goes on to the next poster even before half way. */
const FLICK = 0.45
/** A sideways trackpad swipe: how far it has to go, and the quiet after it, so one gesture is one poster. */
/** How often the frame checks the scene still has the size the posters were made for. */
const RESYNC_MS = 500
const WHEEL_PX = 40
const WHEEL_QUIET_MS = 450
/** Past one poster a drag gives at most this much more, so the poster in front never gets further than the next one. */
const RUBBER = 0.35

interface Pose {
  x: number
  y: number
  r: number
  k: number
}

interface FanOptions {
  onCentre: (i: number) => void
  /** The poster in front at the start; the middle one when absent or out of range. */
  start?: number
}

export interface Fan {
  /** One poster on (1) or back (-1). */
  move: (step: 1 | -1) => void
  destroy: () => void
}

/** Mounts the fan on an already rendered scene; returns the controls. */
export function mountFan(scene: HTMLElement, o: FanOptions): Fan {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const canHover = matchMedia('(hover: hover)').matches
  const cards = Array.from(scene.querySelectorAll<HTMLElement>('.af-cartel'))
  const N = cards.length
  let W = 0
  let H = 0
  let w = 300
  /** Where the fan starts: the poster asked for, or the middle one. */
  const home = o.start !== undefined && o.start >= 0 && o.start < N ? o.start : Math.floor((N - 1) / 2)
  let s = home
  /** The poster closest to the centre, on top. */
  let centre = home
  let tween: { from: number; to: number; t0: number; ms: number } | null = null
  let drag: { id: number; x0: number; y0: number; s0: number; base: number; mov: boolean; up: boolean; j: number; ctl: boolean; hist: Array<[number, number]> } | null = null
  // a drag that began on a poster's button must not also press that button when the finger lifts
  let swallowClick = false
  let raf = 0
  const written = cards.map(() => '')

  function measure() {
    W = scene.clientWidth
    H = scene.clientHeight
    // above its centre the front poster needs half its height and the air; beside it, the
    // neighbour's offset, its half width and the corner its turn swings out
    const room = (H - LEG) / 2 - EDGE
    w = Math.max(120, Math.min(MAX_W, room / 0.7, (W / 2 - EDGE) / (OFF + SIDE / 2 + (TALL / 2) * SIDE * Math.sin(TURN))))
    scene.style.setProperty('--af-w', Math.round(w) + 'px')
  }

  /** Distance from the front the short way round, in posters, between -N/2 and N/2. */
  const dist = (j: number) => mod(j - s + N / 2, N) - N / 2

  /** The resting pose, from the scene's centre. */
  function pose(j: number): Pose {
    const d = dist(j)
    const u = Math.abs(d)
    const sg = Math.sign(d)
    const y0 = -LEG / 2
    if (u <= 1) return { x: d * OFF * w, y: y0 + u * DROP * w, r: d * TURN, k: 1 - u * (1 - SIDE) }
    // past a neighbour (only the poster changing sides): it slides in behind the two posters in front and shrinks, so
    // it is hidden, fully opaque, when it changes sides half way, and comes out the same way on the other side
    const t = Math.min(1, (u - 1) * 2)
    return { x: sg * OFF * w * (1 - t), y: y0 + DROP * w * (1 - t), r: sg * TURN * (1 - t), k: SIDE * (1 - 0.1 * t) }
  }

  /** The front poster hands over half way to the next one, with a little hysteresis. */
  function updateCentre() {
    if (Math.abs(dist(centre)) < 0.5 + HYSTERESIS) return
    centre = mod(Math.round(s), N)
    o.onCentre(centre)
  }

  function z(j: number) {
    if (j === centre) return 30
    return Math.abs(dist(j)) > 1 ? 10 : 20
  }

  function settle(to: number, speed = 0) {
    const from = s
    const gap = Math.abs(to - from)
    if (reduce || gap < 1e-3) {
      s = to
      tween = null
      return
    }
    // an ease-out cubic starts at 3 × gap / duration: pick the duration that keeps the finger's speed
    const ms = speed > 0 ? lim((3 * gap) / speed, SETTLE_MS[0], SETTLE_MS[1]) : SETTLE_MS[1]
    tween = { from, to, t0: performance.now(), ms }
  }
  /** Poster j to the front, the short way round (one step with three posters), from wherever the fan is heading. */
  function goTo(j: number) {
    const from = Math.round(tween ? tween.to : s)
    settle(from + (mod(j - from + N / 2, N) - N / 2))
  }
  const step = (by: 1 | -1) => goTo(mod(Math.round(tween ? tween.to : s) + by, N))

  /** Which poster is under the pointer: the resting rectangles, front to back. */
  function under(px: number, py: number) {
    const order = cards.map((_, j) => j).sort((a, b) => z(b) - z(a))
    for (const j of order) {
      const p = pose(j)
      const dx = px - (W / 2 + p.x)
      const dy = py - (H / 2 + p.y)
      const lx = dx * Math.cos(-p.r) - dy * Math.sin(-p.r)
      const ly = dx * Math.sin(-p.r) + dy * Math.cos(-p.r)
      if (Math.abs(lx) < (w * p.k) / 2 && Math.abs(ly) < (w * TALL * p.k) / 2) return j
    }
    return -1
  }

  const at = (e: PointerEvent): [number, number] => {
    const r = scene.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    // On a phone the poster's buttons cover most of it, so a swipe may start on one: track it, capture only once it moves.
    swallowClick = false
    const ctl = !!(e.target as Element).closest('button, a')
    const [x, y] = at(e)
    // catching the fan mid-settle holds it where it is
    tween = null
    drag = { id: e.pointerId, x0: x, y0: y, s0: s, base: Math.round(s), mov: false, up: false, j: under(x, y), ctl, hist: [[e.timeStamp, s]] }
    if (ctl) return
    try {
      scene.setPointerCapture(e.pointerId)
    } catch {
      /* fine */
    }
  }
  const onMove = (e: PointerEvent) => {
    const [x, y] = at(e)
    if (drag && e.pointerId === drag.id) {
      if (drag.up) return
      const dx = x - drag.x0
      const dy = y - drag.y0
      // a press that goes up or down first is the page's scroll, never the fan's
      if (!drag.mov && Math.abs(dy) > SLOP && Math.abs(dy) >= Math.abs(dx)) {
        drag.up = true
        return
      }
      if (!drag.mov && Math.abs(dx) > SLOP) {
        drag.mov = true
        // from here on the poster moves with the finger, without first jumping the slop
        drag.x0 = x
        // a press on a button only becomes ours once it moves; until then the button keeps its own tap
        if (drag.ctl) {
          try {
            scene.setPointerCapture(drag.id)
          } catch {
            /* fine */
          }
        }
      }
      if (!drag.mov) return
      // one poster width of finger travel is one poster of progress, linear; past that the fan resists
      let next = drag.s0 - (x - drag.x0) / (DRAG_STEP * w)
      const over = next - drag.base
      if (Math.abs(over) > 1) next = drag.base + Math.sign(over) * (1 + RUBBER * (1 - Math.exp(-(Math.abs(over) - 1) / RUBBER)))
      s = next
      drag.hist.push([e.timeStamp, s])
      if (drag.hist.length > 6) drag.hist.shift()
      return
    }
    if (e.pointerType !== 'mouse' || !canHover) return
    const j = under(x, y)
    scene.style.cursor = j >= 0 && j !== centre ? 'pointer' : ''
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
    if (g.up || (g.ctl && !g.mov)) return
    if (g.mov) {
      swallowClick = g.ctl
      // the click a drag can leave behind comes right after this release; if none comes (a touch drag, a cancelled
      // press), forget it so the next Enter or screen-reader activation on a poster button still works
      if (g.ctl) setTimeout(() => (swallowClick = false), 0)
      // the speed over the last few moves, in posters per ms
      const [t0, s0] = g.hist[0]
      const dt = e.timeStamp - t0
      const v = dt > 0 && e.timeStamp - g.hist[g.hist.length - 1][0] < 100 ? (s - s0) / dt : 0
      // it stays on the poster in front when the finger lifts (the next one once past half way); only a clear flick
      // short of half way goes on to the next, and a flick back short of it returns. Never more than one poster.
      let by = Math.round(lim(s - g.base, -1, 1))
      const flick = Math.abs(v) * DRAG_STEP * w > FLICK ? Math.sign(v) : 0
      if (by === 0) by = flick
      else if (flick === -by) by = 0
      const to = g.base + by
      settle(to, Math.sign(to - s) === Math.sign(v) ? Math.abs(v) : 0)
      return
    }
    // a tap on a neighbour brings it to the front
    if (g.j >= 0 && g.j !== centre && e.type === 'pointerup') goTo(g.j)
  }
  // Only the scene losing its own capture ends a gesture. A touch on a button is captured by that button first, and
  // the scene taking the capture over (once the press turns into a swipe) makes the button lose it; that event
  // bubbles up here and must not end the swipe it starts.
  const onLost = (e: PointerEvent) => {
    if (e.target === scene) onUp(e)
  }
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as Element | null
    if (t?.closest('input, textarea, select, [contenteditable]')) return
    if (!scene.contains(t) && !scene.matches(':hover')) return
    if (e.key === 'ArrowRight') step(1)
    else if (e.key === 'ArrowLeft') step(-1)
  }
  // A sideways trackpad swipe moves one poster, then waits for the gesture to end; an up-and-down wheel is the page's.
  let wheelSum = 0
  let wheelAt = 0
  let wheelSpent = false
  const onWheel = (e: WheelEvent) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
    e.preventDefault()
    if (e.timeStamp - wheelAt > WHEEL_QUIET_MS) {
      wheelSum = 0
      wheelSpent = false
    }
    wheelAt = e.timeStamp
    if (wheelSpent) return
    wheelSum += e.deltaX
    if (Math.abs(wheelSum) < WHEEL_PX) return
    wheelSpent = true
    step(wheelSum > 0 ? 1 : -1)
  }
  // keyboard focus on a poster's actions brings that poster to the front; focus from a tap or a swipe does not
  const focusers = cards.map((c, j) => {
    const f = (e: FocusEvent) => {
      if (!drag && j !== centre && (e.target as Element).matches(':focus-visible')) goTo(j)
    }
    c.addEventListener('focusin', f)
    return f
  })
  scene.addEventListener('pointermove', onMove)
  scene.addEventListener('pointerdown', onDown)
  scene.addEventListener('pointerup', onUp)
  scene.addEventListener('pointercancel', onUp)
  // a finger lifted outside the scene, or a capture the browser took away, still ends the gesture
  document.addEventListener('pointerup', onUp)
  document.addEventListener('pointercancel', onUp)
  scene.addEventListener('lostpointercapture', onLost)
  scene.addEventListener('click', onClickCapture, true)
  scene.addEventListener('wheel', onWheel, { passive: false })
  document.addEventListener('keydown', onKey)


  /**
   * Each poster's huge word spans the poster's width between its margins, the same on all three posters whatever the
   * letters: Anton's letters differ in width per word, and a fallback font (before Anton arrives) is wider still. Sizes
   * are in hundredths of the poster's width, so the fit holds at any poster size: it is measured once, and again whenever a font finishes loading.
   */
  function fitWords() {
    const words = cards.map((c) => c.querySelector<HTMLElement>('.af-palabra'))
    words.forEach((el) => el?.style.setProperty('--fit', '1'))
    const fits = words.map((el, j) => {
      if (!el) return 1
      const room = cards[j].offsetWidth - 2 * el.offsetLeft
      return el.offsetWidth ? lim(room / el.offsetWidth, 0.5, 1.4) : 1
    })
    words.forEach((el, j) => el?.style.setProperty('--fit', fits[j].toFixed(3)))
  }

  function render() {
    if (tween) {
      const t = lim((performance.now() - tween.t0) / tween.ms, 0, 1)
      s = tween.from + (tween.to - tween.from) * easeOut(t)
      if (t >= 1) {
        s = mod(tween.to, N)
        tween = null
      }
    }
    // never at rest between two posters: whatever ended a gesture, the fan finishes on a whole one
    if (!drag && !tween && Math.abs(s - Math.round(s)) > 1e-4) settle(Math.round(s))
    updateCentre()
    cards.forEach((c, j) => {
      const p = pose(j)
      const css =
        `translate3d(${p.x.toFixed(2)}px,${p.y.toFixed(2)}px,0) rotate(${p.r.toFixed(4)}rad) scale(${p.k.toFixed(4)})` +
        `|${z(j)}`
      if (css === written[j]) return
      written[j] = css
      const [transform, zi] = css.split('|')
      c.style.transform = transform
      c.style.zIndex = zi
    })
  }
  // The ResizeObserver can miss a change: a page restored by Back after the window changed size, a pane resized while
  // the tab was in the background. Twice a second the frame compares the scene with the size the posters were made
  // for, so a poster never stays sized for a window that is gone.
  let checked = 0
  const resync = () => {
    if (scene.clientWidth !== W || scene.clientHeight !== H) measure()
  }
  function frame(ts: number) {
    if (ts - checked > RESYNC_MS) {
      checked = ts
      resync()
    }
    render()
    raf = requestAnimationFrame(frame)
  }

  // The first size arrives with the page's own layout, before its first paint, so mounting forces no extra layout;
  // the posters are placed in that same callback, and the scene says so (the splash waits for it).
  let started = false
  // The words are fitted once, not on every resize: their size follows the poster's width, so a fit holds at any poster
  // size, and fitting again mid-resize can read the word at the poster's previous size and leave it too big or small.
  const ro = new ResizeObserver(() => {
    measure()
    if (started) return
    fitWords()
    started = true
    render()
    scene.setAttribute('data-ready', '')
    raf = requestAnimationFrame(frame)
  })
  ro.observe(scene)
  const onShow = () => started && resync()
  window.addEventListener('pageshow', onShow)
  window.addEventListener('resize', onShow)
  // a font arriving refits on the next frame, once the layout it changed has settled
  const refit = () => {
    if (started) requestAnimationFrame(fitWords)
  }
  void document.fonts?.ready.then(refit)
  document.fonts?.addEventListener('loadingdone', refit)

  return {
    move: step,
    destroy() {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('pageshow', onShow)
      window.removeEventListener('resize', onShow)
      document.fonts?.removeEventListener('loadingdone', refit)
      scene.removeEventListener('pointermove', onMove)
      scene.removeEventListener('pointerdown', onDown)
      scene.removeEventListener('pointerup', onUp)
      scene.removeEventListener('pointercancel', onUp)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      scene.removeEventListener('lostpointercapture', onLost)
      scene.removeEventListener('click', onClickCapture, true)
      scene.removeEventListener('wheel', onWheel)
      document.removeEventListener('keydown', onKey)
      cards.forEach((c, j) => c.removeEventListener('focusin', focusers[j]))
    },
  }
}
