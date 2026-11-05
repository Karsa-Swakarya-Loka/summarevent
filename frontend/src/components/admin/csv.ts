/**
 * Makes an exported CSV open cleanly in Excel, whichever backend wrote it: phone numbers keep their leading 0, a cell
 * that starts like a formula (=, +, -, @) is shown as text instead of being run, and lines end in CRLF. The data is
 * otherwise left as the API sent it.
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
const FORMULA = /^[=+\-@\t\r]/

/** One cell, safe for Excel: "081234567890" → "0812-3456-7890", "=SUM(…)" → "'=SUM(…)". */
export function excelCell(value: string): string {
  let v = value
  if (PHONE.test(v)) v = `${v.slice(0, 4)}-${v.slice(4, 8)}-${v.slice(8)}`
  else if (FORMULA.test(v)) v = `'${v}`
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function excelCsv(csv: string): string {
  return parseCsv(csv)
    .map((r) => r.map(excelCell).join(','))
    .join('\r\n')
}
