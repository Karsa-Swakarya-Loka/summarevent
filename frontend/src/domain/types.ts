/**
 * Summarevent domain types.
 *
 * These mirror the data model in PRD v1.2 §10 and are the contract between the
 * frontend and the backend (see docs/API-CONTRACT.md). The in-browser mock
 * (src/api/mock) and the HTTP adapter (src/api/http.ts) both speak these types.
 *
 * Dates are ISO 8601 strings (UTC). Money is an integer number of rupiah.
 */

export type Role = 'VISITOR' | 'ADMIN' | 'STAFF'

export interface User {
  id: string
  role: Role
  name: string
  phone: string
  email?: string | null
  /** Profile photo (PV-06): a data URL in the demo, a storage URL from the backend. */
  avatarUrl?: string | null
  createdAt: string
  /** AD-13: staff accounts can be switched off by the panitia (default active). */
  active?: boolean
}

export interface Venue {
  id: string
  name: string
  /** Capacity is an assumption (PRD §16), configurable. */
  capacity: number
}

export interface Tenant {
  id: string
  name: string
  category: string
}

export type SeatingMode = 'RESERVED' | 'GENERAL'
export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'ENDED'
export type AccessMethod = 'PAID' | 'FREE' | 'RECEIPT'

export interface SeatLayout {
  id: string
  venueId: string
  name: string
  rows: number
  seatsPerRow: number
  /** Seat number after which the aisle sits (e.g. 7 → aisle between 7 and 8). */
  aisleAfter: number | null
  /** Rows bend around the stage, the ends of each row closer to it than the middle. Absent: straight rows. */
  curved?: boolean
}

export interface Seat {
  id: string
  layoutId: string
  row: string
  number: number
  /** Grid position in seat units (aisle already applied). */
  x: number
  y: number
  isPriority: boolean
}

export interface EventRules {
  maxSeatsPerOrder: number
  paymentHoldMin: number
  receiptHoldMin: number
  checkinOpenMin: number
  /** Minutes before the session END when check-in closes (0 = closes at end). */
  checkinCloseMin: number
  transferable: boolean
  reentryAllowed: boolean
}

export interface ReceiptRules {
  minSpend: number
  allowMultiple: boolean
  maxReceiptsCombined: number
  maxReceiptsPerTenantDay: number
  sameDayRequired: boolean
  /** "HH:MM", local mall time. */
  cutoffTime: string
  excludedTenantIds: string[]
}

export interface TicketCategory {
  id: string
  eventId: string
  name: string
  /** Hex colour for the seat map. Never status green/yellow/red. */
  color: string
  accessMethod: AccessMethod
  price: number
  /** Only for GENERAL (no seat number) categories; seat categories count their seats. */
  quota: number | null
  saleStart: string
  /** Sales close this many minutes before each session starts. */
  saleCloseMinBeforeSession: number
  description?: string
  receiptRules?: ReceiptRules
  /** P1: bonus for the first N buyers. */
  bonusFirstN?: number | null
  bonusDesc?: string | null
}

export interface SeatAssignment {
  categoryId: string | null
  blocked: boolean
}

export interface EventItem {
  id: string
  slug: string
  title: string
  subtitle?: string
  description: string
  /** Key of the generated poster theme: the poster itself when there is no picture, its colours and label otherwise. */
  posterTheme: PosterTheme
  /**
   * The panitia's own poster picture (a data URL in the demo, an https address from a backend); none draws the theme.
   * Only the event lists, the event page and the wizard's draft carry it; rows leave it out (eventRow in domain/rules).
   */
  posterImage?: string
  /** The panitia's own poster colours over the theme's; the visitor's ticket carries them too. */
  posterPalette?: PosterPalette
  venueId: string
  layoutId: string | null
  seatingMode: SeatingMode
  status: EventStatus
  startAt: string
  endAt: string
  rules: EventRules
  /** seatId → category/blocked, for RESERVED events. */
  seatAssignments: Record<string, SeatAssignment>
  /** Free open events: info only, no ticket. */
  infoOnly?: boolean
  createdBy: string
  createdAt: string
}

export type PosterTheme = 'stage' | 'acoustic' | 'craft' | 'expo'

/** Two six-digit lowercase hex colours: the poster's background and its accent. The text colour follows the background. */
export interface PosterPalette {
  bg: string
  accent: string
}

export interface Session {
  id: string
  eventId: string
  label?: string
  startAt: string
  endAt: string
  /**
   * Demo helper (DM-04): this session is always "running now" so judges can test
   * check-in at any time. Its start/end are resolved relative to the current time.
   */
  demoLive?: boolean
}

export type SeatStatus = 'AVAILABLE' | 'HELD' | 'SOLD' | 'BLOCKED'

export interface SessionSeat {
  sessionId: string
  seatId: string
  categoryId: string | null
  status: SeatStatus
  orderId: string | null
  holdExpiresAt: string | null
}

export interface SessionQuota {
  sessionId: string
  categoryId: string
  quota: number
  /** Confirmed + currently held (non-expired) places. */
  filled: number
}

export type OrderStatus =
  | 'AWAITING_PAYMENT'
  | 'AWAITING_VERIFICATION'
  | 'CONFIRMED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REJECTED'

export type PaymentMethod = 'SIM_QRIS' | 'SIM_VA' | 'RECEIPT' | 'FREE'

export interface OrderItem {
  id: string
  seatId: string | null
  seatLabel: string | null
  price: number
  attendeeName: string | null
}

export interface Order {
  id: string
  code: string
  userId: string
  eventId: string
  sessionId: string
  categoryId: string
  qty: number
  status: OrderStatus
  totalAmount: number
  paymentMethod: PaymentMethod | null
  holdExpiresAt: string
  createdAt: string
  confirmedAt: string | null
  items: OrderItem[]
  buyerName: string
  buyerPhone: string
  /** Created by the demo buttons "Uji pembeli lain" (visitor seat map) and "Simulasikan pembeli lain" (panitia). */
  simulated?: boolean
  /** PV-12 / AD-10: who cancelled a confirmed or pending order, and the simulated refund. */
  cancelledAt?: string | null
  cancelledBy?: 'VISITOR' | 'ADMIN' | null
  refundAmount?: number | null
}

export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED'

export interface Payment {
  id: string
  orderId: string
  method: PaymentMethod
  amount: number
  status: PaymentStatus
  idempotencyKey: string
  simRef: string
  paidAt: string | null
  createdAt: string
}

export type ReceiptStatus = 'PENDING' | 'APPROVED' | 'NEEDS_REVISION' | 'REJECTED'

export interface Receipt {
  id: string
  userId: string
  orderId: string
  tenantId: string
  receiptNo: string
  amount: number
  /** YYYY-MM-DD */
  receiptDate: string
  /** HH:MM */
  receiptTime: string
  photoUrl: string
  photoHash: string
  status: ReceiptStatus
  reason: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  possibleDuplicate: boolean
  createdAt: string
}

export type TicketStatus = 'ACTIVE' | 'USED' | 'CANCELLED'

export interface Ticket {
  id: string
  code: string
  orderId: string
  orderItemId: string
  userId: string
  eventId: string
  sessionId: string
  categoryId: string
  seatId: string | null
  seatLabel: string | null
  attendeeName: string | null
  status: TicketStatus
  qrVersion: number
  /** Signed token encoded in the QR (HMAC, PRD §11). */
  qrToken: string
  /** AD-12: bonus this ticket earned as one of the first N in its session and category. */
  bonus?: string | null
  createdAt: string
  usedAt: string | null
}

export type CheckinResult = 'VALID' | 'ALREADY_USED' | 'INVALID' | 'WRONG_SESSION' | 'OUTSIDE_WINDOW'

export interface Checkin {
  id: string
  ticketId: string | null
  sessionId: string
  staffId: string
  scannedAt: string
  result: CheckinResult
}

export type NotificationChannel = 'WA' | 'EMAIL'
export type NotificationKind = 'ORDER_CONFIRMED' | 'REMINDER' | 'RECEIPT_RESULT' | 'HOLD_EXPIRED' | 'ORDER_REJECTED' | 'ORDER_CANCELLED' | 'WAITLIST'

export interface AppNotification {
  id: string
  userId: string
  channel: NotificationChannel
  kind: NotificationKind
  title: string
  body: string
  createdAt: string
  /** For scheduled reminders (simulated). */
  scheduledFor: string | null
  /** Order the message is about (lets a cancellation drop its scheduled reminder). */
  orderId?: string | null
}

/** PV-14: waiting list for a sold-out category (no reservation; the first in line gets a message when places free up). */
export type WaitlistStatus = 'WAITING' | 'NOTIFIED' | 'LEFT'

export interface WaitlistEntry {
  id: string
  userId: string
  sessionId: string
  categoryId: string
  qty: number
  status: WaitlistStatus
  createdAt: string
  notifiedAt: string | null
}
