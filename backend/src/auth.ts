/**
 * Session tokens: `base64url(JSON {r: role, u: userId, e: expiry}).HMAC-SHA256`. Stateless, so any
 * server instance can verify them. The secret comes from SESSION_SECRET (never shipped to the browser).
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Role } from './context'

const ROLES: Role[] = ['VISITOR', 'ADMIN', 'STAFF']
const TTL_SECONDS = 60 * 60 * 24 * 14

function secret(): string {
  const s = process.env.SESSION_SECRET
  if (!s && process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET wajib diisi di produksi')
  return s ?? 'summarevent-dev-session-secret'
}

function mac(body: string): string {
  return createHmac('sha256', secret()).update(body).digest('base64url')
}

export function signToken(role: Role, userId: string, ttlSeconds = TTL_SECONDS): string {
  const body = Buffer.from(JSON.stringify({ r: role, u: userId, e: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url')
  return `${body}.${mac(body)}`
}

export function verifyToken(token: string): { role: Role; userId: string } | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = Buffer.from(mac(body))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const { r, u, e } = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { r: Role; u: string; e: number }
    if (!ROLES.includes(r) || typeof u !== 'string' || !u || e < Date.now() / 1000) return null
    return { role: r, userId: u }
  } catch {
    return null
  }
}

/** HMAC for links that must not be guessable (receipt photos are private, PRD §12). */
export function signPath(path: string): string {
  return mac(`path:${path}`).slice(0, 32)
}

export function verifyPath(path: string, sig: string | undefined): boolean {
  if (!sig) return false
  const expected = Buffer.from(signPath(path))
  const given = Buffer.from(sig)
  return expected.length === given.length && timingSafeEqual(expected, given)
}
