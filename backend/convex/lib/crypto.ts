/**
 * Server-side signing (PRD §11). The secret is the deployment's `APP_SECRET` env var and never leaves the server:
 * - QR tokens: `SEV1.<ticketId>.<qrVersion>.<HMAC-SHA256 base64url, 22 chars>`
 * - receipt photo links: `/receipt-photos/:id?sig=<HMAC>`
 */
import { fail } from './errors'

const PREFIX = 'SEV1'
const enc = new TextEncoder()

function secret(): string {
  const s = process.env.APP_SECRET
  if (!s) fail('NOT_READY', 'Server belum dikonfigurasi (APP_SECRET belum diisi).')
  return s
}

let keyCache: { secret: string; key: Promise<CryptoKey> } | null = null
function key(): Promise<CryptoKey> {
  const s = secret()
  if (keyCache?.secret !== s) {
    keyCache = { secret: s, key: crypto.subtle.importKey('raw', enc.encode(s), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']) }
  }
  return keyCache.key
}

function b64url(buf: ArrayBuffer): string {
  let s = ''
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sign(purpose: string, payload: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await key(), enc.encode(`${purpose}:${payload}`))
  return b64url(sig).slice(0, 22)
}

/** Compares two strings in time that does not depend on where they first differ. */
export function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function makeQrToken(ticketId: string, qrVersion: number): Promise<string> {
  const payload = `${ticketId}.${qrVersion}`
  return `${PREFIX}.${payload}.${await sign('qr', payload)}`
}

export type ParsedToken = { ok: true; ticketId: string; qrVersion: number } | { ok: false }

export async function verifyQrToken(token: string): Promise<ParsedToken> {
  const parts = token.trim().split('.')
  if (parts.length !== 4 || parts[0] !== PREFIX) return { ok: false }
  const [, ticketId, versionStr, sig] = parts
  const qrVersion = Number(versionStr)
  if (!ticketId || !Number.isInteger(qrVersion)) return { ok: false }
  return sameString(await sign('qr', `${ticketId}.${qrVersion}`), sig) ? { ok: true, ticketId, qrVersion } : { ok: false }
}

/** A receipt photo link works until `exp` (ms since epoch), which is signed with the receipt id. */
export function receiptPhotoSig(receiptId: string, exp: number): Promise<string> {
  return sign('receipt-photo', `${receiptId}.${exp}`)
}

export async function verifyReceiptPhotoSig(receiptId: string, exp: string | null, sig: string, now = Date.now()): Promise<boolean> {
  const until = Number(exp)
  if (!Number.isInteger(until) || until < now) return false
  return sameString(await receiptPhotoSig(receiptId, until), sig)
}

export async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
  const bytes = typeof data === 'string' ? enc.encode(data) : data
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** A random bearer token for a login. */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
