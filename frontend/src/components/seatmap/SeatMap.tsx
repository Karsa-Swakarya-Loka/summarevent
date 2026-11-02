/**
 * Interactive seat map (PRD §13 "Spesifikasi denah kursi").
 * - Colour = category; status = shape/pattern (never colour alone).
 * - Stage on top for orientation; row letters on both sides; aisle gap.
 * - Pan/zoom (react-zoom-pan-pinch); zooms to the active category's rows.
 * - Every seat is a keyboard-focusable button with an aria-label.
 */
import { useEffect, useMemo, useRef } from 'react'
import { TransformComponent, TransformWrapper, useControls } from 'react-zoom-pan-pinch'
import { Maximize2, Minus, Plus } from 'lucide-react'
import type { SeatMapData } from '@/api/contract'
import { SEAT_STATUS_LABEL } from '@/domain/labels'
import { seatLabel } from '@/domain/rules'
import type { Seat, SeatStatus, TicketCategory } from '@/domain/types'
import { cn } from '@/lib/utils'

export const SEAT_UNIT = 34
const SEAT = 28
const PAD_X = 34
const TOP = 78

export type SeatVisual = SeatStatus | 'SELECTED' | 'MINE' | 'SUGGESTED' | 'CONFLICT'

export interface SeatMapProps {
  data: SeatMapData
  /** Seats the visitor is picking right now. */
  selected?: Set<string>
  /** Highlight (e.g. auto-pick preview or conflict suggestions). */
  suggested?: Set<string>
  /** Seats that were just taken by someone else. */
  conflicts?: Set<string>
  /** Visitor's own held order – its seats render as "Pilihanmu". */
  myOrderId?: string | null
  activeCategoryId?: string | null
  onSeatClick?: (seat: Seat, status: SeatStatus, category: TicketCategory | null) => void
  /** Only seats of the active category are clickable (visitor). Admin: everything is "clickable" for details. */
  interactive?: boolean
  className?: string
  /** Re-run the zoom-to-category effect when this changes. */
  zoomKey?: string | null
}

function Controls() {
  const { zoomIn, zoomOut, resetTransform } = useControls()
  const btn = 'flex size-11 items-center justify-center rounded-full bg-card/95 shadow ring-1 ring-border hover:bg-muted'
  return (
    <div className="absolute right-2 bottom-2 z-10 flex flex-col gap-2">
      <button type="button" className={btn} onClick={() => zoomIn()} aria-label="Perbesar denah">
        <Plus className="size-5" />
      </button>
      <button type="button" className={btn} onClick={() => zoomOut()} aria-label="Perkecil denah">
        <Minus className="size-5" />
      </button>
      <button type="button" className={btn} onClick={() => resetTransform()} aria-label="Lihat seluruh denah">
        <Maximize2 className="size-4" />
      </button>
    </div>
  )
}

function ZoomTo({ targetId, zoomKey }: { targetId: string | null; zoomKey?: string | null }) {
  const { zoomToElement, resetTransform } = useControls()
  const first = useRef(true)
  useEffect(() => {
    const t = setTimeout(() => {
      if (targetId && document.getElementById(targetId)) {
        void zoomToElement(targetId, { maxScale: 2.2, minScale: 1 }, first.current ? 0 : 350)
      } else {
        void resetTransform(first.current ? 0 : 300)
      }
      first.current = false
    }, 60)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, zoomKey])
  return null
}

function Wheelchair({ color }: { color: string }) {
  return (
    <g transform="translate(7 5) scale(0.6)" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="3.5" r="2" fill={color} stroke="none" />
      <path d="M12 7v7h6l3 6" />
      <path d="M8 11a6 6 0 1 0 8 8" />
    </g>
  )
}

export function SeatMap({
  data,
  selected,
  suggested,
  conflicts,
  myOrderId,
  activeCategoryId,
  onSeatClick,
  interactive = true,
  className,
  zoomKey,
}: SeatMapProps) {
  const { seats, sessionSeats, categories, layout } = data
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const ssById = useMemo(() => new Map(sessionSeats.map((s) => [s.seatId, s])), [sessionSeats])

  const geo = useMemo(() => {
    const maxX = Math.max(0, ...seats.map((s) => s.x))
    const maxY = Math.max(0, ...seats.map((s) => s.y))
    const width = PAD_X * 2 + (maxX + 1) * SEAT_UNIT
    const height = TOP + (maxY + 1) * SEAT_UNIT + 18
    const rows = [...new Set(seats.map((s) => s.row))].map((row) => ({ row, y: seats.find((s) => s.row === row)!.y }))
    // bounding box per category, for zoom
    const zones = categories
      .filter((c) => c.quota == null)
      .map((c) => {
        const own = seats.filter((s) => ssById.get(s.id)?.categoryId === c.id)
        if (!own.length) return null
        const ys = own.map((s) => s.y)
        return { id: c.id, y0: Math.min(...ys), y1: Math.max(...ys) }
      })
      .filter(Boolean) as Array<{ id: string; y0: number; y1: number }>
    return { width, height, maxX, rows, zones }
  }, [seats, categories, ssById])

  if (!layout || !seats.length) return null

  const visualOf = (seat: Seat): { status: SeatStatus; visual: SeatVisual } => {
    const ss = ssById.get(seat.id)
    const status: SeatStatus = ss ? ss.status : 'BLOCKED'
    if (selected?.has(seat.id)) return { status, visual: 'SELECTED' }
    if (myOrderId && ss?.orderId === myOrderId && status !== 'AVAILABLE') return { status, visual: 'MINE' }
    if (conflicts?.has(seat.id)) return { status, visual: 'CONFLICT' }
    if (suggested?.has(seat.id) && status === 'AVAILABLE') return { status, visual: 'SUGGESTED' }
    return { status, visual: status }
  }

  const zoneTarget = activeCategoryId && geo.zones.some((z) => z.id === activeCategoryId) ? `seat-zone-${activeCategoryId}` : null

  return (
    <div className={cn('relative overflow-hidden rounded-2xl border bg-[#fdfcf9]', className)}>
      <TransformWrapper minScale={0.6} maxScale={4} initialScale={1} centerOnInit limitToBounds={false} doubleClick={{ disabled: true }} wheel={{ step: 0.12 }}>
        <ZoomTo targetId={zoneTarget} zoomKey={zoomKey} />
        <Controls />
        <TransformComponent wrapperClass="!size-full" contentClass="!w-full">
          <svg viewBox={`0 0 ${geo.width} ${geo.height}`} className="block h-auto w-full touch-manipulation select-none" role="group" aria-label="Denah kursi">
            <defs>
              <pattern id="seat-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="#231f20" strokeOpacity="0.45" strokeWidth="2" />
              </pattern>
            </defs>

            {/* stage */}
            <g aria-hidden>
              <rect x={geo.width * 0.18} y={10} width={geo.width * 0.64} height={34} rx={17} fill="#006426" />
              <text x={geo.width / 2} y={32} textAnchor="middle" fill="#fff" fontSize="13" fontWeight="700" letterSpacing="3">
                PANGGUNG
              </text>
            </g>

            {/* zoom zones */}
            {geo.zones.map((z) => (
              <rect
                key={z.id}
                id={`seat-zone-${z.id}`}
                x={PAD_X - 26}
                y={TOP + z.y0 * SEAT_UNIT - 8}
                width={(geo.maxX + 1) * SEAT_UNIT + 52}
                height={(z.y1 - z.y0 + 1) * SEAT_UNIT + 16}
                fill="transparent"
                pointerEvents="none"
              />
            ))}

            {/* row labels */}
            {geo.rows.map((r) => (
              <g key={r.row} aria-hidden fontSize="12" fontWeight="700" fill="#6b6560">
                <text x={PAD_X - 14} y={TOP + r.y * SEAT_UNIT + SEAT / 2 + 4} textAnchor="middle">
                  {r.row}
                </text>
                <text x={PAD_X + (geo.maxX + 1) * SEAT_UNIT + 8} y={TOP + r.y * SEAT_UNIT + SEAT / 2 + 4} textAnchor="middle">
                  {r.row}
                </text>
              </g>
            ))}

            {/* seats */}
            {seats.map((seat) => {
              const ss = ssById.get(seat.id)
              const category = ss?.categoryId ? (catById.get(ss.categoryId) ?? null) : null
              const { status, visual } = visualOf(seat)
              const color = category?.color ?? '#a8a29e'
              const dim = !!activeCategoryId && category?.id !== activeCategoryId
              const clickable =
                !!onSeatClick &&
                (interactive ? (status === 'AVAILABLE' || visual === 'SELECTED') && !dim : true)
              const label = `Baris ${seat.row} nomor ${seat.number}, ${category?.name ?? 'tanpa kategori'}, ${
                visual === 'SELECTED' || visual === 'MINE' ? 'pilihanmu' : SEAT_STATUS_LABEL[status].toLowerCase()
              }${seat.isPriority ? ', kursi prioritas difabel' : ''}`
              const x = PAD_X + seat.x * SEAT_UNIT
              const y = TOP + seat.y * SEAT_UNIT
              const onActivate = () => onSeatClick?.(seat, status, category)
              return (
                <g
                  key={seat.id}
                  transform={`translate(${x} ${y})`}
                  opacity={dim ? 0.32 : 1}
                  role={clickable ? 'button' : 'img'}
                  tabIndex={clickable ? 0 : -1}
                  aria-label={label}
                  aria-pressed={clickable ? visual === 'SELECTED' : undefined}
                  className={cn(clickable && 'cursor-pointer outline-none focus-visible:[&>rect:first-of-type]:stroke-[#231f20] focus-visible:[&>rect:first-of-type]:stroke-[3]')}
                  onClick={clickable ? onActivate : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onActivate()
                          }
                        }
                      : undefined
                  }
                >
                  <title>{`${seatLabel(seat)} · ${category?.name ?? '-'} · ${visual === 'SELECTED' || visual === 'MINE' ? 'Pilihanmu' : SEAT_STATUS_LABEL[status]}`}</title>
                  <SeatShape visual={visual} color={color} />
                  {seat.isPriority && (visual === 'AVAILABLE' || visual === 'SUGGESTED') && <Wheelchair color="#ffffff" />}
                </g>
              )
            })}
          </svg>
        </TransformComponent>
      </TransformWrapper>
    </div>
  )
}

/** One seat drawing. Exported for the legend so the legend matches the map exactly. */
export function SeatShape({ visual, color }: { visual: SeatVisual; color: string }) {
  const r = 7
  switch (visual) {
    case 'AVAILABLE':
      return <rect width={SEAT} height={SEAT} rx={r} fill={color} stroke="transparent" />
    case 'SUGGESTED':
      return (
        <>
          <rect width={SEAT} height={SEAT} rx={r} fill={color} stroke="#231f20" strokeWidth={2.5} strokeDasharray="4 3" />
        </>
      )
    case 'SELECTED':
    case 'MINE':
      return (
        <>
          <rect width={SEAT} height={SEAT} rx={r} fill="#006426" stroke="#fedc01" strokeWidth={2.5} />
          <path d="M8 14.5l4 4 8-9" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )
    case 'HELD':
      return (
        <>
          <rect width={SEAT} height={SEAT} rx={r} fill={color} fillOpacity={0.3} stroke="transparent" />
          <rect width={SEAT} height={SEAT} rx={r} fill="url(#seat-hatch)" />
          <circle cx={SEAT / 2} cy={SEAT / 2} r={6.5} fill="#fff" stroke="#231f20" strokeWidth={1.4} />
          <path d={`M${SEAT / 2} ${SEAT / 2 - 3.5}V${SEAT / 2}l2.5 1.8`} stroke="#231f20" strokeWidth={1.4} fill="none" strokeLinecap="round" />
        </>
      )
    case 'CONFLICT':
      return (
        <>
          <rect width={SEAT} height={SEAT} rx={r} fill="#fde8e8" stroke="#dc2626" strokeWidth={2.5} />
          <path d="M9 9l10 10M19 9L9 19" stroke="#dc2626" strokeWidth={2.5} strokeLinecap="round" />
        </>
      )
    case 'SOLD':
      return (
        <>
          <rect width={SEAT} height={SEAT} rx={r} fill="#d6d3d1" />
          <path d="M9 9l10 10M19 9L9 19" stroke="#78716c" strokeWidth={2.2} strokeLinecap="round" />
        </>
      )
    case 'BLOCKED':
    default:
      return <rect x={1} y={1} width={SEAT - 2} height={SEAT - 2} rx={r} fill="none" stroke="#a8a29e" strokeWidth={1.5} strokeDasharray="3 3" />
  }
}

/** Small inline seat sample for legends (same drawing as the map). */
export function SeatSample({ visual, color = '#2563eb', size = 18 }: { visual: SeatVisual; color?: string; size?: number }) {
  return (
    <svg viewBox={`0 0 ${SEAT} ${SEAT}`} width={size} height={size} aria-hidden className="shrink-0">
      <defs>
        <pattern id={`seat-hatch-s-${visual}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#231f20" strokeOpacity="0.45" strokeWidth="2" />
        </pattern>
      </defs>
      {visual === 'HELD' ? (
        <>
          <rect width={SEAT} height={SEAT} rx={7} fill={color} fillOpacity={0.3} />
          <rect width={SEAT} height={SEAT} rx={7} fill={`url(#seat-hatch-s-${visual})`} />
          <circle cx={14} cy={14} r={6.5} fill="#fff" stroke="#231f20" strokeWidth={1.4} />
          <path d="M14 10.5V14l2.5 1.8" stroke="#231f20" strokeWidth={1.4} fill="none" strokeLinecap="round" />
        </>
      ) : (
        <SeatShape visual={visual} color={color} />
      )}
    </svg>
  )
}
