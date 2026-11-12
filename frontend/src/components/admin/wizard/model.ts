/**
 * Event wizard form model: local form state ⇄ EventDraft, defaults and
 * validation with messages that explain the fix (PRD §13 principle 3).
 */
import type { EventDraft } from '@/api/contract'
import { CATEGORY_COLORS } from '@/domain/labels'
import { buildSeats, posterImageCheck, posterPaletteCheck, rowIndex, rowLetter, seatLabel } from '@/domain/rules'
import type { AccessMethod, EventRules, PosterPalette, PosterTheme, ReceiptRules, Seat, SeatingMode, Tenant, Venue } from '@/domain/types'
import { rupiahPlain, wibDate } from '@/lib/format'
import { addDaysYmd, isoToLocalInput, localInputToIso, wibIso } from '../lib'

export type StepId = 'info' | 'kategori' | 'denah' | 'sesi' | 'publish'
export const STEPS: Array<{ id: StepId; label: string }> = [
  { id: 'info', label: 'Info' },
  { id: 'kategori', label: 'Kategori' },
  { id: 'denah', label: 'Denah' },
  { id: 'sesi', label: 'Sesi' },
  { id: 'publish', label: 'Publikasi' },
]

export interface CatForm {
  key: string
  id?: string
  name: string
  color: string
  accessMethod: AccessMethod
  /** NaN = empty input */
  price: number
  /** RESERVED mode: category without seat numbers (standing area, quota). GENERAL: always true. */
  noSeat: boolean
  quota: number
  /** datetime-local value, WIB */
  saleStart: string
  saleCloseMin: number
  description: string
  receiptRules: ReceiptRules | null
  bonusFirstN?: number | null
  bonusDesc?: string | null
}

export interface RangeForm {
  key: string
  catKey: string
  from: number
  to: number
}

export interface LayoutForm {
  rows: number
  seatsPerRow: number
  aisleAfter: number | null
  /** Rows bend around the stage. */
  curved?: boolean
  ranges: RangeForm[]
  blocked: string[]
  priority: string[]
}

export interface SessionForm {
  key: string
  id?: string
  label: string
  date: string
  start: string
  end: string
  demoLive: boolean
}

export interface WizardForm {
  title: string
  subtitle: string
  description: string
  posterTheme: PosterTheme
  /** The panitia's own colours, or null for the theme's. */
  posterPalette: PosterPalette | null
  /** The panitia's own poster picture (a data URL), or null for the generated poster. */
  posterImage: string | null
  venueId: string
  seatingMode: SeatingMode
  rules: EventRules
  categories: CatForm[]
  layout: LayoutForm
  sessions: SessionForm[]
}

let seq = 0
export function key(prefix = 'k'): string {
  seq += 1
  return `${prefix}${seq}_${Math.random().toString(36).slice(2, 7)}`
}

export const DEFAULT_RULES: EventRules = {
  maxSeatsPerOrder: 4,
  paymentHoldMin: 10,
  receiptHoldMin: 30,
  checkinOpenMin: 30,
  checkinCloseMin: 0,
  transferable: false,
  reentryAllowed: false,
}

export function presetReceiptRules(tenants: Tenant[]): ReceiptRules {
  return {
    minSpend: 300_000,
    allowMultiple: false,
    maxReceiptsCombined: 3,
    maxReceiptsPerTenantDay: 5,
    sameDayRequired: true,
    cutoffTime: '22:00',
    excludedTenantIds: tenants.filter((t) => t.category.toLowerCase() === 'bazaar').map((t) => t.id),
  }
}

export function emptyReceiptRules(): ReceiptRules {
  return {
    minSpend: Number.NaN,
    allowMultiple: false,
    maxReceiptsCombined: 1,
    maxReceiptsPerTenantDay: 5,
    sameDayRequired: true,
    cutoffTime: '22:00',
    excludedTenantIds: [],
  }
}

/** Start of the current hour: a new event can be booked right after it is published. */
function currentHourInput(): string {
  const d = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000)
  return isoToLocalInput(d.toISOString())
}

export function newCategory(index: number, mode: SeatingMode): CatForm {
  return {
    key: key('c'),
    name: '',
    color: CATEGORY_COLORS[index % CATEGORY_COLORS.length].value,
    accessMethod: 'PAID',
    price: Number.NaN,
    noSeat: mode === 'GENERAL',
    quota: mode === 'GENERAL' ? 50 : Number.NaN,
    saleStart: currentHourInput(),
    saleCloseMin: 60,
    description: '',
    receiptRules: null,
  }
}

export function newSession(prev?: SessionForm): SessionForm {
  if (prev && prev.date && prev.start) {
    const [h, m] = prev.start.split(':').map(Number)
    const [eh, em] = (prev.end || prev.start).split(':').map(Number)
    const dur = Math.max(30, eh * 60 + em - (h * 60 + m))
    const startMin = Math.min(23 * 60, h * 60 + m + dur + 120)
    const endMin = Math.min(23 * 60 + 59, startMin + dur)
    const hm = (x: number) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`
    return { key: key('s'), label: '', date: prev.date, start: hm(startMin), end: hm(endMin), demoLive: false }
  }
  return { key: key('s'), label: '', date: addDaysYmd(wibDate(), 14), start: '13:00', end: '14:00', demoLive: false }
}

export function emptyForm(venues: Venue[]): WizardForm {
  const first = newCategory(0, 'RESERVED')
  return {
    title: '',
    subtitle: '',
    description: '',
    posterTheme: 'stage',
    posterPalette: null,
    posterImage: null,
    venueId: venues[0]?.id ?? '',
    seatingMode: 'RESERVED',
    rules: { ...DEFAULT_RULES },
    categories: [first],
    layout: { ...templateSize(templateForVenue(venues[0]?.capacity)), ranges: [], blocked: [], priority: [] },
    sessions: [newSession()],
  }
}

/** Seat categories = categories that live on the seat map. */
export function seatCategories(form: WizardForm): CatForm[] {
  if (form.seatingMode !== 'RESERVED') return []
  return form.categories.filter((c) => !c.noSeat)
}

/** Split all rows evenly over the seat categories, front rows to the first category. */
export function distributeRows(form: WizardForm): RangeForm[] {
  const cats = seatCategories(form)
  const rows = form.layout.rows
  if (!cats.length || rows < 1) return []
  const n = Math.min(cats.length, rows)
  const out: RangeForm[] = []
  let start = 0
  for (let i = 0; i < n; i++) {
    const size = Math.floor(rows / n) + (i < rows % n ? 1 : 0)
    out.push({ key: key('r'), catKey: cats[i].key, from: start, to: start + size - 1 })
    start += size
  }
  return out
}

/** Category key per row (first matching range wins, like the backend). */
export function rowCategoryKeys(layout: LayoutForm): Array<string | null> {
  return Array.from({ length: Math.max(0, layout.rows) }, (_, r) => layout.ranges.find((x) => r >= x.from && r <= x.to)?.catKey ?? null)
}

export function previewSeats(layout: LayoutForm): Seat[] {
  if (!(layout.rows > 0 && layout.seatsPerRow > 0)) return []
  return buildSeats(
    { id: 'preview', venueId: '', name: 'preview', rows: Math.min(layout.rows, 30), seatsPerRow: Math.min(layout.seatsPerRow, 40), aisleAfter: layout.aisleAfter, curved: layout.curved },
    layout.priority,
  )
}

/** Sellable seats per category key. */
export function seatCounts(layout: LayoutForm): Map<string, number> {
  const rowCats = rowCategoryKeys(layout)
  const blocked = new Set(layout.blocked)
  const out = new Map<string, number>()
  for (const s of previewSeats(layout)) {
    const k = rowCats[rowIndex(s.row)]
    if (!k || blocked.has(seatLabel(s))) continue
    out.set(k, (out.get(k) ?? 0) + 1)
  }
  return out
}

/** Seats a layout can sell at most: every seat in a row that has a category. */
export function maxSellable(layout: LayoutForm): number {
  const rowCats = rowCategoryKeys(layout)
  return previewSeats(layout).filter((s) => rowCats[rowIndex(s.row)]).length
}

/** Seats on sale per session: every seat in a category row that is not marked not-for-sale. */
export function sellableSeats(layout: LayoutForm): number {
  let n = 0
  for (const c of seatCounts(layout).values()) n += c
  return n
}

/**
 * The order in which "sell only N seats" closes seats: back row first, and within a row from the two ends toward the
 * middle, so the best seats stay on sale. Priority (wheelchair) seats are never closed by it.
 */
function closingOrder(layout: LayoutForm): string[] {
  const rowCats = rowCategoryKeys(layout)
  const priority = new Set(layout.priority)
  const mid = (layout.seatsPerRow + 1) / 2
  return previewSeats(layout)
    .filter((s) => rowCats[rowIndex(s.row)] && !priority.has(seatLabel(s)))
    .sort((a, b) => rowIndex(b.row) - rowIndex(a.row) || Math.abs(b.number - mid) - Math.abs(a.number - mid) || a.number - b.number)
    .map(seatLabel)
}

/**
 * The not-for-sale list that leaves `target` seats on sale. Fewer: seats close in closingOrder. More: seats reopen in
 * the same order, so the back seats it closed come back first and a seat closed by hand in front (a camera spot)
 * stays closed until the layout needs it.
 */
export function sellOnly(layout: LayoutForm, target: number): string[] {
  const order = closingOrder(layout)
  const goal = Math.max(0, Math.min(Math.floor(target), maxSellable(layout)))
  let selling = sellableSeats(layout)
  const blocked = new Set(layout.blocked)
  for (const label of order) {
    if (selling === goal) break
    if (selling > goal && !blocked.has(label)) {
      blocked.add(label)
      selling--
    } else if (selling < goal && blocked.has(label)) {
      blocked.delete(label)
      selling++
    }
  }
  return [...layout.blocked.filter((l) => blocked.has(l)), ...[...blocked].filter((l) => !layout.blocked.includes(l))]
}

/** Seat labels of one row (0 = A). */
function rowLabels(layout: LayoutForm, row: number): string[] {
  return previewSeats(layout)
    .filter((s) => rowIndex(s.row) === row)
    .map(seatLabel)
}

/** True when every seat of the row is marked not for sale. */
export function rowClosed(layout: LayoutForm, row: number): boolean {
  const labels = rowLabels(layout, row)
  return labels.length > 0 && labels.every((l) => layout.blocked.includes(l))
}

/** Close a whole row, or open it again when it is closed already. */
export function toggleRow(layout: LayoutForm, row: number): string[] {
  const labels = rowLabels(layout, row)
  if (rowClosed(layout, row)) return layout.blocked.filter((l) => !labels.includes(l))
  return [...layout.blocked, ...labels.filter((l) => !layout.blocked.includes(l))]
}

export function capacityOf(form: WizardForm): number {
  const quotas = form.categories.filter((c) => form.seatingMode === 'GENERAL' || c.noSeat).reduce((a, c) => a + (Number.isFinite(c.quota) ? c.quota : 0), 0)
  if (form.seatingMode !== 'RESERVED') return quotas
  let seats = 0
  for (const n of seatCounts(form.layout).values()) seats += n
  return seats + quotas
}

/* ---------------- validation ---------------- */

export interface Issue {
  step: StepId
  /** Field key used to show the message inline. */
  field: string
  message: string
  /** Warnings don't block saving. */
  warning?: boolean
}

const intIn = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max

export function validate(form: WizardForm, venues: Venue[]): Issue[] {
  const out: Issue[] = []
  const add = (step: StepId, field: string, message: string, warning = false) => out.push({ step, field, message, warning })

  /* info */
  if (form.title.trim().length < 3) add('info', 'title', 'Isi judul event (minimal 3 huruf), misalnya "Pentas Musikal Keluarga".')
  if (!form.description.trim()) add('info', 'description', 'Tulis deskripsi singkat: isi acara, durasi, dan untuk siapa.')
  if (!form.venueId) add('info', 'venueId', 'Pilih venue tempat acara.')
  if (form.posterPalette) {
    const c = posterPaletteCheck(form.posterPalette)
    if (!c.ok) add('info', 'posterPalette', c.reason)
  }
  const img = posterImageCheck(form.posterImage)
  if (!img.ok) add('info', 'posterImage', img.reason)
  const r = form.rules
  if (!intIn(r.maxSeatsPerOrder, 1, 10)) add('info', 'rules.maxSeatsPerOrder', 'Isi angka 1–10 tiket per akun per sesi.')
  if (!intIn(r.paymentHoldMin, 3, 60)) add('info', 'rules.paymentHoldMin', 'Isi 3–60 menit. Disarankan 10 menit.')
  if (!intIn(r.receiptHoldMin, 5, 180)) add('info', 'rules.receiptHoldMin', 'Isi 5–180 menit. Disarankan 30 menit supaya panitia sempat cek struk.')
  if (!intIn(r.checkinOpenMin, 0, 240)) add('info', 'rules.checkinOpenMin', 'Isi 0–240 menit sebelum sesi mulai.')

  /* kategori */
  if (!form.categories.length) add('kategori', 'categories', 'Tambahkan minimal 1 kategori tiket.')
  const names = new Map<string, number>()
  for (const c of form.categories) names.set(c.name.trim().toLowerCase(), (names.get(c.name.trim().toLowerCase()) ?? 0) + 1)
  for (const c of form.categories) {
    const f = (x: string) => `cat.${c.key}.${x}`
    const label = c.name.trim() || 'tanpa nama'
    if (!c.name.trim()) add('kategori', f('name'), 'Beri nama kategori, misalnya VIP atau Reguler.')
    else if ((names.get(c.name.trim().toLowerCase()) ?? 0) > 1) add('kategori', f('name'), `Nama "${c.name.trim()}" dipakai lebih dari sekali. Bedakan namanya.`)
    if (c.accessMethod === 'PAID' && !(Number.isFinite(c.price) && c.price >= 1000)) add('kategori', f('price'), `Isi harga kategori ${label} (minimal Rp1.000). Untuk tiket gratis pilih cara dapat "Gratis".`)
    const needsQuota = form.seatingMode === 'GENERAL' || c.noSeat
    if (needsQuota && !intIn(c.quota, 1, 5000)) add('kategori', f('quota'), `Isi kuota per sesi untuk ${label} (1–5000 orang).`)
    if (!c.saleStart) add('kategori', f('saleStart'), 'Isi kapan penjualan dibuka.')
    if (!intIn(c.saleCloseMin, 0, 1440)) add('kategori', f('saleCloseMin'), 'Isi 0–1440 menit (0 = tutup tepat saat sesi mulai).')
    const hasBonusN = c.bonusFirstN != null && Number.isFinite(c.bonusFirstN)
    if (hasBonusN || c.bonusDesc?.trim()) {
      if (!hasBonusN || !intIn(c.bonusFirstN as number, 1, 10000)) add('kategori', f('bonusN'), 'Isi berapa tiket pertama yang dapat bonus (1–10.000), atau kosongkan dua kolom bonus.')
      if (!c.bonusDesc?.trim()) add('kategori', f('bonusDesc'), 'Tulis bonusnya, misalnya "Poster bertanda tangan".')
    }
    if (c.accessMethod === 'RECEIPT') {
      const rr = c.receiptRules
      if (!rr || !(Number.isFinite(rr.minSpend) && rr.minSpend >= 1000)) add('kategori', f('minSpend'), 'Isi minimal belanja (mis. Rp300.000) atau pakai tombol "Pakai preset umum mal".')
      if (rr && !intIn(rr.maxReceiptsCombined, 1, 10)) add('kategori', f('maxReceipts'), 'Isi 1–10 struk yang boleh digabung.')
      if (rr && !/^\d{2}:\d{2}$/.test(rr.cutoffTime)) add('kategori', f('cutoff'), 'Isi jam batas struk, misalnya 22:00.')
    }
  }
  if (form.seatingMode === 'RESERVED' && form.categories.length && !seatCategories(form).length) {
    add('kategori', 'categories', 'Mode "Kursi bernomor" butuh minimal 1 kategori dengan kursi. Matikan "Tanpa nomor kursi" di salah satu kategori, atau ganti mode di langkah Info.')
  }

  /* denah */
  if (form.seatingMode === 'RESERVED') {
    const L = form.layout
    if (!intIn(L.rows, 1, 26)) add('denah', 'layout.rows', 'Isi 1–26 baris (A–Z).')
    if (!intIn(L.seatsPerRow, 1, 40)) add('denah', 'layout.seatsPerRow', 'Isi 1–40 kursi per baris.')
    if (L.aisleAfter != null && !(Number.isInteger(L.aisleAfter) && L.aisleAfter >= 1 && L.aisleAfter < L.seatsPerRow)) {
      add('denah', 'layout.aisleAfter', `Lorong harus di antara kursi 1 dan ${Math.max(1, L.seatsPerRow - 1)}. Atau matikan lorong.`)
    }
    const seatCats = seatCategories(form)
    const seatKeys = new Set(seatCats.map((c) => c.key))
    const sorted = [...L.ranges].sort((a, b) => a.from - b.from)
    for (const rg of L.ranges) {
      if (!seatKeys.has(rg.catKey)) add('denah', `range.${rg.key}`, 'Pilih kategori untuk rentang baris ini.')
      else if (rg.from > rg.to) add('denah', `range.${rg.key}`, `Baris awal (${rowLetter(rg.from)}) harus sebelum baris akhir (${rowLetter(rg.to)}).`)
      else if (rg.to >= L.rows) add('denah', `range.${rg.key}`, `Denah hanya sampai baris ${rowLetter(L.rows - 1)}. Ubah baris akhir.`)
    }
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].from <= sorted[i - 1].to) {
        add('denah', `range.${sorted[i].key}`, `Rentang ${rowLetter(sorted[i].from)}–${rowLetter(sorted[i].to)} bertabrakan dengan ${rowLetter(sorted[i - 1].from)}–${rowLetter(sorted[i - 1].to)}. Satu baris hanya untuk satu kategori.`)
      }
    }
    if (intIn(L.rows, 1, 26) && intIn(L.seatsPerRow, 1, 40)) {
      const counts = seatCounts(L)
      for (const c of seatCats) {
        if (!counts.get(c.key)) add('denah', 'ranges', `Kategori ${c.name.trim() || 'tanpa nama'} belum punya kursi. Tambahkan rentang baris untuknya.`)
      }
      const rowCats = rowCategoryKeys(L)
      const empty = rowCats.map((k, i) => (k ? null : rowLetter(i))).filter(Boolean)
      if (empty.length && L.ranges.length) add('denah', 'ranges', `Baris ${empty.join(', ')} belum punya kategori, jadi kursinya tidak dijual.`, true)
    }
  }

  /* sesi */
  if (!form.sessions.length) add('sesi', 'sessions', 'Tambahkan minimal 1 sesi supaya event bisa dipesan.')
  for (const s of form.sessions) {
    const f = (x: string) => `ses.${s.key}.${x}`
    if (!s.date) add('sesi', f('date'), 'Isi tanggal sesi.')
    if (!s.start) add('sesi', f('start'), 'Isi jam mulai.')
    if (!s.end) add('sesi', f('end'), 'Isi jam selesai.')
    if (s.start && s.end && s.end <= s.start) add('sesi', f('end'), `Jam selesai harus setelah jam mulai (${s.start.replace(':', '.')}).`)
  }
  const real = form.sessions.filter((s) => !s.demoLive && s.date && s.start)
  const firstStart = real.map((s) => wibIso(s.date, s.start)).sort()[0]
  if (firstStart) {
    for (const c of form.categories) {
      if (c.saleStart && localInputToIso(c.saleStart) >= firstStart) {
        add('kategori', `cat.${c.key}.saleStart`, `Penjualan ${c.name.trim() || 'kategori ini'} dibuka setelah sesi pertama mulai. Majukan tanggal buka penjualan.`)
      }
    }
  }

  /* capacity vs venue (assumption, PRD §16) – warning only */
  const venue = venues.find((v) => v.id === form.venueId)
  const cap = capacityOf(form)
  if (venue && cap > venue.capacity) {
    add(form.seatingMode === 'RESERVED' ? 'denah' : 'kategori', 'capacity', `Kapasitas per sesi ${cap} orang melebihi kapasitas ${venue.name} (${venue.capacity}, asumsi). Kurangi kursi/kuota bila perlu.`, true)
  }
  return out
}

/* ---------------- conversion ---------------- */

export function toDraft(form: WizardForm): EventDraft {
  const general = form.seatingMode === 'GENERAL'
  const categories: EventDraft['categories'] = form.categories.map((c) => ({
    id: c.id,
    name: c.name.trim(),
    color: c.color,
    accessMethod: c.accessMethod,
    price: c.accessMethod === 'PAID' ? Math.round(c.price) : 0,
    quota: general || c.noSeat ? Math.round(c.quota) : null,
    saleStart: localInputToIso(c.saleStart),
    saleCloseMinBeforeSession: Math.round(c.saleCloseMin),
    description: c.description.trim() || undefined,
    receiptRules: c.accessMethod === 'RECEIPT' && c.receiptRules ? { ...c.receiptRules } : undefined,
    bonusFirstN: c.bonusFirstN ?? null,
    bonusDesc: c.bonusDesc ?? null,
  }))

  let layout: EventDraft['layout']
  if (!general) {
    // Normalised exactly like the backend derives a draft (merged row runs, seat order),
    // so an untouched layout compares equal and doesn't trip LOCKED_LAYOUT.
    const L = form.layout
    const rowCats = rowCategoryKeys(L)
    const rowCategories: NonNullable<EventDraft['layout']>['rowCategories'] = []
    let r = 0
    while (r < rowCats.length) {
      const k = rowCats[r]
      let end = r
      while (end + 1 < rowCats.length && rowCats[end + 1] === k) end++
      const idx = form.categories.findIndex((c) => c.key === k)
      if (idx >= 0) rowCategories.push({ categoryIndex: idx, fromRow: rowLetter(r), toRow: rowLetter(end) })
      r = end + 1
    }
    const order = new Map(previewSeats(L).map((s, i) => [seatLabel(s), i]))
    const norm = (labels: string[]) => [...new Set(labels)].filter((l) => order.has(l)).sort((a, b) => order.get(a)! - order.get(b)!)
    layout = {
      rows: L.rows,
      seatsPerRow: L.seatsPerRow,
      aisleAfter: L.aisleAfter,
      ...(L.curved ? { curved: true } : {}),
      rowCategories,
      blockedSeatLabels: norm(L.blocked),
      prioritySeatLabels: norm(L.priority),
    }
  }

  return {
    title: form.title.trim(),
    subtitle: form.subtitle.trim() || undefined,
    description: form.description.trim(),
    posterTheme: form.posterTheme,
    posterPalette: form.posterPalette,
    posterImage: form.posterImage,
    venueId: form.venueId,
    seatingMode: form.seatingMode,
    rules: { ...form.rules },
    categories,
    layout,
    sessions: form.sessions.map((s) => ({
      id: s.id,
      label: s.label.trim() || undefined,
      startAt: wibIso(s.date, s.start),
      endAt: wibIso(s.date, s.end),
      demoLive: s.demoLive || undefined,
    })),
  }
}

export function fromDraft(draft: EventDraft): { form: WizardForm; categoryKeys: string[] } {
  const general = draft.seatingMode === 'GENERAL'
  const categories: CatForm[] = draft.categories.map((c) => ({
    key: c.id ?? key('c'),
    id: c.id,
    name: c.name,
    color: c.color,
    accessMethod: c.accessMethod,
    price: c.accessMethod === 'PAID' ? c.price : Number.NaN,
    noSeat: general || c.quota != null,
    quota: c.quota ?? Number.NaN,
    saleStart: isoToLocalInput(c.saleStart),
    saleCloseMin: c.saleCloseMinBeforeSession,
    description: c.description ?? '',
    receiptRules: c.receiptRules ? { ...c.receiptRules, excludedTenantIds: [...c.receiptRules.excludedTenantIds] } : null,
    bonusFirstN: c.bonusFirstN,
    bonusDesc: c.bonusDesc,
  }))
  const L = draft.layout
  const layout: LayoutForm = L
    ? {
        rows: L.rows,
        seatsPerRow: L.seatsPerRow,
        aisleAfter: L.aisleAfter,
        curved: L.curved ?? false,
        ranges: L.rowCategories
          .filter((rc) => categories[rc.categoryIndex])
          .map((rc) => ({ key: key('r'), catKey: categories[rc.categoryIndex].key, from: rowIndex(rc.fromRow), to: rowIndex(rc.toRow) })),
        blocked: [...L.blockedSeatLabels],
        priority: [...L.prioritySeatLabels],
      }
    : { rows: 8, seatsPerRow: 12, aisleAfter: 6, ranges: [], blocked: [], priority: [] }
  const sessions: SessionForm[] = draft.sessions.map((s) => {
    const a = new Date(s.startAt)
    const b = new Date(s.endAt)
    const t = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
    return { key: s.id ?? key('s'), id: s.id, label: s.label ?? '', date: wibDate(a), start: t(a), end: t(b), demoLive: !!s.demoLive }
  })
  return {
    form: {
      title: draft.title,
      subtitle: draft.subtitle ?? '',
      description: draft.description,
      posterTheme: draft.posterTheme,
      posterPalette: draft.posterPalette ?? null,
      posterImage: draft.posterImage ?? null,
      venueId: draft.venueId,
      seatingMode: draft.seatingMode,
      rules: { ...DEFAULT_RULES, ...draft.rules },
      categories,
      layout,
      sessions,
    },
    categoryKeys: categories.map((c) => c.key),
  }
}

export function accessSummary(c: CatForm): string {
  if (c.accessMethod === 'PAID') return Number.isFinite(c.price) ? rupiahPlain(c.price) : 'Harga belum diisi'
  if (c.accessMethod === 'FREE') return 'Gratis'
  const min = c.receiptRules?.minSpend
  return Number.isFinite(min) ? `Tukar struk min ${rupiahPlain(min!)}` : 'Tukar struk'
}

/** Smallest first: templateForVenue relies on the order. */
export const LAYOUT_TEMPLATES = [
  { name: 'Teater kecil', rows: 6, seatsPerRow: 10, aisleAfter: 5 },
  { name: 'Courtyard', rows: 8, seatsPerRow: 12, aisleAfter: 6 },
  { name: 'Atrium besar', rows: 10, seatsPerRow: 14, aisleAfter: 7 },
] as const

type LayoutTemplate = (typeof LAYOUT_TEMPLATES)[number]
const templateSize = (t: LayoutTemplate) => ({ rows: t.rows, seatsPerRow: t.seatsPerRow, aisleAfter: t.aisleAfter as number | null })

/** The biggest template that still fits the venue's capacity, so a new seat map starts at the venue's size; the smallest when none fits. */
export function templateForVenue(capacity: number | undefined): LayoutTemplate {
  const fits = LAYOUT_TEMPLATES.filter((t) => t.rows * t.seatsPerRow <= (capacity ?? 0))
  return fits[fits.length - 1] ?? LAYOUT_TEMPLATES[0]
}

/**
 * Picking another venue also resizes the seat map of a new event to it, but only while the map is still the untouched
 * default for the venue picked before: a size, a row range, a closed seat or a curve the panitia set is never thrown
 * away. Row ranges the wizard spread out by itself (opening the Denah step) count as untouched and are spread again.
 */
export function changeVenue(form: WizardForm, venueId: string, venues: Venue[]): WizardForm {
  const L = form.layout
  const before = templateSize(templateForVenue(venues.find((v) => v.id === form.venueId)?.capacity))
  const same = (a: RangeForm[], b: RangeForm[]) => a.length === b.length && a.every((r, i) => r.catKey === b[i].catKey && r.from === b[i].from && r.to === b[i].to)
  const autoRanges = !L.ranges.length || same(L.ranges, distributeRows(form))
  const untouched = L.rows === before.rows && L.seatsPerRow === before.seatsPerRow && L.aisleAfter === before.aisleAfter && !L.curved && autoRanges && !L.blocked.length && !L.priority.length
  if (!untouched) return { ...form, venueId }
  const resized = { ...form, venueId, layout: { ...L, ...templateSize(templateForVenue(venues.find((v) => v.id === venueId)?.capacity)) } }
  return L.ranges.length ? { ...resized, layout: { ...resized.layout, ranges: distributeRows(resized) } } : resized
}

export interface StepProps {
  form: WizardForm
  update: (fn: (f: WizardForm) => WizardForm) => void
  err: (field: string) => string | undefined
}
