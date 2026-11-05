// GENERATED from frontend/src/api/mock/db.ts (types only) by scripts/sync-domain.mjs. Do not edit here.
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
} from './types'

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
