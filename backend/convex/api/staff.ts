/** Petugas endpoints (`/staff/*`, STAFF token) and the demo endpoints (`/demo/*`). */
import type { CheckinResponse, OfflineManifest, TicketSearchRow } from '../shared/contract'
import { ORDER_STATUS_LABEL } from '../shared/labels'
import { fmtShortDate, fmtTime, normalizePhone } from '../shared/format'
import { checkinWindow, resolveSession, suggestSeats } from '../shared/rules'
import type { Checkin, Order, SessionSeat, Ticket, User } from '../shared/types'
import { ownerId, requireRole, type Req } from '../lib/auth'
import { verifyQrToken, sha256Hex } from '../lib/crypto'
import {
  categoriesOf,
  categoryOf,
  checkinResponseFrom,
  eventOf,
  getUser,
  holdTx,
  isPending,
  layoutOf,
  orderOf,
  recordCheckin,
  seatViews,
  sessionOf,
  sessionsOf,
  staffTicket,
  sweep,
} from '../lib/core'
import { fail } from '../lib/errors'
import type { Tx } from '../lib/tx'
import { receiptQueue, reviewReceipt, staffAccounts } from './admin'

const staff = (tx: Tx, req: Req) => requireRole(tx, req.auth, 'STAFF')

export async function accounts(tx: Tx, req: Req) {
  await staff(tx, req)
  return (await staffAccounts(tx)).filter((s) => s.active)
}

export async function offlineManifest(tx: Tx, req: Req): Promise<OfflineManifest> {
  await staff(tx, req)
  const session = await sessionOf(tx, req.params.id)
  const event = await eventOf(tx, session.eventId)
  const sessions = new Map((await sessionsOf(tx, event.id)).map((x) => [x.id, resolveSession(x, tx.now)]))
  const orders = new Map((await tx.where<Order>('orders', 'by_event', { eventId: event.id })).map((o) => [o.id, o]))
  const tickets = []
  for (const { qrToken, ...ticket } of await tx.where<Ticket>('tickets', 'by_event', { eventId: event.id })) {
    const order = orders.get(ticket.orderId)
    // only a hash of each QR token leaves the server
    tickets.push({
      tokenHash: await sha256Hex(qrToken),
      ticket,
      order: { id: ticket.orderId, code: order?.code ?? '', buyerName: order?.buyerName ?? '' },
      session: sessions.get(ticket.sessionId) ?? session,
    })
  }
  return { sessionId: session.id, generatedAt: tx.now.toISOString(), event, session, categories: await categoriesOf(tx, event.id), tickets }
}

/**
 * POST /staff/checkins. The ticket row is read and written in this one mutation, so two gates scanning the same QR at
 * the same moment are serialised by Convex and exactly one gets VALID.
 */
export async function checkin(tx: Tx, req: Req): Promise<CheckinResponse> {
  const me = await staff(tx, req)
  if (me.active === false) fail('FORBIDDEN', 'Akun petugas ini dinonaktifkan panitia. Minta panitia mengaktifkannya lagi.')
  const qrToken = typeof req.body?.qr_token === 'string' ? req.body.qr_token : ''
  // a ticket picked by hand (cari manual, rombongan) comes by id: the petugas never needs to hold its QR
  const byId = typeof req.body?.ticket_id === 'string' ? req.body.ticket_id : ''
  const sessionId = typeof req.body?.session_id === 'string' ? req.body.session_id : fail('BAD_REQUEST', 'Pilih sesi dulu.')
  const now = tx.now
  const staffId = me.id
  const record = (result: CheckinResponse['result'], ticket: Ticket | null) => recordCheckin(tx, { ticketId: ticket?.id ?? null, sessionId, staffId, scannedAt: now.toISOString(), result })
  const respond = async (result: CheckinResponse['result'], message: string, ticket: Ticket | null, firstScan: CheckinResponse['firstScan'] = null) => {
    await record(result, ticket)
    return checkinResponseFrom(tx, result, message, ticket, firstScan)
  }

  const scanSession = await sessionOf(tx, sessionId)
  let ticket: Ticket | null
  if (byId) {
    ticket = await tx.get<Ticket>('tickets', byId)
    if (!ticket) return respond('INVALID', 'Tiket tidak ditemukan.', null)
  } else {
    const parsed = await verifyQrToken(qrToken)
    if (!parsed.ok) return respond('INVALID', 'QR tidak dikenali atau sudah diubah. Minta pengunjung membuka Pass Saya.', null)
    ticket = await tx.get<Ticket>('tickets', parsed.ticketId)
    if (!ticket || ticket.qrVersion !== parsed.qrVersion) return respond('INVALID', 'Tiket tidak ditemukan atau QR sudah diganti.', ticket)
  }
  if (ticket.status === 'CANCELLED') return respond('INVALID', 'Tiket ini sudah dibatalkan.', ticket)
  if (ticket.eventId !== scanSession.eventId) return respond('INVALID', `Tiket untuk event lain (${(await eventOf(tx, ticket.eventId)).title}).`, ticket)
  const event = await eventOf(tx, ticket.eventId)
  if (ticket.status === 'USED' && !event.rules.reentryAllowed) {
    const first = (await tx.where<Checkin>('checkins', 'by_ticket', { ticketId: ticket.id })).filter((c) => c.result === 'VALID').sort((a, b) => a.scannedAt.localeCompare(b.scannedAt))[0] ?? null
    return respond(
      'ALREADY_USED',
      first ? `Tiket sudah dipakai jam ${fmtTime(first.scannedAt)}.` : 'Tiket sudah dipakai.',
      ticket,
      first ? { ...first, staffName: (await getUser(tx, first.staffId))?.name ?? 'Petugas' } : null,
    )
  }
  if (ticket.sessionId !== sessionId) {
    const ts = await sessionOf(tx, ticket.sessionId)
    return respond('WRONG_SESSION', `Tiket untuk ${ts.label ?? 'sesi lain'} (${fmtShortDate(ts.startAt)} ${fmtTime(ts.startAt)}).`, ticket)
  }
  const win = checkinWindow(scanSession, event.rules)
  if (now < win.open || now > win.close) {
    return respond(
      'OUTSIDE_WINDOW',
      now < win.open ? `Check-in dibuka ${fmtShortDate(win.open.toISOString())} jam ${fmtTime(win.open.toISOString())}.` : `Check-in sudah ditutup jam ${fmtTime(win.close.toISOString())}.`,
      ticket,
    )
  }
  ticket.status = 'USED'
  ticket.usedAt = now.toISOString()
  return respond('VALID', ticket.seatLabel ? `Kursi ${ticket.seatLabel}` : 'Tanpa nomor kursi', ticket)
}

export async function searchTickets(tx: Tx, req: Req): Promise<TicketSearchRow[]> {
  await staff(tx, req)
  const term = (req.query.q ?? '').trim().toLowerCase()
  if (term.length < 2) return []
  const phone = normalizePhone(term)
  const eventId = req.query.event_id
  const tickets = eventId ? await tx.where<Ticket>('tickets', 'by_event', { eventId }) : await tx.all<Ticket>('tickets')
  const out: TicketSearchRow[] = []
  for (const t of tickets) {
    if (out.length >= 30) break
    const o = await tx.get<Order>('orders', t.orderId)
    if (!o) continue
    const hit =
      t.code.toLowerCase().includes(term) ||
      o.code.toLowerCase().includes(term) ||
      (phone.length >= 4 && o.buyerPhone.includes(phone)) ||
      o.buyerName.toLowerCase().includes(term) ||
      (t.attendeeName?.toLowerCase().includes(term) ?? false)
    if (!hit) continue
    out.push({ ticket: staffTicket(t), order: o, event: await eventOf(tx, t.eventId), session: await sessionOf(tx, t.sessionId), category: await categoryOf(tx, t.categoryId) })
  }
  return out
}

export async function recentCheckins(tx: Tx, req: Req) {
  await staff(tx, req)
  const sessionId = req.params.id
  const session = await sessionOf(tx, sessionId)
  const tickets = (await tx.where<Ticket>('tickets', 'by_event', { eventId: session.eventId })).filter((t) => t.sessionId === sessionId && t.status !== 'CANCELLED')
  const scans = (await tx.where<Checkin>('checkins', 'by_session', { sessionId })).sort((a, b) => b.scannedAt.localeCompare(a.scannedAt)).slice(0, 8)
  const recent = []
  for (const c of scans) {
    const t = c.ticketId ? await tx.get<Ticket>('tickets', c.ticketId) : null
    recent.push({ ...(await checkinResponseFrom(tx, c.result, '', t)), message: fmtTime(c.scannedAt) })
  }
  return { checkedIn: tickets.filter((t) => t.status === 'USED').length, capacity: tickets.length, recent }
}

export async function listReceipts(tx: Tx, req: Req) {
  await staff(tx, req)
  return receiptQueue(tx, 'PENDING', req.query.event_id || undefined)
}

export async function patchReceipt(tx: Tx, req: Req) {
  const me = await staff(tx, req)
  if (me.active === false) fail('FORBIDDEN', 'Akun petugas ini dinonaktifkan panitia. Minta panitia mengaktifkannya lagi.')
  return reviewReceipt(tx, req.params.id, req.body?.decision, req.body?.reason, me.id)
}

/* ================================================================== demo */

export async function expireHold(tx: Tx, req: Req) {
  const order = await orderOf(tx, req.params.id)
  if (order.userId !== (await ownerId(tx, req.auth))) fail('NOT_FOUND', 'Pesanan tidak ditemukan.')
  if (!isPending(order)) fail('BAD_STATE', `Pesanan ${ORDER_STATUS_LABEL[order.status].toLowerCase()}, tidak sedang menahan kursi.`)
  const past = new Date(tx.now.getTime() - 1000).toISOString()
  order.holdExpiresAt = past
  for (const ss of await tx.where<SessionSeat>('sessionSeats', 'by_order', { orderId: order.id })) if (ss.status === 'HELD') ss.holdExpiresAt = past
  await sweep(tx, { limit: 500 })
  return order
}

export async function fakeBuyer(tx: Tx, req: Req) {
  await sweep(tx)
  const sessionId = req.params.id
  const categoryId: string | undefined = typeof req.body?.category_id === 'string' ? req.body.category_id : undefined
  const seatIds: string[] | undefined = Array.isArray(req.body?.seat_ids) ? req.body.seat_ids : undefined
  const session = await sessionOf(tx, sessionId)
  const event = await eventOf(tx, session.eventId)
  const views = await seatViews(tx, sessionId, event.layoutId)
  const sim = { simulated: true, holdSeconds: 60 }
  if (seatIds?.length) {
    // "Uji rebutan kursi": the simulated buyer grabs exactly these seats first
    const free = views.filter((v) => seatIds.includes(v.seat.id) && v.status === 'AVAILABLE' && v.categoryId)
    if (!free.length) fail('CONFLICT', 'Kursi itu sudah tidak tersedia.')
    const cid = free[0].categoryId!
    const res = await holdTx(tx, sessionId, { categoryId: cid, seatIds: free.filter((v) => v.categoryId === cid).map((v) => v.seat.id) }, 'u_sim', sim)
    if (!res.ok) fail('CONFLICT', res.message)
    return { seatLabels: res.order.items.map((i) => i.seatLabel ?? '') }
  }
  const cats = (await categoriesOf(tx, event.id)).filter((c) => c.quota == null && (!categoryId || c.id === categoryId))
  const withSeats = cats.filter((c) => views.some((v) => v.categoryId === c.id && v.status === 'AVAILABLE'))
  if (!withSeats.length) fail('SOLD_OUT', 'Tidak ada kursi kosong untuk disimulasikan.')
  const c = withSeats[Math.floor(Math.random() * withSeats.length)]
  const avail = views.filter((v) => v.categoryId === c.id && v.status === 'AVAILABLE')
  const pick = avail[Math.floor(Math.random() * avail.length)].seat
  const qty = 1 + Math.floor(Math.random() * 2)
  const sug = suggestSeats(views, c.id, qty, await layoutOf(tx, event.layoutId), { x: pick.x, y: pick.y })
  const res = await holdTx(tx, sessionId, { categoryId: c.id, seatIds: sug.seatIds }, 'u_sim', sim)
  if (!res.ok) fail('CONFLICT', res.message)
  return { seatLabels: res.order.items.map((i) => i.seatLabel ?? '') }
}

export type { User }
