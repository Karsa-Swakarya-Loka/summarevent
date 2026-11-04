/**
 * Who is calling. Every request carries `X-Guest-Id: guest_…` (an anonymous visitor, so seats can be held before
 * login) and, once logged in, `Authorization: Bearer <token>` for the role of the page (docs/API-CONTRACT.md "Auth").
 */
import type { Role, User } from '../shared/types'
import { newToken, sha256Hex } from './crypto'
import { fail } from './errors'
import type { Tx } from './tx'

export interface AuthInput {
  token: string | null
  guestId: string | null
}

export interface Req {
  auth: AuthInput
  params: Record<string, string>
  query: Record<string, string>
  body: any
}

const GUEST = /^guest_[A-Za-z0-9_-]{4,64}$/

/** The user behind the bearer token, if any (any role). */
export async function tokenUser(tx: Tx, auth: AuthInput): Promise<{ user: User; role: Role } | null> {
  if (!auth.token) return null
  const hash = await sha256Hex(auth.token)
  const row = await tx.ctx.db
    .query('authTokens')
    .withIndex('by_token', (q) => q.eq('tokenHash', hash))
    .unique()
  if (!row) return null
  const user = await tx.get<User>('users', row.userId)
  if (!user || user.role !== row.role) return null
  return { user, role: row.role }
}

/** The signed-in visitor, or null for a guest. */
export async function visitorUser(tx: Tx, auth: AuthInput): Promise<User | null> {
  const t = await tokenUser(tx, auth)
  return t?.role === 'VISITOR' ? t.user : null
}

/** The guest id of the browser (a guest id can never name a real account). */
export function guestOf(auth: AuthInput): string {
  return auth.guestId && GUEST.test(auth.guestId) ? auth.guestId : 'guest_anonymous'
}

/** Owner id for visitor data: the signed-in visitor, else the browser's guest id (same as the mock's visitorId()). */
export async function visitorId(tx: Tx, auth: AuthInput): Promise<string> {
  return (await visitorUser(tx, auth))?.id ?? guestOf(auth)
}

export async function requireRole(tx: Tx, auth: AuthInput, role: Role): Promise<User> {
  const t = await tokenUser(tx, auth)
  if (!t || t.role !== role) fail('NEED_LOGIN', role === 'ADMIN' ? 'Masuk sebagai panitia dulu.' : role === 'STAFF' ? 'Masuk sebagai petugas dulu.' : 'Masuk dulu.')
  return t.user
}

/** Issue a bearer token for a user (stored as its hash). */
export async function issueToken(tx: Tx, user: User): Promise<string> {
  const token = newToken()
  await tx.mctx.db.insert('authTokens', { tokenHash: await sha256Hex(token), userId: user.id, role: user.role, createdAt: tx.now.toISOString() })
  return token
}
