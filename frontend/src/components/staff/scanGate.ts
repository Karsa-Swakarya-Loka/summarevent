/**
 * PT-04 anti double scan for the camera. The camera reports the QR in front of it about every 400 ms, so a ticket that
 * stays in front of the lens is seen again and again. Those sightings are one scan: the same QR only counts again after
 * it has been out of sight for SAME_TOKEN_GAP_MS. Without this, a visitor who keeps the phone up after a green Valid
 * would get a red "Sudah digunakan" a few seconds later for their own, just admitted, ticket.
 */
export const SAME_TOKEN_GAP_MS = 2500

export interface Seen {
  readonly token: string
  readonly at: number
}

export interface GateResult {
  /** Check this token in now. */
  readonly accept: boolean
  /** What to remember for the next sighting. */
  readonly seen: Seen | null
}

/**
 * @param busy a request is running or a result is on screen: nothing new starts, but the QR being looked at is still
 *   tracked so it does not count as new the moment the result closes.
 */
export function gateScan(prev: Seen | null, raw: string, now: number, busy: boolean): GateResult {
  const token = raw.trim()
  if (!token) return { accept: false, seen: prev }
  const same = prev?.token === token
  if (busy) return { accept: false, seen: same ? { token, at: now } : prev }
  if (same && prev && now - prev.at < SAME_TOKEN_GAP_MS) return { accept: false, seen: { token, at: now } }
  return { accept: true, seen: { token, at: now } }
}
