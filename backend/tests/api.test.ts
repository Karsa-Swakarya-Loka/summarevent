/** End-to-end through the rpc layer with convex-test: the same paths http.ts calls, against a fresh seeded database. */
import { convexTest } from 'convex-test'
import { beforeEach, describe, expect, it } from 'vitest'
import { internal } from '../convex/_generated/api'
import schema from '../convex/schema'

const modules = import.meta.glob('../convex/**/*.*s')

type T = ReturnType<typeof convexTest>
let t: T

const req = (over: { token?: string | null; guestId?: string; params?: Record<string, string>; query?: Record<string, string>; body?: unknown } = {}) => ({
  auth: { token: over.token ?? null, guestId: over.guestId ?? 'guest_unittest1' },
  params: over.params ?? {},
  query: over.query ?? {},
  body: over.body ?? null,
})
const write = async (op: string, r: ReturnType<typeof req>) => JSON.parse(await t.mutation(internal.rpc.write, { op, req: r }))
const read = async (op: string, r: ReturnType<typeof req>) => JSON.parse(await t.query(internal.rpc.read, { op, req: r }))
const code = (p: Promise<unknown>) => p.then(() => 'OK', (e: { data?: { code?: string } }) => e.data?.code ?? String(e))

beforeEach(async () => {
  t = convexTest(schema, modules)
  await t.mutation(internal.rpc.reset, {})
})

describe('holds and payment (PRD §8)', () => {
  it('holds all seats or none, then a paid order gets one ticket per seat', async () => {
    const seats = ['lay_ciunik:J12', 'lay_ciunik:J13']
    const a = await write('createHold', req({ guestId: 'guest_aaaa', params: { id: 'ses_sk_16' }, body: { categoryId: 'cat_reg', seatIds: seats } }))
    expect(a.ok).toBe(true)
    const b = await write('createHold', req({ guestId: 'guest_bbbb', params: { id: 'ses_sk_16' }, body: { categoryId: 'cat_reg', seatIds: ['lay_ciunik:J13', 'lay_ciunik:J14'] } }))
    expect(b).toMatchObject({ ok: false, reason: 'CONFLICT', conflictSeatIds: ['lay_ciunik:J13'] })
    const map = await read('getSeatMap', req({ guestId: 'guest_bbbb', params: { id: 'ses_sk_16' } }))
    expect(map.sessionSeats.find((s: { seatId: string }) => s.seatId === 'lay_ciunik:J14').status).toBe('AVAILABLE')
    // internal fields never leave the backend
    expect(JSON.stringify(map)).not.toMatch(/"updatedAt"|"pending"/)

    const pay = { method: 'SIM_QRIS', outcome: 'SUCCESS', idempotencyKey: 'k1' }
    const p1 = await write('simulatePayment', req({ guestId: 'guest_aaaa', params: { id: a.order.id }, body: pay }))
    const p2 = await write('simulatePayment', req({ guestId: 'guest_aaaa', params: { id: a.order.id }, body: pay }))
    expect([p1.paymentStatus, p2.paymentStatus]).toEqual(['SUCCESS', 'SUCCESS'])
    const detail = await read('getOrder', req({ guestId: 'guest_aaaa', params: { id: a.order.id } }))
    expect(detail.order.status).toBe('CONFIRMED')
    expect(detail.tickets).toHaveLength(2)
    expect(detail.tickets[0].qrToken).toMatch(/^SEV1\.tkt_\w+\.1\.[\w-]{22}$/)
    // another browser cannot read it
    expect(await code(read('getOrder', req({ guestId: 'guest_bbbb', params: { id: a.order.id } })))).toBe('NOT_FOUND')
  })

  it('a guest hold is claimed by the account at OTP verify', async () => {
    const hold = await write('createHold', req({ guestId: 'guest_claim1', params: { id: 'ses_sk_16' }, body: { categoryId: 'cat_reg', seatIds: ['lay_ciunik:J1'] } }))
    const { simulatedCode } = await write('requestOtp', req({ body: { phone: '0812 9999 0001' } }))
    expect(await write('verifyOtp', req({ guestId: 'guest_claim1', body: { phone: '081299990001', code: simulatedCode } }))).toMatchObject({ needName: true })
    const login = await write('verifyOtp', req({ guestId: 'guest_claim1', body: { phone: '081299990001', code: simulatedCode, name: 'Tamu Baru' } }))
    expect(login).toMatchObject({ isNew: true, user: { name: 'Tamu Baru', role: 'VISITOR' } })
    const mine = await read('myOrders', req({ token: login.token, guestId: 'guest_other' }))
    expect(mine.map((d: { order: { id: string } }) => d.order.id)).toContain(hold.order.id)
    expect(mine[0].order.buyerName).toBe('Tamu Baru')
  })
})

describe('check-in', () => {
  it('VALID once, then ALREADY_USED; a forged QR is INVALID; admin pages need the admin token', async () => {
    const rina = await write('demoLogin', req({ body: { role: 'VISITOR' } }))
    const pass = await read('myTickets', req({ token: rina.token }))
    const ticket = pass.find((p: { session: { demoLive?: boolean }; ticket: { status: string } }) => p.session.demoLive && p.ticket.status === 'ACTIVE').ticket
    const gate = await write('demoLogin', req({ body: { role: 'STAFF' } }))
    const scan = (qr: string) => write('staff.checkin', req({ token: gate.token, body: { qr_token: qr, session_id: 'ses_sk_demo' } }))
    expect((await scan(ticket.qrToken)).result).toBe('VALID')
    expect((await scan(ticket.qrToken)).result).toBe('ALREADY_USED')
    expect((await scan(ticket.qrToken.slice(0, -2) + 'xx')).result).toBe('INVALID')
    expect(await code(read('admin.listOrders', req({ token: gate.token })))).toBe('NEED_LOGIN')
    expect(await code(write('staff.checkin', req({ token: rina.token, body: { qr_token: ticket.qrToken, session_id: 'ses_sk_demo' } })))).toBe('NEED_LOGIN')
  })
})

describe('profile (PV-06)', () => {
  it('tidies name and email, refuses a taken email, and needs a login', async () => {
    expect(await code(read('checkProfile', req({ body: { name: 'Tamu' } })))).toBe('NEED_LOGIN')
    const rina = await write('demoLogin', req({ body: { role: 'VISITOR' } }))
    const user = JSON.parse(await t.mutation(internal.rpc.updateProfile, { req: req({ token: rina.token, body: { name: '  Rina   K ', email: 'Rina@Contoh.ID' } }) }))
    expect(user).toMatchObject({ name: 'Rina K', email: 'rina@contoh.id', phone: '081234567890' })
    // the demo petugas account already uses this email (seeded like the frontend's sample data)
    expect(await code(read('checkProfile', req({ token: rina.token, body: { email: 'desk.atrium@summarevent.test' } })))).toBe('DUPLICATE')
    expect(await code(read('checkProfile', req({ token: rina.token, body: { avatar: 'data:text/html;base64,PGgxPg==' } })))).toBe('INVALID')
  })
})

describe('waiting list (PV-14)', () => {
  it('a cancelled order tells the first person in line whose group fits', async () => {
    const admin = await write('demoLogin', req({ body: { role: 'ADMIN' } }))
    const rows = await read('admin.listOrders', req({ token: admin.token, query: { eventId: 'evt_craft', status: 'CONFIRMED' } }))
    const full = rows.find((r: { session: { id: string } }) => r.session.id === 'ses_cr_1')
    await write('admin.patchOrder', req({ token: admin.token, params: { id: full.order.id }, body: { action: 'CANCEL' } }))
    const yudi = await write('demoLogin', req({ body: { role: 'VISITOR', user_id: 'u_yudi' } }))
    const inbox = await read('myNotifications', req({ token: yudi.token }))
    expect(inbox.some((n: { kind: string }) => n.kind === 'WAITLIST')).toBe(true)
  })
})
