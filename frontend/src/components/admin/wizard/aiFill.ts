/**
 * AD-01 with AI: the panitia describes an event in plain words, the AI assistant pulls out what the wizard needs, and
 * this file turns it into the wizard form. Everything the AI sends is checked here first: it is untrusted text.
 */
import type { AccessMethod, PosterTheme, SeatingMode, Tenant, Venue } from '@/domain/types'
import { wibDate } from '@/lib/format'
import { changeVenue, key, newCategory, presetReceiptRules, type CatForm, type SessionForm, type WizardForm } from './model'

export interface AiSession {
  /** YYYY-MM-DD */
  date: string
  /** HH:MM */
  start: string
  /** HH:MM, after start */
  end?: string
  label?: string
}

export interface AiCategory {
  name: string
  method: AccessMethod
  /** PAID: rupiah, at least 1.000 */
  price?: number
  /** RECEIPT: least spend in rupiah */
  minSpend?: number
  /** Places per session, for a category without seat numbers */
  quota?: number
  /** RESERVED mode: false = a standing area without seat numbers */
  seated?: boolean
}

export interface AiEventFields {
  title?: string
  subtitle?: string
  description?: string
  venueId?: string
  posterTheme?: PosterTheme
  seatingMode?: SeatingMode
  sessions?: AiSession[]
  categories?: AiCategory[]
  /** Most visitors expected per session */
  audience?: number
}

/** What the assistant keeps asking for until it has it. */
export const AI_REQUIRED = ['title', 'venueId', 'seatingMode', 'sessions', 'categories', 'audience'] as const satisfies ReadonlyArray<keyof AiEventFields>
type Required = (typeof AI_REQUIRED)[number]

export const AI_FIELD_LABEL: Record<keyof AiEventFields, string> = {
  title: 'Nama acara',
  subtitle: 'Subjudul',
  description: 'Deskripsi',
  venueId: 'Venue',
  posterTheme: 'Tema poster',
  seatingMode: 'Mode kursi',
  sessions: 'Tanggal dan jam',
  categories: 'Kategori tiket',
  audience: 'Jumlah pengunjung',
}

const THEME: Record<string, PosterTheme> = { pertunjukan: 'stage', konser: 'acoustic', kelas: 'craft', pameran: 'expo' }
const THEME_LABEL: Record<PosterTheme, string> = { stage: 'Pertunjukan', acoustic: 'Konser', craft: 'Kelas', expo: 'Pameran' }
const METHOD_LABEL: Record<AccessMethod, string> = { PAID: 'bayar', FREE: 'gratis', RECEIPT: 'struk' }
const MAX_ROWS = 26
const MAX_ITEMS = 6
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function text(v: unknown, min: number, max: number): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.replace(/\s+/g, ' ').trim()
  return s.length >= min ? s.slice(0, max) : undefined
}

function whole(v: unknown, min: number, max: number): number | undefined {
  // a string counts only as digits with optional thousands dots or commas: "50.000" yes, "50,5" no
  const n = typeof v === 'string' ? (/^\d{1,3}([.,]\d{3})+$|^\d+$/.test(v.trim()) ? Number(v.replace(/[.,]/g, '')) : Number.NaN) : v
  return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max ? n : undefined
}

/** Rupiah of at least Rp1.000 (the wizard's own rule). */
const rupiah = (v: unknown) => whole(v, 1000, 10_000_000)

function ymd(v: unknown, today: string): string | undefined {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || v < today) return undefined
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? undefined : v
}

function hm(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const m = /^([01]?\d|2[0-3])[:.]([0-5]\d)$/.exec(v.trim())
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : undefined
}

/** The venue the AI named, matched to the mall's own list. A name that fits several venues ("Atrium") is not a match. */
function venueOf(v: unknown, venues: Venue[]): string | undefined {
  if (typeof v !== 'string' || norm(v).length < 3) return undefined
  const n = norm(v)
  const exact = venues.find((x) => norm(x.name) === n)
  if (exact) return exact.id
  const near = venues.filter((x) => norm(x.name).includes(n) || n.includes(norm(x.name)))
  return near.length === 1 ? near[0].id : undefined
}

function methodOf(v: unknown): AccessMethod | undefined {
  const s = typeof v === 'string' ? norm(v) : ''
  if (/^(bayar|berbayar|paid|beli)/.test(s)) return 'PAID'
  if (/^(gratis|free|daftar)/.test(s)) return 'FREE'
  if (/(struk|receipt)/.test(s)) return 'RECEIPT'
  return undefined
}

function seatingOf(v: unknown): SeatingMode | undefined {
  const s = typeof v === 'string' ? norm(v) : ''
  if (/^(bernomor|reserved|kursi|duduk)/.test(s)) return 'RESERVED'
  if (/^(bebas|general|tanpa|berdiri|lesehan)/.test(s)) return 'GENERAL'
  return undefined
}

function sessionsOf(v: unknown, today: string): AiSession[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: AiSession[] = []
  for (const raw of v.slice(0, MAX_ITEMS)) {
    const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    const date = ymd(r.date, today)
    const start = hm(r.start)
    if (!date || !start) continue
    const end = hm(r.end)
    out.push({ date, start, ...(end && end > start ? { end } : {}), ...(text(r.label, 2, 40) ? { label: text(r.label, 2, 40) } : {}) })
  }
  return out.length ? out : undefined
}

function categoriesOf(v: unknown): AiCategory[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: AiCategory[] = []
  for (const raw of v.slice(0, MAX_ITEMS)) {
    const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    const name = text(r.name, 2, 40)
    const method = methodOf(r.method)
    if (!name || !method || out.some((c) => norm(c.name) === norm(name))) continue
    const c: AiCategory = { name, method }
    if (method === 'PAID' && rupiah(r.price) !== undefined) c.price = rupiah(r.price)
    if (method === 'RECEIPT' && rupiah(r.minSpend) !== undefined) c.minSpend = rupiah(r.minSpend)
    const quota = whole(r.quota, 1, 5000)
    if (quota !== undefined) c.quota = quota
    if (typeof r.seated === 'boolean') c.seated = r.seated
    out.push(c)
  }
  return out.length ? out : undefined
}

/** Only the fields that pass every check survive; anything else the AI sent is ignored. */
export function sanitizeAiFields(raw: unknown, venues: Venue[], today = wibDate()): AiEventFields {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out: AiEventFields = {
    title: text(r.title, 3, 80),
    subtitle: text(r.subtitle, 3, 80),
    description: text(r.description, 3, 500),
    venueId: venueOf(r.venueName ?? r.venue, venues),
    posterTheme: typeof r.theme === 'string' ? THEME[norm(r.theme)] : undefined,
    seatingMode: seatingOf(r.seating),
    sessions: sessionsOf(r.sessions, today),
    categories: categoriesOf(r.categories),
    audience: whole(r.audience, 1, 5000),
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as AiEventFields
}

/** Later answers fill in or correct earlier ones; a field the AI did not mention again stays. */
export function mergeAiFields(prev: AiEventFields, next: AiEventFields): AiEventFields {
  return { ...prev, ...next }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Fields worked out from each other: seats per category follow the seating mode, quotas follow the visitors. */
const LINKED = ['seatingMode', 'categories', 'audience'] as const

/**
 * Only what changed since the form was last filled, so a second fill does not undo what the panitia typed since. When
 * the seating mode, the categories or the visitors change, all three go together, because the categories are built
 * from the other two.
 */
export function changedAiFields(applied: AiEventFields, now: AiEventFields): AiEventFields {
  const changed = Object.fromEntries(Object.entries(now).filter(([k, v]) => !same(applied[k as keyof AiEventFields], v))) as AiEventFields
  if (LINKED.some((k) => k in changed)) for (const k of LINKED) if (now[k] !== undefined) (changed as Record<string, unknown>)[k] = now[k]
  return changed
}

/** A category is complete when it says what a ticket costs, and how many places it has when it has no seat numbers. */
function categoryComplete(c: AiCategory, mode: SeatingMode | undefined, audience: number | undefined): boolean {
  if (c.method === 'PAID' && c.price === undefined) return false
  if (c.method === 'RECEIPT' && c.minSpend === undefined) return false
  const needsQuota = mode === 'GENERAL' || c.seated === false
  return !needsQuota || c.quota !== undefined || audience !== undefined
}

export function missingAiFields(f: AiEventFields): Required[] {
  return AI_REQUIRED.filter((k) => {
    if (k === 'categories') return !f.categories?.length || !f.categories.every((c) => categoryComplete(c, f.seatingMode, f.audience))
    return f[k] === undefined
  })
}

/**
 * What is known so far, in the assistant's own words, sent with every question: the conversation it sees is only the
 * last few messages, so this is how it remembers the rest.
 */
export function aiKnown(f: AiEventFields, venues: Venue[]): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries({
      title: f.title,
      subtitle: f.subtitle,
      description: f.description,
      venueName: venues.find((v) => v.id === f.venueId)?.name,
      theme: f.posterTheme && THEME_LABEL[f.posterTheme],
      seating: f.seatingMode && (f.seatingMode === 'RESERVED' ? 'bernomor' : 'bebas'),
      sessions: f.sessions,
      categories: f.categories?.map((c) => ({ ...c, method: METHOD_LABEL[c.method] })),
      audience: f.audience,
    }).filter(([, v]) => v !== undefined),
  )
}

const plusMinutes = (t: string, min: number) => {
  const [h, m] = t.split(':').map(Number)
  const x = Math.min(23 * 60 + 59, h * 60 + m + min)
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`
}

function sessionForm(s: AiSession): SessionForm {
  const auto = plusMinutes(s.start, 120)
  return { key: key('s'), label: s.label ?? '', date: s.date, start: s.start, end: s.end ?? (auto > s.start ? auto : ''), demoLive: false }
}

function categoryForm(c: AiCategory, i: number, mode: SeatingMode, audience: number | undefined, tenants: Tenant[]): CatForm {
  const base = newCategory(i, mode)
  const noSeat = mode === 'GENERAL' || c.seated === false
  return {
    ...base,
    name: c.name,
    accessMethod: c.method,
    price: c.method === 'PAID' ? (c.price ?? Number.NaN) : 0,
    noSeat,
    quota: noSeat ? (c.quota ?? audience ?? base.quota) : base.quota,
    receiptRules: c.method === 'RECEIPT' ? { ...presetReceiptRules(tenants), minSpend: c.minSpend ?? Number.NaN } : null,
  }
}

/**
 * Pours the fields into the form, without touching anything the AI did not find. Sessions and categories are replaced
 * as a whole (the AI always sends the full list); the seat map grows to the visitors, up to the venue's capacity, while
 * the panitia has not shaped it yet, and its rows are spread over the categories when the Denah step opens.
 */
export function applyAiFields(form: WizardForm, f: AiEventFields, venues: Venue[], tenants: Tenant[] = []): WizardForm {
  let next = form
  if (f.title) next = { ...next, title: f.title }
  if (f.subtitle) next = { ...next, subtitle: f.subtitle }
  if (f.description) next = { ...next, description: f.description }
  if (f.posterTheme) next = { ...next, posterTheme: f.posterTheme }
  if (f.venueId) next = changeVenue(next, f.venueId, venues)
  if (f.seatingMode && f.seatingMode !== next.seatingMode) {
    next = { ...next, seatingMode: f.seatingMode, categories: next.categories.map((c) => (f.seatingMode === 'GENERAL' ? { ...c, noSeat: true } : c)) }
  }
  if (f.sessions?.length) next = { ...next, sessions: f.sessions.map(sessionForm) }
  if (f.categories?.length) {
    const mode = next.seatingMode
    next = { ...next, categories: f.categories.map((c, i) => categoryForm(c, i, mode, f.audience, tenants)), layout: { ...next.layout, ranges: [] } }
  }

  if (f.audience) {
    const cap = venues.find((v) => v.id === next.venueId)?.capacity
    const L = next.layout
    const standing = next.categories.filter((c) => c.noSeat).length
    if (next.seatingMode === 'GENERAL') {
      // categories without their own number share the visitors
      next = { ...next, categories: next.categories.map((c) => (f.categories?.find((x) => x.name === c.name)?.quota ? c : { ...c, quota: Math.max(1, Math.round(f.audience! / Math.max(1, standing))) })) }
    } else if (!L.ranges.length && !L.blocked.length && L.seatsPerRow > 0 && standing < next.categories.length) {
      const target = Math.min(f.audience, cap ?? f.audience)
      // enough rows for the visitors, never more seats than the venue holds
      const fit = cap ? Math.max(1, Math.floor(cap / L.seatsPerRow)) : MAX_ROWS
      next = { ...next, layout: { ...L, rows: Math.max(1, Math.min(MAX_ROWS, fit, Math.ceil(target / L.seatsPerRow))) } }
    }
  }
  return next
}
