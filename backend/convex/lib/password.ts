/**
 * Panitia and petugas passwords: PBKDF2-SHA256 with a random salt per password, stored as
 * `pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>` so the cost can be raised later without breaking old hashes.
 */
const ALGO = 'pbkdf2-sha256'
const ITERATIONS = 100_000
const enc = new TextEncoder()

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256)
  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `${ALGO}$${ITERATIONS}$${b64(salt)}$${b64(await derive(password, salt, ITERATIONS))}`
}

/** A stored hash nobody's password matches: checked for unknown emails too, so both answers take as long. */
const DUMMY = `${ALGO}$${ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const [algo, iter, salt, hash] = (stored ?? DUMMY).split('$')
  const iterations = Number(iter)
  if (algo !== ALGO || !Number.isInteger(iterations) || !salt || !hash) return false
  const got = await derive(password, unb64(salt), iterations)
  const want = unb64(hash)
  if (got.length !== want.length) return false
  let diff = 0
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i]
  return diff === 0 && stored !== null
}
