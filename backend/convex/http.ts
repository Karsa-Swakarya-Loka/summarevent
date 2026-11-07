/**
 * The REST API of docs/API-CONTRACT.md, served by Convex HTTP actions under `/api`
 * (https://<deployment>.convex.site/api → frontend VITE_API_URL). Each route runs one query or mutation from rpc.ts.
 */
import { httpRouter } from 'convex/server'
import { ConvexError } from 'convex/values'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { httpAction, type ActionCtx } from './_generated/server'
import type { AuthInput } from './lib/auth'
import { verifyReceiptPhotoSig } from './lib/crypto'
import { demoEnabled } from './lib/demo'
import { HTTP_STATUS } from './lib/errors'
import { REFUSED } from './rpc'

const REFUSED_PREFIX = `{"${REFUSED}":`

const PREFIX = '/api'
const VERSION = '1.0.0'

type Kind = 'read' | 'write' | 'custom'
interface Route {
  method: string
  pattern: string
  kind: Kind
  op: string
}

const R = (method: string, pattern: string, kind: Kind, op: string): Route => ({ method, pattern, kind, op })

const ROUTES: Route[] = [
  R('GET', '/health', 'custom', 'health'),
  R('POST', '/auth/otp/request', 'write', 'requestOtp'),
  R('POST', '/auth/otp/verify', 'write', 'verifyOtp'),
  R('POST', '/auth/demo-login', 'write', 'demoLogin'),
  R('POST', '/auth/login', 'write', 'login'),
  R('POST', '/auth/logout', 'write', 'logout'),
  R('POST', '/auth/password/forgot', 'write', 'forgotPassword'),
  R('POST', '/auth/password/reset', 'write', 'resetPassword'),

  R('GET', '/events', 'read', 'listEvents'),
  R('GET', '/events/:slug', 'read', 'getEvent'),
  R('GET', '/sessions/:id/seats', 'read', 'getSeatMap'),
  R('GET', '/sessions/:id/suggest', 'read', 'suggest'),
  R('POST', '/sessions/:id/holds', 'write', 'createHold'),
  R('POST', '/sessions/:id/holds/auto', 'write', 'autoHold'),
  R('POST', '/sessions/:id/waitlist', 'write', 'joinWaitlist'),
  R('GET', '/orders/:id', 'read', 'getOrder'),
  R('PATCH', '/orders/:id', 'write', 'updateAttendees'),
  R('DELETE', '/orders/:id', 'write', 'cancelOrder'),
  R('POST', '/orders/:id/payments/simulate', 'write', 'simulatePayment'),
  R('POST', '/orders/:id/confirm', 'write', 'confirmFree'),
  R('POST', '/orders/:id/receipts/check', 'read', 'checkReceipts'),
  R('POST', '/orders/:id/receipts', 'custom', 'submitReceipts'),
  R('GET', '/me/orders', 'read', 'myOrders'),
  R('GET', '/me/tickets', 'read', 'myTickets'),
  R('GET', '/me/notifications', 'read', 'myNotifications'),
  R('GET', '/me/waitlist', 'read', 'myWaitlist'),
  R('PATCH', '/me', 'custom', 'updateProfile'),
  R('DELETE', '/waitlist/:id', 'write', 'leaveWaitlist'),
  R('GET', '/receipt-photos/:id', 'custom', 'receiptPhoto'),

  R('GET', '/admin/events', 'read', 'admin.listEvents'),
  R('POST', '/admin/events', 'write', 'admin.createEvent'),
  R('GET', '/admin/events/:id', 'read', 'admin.getEventDraft'),
  R('PATCH', '/admin/events/:id', 'write', 'admin.updateEvent'),
  R('GET', '/admin/events/:id/stats', 'read', 'admin.stats'),
  R('GET', '/admin/events/:id/export', 'read', 'admin.exportCsv'),
  R('GET', '/admin/orders', 'read', 'admin.listOrders'),
  R('PATCH', '/admin/orders/:id', 'write', 'admin.patchOrder'),
  R('GET', '/admin/receipts', 'read', 'admin.listReceipts'),
  R('PATCH', '/admin/receipts/:id', 'write', 'admin.patchReceipt'),
  R('GET', '/admin/venues', 'read', 'admin.venues'),
  R('GET', '/admin/tenants', 'read', 'admin.tenants'),
  R('GET', '/admin/staff', 'read', 'admin.listStaff'),
  R('POST', '/admin/staff', 'write', 'admin.createStaff'),
  R('PATCH', '/admin/staff/:id', 'write', 'admin.setStaffActive'),

  R('GET', '/staff/accounts', 'read', 'staff.accounts'),
  R('POST', '/staff/checkins', 'write', 'staff.checkin'),
  R('GET', '/staff/tickets', 'read', 'staff.searchTickets'),
  R('GET', '/staff/sessions/:id/checkins', 'read', 'staff.recentCheckins'),
  R('GET', '/staff/sessions/:id/offline-manifest', 'read', 'staff.offlineManifest'),
  R('GET', '/staff/receipts', 'read', 'staff.listReceipts'),
  R('PATCH', '/staff/receipts/:id', 'write', 'staff.patchReceipt'),

  R('POST', '/demo/reset', 'custom', 'reset'),
  R('POST', '/demo/sessions/:id/fake-buyer', 'write', 'demo.fakeBuyer'),
  R('POST', '/demo/orders/:id/expire', 'write', 'demo.expireHold'),
]

function match(method: string, path: string): { route: Route; params: Record<string, string> } | 'METHOD' | null {
  const parts = path.split('/').filter(Boolean)
  let methodMismatch = false
  for (const route of ROUTES) {
    const pat = route.pattern.split('/').filter(Boolean)
    if (pat.length !== parts.length) continue
    const params: Record<string, string> = {}
    let ok = true
    for (let i = 0; i < pat.length; i++) {
      if (pat[i].startsWith(':')) {
        try {
          params[pat[i].slice(1)] = decodeURIComponent(parts[i])
        } catch {
          ok = false
        }
      } else if (pat[i] !== parts[i]) ok = false
      if (!ok) break
    }
    if (!ok) continue
    if (route.method !== method) {
      methodMismatch = true
      continue
    }
    return { route, params }
  }
  return methodMismatch ? 'METHOD' : null
}

/* ------------------------------------------------------------------ responses */

/** Where the app runs, when ALLOWED_ORIGINS does not say. The live host calls through its own /api, so is same-origin. */
const APP_ORIGINS = 'https://summarevent.vercel.app,https://summarevent-live.vercel.app,http://localhost:5173'

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin')
  const allowed = (process.env.ALLOWED_ORIGINS || APP_ORIGINS)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const allow = allowed.includes('*') ? '*' : origin && allowed.includes(origin) ? origin : allowed[0]
  return {
    'Access-Control-Allow-Origin': allow ?? '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Guest-Id',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(req: Request, status: number, body: string): Response {
  return new Response(body, { status, headers: { ...cors(req), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
}

function errorResponse(req: Request, code: string, message: string, details?: unknown, status?: number): Response {
  return json(req, status ?? HTTP_STATUS[code] ?? 400, JSON.stringify({ code, message, ...(details ? { details } : {}) }))
}

function fromError(req: Request, e: unknown): Response {
  if (e instanceof ConvexError) {
    const d = e.data as { code?: string; message?: string; details?: unknown }
    return errorResponse(req, d.code ?? 'BAD_REQUEST', d.message ?? 'Permintaan tidak bisa diproses.', d.details)
  }
  console.error(e)
  // DEBUG_ERRORS=true (dev deployments only) puts the raw error in `details` to help find the cause
  const details = process.env.DEBUG_ERRORS === 'true' ? { error: String(e).slice(0, 500) } : undefined
  return errorResponse(req, 'SERVER_ERROR', 'Terjadi kesalahan di server. Coba lagi sebentar lagi.', details, 500)
}

/** Concurrent writes on the same rows are retried by Convex; if they still collide, try the whole call again. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      const busy = !(e instanceof ConvexError) && /OptimisticConcurrency|changed while this mutation|concurrent|conflict|overloaded|try again/i.test(String(e))
      if (!busy || attempt >= 4) throw e
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 150 * (attempt + 1)))
    }
  }
}

/* ------------------------------------------------------------------ photos */

const PHOTO = /^data:(image\/(?:jpeg|png|webp|svg\+xml))(;charset=[\w-]+)?(;base64)?,(.*)$/s
const PHOTO_MAX = 3_000_000
/** All the photos of one receipt submission together. */
const RECEIPTS_MAX = 12_000_000

/** The file really is the image its header claims: JPEG, PNG and WebP each start with their own signature. */
function isImage(mime: string, b: Uint8Array): boolean {
  if (mime === 'image/svg+xml') return /^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/.test(new TextDecoder().decode(b.slice(0, 256)))
  if (mime === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  if (mime === 'image/png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
  return String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP'
}

/**
 * A photo sent as a data URL: JPEG, PNG or WebP (checked by content, not only by name), at most PHOTO_MAX bytes. An SVG
 * only where `allowSvg` (the demo's sample receipts are drawn as SVG); receiptPhoto serves it sandboxed either way.
 */
function decodeDataUrl(url: string, allowSvg = false): Blob | null {
  const m = PHOTO.exec(url)
  if (!m) return null
  const [, mime, , b64, data] = m
  if (mime === 'image/svg+xml' && !allowSvg) return null
  let bytes: Uint8Array
  try {
    if (b64) {
      const bin = atob(data)
      bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    } else bytes = new TextEncoder().encode(decodeURIComponent(data))
  } catch {
    return null
  }
  if (bytes.length > PHOTO_MAX || !isImage(mime, bytes)) return null
  return new Blob([bytes as BlobPart], { type: mime })
}

async function submitReceipts(ctx: ActionCtx, req: Request, r: { auth: AuthInput; params: Record<string, string>; query: Record<string, string>; body: any }) {
  const receipts: unknown = r.body?.receipts
  if (!Array.isArray(receipts) || receipts.length > 10) return errorResponse(req, 'BAD_REQUEST', 'Daftar struk tidak valid.')
  // check ownership and rules first, so a rejected set never touches storage
  const dry = JSON.parse(await ctx.runQuery(internal.rpc.read, { op: 'checkReceipts', req: r })) as { checks: Array<{ ok: boolean }> }
  const storageIds: Array<Id<'_storage'> | null> = []
  if (dry.checks.every((c) => c.ok)) {
    let total = 0
    for (const item of receipts) {
      const blob = decodeDataUrl(String(item?.photoUrl ?? ''), demoEnabled())
      total += blob?.size ?? 0
      if (!blob || total > RECEIPTS_MAX) {
        for (const id of storageIds) if (id) await ctx.storage.delete(id)
        // one photo that is not an image or over 3 MB, or all of them together over 12 MB: each gets its own message
        const message = blob ? 'Total foto struk paling besar 12 MB. Kirim lebih sedikit foto, atau foto yang lebih kecil.' : 'Foto struk harus JPG, PNG, atau WebP, paling besar 3 MB.'
        return errorResponse(req, 'INVALID', message, { field: 'photoUrl' })
      }
      storageIds.push(await ctx.storage.store(blob))
    }
  }
  const body = { ...r.body, receipts: receipts.map((x: any) => ({ ...x, photoUrl: '' })) }
  try {
    return json(req, 200, await withRetry(() => ctx.runMutation(internal.rpc.submitReceipts, { req: { ...r, body }, storageIds: storageIds.length ? storageIds : receipts.map(() => null) })))
  } catch (e) {
    for (const id of storageIds) if (id) await ctx.storage.delete(id)
    return fromError(req, e)
  }
}

async function updateProfile(ctx: ActionCtx, req: Request, r: { auth: AuthInput; params: Record<string, string>; query: Record<string, string>; body: any }) {
  // all checks (login, name, email, photo format and size) before the photo is stored
  await ctx.runQuery(internal.rpc.read, { op: 'checkProfile', req: r })
  const avatar: unknown = r.body?.avatar
  let stored: Id<'_storage'> | null = null
  if (typeof avatar === 'string' && avatar) {
    const blob = decodeDataUrl(avatar)
    if (!blob) return errorResponse(req, 'INVALID', 'Foto harus JPG, PNG, atau WebP, paling besar 300 KB.', { field: 'avatar' })
    stored = await ctx.storage.store(blob)
  }
  const body = { ...r.body, avatar: undefined }
  try {
    const arg = avatar === undefined ? {} : { avatar: stored ? { storageId: stored } : null }
    return json(req, 200, await withRetry(() => ctx.runMutation(internal.rpc.updateProfile, { req: { ...r, body }, ...arg })))
  } catch (e) {
    if (stored) await ctx.storage.delete(stored)
    throw e
  }
}

async function receiptPhoto(ctx: ActionCtx, req: Request, id: string, exp: string | null, sig: string | null) {
  if (!sig || !(await verifyReceiptPhotoSig(id, exp, sig))) return errorResponse(req, 'FORBIDDEN', 'Link foto struk tidak sah atau sudah kedaluwarsa.')
  const storageId = await ctx.runQuery(internal.rpc.receiptPhoto, { receiptId: id })
  const blob = storageId ? await ctx.storage.get(storageId) : null
  if (!blob) return errorResponse(req, 'NOT_FOUND', 'Foto struk tidak ditemukan.')
  return new Response(blob, {
    status: 200,
    headers: {
      ...cors(req),
      'Content-Type': blob.type || 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      // an uploaded SVG can never run script from this origin
      'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
    },
  })
}

/* ------------------------------------------------------------------ rate limit */

/**
 * Requests a script could flood: seat holds (fake sell-outs), OTP and password guessing, receipt uploads. Counted per
 * client address in a 10-minute window, generous enough for a whole family on one mall Wi-Fi.
 */
const LIMITS: Record<string, number> = {
  createHold: 60,
  autoHold: 60,
  requestOtp: 20,
  verifyOtp: 40,
  login: 30,
  forgotPassword: 10,
  submitReceipts: 20,
}
const LIMIT_WINDOW_MS = 10 * 60_000

/**
 * The caller's address; none means the check is skipped. Through the live host's /api rewrite every request reaches
 * Convex from a Vercel server, so x-forwarded-for names Vercel and all visitors would share one limit: Vercel puts the
 * visitor in x-vercel-forwarded-for (checked on summarevent-live, 2026-11-08). A direct caller could set that header
 * itself and dodge this limit, which is why the per-account and per-phone limits do not depend on it.
 */
function clientIp(req: Request): string | null {
  const first = (name: string) => req.headers.get(name)?.split(',')[0]?.trim()
  return first('x-vercel-forwarded-for') || first('x-forwarded-for') || first('x-real-ip') || null
}

/* ------------------------------------------------------------------ the handler */

const handle = httpAction(async (ctx, req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) })
  const url = new URL(req.url)
  const path = url.pathname.slice(PREFIX.length) || '/'
  const found = match(req.method, path)
  if (found === 'METHOD') return errorResponse(req, 'BAD_REQUEST', `Metode ${req.method} tidak didukung untuk ${path}.`, undefined, 405)
  if (!found) return errorResponse(req, 'NOT_FOUND', 'Alamat API tidak dikenal.')
  const { route, params } = found
  // demo routes (and the demo sign-in) exist only on a deployment that turns the demo on (lib/demo.ts)
  if ((route.pattern.startsWith('/demo/') || route.pattern === '/auth/demo-login') && !demoEnabled()) return errorResponse(req, 'FORBIDDEN', 'Fitur demo dimatikan di server ini.')
  const limit = LIMITS[route.op]
  const ip = limit ? clientIp(req) : null
  if (limit && ip && !(await ctx.runMutation(internal.rpc.rateHit, { key: `${route.op}:${ip}`, limit, windowMs: LIMIT_WINDOW_MS }))) {
    return errorResponse(req, 'RATE_LIMIT', 'Terlalu banyak permintaan dari jaringan ini. Coba lagi beberapa menit lagi.')
  }

  let body: any = undefined
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    const text = await req.text()
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        return errorResponse(req, 'BAD_REQUEST', 'Isi permintaan bukan JSON yang valid.')
      }
    }
  }
  const bearer = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null
  const auth: AuthInput = { token: bearer, guestId: req.headers.get('X-Guest-Id') }
  const query: Record<string, string> = {}
  for (const [k, v] of url.searchParams) query[k] = v
  const r = { auth, params, query, body: body ?? null }

  try {
    if (route.kind === 'read') return json(req, 200, await ctx.runQuery(internal.rpc.read, { op: route.op, req: r }))
    if (route.kind === 'write') {
      const out = await withRetry(() => ctx.runMutation(internal.rpc.write, { op: route.op, req: r }))
      if (out.startsWith(REFUSED_PREFIX)) {
        const { code, message, details } = (JSON.parse(out) as Record<string, { code: string; message: string; details?: unknown }>)[REFUSED]
        return errorResponse(req, code, message, details)
      }
      return json(req, 200, out)
    }
    switch (route.op) {
      case 'health': {
        const h = await ctx.runQuery(internal.rpc.health, {})
        return json(req, 200, JSON.stringify({ ok: h.seeded, database: h.seeded ? 'ok' : 'empty', version: VERSION, demo: demoEnabled() }))
      }
      case 'reset':
        await ctx.runMutation(internal.rpc.reset, {})
        return json(req, 200, JSON.stringify({ ok: true }))
      case 'submitReceipts':
        return await submitReceipts(ctx, req, r)
      case 'updateProfile':
        return await updateProfile(ctx, req, r)
      case 'receiptPhoto':
        return await receiptPhoto(ctx, req, params.id, url.searchParams.get('exp'), url.searchParams.get('sig'))
    }
    return errorResponse(req, 'NOT_FOUND', 'Alamat API tidak dikenal.')
  } catch (e) {
    return fromError(req, e)
  }
})

const http = httpRouter()
for (const method of ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] as const) http.route({ pathPrefix: `${PREFIX}/`, method, handler: handle })
export default http
