/** Pure helpers shared by the visitor screens. */
import type { EventSummary, OrderDetail } from '@/api/contract'
import type { AppNotification, Order, OrderStatus, Seat, Session, TicketCategory } from '@/domain/types'
import { fmtDayMonth, fmtRange, fmtShortDate, fmtTime, rupiahPlain, wibDate } from '@/lib/format'

const PENDING_STATUSES: OrderStatus[] = ['AWAITING_PAYMENT', 'AWAITING_VERIFICATION']
export const isPendingOrder = (o: Pick<Order, 'status'>) => PENDING_STATUSES.includes(o.status)

/** What is left to book: "kursi" only when every category is numbered seats; with a standing area it is "tempat". */
export function placeUnit(categories: Array<Pick<TicketCategory, 'quota'>>): 'kursi' | 'tempat' {
  return categories.length > 0 && categories.every((c) => c.quota == null) ? 'kursi' : 'tempat'
}

/** "C7–C10" for a contiguous run in one row, otherwise "C7, C9, D2". */
export function seatRangeLabel(labels: string[]): string {
  if (!labels.length) return ''
  const parsed = labels.map((l) => {
    const m = /^([A-Z]+)(\d+)$/.exec(l)
    return m ? { row: m[1], n: Number(m[2]), l } : null
  })
  if (parsed.every(Boolean)) {
    const list = parsed as Array<{ row: string; n: number; l: string }>
    const sorted = [...list].sort((a, b) => a.row.localeCompare(b.row) || a.n - b.n)
    const sameRow = sorted.every((s) => s.row === sorted[0].row)
    const consecutive = sorted.every((s, i) => i === 0 || s.n === sorted[i - 1].n + 1)
    if (sameRow && consecutive && sorted.length > 1) return `${sorted[0].l}–${sorted[sorted.length - 1].l}`
    return sorted.map((s) => s.l).join(', ')
  }
  return labels.join(', ')
}

/** True when the seats sit next to each other in one row without crossing the aisle. */
export function seatsAdjacent(seats: Seat[]): boolean {
  if (seats.length < 2) return true
  const sorted = [...seats].sort((a, b) => a.x - b.x)
  return sorted.every((s, i) => i === 0 || (s.y === sorted[0].y && s.x === sorted[i - 1].x + 1))
}

/** Price hint for an event card: "Gratis – Rp150.000", "Mulai Rp50.000", "Gratis", "Tukar struk". */
export function priceHint(categories: TicketCategory[]): string {
  const paid = categories.filter((c) => c.accessMethod === 'PAID' && c.price > 0)
  // a free category makes the event start at nothing, so the range says so instead of the cheapest paid seat
  if (paid.length && categories.some((c) => c.accessMethod === 'FREE')) return `Gratis – ${rupiahPlain(Math.max(...paid.map((c) => c.price)))}`
  if (paid.length) return `Mulai ${rupiahPlain(Math.min(...paid.map((c) => c.price)))}`
  if (categories.some((c) => c.accessMethod === 'FREE')) return 'Gratis'
  if (categories.some((c) => c.accessMethod === 'RECEIPT')) return 'Tukar struk'
  return 'Gratis'
}

export function sessionWhen(s: Pick<Session, 'startAt' | 'endAt' | 'demoLive'>): string {
  if (s.demoLive) return `Hari ini · ${fmtRange(s.startAt, s.endAt)}`
  return `${fmtShortDate(s.startAt)} · ${fmtRange(s.startAt, s.endAt)}`
}

export function sessionName(s: Pick<Session, 'label' | 'demoLive'>): string {
  if (s.demoLive) return 'Sesi demo'
  return s.label ?? 'Sesi'
}

/* ---------- WIB calendar helpers for the Home filters ---------- */

function wibMidnight(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+07:00`)
}

export function wibTodayRange(now = new Date()): { from: Date; to: Date } {
  const from = wibMidnight(wibDate(now))
  return { from, to: new Date(from.getTime() + 86_400_000) }
}

/** Monday 00:00 → next Monday 00:00 (WIB) of the current week, starting from today. */
export function wibWeekRange(now = new Date()): { from: Date; to: Date } {
  const ymd = wibDate(now)
  const [y, m, d] = ymd.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Sunday
  const daysLeft = dow === 0 ? 1 : 8 - dow
  const from = wibMidnight(ymd)
  return { from, to: new Date(from.getTime() + daysLeft * 86_400_000) }
}

/** Does the event happen (any session, or its open period for info-only events) inside [from, to)? */
export function eventInRange(e: EventSummary, from: Date, to: Date): boolean {
  const spans = e.sessions.length ? e.sessions.map((s) => [s.startAt, s.endAt]) : [[e.event.startAt, e.event.endAt]]
  return spans.some(([a, b]) => new Date(a) < to && new Date(b) > from)
}

/**
 * What an unfinished order waits for, in a few words: the visitor's next step, or that the panitia has the receipt.
 * `short` fits a small card ("Bayar"), the full one heads the order's own screen ("Tinggal bayar").
 */
export function pendingTitle(d: Pick<OrderDetail, 'order' | 'receipts'>, short = false): string {
  const { order, receipts } = d
  if (order.status === 'AWAITING_VERIFICATION') {
    if (receipts.some((r) => r.status === 'PENDING')) return short ? 'Struk dicek' : 'Struk dicek panitia'
    if (receipts.some((r) => r.status === 'NEEDS_REVISION')) return short ? 'Perbaiki struk' : 'Struk perlu diperbaiki'
    return short ? 'Kirim struk' : 'Struk belum dikirim'
  }
  if (order.paymentMethod === 'FREE' || order.totalAmount === 0) return short ? 'Konfirmasi' : 'Tinggal konfirmasi'
  return short ? 'Bayar' : 'Tinggal bayar'
}

/** Where a visitor should continue an order. */
export function continuePath(d: Pick<OrderDetail, 'order' | 'receipts'>): string {
  const { order, receipts } = d
  if (order.status === 'AWAITING_PAYMENT') return `/app/checkout/${order.id}`
  if (order.status === 'AWAITING_VERIFICATION' && !receipts.some((r) => r.status === 'PENDING')) return `/app/checkout/${order.id}`
  return `/app/orders/${order.id}`
}

/* ---------- remembered session per event (EventDetail ↔ SeatSelect) ---------- */

const PICK_KEY = (slug: string) => `summarevent:pick:${slug}`

export function rememberSession(slug: string, sessionId: string) {
  try {
    sessionStorage.setItem(PICK_KEY(slug), sessionId)
  } catch {
    /* storage blocked – fine */
  }
}

export function recallSession(slug: string): string | null {
  try {
    return sessionStorage.getItem(PICK_KEY(slug))
  } catch {
    return null
  }
}

/* ---------- Pesan ---------- */

/** "21.23" today, "21 Nov" before. */
export function messageWhen(iso: string, now = new Date()): string {
  const day = wibDate(new Date(iso))
  return day === wibDate(now) ? fmtTime(iso) : fmtDayMonth(day)
}

/** The screen a message points to: its order when it has one (every order message does), else where its kind lives. */
export function messageNext(n: AppNotification): { to: string; label: string } {
  if (n.kind === 'HOLD_EXPIRED') return { to: '/app', label: 'Cari event' }
  if (n.kind === 'WAITLIST') return { to: '/app/akun', label: 'Lihat di Akun' }
  if (n.orderId) return { to: `/app/orders/${n.orderId}`, label: n.kind === 'ORDER_CONFIRMED' || n.kind === 'REMINDER' ? 'Lihat e-ticket' : 'Lihat pesanan' }
  return { to: '/app/pass', label: 'Buka Pass Saya' }
}
