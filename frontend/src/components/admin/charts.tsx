/**
 * Dashboard charts (recharts). Category bars use the category colour (identity),
 * transaction bars use the status tone (state), tenants use one brand hue (magnitude).
 */
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { EventStats } from '@/api/contract'
import { ORDER_STATUS_LABEL, ORDER_TONE, SEAT_STATUS_LABEL, type Tone } from '@/domain/labels'
import type { OrderStatus } from '@/domain/types'
import { rupiahPlain } from '@/lib/format'

const AXIS = { fontSize: 12, fill: '#6b6560' }
const TOOLTIP = {
  contentStyle: { borderRadius: 10, border: '1px solid #e7e3dc', fontSize: 12, boxShadow: '0 4px 16px rgb(0 0 0 / 0.08)' },
  cursor: { fill: '#f3f1ec' },
}

function shortRupiah(n: number): string {
  if (n >= 1_000_000) return `Rp${(n / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`
  if (n >= 1_000) return `Rp${Math.round(n / 1_000).toLocaleString('id-ID')} rb`
  return rupiahPlain(n)
}

/** Sold / held / still available per category (stacked). */
export function CategoryChart({ data }: { data: EventStats['byCategory'] }) {
  const rows = data.map((c) => ({
    name: c.category.name,
    color: c.category.color,
    sold: c.sold,
    held: c.held,
    available: Math.max(0, c.total - c.sold - c.held),
    total: c.total,
    label: `${c.sold}/${c.total}`,
    revenue: c.revenue,
  }))
  if (!rows.length) return <p className="text-sm text-muted-foreground">Belum ada kategori.</p>
  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Keterangan grafik">
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-[3px] bg-[#8b2c6a]" aria-hidden /> Terjual (warna kategori)
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-[3px] bg-[#8b2c6a]/35" aria-hidden /> Sedang dipesan
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-[3px] bg-[#e7e3dc]" aria-hidden /> Tersedia
        </li>
      </ul>
      <div style={{ height: rows.length * 46 + 30 }} role="img" aria-label={`Tiket terjual per kategori: ${rows.map((r) => `${r.name} ${r.sold} dari ${r.total}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barCategoryGap={10}>
            <CartesianGrid horizontal={false} stroke="#efece6" />
            <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={96} tick={{ ...AXIS, fill: '#231f20', fontWeight: 600 }} axisLine={false} tickLine={false} />
            <Tooltip
              {...TOOLTIP}
              formatter={(v, name) => [`${v} tiket`, name]}
              labelFormatter={(l, p) => {
                const r = p?.[0]?.payload as (typeof rows)[number] | undefined
                return r ? `${l} · ${r.sold}/${r.total} terjual · ${rupiahPlain(r.revenue)}` : String(l)
              }}
            />
            <Bar dataKey="sold" name={SEAT_STATUS_LABEL.SOLD} stackId="a" stroke="#fff" strokeWidth={1}>
              {rows.map((r) => (
                <Cell key={r.name} fill={r.color} />
              ))}
            </Bar>
            <Bar dataKey="held" name={SEAT_STATUS_LABEL.HELD} stackId="a" stroke="#fff" strokeWidth={1}>
              {rows.map((r) => (
                <Cell key={r.name} fill={r.color} fillOpacity={0.35} />
              ))}
            </Bar>
            <Bar dataKey="available" name={SEAT_STATUS_LABEL.AVAILABLE} stackId="a" fill="#e7e3dc" radius={[0, 4, 4, 0]} stroke="#fff" strokeWidth={1}>
              <LabelList dataKey="label" position="right" style={{ fontSize: 12, fontWeight: 700, fill: '#231f20' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

const TONE_FILL: Record<Tone, string> = {
  valid: '#12a150',
  warn: '#f5b400',
  invalid: '#dc2626',
  neutral: '#a8a29e',
  brand: '#006426',
  info: '#2d4c8f',
}

export function StatusChart({ data }: { data: EventStats['transactions'] }) {
  const order: OrderStatus[] = ['CONFIRMED', 'AWAITING_PAYMENT', 'AWAITING_VERIFICATION', 'EXPIRED', 'CANCELLED', 'REJECTED']
  const rows = order.map((s) => ({ name: ORDER_STATUS_LABEL[s], value: data[s] ?? 0, fill: TONE_FILL[ORDER_TONE[s]] }))
  return (
    <div style={{ height: rows.length * 38 + 20 }} role="img" aria-label={`Transaksi per status: ${rows.map((r) => `${r.name} ${r.value}`).join(', ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 36, bottom: 0, left: 0 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke="#efece6" />
          <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={178} tick={{ ...AXIS, fill: '#231f20' }} axisLine={false} tickLine={false} interval={0} />
          <Tooltip {...TOOLTIP} formatter={(v) => [`${v} pesanan`, 'Jumlah']} />
          <Bar dataKey="value" name="Pesanan" radius={[0, 4, 4, 0]} minPointSize={2}>
            {rows.map((r) => (
              <Cell key={r.name} fill={r.fill} />
            ))}
            <LabelList dataKey="value" position="right" style={{ fontSize: 12, fontWeight: 700, fill: '#231f20' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function TenantChart({ data }: { data: EventStats['topTenants'] }) {
  if (!data.length) return <p className="py-6 text-center text-sm text-muted-foreground">Belum ada struk yang disetujui untuk event ini.</p>
  const rows = data.map((t) => ({ name: t.tenant.name, value: t.amount, count: t.count, label: shortRupiah(t.amount) }))
  return (
    <div style={{ height: rows.length * 40 + 20 }} role="img" aria-label={`Tenant teratas: ${rows.map((r) => `${r.name} ${rupiahPlain(r.value)}`).join(', ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 64, bottom: 0, left: 0 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke="#efece6" />
          <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => shortRupiah(v)} />
          <YAxis type="category" dataKey="name" width={140} tick={{ ...AXIS, fill: '#231f20' }} axisLine={false} tickLine={false} interval={0} />
          <Tooltip
            {...TOOLTIP}
            formatter={(v, _n, p) => [`${rupiahPlain(Number(v))} · ${(p.payload as { count: number }).count} struk`, 'Nilai struk']}
          />
          <Bar dataKey="value" name="Nilai struk" fill="#006426" radius={[0, 4, 4, 0]}>
            <LabelList dataKey="label" position="right" style={{ fontSize: 12, fontWeight: 700, fill: '#231f20' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
