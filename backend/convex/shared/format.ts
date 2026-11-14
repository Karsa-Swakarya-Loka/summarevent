// GENERATED from frontend/src/lib/format.ts by scripts/sync-domain.mjs. Do not edit here; change the frontend file.
/** Formatting helpers – Indonesian locale, Asia/Jakarta (WIB) time. */

const TZ = 'Asia/Jakarta'

export function rupiah(n: number): string {
  if (n === 0) return 'Gratis'
  return 'Rp' + new Intl.NumberFormat('id-ID').format(n)
}

export function rupiahPlain(n: number): string {
  return 'Rp' + new Intl.NumberFormat('id-ID').format(n)
}

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }): string {
  return new Intl.DateTimeFormat('id-ID', { timeZone: TZ, ...opts }).format(new Date(iso))
}

export function fmtShortDate(iso: string): string {
  return fmtDate(iso, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(iso))
    .replace(':', '.')
}

export function fmtDateTime(iso: string): string {
  return `${fmtShortDate(iso)}, ${fmtTime(iso)}`
}

export function fmtRange(startIso: string, endIso: string): string {
  return `${fmtTime(startIso)}–${fmtTime(endIso)} WIB`
}

/** Local date in WIB as YYYY-MM-DD. */
export function wibDate(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Local time in WIB as HH:MM. */
export function wibTime(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('hour')}:${get('minute')}`
}

/** "31 Okt" from YYYY-MM-DD. */
export function fmtDayMonth(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(Date.UTC(y, m - 1, d)))
}

function countdownParts(ms: number): { d: number; h: number; m: number; s: number } {
  const t = Math.max(0, Math.floor(ms / 1000))
  return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 }
}

/**
 * The units of a time left, from the largest that is not zero, for the tiles of a countdown: days, hours, minutes and
 * seconds when a day or more is left, then hours (when any), minutes and seconds. Seconds always tick, so the clock
 * reads as live.
 */
export function countdownUnits(ms: number): Array<{ value: number; unit: 'hari' | 'jam' | 'mnt' | 'dtk' }> {
  const { d, h, m, s } = countdownParts(ms)
  const all = [
    { value: d, unit: 'hari' as const },
    { value: h, unit: 'jam' as const },
    { value: m, unit: 'mnt' as const },
    { value: s, unit: 'dtk' as const },
  ]
  const first = d > 0 ? 0 : h > 0 ? 1 : 2
  return all.slice(first)
}

/**
 * A time left in words, never a bare "09:52": "2 hari 5 jam", "5 jam 12 mnt", "9 mnt 05 dtk", "45 dtk". With
 * `seconds: false` the minutes are the smallest unit ("9 mnt", and "< 1 mnt" in the last minute).
 */
export function fmtLeft(ms: number, { seconds = true }: { seconds?: boolean } = {}): string {
  const { d, h, m, s } = countdownParts(ms)
  if (d > 0) return h ? `${d} hari ${h} jam` : `${d} hari`
  if (h > 0) return `${h} jam ${m} mnt`
  if (!seconds) return m > 0 ? `${m} mnt` : '< 1 mnt'
  if (m > 0) return `${m} mnt ${String(s).padStart(2, '0')} dtk`
  return `${s} dtk`
}

/** A day said the way people say it: "Hari ini", "Besok", "Lusa", else "Sab, 21 Nov" (WIB days). */
export function fmtRelDay(iso: string, now: Date = new Date()): string {
  const day = (d: Date) => Date.parse(wibDate(d) + 'T00:00:00Z')
  const diff = Math.round((day(new Date(iso)) - day(now)) / 86_400_000)
  if (diff === 0) return 'Hari ini'
  if (diff === 1) return 'Besok'
  if (diff === 2) return 'Lusa'
  if (diff === -1) return 'Kemarin'
  return fmtShortDate(iso)
}

/** How long a stretch of time lasts: "1 jam", "1 jam 30 mnt", "45 mnt", "2 hari". */
export function fmtDuration(ms: number): string {
  const { d, h, m } = countdownParts(ms)
  const parts = [d && `${d} hari`, h && `${h} jam`, m && `${m} mnt`].filter(Boolean)
  return parts.length ? parts.join(' ') : '0 mnt'
}

export function fmtCountdown(ms: number): string {
  const { d, h, m, s } = countdownParts(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  if (d > 0) return `${d} hari ${pad(h)}:${pad(m)}:${pad(s)}`
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`
  return `${pad(m)}:${pad(s)}`
}

export function maskPhone(phone: string): string {
  if (phone.length < 7) return phone
  return phone.slice(0, 4) + '•'.repeat(Math.max(0, phone.length - 7)) + phone.slice(-3)
}

export function normalizePhone(input: string): string {
  let p = input.replace(/[^\d+]/g, '')
  if (p.startsWith('+62')) p = '0' + p.slice(3)
  else if (p.startsWith('62')) p = '0' + p.slice(2)
  return p
}

export function isValidPhone(p: string): boolean {
  return /^08\d{8,11}$/.test(p)
}

/**
 * One CSV cell. Quoted when it holds a quote, comma, semicolon or line break. A text that starts like a formula
 * (= + - @, a tab or a carriage return) gets an apostrophe in front, so a name a visitor typed such as `=HYPERLINK(…)`
 * stays text when the panitia opens the file in Excel or Google Sheets (CSV injection). Numbers stay numbers.
 */
export function csvCell(v: unknown): string {
  if (typeof v === 'number') return String(v)
  let s = v == null ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
