/**
 * Mock implementation of the Summarevent API, running entirely in the browser.
 * Business logic follows PRD v1.2 §8–§9; the backend should port the same rules.
 */
import {
  ApiError,
  type Api,
  type CategoryAvailability,
  type CheckinResponse,
  type EventDetail,
  type EventDraft,
  type EventStats,
  type EventSummary,
  type HoldRequest,
  type HoldResult,
  type OfflineManifest,
  type OrderDetail,
  type OrderRow,
  type PassItem,
  type ReceiptInput,
  type ReceiptQueueItem,
  type ReviewDecision,
  type SeatMapData,
  type SessionSummary,
  type StaffAccount,
  type TicketSearchRow,
  type WaitlistItem,
} from '@/api/contract'
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, TICKET_STATUS_LABEL } from '@/domain/labels'
import { makeQrToken, sha256Hex, verifyQrToken } from '@/domain/qr'
import {
  attendeeEditPolicy,
  buildSeats,
  checkReceiptRules,
  checkinWindow,
  effectiveSeatStatus,
  isHoldActive,
  LOGIN_FAIL_WINDOW_MIN,
  LOGIN_MAX_FAILS,
  passwordCheck,
  profileChanges,
  randomCode,
  RESET_TOKEN_MIN,
  FORGOT_MIN_INTERVAL_SEC,
  posterImageCheck,
  posterPaletteCheck,
  receiptChecksPass,
  resolveSession,
  rowIndex,
  rowLetter,
  saleState,
  seatLabel,
  suggestSeats,
  uid,
  visitorCancelPolicy,
} from '@/domain/rules'
import type {
  AppNotification,
  EventItem,
  Order,
  OrderStatus,
  PaymentMethod,
  Receipt,
  Role,
  Seat,
  SeatLayout,
  Session,
  Ticket,
  TicketCategory,
  User,
  WaitlistEntry,
} from '@/domain/types'
import { csvCell, fmtRange, fmtShortDate, fmtTime, isValidPhone, normalizePhone, rupiahPlain, wibDate } from '@/lib/format'
import {
  clearClientSessions,
  clearDb,
  getSessionUserId,
  guestId,
  hasDb,
  readDb,
  replaceDb,
  setSessionUserId,
  subscribe,
  transaction,
  type Db,
} from './db'
import { DEMO_ADMIN_ID, DEMO_STAFF_ID, PERSONA_ID, buildSeed } from './seed'

const PENDING: OrderStatus[] = ['AWAITING_PAYMENT', 'AWAITING_VERIFICATION']
const isPending = (o: Order) => PENDING.includes(o.status)

/* ------------------------------------------------------------------ */
/* bootstrap                                                           */
/* ------------------------------------------------------------------ */

let ready: Promise<void> | null = null
export function ensureMockDb(): Promise<void> {
  ready ??= (async () => {
    if (!hasDb() || !readDb()) await replaceDb(await buildSeed())
  })()
  return ready
}

function snap(): Db {
  const db = readDb()
  if (!db) throw new ApiError('NOT_READY', 'Data demo sedang disiapkan, coba lagi.')
  return db
}

async function read<T>(fn: (db: Db, now: Date) => T): Promise<T> {
  await ensureMockDb()
  return fn(snap(), new Date())
}

/**
 * Write inside a transaction. The expiry sweep always commits; the action itself is
 * all-or-nothing (a thrown error rolls back to the post-sweep checkpoint).
 */
async function write<T>(fn: (db: Db, now: Date) => T | Promise<T>): Promise<T> {
  await ensureMockDb()
  const out = await transaction(async (db) => {
    const now = new Date()
    sweep(db, now)
    const checkpoint = JSON.stringify(db)
    try {
      return { ok: true as const, value: await fn(db, now) }
    } catch (error) {
      Object.assign(db, JSON.parse(checkpoint) as Db)
      return { ok: false as const, error }
    }
  })
  if (!out.ok) throw out.error
  return out.value
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function visitorId(): string {
  return getSessionUserId('VISITOR') ?? guestId()
}

function must<T>(v: T | undefined | null, what = 'Data'): T {
  if (v == null) throw new ApiError('NOT_FOUND', `${what} tidak ditemukan.`)
  return v
}

const byId = <T extends { id: string }>(list: T[], id: string) => list.find((x) => x.id === id)

function eventOf(db: Db, id: string) {
  return must(byId(db.events, id), 'Event')
}
function sessionOf(db: Db, id: string, now: Date) {
  return resolveSession(must(byId(db.sessions, id), 'Sesi'), now)
}
function categoryOf(db: Db, id: string) {
  return must(byId(db.categories, id), 'Kategori')
}
function venueOf(db: Db, id: string) {
  return must(byId(db.venues, id), 'Venue')
}

function releaseOrderSeats(db: Db, order: Order) {
  for (const ss of db.sessionSeats) {
    if (ss.orderId === order.id && ss.status === 'HELD') {
      ss.status = 'AVAILABLE'
      ss.orderId = null
      ss.holdExpiresAt = null
    }
  }
}

function pushNote(db: Db, n: Omit<AppNotification, 'id'>) {
  db.notifications.push({ id: uid('ntf'), ...n })
}

/** Background job equivalent (PRD §11): expire holds and give the quota back. */
function sweep(db: Db, now: Date) {
  for (const o of db.orders) {
    if (isPending(o) && new Date(o.holdExpiresAt).getTime() <= now.getTime()) {
      o.status = 'EXPIRED'
      releaseOrderSeats(db, o)
      notifyWaitlist(db, o, now)
      if (!o.simulated) {
        pushNote(db, {
          userId: o.userId,
          channel: 'WA',
          kind: 'HOLD_EXPIRED',
          orderId: o.id,
          title: 'Waktu tahan kursi habis',
          body: `Pesanan ${o.code} kedaluwarsa karena melewati batas waktu. Kursinya sudah dilepas, silakan pesan ulang.`,
          createdAt: now.toISOString(),
          scheduledFor: null,
        })
      }
    }
  }
  for (const ss of db.sessionSeats) {
    if (ss.status === 'HELD' && !isHoldActive(ss, now)) {
      ss.status = 'AVAILABLE'
      ss.orderId = null
      ss.holdExpiresAt = null
    }
  }
}

function generalFilled(db: Db, sessionId: string, categoryId: string, now: Date): number {
  return db.orders
    .filter(
      (o) =>
        o.sessionId === sessionId &&
        o.categoryId === categoryId &&
        o.items.every((i) => i.seatId == null) &&
        (o.status === 'CONFIRMED' || (isPending(o) && new Date(o.holdExpiresAt) > now)),
    )
    .reduce((s, o) => s + o.qty, 0)
}

function generalSold(db: Db, sessionId: string, categoryId: string): number {
  return db.orders
    .filter((o) => o.sessionId === sessionId && o.categoryId === categoryId && o.status === 'CONFIRMED' && o.items.every((i) => i.seatId == null))
    .reduce((s, o) => s + o.qty, 0)
}

/** AD-12: bonus places still free for a category in a session (null when the category has no bonus). */
function bonusPlacesLeft(db: Db, sessionId: string, category: TicketCategory): number | null {
  if (!category.bonusFirstN || !category.bonusDesc) return null
  const given = db.tickets.filter((t) => t.sessionId === sessionId && t.categoryId === category.id && t.bonus && t.status !== 'CANCELLED').length
  return Math.max(0, category.bonusFirstN - given)
}

/** Places that can be booked right now for one category in one session. */
function freePlaces(db: Db, sessionId: string, categoryId: string, now: Date): number {
  const category = categoryOf(db, categoryId)
  if (category.quota != null) {
    const q = db.quotas.find((x) => x.sessionId === sessionId && x.categoryId === categoryId)
    return Math.max(0, (q?.quota ?? category.quota) - generalFilled(db, sessionId, categoryId, now))
  }
  return db.sessionSeats.filter((ss) => ss.sessionId === sessionId && ss.categoryId === categoryId && effectiveSeatStatus(ss, now) === 'AVAILABLE').length
}

/** PV-14: places freed up → message the first people in line whose group still fits (no reservation). */
function notifyWaitlist(db: Db, order: Pick<Order, 'sessionId' | 'categoryId'>, now: Date) {
  const line = db.waitlist
    .filter((w) => w.status === 'WAITING' && w.sessionId === order.sessionId && w.categoryId === order.categoryId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  if (!line.length) return
  let free = freePlaces(db, order.sessionId, order.categoryId, now)
  for (const w of line) {
    if (free <= 0) break
    if (w.qty > free) continue
    free -= w.qty
    w.status = 'NOTIFIED'
    w.notifiedAt = now.toISOString()
    const session = sessionOf(db, w.sessionId, now)
    const event = eventOf(db, session.eventId)
    const category = categoryOf(db, w.categoryId)
    pushNote(db, {
      userId: w.userId,
      channel: 'WA',
      kind: 'WAITLIST',
      title: 'Tempat tersedia lagi',
      body: `Ada tempat ${category.name} untuk ${w.qty} orang di ${event.title} (${session.label ?? 'sesi'}, ${fmtShortDate(session.startAt)} ${fmtTime(session.startAt)} WIB). Belum ditahan untukmu, jadi pesan secepatnya.`,
      createdAt: now.toISOString(),
      scheduledFor: null,
    })
  }
}

function waitlistItem(db: Db, entry: WaitlistEntry, now: Date): WaitlistItem {
  const session = sessionOf(db, entry.sessionId, now)
  const base = { ...entry, session, event: eventOf(db, session.eventId), category: categoryOf(db, entry.categoryId) }
  if (entry.status !== 'WAITING') return { ...base, position: null }
  const line = db.waitlist
    .filter((w) => w.status === 'WAITING' && w.sessionId === entry.sessionId && w.categoryId === entry.categoryId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return { ...base, position: line.findIndex((w) => w.id === entry.id) + 1 }
}

function availability(db: Db, session: Session, categories: TicketCategory[], now: Date): CategoryAvailability[] {
  return categories.map((c) => {
    if (c.quota != null) {
      const q = db.quotas.find((x) => x.sessionId === session.id && x.categoryId === c.id)
      const total = q?.quota ?? c.quota
      const filled = generalFilled(db, session.id, c.id, now)
      const sold = generalSold(db, session.id, c.id)
      return { categoryId: c.id, total, available: Math.max(0, total - filled), held: filled - sold, sold, bonusLeft: bonusPlacesLeft(db, session.id, c) }
    }
    let available = 0
    let held = 0
    let sold = 0
    let total = 0
    for (const ss of db.sessionSeats) {
      if (ss.sessionId !== session.id || ss.categoryId !== c.id) continue
      const st = effectiveSeatStatus(ss, now)
      if (st === 'BLOCKED') continue
      total++
      if (st === 'AVAILABLE') available++
      else if (st === 'HELD') held++
      else if (st === 'SOLD') sold++
    }
    return { categoryId: c.id, total, available, held, sold, bonusLeft: bonusPlacesLeft(db, session.id, c) }
  })
}

function sessionSummary(db: Db, s: Session, categories: TicketCategory[], now: Date): SessionSummary {
  const session = resolveSession(s, now)
  const av = availability(db, session, categories, now)
  return {
    ...session,
    availability: av,
    available: av.reduce((a, b) => a + b.available, 0),
    total: av.reduce((a, b) => a + b.total, 0),
  }
}

function summary(db: Db, event: EventItem, now: Date): EventSummary {
  const categories = db.categories.filter((c) => c.eventId === event.id)
  const sessions = db.sessions
    .filter((s) => s.eventId === event.id)
    .map((s) => sessionSummary(db, s, categories, now))
    .sort((a, b) => Number(!!b.demoLive) - Number(!!a.demoLive) || a.startAt.localeCompare(b.startAt))
  const prices = categories.map((c) => c.price)
  return {
    event,
    venue: venueOf(db, event.venueId),
    categories,
    sessions,
    minPrice: prices.length ? Math.min(...prices) : null,
  }
}

function orderDetail(db: Db, order: Order, now: Date): OrderDetail {
  const event = eventOf(db, order.eventId)
  return {
    order,
    event,
    venue: venueOf(db, event.venueId),
    session: sessionOf(db, order.sessionId, now),
    category: categoryOf(db, order.categoryId),
    receipts: db.receipts.filter((r) => r.orderId === order.id),
    tickets: db.tickets.filter((t) => t.orderId === order.id),
    tenants: db.tenants,
  }
}

function seatViews(db: Db, sessionId: string, layoutId: string | null, now: Date) {
  const seats = db.seats.filter((s) => s.layoutId === layoutId)
  const ssMap = new Map(db.sessionSeats.filter((x) => x.sessionId === sessionId).map((x) => [x.seatId, x]))
  return seats.map((seat) => {
    const ss = ssMap.get(seat.id)
    return { seat, status: ss ? effectiveSeatStatus(ss, now) : ('BLOCKED' as const), categoryId: ss?.categoryId ?? null }
  })
}

function getUser(db: Db, id: string): User | null {
  return db.users.find((u) => u.id === id) ?? null
}

function buyerOf(db: Db, userId: string): { name: string; phone: string } {
  const u = getUser(db, userId)
  return { name: u?.name ?? 'Tamu', phone: u?.phone ?? '-' }
}

async function confirmOrder(db: Db, order: Order, method: PaymentMethod, now: Date) {
  const event = eventOf(db, order.eventId)
  const session = sessionOf(db, order.sessionId, now)
  for (const ss of db.sessionSeats) {
    if (ss.orderId === order.id) {
      ss.status = 'SOLD'
      ss.holdExpiresAt = null
    }
  }
  // layer 4 (PRD §8 "unique index"): never two live tickets for one seat in one session
  for (const item of order.items) {
    if (item.seatId && db.tickets.some((t) => t.sessionId === order.sessionId && t.seatId === item.seatId && t.status !== 'CANCELLED')) {
      throw new ApiError('SEAT_TAKEN', `Kursi ${item.seatLabel} sudah punya tiket aktif. Pesanan tidak dikonfirmasi.`)
    }
  }
  order.status = 'CONFIRMED'
  order.paymentMethod = method
  order.confirmedAt = now.toISOString()
  const category = categoryOf(db, order.categoryId)
  let bonusLeft = bonusPlacesLeft(db, order.sessionId, category)
  for (const item of order.items) {
    const ticketId = uid('tkt')
    const ticket: Ticket = {
      id: ticketId,
      code: randomCode('TKT'),
      orderId: order.id,
      orderItemId: item.id,
      userId: order.userId,
      eventId: order.eventId,
      sessionId: order.sessionId,
      categoryId: order.categoryId,
      seatId: item.seatId,
      seatLabel: item.seatLabel,
      attendeeName: item.attendeeName,
      status: 'ACTIVE',
      qrVersion: 1,
      qrToken: await makeQrToken(ticketId, 1),
      createdAt: now.toISOString(),
      usedAt: null,
      bonus: bonusLeft != null && bonusLeft > 0 ? category.bonusDesc : null,
    }
    if (bonusLeft != null && bonusLeft > 0) bonusLeft--
    db.tickets.push(ticket)
  }
  const seats = order.items.map((i) => i.seatLabel).filter(Boolean).join(', ')
  const where = seats ? `kursi ${seats}` : `${order.qty} orang`
  const when = `${fmtShortDate(session.startAt)} ${fmtRange(session.startAt, session.endAt)}`
  pushNote(db, {
    userId: order.userId,
    channel: 'WA',
    kind: 'ORDER_CONFIRMED',
    orderId: order.id,
    title: 'Pesanan terkonfirmasi',
    body: `Tiket ${event.title} (${when}), ${where}, sudah aktif. Tunjukkan QR di Pass Saya saat masuk.`,
    createdAt: now.toISOString(),
    scheduledFor: null,
  })
  pushNote(db, {
    userId: order.userId,
    channel: 'EMAIL',
    kind: 'ORDER_CONFIRMED',
    orderId: order.id,
    title: `E-ticket ${order.code}`,
    body: `E-ticket ${event.title}, ${where}, sudah ada di Pass Saya. Sampai jumpa di SUMMABA!`,
    createdAt: now.toISOString(),
    scheduledFor: null,
  })
  if (!session.demoLive) {
    const reminderAt = new Date(new Date(session.startAt).getTime() - 24 * 3600_000)
    pushNote(db, {
      userId: order.userId,
      channel: 'WA',
      kind: 'REMINDER',
      title: 'Pengingat H-1',
      orderId: order.id,
      body: `Besok ${fmtTime(session.startAt)} WIB: ${event.title} di ${venueOf(db, event.venueId).name}. Check-in dibuka ${event.rules.checkinOpenMin} menit sebelum mulai.`,
      createdAt: now.toISOString(),
      scheduledFor: reminderAt.toISOString(),
    })
  }
}

function seatsCentroid(seats: Seat[]): { x: number; y: number } | undefined {
  if (!seats.length) return undefined
  return { x: seats.reduce((s, x) => s + x.x, 0) / seats.length, y: seats.reduce((s, x) => s + x.y, 0) / seats.length }
}

/** Core hold logic (PRD §8 layer 1): all-or-nothing. Runs inside a transaction. */
function holdTx(db: Db, now: Date, sessionId: string, req: HoldRequest, userId: string, opts: { simulated?: boolean; holdSeconds?: number } = {}): HoldResult {
  const rawSession = must(byId(db.sessions, sessionId), 'Sesi')
  const session = resolveSession(rawSession, now)
  const event = eventOf(db, session.eventId)
  const category = categoryOf(db, req.categoryId)
  if (category.eventId !== event.id) throw new ApiError('BAD_REQUEST', 'Kategori bukan milik event ini.')
  if (event.status !== 'PUBLISHED') return { ok: false, reason: 'RULE', message: 'Event belum dipublikasikan.' }

  const sale = saleState(category, session, now)
  if (!sale.open && !opts.simulated) {
    return {
      ok: false,
      reason: 'RULE',
      message: sale.reason === 'NOT_YET' ? `Penjualan ${category.name} dibuka ${fmtShortDate(sale.at.toISOString())} ${fmtTime(sale.at.toISOString())}.` : `Penjualan ${category.name} untuk sesi ini sudah ditutup.`,
    }
  }

  if (!opts.simulated) {
    const active = db.orders.find((o) => o.userId === userId && o.sessionId === sessionId && isPending(o))
    if (active) {
      return { ok: false, reason: 'RULE', message: `Kamu masih punya pesanan ${active.code} yang belum selesai di sesi ini. Selesaikan atau batalkan dulu.` }
    }
  }

  const holdMin = category.accessMethod === 'RECEIPT' ? event.rules.receiptHoldMin : event.rules.paymentHoldMin
  const holdMs = opts.holdSeconds != null ? opts.holdSeconds * 1000 : holdMin * 60_000
  const holdExpiresAt = new Date(now.getTime() + holdMs).toISOString()
  const buyer = buyerOf(db, userId)
  const orderId = uid('ord')

  const baseOrder = (items: Order['items'], qty: number): Order => ({
    id: orderId,
    code: randomCode('SEV'),
    userId,
    eventId: event.id,
    sessionId,
    categoryId: category.id,
    qty,
    status: category.accessMethod === 'RECEIPT' ? 'AWAITING_VERIFICATION' : 'AWAITING_PAYMENT',
    totalAmount: category.price * qty,
    paymentMethod: category.accessMethod === 'RECEIPT' ? 'RECEIPT' : category.accessMethod === 'FREE' ? 'FREE' : null,
    holdExpiresAt,
    createdAt: now.toISOString(),
    confirmedAt: null,
    items,
    buyerName: buyer.name,
    buyerPhone: buyer.phone,
    simulated: opts.simulated,
  })

  // GENERAL category (no seat numbers)
  if (category.quota != null) {
    const qty = Math.floor(req.qty ?? 0)
    if (qty < 1) return { ok: false, reason: 'RULE', message: 'Pilih jumlah orang minimal 1.' }
    if (qty > event.rules.maxSeatsPerOrder) return { ok: false, reason: 'RULE', message: `Maksimal ${event.rules.maxSeatsPerOrder} orang per pesanan.` }
    const q = db.quotas.find((x) => x.sessionId === sessionId && x.categoryId === category.id)
    const quota = q?.quota ?? category.quota
    const filled = generalFilled(db, sessionId, category.id, now)
    if (filled + qty > quota) {
      const left = Math.max(0, quota - filled)
      return { ok: false, reason: 'SOLD_OUT', message: left ? `Sisa kuota ${category.name} tinggal ${left}. Kurangi jumlah orang.` : `Kuota ${category.name} untuk sesi ini sudah habis.` }
    }
    const order = baseOrder(
      Array.from({ length: qty }, (_, i) => ({ id: uid('itm'), seatId: null, seatLabel: null, price: category.price, attendeeName: i === 0 && buyer.name !== 'Tamu' ? buyer.name : null })),
      qty,
    )
    db.orders.push(order)
    return { ok: true, order }
  }

  // RESERVED seats
  const seatIds = [...new Set(req.seatIds ?? [])]
  if (seatIds.length < 1) return { ok: false, reason: 'RULE', message: 'Pilih minimal 1 kursi.' }
  if (seatIds.length > event.rules.maxSeatsPerOrder) return { ok: false, reason: 'RULE', message: `Maksimal ${event.rules.maxSeatsPerOrder} kursi per pesanan.` }
  const rows = seatIds.map((id) => db.sessionSeats.find((x) => x.sessionId === sessionId && x.seatId === id))
  if (rows.some((r) => !r)) throw new ApiError('BAD_REQUEST', 'Kursi tidak dikenal.')
  if (rows.some((r) => r!.categoryId !== category.id)) {
    return { ok: false, reason: 'RULE', message: `Semua kursi dalam satu pesanan harus kategori ${category.name}.` }
  }
  const conflicts = rows.filter((r) => effectiveSeatStatus(r!, now) !== 'AVAILABLE').map((r) => r!.seatId)
  if (conflicts.length) {
    const views = seatViews(db, sessionId, event.layoutId, now)
    const requested = db.seats.filter((s) => seatIds.includes(s.id))
    const sug = suggestSeats(views, category.id, seatIds.length, layoutOf(db, event.layoutId), seatsCentroid(requested))
    const labels = conflicts.map((id) => seatLabel(must(byId(db.seats, id), 'Kursi')))
    return {
      ok: false,
      reason: 'CONFLICT',
      conflictSeatIds: conflicts,
      suggestions: sug.seatIds,
      message: `Yah, ${labels.join(', ')} baru saja dipilih orang lain.`,
    }
  }
  const seatList = seatIds.map((id) => must(byId(db.seats, id), 'Kursi')).sort((a, b) => a.y - b.y || a.x - b.x)
  const order = baseOrder(
    seatList.map((s, i) => ({ id: uid('itm'), seatId: s.id, seatLabel: seatLabel(s), price: category.price, attendeeName: i === 0 && buyer.name !== 'Tamu' ? buyer.name : null })),
    seatList.length,
  )
  for (const r of rows) {
    r!.status = 'HELD'
    r!.orderId = order.id
    r!.holdExpiresAt = holdExpiresAt
  }
  db.orders.push(order)
  return { ok: true, order }
}

function layoutOf(db: Db, id: string | null): SeatLayout | null {
  return id ? (db.layouts.find((l) => l.id === id) ?? null) : null
}

function ownOrder(db: Db, orderId: string): Order {
  const order = must(byId(db.orders, orderId), 'Pesanan')
  if (order.userId !== visitorId()) throw new ApiError('NOT_FOUND', 'Pesanan tidak ditemukan.')
  return order
}

function assertHoldActive(order: Order, now: Date) {
  if (order.status === 'EXPIRED' || new Date(order.holdExpiresAt) <= now) {
    throw new ApiError('HOLD_EXPIRED', 'Waktu habis, kursi sudah dilepas. Silakan pesan ulang.')
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

/** Derive the admin wizard draft from a stored event. */
function draftOf(db: Db, event: EventItem): EventDraft {
  const categories = db.categories.filter((c) => c.eventId === event.id)
  const layout = layoutOf(db, event.layoutId)
  let layoutDraft: EventDraft['layout']
  if (layout) {
    const seats = db.seats.filter((s) => s.layoutId === layout.id)
    const rowCat: Array<string | null> = []
    for (let r = 0; r < layout.rows; r++) {
      const first = seats.find((s) => s.y === r)
      rowCat.push(first ? (event.seatAssignments[first.id]?.categoryId ?? null) : null)
    }
    const rowCategories: NonNullable<EventDraft['layout']>['rowCategories'] = []
    let r = 0
    while (r < rowCat.length) {
      const cid = rowCat[r]
      let end = r
      while (end + 1 < rowCat.length && rowCat[end + 1] === cid) end++
      const idx = categories.findIndex((c) => c.id === cid)
      if (idx >= 0) rowCategories.push({ categoryIndex: idx, fromRow: rowLetter(r), toRow: rowLetter(end) })
      r = end + 1
    }
    layoutDraft = {
      rows: layout.rows,
      seatsPerRow: layout.seatsPerRow,
      aisleAfter: layout.aisleAfter,
      ...(layout.curved ? { curved: true } : {}),
      rowCategories,
      blockedSeatLabels: seats.filter((s) => event.seatAssignments[s.id]?.blocked).map(seatLabel),
      prioritySeatLabels: seats.filter((s) => s.isPriority).map(seatLabel),
    }
  }
  return {
    title: event.title,
    subtitle: event.subtitle,
    description: event.description,
    posterTheme: event.posterTheme,
    posterPalette: event.posterPalette ?? null,
    posterImage: event.posterImage ?? null,
    venueId: event.venueId,
    seatingMode: event.seatingMode,
    rules: { ...event.rules },
    categories: categories.map((c) => {
      const { eventId: _e, ...rest } = c
      void _e
      return rest
    }),
    layout: layoutDraft,
    sessions: db.sessions
      .filter((s) => s.eventId === event.id)
      .map((s) => ({ id: s.id, label: s.label, startAt: s.startAt, endAt: s.endAt, demoLive: s.demoLive })),
  }
}

function applyLayout(db: Db, event: EventItem, draft: EventDraft, categoryIds: string[]) {
  const spec = draft.layout
  if (!spec || draft.seatingMode !== 'RESERVED') {
    event.layoutId = null
    event.seatAssignments = {}
    return
  }
  const layout: SeatLayout = {
    id: uid('lay'),
    venueId: draft.venueId,
    name: `Denah ${spec.rows}×${spec.seatsPerRow}`,
    rows: spec.rows,
    seatsPerRow: spec.seatsPerRow,
    aisleAfter: spec.aisleAfter,
    // only when set, so a deployment whose schema predates curved rows still takes straight layouts
    ...(spec.curved ? { curved: true } : {}),
  }
  const seats = buildSeats(layout, spec.prioritySeatLabels)
  db.layouts.push(layout)
  db.seats.push(...seats)
  event.layoutId = layout.id
  event.seatAssignments = {}
  for (const s of seats) {
    const r = rowIndex(s.row)
    const range = spec.rowCategories.find((x) => r >= rowIndex(x.fromRow) && r <= rowIndex(x.toRow))
    const categoryId = range ? (categoryIds[range.categoryIndex] ?? null) : null
    event.seatAssignments[s.id] = { categoryId, blocked: spec.blockedSeatLabels.includes(seatLabel(s)) }
  }
}

function addInventory(db: Db, event: EventItem, session: Session) {
  const seats = db.seats.filter((s) => s.layoutId === event.layoutId)
  for (const s of seats) {
    const a = event.seatAssignments[s.id]
    db.sessionSeats.push({
      sessionId: session.id,
      seatId: s.id,
      categoryId: a?.categoryId ?? null,
      status: a?.blocked || !a?.categoryId ? 'BLOCKED' : 'AVAILABLE',
      orderId: null,
      holdExpiresAt: null,
    })
  }
  for (const c of db.categories.filter((x) => x.eventId === event.id && x.quota != null)) {
    db.quotas.push({ sessionId: session.id, categoryId: c.id, quota: c.quota!, filled: 0 })
  }
}

function eventDates(draft: EventDraft): { startAt: string; endAt: string } {
  const real = draft.sessions.filter((s) => !s.demoLive)
  const list = real.length ? real : draft.sessions
  if (!list.length) {
    const t = new Date().toISOString()
    return { startAt: t, endAt: t }
  }
  return {
    startAt: list.map((s) => s.startAt).sort()[0],
    endAt: list.map((s) => s.endAt).sort().slice(-1)[0],
  }
}

function checkinResponseFrom(db: Db, result: CheckinResponse['result'], message: string, ticket: Ticket | null, now: Date, firstScan: CheckinResponse['firstScan'] = null): CheckinResponse {
  const order = ticket ? (byId(db.orders, ticket.orderId) ?? null) : null
  const event = ticket ? (byId(db.events, ticket.eventId) ?? null) : null
  const rawSession = ticket ? byId(db.sessions, ticket.sessionId) : undefined
  return {
    result,
    message,
    ticket,
    order,
    event,
    session: rawSession ? resolveSession(rawSession, now) : null,
    category: ticket ? (byId(db.categories, ticket.categoryId) ?? null) : null,
    firstScan,
  }
}

/* ------------------------------------------------------------------ */
/* the adapter                                                         */
/* ------------------------------------------------------------------ */

export function createMockApi(): Api {
  const api: Api = {
    mode: 'mock',

    /* ---------- auth ---------- */
    async requestOtp(rawPhone) {
      const phone = normalizePhone(rawPhone)
      if (!isValidPhone(phone)) throw new ApiError('BAD_PHONE', 'Nomor HP belum benar. Contoh: 0812 3456 7890.')
      return write((db, now) => {
        let entry = db.otps.find((o) => o.phone === phone)
        if (!entry) {
          entry = { phone, code: '', expiresAt: '', requests: [] }
          db.otps.push(entry)
        }
        const recent = entry.requests.filter((t) => now.getTime() - new Date(t).getTime() < 60_000)
        if (recent.length >= 3) {
          const wait = Math.ceil((60_000 - (now.getTime() - new Date(recent[0]).getTime())) / 1000)
          throw new ApiError('RATE_LIMIT', `Terlalu sering minta kode. Coba lagi dalam ${wait} detik.`)
        }
        const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000))
        entry.code = code
        entry.expiresAt = new Date(now.getTime() + 5 * 60_000).toISOString()
        entry.requests = [...recent, now.toISOString()]
        return { simulatedCode: code, expiresAt: entry.expiresAt }
      })
    },

    async verifyOtp(rawPhone, code, name) {
      const phone = normalizePhone(rawPhone)
      const guest = guestId()
      const result = await write((db, now) => {
        const entry = db.otps.find((o) => o.phone === phone)
        if (!entry || entry.code !== code.trim()) throw new ApiError('BAD_OTP', 'Kode OTP salah. Cek lagi kode yang tampil di layar.')
        if (new Date(entry.expiresAt) < now) throw new ApiError('OTP_EXPIRED', 'Kode OTP sudah kedaluwarsa. Minta kode baru.')
        let user = db.users.find((u) => u.phone === phone && u.role === 'VISITOR')
        let isNew = false
        if (!user) {
          if (!name?.trim()) throw new ApiError('NEED_NAME', 'Isi nama kamu dulu.')
          user = { id: uid('usr'), role: 'VISITOR', name: name.trim(), phone, email: null, createdAt: now.toISOString() }
          db.users.push(user)
          isNew = true
        }
        claimGuest(db, guest, user)
        entry.code = ''
        return { user, isNew }
      })
      setSessionUserId('VISITOR', result.user.id)
      return result
    },

    currentUser(role: Role) {
      const id = getSessionUserId(role)
      if (!id) return null
      const db = readDb()
      return db ? getUser(db, id) : null
    },

    async demoLogin(role, userId) {
      await ensureMockDb()
      let id = role === 'ADMIN' ? DEMO_ADMIN_ID : role === 'STAFF' ? DEMO_STAFF_ID : PERSONA_ID
      if (userId) {
        const u = getUser(snap(), userId)
        if (!u || u.role !== role) throw new ApiError('NOT_FOUND', 'Akun tidak ditemukan.')
        if (u.active === false) throw new ApiError('FORBIDDEN', 'Akun petugas ini dinonaktifkan panitia.')
        id = u.id
      }
      if (role === 'VISITOR') {
        const guest = guestId()
        await write((db) => {
          claimGuest(db, guest, must(getUser(db, id), 'Pengguna'))
        })
      }
      setSessionUserId(role, id)
      return must(getUser(snap(), id), 'Pengguna')
    },

    logout(role) {
      setSessionUserId(role, null)
    },

    async login(rawEmail, password, role) {
      await ensureMockDb()
      const email = rawEmail.trim().toLowerCase()
      const hash = await sha256Hex(`pw:${password}`)
      // a failed attempt has to be remembered, and a thrown error would roll the write back: the outcome is returned
      // and thrown afterwards
      const outcome = await write((db, now): { user: User } | { error: ApiError } => {
        const u = db.users.find((x) => x.role === role && x.email === email)
        const entry = u && db.passwords.find((p) => p.userId === u.id)
        const window = now.getTime() - LOGIN_FAIL_WINDOW_MIN * 60_000
        if (entry) entry.fails = entry.fails.filter((t) => new Date(t).getTime() > window)
        if (entry && entry.fails.length >= LOGIN_MAX_FAILS) return { error: new ApiError('RATE_LIMIT', `Terlalu banyak percobaan. Coba lagi dalam ${LOGIN_FAIL_WINDOW_MIN} menit.`) }
        // one message for a wrong email and a wrong password, so an address cannot be probed
        if (!u || !entry || entry.hash !== hash) {
          if (entry) entry.fails.push(now.toISOString())
          return { error: new ApiError('BAD_LOGIN', 'Email atau kata sandi salah.') }
        }
        if (u.active === false) return { error: new ApiError('FORBIDDEN', 'Akun ini dinonaktifkan panitia.') }
        entry.fails = []
        return { user: u }
      })
      if ('error' in outcome) throw outcome.error
      setSessionUserId(role, outcome.user.id)
      return outcome.user
    },

    forgotPassword(rawEmail) {
      const email = rawEmail.trim().toLowerCase()
      return write((db, now) => {
        const u = db.users.find((x) => x.role !== 'VISITOR' && x.email === email)
        // an unknown email gets the same answer, so the form cannot tell which addresses exist
        if (!u) return { ok: true as const }
        // asked again within a minute: the same answer, no new link (as the backend, so the inbox is not flooded)
        const recent = db.resetTokens.find((t) => t.userId === u.id && t.createdAt && now.getTime() - new Date(t.createdAt).getTime() < FORGOT_MIN_INTERVAL_SEC * 1000)
        if (recent) return { ok: true as const }
        db.resetTokens = db.resetTokens.filter((t) => t.userId !== u.id)
        const token = uid('rst').slice(4) + uid('rst').slice(4)
        db.resetTokens.push({ token, userId: u.id, expiresAt: new Date(now.getTime() + RESET_TOKEN_MIN * 60_000).toISOString(), createdAt: now.toISOString() })
        // the demo shows the link the email would carry
        return { ok: true as const, simulatedLink: `${globalThis.location?.origin ?? ''}/reset?token=${token}` }
      })
    },

    async resetPassword(token, password) {
      const check = passwordCheck(password)
      if (!check.ok) throw new ApiError('INVALID', check.reason, { field: 'password' })
      const hash = await sha256Hex(`pw:${password}`)
      const user = await write((db, now) => {
        const t = db.resetTokens.find((x) => x.token === token)
        if (!t || new Date(t.expiresAt).getTime() <= now.getTime()) throw new ApiError('RESET_EXPIRED', 'Link ini sudah tidak berlaku. Minta link baru dari halaman masuk.')
        const u = must(getUser(db, t.userId), 'Pengguna')
        if (u.active === false) throw new ApiError('FORBIDDEN', 'Akun ini dinonaktifkan panitia.')
        db.resetTokens = db.resetTokens.filter((x) => x.token !== token)
        const entry = db.passwords.find((p) => p.userId === u.id)
        if (entry) Object.assign(entry, { hash, fails: [] })
        else db.passwords.push({ userId: u.id, hash, fails: [] })
        return u
      })
      setSessionUserId(user.role, user.id)
      return user
    },

    /* ---------- public ---------- */
    listEvents() {
      return read((db, now) =>
        db.events
          .filter((e) => e.status === 'PUBLISHED')
          .map((e) => summary(db, e, now))
          .sort((a, b) => a.event.startAt.localeCompare(b.event.startAt)),
      )
    },

    getEvent(slug) {
      return read((db, now): EventDetail => {
        const event = must(db.events.find((e) => e.slug === slug), 'Event')
        return { ...summary(db, event, now), tenants: db.tenants }
      })
    },

    getSeatMap(sessionId) {
      return read((db, now): SeatMapData => {
        const session = sessionOf(db, sessionId, now)
        const event = eventOf(db, session.eventId)
        const me = visitorId()
        const myOrderIds = new Set(db.orders.filter((o) => o.userId === me).map((o) => o.id))
        const categories = db.categories.filter((c) => c.eventId === event.id)
        return {
          session,
          event,
          layout: layoutOf(db, event.layoutId),
          seats: db.seats.filter((s) => s.layoutId === event.layoutId),
          sessionSeats: db.sessionSeats
            .filter((x) => x.sessionId === sessionId)
            .map((x) => {
              const status = effectiveSeatStatus(x, now)
              return {
                ...x,
                status,
                holdExpiresAt: status === 'HELD' ? x.holdExpiresAt : null,
                // privacy: only expose the order id of your own holds
                orderId: x.orderId && myOrderIds.has(x.orderId) && status !== 'AVAILABLE' ? x.orderId : null,
              }
            }),
          categories,
          quotas: categories
            .filter((c) => c.quota != null)
            .map((c) => {
              const q = db.quotas.find((x) => x.sessionId === sessionId && x.categoryId === c.id)
              return { sessionId, categoryId: c.id, quota: q?.quota ?? c.quota!, filled: generalFilled(db, sessionId, c.id, now) }
            }),
          waitlist: categories
            .map((c) => ({ categoryId: c.id, waiting: db.waitlist.filter((w) => w.status === 'WAITING' && w.sessionId === sessionId && w.categoryId === c.id).length }))
            .filter((x) => x.waiting > 0),
          bonus: categories.filter((c) => c.bonusFirstN && c.bonusDesc).map((c) => ({ categoryId: c.id, left: bonusPlacesLeft(db, sessionId, c) ?? 0 })),
          version: db.version,
          serverTime: now.toISOString(),
        }
      })
    },

    /* ---------- orders ---------- */
    createHold(sessionId, req) {
      const me = visitorId()
      return write((db, now) => holdTx(db, now, sessionId, req, me))
    },

    autoHold(sessionId, categoryId, qty) {
      const me = visitorId()
      return write((db, now) => {
        const session = sessionOf(db, sessionId, now)
        const event = eventOf(db, session.eventId)
        const category = categoryOf(db, categoryId)
        if (category.quota != null) return holdTx(db, now, sessionId, { categoryId, qty }, me)
        const sug = suggestSeats(seatViews(db, sessionId, event.layoutId, now), categoryId, qty, layoutOf(db, event.layoutId))
        if (sug.seatIds.length < qty) return { ok: false, reason: 'SOLD_OUT', message: `Kursi ${category.name} yang tersisa tidak cukup untuk ${qty} orang.` } satisfies HoldResult
        return holdTx(db, now, sessionId, { categoryId, seatIds: sug.seatIds }, me)
      })
    },

    suggestSeats(sessionId, categoryId, qty) {
      return read((db, now) => {
        const session = sessionOf(db, sessionId, now)
        const event = eventOf(db, session.eventId)
        return suggestSeats(seatViews(db, sessionId, event.layoutId, now), categoryId, qty, layoutOf(db, event.layoutId)).seatIds
      })
    },

    updateAttendees(orderId, names) {
      return write((db, now) => {
        const order = ownOrder(db, orderId)
        const policy = attendeeEditPolicy(order, sessionOf(db, order.sessionId, now), now)
        if (!policy.allowed) throw new ApiError('BAD_STATE', policy.reason)
        for (const n of names) {
          const item = order.items.find((i) => i.id === n.itemId)
          if (!item) continue
          const t = db.tickets.find((x) => x.orderItemId === item.id)
          const next = n.name.trim() || null
          if (t?.status === 'USED' && next !== t.attendeeName) {
            throw new ApiError('BAD_STATE', `Tiket ${item.seatLabel ? `kursi ${item.seatLabel}` : t.code} sudah dipakai check-in, namanya tidak bisa diubah.`)
          }
          item.attendeeName = next
          if (t) t.attendeeName = next
        }
        return order
      })
    },

    cancelOrder(orderId) {
      return write((db, now) => {
        const order = ownOrder(db, orderId)
        const tickets = db.tickets.filter((t) => t.orderId === order.id)
        const policy = visitorCancelPolicy(order, sessionOf(db, order.sessionId, now), tickets, now)
        if (!policy.allowed) throw new ApiError('BAD_STATE', policy.reason)
        const wasConfirmed = order.status === 'CONFIRMED'
        order.status = 'CANCELLED'
        order.cancelledAt = now.toISOString()
        order.cancelledBy = 'VISITOR'
        order.refundAmount = policy.refund || null
        releaseOrderSeats(db, order)
        if (wasConfirmed) {
          for (const ss of db.sessionSeats) if (ss.orderId === order.id && ss.status === 'SOLD') Object.assign(ss, { status: 'AVAILABLE', orderId: null, holdExpiresAt: null })
          for (const t of tickets) if (t.status === 'ACTIVE') t.status = 'CANCELLED'
          db.notifications = db.notifications.filter((n) => !(n.orderId === order.id && n.scheduledFor))
          pushNote(db, {
            userId: order.userId,
            channel: 'WA',
            kind: 'ORDER_CANCELLED',
            title: 'Pesanan dibatalkan',
            body: policy.refund
              ? `Pesanan ${order.code} dibatalkan. Refund ${rupiahPlain(policy.refund)} diproses ke metode bayar asal (simulasi), biasanya 3–5 hari kerja.`
              : `Pesanan ${order.code} dibatalkan dan kursinya sudah dilepas.`,
            createdAt: now.toISOString(),
            scheduledFor: null,
            orderId: order.id,
          })
          notifyWaitlist(db, order, now)
        }
        return order
      })
    },

    simulatePayment(orderId, req) {
      return write(async (db, now) => {
        const order = ownOrder(db, orderId)
        const existing = db.payments.find((p) => p.idempotencyKey === req.idempotencyKey)
        if (existing) {
          return {
            order,
            paymentStatus: existing.status === 'SUCCESS' ? ('SUCCESS' as const) : ('FAILED' as const),
            message: existing.status === 'SUCCESS' ? 'Pembayaran sudah tercatat.' : 'Pembayaran gagal (simulasi).',
          }
        }
        if (order.status === 'CONFIRMED') return { order, paymentStatus: 'SUCCESS' as const, message: 'Pesanan sudah terkonfirmasi.' }
        if (order.status === 'EXPIRED') assertHoldActive(order, now)
        if (order.status !== 'AWAITING_PAYMENT') throw new ApiError('BAD_STATE', `Pesanan ${ORDER_STATUS_LABEL[order.status].toLowerCase()}.`)
        assertHoldActive(order, now)
        const payment = {
          id: uid('pay'),
          orderId,
          method: req.method,
          amount: order.totalAmount,
          status: req.outcome === 'SUCCESS' ? ('SUCCESS' as const) : ('FAILED' as const),
          idempotencyKey: req.idempotencyKey,
          simRef: randomCode('SIM', 8),
          paidAt: req.outcome === 'SUCCESS' ? now.toISOString() : null,
          createdAt: now.toISOString(),
        }
        db.payments.push(payment)
        if (req.outcome === 'FAIL') {
          return { order, paymentStatus: 'FAILED' as const, message: 'Pembayaran gagal (simulasi). Coba lagi sebelum waktu habis.' }
        }
        // conditional confirm (layer 3): seats must still be held by this order
        const held = db.sessionSeats.filter((s) => s.orderId === order.id && s.status === 'HELD').length
        const needSeats = order.items.filter((i) => i.seatId).length
        if (held < needSeats) throw new ApiError('HOLD_EXPIRED', 'Waktu habis, kursi sudah dilepas. Pembayaran dibatalkan.')
        await confirmOrder(db, order, req.method, now)
        return { order, paymentStatus: 'SUCCESS' as const, message: 'Pembayaran berhasil.' }
      })
    },

    confirmFree(orderId) {
      return write(async (db, now) => {
        const order = ownOrder(db, orderId)
        if (order.status === 'CONFIRMED') return order
        if (order.status === 'EXPIRED') assertHoldActive(order, now)
        if (order.paymentMethod !== 'FREE' || order.status !== 'AWAITING_PAYMENT') throw new ApiError('BAD_STATE', 'Pesanan ini bukan kategori gratis.')
        assertHoldActive(order, now)
        await confirmOrder(db, order, 'FREE', now)
        return order
      })
    },

    checkReceipts(orderId, inputs) {
      return read((db, now) => {
        const order = must(byId(db.orders, orderId), 'Pesanan')
        const category = categoryOf(db, order.categoryId)
        if (!category.receiptRules) throw new ApiError('BAD_STATE', 'Kategori ini tidak memakai struk.')
        return checkReceiptRules(inputs, { rules: category.receiptRules, tenants: db.tenants, existing: db.receipts, orderId, now })
      })
    },

    submitReceipts(orderId, inputs: ReceiptInput[]) {
      return write((db, now) => {
        const order = ownOrder(db, orderId)
        const category = categoryOf(db, order.categoryId)
        if (!category.receiptRules) throw new ApiError('BAD_STATE', 'Kategori ini tidak memakai struk.')
        if (order.status === 'EXPIRED') assertHoldActive(order, now)
        if (order.status !== 'AWAITING_VERIFICATION') throw new ApiError('BAD_STATE', `Pesanan ${ORDER_STATUS_LABEL[order.status].toLowerCase()}.`)
        assertHoldActive(order, now)
        const current = db.receipts.filter((r) => r.orderId === orderId)
        if (current.some((r) => r.status === 'PENDING')) throw new ApiError('BAD_STATE', 'Struk sudah dikirim dan sedang diverifikasi panitia.')
        const { checks, total } = checkReceiptRules(inputs, { rules: category.receiptRules, tenants: db.tenants, existing: db.receipts, orderId, now })
        if (!receiptChecksPass(checks)) return { ok: false, checks, total, order, receipts: current }
        // replace an earlier set that needed revision
        db.receipts = db.receipts.filter((r) => !(r.orderId === orderId && r.status === 'NEEDS_REVISION'))
        const hashes = new Set(db.receipts.map((r) => r.photoHash))
        const added: Receipt[] = inputs.map((r) => ({
          id: uid('rcp'),
          userId: order.userId,
          orderId,
          tenantId: r.tenantId,
          receiptNo: r.receiptNo.trim().toUpperCase(),
          amount: r.amount,
          receiptDate: r.receiptDate,
          receiptTime: r.receiptTime,
          photoUrl: r.photoUrl,
          photoHash: r.photoHash,
          status: 'PENDING',
          reason: null,
          reviewedBy: null,
          reviewedAt: null,
          possibleDuplicate: hashes.has(r.photoHash),
          createdAt: now.toISOString(),
        }))
        db.receipts.push(...added)
        pushNote(db, {
          userId: order.userId,
          channel: 'WA',
          kind: 'RECEIPT_RESULT',
          orderId: order.id,
          title: 'Struk sedang diverifikasi',
          body: `Struk untuk pesanan ${order.code} sudah diterima dan sedang dicek panitia. Kursi tetap ditahan sampai ${fmtTime(order.holdExpiresAt)} WIB.`,
          createdAt: now.toISOString(),
          scheduledFor: null,
        })
        return { ok: true, checks, total, order, receipts: added }
      })
    },

    getOrder(orderId) {
      return read((db, now) => orderDetail(db, ownOrderRead(db, orderId), now))
    },

    myOrders() {
      const me = visitorId()
      return read((db, now) =>
        db.orders
          .filter((o) => o.userId === me)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((o) => orderDetail(db, liveOrder(o, now), now)),
      )
    },

    myTickets() {
      const me = visitorId()
      return read((db, now): PassItem[] =>
        db.tickets
          .filter((t) => t.userId === me)
          .map((ticket) => {
            const order = must(byId(db.orders, ticket.orderId), 'Pesanan')
            const event = eventOf(db, ticket.eventId)
            return {
              ticket,
              order,
              event,
              venue: venueOf(db, event.venueId),
              session: sessionOf(db, ticket.sessionId, now),
              category: categoryOf(db, ticket.categoryId),
            }
          })
          .sort((a, b) => Number(b.ticket.status === 'ACTIVE') - Number(a.ticket.status === 'ACTIVE') || a.session.startAt.localeCompare(b.session.startAt)),
      )
    },

    myNotifications() {
      const me = visitorId()
      return read((db) => db.notifications.filter((n) => n.userId === me).sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    },

    joinWaitlist(sessionId, categoryId, qty) {
      const userId = getSessionUserId('VISITOR')
      if (!userId) return Promise.reject(new ApiError('NEED_LOGIN', 'Masuk dulu supaya kami bisa mengabari lewat WhatsApp.'))
      return write((db, now) => {
        const session = sessionOf(db, sessionId, now)
        const event = eventOf(db, session.eventId)
        const category = categoryOf(db, categoryId)
        if (category.eventId !== event.id) throw new ApiError('BAD_REQUEST', 'Kategori bukan milik event ini.')
        const n = Math.floor(qty)
        if (n < 1 || n > event.rules.maxSeatsPerOrder) throw new ApiError('RULE', `Pilih 1 sampai ${event.rules.maxSeatsPerOrder} orang.`)
        if (freePlaces(db, sessionId, categoryId, now) >= n) throw new ApiError('RULE', `Masih ada tempat ${category.name} untuk ${n} orang. Pesan langsung saja.`)
        let entry = db.waitlist.find((w) => w.userId === userId && w.sessionId === sessionId && w.categoryId === categoryId && w.status === 'WAITING')
        if (entry) entry.qty = n
        else {
          entry = { id: uid('wl'), userId, sessionId, categoryId, qty: n, status: 'WAITING', createdAt: now.toISOString(), notifiedAt: null }
          db.waitlist.push(entry)
        }
        return waitlistItem(db, entry, now)
      })
    },

    leaveWaitlist(entryId) {
      const me = visitorId()
      return write((db) => {
        const entry = db.waitlist.find((w) => w.id === entryId && w.userId === me)
        if (!entry) throw new ApiError('NOT_FOUND', 'Daftar tunggu tidak ditemukan.')
        entry.status = 'LEFT'
      })
    },

    myWaitlist() {
      const me = visitorId()
      return read((db, now) =>
        db.waitlist
          .filter((w) => w.userId === me && w.status !== 'LEFT')
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((w) => waitlistItem(db, w, now)),
      )
    },

    updateProfile(changes) {
      const me = getSessionUserId('VISITOR')
      if (!me) return Promise.reject(new ApiError('NEED_LOGIN', 'Masuk dulu untuk mengubah profil.'))
      const checked = profileChanges(changes)
      if (!checked.ok) return Promise.reject(new ApiError('INVALID', checked.reason, { field: checked.field }))
      return write((db) => {
        const user = must(getUser(db, me), 'Pengguna')
        // only other visitors count, as on the server: a panitia or petugas address must not be discoverable from here
        if (checked.email && db.users.some((u) => u.id !== me && u.role === 'VISITOR' && u.email === checked.email)) {
          throw new ApiError('DUPLICATE', 'Email ini sudah dipakai akun lain.', { field: 'email' })
        }
        if (checked.name !== undefined) user.name = checked.name
        if (checked.email !== undefined) user.email = checked.email
        // the demo keeps the photo itself; a backend stores it and returns its address
        if (checked.avatar !== undefined) user.avatarUrl = checked.avatar
        return { ...user }
      })
    },

    /* ---------- admin ---------- */
    admin: {
      listEvents() {
        return read((db, now) => db.events.map((e) => summary(db, e, now)).sort((a, b) => a.event.startAt.localeCompare(b.event.startAt)))
      },

      getEventDraft(eventId) {
        return read((db) => {
          const event = eventOf(db, eventId)
          return { draft: draftOf(db, event), event }
        })
      },

      createEvent(draft) {
        return write((db, now) => {
          validateDraft(draft)
          let slug = slugify(draft.title) || 'event'
          if (db.events.some((e) => e.slug === slug)) slug = `${slug}-${Math.floor(Math.random() * 900 + 100)}`
          const { startAt, endAt } = eventDates(draft)
          const event: EventItem = {
            id: uid('evt'),
            slug,
            title: draft.title.trim(),
            subtitle: draft.subtitle?.trim(),
            description: draft.description.trim(),
            posterTheme: draft.posterTheme,
            posterPalette: posterPaletteOf(draft),
            posterImage: posterImageOf(draft),
            venueId: draft.venueId,
            layoutId: null,
            seatingMode: draft.seatingMode,
            status: 'DRAFT',
            startAt,
            endAt,
            rules: { ...draft.rules },
            seatAssignments: {},
            createdBy: getSessionUserId('ADMIN') ?? DEMO_ADMIN_ID,
            createdAt: now.toISOString(),
          }
          const categoryIds = draft.categories.map((c) => {
            const id = uid('cat')
            db.categories.push({ ...c, id, eventId: event.id })
            return id
          })
          applyLayout(db, event, draft, categoryIds)
          db.events.push(event)
          for (const s of draft.sessions) {
            const session: Session = { id: uid('ses'), eventId: event.id, label: s.label, startAt: s.startAt, endAt: s.endAt, demoLive: s.demoLive }
            db.sessions.push(session)
            addInventory(db, event, session)
          }
          return event
        })
      },

      updateEvent(eventId, draft) {
        return write((db) => {
          validateDraft(draft)
          const event = eventOf(db, eventId)
          const hasOrders = db.orders.some((o) => o.eventId === eventId)
          const before = draftOf(db, event)
          const layoutChanged = JSON.stringify(before.layout ?? null) !== JSON.stringify(draft.layout ?? null) || before.seatingMode !== draft.seatingMode
          if (layoutChanged && hasOrders) {
            throw new ApiError('LOCKED_LAYOUT', 'Denah tidak bisa diubah karena sudah ada pesanan. Ubah info, harga, atau sesi saja.')
          }
          Object.assign(event, {
            title: draft.title.trim(),
            subtitle: draft.subtitle?.trim(),
            description: draft.description.trim(),
            posterTheme: draft.posterTheme,
            posterPalette: posterPaletteOf(draft),
            posterImage: posterImageOf(draft),
            venueId: draft.venueId,
            seatingMode: draft.seatingMode,
            rules: { ...draft.rules },
            ...eventDates(draft),
          })
          // categories: upsert by id, delete unused removed ones
          const keepIds: string[] = []
          const categoryIds = draft.categories.map((c) => {
            const existing = c.id ? byId(db.categories, c.id) : undefined
            if (existing && existing.eventId === eventId) {
              Object.assign(existing, { ...c, id: existing.id, eventId })
              keepIds.push(existing.id)
              return existing.id
            }
            const id = uid('cat')
            db.categories.push({ ...c, id, eventId })
            keepIds.push(id)
            return id
          })
          db.categories = db.categories.filter(
            (c) => c.eventId !== eventId || keepIds.includes(c.id) || db.orders.some((o) => o.categoryId === c.id),
          )
          if (layoutChanged) {
            const oldSessions = db.sessions.filter((s) => s.eventId === eventId).map((s) => s.id)
            db.sessionSeats = db.sessionSeats.filter((x) => !oldSessions.includes(x.sessionId))
            db.quotas = db.quotas.filter((x) => !oldSessions.includes(x.sessionId))
            applyLayout(db, event, draft, categoryIds)
            for (const sid of oldSessions) addInventory(db, event, must(byId(db.sessions, sid), 'Sesi'))
          }
          // quotas follow category changes
          for (const c of db.categories.filter((x) => x.eventId === eventId && x.quota != null)) {
            for (const s of db.sessions.filter((x) => x.eventId === eventId)) {
              const q = db.quotas.find((x) => x.sessionId === s.id && x.categoryId === c.id)
              if (q) q.quota = c.quota!
              else db.quotas.push({ sessionId: s.id, categoryId: c.id, quota: c.quota!, filled: 0 })
            }
          }
          // sessions: upsert, delete removed ones without orders
          const keepSessions: string[] = []
          for (const s of draft.sessions) {
            const existing = s.id ? byId(db.sessions, s.id) : undefined
            if (existing && existing.eventId === eventId) {
              Object.assign(existing, { label: s.label, startAt: s.startAt, endAt: s.endAt, demoLive: s.demoLive })
              keepSessions.push(existing.id)
            } else {
              const session: Session = { id: uid('ses'), eventId, label: s.label, startAt: s.startAt, endAt: s.endAt, demoLive: s.demoLive }
              db.sessions.push(session)
              addInventory(db, event, session)
              keepSessions.push(session.id)
            }
          }
          const removable = db.sessions.filter((s) => s.eventId === eventId && !keepSessions.includes(s.id) && !db.orders.some((o) => o.sessionId === s.id))
          const removeIds = removable.map((s) => s.id)
          db.sessions = db.sessions.filter((s) => !removeIds.includes(s.id))
          db.sessionSeats = db.sessionSeats.filter((x) => !removeIds.includes(x.sessionId))
          db.quotas = db.quotas.filter((x) => !removeIds.includes(x.sessionId))
          return event
        })
      },

      publishEvent(eventId) {
        return write((db) => {
          const event = eventOf(db, eventId)
          if (!db.sessions.some((s) => s.eventId === eventId) && !event.infoOnly) throw new ApiError('BAD_STATE', 'Tambahkan minimal 1 sesi sebelum publish.')
          event.status = 'PUBLISHED'
          return event
        })
      },

      listOrders(filter) {
        return read((db, now): OrderRow[] => {
          const q = filter.q?.trim().toLowerCase()
          const qPhone = q ? normalizePhone(q) : ''
          return db.orders
            .filter((o) => !filter.eventId || o.eventId === filter.eventId)
            .filter((o) => !filter.status || filter.status === 'ALL' || o.status === filter.status)
            .filter((o) => {
              if (!q) return true
              return (
                o.code.toLowerCase().includes(q) ||
                o.buyerName.toLowerCase().includes(q) ||
                (qPhone.length >= 4 && o.buyerPhone.includes(qPhone)) ||
                o.items.some((i) => i.seatLabel?.toLowerCase() === q || i.attendeeName?.toLowerCase().includes(q))
              )
            })
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((o) => ({
              order: liveOrder(o, now),
              event: eventOf(db, o.eventId),
              session: sessionOf(db, o.sessionId, now),
              category: categoryOf(db, o.categoryId),
              receipts: db.receipts.filter((r) => r.orderId === o.id),
              checkedIn: db.tickets.filter((t) => t.orderId === o.id && t.status === 'USED').length,
            }))
        })
      },

      markPaid(orderId) {
        return write(async (db, now) => {
          const order = must(byId(db.orders, orderId), 'Pesanan')
          if (order.status !== 'AWAITING_PAYMENT') throw new ApiError('BAD_STATE', 'Hanya pesanan "Menunggu pembayaran" yang bisa ditandai lunas.')
          assertHoldActive(order, now)
          db.payments.push({
            id: uid('pay'),
            orderId,
            method: order.paymentMethod === 'FREE' ? 'FREE' : 'SIM_VA',
            amount: order.totalAmount,
            status: 'SUCCESS',
            idempotencyKey: `manual-${orderId}`,
            simRef: 'MANUAL-PANITIA',
            paidAt: now.toISOString(),
            createdAt: now.toISOString(),
          })
          await confirmOrder(db, order, order.paymentMethod === 'FREE' ? 'FREE' : 'SIM_VA', now)
          return order
        })
      },

      cancelOrder(orderId) {
        return write((db, now) => {
          const order = must(byId(db.orders, orderId), 'Pesanan')
          if (order.status === 'CANCELLED' || order.status === 'EXPIRED' || order.status === 'REJECTED') throw new ApiError('BAD_STATE', 'Pesanan sudah tidak aktif.')
          const wasConfirmed = order.status === 'CONFIRMED'
          const paid = order.paymentMethod === 'SIM_QRIS' || order.paymentMethod === 'SIM_VA'
          order.status = 'CANCELLED'
          order.cancelledAt = now.toISOString()
          order.cancelledBy = 'ADMIN'
          order.refundAmount = wasConfirmed && paid ? order.totalAmount : null
          db.notifications = db.notifications.filter((n) => !(n.orderId === order.id && n.scheduledFor))
          releaseOrderSeats(db, order)
          for (const ss of db.sessionSeats) {
            if (ss.orderId === order.id && ss.status === 'SOLD') Object.assign(ss, { status: 'AVAILABLE', orderId: null, holdExpiresAt: null })
          }
          for (const t of db.tickets) if (t.orderId === order.id && t.status === 'ACTIVE') t.status = 'CANCELLED'
          notifyWaitlist(db, order, now)
          if (!order.simulated) {
            pushNote(db, {
              userId: order.userId,
              channel: 'WA',
              kind: 'ORDER_REJECTED',
              orderId: order.id,
              title: 'Pesanan dibatalkan panitia',
              body: wasConfirmed
                ? `Pesanan ${order.code} dibatalkan panitia. ${order.refundAmount ? `Refund ${rupiahPlain(order.refundAmount)} diproses ke metode bayar asal (simulasi).` : 'Tidak ada pembayaran yang perlu dikembalikan.'}`
                : `Pesanan ${order.code} dibatalkan panitia dan kursinya dilepas.`,
              createdAt: now.toISOString(),
              scheduledFor: null,
            })
          }
          return order
        })
      },

      listReceipts(status) {
        return read((db, now): ReceiptQueueItem[] => {
          const byOrder = new Map<string, Receipt[]>()
          for (const r of db.receipts) {
            const list = byOrder.get(r.orderId) ?? []
            list.push(r)
            byOrder.set(r.orderId, list)
          }
          const items: ReceiptQueueItem[] = []
          for (const [orderId, siblings] of byOrder) {
            const order = byId(db.orders, orderId)
            if (!order) continue
            const live = liveOrder(order, now)
            const rep = siblings[0]
            if (status === 'PENDING' && !(live.status === 'AWAITING_VERIFICATION' && siblings.some((s) => s.status === 'PENDING'))) continue
            if (status !== 'ALL' && status !== 'PENDING' && rep.status !== status) continue
            const category = categoryOf(db, order.categoryId)
            const checks = category.receiptRules
              ? checkReceiptRules(siblings, { rules: category.receiptRules, tenants: db.tenants, existing: db.receipts, orderId, now }).checks
              : []
            if (siblings.some((s) => s.possibleDuplicate) && !checks.some((c) => c.warning)) {
              checks.push({ rule: 'R6', ok: true, warning: true, message: 'Foto struk sama dengan struk lain. Cek ulang struk aslinya.' })
            }
            items.push({
              receipt: rep,
              order: live,
              event: eventOf(db, order.eventId),
              session: sessionOf(db, order.sessionId, now),
              category,
              tenant: db.tenants.find((t) => t.id === rep.tenantId) ?? null,
              siblings,
              checks,
              user: getUser(db, order.userId),
            })
          }
          return items.sort((a, b) => a.receipt.createdAt.localeCompare(b.receipt.createdAt))
        })
      },

      reviewReceipt(receiptId, decision, reason, reviewerId?: string) {
        return write(async (db, now) => {
          const receipt = must(byId(db.receipts, receiptId), 'Struk')
          const order = must(byId(db.orders, receipt.orderId), 'Pesanan')
          if (order.status !== 'AWAITING_VERIFICATION') {
            throw new ApiError('BAD_STATE', order.status === 'EXPIRED' ? 'Waktu tahan kursi sudah habis, pesanan kedaluwarsa.' : `Pesanan ${ORDER_STATUS_LABEL[order.status].toLowerCase()}.`)
          }
          const reviewer = reviewerId ?? getSessionUserId('ADMIN') ?? DEMO_ADMIN_ID
          const set = db.receipts.filter((r) => r.orderId === order.id && (r.status === 'PENDING' || r.status === 'NEEDS_REVISION'))
          const stamp = (status: Receipt['status']) => {
            for (const r of set) Object.assign(r, { status, reason: reason?.trim() || null, reviewedBy: reviewer, reviewedAt: now.toISOString() })
          }
          if (decision === 'APPROVE') {
            assertHoldActive(order, now)
            stamp('APPROVED')
            await confirmOrder(db, order, 'RECEIPT', now)
          } else if (decision === 'NEEDS_REVISION') {
            if (!reason?.trim()) throw new ApiError('NEED_REASON', 'Tulis alasan revisi supaya pengunjung tahu apa yang harus diperbaiki.')
            stamp('NEEDS_REVISION')
            pushNote(db, {
              userId: order.userId,
              channel: 'WA',
              kind: 'RECEIPT_RESULT',
              orderId: order.id,
              title: 'Struk perlu revisi',
              body: `Struk pesanan ${order.code} perlu diperbaiki: ${reason.trim()}. Upload ulang sebelum ${fmtTime(order.holdExpiresAt)} WIB.`,
              createdAt: now.toISOString(),
              scheduledFor: null,
            })
          } else {
            if (!reason?.trim()) throw new ApiError('NEED_REASON', 'Tulis alasan penolakan.')
            stamp('REJECTED')
            order.status = 'REJECTED'
            releaseOrderSeats(db, order)
            notifyWaitlist(db, order, now)
            pushNote(db, {
              userId: order.userId,
              channel: 'WA',
              kind: 'ORDER_REJECTED',
              orderId: order.id,
              title: 'Struk ditolak',
              body: `Struk pesanan ${order.code} ditolak: ${reason.trim()}. Kursi sudah dilepas.`,
              createdAt: now.toISOString(),
              scheduledFor: null,
            })
          }
          return orderDetail(db, order, now)
        })
      },

      stats(eventId) {
        return read((db, now): EventStats => {
          const event = eventOf(db, eventId)
          const categories = db.categories.filter((c) => c.eventId === eventId)
          const sessions = db.sessions.filter((s) => s.eventId === eventId).map((s) => resolveSession(s, now))
          const orders = db.orders.filter((o) => o.eventId === eventId).map((o) => liveOrder(o, now))
          const tickets = db.tickets.filter((t) => t.eventId === eventId && t.status !== 'CANCELLED')
          const confirmed = orders.filter((o) => o.status === 'CONFIRMED')
          const transactions = { AWAITING_PAYMENT: 0, AWAITING_VERIFICATION: 0, CONFIRMED: 0, EXPIRED: 0, CANCELLED: 0, REJECTED: 0 } as Record<OrderStatus, number>
          for (const o of orders.filter((x) => !x.simulated)) transactions[o.status]++
          const byCategory = categories.map((c) => {
            let sold = 0
            let held = 0
            let total = 0
            for (const s of sessions) {
              const av = availability(db, s, [c], now)[0]
              sold += av.sold
              held += av.held
              total += av.total
            }
            const revenue = confirmed.filter((o) => o.categoryId === c.id).reduce((s, o) => s + o.totalAmount, 0)
            return { category: c, sold, held, total, revenue }
          })
          const bySession = sessions.map((s) => {
            const av = availability(db, s, categories, now)
            const capacity = av.reduce((a, b) => a + b.total, 0)
            const sold = av.reduce((a, b) => a + b.sold, 0)
            const held = av.reduce((a, b) => a + b.held, 0)
            const checkedIn = tickets.filter((t) => t.sessionId === s.id && t.status === 'USED').length
            return { session: s, capacity, sold, held, checkedIn, occupancyPct: capacity ? Math.round((checkedIn / capacity) * 100) : 0 }
          })
          const approved = db.receipts.filter((r) => r.status === 'APPROVED' && orders.some((o) => o.id === r.orderId))
          const tenantMap = new Map<string, { amount: number; count: number }>()
          for (const r of approved) {
            const t = tenantMap.get(r.tenantId) ?? { amount: 0, count: 0 }
            t.amount += r.amount
            t.count += 1
            tenantMap.set(r.tenantId, t)
          }
          const ended = bySession.filter((s) => new Date(s.session.endAt) < now && !s.session.demoLive)
          const endedSold = ended.reduce((a, b) => a + b.sold, 0)
          const endedIn = ended.reduce((a, b) => a + b.checkedIn, 0)
          // the last 30 days, each with what was confirmed that day
          const days = Array.from({ length: 30 }, (_, i) => wibDate(new Date(now.getTime() - (29 - i) * 86_400_000)))
          const dayMap = new Map(days.map((d) => [d, { date: d, tickets: 0, revenue: 0, orders: 0 }]))
          for (const o of confirmed.filter((x) => !x.simulated && x.confirmedAt)) {
            const row = dayMap.get(wibDate(new Date(o.confirmedAt!)))
            if (!row) continue
            row.orders += 1
            row.tickets += o.qty
            row.revenue += o.totalAmount
          }
          const sessionIds = new Set(sessions.map((s) => s.id))
          const checkinsByHour = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
          for (const c of db.checkins.filter((x) => x.result === 'VALID' && sessionIds.has(x.sessionId))) {
            const at = new Date(new Date(c.scannedAt).getTime() + 7 * 3600_000) // WIB
            checkinsByHour[(at.getUTCDay() + 6) % 7][at.getUTCHours()] += 1
          }
          return {
            event,
            registrants: new Set(orders.filter((o) => !o.simulated && (o.status === 'CONFIRMED' || isPending(o))).map((o) => o.userId)).size,
            ticketsSold: tickets.length,
            revenue: confirmed.reduce((s, o) => s + o.totalAmount, 0),
            transactions,
            byCategory,
            bySession,
            receiptTotal: approved.reduce((s, r) => s + r.amount, 0),
            receiptsPending: new Set(db.receipts.filter((r) => r.status === 'PENDING' && orders.some((o) => o.id === r.orderId && o.status === 'AWAITING_VERIFICATION')).map((r) => r.orderId)).size,
            topTenants: [...tenantMap.entries()]
              .map(([id, v]) => ({ tenant: must(db.tenants.find((t) => t.id === id), 'Tenant'), ...v }))
              .sort((a, b) => b.amount - a.amount)
              .slice(0, 5),
            noShowPct: endedSold ? Math.round(((endedSold - endedIn) / endedSold) * 100) : null,
            daily: [...dayMap.values()],
            checkinsByHour,
            generatedAt: now.toISOString(),
          }
        })
      },

      exportCsv(eventId, type) {
        return read((db, now) => {
          const event = eventOf(db, eventId)
          const date = wibDate(now)
          if (type === 'attendees') {
            const header = ['Kode Tiket', 'Nama Peserta', 'Pemesan', 'No HP', 'Kategori', 'Kursi', 'Sesi', 'Status Tiket', 'Waktu Check-in']
            const rows = db.tickets
              .filter((t) => t.eventId === eventId)
              .map((t) => {
                const o = must(byId(db.orders, t.orderId), 'Pesanan')
                const s = sessionOf(db, t.sessionId, now)
                return [
                  t.code,
                  t.attendeeName ?? '',
                  o.buyerName,
                  o.buyerPhone,
                  categoryOf(db, t.categoryId).name,
                  t.seatLabel ?? 'Tanpa nomor',
                  `${s.label ?? ''} ${fmtShortDate(s.startAt)} ${fmtRange(s.startAt, s.endAt)}`.trim(),
                  TICKET_STATUS_LABEL[t.status],
                  t.usedAt ? `${fmtShortDate(t.usedAt)} ${fmtTime(t.usedAt)}` : '',
                ]
              })
            return { filename: `summarevent-${event.slug}-peserta-${date}.csv`, csv: [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') }
          }
          const header = ['Kode Pesanan', 'Pemesan', 'No HP', 'Kategori', 'Sesi', 'Kursi', 'Jumlah', 'Total (Rp)', 'Metode', 'Status', 'Dibuat', 'Dikonfirmasi']
          const rows = db.orders
            .filter((o) => o.eventId === eventId && !o.simulated)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            .map((raw) => {
              const o = liveOrder(raw, now)
              const s = sessionOf(db, o.sessionId, now)
              return [
                o.code,
                o.buyerName,
                o.buyerPhone,
                categoryOf(db, o.categoryId).name,
                `${s.label ?? ''} ${fmtShortDate(s.startAt)}`.trim(),
                o.items.map((i) => i.seatLabel).filter(Boolean).join(' '),
                o.qty,
                o.totalAmount,
                o.paymentMethod ? PAYMENT_METHOD_LABEL[o.paymentMethod] : '',
                ORDER_STATUS_LABEL[o.status],
                `${fmtShortDate(o.createdAt)} ${fmtTime(o.createdAt)}`,
                o.confirmedAt ? `${fmtShortDate(o.confirmedAt)} ${fmtTime(o.confirmedAt)}` : '',
              ]
            })
          return { filename: `summarevent-${event.slug}-transaksi-${date}.csv`, csv: [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') }
        })
      },

      venues() {
        return read((db) => db.venues)
      },

      tenants() {
        return read((db) => db.tenants)
      },

      listStaff() {
        return read((db): StaffAccount[] =>
          db.users
            .filter((u) => u.role === 'STAFF')
            .map((u) => {
              const valid = db.checkins.filter((c) => c.staffId === u.id && c.result === 'VALID')
              const last = db.checkins.filter((c) => c.staffId === u.id).sort((a, b) => b.scannedAt.localeCompare(a.scannedAt))[0]
              return { ...u, active: u.active !== false, scans: valid.length, lastScanAt: last?.scannedAt ?? null }
            })
            .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)),
        )
      },

      createStaff(input) {
        return write((db, now) => {
          const name = input.name.trim()
          const phone = normalizePhone(input.phone)
          const checked = profileChanges({ email: input.email })
          if (name.length < 3) throw new ApiError('INVALID', 'Tulis nama petugas, minimal 3 huruf.', { field: 'name' })
          if (!isValidPhone(phone)) throw new ApiError('INVALID', 'Nomor HP belum benar. Contoh: 0812 3456 7890.', { field: 'phone' })
          if (!checked.ok || !checked.email) throw new ApiError('INVALID', 'Tulis email petugas, misalnya nama@contoh.id.', { field: 'email' })
          if (db.users.some((u) => u.role === 'STAFF' && u.phone === phone)) throw new ApiError('DUPLICATE', 'Nomor HP ini sudah dipakai akun petugas lain.', { field: 'phone' })
          if (db.users.some((u) => u.email === checked.email)) throw new ApiError('DUPLICATE', 'Email ini sudah dipakai akun lain.', { field: 'email' })
          const user: User = { id: uid('stf'), role: 'STAFF', name, phone, email: checked.email, createdAt: now.toISOString(), active: true }
          db.users.push(user)
          // the invitation: a reset link, valid a day, so the petugas sets their own password (a backend emails it)
          db.resetTokens.push({ token: uid('rst').slice(4) + uid('rst').slice(4), userId: user.id, expiresAt: new Date(now.getTime() + 24 * 3600_000).toISOString() })
          return user
        })
      },

      setStaffActive(userId, active) {
        return write((db) => {
          const u = db.users.find((x) => x.id === userId && x.role === 'STAFF')
          if (!u) throw new ApiError('NOT_FOUND', 'Akun petugas tidak ditemukan.')
          u.active = active
          return u
        })
      },
    },

    /* ---------- staff ---------- */
    staff: {
      async accounts() {
        return (await api.admin.listStaff()).filter((s) => s.active)
      },

      async offlineManifest(sessionId): Promise<OfflineManifest> {
        const snapshot = await read((db, now) => {
          const session = sessionOf(db, sessionId, now)
          const event = eventOf(db, session.eventId)
          const sessions = new Map(db.sessions.filter((x) => x.eventId === event.id).map((x) => [x.id, resolveSession(x, now)]))
          const orders = new Map(db.orders.filter((o) => o.eventId === event.id).map((o) => [o.id, o]))
          const rows = db.tickets
            .filter((t) => t.eventId === event.id)
            .map(({ qrToken, ...ticket }) => {
              const order = orders.get(ticket.orderId)
              return { qrToken, ticket, order: { id: ticket.orderId, code: order?.code ?? '', buyerName: order?.buyerName ?? '' }, session: sessions.get(ticket.sessionId) ?? session }
            })
          return { sessionId, generatedAt: now.toISOString(), event, session, categories: db.categories.filter((c) => c.eventId === event.id), rows }
        })
        const { rows, ...rest } = snapshot
        // only a hash of each QR token leaves the server
        const tickets = await Promise.all(rows.map(async ({ qrToken, ...row }) => ({ tokenHash: await sha256Hex(qrToken), ...row })))
        return { ...rest, tickets }
      },

      async checkinTicket(ticketId, sessionId) {
        // a ticket picked by hand: checked as if its QR had been scanned (an unknown id finds no QR, so is INVALID)
        const qrToken = await read((db) => db.tickets.find((t) => t.id === ticketId)?.qrToken ?? '')
        return this.checkin(qrToken, sessionId)
      },
      async checkin(qrToken, sessionId) {
        const parsed = await verifyQrToken(qrToken)
        return write((db, now): CheckinResponse => {
          const staffId = getSessionUserId('STAFF') ?? DEMO_STAFF_ID
          if (getUser(db, staffId)?.active === false) throw new ApiError('FORBIDDEN', 'Akun petugas ini dinonaktifkan panitia. Minta panitia mengaktifkannya lagi.')
          const record = (result: CheckinResponse['result'], ticket: Ticket | null) =>
            db.checkins.push({ id: uid('chk'), ticketId: ticket?.id ?? null, sessionId, staffId, scannedAt: now.toISOString(), result })

          const scanSession = sessionOf(db, sessionId, now)
          if (!parsed.ok) {
            record('INVALID', null)
            return checkinResponseFrom(db, 'INVALID', 'QR tidak dikenali atau sudah diubah. Minta pengunjung membuka Pass Saya.', null, now)
          }
          const ticket = db.tickets.find((t) => t.id === parsed.ticketId) ?? null
          if (!ticket || ticket.qrVersion !== parsed.qrVersion) {
            record('INVALID', ticket)
            return checkinResponseFrom(db, 'INVALID', 'Tiket tidak ditemukan atau QR sudah diganti.', ticket, now)
          }
          if (ticket.status === 'CANCELLED') {
            record('INVALID', ticket)
            return checkinResponseFrom(db, 'INVALID', 'Tiket ini sudah dibatalkan.', ticket, now)
          }
          if (ticket.eventId !== scanSession.eventId) {
            record('INVALID', ticket)
            return checkinResponseFrom(db, 'INVALID', `Tiket untuk event lain (${eventOf(db, ticket.eventId).title}).`, ticket, now)
          }
          const event = eventOf(db, ticket.eventId)
          if (ticket.status === 'USED' && !event.rules.reentryAllowed) {
            record('ALREADY_USED', ticket)
            const first = db.checkins.find((c) => c.ticketId === ticket.id && c.result === 'VALID') ?? null
            return checkinResponseFrom(
              db,
              'ALREADY_USED',
              first ? `Tiket sudah dipakai jam ${fmtTime(first.scannedAt)}.` : 'Tiket sudah dipakai.',
              ticket,
              now,
              first ? { ...first, staffName: getUser(db, first.staffId)?.name ?? 'Petugas' } : null,
            )
          }
          if (ticket.sessionId !== sessionId) {
            const ts = sessionOf(db, ticket.sessionId, now)
            record('WRONG_SESSION', ticket)
            return checkinResponseFrom(db, 'WRONG_SESSION', `Tiket untuk ${ts.label ?? 'sesi lain'} (${fmtShortDate(ts.startAt)} ${fmtTime(ts.startAt)}).`, ticket, now)
          }
          const win = checkinWindow(scanSession, event.rules)
          if (now < win.open || now > win.close) {
            record('OUTSIDE_WINDOW', ticket)
            return checkinResponseFrom(
              db,
              'OUTSIDE_WINDOW',
              now < win.open ? `Check-in dibuka ${fmtShortDate(win.open.toISOString())} jam ${fmtTime(win.open.toISOString())}.` : `Check-in sudah ditutup jam ${fmtTime(win.close.toISOString())}.`,
              ticket,
              now,
            )
          }
          ticket.status = 'USED'
          ticket.usedAt = now.toISOString()
          record('VALID', ticket)
          return checkinResponseFrom(db, 'VALID', ticket.seatLabel ? `Kursi ${ticket.seatLabel}` : 'Tanpa nomor kursi', ticket, now)
        })
      },

      searchTickets(q, eventId) {
        return read((db, now): TicketSearchRow[] => {
          const term = q.trim().toLowerCase()
          if (term.length < 2) return []
          const phone = normalizePhone(term)
          return db.tickets
            .filter((t) => !eventId || t.eventId === eventId)
            .filter((t) => {
              const o = byId(db.orders, t.orderId)
              if (!o) return false
              return (
                t.code.toLowerCase().includes(term) ||
                o.code.toLowerCase().includes(term) ||
                (phone.length >= 4 && o.buyerPhone.includes(phone)) ||
                o.buyerName.toLowerCase().includes(term) ||
                (t.attendeeName?.toLowerCase().includes(term) ?? false)
              )
            })
            .slice(0, 30)
            .map((t) => ({
              ticket: t,
              order: must(byId(db.orders, t.orderId), 'Pesanan'),
              event: eventOf(db, t.eventId),
              session: sessionOf(db, t.sessionId, now),
              category: categoryOf(db, t.categoryId),
            }))
        })
      },

      recentCheckins(sessionId) {
        return read((db, now) => {
          const tickets = db.tickets.filter((t) => t.sessionId === sessionId && t.status !== 'CANCELLED')
          const recent = db.checkins
            .filter((c) => c.sessionId === sessionId)
            .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt))
            .slice(0, 8)
            .map((c) => {
              const t = c.ticketId ? (byId(db.tickets, c.ticketId) ?? null) : null
              return { ...checkinResponseFrom(db, c.result, '', t, now), message: fmtTime(c.scannedAt) }
            })
          return { checkedIn: tickets.filter((t) => t.status === 'USED').length, capacity: tickets.length, recent }
        })
      },

      listReceipts(eventId) {
        return api.admin.listReceipts('PENDING').then((items) => items.filter((it) => !eventId || it.event.id === eventId))
      },

      reviewReceipt(receiptId, decision, reason) {
        const review = api.admin.reviewReceipt as (id: string, d: ReviewDecision, r?: string, reviewerId?: string) => Promise<OrderDetail>
        return review(receiptId, decision, reason, getSessionUserId('STAFF') ?? DEMO_STAFF_ID)
      },
    },

    /* ---------- demo ---------- */
    demo: {
      async reset() {
        await clearDb()
        clearClientSessions()
        ready = null
        await replaceDb(await buildSeed())
        ready = Promise.resolve()
      },

      expireHold(orderId) {
        return write((db, now) => {
          const order = ownOrder(db, orderId)
          if (!isPending(order)) throw new ApiError('BAD_STATE', `Pesanan ${ORDER_STATUS_LABEL[order.status].toLowerCase()}, tidak sedang menahan kursi.`)
          const past = new Date(now.getTime() - 1000).toISOString()
          order.holdExpiresAt = past
          for (const ss of db.sessionSeats) if (ss.orderId === order.id && ss.status === 'HELD') ss.holdExpiresAt = past
          sweep(db, now)
          return order
        })
      },

      fakeBuyer(sessionId, categoryId, seatIds) {
        return write((db, now) => {
          const session = sessionOf(db, sessionId, now)
          const event = eventOf(db, session.eventId)
          const views = seatViews(db, sessionId, event.layoutId, now)
          if (seatIds?.length) {
            // "Uji rebutan kursi": the simulated buyer grabs exactly these seats first
            const free = views.filter((v) => seatIds.includes(v.seat.id) && v.status === 'AVAILABLE' && v.categoryId)
            if (!free.length) throw new ApiError('CONFLICT', 'Kursi itu sudah tidak tersedia.')
            const cid = free[0].categoryId!
            const res = holdTx(db, now, sessionId, { categoryId: cid, seatIds: free.filter((v) => v.categoryId === cid).map((v) => v.seat.id) }, 'u_sim', { simulated: true, holdSeconds: 60 })
            if (!res.ok) throw new ApiError('CONFLICT', res.message)
            return { seatLabels: res.order.items.map((i) => i.seatLabel ?? '') }
          }
          const cats = db.categories.filter((c) => c.eventId === event.id && c.quota == null && (!categoryId || c.id === categoryId))
          const withSeats = cats.filter((c) => views.some((v) => v.categoryId === c.id && v.status === 'AVAILABLE'))
          if (!withSeats.length) throw new ApiError('SOLD_OUT', 'Tidak ada kursi kosong untuk disimulasikan.')
          const c = withSeats[Math.floor(Math.random() * withSeats.length)]
          const avail = views.filter((v) => v.categoryId === c.id && v.status === 'AVAILABLE')
          const pick = avail[Math.floor(Math.random() * avail.length)].seat
          const qty = 1 + Math.floor(Math.random() * 2)
          const sug = suggestSeats(views, c.id, qty, layoutOf(db, event.layoutId), { x: pick.x, y: pick.y })
          const res = holdTx(db, now, sessionId, { categoryId: c.id, seatIds: sug.seatIds }, 'u_sim', { simulated: true, holdSeconds: 60 })
          if (!res.ok) throw new ApiError('CONFLICT', res.message)
          return { seatLabels: res.order.items.map((i) => i.seatLabel ?? '') }
        })
      },
    },

    subscribe,
  }

  function ownOrderRead(db: Db, orderId: string): Order {
    const order = must(byId(db.orders, orderId), 'Pesanan')
    if (order.userId !== visitorId()) throw new ApiError('NOT_FOUND', 'Pesanan tidak ditemukan.')
    return liveOrder(order, new Date())
  }

  return api
}

/** Read-side view of lazy expiry: a pending order past its hold is reported as EXPIRED. */
function liveOrder(o: Order, now: Date): Order {
  if (isPending(o) && new Date(o.holdExpiresAt) <= now) return { ...o, status: 'EXPIRED' }
  return o
}

function claimGuest(db: Db, guest: string, user: User) {
  if (guest === user.id) return
  for (const o of db.orders) {
    if (o.userId === guest) {
      o.userId = user.id
      o.buyerName = user.name
      o.buyerPhone = user.phone
      const first = o.items[0]
      if (first && !first.attendeeName) first.attendeeName = user.name
    }
  }
  for (const r of db.receipts) if (r.userId === guest) r.userId = user.id
  for (const t of db.tickets) if (t.userId === guest) t.userId = user.id
  for (const n of db.notifications) if (n.userId === guest) n.userId = user.id
}

/** The draft's own poster colours, tidied; none when the theme's colours apply. */
function posterPaletteOf(d: EventDraft) {
  if (!d.posterPalette) return undefined
  const c = posterPaletteCheck(d.posterPalette)
  if (!c.ok) throw new ApiError('INVALID', c.reason, { field: 'posterPalette' })
  return c.palette
}

/** The draft's own poster picture, checked; none when the generated poster applies. */
function posterImageOf(d: EventDraft) {
  const c = posterImageCheck(d.posterImage)
  if (!c.ok) throw new ApiError('INVALID', c.reason, { field: 'posterImage' })
  return c.image ?? undefined
}

function validateDraft(d: EventDraft) {
  if (!d.title.trim()) throw new ApiError('INVALID', 'Judul event wajib diisi.')
  posterPaletteOf(d)
  posterImageOf(d)
  if (!d.venueId) throw new ApiError('INVALID', 'Pilih venue.')
  if (!d.categories.length) throw new ApiError('INVALID', 'Tambahkan minimal 1 kategori tiket.')
  for (const c of d.categories) {
    if (!c.name.trim()) throw new ApiError('INVALID', 'Setiap kategori butuh nama.')
    if (c.accessMethod === 'PAID' && c.price <= 0) throw new ApiError('INVALID', `Harga kategori ${c.name} harus lebih dari 0.`)
    if (c.accessMethod === 'RECEIPT' && !c.receiptRules) throw new ApiError('INVALID', `Kategori ${c.name} butuh aturan struk.`)
  }
  if (d.seatingMode === 'RESERVED' && !d.layout) throw new ApiError('INVALID', 'Buat denah kursi dulu.')
  for (const s of d.sessions) {
    if (new Date(s.endAt) <= new Date(s.startAt)) throw new ApiError('INVALID', 'Jam selesai sesi harus setelah jam mulai.')
  }
}

/** Maintenance tick (PRD §11 "job berkala"): expire holds even when nobody is writing. */
export function startMockMaintenance(intervalMs = 15_000): () => void {
  const id = setInterval(() => {
    const db = readDb()
    if (!db) return
    const now = new Date()
    const due = db.orders.some((o) => isPending(o) && new Date(o.holdExpiresAt) <= now) || db.sessionSeats.some((s) => s.status === 'HELD' && !isHoldActive(s, now))
    if (due) void transaction((d) => sweep(d, new Date()))
  }, intervalMs)
  return () => clearInterval(id)
}
