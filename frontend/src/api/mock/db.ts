/**
 * In-browser mock database (localStorage) with real transactions.
 *
 * Every write runs inside `transaction()`, which takes a cross-tab Web Lock
 * (navigator.locks) and re-reads the latest state before mutating. That is the
 * browser equivalent of the backend's DB transaction + row lock (PRD §8): two tabs
 * that try to hold the same seat at the same moment are serialised, so exactly one wins.
 */
import type {
  AppNotification,
  Checkin,
  EventItem,
  Order,
  Payment,
  Receipt,
  Seat,
  SeatLayout,
  Session,
  SessionQuota,
  SessionSeat,
  Tenant,
  Ticket,
  TicketCategory,
  User,
  Venue,
  WaitlistEntry,
} from '@/domain/types'

export interface OtpEntry {
  phone: string
  code: string
  expiresAt: string
  requests: string[]
}

export interface Db {
  schema: 3
  version: number
  seededAt: string
  users: User[]
  venues: Venue[]
  tenants: Tenant[]
  layouts: SeatLayout[]
  seats: Seat[]
  events: EventItem[]
  categories: TicketCategory[]
  sessions: Session[]
  sessionSeats: SessionSeat[]
  /** `filled` is recomputed on read from orders; stored value is informational. */
  quotas: SessionQuota[]
  orders: Order[]
  payments: Payment[]
  receipts: Receipt[]
  tickets: Ticket[]
  checkins: Checkin[]
  notifications: AppNotification[]
  otps: OtpEntry[]
  waitlist: WaitlistEntry[]
}

const DB_KEY = 'summarevent:db:v3'
const LOCK_NAME = 'summarevent-db'
const CHANNEL = 'summarevent'

let cacheRaw: string | null = null
let cacheDb: Db | null = null
/** In-memory fallback when localStorage is blocked (private mode, previews). */
let memoryRaw: string | null = null

function readRaw(): string | null {
  try {
    return localStorage.getItem(DB_KEY)
  } catch {
    return memoryRaw
  }
}

function writeRaw(raw: string) {
  memoryRaw = raw
  try {
    localStorage.setItem(DB_KEY, raw)
  } catch {
    /* quota or blocked storage – keep the in-memory copy */
  }
}

export function hasDb(): boolean {
  return readRaw() != null
}

/** Latest committed state (read-only snapshot – do not mutate). */
export function readDb(): Db | null {
  const raw = readRaw()
  if (raw == null) return null
  if (raw === cacheRaw && cacheDb) return cacheDb
  try {
    const parsed = JSON.parse(raw) as Db
    if (parsed.schema !== 3) return null
    cacheRaw = raw
    cacheDb = parsed
    return parsed
  } catch {
    return null
  }
}

export function replaceDb(db: Db) {
  const raw = JSON.stringify(db)
  writeRaw(raw)
  cacheRaw = raw
  cacheDb = db
  notify()
}

export function clearDb() {
  try {
    localStorage.removeItem(DB_KEY)
  } catch {
    /* ignore */
  }
  memoryRaw = null
  cacheRaw = null
  cacheDb = null
}

/* ---------------- change notifications ---------------- */

const local = new EventTarget()
let channel: BroadcastChannel | null = null
try {
  channel = new BroadcastChannel(CHANNEL)
  channel.onmessage = () => local.dispatchEvent(new Event('change'))
} catch {
  channel = null
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === DB_KEY) local.dispatchEvent(new Event('change'))
  })
}

export function notify() {
  local.dispatchEvent(new Event('change'))
  channel?.postMessage('change')
}

export function subscribe(listener: () => void): () => void {
  const h = () => listener()
  local.addEventListener('change', h)
  return () => local.removeEventListener('change', h)
}

/* ---------------- transactions ---------------- */

let inTabQueue: Promise<unknown> = Promise.resolve()

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (typeof navigator !== 'undefined' ? navigator.locks : undefined) as LockManager | undefined
  if (locks?.request) {
    return locks.request(LOCK_NAME, { mode: 'exclusive' }, fn) as Promise<T>
  }
  // Fallback (non-secure context, e.g. plain-http LAN): serialise within this tab.
  const run = inTabQueue.then(fn, fn)
  inTabQueue = run.catch(() => undefined)
  return run
}

/**
 * Run `fn` with exclusive access to a fresh, mutable copy of the DB.
 * Changes are committed only if `fn` resolves; a thrown error rolls everything back.
 */
export function transaction<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  return withLock(async () => {
    const raw = readRaw()
    if (raw == null) throw new Error('Database belum siap')
    const draft = JSON.parse(raw) as Db
    const before = raw
    const result = await fn(draft)
    const after = JSON.stringify(draft)
    if (after !== before) {
      draft.version += 1
      const committed = JSON.stringify(draft)
      writeRaw(committed)
      cacheRaw = committed
      cacheDb = draft
      notify()
    }
    return result
  })
}

/* ---------------- client session (who is logged in, per role) ---------------- */

const SESSION_KEY = (role: string) => `summarevent:session:${role}`
const GUEST_KEY = 'summarevent:guest'

export function getSessionUserId(role: string): string | null {
  try {
    return localStorage.getItem(SESSION_KEY(role))
  } catch {
    return null
  }
}

export function setSessionUserId(role: string, userId: string | null) {
  try {
    if (userId) localStorage.setItem(SESSION_KEY(role), userId)
    else localStorage.removeItem(SESSION_KEY(role))
  } catch {
    /* ignore */
  }
}

/** Anonymous visitor id so seats can be held before login (PRD flow: hold → login). */
export function guestId(): string {
  try {
    let id = localStorage.getItem(GUEST_KEY)
    if (!id) {
      id = `guest_${crypto.randomUUID().slice(0, 12)}`
      localStorage.setItem(GUEST_KEY, id)
    }
    return id
  } catch {
    return 'guest_memory'
  }
}

export function clearClientSessions() {
  try {
    for (const role of ['VISITOR', 'ADMIN', 'STAFF']) localStorage.removeItem(SESSION_KEY(role))
    localStorage.removeItem(GUEST_KEY)
  } catch {
    /* ignore */
  }
}
