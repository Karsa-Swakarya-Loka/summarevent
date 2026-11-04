// GENERATED from frontend/src/api/contract.ts by scripts/sync-domain.mjs. Do not edit here; change the frontend file.
/**
 * API contract shared by the mock adapter and the HTTP adapter.
 * Endpoint mapping is documented next to each method and in docs/API-CONTRACT.md.
 */
import type {
  AppNotification,
  Checkin,
  CheckinResult,
  EventItem,
  EventRules,
  Order,
  OrderStatus,
  PaymentMethod,
  PosterTheme,
  Receipt,
  ReceiptStatus,
  Role,
  Seat,
  SeatLayout,
  SeatingMode,
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

export class ApiError extends Error {
  readonly code: string
  readonly details?: unknown
  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.code = code
    this.details = details
  }
}

/* ---------- Public / visitor ---------- */

export interface CategoryAvailability {
  categoryId: string
  total: number
  available: number
  held: number
  sold: number
  /** AD-12: bonus places left in this session (null = no bonus for the category). */
  bonusLeft?: number | null
}

export interface SessionSummary extends Session {
  availability: CategoryAvailability[]
  /** Sum over categories. */
  available: number
  total: number
}

export interface EventSummary {
  event: EventItem
  venue: Venue
  categories: TicketCategory[]
  sessions: SessionSummary[]
  minPrice: number | null
}

export interface EventDetail extends EventSummary {
  tenants: Tenant[]
}

export interface SeatMapData {
  session: Session
  event: EventItem
  layout: SeatLayout | null
  seats: Seat[]
  sessionSeats: SessionSeat[]
  categories: TicketCategory[]
  quotas: SessionQuota[]
  /** People waiting per sold-out category (PV-14). */
  waitlist: Array<{ categoryId: string; waiting: number }>
  /** Bonus places left per bonus category in this session (AD-12). */
  bonus: Array<{ categoryId: string; left: number }>
  /** Increases on every change; clients poll with ?since=version (PRD §11). */
  version: number
  serverTime: string
}

export interface HoldRequest {
  categoryId: string
  /** RESERVED categories. */
  seatIds?: string[]
  /** GENERAL categories (no seat number). */
  qty?: number
}

export type HoldResult =
  | { ok: true; order: Order }
  | { ok: false; reason: 'CONFLICT'; conflictSeatIds: string[]; suggestions: string[]; message: string }
  | { ok: false; reason: 'SOLD_OUT' | 'RULE'; message: string }

export interface PaymentRequest {
  method: Exclude<PaymentMethod, 'RECEIPT' | 'FREE'>
  outcome: 'SUCCESS' | 'FAIL'
  idempotencyKey: string
}

export interface ReceiptInput {
  tenantId: string
  receiptNo: string
  amount: number
  receiptDate: string
  receiptTime: string
  /** data: URL (compressed JPEG) – real backend: multipart upload to private storage. */
  photoUrl: string
  photoHash: string
}

export type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R6'

export interface RuleCheck {
  rule: RuleId
  ok: boolean
  /** Human message that explains how to fix it (PRD §13 principle 3). */
  message: string
  /** Soft warnings (e.g. possible duplicate photo) don't block submission. */
  warning?: boolean
}

export interface ReceiptSubmitResult {
  ok: boolean
  checks: RuleCheck[]
  total: number
  order: Order
  receipts: Receipt[]
}

export interface OrderDetail {
  order: Order
  event: EventItem
  venue: Venue
  session: Session
  category: TicketCategory
  receipts: Receipt[]
  tickets: Ticket[]
  tenants: Tenant[]
}

export interface PassItem {
  ticket: Ticket
  order: Order
  event: EventItem
  venue: Venue
  session: Session
  category: TicketCategory
}

/** The visitor's own waiting-list entries, with their place in line. */
/** What a visitor can change about their account. `null` (or empty) removes the email or the photo. */
export interface ProfileUpdate {
  name?: string
  email?: string | null
  /** a new profile photo as a data URL (square JPEG, PNG or WebP, at most 300 KB); stored and returned as `avatarUrl` */
  avatar?: string | null
}

export interface WaitlistItem extends WaitlistEntry {
  /** 1-based place among people still waiting; null once notified or left. */
  position: number | null
  event: EventItem
  session: Session
  category: TicketCategory
}

/* ---------- Admin ---------- */

export interface EventDraft {
  title: string
  subtitle?: string
  description: string
  posterTheme: PosterTheme
  venueId: string
  seatingMode: SeatingMode
  rules: EventRules
  categories: Array<Omit<TicketCategory, 'id' | 'eventId'> & { id?: string }>
  /** RESERVED: layout template. */
  layout?: {
    rows: number
    seatsPerRow: number
    aisleAfter: number | null
    /** Row letter ranges per category, e.g. { categoryIndex: 0, fromRow: 'A', toRow: 'B' }. */
    rowCategories: Array<{ categoryIndex: number; fromRow: string; toRow: string }>
    blockedSeatLabels: string[]
    prioritySeatLabels: string[]
  }
  sessions: Array<{ id?: string; label?: string; startAt: string; endAt: string; demoLive?: boolean }>
}

export interface OrderRow {
  order: Order
  event: EventItem
  session: Session
  category: TicketCategory
  receipts: Receipt[]
  checkedIn: number
}

export interface OrderFilter {
  eventId?: string
  status?: OrderStatus | 'ALL'
  q?: string
}

export interface ReceiptQueueItem {
  receipt: Receipt
  order: Order
  event: EventItem
  session: Session
  category: TicketCategory
  tenant: Tenant | null
  /** All receipts in the same order (combined set). */
  siblings: Receipt[]
  checks: RuleCheck[]
  user: User | null
}

export type ReviewDecision = 'APPROVE' | 'NEEDS_REVISION' | 'REJECT'

export interface StaffAccount extends User {
  /** Successful check-ins (VALID scans). */
  scans: number
  lastScanAt: string | null
}

export interface SessionStats {
  session: Session
  capacity: number
  sold: number
  held: number
  checkedIn: number
  occupancyPct: number
}

export interface EventStats {
  event: EventItem
  registrants: number
  ticketsSold: number
  revenue: number
  transactions: Record<OrderStatus, number>
  byCategory: Array<{ category: TicketCategory; sold: number; held: number; total: number; revenue: number }>
  bySession: SessionStats[]
  receiptTotal: number
  receiptsPending: number
  topTenants: Array<{ tenant: Tenant; amount: number; count: number }>
  noShowPct: number | null
  /** The last 30 days (WIB, oldest first): tickets of orders confirmed that day and their money. Pending orders and simulated buyers are left out. */
  daily: Array<{ date: string; tickets: number; revenue: number; orders: number }>
  /** Successful check-ins by weekday (0 = Monday) and hour (0–23), for the attendance heatmap. */
  checkinsByHour: number[][]
  generatedAt: string
}

/* ---------- Staff ---------- */

export interface CheckinResponse {
  result: CheckinResult
  message: string
  ticket: Ticket | null
  order: Order | null
  event: EventItem | null
  session: Session | null
  category: TicketCategory | null
  /** For ALREADY_USED: the first successful scan. */
  firstScan: (Checkin & { staffName: string }) | null
}

/**
 * PT-07: what a staff phone keeps so check-in still works when the venue loses signal. QR tokens are
 * not included, only their SHA-256, so a lost phone cannot be used to make valid QR codes.
 */
export interface OfflineManifest {
  sessionId: string
  generatedAt: string
  event: EventItem
  session: Session
  categories: TicketCategory[]
  /** Every ticket of the event, so a ticket for another session still shows "Sesi lain". */
  tickets: OfflineTicket[]
}

export interface OfflineTicket {
  tokenHash: string
  ticket: Omit<Ticket, 'qrToken'>
  order: { id: string; code: string; buyerName: string }
  session: Session
}

export interface TicketSearchRow {
  ticket: Ticket
  order: Order
  event: EventItem
  session: Session
  category: TicketCategory
}

/* ---------- The API ---------- */

export interface AdminApi {
  /** GET /admin/events */
  listEvents(): Promise<EventSummary[]>
  /** GET /admin/events/:id */
  getEventDraft(eventId: string): Promise<{ draft: EventDraft; event: EventItem }>
  /** POST /admin/events (+ /rules, /sessions, /layout) */
  createEvent(draft: EventDraft): Promise<EventItem>
  /** PATCH /admin/events/:id */
  updateEvent(eventId: string, draft: EventDraft): Promise<EventItem>
  /** PATCH /admin/events/:id { status: PUBLISHED } */
  publishEvent(eventId: string): Promise<EventItem>
  /** GET /admin/orders?status=&q=&eventId= */
  listOrders(filter: OrderFilter): Promise<OrderRow[]>
  /** PATCH /admin/orders/:id { action: 'MARK_PAID' } */
  markPaid(orderId: string): Promise<Order>
  /** PATCH /admin/orders/:id { action: 'CANCEL' } */
  cancelOrder(orderId: string): Promise<Order>
  /** GET /admin/receipts?status= */
  listReceipts(status: ReceiptStatus | 'ALL'): Promise<ReceiptQueueItem[]>
  /** PATCH /admin/receipts/:id { decision, reason } – reviews the whole combined set of the order. */
  reviewReceipt(receiptId: string, decision: ReviewDecision, reason?: string): Promise<OrderDetail>
  /** GET /admin/events/:id/stats */
  stats(eventId: string): Promise<EventStats>
  /** GET /admin/events/:id/export?type=attendees|transactions */
  exportCsv(eventId: string, type: 'attendees' | 'transactions'): Promise<{ filename: string; csv: string }>
  venues(): Promise<Venue[]>
  tenants(): Promise<Tenant[]>
  /** GET /admin/staff – petugas accounts with their scan activity (AD-13) */
  listStaff(): Promise<StaffAccount[]>
  /** POST /admin/staff { name, phone } */
  createStaff(input: { name: string; phone: string }): Promise<User>
  /** PATCH /admin/staff/:id { active } */
  setStaffActive(userId: string, active: boolean): Promise<User>
}

export interface StaffApi {
  /** GET /staff/accounts – active staff accounts, for the demo account switcher on the staff home */
  accounts(): Promise<StaffAccount[]>
  /** GET /staff/sessions/:id/offline-manifest – tickets to check against while offline (PT-07) */
  offlineManifest(sessionId: string): Promise<OfflineManifest>
  /** POST /staff/checkins { qr_token, session_id } */
  checkin(qrToken: string, sessionId: string): Promise<CheckinResponse>
  /** GET /staff/tickets?q= */
  searchTickets(q: string, eventId?: string): Promise<TicketSearchRow[]>
  /** Recent scans for the session (live counter). */
  recentCheckins(sessionId: string): Promise<{ checkedIn: number; capacity: number; recent: CheckinResponse[] }>
  /** GET /staff/receipts?event_id= – receipt sets waiting for a decision, checked against the paper receipt at the desk (PT-06) */
  listReceipts(eventId?: string): Promise<ReceiptQueueItem[]>
  /** PATCH /staff/receipts/:id { decision, reason } – recorded under the staff member */
  reviewReceipt(receiptId: string, decision: ReviewDecision, reason?: string): Promise<OrderDetail>
}

export interface DemoApi {
  /** POST /demo/reset */
  reset(): Promise<void>
  /** POST /demo/sessions/:id/fake-buyer – holds 1–2 random seats (or exactly `seatIds`) for 60 s */
  fakeBuyer(sessionId: string, categoryId?: string, seatIds?: string[]): Promise<{ seatLabels: string[] }>
  /** POST /demo/orders/:id/expire – end the visitor's hold now, so the "Kedaluwarsa" path can be shown without waiting */
  expireHold(orderId: string): Promise<Order>
}

export interface Api {
  readonly mode: 'mock' | 'http'

  /* Auth – POST /auth/otp/request, /auth/otp/verify */
  requestOtp(phone: string): Promise<{ simulatedCode: string; expiresAt: string }>
  verifyOtp(phone: string, code: string, name?: string): Promise<{ user: User; isNew: boolean }>
  currentUser(role: Role): User | null
  /** Demo login for admin/staff from the role picker (optionally as a specific staff account). */
  demoLogin(role: Role, userId?: string): Promise<User>
  logout(role: Role): void

  /* Public – GET /events, /events/:slug */
  listEvents(): Promise<EventSummary[]>
  getEvent(slug: string): Promise<EventDetail>
  /** GET /sessions/:id/seats?since=:version */
  getSeatMap(sessionId: string): Promise<SeatMapData>

  /* Orders */
  /** POST /sessions/:id/holds */
  createHold(sessionId: string, req: HoldRequest): Promise<HoldResult>
  /** POST /sessions/:id/holds/auto */
  autoHold(sessionId: string, categoryId: string, qty: number): Promise<HoldResult>
  /** Suggest (without holding) best adjacent seats – used to preview the auto pick. */
  suggestSeats(sessionId: string, categoryId: string, qty: number): Promise<string[]>
  /** PATCH /orders/:id */
  updateAttendees(orderId: string, names: Array<{ itemId: string; name: string }>): Promise<Order>
  /** DELETE /orders/:id */
  cancelOrder(orderId: string): Promise<Order>
  /** POST /orders/:id/payments/simulate */
  simulatePayment(orderId: string, req: PaymentRequest): Promise<{ order: Order; paymentStatus: 'SUCCESS' | 'FAILED'; message: string }>
  /** POST /orders/:id/confirm (FREE categories) */
  confirmFree(orderId: string): Promise<Order>
  /** POST /orders/:id/receipts */
  submitReceipts(orderId: string, receipts: ReceiptInput[]): Promise<ReceiptSubmitResult>
  /** Dry-run of the receipt rules (live checklist while typing). */
  checkReceipts(orderId: string, receipts: Array<Omit<ReceiptInput, 'photoUrl'>>): Promise<{ checks: RuleCheck[]; total: number }>
  /** GET /orders/:id */
  getOrder(orderId: string): Promise<OrderDetail>
  /** GET /me/orders */
  myOrders(): Promise<OrderDetail[]>
  /** GET /me/tickets */
  myTickets(): Promise<PassItem[]>
  /** GET /me/notifications */
  myNotifications(): Promise<AppNotification[]>
  /** POST /sessions/:id/waitlist { category_id, qty } – join the waiting list of a sold-out category */
  joinWaitlist(sessionId: string, categoryId: string, qty: number): Promise<WaitlistItem>
  /** DELETE /waitlist/:id */
  leaveWaitlist(entryId: string): Promise<void>
  /** GET /me/waitlist */
  myWaitlist(): Promise<WaitlistItem[]>
  /** PATCH /me { name?, email?, avatar? } – the signed-in visitor's own name, email and photo (PV-06); the phone number is the login and stays */
  updateProfile(changes: ProfileUpdate): Promise<User>

  admin: AdminApi
  staff: StaffApi
  demo: DemoApi

  /** Change notifications (mock: BroadcastChannel; http: polling). Returns unsubscribe. */
  subscribe(listener: () => void): () => void
}
