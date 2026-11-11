/**
 * PV-16: turn the text read from a receipt photo into form fields. Pure and unit-tested; the OCR
 * itself runs in the visitor's browser with tesseract.js (components/visitor/ocr.ts), so the photo
 * never leaves the device for reading.
 */
import type { Receipt, Tenant } from './types'

export interface ReceiptReading {
  tenantId?: string
  receiptNo?: string
  amount?: number
  /** YYYY-MM-DD */
  receiptDate?: string
  /** HH:MM */
  receiptTime?: string
}

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

function amountsIn(line: string): number[] {
  return [...line.matchAll(/(\d{1,3}(?:[.,]\d{3})+|\d{4,})/g)].map((m) => Number(m[1].replace(/[.,]/g, '')))
}

export function parseReceiptText(text: string, tenants: Tenant[]): ReceiptReading {
  const out: ReceiptReading = {}
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const flat = lines.join('\n')

  // Shop name is printed on top: prefer a tenant found in the first lines, longest name wins.
  const head = norm(lines.slice(0, 4).join(' '))
  const all = norm(flat)
  const hit = tenants
    .map((t) => ({ t, n: norm(t.name) }))
    .filter(({ n }) => n.length >= 4 && (head.includes(n) || all.includes(n)))
    .sort((a, b) => Number(head.includes(b.n)) - Number(head.includes(a.n)) || b.n.length - a.n.length)[0]
  if (hit) out.tenantId = hit.t.id

  const no = /(?:no\.?\s*(?:struk|nota|transaksi)|invoice|nota)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{4,})/i.exec(flat) ?? /\b(INV[\s-]?\d{4,})\b/i.exec(flat)
  if (no) out.receiptNo = no[1].replace(/[\s-]/g, '').toUpperCase()

  const totalLine = lines.find((l) => /\btotal\b/i.test(l) && !/sub\s*-?\s*total/i.test(l))
  const total = totalLine ? Math.max(0, ...amountsIn(totalLine)) : 0
  if (total > 0) out.amount = total

  const d = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/.exec(flat)
  if (d) {
    const dd = Number(d[1])
    const mm = Number(d[2])
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) out.receiptDate = `${d[3]}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  }

  const timeLine = lines.find((l) => /\b(jam|waktu|time|pukul)\b/i.test(l))
  const t = timeLine ? /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/.exec(timeLine) : null
  if (t) out.receiptTime = `${t[1].padStart(2, '0')}:${t[2]}`

  return out
}

export type ReceiptField = 'tenant' | 'receiptNo' | 'amount' | 'date' | 'time'

/** One field of a receipt: what the photo says next to what the visitor typed. */
export interface FieldMatch {
  field: ReceiptField
  /** the value read from the photo; absent when the photo did not show it clearly */
  read?: string | number
  /** what the visitor typed */
  typed: string | number
  state: 'same' | 'differ' | 'unread'
}

/** OCR mixes up O and 0, I or L and 1 on receipt numbers, so those count as the same character. */
const looseNo = (s: string) => norm(s).replace(/O/g, '0').replace(/[IL]/g, '1')

/**
 * AD-07: the panitia's cross-check. Compares the reading of a receipt photo with what the visitor typed, field by
 * field, so a typed amount that is not on the photo stands out before anyone approves it.
 */
export function matchReceipt(reading: ReceiptReading, typed: Pick<Receipt, 'tenantId' | 'receiptNo' | 'amount' | 'receiptDate' | 'receiptTime'>): FieldMatch[] {
  const pair = (field: ReceiptField, read: string | number | undefined, value: string | number, same: (r: string | number) => boolean): FieldMatch =>
    read === undefined ? { field, typed: value, state: 'unread' } : { field, read, typed: value, state: same(read) ? 'same' : 'differ' }
  return [
    pair('tenant', reading.tenantId, typed.tenantId, (r) => r === typed.tenantId),
    pair('receiptNo', reading.receiptNo, typed.receiptNo, (r) => looseNo(String(r)) === looseNo(typed.receiptNo)),
    pair('amount', reading.amount, typed.amount, (r) => r === typed.amount),
    pair('date', reading.receiptDate, typed.receiptDate, (r) => r === typed.receiptDate),
    pair('time', reading.receiptTime, typed.receiptTime, (r) => r === typed.receiptTime),
  ]
}
