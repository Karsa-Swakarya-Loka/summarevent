/**
 * The way of an order as four stops on a line (held, paid or checked, e-ticket, check-in): the stops behind it filled
 * with a check, the current one ringed and breathing, the line filled up to it. Pattern after Remold UI's Order
 * tracker (MIT), drawn with our own tokens and plain CSS.
 */
import { Check } from 'lucide-react'
import type { OrderDetail } from '@/api/contract'
import { orderSteps } from '@/components/visitor/helpers'
import { cn } from '@/lib/utils'

export function OrderTracker({ detail, className }: { detail: Pick<OrderDetail, 'order' | 'tickets'>; className?: string }) {
  const steps = orderSteps(detail)
  if (!steps) return null
  const at = steps.findIndex((s) => s.state === 'current')
  const reached = at === -1 ? steps.length - 1 : at
  return (
    <section aria-label="Perjalanan pesanan" className={cn('rounded-[1.4rem] bg-card px-4 pt-4 pb-3.5 shadow-xs', className)}>
      <ol className="relative grid grid-cols-4">
        {/* the line between the first and last stop, filled up to the one reached */}
        <span className="absolute top-[13px] right-[12.5%] left-[12.5%] h-0.5 rounded-full bg-foreground/10" aria-hidden />
        <span
          className="absolute top-[13px] left-[12.5%] h-0.5 rounded-full bg-brand transition-[width] duration-700 ease-(--ease-soft)"
          style={{ width: `${(reached / (steps.length - 1)) * 75}%` }}
          aria-hidden
        />
        {steps.map((s, i) => (
          <li key={s.label} className="relative flex flex-col items-center gap-1.5 text-center" aria-current={s.state === 'current' ? 'step' : undefined}>
            <span
              className={cn(
                'relative grid size-7 place-items-center rounded-full text-xs font-bold',
                s.state === 'done' && 'bg-brand text-white',
                s.state === 'current' && 'bg-card text-brand ring-2 ring-brand',
                s.state === 'todo' && 'bg-muted text-muted-foreground',
              )}
            >
              {s.state === 'current' && <span className="absolute inset-0 animate-ping rounded-full bg-brand/25 motion-reduce:hidden" aria-hidden />}
              {s.state === 'done' ? <Check className="size-4" strokeWidth={3} aria-hidden /> : i + 1}
            </span>
            <span className={cn('text-[0.72rem] leading-tight font-semibold', s.state === 'todo' ? 'text-muted-foreground' : 'text-foreground')}>
              {s.label}
              <span className="sr-only">{s.state === 'done' ? ', selesai' : s.state === 'current' ? ', sedang berjalan' : ', berikutnya'}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
