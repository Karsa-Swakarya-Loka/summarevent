/**
 * Data for the next screen, fetched when the visitor shows the intent to open it (finger down on a card, hover, focus)
 * or while the phone is idle. The event page and the seat map then open with their content in the first frame of the
 * slide-in, instead of a skeleton that is swapped for the page halfway through the animation.
 */
import { api } from '@/api'
import type { EventDetail, SeatMapData } from '@/api/contract'
import { preloadScreen } from '@/screens'

interface Entry<T> {
  at: number
  data: T
}

/** An event page barely changes; a seat map is only used while it is under 10 s old, then fetched again. */
const EVENT_FRESH_MS = 60_000
const MAP_FRESH_MS = 10_000

const events = new Map<string, Entry<EventDetail>>()
const maps = new Map<string, Entry<SeatMapData>>()
const inflight = new Set<string>()

function fresh<T>(store: Map<string, Entry<T>>, key: string, maxAge: number): T | undefined {
  const hit = store.get(key)
  return hit && Date.now() - hit.at < maxAge ? hit.data : undefined
}

export const cachedEvent = (slug: string): EventDetail | undefined => fresh(events, slug, EVENT_FRESH_MS)
export const cachedSeatMap = (sessionId: string): SeatMapData | undefined => fresh(maps, sessionId, MAP_FRESH_MS)

/** The event page's fetch; every answer is kept for the next time the page opens. */
export function loadEvent(slug: string): Promise<EventDetail> {
  return api.getEvent(slug).then((data) => {
    events.set(slug, { at: Date.now(), data })
    return data
  })
}

export function loadSeatMap(sessionId: string): Promise<SeatMapData> {
  return api.getSeatMap(sessionId).then((data) => {
    maps.set(sessionId, { at: Date.now(), data })
    return data
  })
}

function once(key: string, cached: unknown, load: () => Promise<unknown>) {
  if (cached !== undefined || inflight.has(key)) return
  inflight.add(key)
  // a failed prefetch is not an error: the screen fetches again when it opens and shows its own error there
  load()
    .catch(() => undefined)
    .finally(() => inflight.delete(key))
}

/**
 * Forget a session's seat map when its screen closes: what the visitor does next (hold, pay, cancel) changes it, so the
 * next visit starts from a fresh answer instead of the one kept from before.
 */
export function forgetSeatMap(sessionId: string) {
  maps.delete(sessionId)
}

export function prefetchEvent(slug: string) {
  if (slug) once(`e:${slug}`, cachedEvent(slug), () => loadEvent(slug))
}

export function prefetchSeatMap(sessionId: string) {
  if (sessionId) once(`s:${sessionId}`, cachedSeatMap(sessionId), () => loadSeatMap(sessionId))
}

const EVENT_PATH = /^\/app\/e\/([^/?#]+)\/?$/
const SEATS_PATH = /^\/app\/e\/[^/?#]+\/s\/([^/?#]+)\/?$/

/** Whatever the link at `href` opens: its data, or its screen's code. */
export function prefetchPath(href: string) {
  const path = href.split(/[?#]/)[0]
  const event = EVENT_PATH.exec(path)
  if (event) return prefetchEvent(decodeURIComponent(event[1]))
  const seats = SEATS_PATH.exec(path)
  if (seats) return prefetchSeatMap(decodeURIComponent(seats[1]))
  preloadScreen(path)
}

/** Run `fn` when the phone has nothing else to do, so a prefetch never competes with what is on screen. */
export function whenIdle(fn: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(fn, { timeout: 2500 })
    return () => cancelIdleCallback(id)
  }
  const t = window.setTimeout(fn, 800)
  return () => window.clearTimeout(t)
}
