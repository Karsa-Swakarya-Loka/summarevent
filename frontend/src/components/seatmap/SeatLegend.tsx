import type { CategoryAvailability } from '@/api/contract'
import { ACCESS_METHOD_LABEL, accessMethodNote } from '@/domain/labels'
import type { TicketCategory } from '@/domain/types'
import { rupiah } from '@/lib/format'
import { cn } from '@/lib/utils'
import { SeatSample } from './SeatMap'

/** An available seat in every category colour at once: "Tersedia" is a status, not one colour. */
export function AvailableSample({ colors, size = 18 }: { colors: string[]; size?: number }) {
  const id = `seat-avail-${colors.join('-').replace(/[^a-z0-9-]/gi, '')}`
  const step = 100 / colors.length
  return (
    <svg viewBox="0 0 28 28" width={size} height={size} aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          {colors.flatMap((c, i) => [
            <stop key={`${i}-a`} offset={`${i * step}%`} stopColor={c} />,
            <stop key={`${i}-b`} offset={`${(i + 1) * step}%`} stopColor={c} />,
          ])}
        </linearGradient>
      </defs>
      <rect width={28} height={28} rx={7} fill={`url(#${id})`} />
    </svg>
  )
}

/** Status legend – always visible next to the map (PRD §13). */
export function StatusLegend({ className, showPriority = true, availableColors }: { className?: string; showPriority?: boolean; availableColors?: string[] }) {
  const items: Array<{ visual: Parameters<typeof SeatSample>[0]['visual']; label: string }> = [
    { visual: 'AVAILABLE', label: 'Tersedia' },
    { visual: 'SELECTED', label: 'Pilihanmu' },
    { visual: 'HELD', label: 'Sedang dipesan' },
    { visual: 'SOLD', label: 'Terjual' },
    { visual: 'BLOCKED', label: 'Tidak dijual' },
  ]
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground', className)} aria-label="Keterangan status kursi">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          {i.visual === 'AVAILABLE' && availableColors && availableColors.length > 1 ? (
            <AvailableSample colors={availableColors} />
          ) : (
            <SeatSample visual={i.visual} color={i.visual === 'AVAILABLE' && availableColors?.length ? availableColors[0] : '#2563eb'} />
          )}
          {i.label}
        </li>
      ))}
      {showPriority && (
        <li className="flex items-center gap-1.5">
          <span className="inline-flex size-[18px] items-center justify-center rounded-[5px] bg-[#2563eb] text-[11px] text-white" aria-hidden>
            ♿
          </span>
          Prioritas difabel
        </li>
      )}
    </ul>
  )
}

/** Category legend with price, how to get it and seats left. */
export function CategoryLegend({
  categories,
  availability,
  activeId,
  onPick,
  className,
}: {
  categories: TicketCategory[]
  availability?: CategoryAvailability[]
  activeId?: string | null
  onPick?: (id: string) => void
  className?: string
}) {
  return (
    <div className={cn('grid gap-2', className)} role={onPick ? 'radiogroup' : undefined} aria-label="Kategori tiket">
      {categories.map((c) => {
        const av = availability?.find((a) => a.categoryId === c.id)
        const active = activeId === c.id
        const soldOut = av ? av.available === 0 : false
        const body = (
          <>
            <span className="mt-0.5 size-4 shrink-0 rounded-[5px]" style={{ background: c.color }} aria-hidden />
            <span className="min-w-0 flex-1">
              {/* on a narrow phone the price moves under the name instead of running past the card edge */}
              <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="font-semibold">{c.name}</span>
                {/* a receipt category costs nothing; when its name already says "Tukar Struk", show that price instead of repeating the name */}
                <span className="ml-auto font-semibold whitespace-nowrap">{c.accessMethod === 'RECEIPT' ? (accessMethodNote(c) ? 'Tukar struk' : 'Rp0') : rupiah(c.price)}</span>
              </span>
              <span className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate">{c.description ?? ACCESS_METHOD_LABEL[c.accessMethod]}</span>
                {av && (
                  <span className={cn('whitespace-nowrap font-semibold', soldOut ? 'text-status-invalid' : 'text-foreground')}>
                    {soldOut ? 'Habis' : `Sisa ${av.available}`}
                  </span>
                )}
              </span>
            </span>
          </>
        )
        if (!onPick) {
          return (
            <div key={c.id} className="flex gap-3 rounded-xl border bg-card p-3 text-sm">
              {body}
            </div>
          )
        }
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={soldOut}
            onClick={() => onPick(c.id)}
            className={cn(
              'flex min-h-14 gap-3 rounded-xl border bg-card p-3 text-left text-sm transition',
              active ? 'border-brand ring-2 ring-brand/30' : 'hover:border-foreground/30',
              soldOut && 'opacity-50',
            )}
          >
            {body}
          </button>
        )
      })}
    </div>
  )
}
