/**
 * Signed QR tokens (PRD §11): the QR holds ticket id + qr_version + an HMAC, so it
 * cannot be guessed or forged. Format: `SEV1.<ticketId>.<qrVersion>.<signature>`.
 *
 * In the frontend-only prototype the key lives in the bundle (demo only). The real
 * backend signs and verifies server-side with a secret the browser never sees.
 */
const DEMO_SECRET = 'summarevent-demo-secret-2026'
const PREFIX = 'SEV1'

let keyPromise: Promise<CryptoKey> | null = null
function key(): Promise<CryptoKey> {
  keyPromise ??= crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(DEMO_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
  return keyPromise
}

function b64url(buf: ArrayBuffer): string {
  let s = ''
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sign(payload: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await key(), new TextEncoder().encode(payload))
  return b64url(sig).slice(0, 22)
}

export async function makeQrToken(ticketId: string, qrVersion: number): Promise<string> {
  const payload = `${ticketId}.${qrVersion}`
  return `${PREFIX}.${payload}.${await sign(payload)}`
}

export type ParsedToken = { ok: true; ticketId: string; qrVersion: number } | { ok: false }

export async function verifyQrToken(token: string): Promise<ParsedToken> {
  const parts = token.trim().split('.')
  if (parts.length !== 4 || parts[0] !== PREFIX) return { ok: false }
  const [, ticketId, versionStr, sig] = parts
  const qrVersion = Number(versionStr)
  if (!ticketId || !Number.isInteger(qrVersion)) return { ok: false }
  const expected = await sign(`${ticketId}.${qrVersion}`)
  if (expected.length !== sig.length) return { ok: false }
  // constant-time-ish compare
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  return diff === 0 ? { ok: true, ticketId, qrVersion } : { ok: false }
}

/** SHA-256 hex of bytes (receipt photo hash, R6). */
export async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
