import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { CircleAlert, Minus, Plus, RefreshCw } from 'lucide-react'
import { EmptyState } from '@/components/common/bits'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/hooks/useLive'
import { cn } from '@/lib/utils'
import { useAvoidDemoPill, useElementHeight } from './hooks'

/**
 * Fixed action bar at the bottom of the phone shell, plus an in-flow spacer of the
 * same height so the page content never hides behind it.
 */
export function BottomBar({ children, aboveNav = false, className }: { children: ReactNode; aboveNav?: boolean; className?: string }) {
  const [ref, height] = useElementHeight()
  return (
    <>
      <div aria-hidden style={{ height: height + 8 }} />
      <div
        ref={ref}
        className={cn(
          'fixed inset-x-0 z-30 mx-auto w-full max-w-md border-t bg-card/95 px-4 pt-3 shadow-[0_-10px_30px_-18px_rgb(0_0_0/0.35)] backdrop-blur',
          aboveNav ? 'bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] pb-3' : 'bottom-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]',
          className,
        )}
      >
        {children}
      </div>
    </>
  )
}

/** Row for the main button(s) of a bottom bar; steps aside for the floating Demo pill. */
export function BarActions({ children, className }: { children: ReactNode; className?: string }) {
  const [ref, inset] = useAvoidDemoPill()
  return (
    <div ref={ref} className={cn('flex items-stretch gap-2', className)} style={inset ? { paddingLeft: inset } : undefined}>
      {children}
    </div>
  )
}

export function PageSkeleton({ hero = false }: { hero?: boolean }) {
  return (
    <div className="space-y-4 p-4" aria-busy="true" aria-label="Memuat">
      {hero && <Skeleton className="h-48 w-full rounded-2xl" />}
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-24 w-full rounded-2xl" />
    </div>
  )
}

export function LoadError({ error, onRetry, backTo = '/app', backLabel = 'Kembali ke Beranda' }: { error: unknown; onRetry?: () => void; backTo?: string; backLabel?: string }) {
  return (
    <div className="p-4">
      <EmptyState
        icon={<CircleAlert />}
        title="Data belum bisa dimuat"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {onRetry && (
              <Button variant="outline" className="h-11" onClick={onRetry}>
                <RefreshCw /> Coba lagi
              </Button>
            )}
            <Button asChild className="h-11">
              <Link to={backTo}>{backLabel}</Link>
            </Button>
          </div>
        }
      >
        {errorMessage(error)}
      </EmptyState>
    </div>
  )
}

/** −/+ stepper with a big number, 44 px targets. */
export function QtyStepper({
  value,
  min = 1,
  max,
  onChange,
  label,
  unit = 'orang',
  className,
}: {
  value: number
  min?: number
  max: number
  onChange: (n: number) => void
  label: string
  unit?: string
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-1 rounded-xl border bg-card p-1', className)} role="group" aria-label={label}>
      <button
        type="button"
        className="flex size-11 items-center justify-center rounded-lg text-foreground hover:bg-muted disabled:opacity-35"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`Kurangi ${label.toLowerCase()}`}
      >
        <Minus className="size-5" />
      </button>
      <output className="min-w-12 text-center leading-none" aria-live="polite">
        <span className="block text-xl font-extrabold tabular-nums">{value}</span>
        <span className="text-[0.65rem] text-muted-foreground">{unit}</span>
      </output>
      <button
        type="button"
        className="flex size-11 items-center justify-center rounded-lg text-foreground hover:bg-muted disabled:opacity-35"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`Tambah ${label.toLowerCase()}`}
      >
        <Plus className="size-5" />
      </button>
    </div>
  )
}

export function SectionTitle({ children, className, right }: { children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <div className={cn('mb-2 flex items-baseline justify-between gap-2', className)}>
      <h2 className="text-base font-bold">{children}</h2>
      {right}
    </div>
  )
}

/** Tag/chip used for access methods and small facts. */
export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-semibold text-muted-foreground', className)}>{children}</span>
}

/** Simulation tag – every fake channel/payment is labelled as such. */
export function SimTag({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full bg-ink px-2 py-0.5 text-[0.62rem] font-bold tracking-wide text-white uppercase', className)}>Simulasi</span>
  )
}
