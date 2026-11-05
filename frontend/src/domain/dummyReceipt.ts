/**
 * Dummy receipt images (brief: "Gunakan data contoh, bukan data pribadi atau transaksi sungguhan").
 * Used by the seed data and by the "Pakai struk contoh" button so judges can try the
 * Tukar Struk flow without a real receipt.
 */
import { rupiahPlain } from '@/lib/format'

export interface DummyReceiptSpec {
  tenantName: string
  receiptNo: string
  amount: number
  /** YYYY-MM-DD */
  date: string
  /** HH:MM */
  time: string
}

const ITEMS: Record<string, string[]> = {
  default: ['Barang A', 'Barang B', 'Barang C'],
  Mainan: ['Puzzle kayu', 'Mobil remote', 'Lilin mainan'],
  'F&B': ['Kopi susu aren', 'Roti bakar', 'Air mineral'],
  Fashion: ['Kemeja batik', 'Kaos anak', 'Topi'],
  Supermarket: ['Beras 5 kg', 'Minyak goreng 2 L', 'Susu UHT'],
  Buku: ['Buku cerita anak', 'Buku mewarnai', 'Pensil warna'],
  Elektronik: ['Kabel USB-C', 'Powerbank', 'Earphone'],
  Kesehatan: ['Cairan lensa', 'Kotak kacamata', 'Lap lensa'],
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Split an amount into 2–3 line items that add up exactly. */
function splitAmount(amount: number): number[] {
  const a = Math.round((amount * 0.5) / 500) * 500
  const b = Math.round((amount * 0.3) / 500) * 500
  return [a, b, amount - a - b]
}

export function dummyReceiptSvg(spec: DummyReceiptSpec, category = 'default'): string {
  const items = ITEMS[category] ?? ITEMS.default
  const parts = splitAmount(spec.amount)
  const [y, m, d] = spec.date.split('-')
  const lines = items
    .map(
      (name, i) =>
        `<text x="24" y="${190 + i * 26}" font-size="15">${esc(name)}</text><text x="296" y="${190 + i * 26}" font-size="15" text-anchor="end">${rupiahPlain(parts[i])}</text>`,
    )
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="440" viewBox="0 0 320 440" font-family="Courier New, monospace" fill="#231f20">
<rect width="320" height="440" fill="#fffdf6"/>
<path d="M0 432 l10 8 l10 -8 l10 8 l10 -8 l10 8 l10 -8 l10 8 l10 -8 l10 8 l10 -8 l10 8 l10 -8 l10 8 l10 -8 l10 8 l10 -8 l10 8 l10 -8 l10 8 l10 -8 l10 8 l10 -8 l10 8 l10 -8 l10 8 l10 -8 l10 8 l10 -8 l10 8 l10 -8 l10 8 V440 H0Z" fill="#e7e3dc"/>
<text x="160" y="40" font-size="19" font-weight="700" text-anchor="middle">${esc(spec.tenantName.toUpperCase())}</text>
<text x="160" y="62" font-size="12" text-anchor="middle">Summarecon Mall Bandung (contoh)</text>
<text x="24" y="104" font-size="13">No. Struk : ${esc(spec.receiptNo)}</text>
<text x="24" y="124" font-size="13">Tanggal   : ${d}/${m}/${y}</text>
<text x="24" y="144" font-size="13">Jam       : ${esc(spec.time)}</text>
<line x1="24" x2="296" y1="160" y2="160" stroke="#231f20" stroke-dasharray="4 4"/>
${lines}
<line x1="24" x2="296" y1="${190 + items.length * 26 - 8}" y2="${190 + items.length * 26 - 8}" stroke="#231f20" stroke-dasharray="4 4"/>
<text x="24" y="${190 + items.length * 26 + 18}" font-size="17" font-weight="700">TOTAL</text>
<text x="296" y="${190 + items.length * 26 + 18}" font-size="17" font-weight="700" text-anchor="end">${rupiahPlain(spec.amount)}</text>
<text x="160" y="370" font-size="12" text-anchor="middle">Terima kasih!</text>
<rect x="24" y="386" width="272" height="30" rx="4" fill="#fde8dc"/>
<text x="160" y="406" font-size="11" font-weight="700" text-anchor="middle" fill="#8a3a0c">STRUK CONTOH - BUKAN TRANSAKSI ASLI</text>
</svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

export function randomReceiptNo(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 900000
  return `INV${(100000 + n).toString()}`
}
