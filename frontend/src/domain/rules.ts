/**
 * Pure business rules (PRD §8–§9). No storage, no time source of their own:
 * everything takes `now` so the same logic can run in the mock, in tests and
 * (ported) on the backend.
 */
import { fmtDayMonth, rupiahPlain, wibDate } from '@/lib/format'
import type { ReceiptInput, RuleCheck } from '@/api/contract'
import type {
  EventRules,
  Order,
  Receipt,
  ReceiptRules,
  Seat,
  SeatLayout,
  SeatStatus,
  Session,
  SessionSeat,
  Tenant,
  Ticket,
  TicketCategory,
} from './types'

/* ---------------- Layout ---------------- */

export function rowLetter(index: number): string {
  // A..Z then AA, AB …
  let s = ''
  let n = index
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

export function rowIndex(letter: string): number {
  let n = 0
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

export function seatLabel(seat: Pick<Seat, 'row' | 'number'>): string {
  return `${seat.row}${seat.number}`
}

/** Build the seats of a theatre-style layout. x/y are in seat units; the aisle adds one empty column. */
export function buildSeats(layout: SeatLayout, priorityLabels: string[] = []): Seat[] {
  const seats: Seat[] = []
  for (let r = 0; r < layout.rows; r++) {
    const row = rowLetter(r)
    for (let n = 1; n <= layout.seatsPerRow; n++) {
      const aisleShift = layout.aisleAfter != null && n > layout.aisleAfter ? 1 : 0
      const label = `${row}${n}`
      seats.push({
        id: `${layout.id}:${label}`,
        layoutId: layout.id,
        row,
        number: n,
        x: n - 1 + aisleShift,
        y: r,
        isPriority: priorityLabels.includes(label),
      })
    }
  }
  return seats
}

/* ---------------- Time ---------------- */

/** Demo-live sessions (DM-04) are always running: started 20 min ago, end in 3 h. */
export function resolveSession(session: Session, now: Date): Session {
  if (!session.demoLive) return session
  const start = new Date(Math.floor((now.getTime() - 20 * 60_000) / 300_000) * 300_000)
  const end = new Date(start.getTime() + 3 * 3600_000)
  return { ...session, startAt: start.toISOString(), endAt: end.toISOString() }
}

export function isHoldActive(ss: Pick<SessionSeat, 'status' | 'holdExpiresAt'>, now: Date): boolean {
  return ss.status === 'HELD' && !!ss.holdExpiresAt && new Date(ss.holdExpiresAt).getTime() > now.getTime()
}

/** Lazy expiry: an expired hold is shown and treated as available (PRD §8 layer 2). */
export function effectiveSeatStatus(ss: Pick<SessionSeat, 'status' | 'holdExpiresAt'>, now: Date): SeatStatus {
  if (ss.status === 'HELD' && !isHoldActive(ss, now)) return 'AVAILABLE'
  return ss.status
}

export function checkinWindow(session: Session, rules: EventRules): { open: Date; close: Date } {
  const open = new Date(new Date(session.startAt).getTime() - rules.checkinOpenMin * 60_000)
  const close = new Date(new Date(session.endAt).getTime() - rules.checkinCloseMin * 60_000)
  return { open, close }
}

export type SaleState = { open: true } | { open: false; reason: 'NOT_YET' | 'CLOSED'; at: Date }

export function saleState(category: TicketCategory, session: Session, now: Date): SaleState {
  const start = new Date(category.saleStart)
  if (now < start) return { open: false, reason: 'NOT_YET', at: start }
  const close = new Date(new Date(session.startAt).getTime() - category.saleCloseMinBeforeSession * 60_000)
  if (session.demoLive) return { open: true }
  if (now >= close) return { open: false, reason: 'CLOSED', at: close }
  return { open: true }
}

/* ---------------- Seat suggestions ---------------- */

interface SeatView {
  seat: Seat
  status: SeatStatus
  categoryId: string | null
}

function adjacent(a: Seat, b: Seat, layout: SeatLayout | null): boolean {
  if (a.row !== b.row || b.number !== a.number + 1) return false
  if (layout?.aisleAfter != null && a.number === layout.aisleAfter) return false
  return true
}

/**
 * Best block of `qty` adjacent available seats in a category: closest to the stage first,
 * then closest to the centre of the row (or to `near`, when given). Falls back to the best
 * individual seats when no adjacent block exists.
 */
export function suggestSeats(
  views: SeatView[],
  categoryId: string,
  qty: number,
  layout: SeatLayout | null,
  near?: { x: number; y: number },
): { seatIds: string[]; adjacent: boolean } {
  const candidates = views.filter((v) => v.categoryId === categoryId && v.status === 'AVAILABLE')
  if (candidates.length < qty || qty <= 0) return { seatIds: [], adjacent: false }

  const byRow = new Map<string, Seat[]>()
  for (const v of candidates) {
    const list = byRow.get(v.seat.row) ?? []
    list.push(v.seat)
    byRow.set(v.seat.row, list)
  }
  const allX = views.map((v) => v.seat.x)
  const centreX = (Math.min(...allX) + Math.max(...allX)) / 2

  let best: { ids: string[]; score: number } | null = null
  for (const seats of byRow.values()) {
    seats.sort((a, b) => a.number - b.number)
    // contiguous runs
    const runs: Seat[][] = []
    let run: Seat[] = []
    for (const s of seats) {
      if (run.length && !adjacent(run[run.length - 1], s, layout)) {
        runs.push(run)
        run = []
      }
      run.push(s)
    }
    if (run.length) runs.push(run)
    for (const r of runs) {
      for (let i = 0; i + qty <= r.length; i++) {
        const block = r.slice(i, i + qty)
        const cx = (block[0].x + block[block.length - 1].x) / 2
        const cy = block[0].y
        const score = near
          ? Math.hypot(cx - near.x, (cy - near.y) * 1.5)
          : cy * 100 + Math.abs(cx - centreX)
        if (!best || score < best.score) best = { ids: block.map((s) => s.id), score }
      }
    }
  }
  if (best) return { seatIds: best.ids, adjacent: true }

  // fallback: closest individual seats
  const scored = candidates
    .map((v) => ({
      id: v.seat.id,
      score: near ? Math.hypot(v.seat.x - near.x, v.seat.y - near.y) : v.seat.y * 100 + Math.abs(v.seat.x - centreX),
    }))
    .sort((a, b) => a.score - b.score)
  return { seatIds: scored.slice(0, qty).map((s) => s.id), adjacent: false }
}

/* ---------------- Receipt rules (R1–R4, R6) ---------------- */

export interface ReceiptCheckContext {
  rules: ReceiptRules
  tenants: Tenant[]
  /** All stored receipts (any order), for uniqueness. */
  existing: Receipt[]
  /** Receipts already attached to this order are ignored for uniqueness (re-upload after revision). */
  orderId: string
  now: Date
}

export function checkReceiptRules(inputs: Array<Omit<ReceiptInput, 'photoUrl'>>, ctx: ReceiptCheckContext): { checks: RuleCheck[]; total: number } {
  const { rules, tenants } = ctx
  const checks: RuleCheck[] = []
  const total = inputs.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0)
  const tenantById = new Map(tenants.map((t) => [t.id, t]))

  // R1 tenant registered and not excluded
  const missing = inputs.filter((r) => !tenantById.has(r.tenantId))
  const excluded = inputs.filter((r) => rules.excludedTenantIds.includes(r.tenantId))
  if (inputs.length === 0) {
    checks.push({ rule: 'R1', ok: false, message: 'Tambahkan minimal 1 struk dari tenant SUMMABA.' })
  } else if (missing.length) {
    checks.push({ rule: 'R1', ok: false, message: 'Pilih tenant dari daftar tenant SUMMABA untuk setiap struk.' })
  } else if (excluded.length) {
    const names = [...new Set(excluded.map((r) => tenantById.get(r.tenantId)?.name ?? '-'))].join(', ')
    checks.push({ rule: 'R1', ok: false, message: `Struk dari ${names} tidak berlaku untuk event ini. Ganti dengan struk tenant lain.` })
  } else {
    checks.push({ rule: 'R1', ok: true, message: 'Semua struk dari tenant SUMMABA yang berlaku' })
  }

  // R2 same day + cutoff time
  const today = wibDate(ctx.now)
  const wrongDay = rules.sameDayRequired ? inputs.filter((r) => r.receiptDate && r.receiptDate !== today) : []
  const late = inputs.filter((r) => r.receiptTime && r.receiptTime > rules.cutoffTime)
  if (inputs.some((r) => !r.receiptDate || !r.receiptTime)) {
    checks.push({ rule: 'R2', ok: false, message: 'Isi tanggal dan jam yang tertulis di struk.' })
  } else if (wrongDay.length) {
    checks.push({
      rule: 'R2',
      ok: false,
      message: `Struk tanggal ${fmtDayMonth(wrongDay[0].receiptDate)}. Event ini hanya menerima struk hari ini (${fmtDayMonth(today)}).`,
    })
  } else if (late.length) {
    checks.push({
      rule: 'R2',
      ok: false,
      message: `Jam struk ${late[0].receiptTime.replace(':', '.')} lewat batas ${rules.cutoffTime.replace(':', '.')}. Pakai struk sebelum jam itu.`,
    })
  } else {
    checks.push({ rule: 'R2', ok: true, message: rules.sameDayRequired ? 'Tanggal struk hari ini' : 'Tanggal dan jam struk sesuai' })
  }

  // R3 minimum spend
  if (total >= rules.minSpend) {
    checks.push({ rule: 'R3', ok: true, message: `Total ${rupiahPlain(total)} (min ${rupiahPlain(rules.minSpend)})` })
  } else {
    checks.push({
      rule: 'R3',
      ok: false,
      message: `Total baru ${rupiahPlain(total)}. Kurang ${rupiahPlain(rules.minSpend - total)} lagi untuk mencapai minimal ${rupiahPlain(rules.minSpend)}.`,
    })
  }

  // R4 max receipts combined
  if (inputs.length > rules.maxReceiptsCombined) {
    checks.push({
      rule: 'R4',
      ok: false,
      message: `Maksimal ${rules.maxReceiptsCombined} struk digabung. Hapus ${inputs.length - rules.maxReceiptsCombined} struk.`,
    })
  } else {
    checks.push({ rule: 'R4', ok: true, message: `${inputs.length} dari maks ${rules.maxReceiptsCombined} struk` })
  }

  // R6 unique tenant + receipt no + date; same photo hash = possible duplicate (warning)
  const key = (r: { tenantId: string; receiptNo: string; receiptDate: string }) =>
    `${r.tenantId}|${r.receiptNo.trim().toUpperCase()}|${r.receiptDate}`
  const others = ctx.existing.filter((r) => r.orderId !== ctx.orderId && r.status !== 'REJECTED')
  const seen = new Set(others.map(key))
  const inputKeys = inputs.map(key)
  const dupInSet = inputKeys.some((k, i) => inputKeys.indexOf(k) !== i)
  const dupExisting = inputs.find((r) => r.receiptNo && seen.has(key(r)))
  if (inputs.some((r) => !r.receiptNo.trim())) {
    checks.push({ rule: 'R6', ok: false, message: 'Isi nomor struk sesuai yang tertulis di struk.' })
  } else if (dupInSet) {
    checks.push({ rule: 'R6', ok: false, message: 'Ada struk yang sama diunggah dua kali. Hapus salah satunya.' })
  } else if (dupExisting) {
    checks.push({
      rule: 'R6',
      ok: false,
      message: `Struk no. ${dupExisting.receiptNo} sudah pernah dipakai. Satu struk hanya bisa ditukar sekali.`,
    })
  } else {
    const hashes = new Set(others.map((r) => r.photoHash))
    const samePhoto = inputs.some((r) => r.photoHash && hashes.has(r.photoHash))
    checks.push(
      samePhoto
        ? { rule: 'R6', ok: true, warning: true, message: 'Foto struk mirip struk lain. Panitia akan cek ulang.' }
        : { rule: 'R6', ok: true, message: 'Struk belum pernah dipakai' },
    )
  }

  return { checks, total }
}

export function receiptChecksPass(checks: RuleCheck[]): boolean {
  return checks.every((c) => c.ok)
}

/* ---------------- Misc ---------------- */

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
export function randomCode(prefix: string, len = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  let s = ''
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length]
  return `${prefix}-${s}`
}

export function uid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
}


/* ------------------------------------------------------------------ order changes (PV-12, PV-13) */

/** Visitors may cancel a confirmed order up to this many hours before the session (refund simulated). */
export const CANCEL_MIN_HOURS = 24

export type Policy<T extends object = object> = ({ allowed: true } & T) | { allowed: false; reason: string }

export function visitorCancelPolicy(
  order: Pick<Order, 'status' | 'totalAmount' | 'paymentMethod'>,
  session: Pick<Session, 'startAt' | 'demoLive'>,
  tickets: Array<Pick<Ticket, 'status'>>,
  now: Date,
): Policy<{ refund: number }> {
  if (order.status === 'AWAITING_PAYMENT' || order.status === 'AWAITING_VERIFICATION') return { allowed: true, refund: 0 }
  if (order.status !== 'CONFIRMED') return { allowed: false, reason: 'Pesanan ini sudah tidak aktif.' }
  if (tickets.some((t) => t.status === 'USED')) return { allowed: false, reason: 'Sebagian tiket sudah dipakai check-in, jadi pesanan tidak bisa dibatalkan.' }
  if (session.demoLive) return { allowed: false, reason: 'Sesi ini sedang berlangsung, pembatalan sudah ditutup.' }
  const hoursLeft = (new Date(session.startAt).getTime() - now.getTime()) / 3_600_000
  if (hoursLeft < CANCEL_MIN_HOURS) return { allowed: false, reason: `Pembatalan ditutup ${CANCEL_MIN_HOURS} jam sebelum sesi mulai.` }
  const paid = order.paymentMethod === 'SIM_QRIS' || order.paymentMethod === 'SIM_VA'
  return { allowed: true, refund: paid ? order.totalAmount : 0 }
}

/** Attendee names can change until the session ends; a ticket that was already scanned keeps its name. */
export function attendeeEditPolicy(order: Pick<Order, 'status'>, session: Pick<Session, 'endAt'>, now: Date): Policy {
  if (order.status === 'CANCELLED' || order.status === 'EXPIRED' || order.status === 'REJECTED') return { allowed: false, reason: 'Pesanan sudah tidak aktif.' }
  if (new Date(session.endAt) <= now) return { allowed: false, reason: 'Sesi sudah selesai, nama peserta tidak bisa diubah lagi.' }
  return { allowed: true }
}
