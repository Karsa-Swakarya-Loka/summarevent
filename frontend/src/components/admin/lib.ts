/**
 * Small helpers shared by the panitia (admin) screens. No React components here
 * (keeps react-refresh happy); see AdminUi.tsx for the shared UI bits.
 */
import { CalendarDays, LayoutDashboard, ReceiptText, Rows3, UserCog, Users } from 'lucide-react'
import { api } from '@/api'
import type { EventStats, EventSummary, ReceiptQueueItem } from '@/api/contract'
import type { Tone } from '@/domain/labels'
import type { EventItem, OrderItem, SeatStatus } from '@/domain/types'
import { fmtDayMonth, fmtShortDate, wibDate, wibTime } from '@/lib/format'
import { excelCsv } from './csv'

/** The panitia menu: the sidebar, the breadcrumb and the command palette read it. */
export const ADMIN_NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/events', label: 'Event', icon: CalendarDays },
  { to: '/admin/live', label: 'Peta kursi live', icon: Rows3 },
  { to: '/admin/orders', label: 'Pesanan & peserta', icon: Users },
  {
    to: '/admin/receipts',
    label: 'Verifikasi struk',
    icon: ReceiptText,
    badge: true,
  },
  { to: '/admin/staff', label: 'Petugas', icon: UserCog },
]

/** Main demo event (PRD §6) – default selection on every admin screen. */
const MAIN_EVENT_ID = 'evt_sangkuriang'

/** WIB date + time inputs → ISO (UTC). */
export function wibIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00+07:00`).toISOString()
}

/** `<input type="datetime-local">` value (interpreted as WIB) → ISO. */
export function localInputToIso(value: string): string {
  const [d, t] = value.split('T')
  return wibIso(d, (t ?? '00:00').slice(0, 5))
}

/** ISO → `<input type="datetime-local">` value in WIB. */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso)
  return `${wibDate(d)}T${wibTime(d)}`
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return t.toISOString().slice(0, 10)
}

export function publicEventUrl(slug: string): string {
  return `${window.location.origin}/app/e/${slug}`
}

/** Download a CSV from the API with a UTF-8 BOM so Excel shows names and dashes correctly, made Excel-safe by csv.ts. */
export async function downloadEventCsv(eventId: string, type: 'attendees' | 'transactions'): Promise<{ filename: string; rows: number }> {
  const { filename, csv } = await api.admin.exportCsv(eventId, type)
  const blob = new Blob(['\ufeff' + excelCsv(csv)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return { filename, rows: Math.max(0, csv.split('\n').length - 1) }
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** "C7–C10" for consecutive seats in one row, "A1, B4" otherwise; "3 orang" for no-seat items. */
export function seatSummary(items: Pick<OrderItem, 'seatLabel'>[]): string {
  const labels = items.map((i) => i.seatLabel).filter((l): l is string => !!l)
  if (!labels.length) return `${items.length} orang`
  const parsed = labels
    .map((l) => {
      const m = /^([A-Z]+)(\d+)$/.exec(l)
      return m ? { row: m[1], n: Number(m[2]) } : null
    })
    .filter((x): x is { row: string; n: number } => !!x)
  if (parsed.length !== labels.length) return labels.join(', ')
  const byRow = new Map<string, number[]>()
  for (const p of parsed) byRow.set(p.row, [...(byRow.get(p.row) ?? []), p.n])
  const parts: string[] = []
  for (const [row, nums] of byRow) {
    nums.sort((a, b) => a - b)
    let start = nums[0]
    let prev = nums[0]
    for (let i = 1; i <= nums.length; i++) {
      const n = nums[i]
      if (n === prev + 1) {
        prev = n
        continue
      }
      parts.push(start === prev ? `${row}${start}` : prev === start + 1 ? `${row}${start}, ${row}${prev}` : `${row}${start}–${row}${prev}`)
      start = n
      prev = n
    }
  }
  return parts.join(', ')
}

export const SEAT_TONE: Record<SeatStatus, Tone> = {
  AVAILABLE: 'valid',
  HELD: 'warn',
  SOLD: 'neutral',
  BLOCKED: 'neutral',
}

export type EventDisplayStatus = 'DRAFT' | 'PUBLISHED' | 'ENDED'
export const EVENT_STATUS_LABEL: Record<EventDisplayStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Dipublikasikan',
  ENDED: 'Selesai',
}
export const EVENT_STATUS_TONE: Record<EventDisplayStatus, Tone> = {
  DRAFT: 'neutral',
  PUBLISHED: 'valid',
  ENDED: 'neutral',
}

export function eventDisplayStatus(e: EventItem, now = new Date()): EventDisplayStatus {
  if (e.status === 'DRAFT') return 'DRAFT'
  if (e.status === 'ENDED' || new Date(e.endAt) < now) return 'ENDED'
  return 'PUBLISHED'
}

export function eventDateLabel(e: EventItem): string {
  const a = fmtShortDate(e.startAt)
  const b = fmtShortDate(e.endAt)
  return a === b ? a : `${a} – ${b}`
}

/** Events that have something to monitor (sessions + tickets). */
export function ticketedEvents(events: EventSummary[] | undefined): EventSummary[] {
  return (events ?? []).filter((e) => !e.event.infoOnly)
}

/** The event the panitia chose last, kept on this device so every admin screen opens on it again. */
const EVENT_KEY = 'summarevent:admin:event'
export function rememberedEventId(): string | null {
  try {
    return localStorage.getItem(EVENT_KEY)
  } catch {
    return null
  }
}
export function rememberEventId(id: string) {
  try {
    localStorage.setItem(EVENT_KEY, id)
  } catch {
    /* private mode: the choice lives in the URL only */
  }
}

/** Admin pages that show one event and carry it in `?event=`; the others only remember the choice. */
export const EVENT_PAGES = ['/admin', '/admin/live', '/admin/orders']

/** What the admin shell hands every page: the events, the one in view, and how to switch. */
export interface AdminOutlet {
  events: EventSummary[] | undefined
  eventsError: unknown
  reloadEvents: () => void
  /** The events with something to monitor (sessions and tickets). */
  list: EventSummary[]
  eventId: string
  summary: EventSummary | undefined
  setEventId: (id: string) => void
}

/** The event to show: the one asked for, else the one chosen last, else the main demo event, else the first. */
export function pickEventId(events: EventSummary[] | undefined, wanted: string | null | undefined): string {
  const list = events ?? []
  const has = (id: string | null | undefined) => !!id && list.some((e) => e.event.id === id)
  if (has(wanted)) return wanted!
  const kept = rememberedEventId()
  if (has(kept)) return kept!
  if (has(MAIN_EVENT_ID)) return MAIN_EVENT_ID
  return list[0]?.event.id ?? ''
}

/** "33/200" of a session: tickets sold over its places. */
export function sessionSold(s: EventSummary['sessions'][number]): { sold: number; total: number } {
  return { sold: s.availability.reduce((a, x) => a + x.sold, 0), total: s.total }
}

export function sessionLabel(s: { label?: string; startAt: string; endAt: string; demoLive?: boolean }): string {
  if (s.demoLive) return s.label ?? 'Sesi demo'
  const time = `${fmtShortDate(s.startAt)}, ${new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(s.startAt)).replace(':', '.')}`
  return s.label ? `${s.label} · ${time}` : time
}

/** "Sesi 2", or the date and time when a session has no name; a note in brackets is left out ("Sesi Demo Juri"). For tight cells. */
export function sessionShort(s: { label?: string; startAt: string; endAt: string; demoLive?: boolean }): string {
  const name = s.label?.replace(/\s*\(.*\)\s*$/, '').trim()
  return name || sessionLabel({ ...s, label: undefined })
}

/** A receipt set can still be decided: the order waits for verification and has pending receipts. */
export const canDecide = (it: ReceiptQueueItem) => it.order.status === 'AWAITING_VERIFICATION' && it.siblings.some((s) => s.status === 'PENDING')

/* ---------- dashboard series ---------- */

/** "1,2jt" / "450rb" / "0": one word, for a narrow axis. */
export const axisRupiah = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })}jt` : n >= 1_000 ? `${Math.round(n / 1_000)}rb` : String(n))

/**
 * A chart axis with round ticks: the step is 1, 2, 2.5 or 5 × 10ⁿ (no 2.5 for counts), about `parts` steps up to the
 * largest value, so the labels read 0 · 200rb · 400rb · 600rb and never 167rb or 333rb.
 */
export function niceScale(max: number, { integer = false, parts = 3, floor = 0 } = {}): { top: number; ticks: number[] } {
  const target = Math.max(max, floor)
  if (target <= 0) return { top: 1, ticks: [0] }
  const raw = target / parts
  const p = 10 ** Math.floor(Math.log10(raw))
  const u = raw / p
  const units = integer ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10]
  let step = (units.find((x) => u <= x) ?? 10) * p
  if (integer) step = Math.max(1, Math.round(step))
  const top = Math.ceil(target / step) * step
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => Math.round(i * step * 100) / 100)
  return { top, ticks }
}

export type Range = 7 | 14 | 30
export const RANGES: Array<{ days: Range; label: string }> = [
  { days: 7, label: '7 hari' },
  { days: 14, label: '14 hari' },
  { days: 30, label: '30 hari' },
]

/**
 * The last `days` of the series, each with a short label for the axis: a day ("3 Nov") for a week or two, and for a
 * month the days grouped by week ("6–12 Okt"), counted back from today so the latest bar is a full week; only the
 * oldest group may be shorter, and its label says which days it holds.
 */
export function lastDays(daily: EventStats['daily'], days: Range) {
  const rows = daily.slice(-days)
  if (days <= 14) return rows.map((d) => ({ ...d, day: fmtDayMonth(d.date) }))
  const weeks: Array<{
    date: string
    day: string
    tickets: number
    revenue: number
    orders: number
  }> = []
  for (let i = rows.length % 7 || 7, start = 0; start < rows.length; start = i, i += 7) {
    const chunk = rows.slice(start, i)
    const first = chunk[0]
    const last = chunk[chunk.length - 1]
    weeks.push({
      date: first.date,
      day: `${fmtDayMonth(first.date).split(' ')[0]}–${fmtDayMonth(last.date)}`,
      tickets: chunk.reduce((a, d) => a + d.tickets, 0),
      revenue: chunk.reduce((a, d) => a + d.revenue, 0),
      orders: chunk.reduce((a, d) => a + d.orders, 0),
    })
  }
  return weeks
}
