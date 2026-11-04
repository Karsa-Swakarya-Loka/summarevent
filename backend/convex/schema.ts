/**
 * Data model (PRD §10). Every table keeps the contract's own string `id` (e.g. `ses_sk_13`, `u_admin`) next to
 * Convex's `_id`, so the API speaks exactly the ids of frontend/src/domain/types.ts. Fields the contract does not
 * know (`pending`, `updatedAt`, `*StorageId`) are internal and stripped before a response leaves http.ts.
 */
import { defineSchema, defineTable } from 'convex/server'
import { v, type Validator } from 'convex/values'

const str = v.string()
const num = v.number()
const bool = v.boolean()
const nul = <T extends Validator<any, 'required', any>>(x: T) => v.union(x, v.null())
const opt = v.optional

const role = v.union(v.literal('VISITOR'), v.literal('ADMIN'), v.literal('STAFF'))
const orderStatus = v.union(
  v.literal('AWAITING_PAYMENT'),
  v.literal('AWAITING_VERIFICATION'),
  v.literal('CONFIRMED'),
  v.literal('EXPIRED'),
  v.literal('CANCELLED'),
  v.literal('REJECTED'),
)
const paymentMethod = v.union(v.literal('SIM_QRIS'), v.literal('SIM_VA'), v.literal('RECEIPT'), v.literal('FREE'))
const checkinResult = v.union(v.literal('VALID'), v.literal('ALREADY_USED'), v.literal('INVALID'), v.literal('WRONG_SESSION'), v.literal('OUTSIDE_WINDOW'))

const eventRules = v.object({
  maxSeatsPerOrder: num,
  paymentHoldMin: num,
  receiptHoldMin: num,
  checkinOpenMin: num,
  checkinCloseMin: num,
  transferable: bool,
  reentryAllowed: bool,
})

const receiptRules = v.object({
  minSpend: num,
  allowMultiple: bool,
  maxReceiptsCombined: num,
  maxReceiptsPerTenantDay: num,
  sameDayRequired: bool,
  cutoffTime: str,
  excludedTenantIds: v.array(str),
})

export default defineSchema({
  users: defineTable({
    id: str,
    role,
    name: str,
    phone: str,
    email: opt(nul(str)),
    avatarUrl: opt(nul(str)),
    avatarStorageId: opt(nul(v.id('_storage'))),
    createdAt: str,
    active: opt(bool),
  })
    .index('by_key', ['id'])
    .index('by_phone', ['phone', 'role'])
    .index('by_email', ['email']),

  /** Bearer tokens (only their SHA-256 is stored). */
  authTokens: defineTable({ tokenHash: str, userId: str, role, createdAt: str }).index('by_token', ['tokenHash']),

  otps: defineTable({ phone: str, code: str, expiresAt: str, requests: v.array(str) }).index('by_phone', ['phone']),

  venues: defineTable({ id: str, name: str, capacity: num }).index('by_key', ['id']),
  tenants: defineTable({ id: str, name: str, category: str }).index('by_key', ['id']),

  layouts: defineTable({ id: str, venueId: str, name: str, rows: num, seatsPerRow: num, aisleAfter: nul(num) }).index('by_key', ['id']),
  seats: defineTable({ id: str, layoutId: str, row: str, number: num, x: num, y: num, isPriority: bool })
    .index('by_key', ['id'])
    .index('by_layout', ['layoutId']),

  events: defineTable({
    id: str,
    slug: str,
    title: str,
    subtitle: opt(str),
    description: str,
    posterTheme: v.union(v.literal('stage'), v.literal('acoustic'), v.literal('craft'), v.literal('expo')),
    venueId: str,
    layoutId: nul(str),
    seatingMode: v.union(v.literal('RESERVED'), v.literal('GENERAL')),
    status: v.union(v.literal('DRAFT'), v.literal('PUBLISHED'), v.literal('ENDED')),
    startAt: str,
    endAt: str,
    rules: eventRules,
    /** seatId → category/blocked */
    seatAssignments: v.record(str, v.object({ categoryId: nul(str), blocked: bool })),
    infoOnly: opt(bool),
    createdBy: str,
    createdAt: str,
  })
    .index('by_key', ['id'])
    .index('by_slug', ['slug']),

  categories: defineTable({
    id: str,
    eventId: str,
    name: str,
    color: str,
    accessMethod: v.union(v.literal('PAID'), v.literal('FREE'), v.literal('RECEIPT')),
    price: num,
    quota: nul(num),
    saleStart: str,
    saleCloseMinBeforeSession: num,
    description: opt(str),
    receiptRules: opt(receiptRules),
    bonusFirstN: opt(nul(num)),
    bonusDesc: opt(nul(str)),
  })
    .index('by_key', ['id'])
    .index('by_event', ['eventId']),

  sessions: defineTable({ id: str, eventId: str, label: opt(str), startAt: str, endAt: str, demoLive: opt(bool) })
    .index('by_key', ['id'])
    .index('by_event', ['eventId']),

  sessionSeats: defineTable({
    sessionId: str,
    seatId: str,
    categoryId: nul(str),
    status: v.union(v.literal('AVAILABLE'), v.literal('HELD'), v.literal('SOLD'), v.literal('BLOCKED')),
    orderId: nul(str),
    holdExpiresAt: nul(str),
    /** ms of the last change; the seat map's `version` is the newest of these */
    updatedAt: opt(num),
  })
    .index('by_session_seat', ['sessionId', 'seatId'])
    .index('by_order', ['orderId'])
    .index('by_status', ['status', 'holdExpiresAt']),

  quotas: defineTable({ sessionId: str, categoryId: str, quota: num, filled: num }).index('by_session_category', ['sessionId', 'categoryId']),

  orders: defineTable({
    id: str,
    code: str,
    userId: str,
    eventId: str,
    sessionId: str,
    categoryId: str,
    qty: num,
    status: orderStatus,
    totalAmount: num,
    paymentMethod: nul(paymentMethod),
    holdExpiresAt: str,
    createdAt: str,
    confirmedAt: nul(str),
    items: v.array(v.object({ id: str, seatId: nul(str), seatLabel: nul(str), price: num, attendeeName: nul(str) })),
    buyerName: str,
    buyerPhone: str,
    simulated: opt(bool),
    cancelledAt: opt(nul(str)),
    cancelledBy: opt(nul(v.union(v.literal('VISITOR'), v.literal('ADMIN')))),
    refundAmount: opt(nul(num)),
    /** AWAITING_PAYMENT or AWAITING_VERIFICATION: lets the expiry job find due holds by index */
    pending: opt(bool),
  })
    .index('by_key', ['id'])
    .index('by_user', ['userId'])
    .index('by_user_session', ['userId', 'sessionId'])
    .index('by_session_category', ['sessionId', 'categoryId'])
    .index('by_event', ['eventId'])
    .index('by_pending', ['pending', 'holdExpiresAt']),

  payments: defineTable({
    id: str,
    orderId: str,
    method: paymentMethod,
    amount: num,
    status: v.union(v.literal('PENDING'), v.literal('SUCCESS'), v.literal('FAILED')),
    idempotencyKey: str,
    simRef: str,
    paidAt: nul(str),
    createdAt: str,
  })
    .index('by_idempotency', ['idempotencyKey'])
    .index('by_order', ['orderId']),

  receipts: defineTable({
    id: str,
    userId: str,
    orderId: str,
    tenantId: str,
    receiptNo: str,
    amount: num,
    receiptDate: str,
    receiptTime: str,
    /** sample data: an inline SVG data URL; uploads: a signed /receipt-photos link */
    photoUrl: str,
    photoHash: str,
    photoStorageId: opt(nul(v.id('_storage'))),
    status: v.union(v.literal('PENDING'), v.literal('APPROVED'), v.literal('NEEDS_REVISION'), v.literal('REJECTED')),
    reason: nul(str),
    reviewedBy: nul(str),
    reviewedAt: nul(str),
    possibleDuplicate: bool,
    createdAt: str,
  })
    .index('by_key', ['id'])
    .index('by_order', ['orderId'])
    .index('by_user', ['userId'])
    .index('by_number', ['tenantId', 'receiptNo', 'receiptDate'])
    .index('by_hash', ['photoHash']),

  tickets: defineTable({
    id: str,
    code: str,
    orderId: str,
    orderItemId: str,
    userId: str,
    eventId: str,
    sessionId: str,
    categoryId: str,
    seatId: nul(str),
    seatLabel: nul(str),
    attendeeName: nul(str),
    status: v.union(v.literal('ACTIVE'), v.literal('USED'), v.literal('CANCELLED')),
    qrVersion: num,
    qrToken: str,
    bonus: opt(nul(str)),
    createdAt: str,
    usedAt: nul(str),
  })
    .index('by_key', ['id'])
    .index('by_order', ['orderId'])
    .index('by_user', ['userId'])
    .index('by_event', ['eventId'])
    .index('by_session_category', ['sessionId', 'categoryId'])
    .index('by_session_seat', ['sessionId', 'seatId'])
    .index('by_item', ['orderItemId']),

  checkins: defineTable({ id: str, ticketId: nul(str), sessionId: str, staffId: str, scannedAt: str, result: checkinResult })
    .index('by_session', ['sessionId', 'scannedAt'])
    .index('by_ticket', ['ticketId'])
    .index('by_staff', ['staffId', 'scannedAt']),

  notifications: defineTable({
    id: str,
    userId: str,
    channel: v.union(v.literal('WA'), v.literal('EMAIL')),
    kind: str,
    title: str,
    body: str,
    createdAt: str,
    scheduledFor: nul(str),
    orderId: opt(nul(str)),
  })
    .index('by_user', ['userId'])
    .index('by_order', ['orderId']),

  waitlist: defineTable({
    id: str,
    userId: str,
    sessionId: str,
    categoryId: str,
    qty: num,
    status: v.union(v.literal('WAITING'), v.literal('NOTIFIED'), v.literal('LEFT')),
    createdAt: str,
    notifiedAt: nul(str),
  })
    .index('by_key', ['id'])
    .index('by_line', ['sessionId', 'categoryId', 'status'])
    .index('by_user', ['userId']),
})
