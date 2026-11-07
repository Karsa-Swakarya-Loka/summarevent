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

/** How long a sign-in lasts: a working day for panitia and petugas, a month for a visitor's phone. */
const TOKEN_HOURS: Record<Role, number> = { ADMIN: 12, STAFF: 12, VISITOR: 30 * 24 }

async function tokenRow(tx: Tx, token: string) {
  const hash = await sha256Hex(token)
  return tx.ctx.db
    .query('authTokens')
    .withIndex('by_token', (q) => q.eq('tokenHash', hash))
    .unique()
}

/** The user behind the bearer token, if any (any role). An expired token counts as none. */
export async function tokenUser(tx: Tx, auth: AuthInput): Promise<{ user: User; role: Role } | null> {
  if (!auth.token) return null
  const row = await tokenRow(tx, auth.token)
  if (!row) return null
  if (tx.now.getTime() - new Date(row.createdAt).getTime() > TOKEN_HOURS[row.role] * 3_600_000) return null
  const user = await tx.get<User>('users', row.userId)
  if (!user || user.role !== row.role) return null
  return { user, role: row.role }
}

/** Sign out everywhere: every token of the user. */
export async function revokeTokens(tx: Tx, userId: string) {
  for (const row of await tx.mctx.db
    .query('authTokens')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect())
    await tx.mctx.db.delete(row._id)
}

/** POST /auth/logout: the token of this sign-in stops working. Answers the same whether or not it was valid. */
export async function logout(tx: Tx, req: Req) {
  const row = req.auth.token ? await tokenRow(tx, req.auth.token) : null
  if (row) await tx.mctx.db.delete(row._id)
  return { ok: true }
}

/** The signed-in visitor, or null for a guest. */
export async function visitorUser(tx: Tx, auth: AuthInput): Promise<User | null> {
  const t = await tokenUser(tx, auth)
  return t?.role === 'VISITOR' ? t.user : null
}

/** What a request without a usable guest id is: nobody in particular, so it can never own or claim anything. */
export const ANONYMOUS = 'guest_anonymous'

/** The guest id of the browser (a guest id can never name a real account). */
export function guestOf(auth: AuthInput): string {
  return auth.guestId && GUEST.test(auth.guestId) ? auth.guestId : ANONYMOUS
}

/** Owner id for visitor data: the signed-in visitor, else the browser's guest id (same as the mock's visitorId()). */
export async function visitorId(tx: Tx, auth: AuthInput): Promise<string> {
  return (await visitorUser(tx, auth))?.id ?? guestOf(auth)
}

/**
 * The owner id for something a visitor is about to own or touch (a hold, an order). Every caller without a sign-in or
 * a guest id of its own would otherwise share ANONYMOUS, and so each other's orders, so such a request is refused.
 */
export async function ownerId(tx: Tx, auth: AuthInput): Promise<string> {
  const id = await visitorId(tx, auth)
  if (id === ANONYMOUS) fail('BAD_REQUEST', 'Identitas browser tidak ada. Muat ulang halamannya lalu coba lagi.')
  return id
}

export async function requireRole(tx: Tx, auth: AuthInput, role: Role): Promise<User> {
  const t = await tokenUser(tx, auth)
  if (!t || t.role !== role) fail('NEED_LOGIN', role === 'ADMIN' ? 'Masuk sebagai panitia dulu.' : role === 'STAFF' ? 'Masuk sebagai petugas dulu.' : 'Masuk dulu.')
  // a petugas switched off by the panitia loses every read and write at once, not only check-in
  if (t.user.active === false) fail('FORBIDDEN', 'Akun ini dinonaktifkan panitia.')
  return t.user
}

/** Issue a bearer token for a user (stored as its hash). */
export async function issueToken(tx: Tx, user: User): Promise<string> {
  const token = newToken()
  await tx.mctx.db.insert('authTokens', { tokenHash: await sha256Hex(token), userId: user.id, role: user.role, createdAt: tx.now.toISOString() })
  return token
}
