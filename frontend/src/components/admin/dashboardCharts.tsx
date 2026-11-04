/**
 * The dashboard's charts, drawn without a chart library so they match the reference to the pixel: money per day as
 * bars on full-height tracks, tickets per day as a smooth area, and check-ins as a weekday × hour heatmap. Hovering a
 * bar outlines it and shows its day; hovering a point on the area or a cell on the heatmap does the same. The series
 * come from `lastDays` in lib.ts and `checkinsByHour` of EventStats.
 */
import { useId, useMemo, useState } from 'react'
import { rupiahPlain } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSize } from './hooks'
import { axisRupiah, type lastDays } from './lib'

type Row = ReturnType<typeof lastDays>[number]

/** The axis top: the largest value rounded up to 1, 2, 2.5 or 5 × 10ⁿ, so the ticks read as round numbers. */
function niceTop(max: number): number {
  if (max <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(max))
  const u = max / p
  return (u <= 1 ? 1 : u <= 2 ? 2 : u <= 2.5 ? 2.5 : u <= 5 ? 5 : 10) * p
}

function Tip({ children, side }: { children: React.ReactNode; side: 'left' | 'right' }) {
  return (
    <span role="presentation" className={cn('pointer-events-none absolute bottom-full z-10 mb-2 rounded-lg bg-ink px-2.5 py-1.5 text-xs leading-snug font-medium whitespace-nowrap text-white shadow-lg', side === 'left' ? 'left-0' : 'right-0')}>
      {children}
    </span>
  )
}

/** Money per day: a bar on a full-height track for every day, as the reference's "Earned so far". */
export function RevenueBars({ rows, className }: { rows: Row[]; className?: string }) {
  const top = niceTop(Math.max(0, ...rows.map((r) => r.revenue)))
  const ticks = [top, (top * 2) / 3, top / 3, 0]
  const [hover, setHover] = useState<number | null>(null)
  const many = rows.length > 7
  const summary = rows
    .filter((r) => r.revenue)
    .map((r) => `${r.day} ${rupiahPlain(r.revenue)}`)
    .join(', ')
  return (
    <div className={cn('flex min-h-52 flex-col', className)} role="img" aria-label={`Pendapatan per hari: ${summary || 'belum ada'}`}>
      <div className="grid min-h-0 flex-1 grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2">
        <div className="relative text-[0.7rem] text-muted-foreground tabular-nums">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / top) * 100}%` }}>
              {axisRupiah(Math.round(t))}
            </span>
          ))}
        </div>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))`, columnGap: many ? '0.35rem' : '0.75rem' }} onPointerLeave={() => setHover(null)}>
          {rows.map((r, i) => {
            const pct = top ? (r.revenue / top) * 100 : 0
            return (
              <div key={r.date} className="relative" onPointerEnter={() => setHover(i)}>
                <span className="absolute inset-0 rounded-[0.7rem] bg-track" aria-hidden />
                <span
                  className={cn('absolute inset-x-0 bottom-0 rounded-[0.7rem] bg-brand transition-[height] duration-500 ease-(--ease-soft)', hover === i && 'ring-2 ring-foreground/70 ring-offset-2 ring-offset-panel')}
                  style={{ height: `${pct}%`, minHeight: r.revenue ? '0.5rem' : 0 }}
                  aria-hidden
                />
                {hover === i && (
                  <Tip side={i < rows.length / 2 ? 'left' : 'right'}>
                    {r.day}
                    <br />
                    {rupiahPlain(r.revenue)} · {r.orders} pesanan
                  </Tip>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2 text-[0.7rem] text-muted-foreground">
        <span />
        <div className="grid" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
          {rows.map((r, i) => (
            <span key={r.date} className={cn('truncate text-center', i % 2 === 1 && (many ? 'max-lg:invisible' : rows.length >= 6 && 'max-sm:invisible'))}>
              {r.day}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/** A smooth curve through the points (Fritsch–Carlson monotone cubic), so it never overshoots a day's value. */
function curve(pts: Array<[number, number]>): string {
  const n = pts.length
  if (n < 2) return pts.map(([x, y]) => `M${x} ${y}`).join('')
  const d: number[] = []
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0] || 1))
  const m: number[] = [d[0]]
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2)
  m.push(d[n - 2])
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / d[i]
    const b = m[i + 1] / d[i]
    const s = a * a + b * b
    if (s > 9) {
      const t = 3 / Math.sqrt(s)
      m[i] = t * a * d[i]
      m[i + 1] = t * b * d[i]
    }
  }
  let path = `M${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < n - 1; i++) {
    const dx = (pts[i + 1][0] - pts[i][0]) / 3
    path += ` C${pts[i][0] + dx} ${pts[i][1] + m[i] * dx} ${pts[i + 1][0] - dx} ${pts[i + 1][1] - m[i + 1] * dx} ${pts[i + 1][0]} ${pts[i + 1][1]}`
  }
  return path
}

/** Tickets per day as a soft area, the reference's "Revenue" curve, drawn to the box it is given. */
export function TicketsArea({ rows, className }: { rows: Row[]; className?: string }) {
  const [box, size] = useSize<HTMLDivElement>()
  const gradient = useId()
  const [hover, setHover] = useState<number | null>(null)
  // at least four on the axis, so one ticket does not fill the whole chart
  const top = Math.max(4, niceTop(Math.max(0, ...rows.map((r) => r.tickets))))
  const ticks = [top, (top * 2) / 3, top / 3, 0].map((t) => Math.round(t))
  const pad = { l: 30, r: 10, t: 12, b: 26 }
  const w = size.w
  const h = size.h
  const pts = useMemo<Array<[number, number]>>(() => {
    const n = rows.length
    const ix = (i: number) => pad.l + (n > 1 ? (i * (w - pad.l - pad.r)) / (n - 1) : (w - pad.l - pad.r) / 2)
    return rows.map((r, i) => [ix(i), pad.t + (1 - r.tickets / top) * (h - pad.t - pad.b)])
  }, [rows, w, h, top, pad.l, pad.r, pad.t, pad.b])
  const line = curve(pts)
  const base = h - pad.b
  const area = pts.length ? `${line} L${pts[pts.length - 1][0]} ${base} L${pts[0][0]} ${base} Z` : ''
  const summary = rows
    .filter((r) => r.tickets)
    .map((r) => `${r.day} ${r.tickets}`)
    .join(', ')
  const many = rows.length > 7

  return (
    <div
      ref={box}
      className={cn('relative min-h-44', className)}
      role="img"
      aria-label={`Tiket terjual per hari: ${summary || 'belum ada'}`}
      onPointerMove={(e) => {
        if (!pts.length) return
        const x = e.clientX - e.currentTarget.getBoundingClientRect().left
        let best = 0
        for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i][0] - x) < Math.abs(pts[best][0] - x)) best = i
        setHover(best)
      }}
      onPointerLeave={() => setHover(null)}
    >
      {w > 0 && h > 0 && (
        <svg width={w} height={h} className="absolute inset-0 overflow-visible" aria-hidden>
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.26" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <text key={t} x={pad.l - 8} y={pad.t + (1 - t / top) * (h - pad.t - pad.b)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[0.7rem] tabular-nums">
              {t}
            </text>
          ))}
          {rows.map((r, i) => (
            <text key={r.date} x={pts[i][0]} y={h - 6} textAnchor={i === 0 ? 'start' : i === rows.length - 1 ? 'end' : 'middle'} className={cn('fill-muted-foreground text-[0.7rem]', i % 2 === 1 && (many ? 'max-lg:hidden' : rows.length >= 6 && 'max-sm:hidden'))}>
              {r.day}
            </text>
          ))}
          {pts.length > 1 && <path d={area} fill={`url(#${gradient})`} />}
          <path d={line} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {hover != null && pts[hover] && (
            <>
              <line x1={pts[hover][0]} x2={pts[hover][0]} y1={pad.t} y2={base} stroke="var(--foreground)" strokeOpacity="0.35" strokeDasharray="3 3" />
              <circle cx={pts[hover][0]} cy={pts[hover][1]} r="5" fill="var(--brand)" stroke="#fff" strokeWidth="2" />
            </>
          )}
        </svg>
      )}
      {hover != null && pts[hover] && (
        <span
          role="presentation"
          className={cn('pointer-events-none absolute z-10 -translate-y-full rounded-lg bg-ink px-2.5 py-1.5 text-xs leading-snug font-medium whitespace-nowrap text-white shadow-lg', hover < rows.length / 2 ? 'translate-x-2' : '-translate-x-[calc(100%+0.5rem)]')}
          style={{ left: pts[hover][0], top: pts[hover][1] - 10 }}
        >
          {rows[hover].day}
          <br />
          {rows[hover].tickets} tiket · {rows[hover].orders} pesanan
        </span>
      )}
    </div>
  )
}

const DAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6) // 06.00–23.00: the mall's day, and the demo session whenever the judges open it
const RAMP = [0, 28, 50, 74, 100] // how much brand green a cell mixes into the track, per level

export interface HeatCell {
  day: string
  hour: number
  value: number
}

/** Check-ins by weekday and hour, each cell greener the busier, as the reference's heatmap card; hovering a cell tells the card which one. */
export function CheckinHeatmap({ data, onHover }: { data: number[][]; onHover?: (cell: HeatCell | null) => void }) {
  const max = Math.max(1, ...data.flat())
  const total = data.flat().reduce((a, b) => a + b, 0)
  const [hover, setHover] = useState<[number, number] | null>(null)
  const hoverCell = (c: [number, number] | null) => {
    setHover(c)
    onHover?.(c ? { day: DAYS[c[0]], hour: c[1], value: data[c[0]]?.[c[1]] ?? 0 } : null)
  }
  const cols = `2rem repeat(${HOURS.length}, minmax(0, 1fr))`
  return (
    <div role="img" aria-label={`Check-in per jam: ${total} check-in valid`} onPointerLeave={() => hoverCell(null)}>
      <div className="grid gap-1" style={{ gridTemplateColumns: cols }}>
        {data.map((row, d) => (
          <div key={d} className="contents">
            <span className={cn('flex items-center text-[0.66rem] text-muted-foreground transition-colors', hover?.[0] === d && 'font-semibold text-foreground')}>{DAYS[d]}</span>
            {HOURS.map((h) => {
              const v = row[h] ?? 0
              const level = v === 0 ? 0 : Math.max(1, Math.ceil((v / max) * 4))
              const on = hover?.[0] === d && hover[1] === h
              return (
                <span
                  key={h}
                  onPointerEnter={() => hoverCell([d, h])}
                  className={cn('aspect-square min-h-3 rounded-[4px] transition-shadow', on && 'ring-2 ring-foreground ring-offset-1 ring-offset-panel')}
                  style={{ background: level ? `color-mix(in oklab, var(--brand) ${RAMP[level]}%, var(--track))` : 'var(--track)' }}
                  aria-hidden
                />
              )
            })}
          </div>
        ))}
        <span />
        {HOURS.map((h) => (
          <span key={h} className={cn('mt-0.5 text-center text-[0.62rem] text-muted-foreground transition-colors', hover?.[1] === h && 'font-semibold text-foreground', h % 2 === 1 && 'invisible', h % 4 !== 2 && 'max-sm:invisible')}>
            {String(h).padStart(2, '0')}
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[0.62rem] text-muted-foreground">
        <span className="mr-0.5">Sedikit</span>
        {RAMP.map((pct) => (
          <span key={pct} className="size-2.5 rounded-[3px]" style={{ background: pct ? `color-mix(in oklab, var(--brand) ${pct}%, var(--track))` : 'var(--track)' }} aria-hidden />
        ))}
        <span className="ml-0.5">Banyak</span>
      </div>
    </div>
  )
}
