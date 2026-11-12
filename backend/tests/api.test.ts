/** End-to-end through the rpc layer with convex-test: the same paths http.ts calls, against a fresh seeded database. */
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
/** A refused write that keeps its writes comes back as `{ __refused: { code } }` (rpc.ts REFUSED). */
const refused = (out: { __refused?: { code: string } }) => out.__refused?.code ?? 'OK'
/** Sign a visitor in with the on-screen (demo) OTP. */
const otpLogin = async (phone: string, guestId = 'guest_unittest1') => {
  const { simulatedCode } = await write('requestOtp', req({ guestId, body: { phone } }))
  return write('verifyOtp', req({ guestId, body: { phone, code: simulatedCode } }))
}

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

describe('ticket limit per account per session', () => {
  it('counts every order of the account in the session, and is checked again when a claimed guest order is paid', async () => {
    const galih = await otpLogin('081200000017', 'guest_galih1')
    const as = { token: galih.token, guestId: 'guest_galih1', params: { id: 'ses_sk_16' } }
    const first = await write('createHold', req({ ...as, body: { categoryId: 'cat_reg', seatIds: ['lay_ciunik:J2', 'lay_ciunik:J3', 'lay_ciunik:J4'] } }))
    expect(first.ok).toBe(true)
    const paid = await write('simulatePayment', req({ ...as, params: { id: first.order.id }, body: { method: 'SIM_QRIS', outcome: 'SUCCESS', idempotencyKey: 'k-limit1' } }))
    expect(paid.paymentStatus).toBe('SUCCESS')
    // a second order in any category of the session counts the first one
    const two = await write('createHold', req({ ...as, body: { categoryId: 'cat_reg', seatIds: ['lay_ciunik:J6', 'lay_ciunik:J7'] } }))
    expect(two).toMatchObject({ ok: false, reason: 'RULE', message: expect.stringMatching(/tinggal 1 lagi/) })
    expect(await write('createHold', req({ ...as, body: { categoryId: 'cat_fest', qty: 2 } }))).toMatchObject({ ok: false, reason: 'RULE' })

    // a guest in another browser holds two seats, then signs in as Galih: the claimed order is refused at payment
    const guest = await write('createHold', req({ guestId: 'guest_galih2', params: { id: 'ses_sk_16' }, body: { categoryId: 'cat_reg', seatIds: ['lay_ciunik:J9', 'lay_ciunik:J10'] } }))
    expect(guest.ok).toBe(true)
    const again = await otpLogin('081200000017', 'guest_galih2')
    const pay = write('simulatePayment', req({ token: again.token, guestId: 'guest_galih2', params: { id: guest.order.id }, body: { method: 'SIM_QRIS', outcome: 'SUCCESS', idempotencyKey: 'k-limit2' } }))
    expect(await code(pay)).toBe('RULE')
    const detail = await read('getOrder', req({ token: again.token, guestId: 'guest_galih2', params: { id: guest.order.id } }))
    expect(detail.order.status).toBe('AWAITING_PAYMENT')
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
    // another visitor's email is taken; a petugas address is not reported, so it cannot be discovered from here
    const yudi = await otpLogin('081200000015', 'guest_yudi1')
    await t.mutation(internal.rpc.updateProfile, { req: req({ token: yudi.token, guestId: 'guest_yudi1', body: { email: 'yudi@contoh.id' } }) })
    expect(await code(read('checkProfile', req({ token: rina.token, body: { email: 'yudi@contoh.id' } })))).toBe('DUPLICATE')
    expect(await code(read('checkProfile', req({ token: rina.token, body: { email: 'desk.atrium@summarevent.test' } })))).toBe('OK')
    expect(await code(read('checkProfile', req({ token: rina.token, body: { avatar: 'data:text/html;base64,PGgxPg==' } })))).toBe('INVALID')
  })
})

describe('waiting list (PV-14)', () => {
  it('a cancelled order tells the first person in line whose group fits', async () => {
    const admin = await write('demoLogin', req({ body: { role: 'ADMIN' } }))
    const rows = await read('admin.listOrders', req({ token: admin.token, query: { eventId: 'evt_craft', status: 'CONFIRMED' } }))
    const full = rows.find((r: { session: { id: string } }) => r.session.id === 'ses_cr_1')
    await write('admin.patchOrder', req({ token: admin.token, params: { id: full.order.id }, body: { action: 'CANCEL' } }))
    const yudi = await otpLogin('081200000015')
    const inbox = await read('myNotifications', req({ token: yudi.token }))
    expect(inbox.some((n: { kind: string }) => n.kind === 'WAITLIST')).toBe(true)
  })
})

describe('panitia and petugas sign-in (email + kata sandi)', () => {
  const login = (email: string, password: string, role = 'ADMIN') => write('login', req({ body: { email, password, role } }))
  const refused = (out: Record<string, { code: string }>) => out.__refused?.code
  const lastEmail = () => t.run(async (ctx) => (await ctx.db.query('emails').order('desc').first())!)
  const tokenIn = (text: string) => /\/reset\?token=([\w-]+)/.exec(text)![1]

  it('signs in with the demo password, refuses a wrong one, and rate-limits after 5 tries', async () => {
    const ok = await login(' Panitia@Summarevent.test ', 'summaba2026')
    expect(ok.user).toMatchObject({ id: 'u_admin', role: 'ADMIN' })
    expect(await read('admin.listStaff', req({ token: ok.token }))).toBeInstanceOf(Array)
    // the password hash never leaves the server, and the role has to match
    expect(JSON.stringify(ok)).not.toMatch(/pbkdf2/)
    expect(refused(await login('panitia@summarevent.test', 'summaba2026', 'STAFF'))).toBe('BAD_LOGIN')
    expect(refused(await login('siapa@contoh.id', 'summaba2026'))).toBe('BAD_LOGIN')
    for (let i = 0; i < 5; i++) expect(refused(await login('panitia@summarevent.test', 'salah123'))).toBe('BAD_LOGIN')
    // the failures were kept even though each answer was an error, so the right password now waits too
    expect(refused(await login('panitia@summarevent.test', 'summaba2026'))).toBe('RATE_LIMIT')
  })

  it('an inactive petugas cannot sign in', async () => {
    const adm = await login('panitia@summarevent.test', 'summaba2026')
    await write('admin.setStaffActive', req({ token: adm.token, params: { id: 'u_staff_utara' }, body: { active: false } }))
    expect(await code(login('pintu.utara@summarevent.test', 'summaba2026', 'STAFF'))).toBe('FORBIDDEN')
  })

  it('forgot → one-time link → new password signs in and ends other sessions', async () => {
    const before = await login('panitia@summarevent.test', 'summaba2026')
    expect(await write('forgotPassword', req({ body: { email: 'tidak.ada@contoh.id' } }))).toEqual({ ok: true })
    expect(await t.run((ctx) => ctx.db.query('emails').collect())).toHaveLength(0)
    expect(await write('forgotPassword', req({ body: { email: 'panitia@summarevent.test' } }))).toEqual({ ok: true })
    const email = await lastEmail()
    expect(email).toMatchObject({ to: 'panitia@summarevent.test', status: 'QUEUED' })
    const token = tokenIn(email.text)
    // the raw token is only in the email
    expect(JSON.stringify(await t.run((ctx) => ctx.db.query('resetTokens').collect()))).not.toContain(token)

    expect(await code(write('resetPassword', req({ body: { token, password: 'pendek' } })))).toBe('INVALID')
    const done = await write('resetPassword', req({ body: { token, password: 'sandi-baru-panitia' } }))
    expect(done.user.id).toBe('u_admin')
    expect(await code(read('admin.listStaff', req({ token: before.token })))).toBe('NEED_LOGIN')
    expect(await code(read('admin.listStaff', req({ token: done.token })))).toBe('OK')
    expect(await code(write('resetPassword', req({ body: { token, password: 'sandi-lain-lagi' } })))).toBe('RESET_EXPIRED')
    expect(refused(await login('panitia@summarevent.test', 'summaba2026'))).toBe('BAD_LOGIN')
    expect((await login('panitia@summarevent.test', 'sandi-baru-panitia')).user.id).toBe('u_admin')
  })

  it('a new petugas needs an email and gets an invitation to set a password', async () => {
    const adm = await login('panitia@summarevent.test', 'summaba2026')
    const add = (body: object) => write('admin.createStaff', req({ token: adm.token, body }))
    expect(await code(add({ name: 'Petugas Baru', phone: '081277770001' }))).toBe('INVALID')
    expect(await code(add({ name: 'Petugas Baru', phone: '081277770001', email: 'desk.atrium@summarevent.test' }))).toBe('DUPLICATE')
    const u = await add({ name: 'Petugas Baru', phone: '081277770001', email: 'Baru@Contoh.id' })
    expect(u).toMatchObject({ role: 'STAFF', email: 'baru@contoh.id' })
    const invite = await lastEmail()
    expect(invite.to).toBe('baru@contoh.id')
    const r = await write('resetPassword', req({ body: { token: tokenIn(invite.text), password: 'sandi-petugas-baru' } }))
    expect(r.user).toMatchObject({ id: u.id, role: 'STAFF' })
    expect((await login('baru@contoh.id', 'sandi-petugas-baru', 'STAFF')).user.id).toBe(u.id)
  })

  it('sends queued email through Resend once, keyed by the email id', async () => {
    await write('forgotPassword', req({ body: { email: 'desk.atrium@summarevent.test' } }))
    const email = await lastEmail()
    await t.action(internal.mail.send, { id: email._id })
    expect((await lastEmail()).status).toBe('SKIPPED') // no RESEND_API_KEY in tests

    await t.run((ctx) => ctx.db.patch(email._id, { status: 'QUEUED' }))
    process.env.RESEND_API_KEY = 're_test'
    const calls: Array<{ url: string; init: RequestInit }> = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({ id: 'resend_1' }), { status: 200 })
    }) as typeof fetch
    try {
      await t.action(internal.mail.send, { id: email._id })
      await t.action(internal.mail.send, { id: email._id })
    } finally {
      globalThis.fetch = realFetch
      delete process.env.RESEND_API_KEY
    }
    expect(calls).toHaveLength(1)
    expect((calls[0].init.headers as Record<string, string>)['Idempotency-Key']).toBe(email._id)
    expect(await lastEmail()).toMatchObject({ status: 'SENT', providerId: 'resend_1' })
  })
})

describe('curved rows', () => {
  it('keeps a curved layout through save and edit, and the seats follow the curve', async () => {
    const adm = await write('demoLogin', req({ body: { role: 'ADMIN' } }))
    const { draft } = await read('admin.getEventDraft', req({ token: adm.token, params: { id: 'evt_sangkuriang' } }))
    const { sessions: _s, ...rest } = draft
    const body = { ...rest, title: 'Denah Lengkung', layout: { ...draft.layout, curved: true }, sessions: [{ startAt: '2026-12-01T06:00:00.000Z', endAt: '2026-12-01T07:00:00.000Z' }] }
    const created = await write('admin.createEvent', req({ token: adm.token, body }))
    const again = await read('admin.getEventDraft', req({ token: adm.token, params: { id: created.id ?? created.event?.id } }))
    expect(again.draft.layout.curved).toBe(true)
    const map = await read('getSeatMap', req({ params: { id: again.draft.sessions[0].id } }))
    const a1 = map.seats.find((x: { row: string; number: number }) => x.row === 'A' && x.number === 1)
    const mid = map.seats.find((x: { row: string; number: number }) => x.row === 'A' && x.number === Math.ceil(again.draft.layout.seatsPerRow / 2))
    expect(a1.y).toBe(0)
    expect(mid.y).toBeGreaterThan(0)
  })
})

describe('poster colours (AD-01)', () => {
  it('keeps a valid palette, rejects a broken one, and null clears it', async () => {
    const adm = await write('demoLogin', req({ body: { role: 'ADMIN' } }))
    const { draft } = await read('admin.getEventDraft', req({ token: adm.token, params: { id: 'evt_akustik' } }))
    expect(draft.posterPalette).toEqual({ bg: '#1c2f5e', accent: '#f9a61b' })
    const save = (posterPalette: unknown) => write('admin.updateEvent', req({ token: adm.token, params: { id: 'evt_akustik' }, body: { ...draft, posterPalette } }))
    expect(await code(save({ bg: '#123', accent: '#ffffff' }))).toBe('INVALID')
    expect((await save({ bg: '#AA0000', accent: '#00ff00' })).posterPalette).toEqual({ bg: '#aa0000', accent: '#00ff00' })
    expect((await save(null)).posterPalette).toBeUndefined()
    const ev = await read('getEvent', req({ params: { slug: 'konser-akustik-sawarga' } })).catch(() => null)
    if (ev) expect(ev.event?.posterPalette).toBeUndefined()
  })
})

describe('poster picture (AD-01)', () => {
  it('keeps a picture through save and edit, refuses a web address or another file, and null clears it', async () => {
    const adm = await write('demoLogin', req({ body: { role: 'ADMIN' } }))
    const { draft } = await read('admin.getEventDraft', req({ token: adm.token, params: { id: 'evt_akustik' } }))
    expect(draft.posterImage).toBeNull()
    const save = (posterImage: unknown) => write('admin.updateEvent', req({ token: adm.token, params: { id: 'evt_akustik' }, body: { ...draft, posterImage } }))
    const jpeg = 'data:image/jpeg;base64,QUJD'
    expect((await save(jpeg)).posterImage).toBe(jpeg)
    const again = await read('admin.getEventDraft', req({ token: adm.token, params: { id: 'evt_akustik' } }))
    expect(again.draft.posterImage).toBe(jpeg)
    expect(await code(save('https://example.com/poster.jpg'))).toBe('INVALID')
    expect(await code(save('data:image/svg+xml;base64,PHN2Zz4='))).toBe('INVALID')
    expect((await save(null)).posterImage).toBeUndefined()
  })

  it('goes out with the event lists, the event page and the draft, never with orders, tickets, receipts or the seat map', async () => {
    const adm = await write('demoLogin', req({ body: { role: 'ADMIN' } }))
    const EVENT = 'evt_sangkuriang'
    const { draft } = await read('admin.getEventDraft', req({ token: adm.token, params: { id: EVENT } }))
    const jpeg = `data:image/jpeg;base64,${'A'.repeat(4000)}`
    expect((await write('admin.updateEvent', req({ token: adm.token, params: { id: EVENT }, body: { ...draft, posterImage: jpeg } }))).posterImage).toBe(jpeg)

    // where the poster is drawn
    expect((await read('listEvents', req())).find((e: { event: { id: string } }) => e.event.id === EVENT).event.posterImage).toBe(jpeg)
    expect((await read('admin.listEvents', req({ token: adm.token }))).find((e: { event: { id: string } }) => e.event.id === EVENT).event.posterImage).toBe(jpeg)
    expect((await read('getEvent', req({ params: { slug: 'pentas-musikal-sangkuriang' } }))).event.posterImage).toBe(jpeg)

    // everything that only names the event
    const rina = await write('demoLogin', req({ body: { role: 'VISITOR' } }))
    const gate = await write('demoLogin', req({ body: { role: 'STAFF' } }))
    const tickets = await read('myTickets', req({ token: rina.token }))
    const live = tickets.find((p: { session: { demoLive?: boolean }; ticket: { status: string } }) => p.session.demoLive && p.ticket.status === 'ACTIVE')
    const orders = await read('admin.listOrders', req({ token: adm.token, query: { eventId: EVENT, status: 'ALL' } }))
    expect(orders.length).toBeGreaterThan(10)
    const rows = {
      orders,
      tickets,
      order: await read('getOrder', req({ token: rina.token, params: { id: live.order.id } })),
      myOrders: await read('myOrders', req({ token: rina.token })),
      waitlist: await read('myWaitlist', req({ token: rina.token })),
      receipts: await read('admin.listReceipts', req({ token: adm.token, query: { status: 'ALL' } })),
      stats: await read('admin.stats', req({ token: adm.token, params: { id: EVENT } })),
      seatMap: await read('getSeatMap', req({ params: { id: 'ses_sk_16' } })),
      manifest: await read('staff.offlineManifest', req({ token: gate.token, params: { id: 'ses_sk_demo' } })),
      search: await read('staff.searchTickets', req({ token: gate.token, query: { q: 'rina', event_id: EVENT } })),
      checkin: await write('staff.checkin', req({ token: gate.token, body: { qr_token: live.ticket.qrToken, session_id: 'ses_sk_demo' } })),
    }
    expect(rows.checkin.event.id).toBe(EVENT)
    for (const [name, body] of Object.entries(rows)) expect(JSON.stringify(body), name).not.toContain('"posterImage"')
  })
})

describe('security', () => {
  const offDemo = () => {
    process.env.DEMO_MODE = 'false'
  }
  afterEach(() => {
    process.env.DEMO_MODE = 'true'
    vi.useRealTimers()
  })

  it('outside the demo: no demo sign-in, no OTP on screen, no simulated payment, no shared password', async () => {
    offDemo()
    await t.mutation(internal.rpc.reset, {})
    expect(await code(write('demoLogin', req({ body: { role: 'ADMIN' } })))).toBe('FORBIDDEN')
    expect(await write('requestOtp', req({ body: { phone: '0812 9999 0002' } }))).not.toHaveProperty('simulatedCode')
    const login = await write('login', req({ body: { email: 'panitia@summarevent.test', password: 'summaba2026', role: 'ADMIN' } }))
    expect(refused(login)).toBe('BAD_LOGIN')
    process.env.DEMO_MODE = 'true'
    const hold = await write('createHold', req({ params: { id: 'ses_sk_16' }, body: { categoryId: 'cat_reg', seatIds: ['lay_ciunik:J10'] } }))
    offDemo()
    const pay = write('simulatePayment', req({ params: { id: hold.order.id }, body: { method: 'SIM_QRIS', outcome: 'SUCCESS', idempotencyKey: 'k-off' } }))
    expect(await code(pay)).toBe('FORBIDDEN')
  })

  it('demo sign-in never opens another visitor’s account', async () => {
    const as = await write('demoLogin', req({ body: { role: 'VISITOR', user_id: 'u_yudi' } }))
    expect(as.user.id).toBe('u_rina')
  })

  it('five wrong OTP guesses burn the code', async () => {
    const phone = '081299990003'
    const { simulatedCode } = await write('requestOtp', req({ body: { phone } }))
    const wrong = simulatedCode === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++) expect(refused(await write('verifyOtp', req({ body: { phone, code: wrong } })))).toBe('BAD_OTP')
    expect(await code(write('verifyOtp', req({ body: { phone, code: simulatedCode, name: 'Coba' } })))).toBe('BAD_OTP')
  })

  it('a sign-in expires, logout ends it, and a switched-off petugas is signed out everywhere', async () => {
    const adm = await write('demoLogin', req({ body: { role: 'ADMIN' } }))
    const gate = await write('demoLogin', req({ body: { role: 'STAFF', user_id: 'u_staff_utara' } }))
    expect(await code(read('staff.listReceipts', req({ token: gate.token })))).toBe('OK')
    await write('admin.setStaffActive', req({ token: adm.token, params: { id: 'u_staff_utara' }, body: { active: false } }))
    expect(await code(read('staff.listReceipts', req({ token: gate.token })))).toBe('NEED_LOGIN')

    expect(await write('logout', req({ token: adm.token }))).toEqual({ ok: true })
    expect(await code(read('admin.listStaff', req({ token: adm.token })))).toBe('NEED_LOGIN')

    const again = await write('demoLogin', req({ body: { role: 'ADMIN' } }))
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 13 * 3_600_000)
    expect(await code(read('admin.listStaff', req({ token: again.token })))).toBe('NEED_LOGIN')
  })

  it('a caller without a guest id cannot hold seats or reach orders', async () => {
    const anon = { auth: { token: null, guestId: null }, params: { id: 'ses_sk_16' }, query: {}, body: { categoryId: 'cat_reg', seatIds: ['lay_ciunik:J11'] } }
    expect(await code(write('createHold', anon))).toBe('BAD_REQUEST')
  })

  it('petugas get tickets without their QR outside the demo, and check one in by its id', async () => {
    const rina = await write('demoLogin', req({ body: { role: 'VISITOR' } }))
    const ticket = (await read('myTickets', req({ token: rina.token }))).find((p: { session: { id: string }; ticket: { status: string } }) => p.session.id === 'ses_sk_demo' && p.ticket.status === 'ACTIVE').ticket
    const gate = await write('demoLogin', req({ body: { role: 'STAFF' } }))
    offDemo()
    const rows = await read('staff.searchTickets', req({ token: gate.token, query: { q: ticket.code } }))
    expect(rows[0].ticket.qrToken).toBe('')
    // a ticket id read by the scanner (or pasted into its QR box) is not a QR
    const pasted = await write('staff.checkin', req({ token: gate.token, body: { qr_token: ticket.id, session_id: 'ses_sk_demo' } }))
    expect(pasted.result).toBe('INVALID')
    const res = await write('staff.checkin', req({ token: gate.token, body: { ticket_id: ticket.id, session_id: 'ses_sk_demo' } }))
    expect(res.result).toBe('VALID')
    expect(res.ticket.qrToken).toBe('')
  })

  it('locks out an unknown email the same way as a real one', async () => {
    const tryLogin = (email: string) => write('login', req({ body: { email, password: 'salah-salah', role: 'ADMIN' } }))
    for (const email of ['panitia@summarevent.test', 'tidak-ada@summarevent.test']) {
      for (let i = 0; i < 5; i++) expect(refused(await tryLogin(email))).toBe('BAD_LOGIN')
      expect(refused(await tryLogin(email))).toBe('RATE_LIMIT')
    }
  })

  it('a visitor cannot find out a panitia email through the profile', async () => {
    const rina = await write('demoLogin', req({ body: { role: 'VISITOR' } }))
    expect(await code(t.mutation(internal.rpc.updateProfile, { req: req({ token: rina.token, body: { email: 'panitia@summarevent.test' } }) }))).toBe('OK')
  })
})

