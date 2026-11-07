/**
 * PT-07: check-in keeps working when the venue loses signal (live version; the demo version never
 * needs the network). While online, the scanner keeps the session's ticket manifest on the phone: a
 * SHA-256 of each QR token (never the token itself), seat, name and status. Offline, a scanned QR is
 * checked against it and queued; the queue goes to the server once the connection is back, and the
 * server has the last word: a ticket that another gate let in first comes back as a conflict.
 */
import { api, ApiError, apiMode, type CheckinResponse, type OfflineManifest } from '@/api'
import { isTicketId, sha256Hex } from '@/domain/qr'
import type { CheckinResult, Order, Ticket } from '@/domain/types'
import { fmtTime } from '@/lib/format'
import { sessionName, sessionWindow } from './session'

const MANIFEST_KEY = (sessionId: string) => `summarevent:offline:manifest:${sessionId}`
const QUEUE_KEY = 'summarevent:offline:queue'
/** Fired on window whenever the offline queue changes. */
export const QUEUE_EVENT = 'summarevent:offline-queue'

export interface QueuedScan {
  token: string
  ticketId: string
  sessionId: string
  scannedAt: string
  label: string
}

export interface SyncConflict extends QueuedScan {
  result: CheckinResult | 'ERROR'
  message: string
}

export const offlineCapable = apiMode === 'live'

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or blocked: offline check-in just becomes unavailable */
  }
}

const loadManifest = (sessionId: string) => readJson<OfflineManifest>(MANIFEST_KEY(sessionId))

/**
 * On sign-out: the ticket lists kept for offline check-in (names and seats of visitors) leave this phone, since a gate
 * phone is often passed to the next petugas. Scans still waiting for signal stay, so no check-in is lost.
 */
export function clearOfflineManifests() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('summarevent:offline:manifest:')) localStorage.removeItem(key)
  } catch {
    /* storage blocked: nothing was kept either */
  }
}
export const loadQueue = (): QueuedScan[] => readJson<QueuedScan[]>(QUEUE_KEY) ?? []
function saveQueue(q: QueuedScan[]) {
  writeJson(QUEUE_KEY, q)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(QUEUE_EVENT))
}

/** Keep the manifest fresh while online (called on open and every minute). */
export async function refreshManifest(sessionId: string): Promise<OfflineManifest | null> {
  if (!offlineCapable) return null
  const m = await api.staff.offlineManifest(sessionId)
  writeJson(MANIFEST_KEY(sessionId), m)
  return m
}

export function isOfflineError(e: unknown): boolean {
  return e instanceof ApiError && e.code === 'OFFLINE'
}

/** Same order of checks as the server: known QR → not cancelled → not used → right session → window open. */
export async function checkOffline(token: string, sessionId: string, now = new Date()): Promise<CheckinResponse> {
  const m = loadManifest(sessionId)
  const none = { ticket: null, order: null, event: m?.event ?? null, session: m?.session ?? null, category: null, firstScan: null }
  if (!m) {
    return { ...none, result: 'INVALID', message: 'Daftar tiket offline belum tersimpan di HP ini. Sambungkan internet sebentar, lalu scan lagi.' }
  }
  // a scanned QR is matched by its hash, a ticket picked by hand by its id
  const code = token.trim()
  const hash = isTicketId(code) ? null : await sha256Hex(code)
  const entry = m.tickets.find((t) => (hash ? t.tokenHash === hash : t.ticket.id === code))
  if (!entry) return { ...none, result: 'INVALID', message: 'QR tidak dikenali: palsu, rusak, atau tiket event lain.' }

  const ticket = { ...entry.ticket, qrToken: '' } as Ticket
  const order = { id: entry.order.id, code: entry.order.code, buyerName: entry.order.buyerName, eventId: m.event.id } as Order
  const res = { ...none, ticket, order, session: entry.session, category: m.categories.find((c) => c.id === ticket.categoryId) ?? null }

  if (ticket.status === 'CANCELLED') return { ...res, result: 'INVALID', message: 'Tiket ini sudah dibatalkan.' }
  const queued = loadQueue().find((q) => q.ticketId === ticket.id)
  const usedAt = queued?.scannedAt ?? (ticket.status === 'USED' ? ticket.usedAt : null)
  if (usedAt && !m.event.rules.reentryAllowed) {
    return {
      ...res,
      result: 'ALREADY_USED',
      message: 'Tiket ini sudah dipakai masuk.',
      firstScan: { id: 'offline', ticketId: ticket.id, sessionId, staffId: '', scannedAt: usedAt, result: 'VALID', staffName: queued ? 'HP ini (offline)' : 'petugas lain' },
    }
  }
  if (ticket.sessionId !== sessionId) return { ...res, result: 'WRONG_SESSION', message: `Tiket ${sessionName(entry.session)}.` }
  const win = sessionWindow(m.session, m.event.rules, now)
  if (win.state !== 'OPEN') {
    return {
      ...res,
      result: 'OUTSIDE_WINDOW',
      message: win.state === 'NOT_YET' ? `Check-in dibuka jam ${fmtTime(win.open.toISOString())}.` : 'Check-in sesi ini sudah ditutup.',
    }
  }
  const who = ticket.attendeeName || order.buyerName
  saveQueue([
    ...loadQueue(),
    { token: token.trim(), ticketId: ticket.id, sessionId, scannedAt: now.toISOString(), label: `${ticket.seatLabel ? `Kursi ${ticket.seatLabel}` : ticket.code} · ${who}` },
  ])
  return { ...res, result: 'VALID', message: 'Diperiksa offline.' }
}

let syncing: Promise<{ synced: number; conflicts: SyncConflict[]; remaining: number }> | null = null

/** Send queued offline scans; whatever cannot reach the server stays queued. */
export function syncQueue() {
  syncing ??= (async () => {
    const batch = loadQueue()
    const done = new Set<string>()
    const conflicts: SyncConflict[] = []
    let synced = 0
    for (const q of batch) {
      try {
        const r = await api.staff.checkin(q.token, q.sessionId)
        if (r.result === 'VALID') synced++
        else conflicts.push({ ...q, result: r.result, message: r.message })
        done.add(`${q.ticketId}|${q.scannedAt}`)
      } catch (e) {
        if (isOfflineError(e)) break // still offline: keep this one and the rest
        conflicts.push({ ...q, result: 'ERROR', message: e instanceof Error ? e.message : 'Gagal disinkronkan.' })
        done.add(`${q.ticketId}|${q.scannedAt}`)
      }
    }
    // scans queued while this ran stay in the queue
    const remaining = loadQueue().filter((q) => !done.has(`${q.ticketId}|${q.scannedAt}`))
    saveQueue(remaining)
    return { synced, conflicts, remaining: remaining.length }
  })().finally(() => {
    syncing = null
  })
  return syncing
}
