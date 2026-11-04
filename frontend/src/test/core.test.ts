/**
 * Core reliability tests (PRD §15, QA-01…QA-10) against the in-browser mock.
 * Run: npm test
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createMockApi } from '@/api/mock/adapter'
import { clearClientSessions, clearDb, readDb, replaceDb, setSessionUserId, transaction } from '@/api/mock/db'
import { PERSONA_ID, buildSeed } from '@/api/mock/seed'
import { DEMO_PASSWORD } from '@/lib/demoAccounts'
import { makeQrToken, verifyQrToken } from '@/domain/qr'
import { parseReceiptText } from '@/domain/ocr'
import { AVATAR_MAX, LOGIN_MAX_FAILS, buildSeats, checkinWindow, checkReceiptRules, effectiveSeatStatus, passwordCheck, profileChanges, resolveSession, saleState, suggestSeats } from '@/domain/rules'
import type { EventRules, SeatLayout, Session, TicketCategory } from '@/domain/types'
import { wibDate } from '@/lib/format'

const api = createMockApi()
const SESSION = 'ses_sk_16' // Sangkuriang, Sesi 2 (16.00)
const DEMO = 'ses_sk_demo'

function seatId(label: string) {
  return `lay_ciunik:${label}`
}

async function freshDb() {
  clearDb()
  clearClientSessions()
  replaceDb(await buildSeed(new Date()))
}

/** Act as a different visitor (each call = a different person). */
function asVisitor(userId: string) {
  setSessionUserId('VISITOR', userId)
}

beforeEach(async () => {
  await freshDb()
})

describe('seat holds (PRD §8)', () => {
  it('QA-01: 100 concurrent holds on the same seat → exactly one wins', async () => {
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        (async () => {
          // each request comes from a different visitor
          await transaction((db) => {
            db.users.push({ id: `u_race_${i}`, role: 'VISITOR', name: `Race ${i}`, phone: `0899${String(i).padStart(8, '0')}`, createdAt: new Date().toISOString() })
          })
          asVisitor(`u_race_${i}`)
          return api.createHold(SESSION, { categoryId: 'cat_reg', seatIds: [seatId('J8')] })
        })(),
      ),
    )
    const wins = results.filter((r) => r.ok)
    expect(wins).toHaveLength(1)
    expect(results.filter((r) => !r.ok && r.reason === 'CONFLICT')).toHaveLength(99)
    const ss = readDb()!.sessionSeats.find((s) => s.sessionId === SESSION && s.seatId === seatId('J8'))!
    expect(ss.status).toBe('HELD')
  })

  it('QA-02: overlapping multi-seat requests never leave a partial hold', async () => {
    asVisitor('u_dodi')
    const a = api.createHold(SESSION, { categoryId: 'cat_reg', seatIds: [seatId('I5'), seatId('I6')] })
    asVisitor('u_bayu')
    const b = api.createHold(SESSION, { categoryId: 'cat_reg', seatIds: [seatId('I6'), seatId('I7')] })
    const [ra, rb] = await Promise.all([a, b])
    expect([ra.ok, rb.ok].filter(Boolean)).toHaveLength(1)
    const loser = ra.ok ? rb : ra
    expect(loser.ok).toBe(false)
    const held = readDb()!.sessionSeats.filter((s) => s.sessionId === SESSION && ['I5', 'I6', 'I7'].map(seatId).includes(s.seatId) && s.status === 'HELD')
    expect(held).toHaveLength(2) // only the winner's two seats
    if (!loser.ok && loser.reason === 'CONFLICT') expect(loser.suggestions.length).toBe(2)
  })

  it('QA-03/04: an expired hold frees the seat and payment after expiry is refused', async () => {
    asVisitor('u_intan')
    const r = await api.createHold(SESSION, { categoryId: 'cat_reg', seatIds: [seatId('J9')] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // fast-forward: expire the hold
    await transaction((db) => {
      const o = db.orders.find((x) => x.id === r.order.id)!
      o.holdExpiresAt = new Date(Date.now() - 1000).toISOString()
      for (const s of db.sessionSeats) if (s.orderId === o.id) s.holdExpiresAt = o.holdExpiresAt
    })
    const map = await api.getSeatMap(SESSION)
    expect(map.sessionSeats.find((s) => s.seatId === seatId('J9'))!.status).toBe('AVAILABLE')
    await expect(api.simulatePayment(r.order.id, { method: 'SIM_QRIS', outcome: 'SUCCESS', idempotencyKey: 'k1' })).rejects.toThrow(/Waktu habis/)
    expect(readDb()!.orders.find((o) => o.id === r.order.id)!.status).toBe('EXPIRED')
  })

  it('demo "Simulasikan waktu habis" expires the hold, frees the seats and refuses payment', async () => {
    asVisitor('u_nia')
    const r = await api.createHold(SESSION, { categoryId: 'cat_reg', seatIds: [seatId('J12')] })
    if (!r.ok) throw new Error(r.message)
    const o = await api.demo.expireHold(r.order.id)
    expect(o.status).toBe('EXPIRED')
    const map = await api.getSeatMap(SESSION)
    expect(map.sessionSeats.find((s) => s.seatId === seatId('J12'))!.status).toBe('AVAILABLE')
    await expect(api.simulatePayment(r.order.id, { method: 'SIM_VA', outcome: 'SUCCESS', idempotencyKey: 'k-exp' })).rejects.toThrow(/Waktu habis/)
    expect(readDb()!.notifications.some((n) => n.userId === 'u_nia' && n.kind === 'HOLD_EXPIRED')).toBe(true)
  })

  it('layer 4: a seat that already has a live ticket is never confirmed twice', async () => {
    asVisitor('u_euis')
    const r = await api.createHold(SESSION, { categoryId: 'cat_reg', seatIds: [seatId('J13')] })
    if (!r.ok) throw new Error(r.message)
    // simulate a broken earlier layer: someone else already holds a live ticket for J13
    await transaction((db) => {
      const t = db.tickets[0]
      db.tickets.push({ ...t, id: 'tkt_ghost', code: 'TKT-GHOST', orderId: 'ord_ghost', orderItemId: 'itm_ghost', sessionId: SESSION, seatId: seatId('J13'), seatLabel: 'J13', status: 'ACTIVE' })
    })
    await expect(api.simulatePayment(r.order.id, { method: 'SIM_QRIS', outcome: 'SUCCESS', idempotencyKey: 'k-l4' })).rejects.toThrow(/tiket aktif/)
    expect(readDb()!.tickets.filter((t) => t.orderId === r.order.id)).toHaveLength(0)
  })

  it('QA-05: double-pressing pay creates one payment and one set of tickets', async () => {
    asVisitor('u_lestari')
    const r = await api.createHold(SESSION, { categoryId: 'cat_vip', seatIds: [seatId('B1'), seatId('B2')] })
    if (!r.ok) throw new Error(r.message)
    const req = { method: 'SIM_QRIS' as const, outcome: 'SUCCESS' as const, idempotencyKey: 'same-key' }
    await Promise.all([api.simulatePayment(r.order.id, req), api.simulatePayment(r.order.id, req)])
    const db = readDb()!
    expect(db.payments.filter((p) => p.idempotencyKey === 'same-key')).toHaveLength(1)
    expect(db.tickets.filter((t) => t.orderId === r.order.id)).toHaveLength(2)
    expect(db.sessionSeats.filter((s) => s.orderId === r.order.id).every((s) => s.status === 'SOLD')).toBe(true)
  })

  it('one pending order per account per session (S5)', async () => {
    asVisitor('u_galih')
    const first = await api.createHold(SESSION, { categoryId: 'cat_reg', seatIds: [seatId('J10')] })
    expect(first.ok).toBe(true)
    const second = await api.createHold(SESSION, { categoryId: 'cat_reg', seatIds: [seatId('J11')] })
    expect(second.ok).toBe(false)
  })

  it('GENERAL categories respect the quota', async () => {
    asVisitor('u_rudi')
    const r = await api.createHold(SESSION, { categoryId: 'cat_fest', qty: 5 })
    expect(r.ok).toBe(false) // max 4 per order
    const ok = await api.createHold(SESSION, { categoryId: 'cat_fest', qty: 4 })
    expect(ok.ok).toBe(true)
  })
})

describe('check-in (PRD §8, QA-07…09)', () => {
  it('valid → already used; forged QR → invalid; parallel scans → one valid', async () => {
    const db = readDb()!
    const t = db.tickets.find((x) => x.sessionId === DEMO && x.status === 'ACTIVE')!
    const [a, b] = await Promise.all([api.staff.checkin(t.qrToken, DEMO), api.staff.checkin(t.qrToken, DEMO)])
    expect([a.result, b.result].sort()).toEqual(['ALREADY_USED', 'VALID'])
    const again = await api.staff.checkin(t.qrToken, DEMO)
    expect(again.result).toBe('ALREADY_USED')
    expect(again.firstScan).not.toBeNull()
    const forged = t.qrToken.slice(0, -1) + (t.qrToken.endsWith('A') ? 'B' : 'A')
    expect((await api.staff.checkin(forged, DEMO)).result).toBe('INVALID')
  })

  it('ticket for another session is yellow (WRONG_SESSION)', async () => {
    const t = readDb()!.tickets.find((x) => x.sessionId === 'ses_sk_13' && x.status === 'ACTIVE')!
    expect((await api.staff.checkin(t.qrToken, DEMO)).result).toBe('WRONG_SESSION')
  })

  it('signed tokens verify and reject tampering', async () => {
    const token = await makeQrToken('tkt_x', 1)
    expect(await verifyQrToken(token)).toEqual({ ok: true, ticketId: 'tkt_x', qrVersion: 1 })
    expect((await verifyQrToken(token.replace('tkt_x', 'tkt_y'))).ok).toBe(false)
  })
})

describe('sale period, check-in window, hold expiry (PRD §8, QA-11, DM-04)', () => {
  const category = { saleStart: '2026-11-10T03:00:00.000Z', saleCloseMinBeforeSession: 60 } as TicketCategory
  const session = { id: 's', eventId: 'e', startAt: '2026-11-21T09:00:00.000Z', endAt: '2026-11-21T10:00:00.000Z' } as Session

  it('QA-11: not yet on sale, on sale, then closed before the session', () => {
    expect(saleState(category, session, new Date('2026-11-10T02:59:00Z'))).toEqual({ open: false, reason: 'NOT_YET', at: new Date('2026-11-10T03:00:00Z') })
    expect(saleState(category, session, new Date('2026-11-15T00:00:00Z'))).toEqual({ open: true })
    expect(saleState(category, session, new Date('2026-11-21T08:00:00Z'))).toEqual({ open: false, reason: 'CLOSED', at: new Date('2026-11-21T08:00:00Z') })
  })

  it('QA-11: the demo session stays on sale once sales opened', () => {
    expect(saleState(category, { ...session, demoLive: true }, new Date('2026-11-21T09:30:00Z'))).toEqual({ open: true })
  })

  it('QA-11: a hold outside the sale period is refused with a reason and holds nothing', async () => {
    await transaction((db) => {
      db.categories.find((c) => c.id === 'cat_reg')!.saleStart = new Date(Date.now() + 86_400_000).toISOString()
    })
    asVisitor('u_dodi')
    const r = await api.createHold(SESSION, { categoryId: 'cat_reg', seatIds: [seatId('J8')] })
    expect(r).toMatchObject({ ok: false, reason: 'RULE' })
    expect(r.ok ? '' : r.message).toMatch(/^Penjualan Reguler dibuka /)
    expect(readDb()!.sessionSeats.find((x) => x.sessionId === SESSION && x.seatId === seatId('J8'))!.status).toBe('AVAILABLE')
  })

  it('check-in opens N minutes before the start and closes N minutes before the end', () => {
    const w = checkinWindow(session, { checkinOpenMin: 60, checkinCloseMin: 15 } as EventRules)
    expect(w.open.toISOString()).toBe('2026-11-21T08:00:00.000Z')
    expect(w.close.toISOString()).toBe('2026-11-21T09:45:00.000Z')
  })

  it('an expired hold reads as Tersedia, a running one as Sedang dipesan (PRD §8 layer 2)', () => {
    const now = new Date('2026-11-21T08:00:00Z')
    expect(effectiveSeatStatus({ status: 'HELD', holdExpiresAt: '2026-11-21T07:59:59Z' }, now)).toBe('AVAILABLE')
    expect(effectiveSeatStatus({ status: 'HELD', holdExpiresAt: '2026-11-21T08:05:00Z' }, now)).toBe('HELD')
    expect(effectiveSeatStatus({ status: 'SOLD', holdExpiresAt: null }, now)).toBe('SOLD')
  })

  it('DM-04: the demo session is always running; other sessions keep their times', () => {
    const now = new Date('2026-11-03T06:07:00Z')
    const demo = resolveSession({ ...session, demoLive: true }, now)
    expect(new Date(demo.startAt) <= now && now < new Date(demo.endAt)).toBe(true)
    expect(resolveSession(session, now)).toBe(session)
  })
})

describe('receipt rules (PRD §9)', () => {
  const rules = { minSpend: 300_000, allowMultiple: false, maxReceiptsCombined: 3, maxReceiptsPerTenantDay: 5, sameDayRequired: true, cutoffTime: '22:00', excludedTenantIds: ['t_bazaar'] }
  const tenants = [
    { id: 't_a', name: 'Toko A', category: 'F&B' },
    { id: 't_bazaar', name: 'Bazaar Atrium', category: 'Bazaar' },
  ]
  const now = new Date()
  const today = wibDate(now)
  const base = { tenantId: 't_a', receiptNo: 'INV1', amount: 350_000, receiptDate: today, receiptTime: '10:00', photoHash: 'h1' }

  it('passes a valid single receipt', () => {
    const { checks } = checkReceiptRules([base], { rules, tenants, existing: [], orderId: 'o1', now })
    expect(checks.every((c) => c.ok)).toBe(true)
    expect(checks.find((c) => c.rule === 'R3')!.message).toContain('Rp350.000')
  })

  it('explains how to fix each failure', () => {
    const { checks } = checkReceiptRules(
      [
        { ...base, tenantId: 't_bazaar', amount: 100_000, receiptDate: '2026-10-31', receiptNo: 'X' },
      ],
      { rules, tenants, existing: [], orderId: 'o1', now },
    )
    expect(checks.find((c) => c.rule === 'R1')!.ok).toBe(false)
    expect(checks.find((c) => c.rule === 'R2')!.message).toMatch(/hanya menerima struk hari ini/)
    expect(checks.find((c) => c.rule === 'R3')!.message).toMatch(/Kurang/)
  })

  it('R6 rejects a receipt already used in another order', () => {
    const existing = [{ ...base, id: 'r', userId: 'u', orderId: 'other', photoUrl: '', status: 'APPROVED' as const, reason: null, reviewedBy: null, reviewedAt: null, possibleDuplicate: false, createdAt: now.toISOString() }]
    const { checks } = checkReceiptRules([base], { rules, tenants, existing, orderId: 'o1', now })
    expect(checks.find((c) => c.rule === 'R6')!.ok).toBe(false)
  })

  it('R4 caps the number of combined receipts', () => {
    const many = [1, 2, 3, 4].map((i) => ({ ...base, receiptNo: `N${i}`, amount: 100_000 }))
    const { checks } = checkReceiptRules(many, { rules, tenants, existing: [], orderId: 'o1', now })
    expect(checks.find((c) => c.rule === 'R4')!.ok).toBe(false)
  })
})

describe('demo seed', () => {
  it.each([
    ['late evening', '2026-11-02T16:40:00Z'], // 23.40 WIB, after the 22.00 receipt cutoff
    ['just after midnight', '2026-11-02T17:10:00Z'], // 00.10 WIB
    ['afternoon', '2026-11-02T07:00:00Z'], // 14.00 WIB
  ])('pending sample receipts pass the rules (%s)', async (_label, iso) => {
    const now = new Date(iso)
    const db = await buildSeed(now)
    const order = db.orders.find((o) => o.userId === 'u_rina' && o.status === 'AWAITING_VERIFICATION')!
    const category = db.categories.find((c) => c.id === order.categoryId)!
    const receipts = db.receipts.filter((r) => r.orderId === order.id)
    const { checks } = checkReceiptRules(receipts, { rules: category.receiptRules!, tenants: db.tenants, existing: db.receipts, orderId: order.id, now })
    expect(checks.filter((c) => !c.ok)).toEqual([])
  })
})

describe('seat suggestions', () => {
  const layout: SeatLayout = { id: 'L', venueId: 'v', name: 'L', rows: 3, seatsPerRow: 8, aisleAfter: 4 }
  const seats = buildSeats(layout)
  const views = seats.map((seat) => ({ seat, status: 'AVAILABLE' as const, categoryId: 'c' }))

  it('picks adjacent seats in the front row, near the centre, never across the aisle', () => {
    const r = suggestSeats(views, 'c', 4, layout)
    expect(r.adjacent).toBe(true)
    const labels = r.seatIds.map((id) => id.split(':')[1])
    expect(labels.every((l) => l.startsWith('A'))).toBe(true)
    const nums = labels.map((l) => Number(l.slice(1)))
    expect(nums.every((n) => n <= 4) || nums.every((n) => n >= 5)).toBe(true)
  })
})

describe('order changes and waiting list (PV-12, PV-13, PV-14)', () => {
  async function confirmedOrder(user: string, seats: string[]) {
    asVisitor(user)
    const r = await api.createHold(SESSION, { categoryId: 'cat_reg', seatIds: seats.map(seatId) })
    if (!r.ok) throw new Error(r.message)
    await api.simulatePayment(r.order.id, { method: 'SIM_QRIS', outcome: 'SUCCESS', idempotencyKey: `k-${user}` })
    return r.order.id
  }

  it('PV-12: a paid order cancelled ≥24 h ahead frees the seats, voids tickets and records the refund', async () => {
    const id = await confirmedOrder('u_sari', ['J2', 'J3'])
    const o = await api.cancelOrder(id)
    expect(o.status).toBe('CANCELLED')
    expect(o.refundAmount).toBe(100_000)
    const db = readDb()!
    expect(db.tickets.filter((t) => t.orderId === id).every((t) => t.status === 'CANCELLED')).toBe(true)
    expect(db.sessionSeats.filter((s) => [seatId('J2'), seatId('J3')].includes(s.seatId) && s.sessionId === SESSION).every((s) => s.status === 'AVAILABLE')).toBe(true)
    expect(db.notifications.some((n) => n.orderId === id && n.scheduledFor)).toBe(false)
  })

  it('PV-12: no cancelling once a ticket was scanned or during a running session', async () => {
    asVisitor('u_rina')
    const rina = readDb()!.orders.find((o) => o.userId === 'u_rina' && o.sessionId === DEMO && o.status === 'CONFIRMED')!
    await expect(api.cancelOrder(rina.id)).rejects.toThrow(/berlangsung/)
    const id = await confirmedOrder('u_dodi', ['J4'])
    await transaction((db) => {
      for (const t of db.tickets) if (t.orderId === id) t.status = 'USED'
    })
    await expect(api.cancelOrder(id)).rejects.toThrow(/check-in/)
  })

  it('PV-13: attendee names can change, except on a ticket that was already scanned', async () => {
    const id = await confirmedOrder('u_galih', ['J6', 'J7'])
    const order = readDb()!.orders.find((o) => o.id === id)!
    await api.updateAttendees(id, [{ itemId: order.items[1].id, name: 'Kirana' }])
    expect(readDb()!.tickets.find((t) => t.orderItemId === order.items[1].id)!.attendeeName).toBe('Kirana')
    await transaction((db) => {
      db.tickets.find((t) => t.orderItemId === order.items[0].id)!.status = 'USED'
    })
    await expect(api.updateAttendees(id, [{ itemId: order.items[0].id, name: 'Orang lain' }])).rejects.toThrow(/check-in/)
  })

  it('PV-14: join only when sold out; a freed place messages the first person whose group fits', async () => {
    const CRAFT = 'ses_cr_1'
    asVisitor('u_rudi')
    await expect(api.joinWaitlist('ses_cr_2', 'cat_kelas', 2)).rejects.toThrow(/Pesan langsung/)
    const mine = await api.joinWaitlist(CRAFT, 'cat_kelas', 1)
    expect(mine.position).toBe(3) // two seeded people are ahead
    const map = await api.getSeatMap(CRAFT)
    expect(map.waitlist.find((w) => w.categoryId === 'cat_kelas')!.waiting).toBe(3)
    // an admin cancels Asep's 4 places → Yudi (2) and Intan (1) get a message, Rudi too (1) as 4 places freed
    asVisitor('u_asep')
    const asep = readDb()!.orders.find((o) => o.userId === 'u_asep' && o.sessionId === CRAFT)!
    await api.admin.cancelOrder(asep.id)
    const db = readDb()!
    const notified = db.waitlist.filter((w) => w.sessionId === CRAFT && w.status === 'NOTIFIED').map((w) => w.userId).sort()
    expect(notified).toEqual(['u_intan', 'u_rudi', 'u_yudi'])
    expect(db.notifications.filter((n) => n.kind === 'WAITLIST')).toHaveLength(3)
  })

  it('PV-14: guests must log in first', async () => {
    clearClientSessions()
    await expect(api.joinWaitlist('ses_cr_1', 'cat_kelas', 1)).rejects.toThrow(/Masuk dulu/)
  })
})

describe('bonus, staff accounts, desk review, OCR (AD-12, AD-13, PT-06, PV-16)', () => {
  it('AD-12: the first N tickets per session earn the bonus, then it runs out', async () => {
    await transaction((db) => {
      db.categories.find((c) => c.id === 'cat_vip')!.bonusFirstN = 3 // Sesi 2 already has 2 bonus tickets (seed)
    })
    const before = await api.getEvent('pentas-musikal-sangkuriang')
    expect(before.sessions.find((s) => s.id === SESSION)!.availability.find((a) => a.categoryId === 'cat_vip')!.bonusLeft).toBe(1)
    asVisitor('u_asep')
    const r = await api.createHold(SESSION, { categoryId: 'cat_vip', seatIds: [seatId('A1'), seatId('A2')] })
    if (!r.ok) throw new Error(r.message)
    await api.simulatePayment(r.order.id, { method: 'SIM_QRIS', outcome: 'SUCCESS', idempotencyKey: 'k-bonus' })
    const tickets = readDb()!.tickets.filter((t) => t.orderId === r.order.id)
    expect(tickets.filter((t) => t.bonus)).toHaveLength(1)
    const map = await api.getSeatMap(SESSION)
    expect(map.bonus.find((b) => b.categoryId === 'cat_vip')!.left).toBe(0)
  })

  it('AD-13: the panitia adds a staff account; a switched-off account cannot scan', async () => {
    const u = await api.admin.createStaff({ name: 'Petugas Uji', phone: '0812 9999 0101', email: 'Uji@Contoh.id' })
    expect(u.email).toBe('uji@contoh.id')
    await expect(api.admin.createStaff({ name: 'Dobel', phone: '081299990101', email: 'lain@contoh.id' })).rejects.toThrow(/sudah dipakai/)
    await expect(api.admin.createStaff({ name: 'Dobel', phone: '081299990102', email: 'uji@contoh.id' })).rejects.toThrow(/sudah dipakai/)
    await api.demoLogin('STAFF', u.id)
    const t = readDb()!.tickets.find((x) => x.sessionId === DEMO && x.status === 'ACTIVE')!
    const ok = await api.staff.checkin(t.qrToken, DEMO)
    expect(ok.result).toBe('VALID')
    expect((await api.admin.listStaff()).find((s) => s.id === u.id)!.scans).toBe(1)
    await api.admin.setStaffActive(u.id, false)
    const t2 = readDb()!.tickets.find((x) => x.sessionId === DEMO && x.status === 'ACTIVE')!
    await expect(api.staff.checkin(t2.qrToken, DEMO)).rejects.toThrow(/dinonaktifkan/)
    await expect(api.demoLogin('STAFF', u.id)).rejects.toThrow(/dinonaktifkan/)
  })

  it('PT-06: a desk decision is recorded under the staff member', async () => {
    await api.demoLogin('STAFF')
    const queue = await api.staff.listReceipts('evt_sangkuriang')
    const rina = queue.find((q) => q.order.userId === 'u_rina')!
    await api.staff.reviewReceipt(rina.receipt.id, 'APPROVE')
    const db = readDb()!
    expect(db.orders.find((o) => o.id === rina.order.id)!.status).toBe('CONFIRMED')
    expect(db.receipts.find((r) => r.id === rina.receipt.id)!.reviewedBy).toBe('u_staff')
  })

  it('PV-16: OCR text of a receipt becomes form fields', () => {
    const db = readDb()!
    const text = `TOKO MAINAN CERIA\nSummarecon Mall Bandung (contoh)\nNo. Struk : INV713128\nTanggal : 02/11/2026\nJam : 21:40\n----------\nPuzzle kayu Rp100.000\nMobil remote Rp60.000\nLilin mainan Rp40.000\nTOTAL Rp200.000\nHatur nuhun!`
    expect(parseReceiptText(text, db.tenants)).toEqual({ tenantId: 't_mainan', receiptNo: 'INV713128', amount: 200_000, receiptDate: '2026-11-02', receiptTime: '21:40' })
    expect(parseReceiptText('SUBTOTAL 50.000\nGrand total: 75.000', db.tenants).amount).toBe(75_000)
    expect(parseReceiptText('foto buram', db.tenants)).toEqual({})
  })
})

describe('profile (PV-06)', () => {
  it('tidies the name and the email, and an empty email clears it', () => {
    expect(profileChanges({ name: '  Rina   Kartika ', email: ' Rina@Contoh.ID ' })).toEqual({ ok: true, name: 'Rina Kartika', email: 'rina@contoh.id' })
    expect(profileChanges({ email: '' })).toEqual({ ok: true, email: null })
    expect(profileChanges({})).toEqual({ ok: true })
  })

  it('refuses a name that is too short or too long, and an email without a domain', () => {
    expect(profileChanges({ name: ' R ' })).toMatchObject({ ok: false, field: 'name' })
    expect(profileChanges({ name: 'x'.repeat(61) })).toMatchObject({ ok: false, field: 'name' })
    expect(profileChanges({ email: 'rina@contoh' })).toMatchObject({ ok: false, field: 'email' })
  })

  it('takes a photo as an image data URL of at most 300 KB, and null removes it', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo='
    expect(profileChanges({ avatar: png })).toEqual({ ok: true, avatar: png })
    expect(profileChanges({ avatar: null })).toEqual({ ok: true, avatar: null })
    expect(profileChanges({ avatar: 'data:text/html;base64,PGgxPg==' })).toMatchObject({ ok: false, field: 'avatar' })
    expect(profileChanges({ avatar: `data:image/jpeg;base64,${'A'.repeat(AVATAR_MAX)}` })).toMatchObject({ ok: false, field: 'avatar' })
  })

  it('saves for the signed-in visitor only, and never gives two accounts one email', async () => {
    await expect(api.updateProfile({ name: 'Tamu' })).rejects.toMatchObject({ code: 'NEED_LOGIN' })
    asVisitor(PERSONA_ID)
    const user = await api.updateProfile({ name: 'Rina K', email: 'Rina@Contoh.id' })
    expect(user).toMatchObject({ name: 'Rina K', email: 'rina@contoh.id', phone: '081234567890' })
    expect(api.currentUser('VISITOR')).toMatchObject({ name: 'Rina K', email: 'rina@contoh.id' })
    // the demo petugas account already uses this email
    await expect(api.updateProfile({ email: 'desk.atrium@summarevent.test' })).rejects.toMatchObject({ code: 'DUPLICATE' })
    await expect(api.updateProfile({ email: 'bukan-email' })).rejects.toMatchObject({ code: 'INVALID' })
    expect(api.currentUser('VISITOR')?.email).toBe('rina@contoh.id')
    const photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=='
    expect(await api.updateProfile({ avatar: photo })).toMatchObject({ avatarUrl: photo, name: 'Rina K' })
    expect((await api.updateProfile({ avatar: null })).avatarUrl).toBeNull()
  })
})

describe('panitia and petugas sign-in (email + kata sandi)', () => {
  it('signs in with the demo password, refuses a wrong pair with one message, and locks after too many tries', async () => {
    const u = await api.login('Panitia@Summarevent.test', DEMO_PASSWORD, 'ADMIN')
    expect(u.id).toBe('u_admin')
    expect(api.currentUser('ADMIN')?.id).toBe('u_admin')
    api.logout('ADMIN')
    await expect(api.login('panitia@summarevent.test', 'salah', 'ADMIN')).rejects.toMatchObject({ code: 'BAD_LOGIN' })
    await expect(api.login('tidak-ada@summarevent.test', DEMO_PASSWORD, 'ADMIN')).rejects.toMatchObject({ code: 'BAD_LOGIN' })
    // the petugas password does not open the panitia side
    await expect(api.login('desk.atrium@summarevent.test', DEMO_PASSWORD, 'ADMIN')).rejects.toMatchObject({ code: 'BAD_LOGIN' })
    for (let i = 1; i < LOGIN_MAX_FAILS; i++) await expect(api.login('panitia@summarevent.test', 'salah', 'ADMIN')).rejects.toMatchObject({ code: 'BAD_LOGIN' })
    await expect(api.login('panitia@summarevent.test', DEMO_PASSWORD, 'ADMIN')).rejects.toMatchObject({ code: 'RATE_LIMIT' })
  })

  it('a switched-off petugas cannot sign in', async () => {
    await api.demoLogin('ADMIN')
    await api.admin.setStaffActive('u_staff_utara', false)
    await expect(api.login('pintu.utara@summarevent.test', DEMO_PASSWORD, 'STAFF')).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('forgot + reset: same answer for any email, a one-time link that sets the password and signs in', async () => {
    expect(await api.forgotPassword('bukan-siapa@contoh.id')).toEqual({ ok: true })
    const r = await api.forgotPassword('Pintu.Utara@summarevent.test')
    expect(r.simulatedLink).toMatch(/\/reset\?token=/)
    const token = new URL(r.simulatedLink!, 'http://localhost').searchParams.get('token')!
    expect(passwordCheck('pendek')).toMatchObject({ ok: false })
    await expect(api.resetPassword(token, 'pendek')).rejects.toMatchObject({ code: 'INVALID' })
    const u = await api.resetPassword(token, 'sandi-baru-utara')
    expect(u.id).toBe('u_staff_utara')
    expect(api.currentUser('STAFF')?.id).toBe('u_staff_utara')
    api.logout('STAFF')
    await expect(api.resetPassword(token, 'sandi-baru-utara')).rejects.toMatchObject({ code: 'RESET_EXPIRED' })
    await expect(api.login('pintu.utara@summarevent.test', DEMO_PASSWORD, 'STAFF')).rejects.toMatchObject({ code: 'BAD_LOGIN' })
    expect((await api.login('pintu.utara@summarevent.test', 'sandi-baru-utara', 'STAFF')).id).toBe('u_staff_utara')
  })
})
