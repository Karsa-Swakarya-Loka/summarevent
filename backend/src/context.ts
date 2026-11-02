/**
 * Who is calling, per request. The core logic asks "which user is logged in as VISITOR / ADMIN /
 * STAFF?" and "what is this anonymous visitor's id?"; in the browser that comes from localStorage,
 * on the server it comes from the Bearer token and the X-Guest-Id header of the current request.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

export type Role = 'VISITOR' | 'ADMIN' | 'STAFF'

export interface RequestContext {
  /** Users authenticated for this request, by role (from the Bearer token). */
  users: Partial<Record<Role, string>>
  /** Anonymous visitor id (X-Guest-Id), so seats can be held before login. */
  guest: string
  /** Logins performed during this request (verifyOtp / demoLogin) → tokens to hand back. */
  issued: { role: Role; userId: string | null }[]
  /** Public base URL of this API, for absolute links such as receipt photos. */
  baseUrl: string
}

const store = new AsyncLocalStorage<RequestContext>()

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return store.run(ctx, fn)
}

export function currentContext(): RequestContext | undefined {
  return store.getStore()
}

const GUEST_RE = /^guest_[A-Za-z0-9-]{6,40}$/

export function sanitizeGuest(raw: string | undefined | null): string | null {
  return raw && GUEST_RE.test(raw) ? raw : null
}
