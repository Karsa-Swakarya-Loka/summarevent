import type { OrderDetail } from '@/api/contract'
import { Swatch } from '@/components/common/bits'
import { rupiahPlain } from '@/lib/format'
import { cn } from '@/lib/utils'
import { seatRangeLabel, sessionName, sessionWhen } from './helpers'

/**
 * Order summary (PV-07) as a paper slip: the event in display type, when and where, then a perforation and what the
 * visitor gets for what price. The light slip is the order; the black card stock is kept for the e-ticket itself.
 */
export function OrderSummary({ detail, className }: { detail: OrderDetail; className?: string }) {
  const { order, event, venue, session, category } = detail
  const seats = order.items.map((i) => i.seatLabel).filter((x): x is string => !!x)
  const price = category.accessMethod === 'RECEIPT' ? 'Tukar struk' : category.accessMethod === 'FREE' || order.totalAmount === 0 ? 'Gratis' : rupiahPlain(order.totalAmount)
  return (
    <div className={cn('drop-shadow-[0_10px_18px_rgb(35_31_32/0.13)]', className)}>
      <section aria-label="Ringkasan pesanan" className="ticket-slip rounded-[1.4rem] bg-card">
        <div className="px-4 pt-4 pb-3.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Swatch color={category.color} className="size-2.5 rounded-full" />
            <span className="truncate">
              {category.name} · {sessionName(session)}
            </span>
          </p>
          <h2 className="mt-1.5 line-clamp-2 font-poster text-[1.75rem] leading-[0.95] text-balance uppercase">{event.title}</h2>
          <p className="mt-2 truncate text-sm text-muted-foreground">
            {sessionWhen(session)} · {venue.name}
          </p>
        </div>
        <div className="mx-4 border-t-2 border-dashed border-border" aria-hidden />
        <dl className="flex h-[4.75rem] items-center justify-between gap-4 px-4">
          <div className="min-w-0">
            <dt className="text-xs font-semibold text-muted-foreground">{seats.length ? `${seats.length} kursi` : 'Tanpa nomor kursi'}</dt>
            <dd className="mt-1 truncate font-poster text-[1.6rem] leading-none uppercase">{seats.length ? seatRangeLabel(seats) : `${order.qty} orang`}</dd>
          </div>
          <div className="shrink-0 text-right">
            <dt className="text-xs font-semibold text-muted-foreground">{category.accessMethod === 'PAID' ? 'Total' : 'Harga'}</dt>
            <dd className="mt-1 font-poster text-[1.6rem] leading-none uppercase tabular-nums">{price}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
