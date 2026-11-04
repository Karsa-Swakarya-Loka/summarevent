// GENERATED from frontend/src/domain/labels.ts by scripts/sync-domain.mjs. Do not edit here; change the frontend file.
/**
 * One vocabulary for every screen (PRD §8): visitor, admin and staff show the
 * exact same labels for the same status.
 */
import type {
  AccessMethod,
  CheckinResult,
  OrderStatus,
  PaymentMethod,
  ReceiptStatus,
  SeatStatus,
  TicketStatus,
} from './types'

export const SEAT_STATUS_LABEL: Record<SeatStatus, string> = {
  AVAILABLE: 'Tersedia',
  HELD: 'Sedang dipesan',
  SOLD: 'Terjual',
  BLOCKED: 'Tidak dijual',
}

/** What the seat map shows on top of a seat's status (PRD §13): the visitor's own pick and the accessible seat. */
export const SELECTED_SEAT_LABEL = 'Pilihanmu'
export const PRIORITY_SEAT_LABEL = 'Prioritas difabel'

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  AWAITING_PAYMENT: 'Menunggu pembayaran',
  AWAITING_VERIFICATION: 'Menunggu verifikasi struk',
  CONFIRMED: 'Terkonfirmasi',
  EXPIRED: 'Kedaluwarsa',
  CANCELLED: 'Dibatalkan',
  REJECTED: 'Ditolak',
}

/** Free categories never wait for a payment – they wait for a confirmation. */
export function orderStatusLabel(status: OrderStatus, method: PaymentMethod | null, total: number): string {
  if (status === 'AWAITING_PAYMENT' && (method === 'FREE' || total === 0)) return 'Menunggu konfirmasi'
  return ORDER_STATUS_LABEL[status]
}

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  ACTIVE: 'Aktif',
  USED: 'Sudah digunakan',
  CANCELLED: 'Dibatalkan',
}

export const RECEIPT_STATUS_LABEL: Record<ReceiptStatus, string> = {
  PENDING: 'Menunggu verifikasi',
  APPROVED: 'Disetujui',
  NEEDS_REVISION: 'Perlu revisi',
  REJECTED: 'Ditolak',
}

export const CHECKIN_RESULT_LABEL: Record<CheckinResult, string> = {
  VALID: 'Valid',
  ALREADY_USED: 'Sudah digunakan',
  INVALID: 'Tidak valid',
  WRONG_SESSION: 'Sesi lain',
  OUTSIDE_WINDOW: 'Di luar jam check-in',
}

export const ACCESS_METHOD_LABEL: Record<AccessMethod, string> = {
  PAID: 'Bayar',
  FREE: 'Gratis',
  RECEIPT: 'Tukar Struk',
}

/**
 * How a category is obtained, shown next to its name ("Reguler · Bayar"), or null when the
 * name already says it, so a category called "Tukar Struk" never reads "Tukar Struk · Tukar Struk".
 */
export function accessMethodNote(category: { name: string; accessMethod: AccessMethod }): string | null {
  const label = ACCESS_METHOD_LABEL[category.accessMethod]
  return category.name.trim().toLowerCase() === label.toLowerCase() ? null : label
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  SIM_QRIS: 'QRIS (simulasi)',
  SIM_VA: 'Virtual Account (simulasi)',
  RECEIPT: 'Tukar struk belanja',
  FREE: 'Gratis',
}

/** Tone used by StatusBadge. Green/yellow/red only for status (PRD §13). */
export type Tone = 'valid' | 'warn' | 'invalid' | 'neutral' | 'brand' | 'info'

export const ORDER_TONE: Record<OrderStatus, Tone> = {
  AWAITING_PAYMENT: 'warn',
  AWAITING_VERIFICATION: 'warn',
  CONFIRMED: 'valid',
  EXPIRED: 'neutral',
  CANCELLED: 'neutral',
  REJECTED: 'invalid',
}

export const TICKET_TONE: Record<TicketStatus, Tone> = {
  ACTIVE: 'valid',
  USED: 'neutral',
  CANCELLED: 'invalid',
}

export const RECEIPT_TONE: Record<ReceiptStatus, Tone> = {
  PENDING: 'warn',
  APPROVED: 'valid',
  NEEDS_REVISION: 'warn',
  REJECTED: 'invalid',
}

export const CHECKIN_TONE: Record<CheckinResult, Tone> = {
  VALID: 'valid',
  ALREADY_USED: 'invalid',
  INVALID: 'invalid',
  WRONG_SESSION: 'warn',
  OUTSIDE_WINDOW: 'warn',
}

/** Sundanese microcopy with the Indonesian meaning (PRD §1). Checked by a native speaker before submit. */
export const SUNDA = {
  welcome: { su: 'Wilujeng sumping!', id: 'Selamat datang' },
  join: { su: 'Hayu ngiring', id: 'Ayo ikut' },
  ready: { su: 'Tos siap!', id: 'Sudah siap' },
  enter: { su: 'Mangga lebet', id: 'Silakan masuk' },
  invalid: { su: 'Punten, tiket teu valid', id: 'Maaf, tiket tidak valid' },
  thanks: { su: 'Hatur nuhun!', id: 'Terima kasih' },
} as const

/**
 * Category colours offered in the admin wizard: tuned to sit with the Summarecon green, orange and yellow, and none of
 * them a status colour.
 */
export const CATEGORY_COLORS = [
  { name: 'Plum', value: '#8b2c6a' },
  { name: 'Oranye Summarecon', value: '#f26f22' },
  { name: 'Teal', value: '#0e7c7b' },
  { name: 'Biru tinta', value: '#2d4c8f' },
  { name: 'Cokelat', value: '#8a5a2b' },
  { name: 'Abu', value: '#57534e' },
] as const
