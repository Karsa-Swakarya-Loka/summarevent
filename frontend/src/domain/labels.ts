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

/** Category colours offered in the admin wizard – none of them is a status colour. */
export const CATEGORY_COLORS = [
  { name: 'Ungu', value: '#7c3aed' },
  { name: 'Oranye Summarecon', value: '#f26f22' },
  { name: 'Biru', value: '#2563eb' },
  { name: 'Biru laut', value: '#0e7490' },
  { name: 'Magenta', value: '#c026d3' },
  { name: 'Abu', value: '#57534e' },
] as const
