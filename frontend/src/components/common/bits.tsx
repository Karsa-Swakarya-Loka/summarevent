import type { ReactNode } from 'react'
import { ChevronLeft, Clock } from 'lucide-react'
import type { Tone } from '@/domain/labels'
import { countdownUnits, fmtLeft } from '@/lib/format'
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

/* ---------- Time left ---------- */
/*
 * Every clock in the app says what it counts down to ("Bayar dalam", "Mulai dalam", "Kursi ditahan"), never a bare
 * "09:52", and never with "Sisa", which on these screens means places left. Under an hour it reads mm:ss next to a ring
 * that drains (when the start of the stretch is known); from an hour on it is words ("5 jam 12 mnt"). The big form is
 * TimeTiles: one tile per unit, the seconds always ticking.
 */
const pad2 = (n: number) => String(n).padStart(2, '0')
function clockText(ms: number) {
  if (ms <= 0) return 'Waktu habis'
  if (ms >= 3_600_000) return fmtLeft(ms, { seconds: false })
  const t = Math.floor(ms / 1000)
  return `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`
}

/** A small ring that empties as the time runs out; a clock face when the start is not known. */
function TimeRing({ left, total, className }: { left: number; total?: number; className?: string }) {
  if (!total || total <= 0) return <Clock className={cn('size-4 shrink-0', className)} aria-hidden />
  const r = 6.25
  const c = 2 * Math.PI * r
  const frac = Math.max(0, Math.min(1, left / total))
  return (
    <svg viewBox="0 0 16 16" className={cn('size-4 shrink-0 -rotate-90', className)} aria-hidden>
      <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${c * frac} ${c}`} className="transition-[stroke-dasharray] duration-1000 ease-linear" />
    </svg>
  )
}

/**
 * The time left to `to`, with what it is for: "[ring] Bayar dalam 09:52". `from` (the start of the stretch, e.g. when
 * the seats were held) lets the ring drain; in the last two minutes it turns red.
 */
export function Countdown({ to, label, from, className, onDone }: { to: string; label?: ReactNode; from?: string; className?: string; onDone?: () => void }) {
  const now = useNow(1000)
  const ms = new Date(to).getTime() - now.getTime()
  if (ms <= 0 && onDone) queueMicrotask(onDone)
  const urgent = ms < 2 * 60_000
  const total = from ? new Date(to).getTime() - new Date(from).getTime() : undefined
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-semibold whitespace-nowrap tabular-nums', urgent && 'text-status-invalid', className)} role="timer" aria-live="off">
      <TimeRing left={ms} total={total} />
      {/* the label and the time are one run of text, so only a real space parts them */}
      {label != null && <span className="font-medium">{label}</span>}
      {label != null && ' '}
      <span>{clockText(ms)}</span>
    </span>
  )
}

/**
 * The big countdown: what it counts to, then one tile per unit (hari, jam, mnt, dtk) with the seconds ticking.
 * `tone` sets it on a light card, on ink, or as frosted glass over a picture.
 */
export function TimeTiles({ to, label, tone = 'light', className, onDone }: { to: string; label: ReactNode; tone?: 'light' | 'ink' | 'glass'; className?: string; onDone?: () => void }) {
  const now = useNow(1000)
  const ms = new Date(to).getTime() - now.getTime()
  if (ms <= 0 && onDone) queueMicrotask(onDone)
  const urgent = ms > 0 && ms < 2 * 60_000
  const tile = {
    light: 'bg-ink text-white',
    ink: 'bg-white/12 text-white ring-1 ring-white/15 ring-inset',
    glass: 'bg-white/90 text-ink',
  }[tone]
  return (
    <div className={cn('inline-flex flex-col gap-1.5', className)} role="timer" aria-live="off" aria-label={`${typeof label === 'string' ? label + ' ' : ''}${ms <= 0 ? 'waktu habis' : fmtLeft(ms)}`}>
      <span className={cn('text-[0.7rem] leading-none font-bold tracking-[0.08em] uppercase', tone === 'light' ? 'text-muted-foreground' : 'text-white/85')} aria-hidden>
        {label}
      </span>
      <span className="flex items-stretch gap-1" aria-hidden>
        {ms <= 0 ? (
          <span className={cn('rounded-lg px-2.5 py-1.5 text-sm font-bold', tile)}>Waktu habis</span>
        ) : (
          countdownUnits(ms).map((u) => (
            <span key={u.unit} className={cn('flex min-w-[2.6rem] flex-col items-center rounded-lg px-1.5 pt-1 pb-0.5 shadow-xs', tile, urgent && 'bg-status-invalid text-white')}>
              <span className="text-[1.05rem] leading-tight font-extrabold tabular-nums">{u.unit === 'hari' ? u.value : pad2(u.value)}</span>
              <span className="text-[0.62rem] leading-tight font-semibold uppercase opacity-75">{u.unit}</span>
            </span>
          ))
        )}
      </span>
    </div>
  )
}

/**
 * The hold countdown as a dark pill in an app bar: a draining ring, what is held, and mm:ss. Red in the last two
 * minutes.
 */
export function HoldPill({ to, from, label }: { to: string; from?: string; label: string }) {
  const now = useNow(1000)
  const ms = new Date(to).getTime() - now.getTime()
  const urgent = ms < 2 * 60_000
  const total = from ? new Date(to).getTime() - new Date(from).getTime() : undefined
  return (
    <span
      className={cn('inline-flex h-10 shrink-0 items-center gap-2 rounded-full py-1 pr-3.5 pl-2.5 text-white shadow-sm transition-colors duration-300', urgent ? 'bg-status-invalid' : 'bg-ink')}
      role="timer"
      aria-live="off"
    >
      <TimeRing left={ms} total={total} className="size-5" />
      <span className="flex flex-col leading-none">
        <span className="text-[0.62rem] font-semibold tracking-wide text-white/80 uppercase">{label}</span>{' '}
        <span className="mt-0.5 text-sm font-bold tabular-nums">{clockText(ms)}</span>
      </span>
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
        // in the visitor app on a laptop it sits under the shell's top bar, which already carries the Demo menu (staff screens keep theirs)
        'sticky top-0 z-20 flex min-h-14 items-center gap-1 bg-background/85 px-1.5 pt-[env(safe-area-inset-top)] backdrop-blur-xl transition-shadow duration-200 lg:in-data-[shell=visitor]:top-(--spacing-desk-bar)',
        scrolled && 'shadow-[0_1px_0_rgb(0_0_0/0.08)]',
      )}
    >
      <button type="button" onClick={back} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full transition active:scale-90 active:bg-muted" aria-label="Kembali">
        <ChevronLeft className="size-6" />
      </button>
      <div className="min-w-0 flex-1 truncate font-semibold">{title}</div>
      {right}
      {demo && <DemoMenu variant="bar" className="lg:in-data-[shell=visitor]:hidden" />}
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
