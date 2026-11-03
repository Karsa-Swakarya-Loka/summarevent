import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { CircleAlert, Minus, Plus, RefreshCw } from 'lucide-react'
import { apiMode, DEMO_URL } from '@/api'
import { EmptyState } from '@/components/common/bits'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/hooks/useLive'
import { cn } from '@/lib/utils'

/**
 * Action bar at the bottom of a pushed screen. It stays in reach of the thumb while the page scrolls, and rests at the
 * bottom of the screen when the page is short.
 */
export function BottomBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-20 mt-auto border-t bg-card/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_-18px_rgb(0_0_0/0.35)] backdrop-blur',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * Header of a tab screen, iOS style: a large title under a translucent bar. Once the title scrolls under the bar it
 * shows small in the bar, with a hairline.
 */
export function TabHeader({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null)
  const [under, setUnder] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setUnder(!e.isIntersecting), { rootMargin: '-56px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <>
      <div
        className={cn(
          'sticky top-0 z-20 flex min-h-14 items-center justify-center bg-background/85 px-16 pt-[env(safe-area-inset-top)] backdrop-blur-xl transition-shadow duration-200',
          under && 'shadow-[0_1px_0_rgb(0_0_0/0.08)]',
        )}
      >
        <span aria-hidden className={cn('truncate font-bold transition duration-200 ease-(--ease-soft)', under ? 'opacity-100' : 'translate-y-1.5 opacity-0')}>
          {title}
        </span>
        {right && <div className="absolute right-2 bottom-0 flex h-14 items-center">{right}</div>}
      </div>
      <header className="px-4 pb-3">
        <h1 ref={ref} className="font-poster text-[2.75rem] leading-[0.95] uppercase">
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </header>
    </>
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
  const { pathname } = useLocation()
  // no "back to Beranda" on Beranda itself
  const showBack = pathname.replace(/\/+$/, '') !== backTo.replace(/\/+$/, '')
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
            {showBack && (
              <Button asChild className="h-11">
                <Link to={backTo}>{backLabel}</Link>
              </Button>
            )}
            {/* live version without its server: the demo still works on its own */}
            {apiMode === 'live' && (
              <Button asChild variant={showBack ? 'outline' : 'default'} className="h-11">
                <a href={DEMO_URL}>Buka versi demo</a>
              </Button>
            )}
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

/** A section's name as a small tracked label, the way a printed ticket names its fields. */
export function SectionLabel({ id, children, right }: { id?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-1">
      <h2 id={id} className="text-[0.7rem] font-bold tracking-[0.18em] text-muted-foreground uppercase">
        {children}
      </h2>
      {right}
    </div>
  )
}

/** Simulation tag – every fake channel/payment is labelled as such. */
export function SimTag({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full bg-ink px-2 py-0.5 text-[0.62rem] font-bold tracking-wide text-white uppercase', className)}>Simulasi</span>
  )
}
