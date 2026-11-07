/** Auth, public and visitor endpoints (docs/API-CONTRACT.md "Auth", "Publik & pengunjung"). */
import type { EventDetail, HoldResult, PassItem, ReceiptInput, SeatMapData } from '../shared/contract'
import { ORDER_STATUS_LABEL } from '../shared/labels'
import { fmtTime, isValidPhone, normalizePhone, rupiahPlain } from '../shared/format'
import { attendeeEditPolicy, checkReceiptRules, effectiveSeatStatus, profileChanges, randomCode, receiptChecksPass, suggestSeats, uid, visitorCancelPolicy } from '../shared/rules'
import type { AppNotification, EventItem, Order, Payment, Receipt, Role, SessionSeat, Ticket, TicketCategory, User, WaitlistEntry } from '../shared/types'
import { ANONYMOUS, guestOf, issueToken, ownerId, visitorId, visitorUser, type Req } from '../lib/auth'
import {
  assertHoldActive,
  bonusPlacesLeft,
  categoriesOf,
  categoryOf,
  confirmOrder,
  dropScheduledNotes,
  eventOf,
  freePlaces,
  generalFilled,
  getUser,
  holdTx,
  isPending,
  layoutOf,
  liveOrder,
  notifyWaitlist,
  orderDetail,
  orderOf,
  pushNote,
  quotaOf,
  receiptsOf,
  releaseOrderSeats,
  releaseSoldSeats,
  seatsOf,
  seatViews,
  sessionOf,
  sessionSeatsOf,
  summary,
  sweep,
  tenantsAll,
  ticketsOf,
  venueOf,
  waitlistItem,
} from '../lib/core'
import { demoEnabled } from '../lib/demo'
import { sameString } from '../lib/crypto'
import { fail, must, Refusal } from '../lib/errors'
import type { Tx } from '../lib/tx'

export const DEMO_ADMIN_ID = 'u_admin'
export const DEMO_STAFF_ID = 'u_staff'
export const PERSONA_ID = 'u_rina'
/** Wrong guesses a code survives; six digits and five guesses leave a 1 in 200 000 chance per code. */
const OTP_MAX_ATTEMPTS = 5

const str = (v: unknown, what: string): string => {
  if (typeof v !== 'string') fail('BAD_REQUEST', `${what} wajib diisi.`)
  return v
}

/** Move what a guest did before logging in (holds, receipts, tickets, messages) to the account. */
async function claimGuest(tx: Tx, guest: string, user: User) {
  if (guest === user.id || guest === ANONYMOUS || !guest.startsWith('guest_')) return
  for (const o of await tx.where<Order>('orders', 'by_user', { userId: guest })) {
    o.userId = user.id
    o.buyerName = user.name
    o.buyerPhone = user.phone
    const first = o.items[0]
    if (first && !first.attendeeName) first.attendeeName = user.name
  }
  for (const r of await tx.where<Receipt>('receipts', 'by_user', { userId: guest })) r.userId = user.id
  for (const t of await tx.where<Ticket>('tickets', 'by_user', { userId: guest })) t.userId = user.id
  for (const n of await tx.where<AppNotification>('notifications', 'by_user', { userId: guest })) n.userId = user.id
  for (const w of await tx.where<WaitlistEntry>('waitlist', 'by_user', { userId: guest })) w.userId = user.id
}

async function ownOrder(tx: Tx, req: Req, orderId: string): Promise<Order> {
  const order = await orderOf(tx, orderId)
  if (order.userId !== (await ownerId(tx, req.auth))) fail('NOT_FOUND', 'Pesanan tidak ditemukan.')
  return order
}

/* ================================================================== auth */

export async function requestOtp(tx: Tx, req: Req) {
  const phone = normalizePhone(str(req.body?.phone, 'Nomor HP'))
  if (!isValidPhone(phone)) fail('BAD_PHONE', 'Nomor HP belum benar. Contoh: 0812 3456 7890.')
  const now = tx.now
  let entry = (await tx.where<{ phone: string; code: string; expiresAt: string; requests: string[]; attempts?: number }>('otps', 'by_phone', { phone }))[0]
  if (!entry) entry = await tx.insert('otps', { phone, code: '', expiresAt: '', requests: [] as string[] })
  const recent = entry.requests.filter((t) => now.getTime() - new Date(t).getTime() < 60_000)
  if (recent.length >= 3) {
    const wait = Math.ceil((60_000 - (now.getTime() - new Date(recent[0]).getTime())) / 1000)
    fail('RATE_LIMIT', `Terlalu sering minta kode. Coba lagi dalam ${wait} detik.`)
  }
  const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000))
  entry.code = code
  entry.attempts = 0
  entry.expiresAt = new Date(now.getTime() + 5 * 60_000).toISOString()
  entry.requests = [...recent, now.toISOString()]
  // the demo shows the code on screen; a real deployment sends it by SMS or WhatsApp and never hands it back here
  return demoEnabled() ? { simulatedCode: code, expiresAt: entry.expiresAt } : { expiresAt: entry.expiresAt }
}

export async function verifyOtp(tx: Tx, req: Req) {
  const phone = normalizePhone(str(req.body?.phone, 'Nomor HP'))
  const code = str(req.body?.code, 'Kode OTP')
  const name: unknown = req.body?.name
  const entry = (await tx.where<{ phone: string; code: string; expiresAt: string; attempts?: number }>('otps', 'by_phone', { phone }))[0]
  if (!entry || !entry.code) fail('BAD_OTP', 'Kode OTP salah. Minta kode baru.')
  if (new Date(entry.expiresAt) < tx.now) fail('OTP_EXPIRED', 'Kode OTP sudah kedaluwarsa. Minta kode baru.')
  if (!sameString(entry.code, code.trim())) {
    // a wrong guess is counted (a Refusal keeps the count); after OTP_MAX_ATTEMPTS the code is gone and a new one is needed
    entry.attempts = (entry.attempts ?? 0) + 1
    if (entry.attempts >= OTP_MAX_ATTEMPTS) {
      entry.code = ''
      return new Refusal('BAD_OTP', 'Kode OTP salah terlalu sering. Minta kode baru.')
    }
    return new Refusal('BAD_OTP', 'Kode OTP salah. Cek lagi kodenya.')
  }
  let user = (await tx.where<User>('users', 'by_phone', { phone, role: 'VISITOR' }))[0]
  let isNew = false
  if (!user) {
    // step two of the login: the client asks for a name and sends the same code again (a normal answer, not an error)
    if (typeof name !== 'string' || !name.trim()) return { needName: true, message: 'Isi nama kamu dulu.' }
    const checked = profileChanges({ name })
    if (!checked.ok) fail('INVALID', checked.reason, { field: checked.field })
    user = await tx.insert('users', { id: uid('usr'), role: 'VISITOR', name: checked.name!, phone, email: null, createdAt: tx.now.toISOString() } satisfies User)
    isNew = true
  }
  await claimGuest(tx, guestOf(req.auth), user)
  entry.code = ''
  return { user, isNew, token: await issueToken(tx, user) }
}

export async function demoLogin(tx: Tx, req: Req) {
  if (!demoEnabled()) fail('FORBIDDEN', 'Fitur demo dimatikan di server ini.')
  const role = req.body?.role as Role
  if (role !== 'ADMIN' && role !== 'STAFF' && role !== 'VISITOR') fail('BAD_REQUEST', 'Role tidak dikenal.')
  let id = role === 'ADMIN' ? DEMO_ADMIN_ID : role === 'STAFF' ? DEMO_STAFF_ID : PERSONA_ID
  const userId: unknown = req.body?.user_id
  // only the staff switcher picks an account; a visitor demo sign-in is always the persona, never someone's account
  if (role === 'STAFF' && typeof userId === 'string' && userId) {
    const u = await getUser(tx, userId)
    if (!u || u.role !== role) fail('NOT_FOUND', 'Akun tidak ditemukan.')
    if (u.active === false) fail('FORBIDDEN', 'Akun petugas ini dinonaktifkan panitia.')
    id = u.id
  }
  const user = must(await getUser(tx, id), 'Pengguna')
  if (user.active === false) fail('FORBIDDEN', 'Akun petugas ini dinonaktifkan panitia.')
  if (role === 'VISITOR') await claimGuest(tx, guestOf(req.auth), user)
  return { user, token: await issueToken(tx, user) }
}

/* ================================================================== public */

export async function listEvents(tx: Tx) {
  const events = (await tx.all<EventItem>('events')).filter((e) => e.status === 'PUBLISHED')
  const out = []
  for (const e of events) out.push(await summary(tx, e))
  return out.sort((a, b) => a.event.startAt.localeCompare(b.event.startAt))
}

export async function getEvent(tx: Tx, req: Req): Promise<EventDetail> {
  const event = must((await tx.where<EventItem>('events', 'by_slug', { slug: req.params.slug }))[0], 'Event')
  return { ...(await summary(tx, event)), tenants: await tenantsAll(tx) }
}

export async function getSeatMap(tx: Tx, req: Req): Promise<SeatMapData> {
  const sessionId = req.params.id
  const now = tx.now
  const session = await sessionOf(tx, sessionId)
  const event = await eventOf(tx, session.eventId)
  const me = await visitorId(tx, req.auth)
  const myOrderIds = new Set((await tx.where<Order>('orders', 'by_user_session', { userId: me, sessionId })).map((o) => o.id))
  const categories = await categoriesOf(tx, event.id)
  const rows = await sessionSeatsOf(tx, sessionId)
  const waiting = await tx.where<WaitlistEntry>('waitlist', 'by_line', { sessionId })
  const quotas = []
  for (const c of categories.filter((x) => x.quota != null)) {
    const q = await quotaOf(tx, sessionId, c.id)
    quotas.push({ sessionId, categoryId: c.id, quota: q?.quota ?? c.quota!, filled: await generalFilled(tx, sessionId, c.id) })
  }
  const bonus = []
  for (const c of categories.filter((x) => x.bonusFirstN && x.bonusDesc)) bonus.push({ categoryId: c.id, left: (await bonusPlacesLeft(tx, sessionId, c)) ?? 0 })
  return {
    session,
    event,
    layout: await layoutOf(tx, event.layoutId),
    seats: await seatsOf(tx, event.layoutId),
    sessionSeats: rows.map((x) => {
      const status = effectiveSeatStatus(x, now)
      return {
        sessionId: x.sessionId,
        seatId: x.seatId,
        categoryId: x.categoryId,
        status,
        holdExpiresAt: status === 'HELD' ? x.holdExpiresAt : null,
        // privacy: only expose the order id of your own holds
        orderId: x.orderId && myOrderIds.has(x.orderId) && status !== 'AVAILABLE' ? x.orderId : null,
      }
    }),
    categories,
    quotas,
    waitlist: categories
      .map((c) => ({ categoryId: c.id, waiting: waiting.filter((w) => w.status === 'WAITING' && w.categoryId === c.id).length }))
      .filter((x) => x.waiting > 0),
    bonus,
    version: rows.reduce((m, r) => Math.max(m, (r as SessionSeat & { updatedAt?: number }).updatedAt ?? 0), 0),
    serverTime: now.toISOString(),
  }
}

export async function suggest(tx: Tx, req: Req) {
  const session = await sessionOf(tx, req.params.id)
  const event = await eventOf(tx, session.eventId)
  const qty = Math.floor(Number(req.query.qty))
  return suggestSeats(await seatViews(tx, session.id, event.layoutId), req.query.category_id ?? '', qty, await layoutOf(tx, event.layoutId)).seatIds
}

/* ================================================================== orders */

export async function createHold(tx: Tx, req: Req): Promise<HoldResult> {
  await sweep(tx)
  const b = req.body ?? {}
  return holdTx(tx, req.params.id, { categoryId: str(b.categoryId, 'Kategori'), seatIds: Array.isArray(b.seatIds) ? b.seatIds : undefined, qty: b.qty }, await ownerId(tx, req.auth))
}

export async function autoHold(tx: Tx, req: Req): Promise<HoldResult> {
  await sweep(tx)
  const me = await ownerId(tx, req.auth)
  const sessionId = req.params.id
  const categoryId = str(req.body?.category_id, 'Kategori')
  const qty = Math.floor(Number(req.body?.qty))
  const session = await sessionOf(tx, sessionId)
  const event = await eventOf(tx, session.eventId)
  const category = await categoryOf(tx, categoryId)
  if (category.quota != null) return holdTx(tx, sessionId, { categoryId, qty }, me)
  const sug = suggestSeats(await seatViews(tx, sessionId, event.layoutId), categoryId, qty, await layoutOf(tx, event.layoutId))
  if (!(qty >= 1) || sug.seatIds.length < qty) return { ok: false, reason: 'SOLD_OUT', message: `Kursi ${category.name} yang tersisa tidak cukup untuk ${qty} orang.` }
  return holdTx(tx, sessionId, { categoryId, seatIds: sug.seatIds }, me)
}

export async function updateAttendees(tx: Tx, req: Req) {
  await sweep(tx)
  const order = await ownOrder(tx, req, req.params.id)
  const names: Array<{ itemId: string; name: string }> = Array.isArray(req.body?.attendees) ? req.body.attendees : fail('BAD_REQUEST', 'Daftar nama peserta wajib diisi.')
  const policy = attendeeEditPolicy(order, await sessionOf(tx, order.sessionId), tx.now)
  if (!policy.allowed) fail('BAD_STATE', policy.reason)
  const tickets = await ticketsOf(tx, order.id)
  for (const n of names) {
    const item = order.items.find((i) => i.id === n?.itemId)
    if (!item) continue
    const t = tickets.find((x) => x.orderItemId === item.id)
    const next = typeof n.name === 'string' ? n.name.trim().slice(0, 80) || null : null
    if (t?.status === 'USED' && next !== t.attendeeName) {
      fail('BAD_STATE', `Tiket ${item.seatLabel ? `kursi ${item.seatLabel}` : t.code} sudah dipakai check-in, namanya tidak bisa diubah.`)
    }
    item.attendeeName = next
    if (t) t.attendeeName = next
  }
  return order
}

export async function cancelOrder(tx: Tx, req: Req) {
  await sweep(tx)
  const order = await ownOrder(tx, req, req.params.id)
  const tickets = await ticketsOf(tx, order.id)
  const policy = visitorCancelPolicy(liveOrder(order, tx.now), await sessionOf(tx, order.sessionId), tickets, tx.now)
  if (!policy.allowed) fail('BAD_STATE', policy.reason)
  const wasConfirmed = order.status === 'CONFIRMED'
  order.status = 'CANCELLED'
  order.cancelledAt = tx.now.toISOString()
  order.cancelledBy = 'VISITOR'
  order.refundAmount = policy.refund || null
  await releaseOrderSeats(tx, order)
  if (wasConfirmed) {
    await releaseSoldSeats(tx, order)
    for (const t of tickets) if (t.status === 'ACTIVE') t.status = 'CANCELLED'
    await dropScheduledNotes(tx, order.id)
    await pushNote(tx, {
      userId: order.userId,
      channel: 'WA',
      kind: 'ORDER_CANCELLED',
      title: 'Pesanan dibatalkan',
      body: policy.refund
        ? `Pesanan ${order.code} dibatalkan. Refund ${rupiahPlain(policy.refund)} diproses ke metode bayar asal (simulasi), biasanya 3–5 hari kerja.`
        : `Pesanan ${order.code} dibatalkan dan kursinya sudah dilepas.`,
      createdAt: tx.now.toISOString(),
      scheduledFor: null,
      orderId: order.id,
    })
    await notifyWaitlist(tx, order)
  }
  return order
}

export async function simulatePayment(tx: Tx, req: Req) {
  // the client says how the payment went, so this exists only in the demo; a real one is confirmed by the gateway
  if (!demoEnabled()) fail('FORBIDDEN', 'Pembayaran simulasi hanya ada di versi demo.')
  await sweep(tx)
  const order = await ownOrder(tx, req, req.params.id)
  const b = req.body ?? {}
  const idempotencyKey = str(b.idempotencyKey, 'idempotencyKey')
  if (b.method !== 'SIM_QRIS' && b.method !== 'SIM_VA') fail('BAD_REQUEST', 'Metode bayar tidak dikenal.')
  if (b.outcome !== 'SUCCESS' && b.outcome !== 'FAIL') fail('BAD_REQUEST', 'Hasil simulasi tidak dikenal.')
  const existing = (await tx.where<Payment>('payments', 'by_idempotency', { idempotencyKey }))[0]
  if (existing) {
    if (existing.orderId !== order.id) fail('DUPLICATE_PAYMENT', 'Kunci pembayaran ini sudah dipakai pesanan lain.')
    return {
      order,
      paymentStatus: existing.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
      message: existing.status === 'SUCCESS' ? 'Pembayaran sudah tercatat.' : 'Pembayaran gagal (simulasi).',
    }
  }
  if (order.status === 'CONFIRMED') return { order, paymentStatus: 'SUCCESS', message: 'Pesanan sudah terkonfirmasi.' }
  if (order.status === 'EXPIRED') assertHoldActive(order, tx.now)
  if (order.status !== 'AWAITING_PAYMENT') fail('BAD_STATE', `Pesanan ${ORDER_STATUS_LABEL[order.status].toLowerCase()}.`)
  assertHoldActive(order, tx.now)
  await tx.insert('payments', {
    id: uid('pay'),
    orderId: order.id,
    method: b.method,
    amount: order.totalAmount,
    status: b.outcome === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
    idempotencyKey,
    simRef: randomCode('SIM', 8),
    paidAt: b.outcome === 'SUCCESS' ? tx.now.toISOString() : null,
    createdAt: tx.now.toISOString(),
  } satisfies Payment)
  if (b.outcome === 'FAIL') return { order, paymentStatus: 'FAILED', message: 'Pembayaran gagal (simulasi). Coba lagi sebelum waktu habis.' }
  // conditional confirm (layer 3): seats must still be held by this order
  const held = (await tx.where<SessionSeat>('sessionSeats', 'by_order', { orderId: order.id })).filter((s) => s.status === 'HELD').length
  const needSeats = order.items.filter((i) => i.seatId).length
  if (held < needSeats) fail('HOLD_EXPIRED', 'Waktu habis, kursi sudah dilepas. Pembayaran dibatalkan.')
  await confirmOrder(tx, order, b.method)
  return { order, paymentStatus: 'SUCCESS', message: 'Pembayaran berhasil.' }
}

export async function confirmFree(tx: Tx, req: Req) {
  await sweep(tx)
  const order = await ownOrder(tx, req, req.params.id)
  if (order.status === 'CONFIRMED') return order
  if (order.status === 'EXPIRED') assertHoldActive(order, tx.now)
  if (order.paymentMethod !== 'FREE' || order.status !== 'AWAITING_PAYMENT') fail('BAD_STATE', 'Pesanan ini bukan kategori gratis.')
  assertHoldActive(order, tx.now)
  await confirmOrder(tx, order, 'FREE')
  return order
}

/** Receipts that matter for R6 uniqueness: the same tenant + number + date, or the same photo. */
async function relatedReceipts(tx: Tx, inputs: Array<Omit<ReceiptInput, 'photoUrl'>>): Promise<Receipt[]> {
  const seen = new Map<string, Receipt>()
  for (const r of inputs) {
    const byNo = await tx.where<Receipt>('receipts', 'by_number', { tenantId: r.tenantId, receiptNo: String(r.receiptNo ?? '').trim().toUpperCase(), receiptDate: r.receiptDate })
    const byHash = r.photoHash ? await tx.where<Receipt>('receipts', 'by_hash', { photoHash: r.photoHash }) : []
    for (const x of [...byNo, ...byHash]) seen.set(x.id, x)
  }
  return [...seen.values()]
}

function receiptInputs(v: unknown, withPhoto: boolean): ReceiptInput[] {
  if (!Array.isArray(v) || v.length > 10) fail('BAD_REQUEST', 'Daftar struk tidak valid.')
  return v.map((r) => ({
    tenantId: String(r?.tenantId ?? ''),
    receiptNo: String(r?.receiptNo ?? ''),
    amount: Number(r?.amount),
    receiptDate: String(r?.receiptDate ?? ''),
    receiptTime: String(r?.receiptTime ?? ''),
    photoUrl: withPhoto ? String(r?.photoUrl ?? '') : '',
    photoHash: String(r?.photoHash ?? ''),
  }))
}

export async function checkReceipts(tx: Tx, req: Req) {
  const order = await ownOrder(tx, req, req.params.id)
  const category = await categoryOf(tx, order.categoryId)
  if (!category.receiptRules) fail('BAD_STATE', 'Kategori ini tidak memakai struk.')
  const inputs = receiptInputs(req.body?.receipts, false)
  return checkReceiptRules(inputs, { rules: category.receiptRules, tenants: await tenantsAll(tx), existing: await relatedReceipts(tx, inputs), orderId: order.id, now: tx.now })
}

/**
 * POST /orders/:id/receipts. http.ts has already moved each uploaded photo to file storage: `photoStorageId` is set and
 * `photoUrl` is empty; the signed link is filled in here once the receipt id exists.
 */
export async function submitReceipts(tx: Tx, req: Req, photo: { storageIds: Array<string | null>; link: (receiptId: string) => Promise<string> }) {
  await sweep(tx)
  const order = await ownOrder(tx, req, req.params.id)
  const category = await categoryOf(tx, order.categoryId)
  if (!category.receiptRules) fail('BAD_STATE', 'Kategori ini tidak memakai struk.')
  if (order.status === 'EXPIRED') assertHoldActive(order, tx.now)
  if (order.status !== 'AWAITING_VERIFICATION') fail('BAD_STATE', `Pesanan ${ORDER_STATUS_LABEL[order.status].toLowerCase()}.`)
  assertHoldActive(order, tx.now)
  const current = await receiptsOf(tx, order.id)
  if (current.some((r) => r.status === 'PENDING')) fail('BAD_STATE', 'Struk sudah dikirim dan sedang diverifikasi panitia.')
  const inputs = receiptInputs(req.body?.receipts, true)
  const existing = await relatedReceipts(tx, inputs)
  const { checks, total } = checkReceiptRules(inputs, { rules: category.receiptRules, tenants: await tenantsAll(tx), existing, orderId: order.id, now: tx.now })
  if (!receiptChecksPass(checks)) return { ok: false, checks, total, order, receipts: current, unusedPhotos: photo.storageIds }
  // replace an earlier set that needed revision
  const dropped: Array<string | null> = []
  for (const r of current) {
    if (r.status !== 'NEEDS_REVISION') continue
    dropped.push((r as Receipt & { photoStorageId?: string | null }).photoStorageId ?? null)
    await tx.remove(r)
  }
  const hashes = new Set(existing.filter((r) => r.orderId !== order.id).map((r) => r.photoHash))
  const added: Receipt[] = []
  for (const [i, r] of inputs.entries()) {
    const id = uid('rcp')
    const storageId = photo.storageIds[i] ?? null
    const receipt: Receipt & { photoStorageId: string | null } = {
      id,
      userId: order.userId,
      orderId: order.id,
      tenantId: r.tenantId,
      receiptNo: r.receiptNo.trim().toUpperCase(),
      amount: r.amount,
      receiptDate: r.receiptDate,
      receiptTime: r.receiptTime,
      photoUrl: storageId ? await photo.link(id) : r.photoUrl,
      photoHash: r.photoHash,
      photoStorageId: storageId,
      status: 'PENDING',
      reason: null,
      reviewedBy: null,
      reviewedAt: null,
      possibleDuplicate: hashes.has(r.photoHash),
      createdAt: tx.now.toISOString(),
    }
    added.push(await tx.insert('receipts', receipt))
  }
  await pushNote(tx, {
    userId: order.userId,
    channel: 'WA',
    kind: 'RECEIPT_RESULT',
    title: 'Struk sedang diverifikasi',
    body: `Struk untuk pesanan ${order.code} sudah diterima dan sedang dicek panitia. Kursi tetap ditahan sampai ${fmtTime(order.holdExpiresAt)} WIB.`,
    createdAt: tx.now.toISOString(),
    scheduledFor: null,
    orderId: order.id,
  })
  return { ok: true, checks, total, order, receipts: added, unusedPhotos: dropped }
}

export async function getOrder(tx: Tx, req: Req) {
  const order = await ownOrder(tx, req, req.params.id)
  return orderDetail(tx, liveOrder(order, tx.now))
}

export async function myOrders(tx: Tx, req: Req) {
  const me = await visitorId(tx, req.auth)
  const orders = (await tx.where<Order>('orders', 'by_user', { userId: me })).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const out = []
  for (const o of orders) out.push(await orderDetail(tx, liveOrder(o, tx.now)))
  return out
}

export async function myTickets(tx: Tx, req: Req): Promise<PassItem[]> {
  const me = await visitorId(tx, req.auth)
  const out: PassItem[] = []
  for (const ticket of await tx.where<Ticket>('tickets', 'by_user', { userId: me })) {
    const order = await orderOf(tx, ticket.orderId)
    const event = await eventOf(tx, ticket.eventId)
    out.push({
      ticket,
      order,
      event,
      venue: await venueOf(tx, event.venueId),
      session: await sessionOf(tx, ticket.sessionId),
      category: await categoryOf(tx, ticket.categoryId),
    })
  }
  return out.sort((a, b) => Number(b.ticket.status === 'ACTIVE') - Number(a.ticket.status === 'ACTIVE') || a.session.startAt.localeCompare(b.session.startAt))
}

export async function myNotifications(tx: Tx, req: Req) {
  const me = await visitorId(tx, req.auth)
  return (await tx.where<AppNotification>('notifications', 'by_user', { userId: me })).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function joinWaitlist(tx: Tx, req: Req) {
  const user = await visitorUser(tx, req.auth)
  if (!user) fail('NEED_LOGIN', 'Masuk dulu supaya kami bisa mengabari lewat WhatsApp.')
  const sessionId = req.params.id
  const categoryId = str(req.body?.category_id, 'Kategori')
  const session = await sessionOf(tx, sessionId)
  const event = await eventOf(tx, session.eventId)
  const category: TicketCategory = await categoryOf(tx, categoryId)
  if (category.eventId !== event.id) fail('BAD_REQUEST', 'Kategori bukan milik event ini.')
  const n = Math.floor(Number(req.body?.qty))
  if (!(n >= 1) || n > event.rules.maxSeatsPerOrder) fail('RULE', `Pilih 1 sampai ${event.rules.maxSeatsPerOrder} orang.`)
  if ((await freePlaces(tx, sessionId, categoryId)) >= n) fail('RULE', `Masih ada tempat ${category.name} untuk ${n} orang. Pesan langsung saja.`)
  let entry = (await tx.where<WaitlistEntry>('waitlist', 'by_line', { sessionId, categoryId, status: 'WAITING' })).find((w) => w.userId === user.id)
  if (entry) entry.qty = n
  else {
    entry = await tx.insert('waitlist', { id: uid('wl'), userId: user.id, sessionId, categoryId, qty: n, status: 'WAITING', createdAt: tx.now.toISOString(), notifiedAt: null } satisfies WaitlistEntry)
  }
  return waitlistItem(tx, entry)
}

export async function leaveWaitlist(tx: Tx, req: Req) {
  const me = await ownerId(tx, req.auth)
  const entry = await tx.get<WaitlistEntry>('waitlist', req.params.id)
  if (!entry || entry.userId !== me) fail('NOT_FOUND', 'Daftar tunggu tidak ditemukan.')
  entry.status = 'LEFT'
  return null
}

export async function myWaitlist(tx: Tx, req: Req) {
  const me = await visitorId(tx, req.auth)
  const list = (await tx.where<WaitlistEntry>('waitlist', 'by_user', { userId: me })).filter((w) => w.status !== 'LEFT').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const out = []
  for (const w of list) out.push(await waitlistItem(tx, w))
  return out
}

/** Check PATCH /me before any photo is stored (the action calls this first, then `updateProfile`). */
export async function checkProfile(tx: Tx, req: Req) {
  const user = await visitorUser(tx, req.auth)
  if (!user) fail('NEED_LOGIN', 'Masuk dulu untuk mengubah profil.')
  const body = req.body ?? {}
  const checked = profileChanges({ name: body.name, email: body.email, avatar: body.avatar })
  if (!checked.ok) fail('INVALID', checked.reason, { field: checked.field })
  // only other visitors count: a panitia or petugas address must not be discoverable from the visitor profile
  if (checked.email && (await tx.where<User>('users', 'by_email', { email: checked.email })).some((u) => u.id !== user.id && u.role === 'VISITOR')) {
    fail('DUPLICATE', 'Email ini sudah dipakai akun lain.', { field: 'email' })
  }
  return { ok: true }
}

/** PATCH /me (PV-06). `avatar` arrives already stored: a storage id and its URL, or null to remove the photo. */
export async function updateProfile(tx: Tx, req: Req, avatar: { storageId: string; url: string } | null | undefined) {
  await checkProfile(tx, { ...req, body: { ...req.body, avatar: undefined } })
  const user = must(await visitorUser(tx, req.auth), 'Pengguna') as User & { avatarStorageId?: string | null }
  const checked = profileChanges({ name: req.body?.name, email: req.body?.email })
  if (!checked.ok) fail('INVALID', checked.reason, { field: checked.field })
  if (checked.name !== undefined) user.name = checked.name
  if (checked.email !== undefined) user.email = checked.email
  let oldPhoto: string | null = null
  if (avatar !== undefined) {
    oldPhoto = user.avatarStorageId ?? null
    user.avatarStorageId = avatar?.storageId ?? null
    user.avatarUrl = avatar?.url ?? null
  }
  return { user: { ...user }, oldPhoto }
}
