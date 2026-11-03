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
