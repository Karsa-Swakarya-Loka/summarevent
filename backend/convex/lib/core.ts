/**
 * Shared endpoint logic, ported from frontend/src/api/mock/adapter.ts (same names, same messages). The pure rules come
 * from ../shared (generated from frontend/src/domain), so both sides decide the same way.
 */
import type { CategoryAvailability, CheckinResponse, EventDraft, EventSummary, HoldRequest, HoldResult, OrderDetail, SessionSummary, WaitlistItem } from '../shared/contract'
import { demoEnabled } from './demo'
import { fmtRange, fmtShortDate, fmtTime } from '../shared/format'
import { buildSeats, effectiveSeatStatus, isHoldActive, posterPaletteCheck, randomCode, resolveSession, rowIndex, rowLetter, saleState, seatLabel, suggestSeats, uid } from '../shared/rules'
import type {
  AppNotification,
  Checkin,
  EventItem,
  Order,
  OrderStatus,
  Payment,
  PaymentMethod,
  PosterPalette,
  Receipt,
  Seat,
  SeatLayout,
  Session,
  SessionQuota,
  SessionSeat,
  Tenant,
  Ticket,
  TicketCategory,
  User,
  Venue,
  WaitlistEntry,
} from '../shared/types'
import { makeQrToken } from './crypto'
import { fail, must } from './errors'
import type { Tx } from './tx'

export const PENDING: OrderStatus[] = ['AWAITING_PAYMENT', 'AWAITING_VERIFICATION']
export const isPending = (o: Order) => PENDING.includes(o.status)

/* ------------------------------------------------------------------ lookups */

export const eventOf = async (tx: Tx, id: string) => must(await tx.get<EventItem>('events', id), 'Event')
export const rawSessionOf = async (tx: Tx, id: string) => must(await tx.get<Session>('sessions', id), 'Sesi')
export const sessionOf = async (tx: Tx, id: string) => resolveSession(await rawSessionOf(tx, id), tx.now)
export const categoryOf = async (tx: Tx, id: string) => must(await tx.get<TicketCategory>('categories', id), 'Kategori')
export const venueOf = async (tx: Tx, id: string) => must(await tx.get<Venue>('venues', id), 'Venue')
export const orderOf = async (tx: Tx, id: string) => must(await tx.get<Order>('orders', id), 'Pesanan')
export const getUser = (tx: Tx, id: string) => tx.get<User>('users', id)
export const layoutOf = (tx: Tx, id: string | null) => tx.get<SeatLayout>('layouts', id)
export const categoriesOf = (tx: Tx, eventId: string) => tx.where<TicketCategory>('categories', 'by_event', { eventId })
export const sessionsOf = (tx: Tx, eventId: string) => tx.where<Session>('sessions', 'by_event', { eventId })
export const seatsOf = (tx: Tx, layoutId: string | null) => (layoutId ? tx.where<Seat>('seats', 'by_layout', { layoutId }) : Promise.resolve([] as Seat[]))
export const sessionSeatsOf = (tx: Tx, sessionId: string) => tx.where<SessionSeat>('sessionSeats', 'by_session_seat', { sessionId })
export const sessionSeat = async (tx: Tx, sessionId: string, seatId: string) => (await tx.where<SessionSeat>('sessionSeats', 'by_session_seat', { sessionId, seatId }))[0]
export const quotaOf = async (tx: Tx, sessionId: string, categoryId: string) =>
  (await tx.where<SessionQuota>('quotas', 'by_session_category', { sessionId, categoryId }))[0]
export const ordersOfSessionCategory = (tx: Tx, sessionId: string, categoryId: string) => tx.where<Order>('orders', 'by_session_category', { sessionId, categoryId })
export const receiptsOf = (tx: Tx, orderId: string) => tx.where<Receipt>('receipts', 'by_order', { orderId })
export const ticketsOf = (tx: Tx, orderId: string) => tx.where<Ticket>('tickets', 'by_order', { orderId })
export const tenantsAll = (tx: Tx) => tx.all<Tenant>('tenants')

/* ------------------------------------------------------------------ writes shared by many endpoints */

export async function releaseOrderSeats(tx: Tx, order: Order) {
  for (const ss of await tx.where<SessionSeat>('sessionSeats', 'by_order', { orderId: order.id })) {
    if (ss.status === 'HELD') {
      ss.status = 'AVAILABLE'
      ss.orderId = null
      ss.holdExpiresAt = null
    }
  }
}

/** Free the seats an order had bought (cancelled after confirmation). */
export async function releaseSoldSeats(tx: Tx, order: Order) {
  for (const ss of await tx.where<SessionSeat>('sessionSeats', 'by_order', { orderId: order.id })) {
    if (ss.status === 'SOLD') Object.assign(ss, { status: 'AVAILABLE', orderId: null, holdExpiresAt: null })
  }
}

export async function pushNote(tx: Tx, n: Omit<AppNotification, 'id'>) {
  await tx.insert('notifications', { id: uid('ntf'), ...n })
}

/** Drop the scheduled reminder of an order (it is cancelled). */
export async function dropScheduledNotes(tx: Tx, orderId: string) {
  for (const n of await tx.where<AppNotification>('notifications', 'by_order', { orderId })) if (n.scheduledFor) await tx.remove(n)
}

async function expireOrder(tx: Tx, o: Order) {
  o.status = 'EXPIRED'
  await releaseOrderSeats(tx, o)
  await notifyWaitlist(tx, o)
  if (!o.simulated) {
    await pushNote(tx, {
      userId: o.userId,
      channel: 'WA',
      kind: 'HOLD_EXPIRED',
      title: 'Waktu tahan kursi habis',
      body: `Pesanan ${o.code} kedaluwarsa karena melewati batas waktu. Kursinya sudah dilepas, silakan pesan ulang.`,
      createdAt: tx.now.toISOString(),
      scheduledFor: null,
      orderId: o.id,
    })
  }
}

/**
 * Expiry job (PRD §8 layer 2, §11): pending orders past their hold become EXPIRED, their seats go back and the waiting
 * list hears about it. Runs at the start of every write (only due orders are read, so it rarely contends) and every
 * minute from crons.ts with `seats: true`, which also clears stray seat holds.
 */
export async function sweep(tx: Tx, opts: { seats?: boolean; limit?: number } = {}) {
  const nowIso = tx.now.toISOString()
  const due = await tx.upTo<Order>('orders', 'by_pending', { pending: true }, 'holdExpiresAt', nowIso)
  for (const o of due.slice(0, opts.limit ?? 50)) if (isPending(o) && o.holdExpiresAt <= nowIso) await expireOrder(tx, o)
  if (opts.seats) {
    for (const ss of await tx.upTo<SessionSeat>('sessionSeats', 'by_status', { status: 'HELD' }, 'holdExpiresAt', nowIso)) {
      if (ss.status === 'HELD' && !isHoldActive(ss, tx.now)) Object.assign(ss, { status: 'AVAILABLE', orderId: null, holdExpiresAt: null })
    }
  }
}

/* ------------------------------------------------------------------ availability */

const isGeneralOrder = (o: Order) => o.items.every((i) => i.seatId == null)

export async function generalFilled(tx: Tx, sessionId: string, categoryId: string): Promise<number> {
  return (await ordersOfSessionCategory(tx, sessionId, categoryId))
    .filter((o) => isGeneralOrder(o) && (o.status === 'CONFIRMED' || (isPending(o) && new Date(o.holdExpiresAt) > tx.now)))
    .reduce((s, o) => s + o.qty, 0)
}

async function generalSold(tx: Tx, sessionId: string, categoryId: string): Promise<number> {
  return (await ordersOfSessionCategory(tx, sessionId, categoryId)).filter((o) => o.status === 'CONFIRMED' && isGeneralOrder(o)).reduce((s, o) => s + o.qty, 0)
}

/** AD-12: bonus places still free for a category in a session (null when the category has no bonus). */
export async function bonusPlacesLeft(tx: Tx, sessionId: string, category: TicketCategory): Promise<number | null> {
  if (!category.bonusFirstN || !category.bonusDesc) return null
  const given = (await tx.where<Ticket>('tickets', 'by_session_category', { sessionId, categoryId: category.id })).filter((t) => t.bonus && t.status !== 'CANCELLED').length
  return Math.max(0, category.bonusFirstN - given)
}

/** Places that can be booked right now for one category in one session. */
export async function freePlaces(tx: Tx, sessionId: string, categoryId: string): Promise<number> {
  const category = await categoryOf(tx, categoryId)
  if (category.quota != null) {
    const q = await quotaOf(tx, sessionId, categoryId)
    return Math.max(0, (q?.quota ?? category.quota) - (await generalFilled(tx, sessionId, categoryId)))
  }
  return (await sessionSeatsOf(tx, sessionId)).filter((ss) => ss.categoryId === categoryId && effectiveSeatStatus(ss, tx.now) === 'AVAILABLE').length
}

/** PV-14: places freed up → message the first people in line whose group still fits (no reservation). */
export async function notifyWaitlist(tx: Tx, order: Pick<Order, 'sessionId' | 'categoryId'>) {
  const line = (await tx.where<WaitlistEntry>('waitlist', 'by_line', { sessionId: order.sessionId, categoryId: order.categoryId, status: 'WAITING' })).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  )
  if (!line.length) return
  let free = await freePlaces(tx, order.sessionId, order.categoryId)
  for (const w of line) {
    if (free <= 0) break
    if (w.qty > free) continue
    free -= w.qty
    w.status = 'NOTIFIED'
    w.notifiedAt = tx.now.toISOString()
    const session = await sessionOf(tx, w.sessionId)
    const event = await eventOf(tx, session.eventId)
    const category = await categoryOf(tx, w.categoryId)
    await pushNote(tx, {
      userId: w.userId,
      channel: 'WA',
      kind: 'WAITLIST',
      title: 'Tempat tersedia lagi',
      body: `Ada tempat ${category.name} untuk ${w.qty} orang di ${event.title} (${session.label ?? 'sesi'}, ${fmtShortDate(session.startAt)} ${fmtTime(session.startAt)} WIB). Belum ditahan untukmu, jadi pesan secepatnya.`,
      createdAt: tx.now.toISOString(),
      scheduledFor: null,
    })
  }
}

export async function waitlistItem(tx: Tx, entry: WaitlistEntry): Promise<WaitlistItem> {
  const session = await sessionOf(tx, entry.sessionId)
  const base = { ...entry, session, event: await eventOf(tx, session.eventId), category: await categoryOf(tx, entry.categoryId) }
  if (entry.status !== 'WAITING') return { ...base, position: null }
  const line = (await tx.where<WaitlistEntry>('waitlist', 'by_line', { sessionId: entry.sessionId, categoryId: entry.categoryId, status: 'WAITING' })).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  )
  return { ...base, position: line.findIndex((w) => w.id === entry.id) + 1 }
}

export async function availability(tx: Tx, session: Session, categories: TicketCategory[]): Promise<CategoryAvailability[]> {
  const needSeats = categories.some((c) => c.quota == null)
  const seats = needSeats ? await sessionSeatsOf(tx, session.id) : []
  const out: CategoryAvailability[] = []
  for (const c of categories) {
    const bonusLeft = await bonusPlacesLeft(tx, session.id, c)
    if (c.quota != null) {
      const q = await quotaOf(tx, session.id, c.id)
      const total = q?.quota ?? c.quota
      const filled = await generalFilled(tx, session.id, c.id)
      const sold = await generalSold(tx, session.id, c.id)
      out.push({ categoryId: c.id, total, available: Math.max(0, total - filled), held: filled - sold, sold, bonusLeft })
      continue
    }
    let available = 0
    let held = 0
    let sold = 0
    let total = 0
    for (const ss of seats) {
      if (ss.categoryId !== c.id) continue
      const st = effectiveSeatStatus(ss, tx.now)
      if (st === 'BLOCKED') continue
      total++
      if (st === 'AVAILABLE') available++
      else if (st === 'HELD') held++
      else if (st === 'SOLD') sold++
    }
    out.push({ categoryId: c.id, total, available, held, sold, bonusLeft })
  }
  return out
}

async function sessionSummary(tx: Tx, s: Session, categories: TicketCategory[]): Promise<SessionSummary> {
  const session = resolveSession(s, tx.now)
  const av = await availability(tx, session, categories)
  return { ...session, availability: av, available: av.reduce((a, b) => a + b.available, 0), total: av.reduce((a, b) => a + b.total, 0) }
}

export async function summary(tx: Tx, event: EventItem): Promise<EventSummary> {
  const categories = await categoriesOf(tx, event.id)
  const sessions: SessionSummary[] = []
  for (const s of await sessionsOf(tx, event.id)) sessions.push(await sessionSummary(tx, s, categories))
  sessions.sort((a, b) => Number(!!b.demoLive) - Number(!!a.demoLive) || a.startAt.localeCompare(b.startAt))
  const prices = categories.map((c) => c.price)
  return { event, venue: await venueOf(tx, event.venueId), categories, sessions, minPrice: prices.length ? Math.min(...prices) : null }
}

/** Read-side view of lazy expiry: a pending order past its hold is reported as EXPIRED. */
export function liveOrder(o: Order, now: Date): Order {
  if (isPending(o) && new Date(o.holdExpiresAt) <= now) return { ...o, status: 'EXPIRED' }
  return o
}

export async function orderDetail(tx: Tx, order: Order): Promise<OrderDetail> {
  const event = await eventOf(tx, order.eventId)
  return {
    order,
    event,
    venue: await venueOf(tx, event.venueId),
    session: await sessionOf(tx, order.sessionId),
    category: await categoryOf(tx, order.categoryId),
    receipts: await receiptsOf(tx, order.id),
    tickets: await ticketsOf(tx, order.id),
    tenants: await tenantsAll(tx),
  }
}

export async function seatViews(tx: Tx, sessionId: string, layoutId: string | null) {
  const seats = await seatsOf(tx, layoutId)
  const ssMap = new Map((await sessionSeatsOf(tx, sessionId)).map((x) => [x.seatId, x]))
  return seats.map((seat) => {
    const ss = ssMap.get(seat.id)
    return { seat, status: ss ? effectiveSeatStatus(ss, tx.now) : ('BLOCKED' as const), categoryId: ss?.categoryId ?? null }
  })
}

export async function buyerOf(tx: Tx, userId: string): Promise<{ name: string; phone: string }> {
  const u = await getUser(tx, userId)
  return { name: u?.name ?? 'Tamu', phone: u?.phone ?? '-' }
}

/* ------------------------------------------------------------------ confirm (PRD §8 layer 3–4) */

export async function confirmOrder(tx: Tx, order: Order, method: PaymentMethod) {
  const event = await eventOf(tx, order.eventId)
  const session = await sessionOf(tx, order.sessionId)
  for (const ss of await tx.where<SessionSeat>('sessionSeats', 'by_order', { orderId: order.id })) {
    ss.status = 'SOLD'
    ss.holdExpiresAt = null
  }
  // layer 4 (PRD §8 "unique index"): never two live tickets for one seat in one session
  for (const item of order.items) {
    if (!item.seatId) continue
    const live = (await tx.where<Ticket>('tickets', 'by_session_seat', { sessionId: order.sessionId, seatId: item.seatId })).some((t) => t.status !== 'CANCELLED')
    if (live) fail('SEAT_TAKEN', `Kursi ${item.seatLabel} sudah punya tiket aktif. Pesanan tidak dikonfirmasi.`)
  }
  order.status = 'CONFIRMED'
  order.paymentMethod = method
  order.confirmedAt = tx.now.toISOString()
  const category = await categoryOf(tx, order.categoryId)
  let bonusLeft = await bonusPlacesLeft(tx, order.sessionId, category)
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
      createdAt: tx.now.toISOString(),
      usedAt: null,
      bonus: bonusLeft != null && bonusLeft > 0 ? category.bonusDesc : null,
    }
    if (bonusLeft != null && bonusLeft > 0) bonusLeft--
    await tx.insert('tickets', ticket)
  }
  const seats = order.items
    .map((i) => i.seatLabel)
    .filter(Boolean)
    .join(', ')
  const where = seats ? `kursi ${seats}` : `${order.qty} orang`
  const when = `${fmtShortDate(session.startAt)} ${fmtRange(session.startAt, session.endAt)}`
  const at = tx.now.toISOString()
  await pushNote(tx, {
    userId: order.userId,
    channel: 'WA',
    kind: 'ORDER_CONFIRMED',
    title: 'Pesanan terkonfirmasi',
    body: `Tiket ${event.title} (${when}), ${where}, sudah aktif. Tunjukkan QR di Pass Saya saat masuk.`,
    createdAt: at,
    scheduledFor: null,
    orderId: order.id,
  })
  await pushNote(tx, {
    userId: order.userId,
    channel: 'EMAIL',
    kind: 'ORDER_CONFIRMED',
    title: `E-ticket ${order.code}`,
    body: `E-ticket ${event.title}, ${where}, sudah ada di Pass Saya. Sampai jumpa di SUMMABA!`,
    createdAt: at,
    scheduledFor: null,
    orderId: order.id,
  })
  if (!session.demoLive) {
    const reminderAt = new Date(new Date(session.startAt).getTime() - 24 * 3600_000)
    await pushNote(tx, {
      userId: order.userId,
      channel: 'WA',
      kind: 'REMINDER',
      title: 'Pengingat H-1',
      orderId: order.id,
      body: `Besok ${fmtTime(session.startAt)} WIB: ${event.title} di ${(await venueOf(tx, event.venueId)).name}. Check-in dibuka ${event.rules.checkinOpenMin} menit sebelum mulai.`,
      createdAt: at,
      scheduledFor: reminderAt.toISOString(),
    })
  }
}

export function assertHoldActive(order: Order, now: Date) {
  if (order.status === 'EXPIRED' || new Date(order.holdExpiresAt) <= now) fail('HOLD_EXPIRED', 'Waktu habis, kursi sudah dilepas. Silakan pesan ulang.')
}

/* ------------------------------------------------------------------ hold (PRD §8 layer 1) */

function seatsCentroid(seats: Seat[]): { x: number; y: number } | undefined {
  if (!seats.length) return undefined
  return { x: seats.reduce((s, x) => s + x.x, 0) / seats.length, y: seats.reduce((s, x) => s + x.y, 0) / seats.length }
}

/** Core hold logic: all-or-nothing. Every seat row is read and written inside this one mutation. */
export async function holdTx(tx: Tx, sessionId: string, req: HoldRequest, userId: string, opts: { simulated?: boolean; holdSeconds?: number } = {}): Promise<HoldResult> {
  const now = tx.now
  const session = await sessionOf(tx, sessionId)
  const event = await eventOf(tx, session.eventId)
  const category = await categoryOf(tx, req.categoryId)
  if (category.eventId !== event.id) fail('BAD_REQUEST', 'Kategori bukan milik event ini.')
  if (event.status !== 'PUBLISHED') return { ok: false, reason: 'RULE', message: 'Event belum dipublikasikan.' }

  const sale = saleState(category, session, now)
  if (!sale.open && !opts.simulated) {
    return {
      ok: false,
      reason: 'RULE',
      message:
        sale.reason === 'NOT_YET'
          ? `Penjualan ${category.name} dibuka ${fmtShortDate(sale.at.toISOString())} ${fmtTime(sale.at.toISOString())}.`
          : `Penjualan ${category.name} untuk sesi ini sudah ditutup.`,
    }
  }

  if (!opts.simulated) {
    const active = (await tx.where<Order>('orders', 'by_user_session', { userId, sessionId })).find((o) => isPending(o) && new Date(o.holdExpiresAt) > now)
    if (active) {
      return { ok: false, reason: 'RULE', message: `Kamu masih punya pesanan ${active.code} yang belum selesai di sesi ini. Selesaikan atau batalkan dulu.` }
    }
  }

  const holdMin = category.accessMethod === 'RECEIPT' ? event.rules.receiptHoldMin : event.rules.paymentHoldMin
  const holdMs = opts.holdSeconds != null ? opts.holdSeconds * 1000 : holdMin * 60_000
  const holdExpiresAt = new Date(now.getTime() + holdMs).toISOString()
  const buyer = await buyerOf(tx, userId)
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
    if (!(qty >= 1)) return { ok: false, reason: 'RULE', message: 'Pilih jumlah orang minimal 1.' }
    if (qty > event.rules.maxSeatsPerOrder) return { ok: false, reason: 'RULE', message: `Maksimal ${event.rules.maxSeatsPerOrder} orang per pesanan.` }
    const q = await quotaOf(tx, sessionId, category.id)
    const quota = q?.quota ?? category.quota
    const filled = await generalFilled(tx, sessionId, category.id)
    if (filled + qty > quota) {
      const left = Math.max(0, quota - filled)
      return { ok: false, reason: 'SOLD_OUT', message: left ? `Sisa kuota ${category.name} tinggal ${left}. Kurangi jumlah orang.` : `Kuota ${category.name} untuk sesi ini sudah habis.` }
    }
    const order = baseOrder(
      Array.from({ length: qty }, (_, i) => ({ id: uid('itm'), seatId: null, seatLabel: null, price: category.price, attendeeName: i === 0 && buyer.name !== 'Tamu' ? buyer.name : null })),
      qty,
    )
    await tx.insert('orders', order)
    return { ok: true, order }
  }

  // RESERVED seats
  const seatIds = [...new Set((req.seatIds ?? []).filter((x) => typeof x === 'string'))]
  if (seatIds.length < 1) return { ok: false, reason: 'RULE', message: 'Pilih minimal 1 kursi.' }
  if (seatIds.length > event.rules.maxSeatsPerOrder) return { ok: false, reason: 'RULE', message: `Maksimal ${event.rules.maxSeatsPerOrder} kursi per pesanan.` }
  const rows: SessionSeat[] = []
  for (const id of seatIds) {
    const row = await sessionSeat(tx, sessionId, id)
    if (!row) fail('BAD_REQUEST', 'Kursi tidak dikenal.')
    rows.push(row)
  }
  if (rows.some((r) => r.categoryId !== category.id)) {
    return { ok: false, reason: 'RULE', message: `Semua kursi dalam satu pesanan harus kategori ${category.name}.` }
  }
  const seatList: Seat[] = []
  for (const id of seatIds) seatList.push(must(await tx.get<Seat>('seats', id), 'Kursi'))
  const conflicts = rows.filter((r) => effectiveSeatStatus(r, now) !== 'AVAILABLE').map((r) => r.seatId)
  if (conflicts.length) {
    const views = await seatViews(tx, sessionId, event.layoutId)
    const sug = suggestSeats(views, category.id, seatIds.length, await layoutOf(tx, event.layoutId), seatsCentroid(seatList))
    const labels = conflicts.map((id) => seatLabel(seatList.find((s) => s.id === id)!))
    return { ok: false, reason: 'CONFLICT', conflictSeatIds: conflicts, suggestions: sug.seatIds, message: `Yah, ${labels.join(', ')} baru saja dipilih orang lain.` }
  }
  seatList.sort((a, b) => a.y - b.y || a.x - b.x)
  const order = baseOrder(
    seatList.map((s, i) => ({ id: uid('itm'), seatId: s.id, seatLabel: seatLabel(s), price: category.price, attendeeName: i === 0 && buyer.name !== 'Tamu' ? buyer.name : null })),
    seatList.length,
  )
  for (const r of rows) {
    r.status = 'HELD'
    r.orderId = order.id
    r.holdExpiresAt = holdExpiresAt
  }
  await tx.insert('orders', order)
  return { ok: true, order }
}

/* ------------------------------------------------------------------ event wizard */

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

/** JSON with object keys sorted, for comparing values whatever order their keys arrived in. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v))
}

/** Derive the admin wizard draft from a stored event. */
export async function draftOf(tx: Tx, event: EventItem): Promise<EventDraft> {
  const categories = await categoriesOf(tx, event.id)
  const layout = await layoutOf(tx, event.layoutId)
  let layoutDraft: EventDraft['layout']
  if (layout) {
    const seats = (await seatsOf(tx, layout.id)).sort((a, b) => a.y - b.y || a.x - b.x)
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
    venueId: event.venueId,
    seatingMode: event.seatingMode,
    rules: { ...event.rules },
    categories: categories.map((c) => {
      const { eventId: _e, ...rest } = c
      void _e
      return rest
    }),
    layout: layoutDraft,
    sessions: (await sessionsOf(tx, event.id)).map((s) => ({ id: s.id, label: s.label, startAt: s.startAt, endAt: s.endAt, demoLive: s.demoLive })),
  }
}

export async function applyLayout(tx: Tx, event: EventItem, draft: EventDraft, categoryIds: string[]) {
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
  }
  const seats = buildSeats(layout, spec.prioritySeatLabels)
  await tx.insert('layouts', layout)
  for (const s of seats) await tx.insert('seats', s)
  event.layoutId = layout.id
  event.seatAssignments = {}
  for (const s of seats) {
    const r = rowIndex(s.row)
    const range = spec.rowCategories.find((x) => r >= rowIndex(x.fromRow) && r <= rowIndex(x.toRow))
    const categoryId = range ? (categoryIds[range.categoryIndex] ?? null) : null
    event.seatAssignments[s.id] = { categoryId, blocked: spec.blockedSeatLabels.includes(seatLabel(s)) }
  }
}

export async function addInventory(tx: Tx, event: EventItem, session: Session) {
  for (const s of await seatsOf(tx, event.layoutId)) {
    const a = event.seatAssignments[s.id]
    await tx.insert('sessionSeats', {
      sessionId: session.id,
      seatId: s.id,
      categoryId: a?.categoryId ?? null,
      status: a?.blocked || !a?.categoryId ? 'BLOCKED' : 'AVAILABLE',
      orderId: null,
      holdExpiresAt: null,
    } satisfies SessionSeat)
  }
  for (const c of (await categoriesOf(tx, event.id)).filter((x) => x.quota != null)) {
    await tx.insert('quotas', { sessionId: session.id, categoryId: c.id, quota: c.quota!, filled: 0 } satisfies SessionQuota)
  }
}

export function eventDates(draft: EventDraft, now: Date): { startAt: string; endAt: string } {
  const real = draft.sessions.filter((s) => !s.demoLive)
  const list = real.length ? real : draft.sessions
  if (!list.length) {
    const t = now.toISOString()
    return { startAt: t, endAt: t }
  }
  return { startAt: list.map((s) => s.startAt).sort()[0], endAt: list.map((s) => s.endAt).sort().slice(-1)[0] }
}

/** The draft's own poster colours, tidied; undefined when the theme's colours apply (same as the mock). */
export function posterPaletteOf(d: EventDraft): PosterPalette | undefined {
  if (!d.posterPalette) return undefined
  const c = posterPaletteCheck(d.posterPalette)
  if (!c.ok) fail('INVALID', c.reason, { field: 'posterPalette' })
  return c.palette
}

export function validateDraft(d: EventDraft) {
  if (!d || typeof d.title !== 'string' || !Array.isArray(d.categories) || !Array.isArray(d.sessions) || !d.rules) fail('BAD_REQUEST', 'Data event tidak lengkap.')
  if (!d.title.trim()) fail('INVALID', 'Judul event wajib diisi.')
  posterPaletteOf(d)
  if (!d.venueId) fail('INVALID', 'Pilih venue.')
  if (!d.categories.length) fail('INVALID', 'Tambahkan minimal 1 kategori tiket.')
  for (const c of d.categories) {
    if (!c.name.trim()) fail('INVALID', 'Setiap kategori butuh nama.')
    if (c.accessMethod === 'PAID' && c.price <= 0) fail('INVALID', `Harga kategori ${c.name} harus lebih dari 0.`)
    if (c.accessMethod === 'RECEIPT' && !c.receiptRules) fail('INVALID', `Kategori ${c.name} butuh aturan struk.`)
  }
  if (d.seatingMode === 'RESERVED' && !d.layout) fail('INVALID', 'Buat denah kursi dulu.')
  if (d.layout && (d.layout.rows < 1 || d.layout.seatsPerRow < 1 || d.layout.rows * d.layout.seatsPerRow > 2000)) fail('INVALID', 'Denah paling banyak 2.000 kursi.')
  for (const s of d.sessions) {
    if (new Date(s.endAt) <= new Date(s.startAt)) fail('INVALID', 'Jam selesai sesi harus setelah jam mulai.')
  }
}

/* ------------------------------------------------------------------ staff */

export async function checkinResponseFrom(
  tx: Tx,
  result: CheckinResponse['result'],
  message: string,
  ticket: Ticket | null,
  firstScan: CheckinResponse['firstScan'] = null,
): Promise<CheckinResponse> {
  const raw = ticket ? await tx.get<Session>('sessions', ticket.sessionId) : null
  return {
    result,
    message,
    ticket: ticket ? staffTicket(ticket) : null,
    order: ticket ? await tx.get<Order>('orders', ticket.orderId) : null,
    event: ticket ? await tx.get<EventItem>('events', ticket.eventId) : null,
    session: raw ? resolveSession(raw, tx.now) : null,
    category: ticket ? await tx.get<TicketCategory>('categories', ticket.categoryId) : null,
    firstScan,
  }
}

export async function recordCheckin(tx: Tx, c: Omit<Checkin, 'id'>) {
  await tx.insert('checkins', { id: uid('chk'), ...c })
}

export type { Payment }

/**
 * A ticket as a petugas sees it: everything but its QR token, which only its owner's Pass Saya shows. A petugas checks a
 * ticket in by its id instead. The demo keeps the token, for the scan screen's sample tickets.
 */
export function staffTicket(ticket: Ticket): Ticket {
  return demoEnabled() ? ticket : { ...ticket, qrToken: '' }
}
