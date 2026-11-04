/**
 * The dashboard's time charts (recharts): money per day as bars, tickets per day as an area, and check-ins as a
 * weekday × hour heatmap. The series come from `lastDays` in lib.ts and `checkinsByHour` of EventStats.
 */
import { Area, AreaChart, Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { rupiahPlain } from '@/lib/format'
import { cn } from '@/lib/utils'
import { axisRupiah, type lastDays } from './lib'

const AXIS = { fontSize: 11, fill: '#6b6560' }
const TOOLTIP = { borderRadius: 12, border: '1px solid #e7e3dc', fontSize: 12, boxShadow: '0 8px 24px rgb(35 31 32 / 0.12)' }

/** Money per day: the day with the most is the brand green, the rest sit in a quiet grey, as in the reference. */
export function RevenueBars({ rows }: { rows: ReturnType<typeof lastDays> }) {
  const max = Math.max(0, ...rows.map((r) => r.revenue))
  return (
    <div
      className="h-56"
      role="img"
      aria-label={`Pendapatan per hari: ${
        rows
          .filter((r) => r.revenue)
          .map((r) => `${r.day} ${rupiahPlain(r.revenue)}`)
          .join(', ') || 'belum ada'
      }`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} barCategoryGap={rows.length > 7 ? 6 : 14}>
          <XAxis dataKey="day" tick={AXIS} axisLine={false} tickLine={false} interval={rows.length > 7 ? 1 : 0} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={40} tickFormatter={axisRupiah} />
          <Tooltip contentStyle={TOOLTIP} cursor={{ fill: '#f3f1ec' }} formatter={(v, _n, p) => [`${rupiahPlain(Number(v))} · ${(p.payload as { orders: number }).orders} pesanan`, 'Pendapatan']} />
          <Bar dataKey="revenue" radius={[8, 8, 8, 8]} background={{ fill: '#f3f1ec', radius: 8 }} minPointSize={0}>
            {rows.map((r) => (
              <Cell key={r.date} fill={r.revenue && r.revenue === max ? '#006426' : '#8fcf9f'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Tickets per day as a soft green area, the reference's revenue line. */
export function TicketsArea({ rows }: { rows: ReturnType<typeof lastDays> }) {
  return (
    <div
      className="h-44"
      role="img"
      aria-label={`Tiket terjual per hari: ${
        rows
          .filter((r) => r.tickets)
          .map((r) => `${r.day} ${r.tickets}`)
          .join(', ') || 'belum ada'
      }`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="tickets-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#006426" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#006426" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="day" tick={AXIS} axisLine={false} tickLine={false} interval={rows.length > 7 ? 1 : 0} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
          <Tooltip contentStyle={TOOLTIP} formatter={(v) => [`${v} tiket`, 'Terjual']} />
          <Area type="monotone" dataKey="tickets" stroke="#006426" strokeWidth={2.5} fill="url(#tickets-fill)" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

const DAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6) // 06.00–23.00: the mall's day, and the demo session whenever the judges open it

/** Check-ins by weekday and hour, each cell darker the busier, as the reference's activity grid. */
export function CheckinHeatmap({ data }: { data: number[][] }) {
  const max = Math.max(1, ...data.flat())
  const total = data.flat().reduce((a, b) => a + b, 0)
  return (
    <div role="img" aria-label={`Check-in per jam: ${total} check-in valid`}>
      <div className="grid grid-cols-[2rem_1fr] gap-x-2">
        <div className="grid grid-rows-7 gap-1 text-[0.62rem] text-muted-foreground">
          {DAYS.map((d) => (
            <span key={d} className="flex h-3.5 items-center">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-rows-7 gap-1">
          {data.map((row, d) => (
            <div key={d} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${HOURS.length}, minmax(0, 1fr))` }}>
              {HOURS.map((h) => {
                const v = row[h] ?? 0
                const level = v === 0 ? 0 : Math.ceil((v / max) * 4)
                return (
                  <span key={h} title={`${DAYS[d]} ${String(h).padStart(2, '0')}.00: ${v} check-in`} className={cn('h-3.5 rounded-[3px]', ['bg-muted', 'bg-brand/25', 'bg-brand/45', 'bg-brand/70', 'bg-brand'][level])} />
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 grid grid-cols-[2rem_1fr] gap-x-2 text-[0.62rem] text-muted-foreground">
        <span />
        <div className="flex justify-between">
          {[6, 10, 14, 18, 23].map((h) => (
            <span key={h}>{String(h).padStart(2, '0')}.00</span>
          ))}
        </div>
      </div>
    </div>
  )
}
