/** Grouped rows like a phone's settings: a section name, then rows with an icon tile, a title, and what sits on the right. */
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SectionLabel } from './Common'

export function SettingsGroup({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-2.5">
      <SectionLabel id={id}>{title}</SectionLabel>
      <ul className="divide-y overflow-hidden rounded-[1.4rem] bg-card shadow-xs">{children}</ul>
    </section>
  )
}

/**
 * One row. With `to` it opens a screen, with `onClick` it acts, with `label` the whole row is the label of the control
 * on its right (a switch), so the row is the touch target.
 */
export function SettingsRow({
  icon,
  tint = 'bg-muted text-ink',
  title,
  sub,
  right,
  to,
  onClick,
  label = false,
  danger = false,
  chevron = false,
}: {
  icon: ReactNode
  tint?: string
  title: ReactNode
  sub?: ReactNode
  right?: ReactNode
  to?: string
  onClick?: () => void
  label?: boolean
  danger?: boolean
  /** a row that acts (`onClick`) but reads as opening something */
  chevron?: boolean
}) {
  const inner = (
    <>
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5', danger ? 'bg-status-invalid/10 text-[#a11b1b]' : tint)} aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block font-semibold', danger && 'text-[#a11b1b]')}>{title}</span>
        {sub && <span className="mt-0.5 block text-xs text-muted-foreground">{sub}</span>}
      </span>
      {right}
      {(to || chevron) && <ChevronRight className="size-5 shrink-0 text-muted-foreground/70" aria-hidden />}
    </>
  )
  const cls = 'flex min-h-16 w-full items-center gap-3 px-3.5 py-3 text-left transition'
  return (
    <li>
      {to ? (
        <Link to={to} className={cn(cls, 'active:bg-muted')}>
          {inner}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={cn(cls, 'active:bg-muted')}>
          {inner}
        </button>
      ) : label ? (
        <label className={cn(cls, 'cursor-pointer')}>{inner}</label>
      ) : (
        <div className={cls}>{inner}</div>
      )}
    </li>
  )
}
