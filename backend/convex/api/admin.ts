/** Panitia endpoints (`/admin/*`, ADMIN token). Ported from the mock adapter's `admin` block. */
import type { EventDraft, EventStats, OrderRow, ReceiptQueueItem, ReviewDecision, StaffAccount } from '../shared/contract'
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, TICKET_STATUS_LABEL } from '../shared/labels'
import { csvCell, fmtRange, fmtShortDate, fmtTime, isValidPhone, normalizePhone, rupiahPlain, wibDate } from '../shared/format'
import { checkReceiptRules, profileChanges, resolveSession, uid } from '../shared/rules'
import type { Checkin, EventItem, Order, OrderStatus, Payment, Receipt, Session, SessionQuota, SessionSeat, Tenant, Ticket, TicketCategory, User, Venue } from '../shared/types'
import { requireRole, type Req } from '../lib/auth'
import {
  addInventory,
  applyLayout,
  assertHoldActive,
  availability,
  categoriesOf,
  categoryOf,
  confirmOrder,
  draftOf,
  dropScheduledNotes,
  eventDates,
  eventOf,
  getUser,
  isPending,
  liveOrder,
  notifyWaitlist,
  orderDetail,
  orderOf,
  pushNote,
  receiptsOf,
  releaseOrderSeats,
  releaseSoldSeats,
  sessionOf,
  sessionsOf,
  slugify,
  summary,
  sweep,
  tenantsAll,
  posterPaletteOf,
  stableJson,
  validateDraft,
} from '../lib/core'
import { fail, must } from '../lib/errors'
import { sendInvite } from './account'
import type { Tx } from '../lib/tx'

const admin = (tx: Tx, req: Req) => requireRole(tx, req.auth, 'ADMIN')

export async function listEvents(tx: Tx, req: Req) {
  await admin(tx, req)
  const out = []
  for (const e of await tx.all<EventItem>('events')) out.push(await summary(tx, e))
  return out.sort((a, b) => a.event.startAt.localeCompare(b.event.startAt))
}

export async function getEventDraft(tx: Tx, req: Req) {
  await admin(tx, req)
  const event = await eventOf(tx, req.params.id)
  return { draft: await draftOf(tx, event), event }
}

export async function createEvent(tx: Tx, req: Req) {
  const me = await admin(tx, req)
  const draft = req.body as EventDraft
  validateDraft(draft)
  let slug = slugify(draft.title) || 'event'
  if ((await tx.where('events', 'by_slug', { slug })).length) slug = `${slug}-${Math.floor(Math.random() * 900 + 100)}`
  const event: EventItem = {
    id: uid('evt'),
    slug,
    title: draft.title.trim(),
    subtitle: draft.subtitle?.trim(),
    description: (draft.description ?? '').trim(),
    posterTheme: draft.posterTheme,
    posterPalette: posterPaletteOf(draft),
    venueId: draft.venueId,
    layoutId: null,
    seatingMode: draft.seatingMode,
    status: 'DRAFT',
    ...eventDates(draft, tx.now),
    rules: { ...draft.rules },
    seatAssignments: {},
    createdBy: me.id,
    createdAt: tx.now.toISOString(),
  }
  const categoryIds: string[] = []
  for (const c of draft.categories) {
    const id = uid('cat')
    const { id: _ignored, ...rest } = c
    void _ignored
    await tx.insert('categories', { ...rest, quota: rest.quota ?? null, id, eventId: event.id })
    categoryIds.push(id)
  }
  await applyLayout(tx, event, draft, categoryIds)
  await tx.insert('events', event)
  for (const s of draft.sessions) {
    const session: Session = { id: uid('ses'), eventId: event.id, label: s.label, startAt: s.startAt, endAt: s.endAt, demoLive: s.demoLive }
    await tx.insert('sessions', session)
    await addInventory(tx, event, session)
  }
  return event
}

export async function updateEvent(tx: Tx, req: Req) {
  await admin(tx, req)
  const eventId = req.params.id
  if (req.body?.status === 'PUBLISHED' && !req.body?.title) return publishEvent(tx, req)
  const draft = req.body as EventDraft
  validateDraft(draft)
  const event = await eventOf(tx, eventId)
  const hasOrders = (await tx.where<Order>('orders', 'by_event', { eventId })).length > 0
  const before = await draftOf(tx, event)
  // compared without key order: Convex hands request bodies over with their keys sorted
  const layoutChanged = stableJson(before.layout ?? null) !== stableJson(draft.layout ?? null) || before.seatingMode !== draft.seatingMode
  if (layoutChanged && hasOrders) fail('LOCKED_LAYOUT', 'Denah tidak bisa diubah karena sudah ada pesanan. Ubah info, harga, atau sesi saja.')
  Object.assign(event, {
    title: draft.title.trim(),
    subtitle: draft.subtitle?.trim(),
    description: (draft.description ?? '').trim(),
    posterTheme: draft.posterTheme,
    posterPalette: posterPaletteOf(draft),
    venueId: draft.venueId,
    seatingMode: draft.seatingMode,
    rules: { ...draft.rules },
    ...eventDates(draft, tx.now),
  })
  // categories: upsert by id, delete unused removed ones
  const existingCats = await categoriesOf(tx, eventId)
  const keepIds: string[] = []
  const categoryIds: string[] = []
  for (const c of draft.categories) {
    const existing = c.id ? existingCats.find((x) => x.id === c.id) : undefined
    if (existing) {
      for (const k of Object.keys(existing) as Array<keyof TicketCategory>) if (!(k in c) && k !== 'id' && k !== 'eventId') delete existing[k]
      Object.assign(existing, { ...c, quota: c.quota ?? null, id: existing.id, eventId })
      keepIds.push(existing.id)
      categoryIds.push(existing.id)
      continue
    }
    const id = uid('cat')
    const { id: _ignored, ...rest } = c
    void _ignored
    await tx.insert('categories', { ...rest, quota: rest.quota ?? null, id, eventId })
    keepIds.push(id)
    categoryIds.push(id)
  }
  const eventOrders = await tx.where<Order>('orders', 'by_event', { eventId })
  for (const c of existingCats) if (!keepIds.includes(c.id) && !eventOrders.some((o) => o.categoryId === c.id)) await tx.remove(c)
  const sessions = await sessionsOf(tx, eventId)
  if (layoutChanged) {
    for (const s of sessions) {
      for (const ss of await tx.where<SessionSeat>('sessionSeats', 'by_session_seat', { sessionId: s.id })) await tx.remove(ss)
      for (const q of await tx.where<SessionQuota>('quotas', 'by_session_category', { sessionId: s.id })) await tx.remove(q)
    }
    await applyLayout(tx, event, draft, categoryIds)
    for (const s of sessions) await addInventory(tx, event, s)
  }
  // quotas follow category changes
  for (const c of (await categoriesOf(tx, eventId)).filter((x) => x.quota != null)) {
    for (const s of sessions) {
      const q = (await tx.where<SessionQuota>('quotas', 'by_session_category', { sessionId: s.id, categoryId: c.id }))[0]
      if (q) q.quota = c.quota!
      else await tx.insert('quotas', { sessionId: s.id, categoryId: c.id, quota: c.quota!, filled: 0 } satisfies SessionQuota)
    }
  }
  // sessions: upsert, delete removed ones without orders
  const keepSessions: string[] = []
  for (const s of draft.sessions) {
    const existing = s.id ? sessions.find((x) => x.id === s.id) : undefined
    if (existing) {
      Object.assign(existing, { label: s.label, startAt: s.startAt, endAt: s.endAt, demoLive: s.demoLive })
      keepSessions.push(existing.id)
    } else {
      const session: Session = { id: uid('ses'), eventId, label: s.label, startAt: s.startAt, endAt: s.endAt, demoLive: s.demoLive }
      await tx.insert('sessions', session)
      await addInventory(tx, event, session)
      keepSessions.push(session.id)
    }
  }
  for (const s of sessions) {
    if (keepSessions.includes(s.id) || eventOrders.some((o) => o.sessionId === s.id)) continue
    for (const ss of await tx.where<SessionSeat>('sessionSeats', 'by_session_seat', { sessionId: s.id })) await tx.remove(ss)
    for (const q of await tx.where<SessionQuota>('quotas', 'by_session_category', { sessionId: s.id })) await tx.remove(q)
    await tx.remove(s)
  }
  return event
}

export async function publishEvent(tx: Tx, req: Req) {
  await admin(tx, req)
  const event = await eventOf(tx, req.params.id)
  if (!(await sessionsOf(tx, event.id)).length && !event.infoOnly) fail('BAD_STATE', 'Tambahkan minimal 1 sesi sebelum publish.')
  event.status = 'PUBLISHED'
  return event
}

export async function listOrders(tx: Tx, req: Req): Promise<OrderRow[]> {
  await admin(tx, req)
  const { eventId, status } = req.query
  const q = req.query.q?.trim().toLowerCase()
  const qPhone = q ? normalizePhone(q) : ''
  const orders = eventId ? await tx.where<Order>('orders', 'by_event', { eventId }) : await tx.all<Order>('orders')
  const rows = orders
    .filter((o) => !status || status === 'ALL' || liveOrder(o, tx.now).status === status)
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
  const out: OrderRow[] = []
  for (const o of rows) {
    out.push({
      order: liveOrder(o, tx.now),
      event: await eventOf(tx, o.eventId),
      session: await sessionOf(tx, o.sessionId),
      category: await categoryOf(tx, o.categoryId),
      receipts: await receiptsOf(tx, o.id),
      checkedIn: (await tx.where<Ticket>('tickets', 'by_order', { orderId: o.id })).filter((t) => t.status === 'USED').length,
    })
  }
  return out
}

async function markPaid(tx: Tx, order: Order) {
  if (order.status !== 'AWAITING_PAYMENT') fail('BAD_STATE', 'Hanya pesanan "Menunggu pembayaran" yang bisa ditandai lunas.')
  assertHoldActive(order, tx.now)
  await tx.insert('payments', {
    id: uid('pay'),
    orderId: order.id,
    method: order.paymentMethod === 'FREE' ? 'FREE' : 'SIM_VA',
    amount: order.totalAmount,
    status: 'SUCCESS',
    idempotencyKey: `manual-${order.id}`,
    simRef: 'MANUAL-PANITIA',
    paidAt: tx.now.toISOString(),
    createdAt: tx.now.toISOString(),
  } satisfies Payment)
  await confirmOrder(tx, order, order.paymentMethod === 'FREE' ? 'FREE' : 'SIM_VA')
  return order
}

async function adminCancel(tx: Tx, order: Order) {
  if (order.status === 'CANCELLED' || order.status === 'EXPIRED' || order.status === 'REJECTED') fail('BAD_STATE', 'Pesanan sudah tidak aktif.')
  const wasConfirmed = order.status === 'CONFIRMED'
  const paid = order.paymentMethod === 'SIM_QRIS' || order.paymentMethod === 'SIM_VA'
  order.status = 'CANCELLED'
  order.cancelledAt = tx.now.toISOString()
  order.cancelledBy = 'ADMIN'
  order.refundAmount = wasConfirmed && paid ? order.totalAmount : null
  await dropScheduledNotes(tx, order.id)
  await releaseOrderSeats(tx, order)
  await releaseSoldSeats(tx, order)
  for (const t of await tx.where<Ticket>('tickets', 'by_order', { orderId: order.id })) if (t.status === 'ACTIVE') t.status = 'CANCELLED'
  await notifyWaitlist(tx, order)
  if (!order.simulated) {
    await pushNote(tx, {
      userId: order.userId,
      channel: 'WA',
      kind: 'ORDER_REJECTED',
      title: 'Pesanan dibatalkan panitia',
      body: wasConfirmed
        ? `Pesanan ${order.code} dibatalkan panitia. ${order.refundAmount ? `Refund ${rupiahPlain(order.refundAmount)} diproses ke metode bayar asal (simulasi).` : 'Tidak ada pembayaran yang perlu dikembalikan.'}`
        : `Pesanan ${order.code} dibatalkan panitia dan kursinya dilepas.`,
      createdAt: tx.now.toISOString(),
      scheduledFor: null,
      orderId: order.id,
    })
  }
  return order
}

export async function patchOrder(tx: Tx, req: Req) {
  await admin(tx, req)
  await sweep(tx)
  const order = await orderOf(tx, req.params.id)
  if (req.body?.action === 'MARK_PAID') return markPaid(tx, order)
  if (req.body?.action === 'CANCEL') return adminCancel(tx, order)
  fail('BAD_REQUEST', 'Aksi tidak dikenal. Pakai MARK_PAID atau CANCEL.')
}

/** Receipt sets grouped per order, with the rule checks (shared by /admin/receipts and /staff/receipts). */
export async function receiptQueue(tx: Tx, status: string, eventId?: string): Promise<ReceiptQueueItem[]> {
  const receipts = await tx.all<Receipt>('receipts')
  const byOrder = new Map<string, Receipt[]>()
  for (const r of receipts) {
    const list = byOrder.get(r.orderId) ?? []
    list.push(r)
    byOrder.set(r.orderId, list)
  }
  const tenants = await tenantsAll(tx)
  const items: ReceiptQueueItem[] = []
  for (const [orderId, siblings] of byOrder) {
    const order = await tx.get<Order>('orders', orderId)
    if (!order || (eventId && order.eventId !== eventId)) continue
    const live = liveOrder(order, tx.now)
    const rep = siblings[0]
    if (status === 'PENDING' && !(live.status === 'AWAITING_VERIFICATION' && siblings.some((s) => s.status === 'PENDING'))) continue
    if (status !== 'ALL' && status !== 'PENDING' && rep.status !== status) continue
    const category = await categoryOf(tx, order.categoryId)
    const checks = category.receiptRules ? checkReceiptRules(siblings, { rules: category.receiptRules, tenants, existing: receipts, orderId, now: tx.now }).checks : []
    if (siblings.some((s) => s.possibleDuplicate) && !checks.some((c) => c.warning)) {
      checks.push({ rule: 'R6', ok: true, warning: true, message: 'Foto struk sama dengan struk lain. Cek ulang struk aslinya.' })
    }
    items.push({
      receipt: rep,
      order: live,
      event: await eventOf(tx, order.eventId),
      session: await sessionOf(tx, order.sessionId),
      category,
      tenant: tenants.find((t) => t.id === rep.tenantId) ?? null,
      siblings,
      checks,
      user: await getUser(tx, order.userId),
    })
  }
  return items.sort((a, b) => a.receipt.createdAt.localeCompare(b.receipt.createdAt))
}

export async function listReceipts(tx: Tx, req: Req) {
  await admin(tx, req)
  return receiptQueue(tx, req.query.status || 'PENDING')
}

/** One decision for the whole receipt set of an order (APPROVE / NEEDS_REVISION / REJECT). */
export async function reviewReceipt(tx: Tx, receiptId: string, decision: ReviewDecision, reason: string | undefined, reviewer: string) {
  await sweep(tx)
  const receipt = must(await tx.get<Receipt>('receipts', receiptId), 'Struk')
  const order = await orderOf(tx, receipt.orderId)
  if (order.status !== 'AWAITING_VERIFICATION') {
    fail('BAD_STATE', order.status === 'EXPIRED' ? 'Waktu tahan kursi sudah habis, pesanan kedaluwarsa.' : `Pesanan ${ORDER_STATUS_LABEL[order.status].toLowerCase()}.`)
  }
  const why = typeof reason === 'string' ? reason.trim() : ''
  const set = (await receiptsOf(tx, order.id)).filter((r) => r.status === 'PENDING' || r.status === 'NEEDS_REVISION')
  const stamp = (status: Receipt['status']) => {
    for (const r of set) Object.assign(r, { status, reason: why || null, reviewedBy: reviewer, reviewedAt: tx.now.toISOString() })
  }
  if (decision === 'APPROVE') {
    assertHoldActive(order, tx.now)
    stamp('APPROVED')
    await confirmOrder(tx, order, 'RECEIPT')
  } else if (decision === 'NEEDS_REVISION') {
    if (!why) fail('NEED_REASON', 'Tulis alasan revisi supaya pengunjung tahu apa yang harus diperbaiki.')
    stamp('NEEDS_REVISION')
    await pushNote(tx, {
      userId: order.userId,
      channel: 'WA',
      kind: 'RECEIPT_RESULT',
      title: 'Struk perlu revisi',
      body: `Struk pesanan ${order.code} perlu diperbaiki: ${why}. Upload ulang sebelum ${fmtTime(order.holdExpiresAt)} WIB.`,
      createdAt: tx.now.toISOString(),
      scheduledFor: null,
      orderId: order.id,
    })
  } else if (decision === 'REJECT') {
    if (!why) fail('NEED_REASON', 'Tulis alasan penolakan.')
    stamp('REJECTED')
    order.status = 'REJECTED'
    await releaseOrderSeats(tx, order)
    await notifyWaitlist(tx, order)
    await pushNote(tx, {
      userId: order.userId,
      channel: 'WA',
      kind: 'ORDER_REJECTED',
      title: 'Struk ditolak',
      body: `Struk pesanan ${order.code} ditolak: ${why}. Kursi sudah dilepas.`,
      createdAt: tx.now.toISOString(),
      scheduledFor: null,
      orderId: order.id,
    })
  } else {
    fail('BAD_REQUEST', 'Keputusan tidak dikenal. Pakai APPROVE, NEEDS_REVISION, atau REJECT.')
  }
  return orderDetail(tx, order)
}

export async function patchReceipt(tx: Tx, req: Req) {
  const me = await admin(tx, req)
  return reviewReceipt(tx, req.params.id, req.body?.decision, req.body?.reason, me.id)
}

export async function stats(tx: Tx, req: Req): Promise<EventStats> {
  await admin(tx, req)
  const now = tx.now
  const eventId = req.params.id
  const event = await eventOf(tx, eventId)
  const categories = await categoriesOf(tx, eventId)
  const sessions = (await sessionsOf(tx, eventId)).map((s) => resolveSession(s, now))
  const orders = (await tx.where<Order>('orders', 'by_event', { eventId })).map((o) => liveOrder(o, now))
  const allTickets = await tx.where<Ticket>('tickets', 'by_event', { eventId })
  const tickets = allTickets.filter((t) => t.status !== 'CANCELLED')
  const confirmed = orders.filter((o) => o.status === 'CONFIRMED')
  const transactions = { AWAITING_PAYMENT: 0, AWAITING_VERIFICATION: 0, CONFIRMED: 0, EXPIRED: 0, CANCELLED: 0, REJECTED: 0 } as Record<OrderStatus, number>
  for (const o of orders.filter((x) => !x.simulated)) transactions[o.status]++
  const avBySession = new Map<string, Awaited<ReturnType<typeof availability>>>()
  for (const s of sessions) avBySession.set(s.id, await availability(tx, s, categories))
  const byCategory = categories.map((c) => {
    let sold = 0
    let held = 0
    let total = 0
    for (const s of sessions) {
      const av = avBySession.get(s.id)!.find((a) => a.categoryId === c.id)!
      sold += av.sold
      held += av.held
      total += av.total
    }
    const revenue = confirmed.filter((o) => o.categoryId === c.id).reduce((s, o) => s + o.totalAmount, 0)
    return { category: c, sold, held, total, revenue }
  })
  const bySession = sessions.map((s) => {
    const av = avBySession.get(s.id)!
    const capacity = av.reduce((a, b) => a + b.total, 0)
    const sold = av.reduce((a, b) => a + b.sold, 0)
    const held = av.reduce((a, b) => a + b.held, 0)
    const checkedIn = tickets.filter((t) => t.sessionId === s.id && t.status === 'USED').length
    return { session: s, capacity, sold, held, checkedIn, occupancyPct: capacity ? Math.round((checkedIn / capacity) * 100) : 0 }
  })
  const orderIds = new Set(orders.map((o) => o.id))
  const eventReceipts: Receipt[] = []
  for (const o of orders) eventReceipts.push(...(await receiptsOf(tx, o.id)))
  const approved = eventReceipts.filter((r) => r.status === 'APPROVED' && orderIds.has(r.orderId))
  const tenantMap = new Map<string, { amount: number; count: number }>()
  for (const r of approved) {
    const t = tenantMap.get(r.tenantId) ?? { amount: 0, count: 0 }
    t.amount += r.amount
    t.count += 1
    tenantMap.set(r.tenantId, t)
  }
  const tenants = await tenantsAll(tx)
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
  const checkinsByHour = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
  for (const s of sessions) {
    for (const c of await tx.where<Checkin>('checkins', 'by_session', { sessionId: s.id })) {
      if (c.result !== 'VALID') continue
      const at = new Date(new Date(c.scannedAt).getTime() + 7 * 3600_000) // WIB
      checkinsByHour[(at.getUTCDay() + 6) % 7][at.getUTCHours()] += 1
    }
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
    receiptsPending: new Set(eventReceipts.filter((r) => r.status === 'PENDING' && orders.some((o) => o.id === r.orderId && o.status === 'AWAITING_VERIFICATION')).map((r) => r.orderId)).size,
    topTenants: [...tenantMap.entries()]
      .map(([id, v]) => ({ tenant: must(tenants.find((t) => t.id === id), 'Tenant'), ...v }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
    noShowPct: endedSold ? Math.round(((endedSold - endedIn) / endedSold) * 100) : null,
    daily: [...dayMap.values()],
    checkinsByHour,
    generatedAt: now.toISOString(),
  }
}

export async function exportCsv(tx: Tx, req: Req) {
  await admin(tx, req)
  const now = tx.now
  const eventId = req.params.id
  const event = await eventOf(tx, eventId)
  const date = wibDate(now)
  const orders = new Map((await tx.where<Order>('orders', 'by_event', { eventId })).map((o) => [o.id, o]))
  if (req.query.type === 'attendees') {
    const header = ['Kode Tiket', 'Nama Peserta', 'Pemesan', 'No HP', 'Kategori', 'Kursi', 'Sesi', 'Status Tiket', 'Waktu Check-in']
    const rows = []
    for (const t of await tx.where<Ticket>('tickets', 'by_event', { eventId })) {
      const o = must(orders.get(t.orderId), 'Pesanan')
      const s = await sessionOf(tx, t.sessionId)
      rows.push([
        t.code,
        t.attendeeName ?? '',
        o.buyerName,
        o.buyerPhone,
        (await categoryOf(tx, t.categoryId)).name,
        t.seatLabel ?? 'Tanpa nomor',
        `${s.label ?? ''} ${fmtShortDate(s.startAt)} ${fmtRange(s.startAt, s.endAt)}`.trim(),
        TICKET_STATUS_LABEL[t.status],
        t.usedAt ? `${fmtShortDate(t.usedAt)} ${fmtTime(t.usedAt)}` : '',
      ])
    }
    return { filename: `summarevent-${event.slug}-peserta-${date}.csv`, csv: [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') }
  }
  if (req.query.type !== 'transactions') fail('BAD_REQUEST', 'Pilih type=attendees atau type=transactions.')
  const header = ['Kode Pesanan', 'Pemesan', 'No HP', 'Kategori', 'Sesi', 'Kursi', 'Jumlah', 'Total (Rp)', 'Metode', 'Status', 'Dibuat', 'Dikonfirmasi']
  const rows = []
  for (const raw of [...orders.values()].filter((o) => !o.simulated).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const o = liveOrder(raw, now)
    const s = await sessionOf(tx, o.sessionId)
    rows.push([
      o.code,
      o.buyerName,
      o.buyerPhone,
      (await categoryOf(tx, o.categoryId)).name,
      `${s.label ?? ''} ${fmtShortDate(s.startAt)}`.trim(),
      o.items
        .map((i) => i.seatLabel)
        .filter(Boolean)
        .join(' '),
      o.qty,
      o.totalAmount,
      o.paymentMethod ? PAYMENT_METHOD_LABEL[o.paymentMethod] : '',
      ORDER_STATUS_LABEL[o.status],
      `${fmtShortDate(o.createdAt)} ${fmtTime(o.createdAt)}`,
      o.confirmedAt ? `${fmtShortDate(o.confirmedAt)} ${fmtTime(o.confirmedAt)}` : '',
    ])
  }
  return { filename: `summarevent-${event.slug}-transaksi-${date}.csv`, csv: [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') }
}

export async function venues(tx: Tx, req: Req) {
  await admin(tx, req)
  return tx.all<Venue>('venues')
}

export async function tenants(tx: Tx, req: Req) {
  await admin(tx, req)
  return tx.all<Tenant>('tenants')
}

export async function staffAccounts(tx: Tx): Promise<StaffAccount[]> {
  const staff = (await tx.all<User>('users')).filter((u) => u.role === 'STAFF')
  const out: StaffAccount[] = []
  for (const u of staff) {
    const scans = await tx.where<Checkin>('checkins', 'by_staff', { staffId: u.id })
    const last = scans.sort((a, b) => b.scannedAt.localeCompare(a.scannedAt))[0]
    out.push({ ...u, active: u.active !== false, scans: scans.filter((c) => c.result === 'VALID').length, lastScanAt: last?.scannedAt ?? null })
  }
  return out.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
}

export async function listStaff(tx: Tx, req: Req) {
  await admin(tx, req)
  return staffAccounts(tx)
}

export async function createStaff(tx: Tx, req: Req) {
  const me = await admin(tx, req)
  const name = String(req.body?.name ?? '').trim()
  const phone = normalizePhone(String(req.body?.phone ?? ''))
  const checked = profileChanges({ email: String(req.body?.email ?? '') })
  if (name.length < 3) fail('INVALID', 'Tulis nama petugas, minimal 3 huruf.', { field: 'name' })
  if (!isValidPhone(phone)) fail('INVALID', 'Nomor HP belum benar. Contoh: 0812 3456 7890.', { field: 'phone' })
  if (!checked.ok || !checked.email) fail('INVALID', 'Tulis email petugas, misalnya nama@contoh.id.', { field: 'email' })
  if ((await tx.where<User>('users', 'by_phone', { phone, role: 'STAFF' })).length) fail('DUPLICATE', 'Nomor HP ini sudah dipakai akun petugas lain.', { field: 'phone' })
  if ((await tx.where<User>('users', 'by_email', { email: checked.email })).length) fail('DUPLICATE', 'Email ini sudah dipakai akun lain.', { field: 'email' })
  const user = await tx.insert('users', { id: uid('stf'), role: 'STAFF', name, phone, email: checked.email, createdAt: tx.now.toISOString(), active: true } satisfies User)
  await sendInvite(tx, user, me)
  return user
}

export async function setStaffActive(tx: Tx, req: Req) {
  await admin(tx, req)
  const u = await tx.get<User>('users', req.params.id)
  if (!u || u.role !== 'STAFF') fail('NOT_FOUND', 'Akun petugas tidak ditemukan.')
  if (typeof req.body?.active !== 'boolean') fail('BAD_REQUEST', 'Isi active dengan true atau false.')
  u.active = req.body.active
  return u
}
