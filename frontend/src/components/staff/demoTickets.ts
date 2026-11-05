/**
 * "Alat demo": lets a judge with only a laptop run real tickets through the
 * normal check-in path. Uses only the public StaffApi (searchTickets), so it works
 * against the mock and the HTTP backend alike.
 */
import { api, type TicketSearchRow } from '@/api'

const OPEN_KEY = 'summarevent:staff:demo-open'

/** Whether the demo tools start open on this phone. A per-device convenience, so it lives in localStorage. */
export function loadDemoToolsOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === '1'
  } catch {
    return false
  }
}

export function saveDemoToolsOpen(open: boolean) {
  try {
    localStorage.setItem(OPEN_KEY, open ? '1' : '0')
  } catch {
    /* blocked storage: the panel just starts closed next time */
  }
}

/** searchTickets returns at most this many rows. */
const PAGE = 30
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * All tickets of an event. searchTickets is capped at 30 rows, so when a prefix
 * query is saturated it is refined one character at a time ("TKT-" → "TKT-A" …).
 */
export async function fetchEventTickets(eventId: string): Promise<TicketSearchRow[]> {
  const seen = new Map<string, TicketSearchRow>()
  const queue = ['TKT-']
  let calls = 0
  while (queue.length && calls < 300) {
    const batch = queue.splice(0, 12)
    calls += batch.length
    const results = await Promise.all(batch.map(async (q) => ({ q, rows: await api.staff.searchTickets(q, eventId) })))
    for (const { q, rows } of results) {
      for (const r of rows) seen.set(r.ticket.id, r)
      if (rows.length >= PAGE && q.length < 10) for (const c of CHARS) queue.push(q + c)
    }
  }
  return [...seen.values()]
}

export function pickRandom<T>(list: T[]): T | undefined {
  if (!list.length) return undefined
  return list[crypto.getRandomValues(new Uint32Array(1))[0] % list.length]
}

/** A copied QR with an edited signature – exactly what a forged screenshot looks like to the server. */
export function tamperToken(token: string | undefined): string {
  if (!token) return 'SEV1.tkt_palsu.1.AAAAAAAAAAAAAAAAAAAAAA'
  const parts = token.split('.')
  if (parts.length !== 4) return `${token}X`
  const sig = parts[3]
  parts[3] = sig.slice(0, -4) + (sig.endsWith('AAAA') ? 'BBBB' : 'AAAA')
  return parts.join('.')
}
