/** Shared UI bits for the panitia screens. */
import type { ReactNode } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import type { EventSummary } from '@/api/contract'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/hooks/useLive'
import { cn } from '@/lib/utils'
import { fmtClock } from './lib'

export function PageHeader({ title, description, actions, className }: { title: string; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** "● Diperbarui 10.21.33 · tiap 5 detik" */
export function LiveIndicator({ at, everySec, className }: { at?: string; everySec: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-xs text-muted-foreground', className)} aria-live="off">
      <span className="inline-flex size-2.5 rounded-full bg-status-valid" aria-hidden />
      <span>
        {at ? <>Diperbarui {fmtClock(at)}</> : 'Memuat…'} · otomatis tiap {everySec} detik
      </span>
    </span>
  )
}

export function EventSelect({
  events,
  value,
  onChange,
  allowAll,
  id = 'event-select',
  className,
  label = 'Event',
  hideLabel,
}: {
  events: EventSummary[] | undefined
  value: string
  onChange: (id: string) => void
  allowAll?: boolean
  id?: string
  className?: string
  label?: string
  hideLabel?: boolean
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={id} className={cn('text-xs text-muted-foreground', hideLabel && 'sr-only')}>
        {label}
      </Label>
      <Select value={value} onValueChange={onChange} disabled={!events}>
        <SelectTrigger id={id} className="h-10 w-full min-w-0 bg-card sm:w-72" aria-label={label}>
          <SelectValue placeholder={events ? 'Pilih event' : 'Memuat event…'} />
        </SelectTrigger>
        <SelectContent position="popper" className="max-w-[min(92vw,28rem)]">
          {allowAll && <SelectItem value="ALL">Semua event</SelectItem>}
          {(events ?? []).map((e) => (
            <SelectItem key={e.event.id} value={e.event.id}>
              <span className="truncate">{e.event.title}</span>
              {e.event.status === 'DRAFT' && <span className="text-xs text-muted-foreground">(draft)</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function LoadError({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-wrap items-center gap-3 rounded-xl border border-status-invalid/30 bg-status-invalid/5 p-4 text-sm', className)}>
      <AlertCircle className="size-5 text-status-invalid" aria-hidden />
      <span className="flex-1">{errorMessage(error)}</span>
      {onRetry && (
        <Button variant="outline" size="lg" onClick={onRetry}>
          <RefreshCw /> Coba lagi
        </Button>
      )}
    </div>
  )
}

/** Label + control + hint/error, with ids wired for screen readers. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
  optional,
}: {
  id: string
  label: ReactNode
  hint?: ReactNode
  error?: string
  children: ReactNode
  className?: string
  optional?: boolean
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={id} className="text-sm font-semibold">
        {label}
        {optional && <span className="font-normal text-muted-foreground"> (opsional)</span>}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-1 text-xs font-medium text-[#a11b1b]">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function SectionCard({ title, description, actions, children, className }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-[1.25rem] bg-panel p-4 sm:p-5', className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export function ListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)} role="status" aria-busy="true" aria-label="Memuat">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-xl bg-panel" />
      ))}
    </div>
  )
}
