/**
 * Makes an exported CSV open cleanly in Excel, whichever backend wrote it: numbers in a phone column (header "No HP")
 * keep their leading 0, a cell that starts like a formula (=, +, -, @) is shown as text instead of being run, and lines
 * end in CRLF. Plain numbers, negative ones too, and every other cell are left as the API sent them.
 */

/** RFC 4180: commas between cells, quotes around cells that hold a comma, quote or line break, "" for a quote. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      rows.push([...row, cell])
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell || row.length) rows.push([...row, cell])
  return rows
}

const PHONE = /^0\d{9,13}$/
const PHONE_HEADER = /\b(hp|telepon|phone)\b/i
const NUMBER = /^[+-]?\d+([.,]\d+)?$/
const FORMULA = /^[=+\-@\t\r]/

/** One cell, safe for Excel: a phone "081234567890" → "0812-3456-7890", "=SUM(…)" → "'=SUM(…)", "-50000" stays a number. */
export function excelCell(value: string, { phone = false } = {}): string {
  let v = value
  if (phone && PHONE.test(v)) v = `${v.slice(0, 4)}-${v.slice(4, 8)}-${v.slice(8)}`
  else if (FORMULA.test(v) && !NUMBER.test(v)) v = `'${v}`
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function excelCsv(csv: string): string {
  const [header = [], ...rows] = parseCsv(csv)
  const phones = new Set(header.flatMap((h, i) => (PHONE_HEADER.test(h) ? [i] : [])))
  return [header.map((h) => excelCell(h)), ...rows.map((r) => r.map((c, i) => excelCell(c, { phone: phones.has(i) })))].map((r) => r.join(',')).join('\r\n')
}
