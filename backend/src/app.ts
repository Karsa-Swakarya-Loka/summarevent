/**
 * REST routes from docs/API-CONTRACT.md, each one calling the shared core API. The frontend's
 * HTTP adapter (frontend/src/api/http.ts) is the client for exactly these paths.
 */
import { createHash } from 'node:crypto'
import { Hono, type Context, type Next } from 'hono'
import { cors } from 'hono/cors'
import { ApiError, type Api, type OrderFilter, type ReceiptInput, type ReviewDecision } from '@/api/contract'
import { createMockApi, ensureMockDb } from '@/api/mock/adapter'
import { setDbDriver } from '@/api/mock/db'
import type { ReceiptStatus } from '@/domain/types'
import { signToken, verifyPath, verifyToken } from './auth'
import { currentContext, runWithContext, sanitizeGuest, type RequestContext, type Role } from './context'
import type { PgStore } from './store'

export interface AppOptions {
  /** Mount point, '/api' by default (same on a laptop and on Vercel). */
  basePath?: string
  /** Demo endpoints (reset, simulated buyer, force-expire). On by default for the competition demo. */
  demo?: boolean
  /** Allowed browser origins; '*' when empty. */
  origins?: string[]
}

const STATUS: Record<string, 400 | 401 | 403 | 404 | 409 | 429 | 503> = {
  BAD_REQUEST: 400,
  INVALID: 400,
  NEED_NAME: 400,
  NEED_REASON: 400,
  BAD_PHONE: 400,
  BAD_OTP: 400,
  OTP_EXPIRED: 400,
  RULE: 400,
  NEED_LOGIN: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  BAD_STATE: 409,
  HOLD_EXPIRED: 409,
  SEAT_TAKEN: 409,
  SOLD_OUT: 409,
  LOCKED_LAYOUT: 409,
  DUPLICATE: 409,
  DUPLICATE_PAYMENT: 409,
  ALREADY_USED: 409,
  RATE_LIMIT: 429,
  NOT_READY: 503,
}

const MAX_PHOTO_BYTES = 3 * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']

function bad(message: string): never {
  throw new ApiError('BAD_REQUEST', message)
}

async function body<T>(c: Context): Promise<T> {
  try {
    return (await c.req.json()) as T
  } catch {
    return {} as T
  }
}

function decodeDataUrl(url: string): { type: string; bytes: Buffer } | null {
  const m = /^data:([^;,]+)((?:;[^;,]*)*),(.*)$/s.exec(url)
  if (!m) return null
  const [, type, params, payload] = m
  try {
    const b64 = params.split(';').includes('base64')
    return { type: type.toLowerCase(), bytes: b64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload), 'utf8') }
  } catch {
    return null
  }
}

/**
 * Receipt photos: check type and size before they reach the core logic. The browser hashes the
 * original file (before compression) for the "same photo" warning in R6; a missing or malformed
 * hash is recomputed here from the uploaded bytes.
 */
function checkPhotos(receipts: ReceiptInput[]): ReceiptInput[] {
  if (!Array.isArray(receipts) || !receipts.length) bad('Kirim minimal 1 struk.')
  if (receipts.length > 3) bad('Maksimal 3 struk per pesanan.')
  return receipts.map((r) => {
    const photo = typeof r.photoUrl === 'string' ? decodeDataUrl(r.photoUrl) : null
    if (!photo) bad('Foto struk tidak terbaca. Ambil ulang fotonya.')
    if (!PHOTO_TYPES.includes(photo.type)) bad('Foto struk harus JPG, PNG, atau WebP.')
    if (photo.bytes.length > MAX_PHOTO_BYTES) bad('Foto struk terlalu besar (maks 3 MB). Ambil ulang dengan resolusi lebih kecil.')
    const hash = typeof r.photoHash === 'string' && /^[0-9a-f]{64}$/.test(r.photoHash) ? r.photoHash : createHash('sha256').update(photo.bytes).digest('hex')
    return { ...r, photoHash: hash }
  })
}

export function createApp(store: PgStore, opts: AppOptions = {}) {
  setDbDriver(store)
  const api: Api = createMockApi()
  const base = opts.basePath ?? '/api'
  const demo = opts.demo ?? true
  const app = new Hono().basePath(base)

  app.use(
    '*',
    cors({
      origin: (origin) => (!opts.origins?.length ? origin || '*' : opts.origins.includes(origin) ? origin : opts.origins[0]),
      allowHeaders: ['Authorization', 'Content-Type', 'X-Guest-Id'],
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 600,
    }),
  )

  // Who is calling + fresh snapshot, for every request.
  app.use('*', async (c, next) => {
    const users: RequestContext['users'] = {}
    const auth = c.req.header('Authorization')
    const token = auth?.startsWith('Bearer ') ? verifyToken(auth.slice(7)) : null
    if (token) users[token.role] = token.userId
    const url = new URL(c.req.url)
    const proto = c.req.header('x-forwarded-proto') ?? url.protocol.replace(':', '')
    const host = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? url.host
    const ctx: RequestContext = {
      users,
      guest: sanitizeGuest(c.req.header('X-Guest-Id')) ?? `guest_${crypto.randomUUID().slice(0, 12)}`,
      issued: [],
      baseUrl: process.env.PUBLIC_API_URL?.replace(/\/$/, '') ?? `${proto}://${host}${base}`,
    }
    await store.sync()
    return runWithContext(ctx, () => next())
  })

  const requireRole = (role: Role, label: string) => async (_c: Context, next: Next) => {
    if (!currentContext()?.users[role]) throw new ApiError('NEED_LOGIN', `Masuk sebagai ${label} dulu.`)
    await next()
  }
  app.use('/admin/*', requireRole('ADMIN', 'panitia'))
  app.use('/staff/*', requireRole('STAFF', 'petugas'))

  const ok = (c: Context, value: unknown) => (value === undefined ? c.body(null, 204) : c.json(value as object))
  const issuedToken = (role: Role) => {
    const login = currentContext()?.issued.findLast((i) => i.role === role && i.userId)
    if (!login?.userId) throw new ApiError('NEED_LOGIN', 'Gagal masuk, coba lagi.')
    return signToken(role, login.userId)
  }

  /* ---------- health ---------- */
  app.get('/health', async (c) => {
    await ensureMockDb()
    return c.json({ ok: true, database: store.database.kind, version: store.version, demo })
  })

  /* ---------- auth ---------- */
  app.post('/auth/otp/request', async (c) => {
    const { phone } = await body<{ phone?: string }>(c)
    return ok(c, await api.requestOtp(String(phone ?? '')))
  })
  app.post('/auth/otp/verify', async (c) => {
    const { phone, code, name } = await body<{ phone?: string; code?: string; name?: string }>(c)
    try {
      const r = await api.verifyOtp(String(phone ?? ''), String(code ?? ''), name || undefined)
      return ok(c, { ...r, token: issuedToken('VISITOR') })
    } catch (e) {
      // A new number is not an error: the second step of the login asks for a name.
      if (e instanceof ApiError && e.code === 'NEED_NAME') return ok(c, { needName: true, message: e.message })
      throw e
    }
  })
  app.post('/auth/demo-login', async (c) => {
    const { role, user_id } = await body<{ role?: Role; user_id?: string }>(c)
    if (role !== 'ADMIN' && role !== 'STAFF' && role !== 'VISITOR') bad('Role tidak dikenal.')
    const user = await api.demoLogin(role, user_id || undefined)
    return ok(c, { user, token: issuedToken(role) })
  })

  /* ---------- public & visitor ---------- */
  app.get('/events', async (c) => ok(c, await api.listEvents()))
  app.get('/events/:slug', async (c) => ok(c, await api.getEvent(c.req.param('slug'))))
  app.get('/sessions/:id/seats', async (c) => ok(c, await api.getSeatMap(c.req.param('id'))))
  app.get('/sessions/:id/suggest', async (c) => {
    const qty = Number(c.req.query('qty'))
    if (!Number.isInteger(qty) || qty < 1) bad('Jumlah kursi tidak valid.')
    return ok(c, await api.suggestSeats(c.req.param('id'), c.req.query('category_id') ?? '', qty))
  })
  app.post('/sessions/:id/holds', async (c) => {
    const b = await body<{ categoryId?: string; seatIds?: string[]; qty?: number }>(c)
    if (!b.categoryId) bad('Pilih kategori dulu.')
    return ok(c, await api.createHold(c.req.param('id'), { categoryId: b.categoryId, seatIds: b.seatIds, qty: b.qty }))
  })
  app.post('/sessions/:id/holds/auto', async (c) => {
    const b = await body<{ category_id?: string; qty?: number }>(c)
    return ok(c, await api.autoHold(c.req.param('id'), String(b.category_id ?? ''), Number(b.qty)))
  })
  app.post('/sessions/:id/waitlist', async (c) => {
    const b = await body<{ category_id?: string; qty?: number }>(c)
    return ok(c, await api.joinWaitlist(c.req.param('id'), String(b.category_id ?? ''), Number(b.qty)))
  })
  app.delete('/waitlist/:id', async (c) => ok(c, await api.leaveWaitlist(c.req.param('id'))))

  app.get('/orders/:id', async (c) => ok(c, await api.getOrder(c.req.param('id'))))
  app.patch('/orders/:id', async (c) => {
    const b = await body<{ attendees?: { itemId: string; name: string }[] }>(c)
    if (!Array.isArray(b.attendees)) bad('Daftar nama peserta kosong.')
    return ok(c, await api.updateAttendees(c.req.param('id'), b.attendees))
  })
  app.delete('/orders/:id', async (c) => ok(c, await api.cancelOrder(c.req.param('id'))))
  app.post('/orders/:id/payments/simulate', async (c) => {
    const b = await body<{ method?: 'SIM_QRIS' | 'SIM_VA'; outcome?: 'SUCCESS' | 'FAIL'; idempotencyKey?: string }>(c)
    if (b.method !== 'SIM_QRIS' && b.method !== 'SIM_VA') bad('Pilih QRIS atau Virtual Account.')
    if (b.outcome !== 'SUCCESS' && b.outcome !== 'FAIL') bad('Hasil simulasi tidak dikenal.')
    if (!b.idempotencyKey || b.idempotencyKey.length > 100) bad('Kunci pembayaran (idempotency key) wajib ada.')
    return ok(c, await api.simulatePayment(c.req.param('id'), { method: b.method, outcome: b.outcome, idempotencyKey: b.idempotencyKey }))
  })
  app.post('/orders/:id/confirm', async (c) => ok(c, await api.confirmFree(c.req.param('id'))))
  app.post('/orders/:id/receipts/check', async (c) => {
    const b = await body<{ receipts?: Omit<ReceiptInput, 'photoUrl'>[] }>(c)
    if (!Array.isArray(b.receipts)) bad('Kirim data struk.')
    return ok(c, await api.checkReceipts(c.req.param('id'), b.receipts))
  })
  app.post('/orders/:id/receipts', async (c) => {
    const b = await body<{ receipts?: ReceiptInput[] }>(c)
    return ok(c, await api.submitReceipts(c.req.param('id'), checkPhotos(b.receipts ?? [])))
  })

  app.get('/me/orders', async (c) => ok(c, await api.myOrders()))
  app.get('/me/tickets', async (c) => ok(c, await api.myTickets()))
  app.get('/me/notifications', async (c) => ok(c, await api.myNotifications()))
  app.get('/me/waitlist', async (c) => ok(c, await api.myWaitlist()))

  /* ---------- receipt photos (signed links, PRD §12) ---------- */
  app.get('/receipt-photos/:id', async (c) => {
    const id = c.req.param('id')
    if (!verifyPath(id, c.req.query('sig'))) throw new ApiError('NOT_FOUND', 'Foto tidak ditemukan.')
    const url = await store.photo(id)
    const photo = url ? decodeDataUrl(url) : null
    if (!photo) throw new ApiError('NOT_FOUND', 'Foto tidak ditemukan.')
    return c.body(new Uint8Array(photo.bytes), 200, {
      'Content-Type': photo.type,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
    })
  })

  /* ---------- panitia ---------- */
  app.get('/admin/events', async (c) => ok(c, await api.admin.listEvents()))
  app.get('/admin/events/:id', async (c) => ok(c, await api.admin.getEventDraft(c.req.param('id'))))
  app.post('/admin/events', async (c) => ok(c, await api.admin.createEvent(await body(c))))
  app.patch('/admin/events/:id', async (c) => {
    const b = await body<Record<string, unknown>>(c)
    const id = c.req.param('id')
    if (b.status === 'PUBLISHED' && !('title' in b)) return ok(c, await api.admin.publishEvent(id))
    return ok(c, await api.admin.updateEvent(id, b as never))
  })
  app.get('/admin/events/:id/stats', async (c) => ok(c, await api.admin.stats(c.req.param('id'))))
  app.get('/admin/events/:id/export', async (c) => {
    const type = c.req.query('type')
    if (type !== 'attendees' && type !== 'transactions') bad('Jenis laporan tidak dikenal.')
    return ok(c, await api.admin.exportCsv(c.req.param('id'), type))
  })
  app.get('/admin/orders', async (c) => {
    const f: OrderFilter = {}
    const { eventId, status, q } = c.req.query()
    if (eventId) f.eventId = eventId
    if (status) f.status = status as OrderFilter['status']
    if (q) f.q = q
    return ok(c, await api.admin.listOrders(f))
  })
  app.patch('/admin/orders/:id', async (c) => {
    const { action } = await body<{ action?: string }>(c)
    if (action === 'MARK_PAID') return ok(c, await api.admin.markPaid(c.req.param('id')))
    if (action === 'CANCEL') return ok(c, await api.admin.cancelOrder(c.req.param('id')))
    bad('Aksi tidak dikenal.')
  })
  app.get('/admin/receipts', async (c) => ok(c, await api.admin.listReceipts((c.req.query('status') ?? 'PENDING') as ReceiptStatus | 'ALL')))
  app.patch('/admin/receipts/:id', async (c) => {
    const b = await body<{ decision?: ReviewDecision; reason?: string }>(c)
    if (!b.decision) bad('Pilih keputusan.')
    return ok(c, await api.admin.reviewReceipt(c.req.param('id'), b.decision, b.reason || undefined))
  })
  app.get('/admin/venues', async (c) => ok(c, await api.admin.venues()))
  app.get('/admin/tenants', async (c) => ok(c, await api.admin.tenants()))
  app.get('/admin/staff', async (c) => ok(c, await api.admin.listStaff()))
  app.post('/admin/staff', async (c) => {
    const b = await body<{ name?: string; phone?: string }>(c)
    return ok(c, await api.admin.createStaff({ name: String(b.name ?? ''), phone: String(b.phone ?? '') }))
  })
  app.patch('/admin/staff/:id', async (c) => {
    const b = await body<{ active?: boolean }>(c)
    if (typeof b.active !== 'boolean') bad('Status akun tidak valid.')
    return ok(c, await api.admin.setStaffActive(c.req.param('id'), b.active))
  })

  /* ---------- petugas ---------- */
  app.get('/staff/accounts', async (c) => ok(c, await api.staff.accounts()))
  app.post('/staff/checkins', async (c) => {
    const b = await body<{ qr_token?: string; session_id?: string }>(c)
    if (!b.qr_token || !b.session_id) bad('QR dan sesi wajib ada.')
    return ok(c, await api.staff.checkin(String(b.qr_token).slice(0, 512), b.session_id))
  })
  app.get('/staff/tickets', async (c) => ok(c, await api.staff.searchTickets(c.req.query('q') ?? '', c.req.query('event_id') || undefined)))
  app.get('/staff/sessions/:id/checkins', async (c) => ok(c, await api.staff.recentCheckins(c.req.param('id'))))
  // PT-07: ticket list for offline check-in (QR token hashes only, never the tokens)
  app.get('/staff/sessions/:id/offline-manifest', async (c) => ok(c, await api.staff.offlineManifest(c.req.param('id'))))
  app.get('/staff/receipts', async (c) => ok(c, await api.staff.listReceipts(c.req.query('event_id') || undefined)))
  app.patch('/staff/receipts/:id', async (c) => {
    const b = await body<{ decision?: ReviewDecision; reason?: string }>(c)
    if (!b.decision) bad('Pilih keputusan.')
    return ok(c, await api.staff.reviewReceipt(c.req.param('id'), b.decision, b.reason || undefined))
  })

  /* ---------- demo (juri & pameran) ---------- */
  if (demo) {
    app.post('/demo/reset', async (c) => ok(c, await api.demo.reset()))
    app.post('/demo/sessions/:id/fake-buyer', async (c) => {
      const b = await body<{ category_id?: string; seat_ids?: string[] }>(c)
      return ok(c, await api.demo.fakeBuyer(c.req.param('id'), b.category_id || undefined, Array.isArray(b.seat_ids) ? b.seat_ids : undefined))
    })
    app.post('/demo/orders/:id/expire', async (c) => ok(c, await api.demo.expireHold(c.req.param('id'))))
  }

  app.notFound((c) => c.json({ code: 'NOT_FOUND', message: 'Alamat API tidak dikenal.' }, 404))
  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json({ code: err.code, message: err.message, details: err.details }, STATUS[err.code] ?? 400)
    console.error('[api]', c.req.method, c.req.path, err)
    return c.json({ code: 'INTERNAL', message: 'Terjadi kesalahan di server. Coba lagi sebentar.' }, 500)
  })
  return app
}
