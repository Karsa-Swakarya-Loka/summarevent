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
