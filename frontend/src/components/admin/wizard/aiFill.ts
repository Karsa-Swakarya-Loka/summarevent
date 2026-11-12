/**
 * AD-01 with AI: the panitia describes an event in plain words, the AI assistant pulls out the fields, and this file
 * turns what it found into the wizard form. Everything the AI sends is checked here first: it is untrusted text.
 */
import type { Venue } from '@/domain/types'
import { changeVenue, type WizardForm } from './model'

export interface AiEventFields {
  title?: string
  description?: string
  venueId?: string
  /** YYYY-MM-DD */
  date?: string
  /** HH:MM */
  start?: string
  /** HH:MM, after start */
  end?: string
  /** Rupiah per ticket, 0 = free */
  price?: number
  categoryName?: string
  /** Most visitors expected */
  audience?: number
}

/** What the assistant keeps asking for until it has it. */
export const AI_REQUIRED = ['title', 'venueId', 'date', 'start', 'price', 'audience'] as const satisfies ReadonlyArray<keyof AiEventFields>

export const AI_FIELD_LABEL: Record<keyof AiEventFields, string> = {
  title: 'Nama acara',
  description: 'Deskripsi',
  venueId: 'Venue',
  date: 'Tanggal',
  start: 'Jam mulai',
  end: 'Jam selesai',
  price: 'Harga tiket',
  categoryName: 'Nama kategori',
  audience: 'Jumlah pengunjung',
}

const MAX_ROWS = 26
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function text(v: unknown, min: number, max: number): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.replace(/\s+/g, ' ').trim()
  return s.length >= min ? s.slice(0, max) : undefined
}

function whole(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === 'string' ? Number(v.replace(/[^\d]/g, '')) : v
  return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max ? n : undefined
}

function ymd(v: unknown): string | undefined {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? undefined : v
}

function hm(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const m = /^([01]?\d|2[0-3])[:.]([0-5]\d)$/.exec(v.trim())
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : undefined
}

/** The venue the AI named, matched to the mall's own list; a name not on the list is dropped. */
function venueOf(v: unknown, venues: Venue[]): string | undefined {
  if (typeof v !== 'string' || norm(v).length < 3) return undefined
  const n = norm(v)
  return venues.find((x) => norm(x.name) === n)?.id ?? venues.find((x) => norm(x.name).includes(n) || n.includes(norm(x.name)))?.id
}

/** Only the fields that pass every check survive; anything else the AI sent is ignored. */
export function sanitizeAiFields(raw: unknown, venues: Venue[]): AiEventFields {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const start = hm(r.start)
  const end = hm(r.end)
  const out: AiEventFields = {
    title: text(r.title, 3, 80),
    description: text(r.description, 3, 500),
    venueId: venueOf(r.venueName ?? r.venue, venues),
    date: ymd(r.date),
    start,
    end: end && (!start || end > start) ? end : undefined,
    price: whole(r.price, 0, 10_000_000),
    categoryName: text(r.categoryName, 2, 40),
    audience: whole(r.audience, 1, 5000),
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as AiEventFields
}

/** Later answers fill in or correct earlier ones; a field the AI did not mention again stays. */
export function mergeAiFields(prev: AiEventFields, next: AiEventFields): AiEventFields {
  return { ...prev, ...next }
}

export function missingAiFields(f: AiEventFields): Array<(typeof AI_REQUIRED)[number]> {
  return AI_REQUIRED.filter((k) => f[k] === undefined)
}

const plusMinutes = (t: string, min: number) => {
  const [h, m] = t.split(':').map(Number)
  const x = Math.min(23 * 60 + 59, h * 60 + m + min)
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`
}

/**
 * Pours the fields into the form, without touching anything the AI did not find. The first session gets the date and
 * time, the first category the price, and the seat map grows to the number of visitors (up to the venue's capacity)
 * while the panitia has not shaped it yet.
 */
export function applyAiFields(form: WizardForm, f: AiEventFields, venues: Venue[]): WizardForm {
  let next = form
  if (f.title) next = { ...next, title: f.title }
  if (f.description) next = { ...next, description: f.description }
  if (f.venueId) next = changeVenue(next, f.venueId, venues)

  if (f.date || f.start || f.end) {
    const [s0, ...rest] = next.sessions
    const start = f.start ?? s0.start
    const end = f.end && f.end > start ? f.end : f.start ? plusMinutes(start, 120) : s0.end
    next = { ...next, sessions: [{ ...s0, date: f.date ?? s0.date, start, end }, ...rest] }
  }

  if (f.price !== undefined || f.categoryName) {
    const [c0, ...rest] = next.categories
    const price = f.price ?? c0.price
    const free = price === 0
    const name = f.categoryName ?? (c0.name || (free ? 'Gratis' : 'Reguler'))
    next = { ...next, categories: [{ ...c0, name, price, accessMethod: free ? 'FREE' : 'PAID', receiptRules: null }, ...rest] }
  }

  if (f.audience) {
    const cap = venues.find((v) => v.id === next.venueId)?.capacity
    const target = Math.min(f.audience, cap ?? f.audience)
    const L = next.layout
    const [c0, ...rest] = next.categories
    if (next.seatingMode === 'GENERAL' || c0.noSeat) next = { ...next, categories: [{ ...c0, quota: target }, ...rest] }
    else if (!L.ranges.length && !L.blocked.length && L.seatsPerRow > 0) {
      next = { ...next, layout: { ...L, rows: Math.max(1, Math.min(MAX_ROWS, Math.ceil(target / L.seatsPerRow))) } }
    }
  }
  return next
}
