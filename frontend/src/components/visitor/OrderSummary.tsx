import type { ReactNode } from 'react'
import { CalendarDays, MapPin, Users } from 'lucide-react'
import type { OrderDetail } from '@/api/contract'
import { StatusBadge, Swatch } from '@/components/common/bits'
import { ACCESS_METHOD_LABEL, ORDER_TONE, orderStatusLabel } from '@/domain/labels'
import { cn } from '@/lib/utils'
import { seatRangeLabel, sessionName, sessionWhen, totalLabel } from './helpers'

/** Order summary (PV-07): event, session, category, seats or qty, total and status. */
export function OrderSummary({ detail, children, className, compact = false }: { detail: OrderDetail; children?: ReactNode; className?: string; compact?: boolean }) {
  const { order, event, venue, session, category } = detail
  const seats = order.items.map((i) => i.seatLabel).filter((x): x is string => !!x)
  return (
    <section className={cn('rounded-2xl border bg-card p-4 shadow-xs', className)} aria-label="Ringkasan pesanan">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-xs font-medium whitespace-nowrap text-muted-foreground">Pesanan {order.code}</p>
        <StatusBadge tone={ORDER_TONE[order.status]}>{orderStatusLabel(order.status, order.paymentMethod, order.totalAmount)}</StatusBadge>
      </div>
      <h2 className="mt-1 leading-snug font-bold text-balance">{event.title}</h2>

      <ul className="mt-3 grid gap-1.5 text-sm">
        <li className="flex items-start gap-2">
          <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            <span className="font-semibold">{sessionName(session)}</span> · {sessionWhen(session)}
          </span>
        </li>
        <li className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>{venue.name}, Summarecon Mall Bandung</span>
        </li>
        <li className="flex items-center gap-2">
          <Swatch color={category.color} className="mx-0.5 size-3" />
          <span>
            <span className="font-semibold">{category.name}</span> · {ACCESS_METHOD_LABEL[category.accessMethod]}
          </span>
        </li>
      </ul>

      {!compact && (
        <div className="mt-3">
          {seats.length ? (
            <>
              <p className="text-xs text-muted-foreground">
                {seats.length} kursi · {seatRangeLabel(seats)}
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Nomor kursi">
                {seats.map((s) => (
                  <li key={s} className="rounded-lg border-2 px-2.5 py-1 text-lg leading-none font-extrabold tabular-nums" style={{ borderColor: category.color }}>
                    {s}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm">
              <Users className="size-4 text-muted-foreground" aria-hidden />
              <span>
                <span className="text-lg font-extrabold">{order.qty} orang</span> · tanpa nomor kursi
              </span>
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex items-baseline justify-between border-t pt-3">
        <span className="text-sm text-muted-foreground">
          Total{category.accessMethod === 'RECEIPT' ? ' (tukar struk)' : ''}
        </span>
        <span className="text-2xl font-extrabold tabular-nums">{totalLabel(order.totalAmount, category.accessMethod)}</span>
      </div>
      {children}
    </section>
  )
}
