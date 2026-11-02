/**
 * Backend tests. Without DATABASE_URL they run on embedded PGlite; with DATABASE_URL they run on
 * that PostgreSQL (the tables are reset first – never point this at production data).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { signToken } from '../src/auth'
import { connect, type Database } from '../src/db/sql'
import { PgStore } from '../src/store'

let database: Database
let store: PgStore
let app: ReturnType<typeof createApp>

const SESSION = 'ses_sk_16'

async function call<T = any>(method: string, path: string, opts: { body?: unknown; guest?: string; token?: string } = {}) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Guest-Id': opts.guest ?? 'guest_test0000',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  const text = await res.text()
  return { status: res.status, body: (text ? JSON.parse(text) : undefined) as T }
}

async function freeSeats(categoryId: string, n: number): Promise<string[]> {
  const map = await call('GET', `/sessions/${SESSION}/seats`)
  return map.body.sessionSeats.filter((s: any) => s.categoryId === categoryId && s.status === 'AVAILABLE').slice(0, n).map((s: any) => s.seatId)
}

/** Hold → OTP login (new user) → returns order id + visitor token. */
async function holdAndLogin(guest: string, phone: string, seatIds: string[]) {
  const hold = await call('POST', `/sessions/${SESSION}/holds`, { guest, body: { categoryId: 'cat_reg', seatIds } })
  expect(hold.body.ok).toBe(true)
  const otp = await call('POST', '/auth/otp/request', { guest, body: { phone } })
  const step1 = await call('POST', '/auth/otp/verify', { guest, body: { phone, code: otp.body.simulatedCode } })
  expect(step1.body.needName).toBe(true)
  const step2 = await call('POST', '/auth/otp/verify', { guest, body: { phone, code: otp.body.simulatedCode, name: 'Penguji Backend' } })
  expect(step2.status).toBe(200)
  return { orderId: hold.body.order.id as string, token: step2.body.token as string }
}

beforeAll(async () => {
  database = await connect()
  if (database.kind === 'postgres') {
    await database.exec('DROP TABLE IF EXISTS receipt_photos, receipts, tickets, payments, session_seats, orders, entities, app_meta CASCADE')
  }
  store = new PgStore(database, { freshMs: 0 })
  await store.init()
  app = createApp(store)
  const health = await call('GET', '/health')
  expect(health.body.ok).toBe(true)
})

afterAll(async () => {
  await database?.close()
})

describe('rebutan kursi (PRD §8)', () => {
  it('100 permintaan bersamaan untuk 1 kursi → tepat 1 berhasil', async () => {
    const [seat] = await freeSeats('cat_reg', 1)
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        call('POST', `/sessions/${SESSION}/holds`, { guest: `guest_race${String(i).padStart(4, '0')}`, body: { categoryId: 'cat_reg', seatIds: [seat] } }),
      ),
    )
    const winners = results.filter((r) => r.body.ok)
    const conflicts = results.filter((r) => !r.body.ok && r.body.reason === 'CONFLICT')
    expect(winners).toHaveLength(1)
    expect(conflicts).toHaveLength(99)
    expect(conflicts[0].body.suggestions.length).toBeGreaterThan(0)

    const db = await database.query<{ n: number }>(`SELECT count(*)::int AS n FROM session_seats WHERE session_id = $1 AND seat_id = $2 AND status = 'HELD'`, [SESSION, seat])
    expect(db.rows[0].n).toBe(1)
    const orders = await database.query<{ n: number }>(`SELECT count(*)::int AS n FROM orders WHERE data->'items' @> $1::jsonb`, [JSON.stringify([{ seatId: seat }])])
    expect(orders.rows[0].n).toBe(1)
  })

  it('hold all-or-nothing: satu kursi bentrok, tidak ada yang ditahan', async () => {
    const [a, b] = await freeSeats('cat_reg', 2)
    const first = await call('POST', `/sessions/${SESSION}/holds`, { guest: 'guest_aon00001', body: { categoryId: 'cat_reg', seatIds: [b] } })
    expect(first.body.ok).toBe(true)
    const both = await call('POST', `/sessions/${SESSION}/holds`, { guest: 'guest_aon00002', body: { categoryId: 'cat_reg', seatIds: [a, b] } })
    expect(both.body.ok).toBe(false)
    const seatA = await database.query<{ status: string }>('SELECT status FROM session_seats WHERE session_id = $1 AND seat_id = $2', [SESSION, a])
    expect(seatA.rows[0].status).toBe('AVAILABLE')
  })

  it('perangkat lain langsung melihat kursi itu "Sedang dipesan"', async () => {
    const [seat] = await freeSeats('cat_reg', 1)
    await call('POST', `/sessions/${SESSION}/holds`, { guest: 'guest_viewa001', body: { categoryId: 'cat_reg', seatIds: [seat] } })
    const other = await call('GET', `/sessions/${SESSION}/seats`, { guest: 'guest_viewb002' })
    const s = other.body.sessionSeats.find((x: any) => x.seatId === seat)
    expect(s.status).toBe('HELD')
    expect(s.orderId).toBeNull() // someone else's order id is never exposed
  })
})

describe('pengaman di database (lapis 1, 3, 4, 5)', () => {
  it('lapis 1: UPDATE hold tidak bisa mengambil kursi yang sudah terjual', async () => {
    const sold = await database.query<{ seat_id: string }>(`SELECT seat_id FROM session_seats WHERE session_id = $1 AND status = 'SOLD' LIMIT 1`, [SESSION])
    const r = await database.query(
      `UPDATE session_seats SET status = 'HELD', order_id = 'ord_attacker', hold_expires_at = now() + interval '10 minutes'
        WHERE session_id = $1 AND seat_id = ANY($2::text[])
          AND (status = 'AVAILABLE' OR (status = 'HELD' AND hold_expires_at < clock_timestamp()))`,
      [SESSION, [sold.rows[0].seat_id]],
    )
    expect(r.rowCount).toBe(0)
  })

  it('lapis 1 menahan bug aplikasi: data basi di memori tetap ditolak database', async () => {
    const [seat] = await freeSeats('cat_reg', 1)
    // Another server sells the seat behind this instance's back (snapshot not refreshed).
    const owner = await database.query<{ id: string }>(`SELECT id FROM orders WHERE status = 'CONFIRMED' LIMIT 1`)
    await database.query(`UPDATE session_seats SET status = 'SOLD', order_id = $3 WHERE session_id = $1 AND seat_id = $2`, [SESSION, seat, owner.rows[0].id])
    const res = await call('POST', `/sessions/${SESSION}/holds`, { guest: 'guest_stale001', body: { categoryId: 'cat_reg', seatIds: [seat] } })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('CONFLICT')
    const still = await database.query<{ status: string }>('SELECT status FROM session_seats WHERE session_id = $1 AND seat_id = $2', [SESSION, seat])
    expect(still.rows[0].status).toBe('SOLD')
    await database.query(`UPDATE app_meta SET version = version + 1`) // let the app reload the truth
  })

  it('lapis 3: hold yang sudah lewat waktu tidak bisa dibayar', async () => {
    const seats = await freeSeats('cat_reg', 1)
    const { orderId, token } = await holdAndLogin('guest_late0001', '081377700001', seats)
    const exp = await call('POST', `/demo/orders/${orderId}/expire`, { token })
    expect(exp.status).toBe(200)
    const pay = await call('POST', `/orders/${orderId}/payments/simulate`, { token, body: { method: 'SIM_QRIS', outcome: 'SUCCESS', idempotencyKey: crypto.randomUUID() } })
    expect(pay.status).toBe(409)
    expect(pay.body.code).toBe('HOLD_EXPIRED')
  })

  it('lapis 4: unique index menolak tiket kedua untuk kursi yang sama', async () => {
    const t = await database.query<{ session_id: string; seat_id: string; order_id: string }>(`SELECT session_id, seat_id, order_id FROM tickets WHERE status = 'ACTIVE' AND seat_id IS NOT NULL LIMIT 1`)
    const { session_id, seat_id, order_id } = t.rows[0]
    await expect(
      database.query(`INSERT INTO tickets (id, pos, code, order_id, session_id, seat_id, status, data) VALUES ('tkt_dup', 999999, 'TKT-DUP', $1, $2, $3, 'ACTIVE', '{}')`, [order_id, session_id, seat_id]),
    ).rejects.toThrow(/one_ticket_per_seat/)
  })

  it('lapis 5: bayar dua kali dengan kunci yang sama tetap satu pembayaran', async () => {
    const seats = await freeSeats('cat_reg', 2)
    const { orderId, token } = await holdAndLogin('guest_idem0001', '081377700002', seats)
    const key = crypto.randomUUID()
    const body = { method: 'SIM_VA', outcome: 'SUCCESS', idempotencyKey: key }
    const [a, b] = await Promise.all([
      call('POST', `/orders/${orderId}/payments/simulate`, { token, body }),
      call('POST', `/orders/${orderId}/payments/simulate`, { token, body }),
    ])
    expect(a.body.order.status).toBe('CONFIRMED')
    expect(b.body.order.status).toBe('CONFIRMED')
    const pays = await database.query<{ n: number }>('SELECT count(*)::int AS n FROM payments WHERE idempotency_key = $1', [key])
    expect(pays.rows[0].n).toBe(1)
    const tickets = await database.query<{ n: number }>(`SELECT count(*)::int AS n FROM tickets WHERE order_id = $1 AND status = 'ACTIVE'`, [orderId])
    expect(tickets.rows[0].n).toBe(2)
    const seatRows = await database.query<{ status: string }>('SELECT status FROM session_seats WHERE session_id = $1 AND seat_id = ANY($2::text[])', [SESSION, seats])
    expect(seatRows.rows.every((r) => r.status === 'SOLD')).toBe(true)
  })
})

describe('check-in', () => {
  it('Valid, lalu Sudah digunakan, dan QR palsu Tidak valid', async () => {
    const staff = await call('POST', '/auth/demo-login', { body: { role: 'STAFF' } })
    const token = staff.body.token
    const rina = await call('POST', '/auth/demo-login', { body: { role: 'VISITOR' } })
    const pass = await call('GET', '/me/tickets', { token: rina.body.token })
    const live = pass.body.find((p: any) => p.session.demoLive && p.ticket.status === 'ACTIVE')
    expect(live).toBeTruthy()
    const first = await call('POST', '/staff/checkins', { token, body: { qr_token: live.ticket.qrToken, session_id: live.session.id } })
    expect(first.body.result).toBe('VALID')
    const again = await call('POST', '/staff/checkins', { token, body: { qr_token: live.ticket.qrToken, session_id: live.session.id } })
    expect(again.body.result).toBe('ALREADY_USED')
    const forged = live.ticket.qrToken.slice(0, -3) + 'abc'
    const fake = await call('POST', '/staff/checkins', { token, body: { qr_token: forged, session_id: live.session.id } })
    expect(fake.body.result).toBe('INVALID')
    const row = await database.query<{ status: string }>('SELECT status FROM tickets WHERE id = $1', [live.ticket.id])
    expect(row.rows[0].status).toBe('USED')
  })
})

describe('akses & data', () => {
  it('endpoint panitia butuh token panitia', async () => {
    const anon = await call('GET', '/admin/orders')
    expect(anon.status).toBe(401)
    const visitor = await call('GET', '/admin/orders', { token: signToken('VISITOR', 'u_rina') })
    expect(visitor.status).toBe(401)
    const admin = await call('POST', '/auth/demo-login', { body: { role: 'ADMIN' } })
    const ok = await call('GET', '/admin/orders', { token: admin.body.token })
    expect(ok.status).toBe(200)
    expect(Array.isArray(ok.body)).toBe(true)
  })

  it('token yang diubah ditolak', async () => {
    const t = signToken('ADMIN', 'u_admin')
    const tampered = t.slice(0, -2) + (t.endsWith('A') ? 'BB' : 'AA')
    expect((await call('GET', '/admin/orders', { token: tampered })).status).toBe(401)
  })

  it('pesanan orang lain tidak bisa dibuka', async () => {
    const [seat] = await freeSeats('cat_reg', 1)
    const hold = await call('POST', `/sessions/${SESSION}/holds`, { guest: 'guest_owner001', body: { categoryId: 'cat_reg', seatIds: [seat] } })
    const peek = await call('GET', `/orders/${hold.body.order.id}`, { guest: 'guest_snoop001' })
    expect(peek.status).toBe(404)
  })

  it('foto struk besar disimpan terpisah dan hanya terbuka lewat link bertanda tangan', async () => {
    const admin = await call('POST', '/auth/demo-login', { body: { role: 'ADMIN' } })
    const seats = (await call('GET', `/sessions/${SESSION}/seats`)).body.sessionSeats.filter((s: any) => s.categoryId === 'cat_struk' && s.status === 'AVAILABLE').slice(0, 1).map((s: any) => s.seatId)
    const guest = 'guest_photo001'
    const hold = await call('POST', `/sessions/${SESSION}/holds`, { guest, body: { categoryId: 'cat_struk', seatIds: seats } })
    expect(hold.body.ok).toBe(true)
    const otp = await call('POST', '/auth/otp/request', { guest, body: { phone: '081377700003' } })
    const login = await call('POST', '/auth/otp/verify', { guest, body: { phone: '081377700003', code: otp.body.simulatedCode, name: 'Penguji Struk' } })
    const tenants = (await call('GET', '/admin/tenants', { token: admin.body.token })).body
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40_000, 7)]).toString('base64')
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
    const receipt = { tenantId: tenants[0].id, receiptNo: `INV${Date.now()}`, amount: 350_000, receiptDate: today, receiptTime: '00:01', photoUrl: `data:image/jpeg;base64,${jpeg}`, photoHash: '' }
    const sent = await call('POST', `/orders/${hold.body.order.id}/receipts`, { token: login.body.token, body: { receipts: [receipt] } })
    expect(sent.status).toBe(200)
    expect(sent.body.ok).toBe(true)
    const url: string = sent.body.receipts[0].photoUrl
    expect(url).toMatch(/\/api\/receipt-photos\/.+\?sig=/)
    const path = url.slice(url.indexOf('/receipt-photos/'))
    const img = await app.request(`/api${path}`)
    expect(img.status).toBe(200)
    expect(img.headers.get('content-type')).toBe('image/jpeg')
    const forged = await app.request(`/api${path.replace(/sig=.*/, 'sig=deadbeef')}`)
    expect(forged.status).toBe(404)
  })
})
