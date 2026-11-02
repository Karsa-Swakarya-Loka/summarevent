/**
 * PostgreSQL driver for the core API (frontend/src/api/mock/adapter.ts) – the same business logic
 * the browser demo runs, persisted in Postgres.
 *
 * A write goes like this:
 *  1. In-process queue + `pg_advisory_xact_lock` → writes are serialised, across server instances too.
 *  2. If another instance committed in the meantime (app_meta.version), reload the snapshot.
 *  3. Run the business logic on a copy of the snapshot.
 *  4. Flush only what changed, through guarded SQL (PRD §8):
 *       - hold    = one conditional UPDATE for all seats of the order (AVAILABLE or expired hold only),
 *       - confirm = UPDATE … WHERE the hold still belongs to the order and has not expired,
 *       - tickets = partial unique index, one live ticket per seat per session,
 *       - payments = unique idempotency key,
 *       - check-in = SELECT … FOR UPDATE on the ticket, then UPDATE … WHERE status = 'ACTIVE',
 *       - every other change = optimistic "still in the state I read" WHERE clause.
 *     If any guard affects fewer rows than expected, the whole transaction rolls back.
 *  5. Commit, bump the version, swap the new snapshot in.
 */
import { ApiError } from '@/api/contract'
import type { Db, DbDriver } from '@/api/mock/db'
import type { Order, Payment, Receipt, SessionSeat, Ticket } from '@/domain/types'
import { signPath } from './auth'
import { currentContext, type Role } from './context'
import type { Database, Sql } from './db/sql'

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS app_meta (
  id        smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  version   integer NOT NULL,
  seeded_at timestamptz NOT NULL
);

-- Reference data and content (users, venues, events, categories, sessions, notifications, …):
-- one JSON document per entity. Inventory, orders, payments, tickets and receipts get real tables.
CREATE TABLE IF NOT EXISTS entities (
  kind text    NOT NULL,
  id   text    NOT NULL,
  pos  integer NOT NULL,
  data jsonb   NOT NULL,
  PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS entities_kind_pos ON entities (kind, pos);

CREATE TABLE IF NOT EXISTS orders (
  id              text PRIMARY KEY,
  pos             integer NOT NULL,
  code            text NOT NULL UNIQUE,
  user_id         text NOT NULL,
  session_id      text NOT NULL,
  category_id     text NOT NULL,
  status          text NOT NULL CHECK (status IN ('AWAITING_PAYMENT','AWAITING_VERIFICATION','CONFIRMED','EXPIRED','CANCELLED','REJECTED')),
  hold_expires_at timestamptz NOT NULL,
  data            jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_session_status ON orders (session_id, status);

-- Seat inventory per session: the table the hold and confirm statements run on.
CREATE TABLE IF NOT EXISTS session_seats (
  session_id      text NOT NULL,
  seat_id         text NOT NULL,
  pos             integer NOT NULL,
  category_id     text,
  status          text NOT NULL CHECK (status IN ('AVAILABLE','HELD','SOLD','BLOCKED')),
  order_id        text REFERENCES orders (id) DEFERRABLE INITIALLY DEFERRED,
  hold_expires_at timestamptz,
  PRIMARY KEY (session_id, seat_id),
  CONSTRAINT held_seat_has_order CHECK (status <> 'HELD' OR (order_id IS NOT NULL AND hold_expires_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS session_seats_order ON session_seats (order_id) WHERE order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payments (
  id              text PRIMARY KEY,
  pos             integer NOT NULL,
  order_id        text NOT NULL REFERENCES orders (id) DEFERRABLE INITIALLY DEFERRED,
  idempotency_key text NOT NULL,
  status          text NOT NULL,
  data            jsonb NOT NULL
);
-- Layer 5: a payment button pressed twice is still one payment.
CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_key ON payments (idempotency_key);

CREATE TABLE IF NOT EXISTS tickets (
  id         text PRIMARY KEY,
  pos        integer NOT NULL,
  code       text NOT NULL UNIQUE,
  order_id   text NOT NULL REFERENCES orders (id) DEFERRABLE INITIALLY DEFERRED,
  session_id text NOT NULL,
  seat_id    text,
  status     text NOT NULL CHECK (status IN ('ACTIVE','USED','CANCELLED')),
  data       jsonb NOT NULL
);
-- Layer 4: never two live tickets for one seat in one session, whatever the application does.
CREATE UNIQUE INDEX IF NOT EXISTS one_ticket_per_seat ON tickets (session_id, seat_id)
  WHERE status <> 'CANCELLED' AND seat_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS receipts (
  id         text PRIMARY KEY,
  pos        integer NOT NULL,
  order_id   text NOT NULL REFERENCES orders (id) DEFERRABLE INITIALLY DEFERRED,
  status     text NOT NULL CHECK (status IN ('PENDING','APPROVED','NEEDS_REVISION','REJECTED')),
  photo_hash text NOT NULL,
  data       jsonb NOT NULL
);
-- Uploaded receipt photos live outside the snapshot and are served through signed links only.
CREATE TABLE IF NOT EXISTS receipt_photos (
  receipt_id text PRIMARY KEY REFERENCES receipts (id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  data_url   text NOT NULL
);
`

/** Any number shared by all instances of this app; writes take this advisory lock. */
const WRITE_LOCK = 724_2026

const ENTITY_KINDS = ['users', 'venues', 'tenants', 'layouts', 'seats', 'events', 'categories', 'sessions', 'quotas', 'checkins', 'notifications', 'otps', 'waitlist'] as const
type EntityKind = (typeof ENTITY_KINDS)[number]
type Positions = Record<string, number>

/** Photos bigger than this leave the snapshot (the demo's sample receipts are ~3 KB SVGs and stay inline). */
const INLINE_PHOTO_LIMIT = 16 * 1024

const entityKey = (kind: EntityKind, e: Record<string, unknown>): string =>
  kind === 'quotas' ? `${e.sessionId}|${e.categoryId}` : kind === 'otps' ? String(e.phone) : String(e.id)
const seatKey = (s: SessionSeat) => `${s.sessionId}|${s.seatId}`

function iso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString()
}

function emptyDb(version: number, seededAt: string): Db {
  return {
    schema: 3,
    version,
    seededAt,
    users: [],
    venues: [],
    tenants: [],
    layouts: [],
    seats: [],
    events: [],
    categories: [],
    sessions: [],
    sessionSeats: [],
    quotas: [],
    orders: [],
    payments: [],
    receipts: [],
    tickets: [],
    checkins: [],
    notifications: [],
    otps: [],
    waitlist: [],
  }
}

/* ------------------------------------------------------------------ */
/* diff                                                                */
/* ------------------------------------------------------------------ */

interface Diff<T> {
  added: T[]
  changed: { before: T; after: T }[]
  removed: T[]
}

function diff<T>(before: T[], after: T[], key: (t: T) => string): Diff<T> {
  const prev = new Map<string, { e: T; json: string }>()
  for (const e of before) prev.set(key(e), { e, json: JSON.stringify(e) })
  const out: Diff<T> = { added: [], changed: [], removed: [] }
  const seen = new Set<string>()
  for (const e of after) {
    const k = key(e)
    seen.add(k)
    const p = prev.get(k)
    if (!p) out.added.push(e)
    else if (p.json !== JSON.stringify(e)) out.changed.push({ before: p.e, after: e })
  }
  for (const [k, p] of prev) if (!seen.has(k)) out.removed.push(p.e)
  return out
}

/* ------------------------------------------------------------------ */
/* row mapping                                                         */
/* ------------------------------------------------------------------ */

const orderRow = (o: Order, pos?: number) => ({
  id: o.id,
  pos,
  code: o.code,
  user_id: o.userId,
  session_id: o.sessionId,
  category_id: o.categoryId,
  status: o.status,
  hold_expires_at: o.holdExpiresAt,
  data: o,
})
const seatRow = (s: SessionSeat, pos?: number) => ({
  session_id: s.sessionId,
  seat_id: s.seatId,
  pos,
  category_id: s.categoryId,
  status: s.status,
  order_id: s.orderId,
  hold_expires_at: s.holdExpiresAt,
})
const paymentRow = (p: Payment, pos?: number) => ({ id: p.id, pos, order_id: p.orderId, idempotency_key: p.idempotencyKey, status: p.status, data: p })
const ticketRow = (t: Ticket, pos?: number) => ({ id: t.id, pos, code: t.code, order_id: t.orderId, session_id: t.sessionId, seat_id: t.seatId, status: t.status, data: t })
const receiptRow = (r: Receipt, pos?: number) => ({ id: r.id, pos, order_id: r.orderId, status: r.status, photo_hash: r.photoHash, data: r })

const ORDER_COLS = 'id text, pos integer, code text, user_id text, session_id text, category_id text, status text, hold_expires_at timestamptz, data jsonb'
const SEAT_COLS = 'session_id text, seat_id text, pos integer, category_id text, status text, order_id text, hold_expires_at timestamptz'
const PAYMENT_COLS = 'id text, pos integer, order_id text, idempotency_key text, status text, data jsonb'
const TICKET_COLS = 'id text, pos integer, code text, order_id text, session_id text, seat_id text, status text, data jsonb'
const RECEIPT_COLS = 'id text, pos integer, order_id text, status text, photo_hash text, data jsonb'

function withPositions<T, R>(items: T[], table: string, positions: Positions, map: (t: T, pos: number) => R): R[] {
  const base = positions[table] ?? 0
  positions[table] = base + items.length
  return items.map((t, i) => map(t, base + i + 1))
}

/** Postgres unique-violation → readable API error. */
function mapUniqueViolation(e: unknown): never {
  const err = e as { code?: string; constraint?: string; message?: string }
  if (err.code === '23505') {
    const which = err.constraint ?? err.message ?? ''
    if (which.includes('one_ticket_per_seat')) throw new ApiError('SEAT_TAKEN', 'Kursi ini sudah punya tiket aktif, jadi pesanan tidak dikonfirmasi. Pilih kursi lain.')
    if (which.includes('payments_idempotency_key')) throw new ApiError('DUPLICATE_PAYMENT', 'Pembayaran ini sudah diproses. Muat ulang halaman untuk melihat statusnya.')
    throw new ApiError('CONFLICT', 'Data yang sama sudah tersimpan. Muat ulang lalu coba lagi.')
  }
  throw e
}

function expectRows(actual: number, expected: number, error: () => ApiError) {
  if (actual !== expected) throw error()
}

const staleError = () => new ApiError('CONFLICT', 'Data berubah di perangkat lain saat kamu menyimpan. Muat ulang lalu coba lagi.')

/* ------------------------------------------------------------------ */
/* the driver                                                          */
/* ------------------------------------------------------------------ */

export class PgStore implements DbDriver {
  private db: Db | null = null
  private positions: Positions = {}
  private syncedAt = 0
  private queue: Promise<unknown> = Promise.resolve()
  readonly database: Database
  private readonly freshMs: number

  constructor(database: Database, opts: { freshMs?: number } = {}) {
    this.database = database
    this.freshMs = opts.freshMs ?? 250
  }

  async init() {
    await this.database.exec(SCHEMA_SQL)
    await this.sync(true)
  }

  /** Serialise work inside this process (the advisory lock does the same across processes). */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn)
    this.queue = run.catch(() => undefined)
    return run
  }

  /** Make sure the cached snapshot is the latest committed one (called before every request). */
  sync(force = false): Promise<void> {
    if (!force && this.db && Date.now() - this.syncedAt < this.freshMs) return Promise.resolve()
    return this.serial(async () => {
      const r = await this.database.query<{ version: number }>('SELECT version FROM app_meta WHERE id = 1')
      const version = r.rows[0]?.version
      if (version == null) {
        this.db = null
      } else if (!this.db || this.db.version !== version) {
        const loaded = await this.database.tx((q) => this.load(q), { readOnly: true })
        if (loaded) [this.db, this.positions] = loaded
      }
      this.syncedAt = Date.now()
    })
  }

  get version(): number | null {
    return this.db?.version ?? null
  }

  private async load(q: Sql): Promise<[Db, Positions] | null> {
    const meta = (await q.query<{ version: number; seeded_at: Date }>('SELECT version, seeded_at FROM app_meta WHERE id = 1')).rows[0]
    if (!meta) return null
    const db = emptyDb(meta.version, iso(meta.seeded_at))
    const positions: Positions = {}
    const bump = (table: string, pos: number) => (positions[table] = Math.max(positions[table] ?? 0, pos))

    for (const r of (await q.query<{ kind: EntityKind; pos: number; data: never }>('SELECT kind, pos, data FROM entities ORDER BY kind, pos')).rows) {
      ;(db[r.kind] as unknown[]).push(r.data)
      bump(`entities:${r.kind}`, r.pos)
    }
    const seats = await q.query<{ session_id: string; seat_id: string; pos: number; category_id: string | null; status: SessionSeat['status']; order_id: string | null; hold_expires_at: Date | null }>(
      'SELECT session_id, seat_id, pos, category_id, status, order_id, hold_expires_at FROM session_seats ORDER BY pos',
    )
    db.sessionSeats = seats.rows.map((r) => {
      bump('session_seats', r.pos)
      return { sessionId: r.session_id, seatId: r.seat_id, categoryId: r.category_id, status: r.status, orderId: r.order_id, holdExpiresAt: r.hold_expires_at ? iso(r.hold_expires_at) : null }
    })
    for (const [table, key] of [
      ['orders', 'orders'],
      ['payments', 'payments'],
      ['tickets', 'tickets'],
      ['receipts', 'receipts'],
    ] as const) {
      const rows = await q.query<{ pos: number; data: never }>(`SELECT pos, data FROM ${table} ORDER BY pos`)
      db[key] = rows.rows.map((r) => {
        bump(table, r.pos)
        return r.data
      })
    }
    return [db, positions]
  }

  /* ---------------- DbDriver: storage ---------------- */

  hasDb() {
    return this.db != null
  }

  readDb() {
    return this.db
  }

  /** Seed / demo reset: replace everything in one transaction. */
  replaceDb(next: Db): Promise<void> {
    return this.serial(async () => {
      const positions: Positions = {}
      const version = await this.database.tx(async (q) => {
        await q.query('SELECT pg_advisory_xact_lock($1)', [WRITE_LOCK])
        const cur = (await q.query<{ version: number }>('SELECT version FROM app_meta WHERE id = 1')).rows[0]?.version ?? 0
        const v = Math.max(cur, next.version) + 1
        await q.query('TRUNCATE receipt_photos, receipts, tickets, payments, session_seats, orders, entities')
        for (const kind of ENTITY_KINDS) await this.insertEntities(q, kind, next[kind] as unknown as Record<string, unknown>[], positions)
        await this.insert(q, 'orders', ORDER_COLS, withPositions(next.orders, 'orders', positions, orderRow))
        await this.insert(q, 'session_seats', SEAT_COLS, withPositions(next.sessionSeats, 'session_seats', positions, seatRow))
        await this.insert(q, 'payments', PAYMENT_COLS, withPositions(next.payments, 'payments', positions, paymentRow))
        await this.insert(q, 'tickets', TICKET_COLS, withPositions(next.tickets, 'tickets', positions, ticketRow))
        await this.insert(q, 'receipts', RECEIPT_COLS, withPositions(next.receipts, 'receipts', positions, receiptRow))
        await q.query(
          `INSERT INTO app_meta (id, version, seeded_at) VALUES (1, $1, $2)
           ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, seeded_at = EXCLUDED.seeded_at`,
          [v, next.seededAt],
        )
        return v
      })
      next.version = version
      this.db = next
      this.positions = positions
      this.syncedAt = Date.now()
    })
  }

  clearDb() {
    // replaceDb() swaps everything atomically; clearing first would only open a window with no data.
  }

  notify() {}

  subscribe() {
    return () => {}
  }

  transaction<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
    return this.serial(async () => {
      const positions = { ...this.positions }
      const out = await this.database.tx(async (q) => {
        await q.query('SELECT pg_advisory_xact_lock($1)', [WRITE_LOCK])
        const current = (await q.query<{ version: number }>('SELECT version FROM app_meta WHERE id = 1')).rows[0]?.version
        if (current == null) throw new ApiError('NOT_READY', 'Data demo sedang disiapkan, coba lagi.')
        if (!this.db || this.db.version !== current) {
          const loaded = await this.load(q)
          if (!loaded) throw new ApiError('NOT_READY', 'Data demo sedang disiapkan, coba lagi.')
          ;[this.db, this.positions] = loaded
          Object.assign(positions, this.positions)
        }
        const before = this.db
        const draft = structuredClone(before)
        const result = await fn(draft)
        const photos = this.externalizePhotos(draft)
        const changed = await this.flush(q, before, draft, photos, positions)
        if (changed) {
          draft.version = before.version + 1
          await q.query('UPDATE app_meta SET version = $1 WHERE id = 1', [draft.version])
        }
        return { result, draft: changed ? draft : null }
      })
      if (out.draft) {
        this.db = out.draft
        this.positions = positions
      }
      this.syncedAt = Date.now()
      return out.result
    })
  }

  /* ---------------- DbDriver: who is calling ---------------- */

  getSessionUserId(role: string): string | null {
    return currentContext()?.users[role as Role] ?? null
  }

  setSessionUserId(role: string, userId: string | null) {
    const ctx = currentContext()
    if (!ctx) return
    if (userId) ctx.users[role as Role] = userId
    else delete ctx.users[role as Role]
    ctx.issued.push({ role: role as Role, userId })
  }

  guestId(): string {
    return currentContext()?.guest ?? 'guest_system'
  }

  clearClientSessions() {
    // Tokens live in the browser; the HTTP client drops them on demo reset.
  }

  /* ---------------- receipt photos ---------------- */

  /** Large uploaded photos move to receipt_photos; the receipt keeps a signed link instead. */
  private externalizePhotos(draft: Db): Map<string, string> {
    const photos = new Map<string, string>()
    const base = currentContext()?.baseUrl ?? ''
    for (const r of draft.receipts) {
      if (r.photoUrl.startsWith('data:') && r.photoUrl.length > INLINE_PHOTO_LIMIT) {
        photos.set(r.id, r.photoUrl)
        r.photoUrl = `${base}/receipt-photos/${encodeURIComponent(r.id)}?sig=${signPath(r.id)}`
      }
    }
    return photos
  }

  async photo(receiptId: string): Promise<string | null> {
    const r = await this.database.query<{ data_url: string }>('SELECT data_url FROM receipt_photos WHERE receipt_id = $1', [receiptId])
    return r.rows[0]?.data_url ?? null
  }

  /* ---------------- flush ---------------- */

  private async insert(q: Sql, table: string, cols: string, rows: object[]) {
    if (!rows.length) return
    const names = cols
      .split(',')
      .map((c) => c.trim().split(' ')[0])
      .join(', ')
    try {
      await q.query(`INSERT INTO ${table} (${names}) SELECT ${names} FROM jsonb_to_recordset($1::jsonb) AS x(${cols})`, [JSON.stringify(rows)])
    } catch (e) {
      mapUniqueViolation(e)
    }
  }

  private async insertEntities(q: Sql, kind: EntityKind, items: Record<string, unknown>[], positions: Positions) {
    if (!items.length) return
    const rows = withPositions(items, `entities:${kind}`, positions, (e, pos) => ({ id: entityKey(kind, e), pos, data: e }))
    await q.query(
      `INSERT INTO entities (kind, id, pos, data)
       SELECT $1, x.id, x.pos, x.data FROM jsonb_to_recordset($2::jsonb) AS x(id text, pos integer, data jsonb)
       ON CONFLICT (kind, id) DO UPDATE SET data = EXCLUDED.data`,
      [kind, JSON.stringify(rows)],
    )
  }

  private async flush(q: Sql, before: Db, after: Db, photos: Map<string, string>, positions: Positions): Promise<boolean> {
    let changed = false

    /* orders */
    const orders = diff(before.orders, after.orders, (o) => o.id)
    if (orders.removed.length) throw new Error('Pesanan tidak pernah dihapus.')
    if (orders.added.length) {
      await this.insert(q, 'orders', ORDER_COLS, withPositions(orders.added, 'orders', positions, orderRow))
      changed = true
    }
    if (orders.changed.length) {
      const rows = orders.changed.map(({ before: b, after: a }) => ({ ...orderRow(a), prev_status: b.status }))
      const r = await q.query(
        `UPDATE orders AS t SET user_id = x.user_id, status = x.status, hold_expires_at = x.hold_expires_at, data = x.data
           FROM jsonb_to_recordset($1::jsonb) AS x(id text, user_id text, status text, hold_expires_at timestamptz, data jsonb, prev_status text)
          WHERE t.id = x.id AND t.status = x.prev_status`,
        [JSON.stringify(rows)],
      )
      expectRows(r.rowCount, rows.length, staleError)
      changed = true
    }

    /* session seats – the double-booking guards */
    const seats = diff(before.sessionSeats, after.sessionSeats, seatKey)
    if (seats.added.length) {
      await this.insert(q, 'session_seats', SEAT_COLS, withPositions(seats.added, 'session_seats', positions, seatRow))
      changed = true
    }
    if (seats.removed.length) {
      const keys = seats.removed.map((s) => ({ session_id: s.sessionId, seat_id: s.seatId }))
      const r = await q.query(
        `DELETE FROM session_seats AS t USING jsonb_to_recordset($1::jsonb) AS x(session_id text, seat_id text)
          WHERE t.session_id = x.session_id AND t.seat_id = x.seat_id AND t.status IN ('AVAILABLE', 'BLOCKED')`,
        [JSON.stringify(keys)],
      )
      expectRows(r.rowCount, keys.length, () => new ApiError('LOCKED_LAYOUT', 'Denah tidak bisa diubah karena sudah ada kursi yang dipesan.'))
      changed = true
    }
    const holds = new Map<string, SessionSeat[]>()
    const confirms = new Map<string, SessionSeat[]>()
    const others: { before: SessionSeat; after: SessionSeat }[] = []
    for (const c of seats.changed) {
      const { before: b, after: a } = c
      if (a.status === 'HELD' && (b.status !== 'HELD' || b.orderId !== a.orderId)) {
        const k = `${a.sessionId}|${a.orderId}|${a.holdExpiresAt}`
        holds.set(k, [...(holds.get(k) ?? []), a])
      } else if (b.status === 'HELD' && a.status === 'SOLD' && b.orderId === a.orderId) {
        const k = `${a.sessionId}|${a.orderId}`
        confirms.set(k, [...(confirms.get(k) ?? []), a])
      } else {
        others.push(c)
      }
    }
    for (const group of holds.values()) {
      // Layer 1 – atomic, all-or-nothing hold (PRD §8).
      const { sessionId, orderId, holdExpiresAt } = group[0]
      const r = await q.query(
        `UPDATE session_seats
            SET status = 'HELD', order_id = $1, hold_expires_at = $4
          WHERE session_id = $2 AND seat_id = ANY($3::text[])
            AND (status = 'AVAILABLE'
                 OR (status = 'HELD' AND hold_expires_at < clock_timestamp()))`,
        [orderId, sessionId, group.map((s) => s.seatId), holdExpiresAt],
      )
      expectRows(r.rowCount, group.length, () => new ApiError('CONFLICT', 'Kursi baru saja dipilih orang lain. Pilih kursi lain atau pakai saran kursi.'))
      changed = true
    }
    for (const group of confirms.values()) {
      // Layer 3 – confirm only while the hold is still this order's and not expired.
      const { sessionId, orderId } = group[0]
      const r = await q.query(
        `UPDATE session_seats
            SET status = 'SOLD', hold_expires_at = NULL
          WHERE order_id = $1 AND session_id = $2 AND seat_id = ANY($3::text[])
            AND status = 'HELD' AND hold_expires_at > clock_timestamp()`,
        [orderId, sessionId, group.map((s) => s.seatId)],
      )
      expectRows(r.rowCount, group.length, () => new ApiError('HOLD_EXPIRED', 'Waktu habis, kursi sudah dilepas. Pilih kursi lagi untuk memesan.'))
      changed = true
    }
    if (others.length) {
      const rows = others.map(({ before: b, after: a }) => ({ ...seatRow(a), prev_status: b.status, prev_order: b.orderId }))
      const r = await q.query(
        `UPDATE session_seats AS t
            SET category_id = x.category_id, status = x.status, order_id = x.order_id, hold_expires_at = x.hold_expires_at
           FROM jsonb_to_recordset($1::jsonb) AS x(${SEAT_COLS}, prev_status text, prev_order text)
          WHERE t.session_id = x.session_id AND t.seat_id = x.seat_id
            AND t.status = x.prev_status AND t.order_id IS NOT DISTINCT FROM x.prev_order`,
        [JSON.stringify(rows)],
      )
      expectRows(r.rowCount, rows.length, staleError)
      changed = true
    }

    /* payments */
    const payments = diff(before.payments, after.payments, (p) => p.id)
    if (payments.added.length) {
      await this.insert(q, 'payments', PAYMENT_COLS, withPositions(payments.added, 'payments', positions, paymentRow))
      changed = true
    }
    if (payments.changed.length) {
      const rows = payments.changed.map(({ before: b, after: a }) => ({ ...paymentRow(a), prev_status: b.status }))
      const r = await q.query(
        `UPDATE payments AS t SET status = x.status, data = x.data
           FROM jsonb_to_recordset($1::jsonb) AS x(id text, status text, data jsonb, prev_status text)
          WHERE t.id = x.id AND t.status = x.prev_status`,
        [JSON.stringify(rows)],
      )
      expectRows(r.rowCount, rows.length, staleError)
      changed = true
    }
    if (payments.removed.length) throw new Error('Pembayaran tidak pernah dihapus.')

    /* tickets */
    const tickets = diff(before.tickets, after.tickets, (t) => t.id)
    if (tickets.added.length) {
      await this.insert(q, 'tickets', TICKET_COLS, withPositions(tickets.added, 'tickets', positions, ticketRow))
      changed = true
    }
    const checkins = tickets.changed.filter((c) => c.before.status === 'ACTIVE' && c.after.status === 'USED')
    for (const { after: t } of checkins) {
      // Check-in: lock the ticket row, then flip it only if it is still ACTIVE.
      const locked = await q.query<{ status: string }>('SELECT status FROM tickets WHERE id = $1 FOR UPDATE', [t.id])
      if (locked.rows[0]?.status !== 'ACTIVE') throw new ApiError('ALREADY_USED', 'Tiket ini sudah dipakai masuk.')
      const r = await q.query(`UPDATE tickets SET status = 'USED', data = $2 WHERE id = $1 AND status = 'ACTIVE'`, [t.id, JSON.stringify(t)])
      expectRows(r.rowCount, 1, () => new ApiError('ALREADY_USED', 'Tiket ini sudah dipakai masuk.'))
      changed = true
    }
    const otherTickets = tickets.changed.filter((c) => !checkins.includes(c))
    if (otherTickets.length) {
      const rows = otherTickets.map(({ before: b, after: a }) => ({ ...ticketRow(a), prev_status: b.status }))
      try {
        const r = await q.query(
          `UPDATE tickets AS t SET status = x.status, seat_id = x.seat_id, data = x.data
             FROM jsonb_to_recordset($1::jsonb) AS x(id text, status text, seat_id text, data jsonb, prev_status text)
            WHERE t.id = x.id AND t.status = x.prev_status`,
          [JSON.stringify(rows)],
        )
        expectRows(r.rowCount, rows.length, staleError)
      } catch (e) {
        if (e instanceof ApiError) throw e
        mapUniqueViolation(e)
      }
      changed = true
    }
    if (tickets.removed.length) throw new Error('Tiket tidak pernah dihapus.')

    /* receipts */
    const receipts = diff(before.receipts, after.receipts, (r) => r.id)
    if (receipts.removed.length) {
      await q.query('DELETE FROM receipts WHERE id = ANY($1::text[])', [receipts.removed.map((r) => r.id)])
      changed = true
    }
    if (receipts.added.length) {
      await this.insert(q, 'receipts', RECEIPT_COLS, withPositions(receipts.added, 'receipts', positions, receiptRow))
      const rows = receipts.added.filter((r) => photos.has(r.id)).map((r) => ({ receipt_id: r.id, data_url: photos.get(r.id)! }))
      await this.insert(q, 'receipt_photos', 'receipt_id text, data_url text', rows)
      changed = true
    }
    if (receipts.changed.length) {
      const rows = receipts.changed.map(({ before: b, after: a }) => ({ ...receiptRow(a), prev_status: b.status }))
      const r = await q.query(
        `UPDATE receipts AS t SET status = x.status, data = x.data
           FROM jsonb_to_recordset($1::jsonb) AS x(id text, status text, data jsonb, prev_status text)
          WHERE t.id = x.id AND t.status = x.prev_status`,
        [JSON.stringify(rows)],
      )
      expectRows(r.rowCount, rows.length, staleError)
      changed = true
    }

    /* everything else: JSON documents */
    for (const kind of ENTITY_KINDS) {
      const d = diff(before[kind] as unknown as Record<string, unknown>[], after[kind] as unknown as Record<string, unknown>[], (e) => entityKey(kind, e))
      if (d.removed.length) {
        await q.query('DELETE FROM entities WHERE kind = $1 AND id = ANY($2::text[])', [kind, d.removed.map((e) => entityKey(kind, e))])
        changed = true
      }
      const upserts = [...d.added, ...d.changed.map((c) => c.after)]
      if (upserts.length) {
        // new documents get fresh positions; changed ones keep theirs (ON CONFLICT updates data only)
        await this.insertEntities(q, kind, upserts, positions)
        changed = true
      }
    }
    return changed
  }
}
