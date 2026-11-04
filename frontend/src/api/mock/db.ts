/**
 * Storage for the core API (adapter.ts): localStorage with real transactions. Every write runs
 * inside `transaction()`, which takes a cross-tab Web Lock (navigator.locks) and re-reads the
 * latest state before mutating, so two tabs that try to hold the same seat at the same moment
 * are serialised and exactly one wins.
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

/** A panitia or petugas password: only its SHA-256 is kept, plus the recent failed attempts (rate limit). */
export interface PasswordEntry {
  userId: string
  hash: string
  fails: string[]
}

/** A one-time password reset link: valid for 30 minutes, then or once used it is gone. */
export interface ResetToken {
  token: string
  userId: string
  expiresAt: string
}

export interface Db {
  schema: 4
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
  passwords: PasswordEntry[]
  resetTokens: ResetToken[]
}

/** Everything the core API needs from its environment: storage, change events and "who is calling". */
interface DbDriver {
  hasDb(): boolean
  /** Latest committed state (read-only snapshot – do not mutate). */
  readDb(): Db | null
  replaceDb(db: Db): void | Promise<void>
  clearDb(): void | Promise<void>
  subscribe(listener: () => void): () => void
  /** Run `fn` on a mutable copy; commit only if it resolves, roll everything back if it throws. */
  transaction<T>(fn: (db: Db) => T | Promise<T>): Promise<T>
  getSessionUserId(role: string): string | null
  setSessionUserId(role: string, userId: string | null): void
  /** Anonymous visitor id so seats can be held before login (PRD flow: hold → login). */
  guestId(): string
  clearClientSessions(): void
}

/* ================================================================== */
/* browser driver (localStorage + Web Locks)                           */
/* ================================================================== */

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

function browserReadDb(): Db | null {
  const raw = readRaw()
  if (raw == null) return null
  if (raw === cacheRaw && cacheDb) return cacheDb
  try {
    const parsed = JSON.parse(raw) as Db
    if (parsed.schema !== 4) return null
    cacheRaw = raw
    cacheDb = parsed
    return parsed
  } catch {
    return null
  }
}

/* ---------------- change notifications (created on first use) ---------------- */

const local = new EventTarget()
let channel: BroadcastChannel | null = null
let wired = false

function wireCrossTab() {
  if (wired) return
  wired = true
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
}

function browserNotify() {
  wireCrossTab()
  local.dispatchEvent(new Event('change'))
  channel?.postMessage('change')
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

/* ---------------- client session (who is logged in, per role) ---------------- */

const SESSION_KEY = (role: string) => `summarevent:session:${role}`
const GUEST_KEY = 'summarevent:guest'

const browserDriver: DbDriver = {
  hasDb: () => readRaw() != null,
  readDb: browserReadDb,
  replaceDb(db) {
    const raw = JSON.stringify(db)
    writeRaw(raw)
    cacheRaw = raw
    cacheDb = db
    browserNotify()
  },
  clearDb() {
    try {
      localStorage.removeItem(DB_KEY)
    } catch {
      /* ignore */
    }
    memoryRaw = null
    cacheRaw = null
    cacheDb = null
  },
  subscribe(listener) {
    wireCrossTab()
    const h = () => listener()
    local.addEventListener('change', h)
    return () => local.removeEventListener('change', h)
  },
  transaction<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
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
        browserNotify()
      }
      return result
    })
  },
  getSessionUserId(role) {
    try {
      return localStorage.getItem(SESSION_KEY(role))
    } catch {
      return null
    }
  },
  setSessionUserId(role, userId) {
    try {
      if (userId) localStorage.setItem(SESSION_KEY(role), userId)
      else localStorage.removeItem(SESSION_KEY(role))
    } catch {
      /* ignore */
    }
  },
  guestId() {
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
  },
  clearClientSessions() {
    try {
      for (const role of ['VISITOR', 'ADMIN', 'STAFF']) localStorage.removeItem(SESSION_KEY(role))
      localStorage.removeItem(GUEST_KEY)
    } catch {
      /* ignore */
    }
  },
}

/* ================================================================== */
/* active driver                                                       */
/* ================================================================== */

const driver: DbDriver = browserDriver

export const hasDb = () => driver.hasDb()
export const readDb = () => driver.readDb()
export const replaceDb = (db: Db) => driver.replaceDb(db)
export const clearDb = () => driver.clearDb()
export const subscribe = (listener: () => void) => driver.subscribe(listener)
export const transaction = <T>(fn: (db: Db) => T | Promise<T>): Promise<T> => driver.transaction(fn)
export const getSessionUserId = (role: string) => driver.getSessionUserId(role)
export const setSessionUserId = (role: string, userId: string | null) => driver.setSessionUserId(role, userId)
export const guestId = () => driver.guestId()
export const clearClientSessions = () => driver.clearClientSessions()
