import type { ReactNode } from 'react'
import { ChevronLeft, Clock } from 'lucide-react'
import type { Tone } from '@/domain/labels'
import { fmtCountdown } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useNow } from '@/hooks/useLive'
import { useScrolled } from '@/hooks/useScrolled'
import { useBack } from '@/lib/navStack'
import { DemoMenu } from './DemoMenu'

/* ---------- Status badge (green/yellow/red only for status) ---------- */
const TONE_CLASS: Record<Tone, string> = {
  valid: 'bg-status-valid/12 text-[#0b6b35] ring-status-valid/30',
  warn: 'bg-status-warn/18 text-[#7a5600] ring-status-warn/40',
  invalid: 'bg-status-invalid/10 text-[#a11b1b] ring-status-invalid/30',
  neutral: 'bg-muted text-muted-foreground ring-border',
  brand: 'bg-brand-soft text-brand ring-brand/20',
  info: 'bg-blue-50 text-blue-800 ring-blue-200',
}
const DOT: Record<Tone, string> = {
  valid: 'bg-status-valid',
  warn: 'bg-status-warn',
  invalid: 'bg-status-invalid',
  neutral: 'bg-muted-foreground/60',
  brand: 'bg-brand',
  info: 'bg-blue-600',
}

export function StatusBadge({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap', TONE_CLASS[tone], className)}>
      <span className={cn('size-1.5 rounded-full', DOT[tone])} aria-hidden />
      {children}
    </span>
  )
}

/* ---------- Countdown ---------- */
export function Countdown({ to, className, onDone, prefix }: { to: string; className?: string; onDone?: () => void; prefix?: ReactNode }) {
  const now = useNow(1000)
  const ms = new Date(to).getTime() - now.getTime()
  if (ms <= 0 && onDone) queueMicrotask(onDone)
  const urgent = ms < 2 * 60_000
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-semibold tabular-nums', urgent && 'text-status-invalid', className)} role="timer" aria-live="off">
      <Clock className="size-4" aria-hidden />
      {prefix}
      {ms <= 0 ? '00:00' : fmtCountdown(ms)}
    </span>
  )
}

/** The hold countdown as a dark pill in an app bar, red in the last two minutes. */
export function HoldPill({ to, label }: { to: string; label: string }) {
  const now = useNow(1000)
  const urgent = new Date(to).getTime() - now.getTime() < 2 * 60_000
  return (
    <span className={cn('inline-flex h-9 shrink-0 items-center rounded-full px-3 shadow-sm transition-colors duration-300', urgent ? 'bg-status-invalid' : 'bg-ink')}>
      <span className="sr-only">{label}: </span>
      <Countdown to={to} className="text-sm text-white [&_svg]:size-3.5" />
    </span>
  )
}

/* ---------- Page header with back link ---------- */
/**
 * App bar of a pushed screen: back on the left, the title, then the screen's own action and the Demo button. It stays
 * on top while the page scrolls, translucent, with a hairline once content runs under it.
 */
export function BackHeader({ to, title, right, demo = true }: { to: string; title?: ReactNode; right?: ReactNode; demo?: boolean }) {
  const back = useBack(to)
  const scrolled = useScrolled()
  return (
    <div
      className={cn(
        'sticky top-0 z-20 flex min-h-14 items-center gap-1 bg-background/85 px-1.5 pt-[env(safe-area-inset-top)] backdrop-blur-xl transition-shadow duration-200',
        scrolled && 'shadow-[0_1px_0_rgb(0_0_0/0.08)]',
      )}
    >
      <button type="button" onClick={back} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full transition active:scale-90 active:bg-muted" aria-label="Kembali">
        <ChevronLeft className="size-6" />
      </button>
      <div className="min-w-0 flex-1 truncate font-semibold">{title}</div>
      {right}
      {demo && <DemoMenu variant="bar" />}
    </div>
  )
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card px-6 py-10 text-center">
      {icon && <div className="text-muted-foreground [&_svg]:size-10">{icon}</div>}
      <div className="font-semibold">{title}</div>
      {children && <div className="max-w-xs text-sm text-muted-foreground">{children}</div>}
      {action}
    </div>
  )
}

/* ---------- Category swatch ---------- */
export function Swatch({ color, className }: { color: string; className?: string }) {
  return <span className={cn('inline-block size-3 shrink-0 rounded-[4px]', className)} style={{ background: color }} aria-hidden />
}
