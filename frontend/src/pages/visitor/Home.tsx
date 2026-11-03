/**
 * Beranda (PV-01): a featured event, then the rest, filtered by today, this week and venue. A first-time visitor is
 * sent through the onboarding first.
 */
import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { ArrowUpRight, CalendarDays, ChevronRight, Hourglass, MapPin, UserRound } from 'lucide-react'
import { api } from '@/api'
import type { EventSummary } from '@/api/contract'
import { CoBrand } from '@/components/common/Brand'
import { Countdown, DemoNotice, EmptyState, StatusBadge, SundaText } from '@/components/common/bits'
import { Illustration } from '@/components/common/Illustration'
import { Poster } from '@/components/common/Poster'
import { POSTER_THEMES } from '@/components/common/posterThemes'
import { Skeleton } from '@/components/ui/skeleton'
import { LoadError } from '@/components/visitor/Common'
import { continuePath, eventInRange, isPendingOrder, priceHint, seatRangeLabel, wibTodayRange, wibWeekRange } from '@/components/visitor/helpers'
import { useVisitor } from '@/components/visitor/hooks'
import type { User } from '@/domain/types'
import { ACCESS_METHOD_LABEL, ORDER_STATUS_LABEL, type Tone } from '@/domain/labels'
import { useLive, useNow } from '@/hooks/useLive'
import { onboardingDone } from '@/lib/intro'
import { fmtDate, fmtShortDate } from '@/lib/format'
import { cn } from '@/lib/utils'

type When = 'ALL' | 'TODAY' | 'WEEK'
const WHEN: Array<{ key: When; label: string }> = [
  { key: 'ALL', label: 'Semua' },
  { key: 'TODAY', label: 'Hari ini' },
  { key: 'WEEK', label: 'Minggu ini' },
]

export default function Home() {
  const { user } = useVisitor()
  const events = useLive(() => api.listEvents(), [])
  const orders = useLive(() => api.myOrders(), [user?.id])
  const [when, setWhen] = useState<When>('ALL')
  const [venue, setVenue] = useState<string | null>(null)
  const now = useNow(60_000)

  const venues = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of events.data ?? []) map.set(e.venue.id, e.venue.name)
    return [...map.entries()]
  }, [events.data])

  const list = useMemo(() => {
    const range = when === 'TODAY' ? wibTodayRange(now) : when === 'WEEK' ? wibWeekRange(now) : null
    return (events.data ?? [])
      .filter((e) => !venue || e.venue.id === venue)
      .filter((e) => !range || eventInRange(e, range.from, range.to))
  }, [events.data, when, venue, now])

  if (!onboardingDone()) return <Navigate to="/app/mulai" replace />

  const pending = (orders.data ?? []).filter((d) => isPendingOrder(d.order) && !d.order.simulated)
  // the spotlight goes to the first ticketed event still running, only while no filter narrows the list
  const featured = when === 'ALL' && !venue ? (list.find((e) => !e.event.infoOnly && e.sessions.some((s) => new Date(s.endAt) > now)) ?? null) : null
  const rest = list.filter((e) => e !== featured)

  return (
    <div>
      <header className="relative overflow-hidden rounded-b-[2rem] bg-brand px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-8 text-white">
        <div className="seat-dots pointer-events-none absolute inset-0 text-white/[0.08]" aria-hidden />
        <CoBrand tone="light" className="relative" />
        <div className="relative mt-7 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1>
              <SundaText k="welcome" size="lg" className="[&>span:first-child]:text-[2rem] [&>span:first-child]:leading-tight" />
            </h1>
            <p className="mt-2 text-base font-semibold">{user ? `Halo, ${user.name.split(' ')[0]}!` : 'Halo!'} Mau nonton apa di SUMMABA?</p>
          </div>
          <AccountChip user={user} />
        </div>
      </header>

      <div className="space-y-5 px-4 pt-5 pb-4">
        {pending.map((d) => (
          <Link
            key={d.order.id}
            to={continuePath(d)}
            className="flex animate-rise items-center gap-3 rounded-[1.4rem] border border-status-warn/50 bg-status-warn/12 p-3 transition hover:bg-status-warn/20"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-status-warn/25 text-[#7a5600]">
              <Hourglass className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">Selesaikan pesananmu</span>
              <span className="block truncate text-xs text-muted-foreground">
                {d.event.title} · {d.category.name}
                {d.order.items.some((i) => i.seatLabel) ? ` · ${seatRangeLabel(d.order.items.map((i) => i.seatLabel ?? '').filter(Boolean))}` : ` · ${d.order.qty} orang`}
              </span>
              <span className="mt-0.5 flex items-center gap-2 text-xs">
                <span className="font-semibold text-[#7a5600]">{ORDER_STATUS_LABEL[d.order.status]}</span>
                <Countdown to={d.order.holdExpiresAt} className="text-sm" />
              </span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        ))}

        <div className="space-y-2.5">
          <WhenTabs value={when} onChange={setWhen} />
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="group" aria-label="Filter venue">
            <VenueChip active={!venue} onClick={() => setVenue(null)}>
              Semua venue
            </VenueChip>
            {venues.map(([id, name]) => (
              <VenueChip key={id} active={venue === id} onClick={() => setVenue(venue === id ? null : id)}>
                {name}
              </VenueChip>
            ))}
          </div>
        </div>

        {events.loading && !events.data ? (
          <div className="space-y-4">
            <Skeleton className="h-72 w-full rounded-[1.75rem]" />
            <Skeleton className="h-28 w-full rounded-[1.4rem]" />
          </div>
        ) : events.error && !events.data ? (
          <LoadError error={events.error} onRetry={events.reload} />
        ) : list.length === 0 ? (
          <EmptyState icon={<Illustration name="search" className="w-28" />} title="Belum ada event di filter ini">
            {when === 'TODAY' ? 'Tidak ada event hari ini' : when === 'WEEK' ? 'Tidak ada event minggu ini' : 'Tidak ada event'}
            {venue ? ' di venue ini' : ''}. Coba pilih “Semua”.
          </EmptyState>
        ) : (
          <>
            {featured && <FeaturedCard e={featured} now={now} />}
            {rest.length > 0 && (
              <section aria-labelledby="event-list" className="space-y-3">
                <h2 id="event-list" className="px-1 text-lg font-extrabold tracking-tight">
                  {featured ? 'Event lainnya' : 'Event'}
                </h2>
                <ul className="space-y-3" aria-label="Daftar event">
                  {rest.map((e, i) => (
                    <li key={e.event.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 5) * 60}ms` }}>
                      <EventCard e={e} now={now} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <DemoNotice />
      </div>
    </div>
  )
}

function AccountChip({ user }: { user: User | null }) {
  if (!user) {
    return (
      <Link to="/app/masuk" className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white/15 px-4 text-sm font-semibold ring-1 ring-white/25 transition hover:bg-white/25">
        <UserRound className="size-4" aria-hidden /> Masuk
      </Link>
    )
  }
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <Link to="/app/akun" aria-label={`Akun ${user.name}`} className="grid size-11 place-items-center rounded-full bg-brand-yellow text-sm font-extrabold text-ink ring-2 ring-white/30">
      {initials}
    </Link>
  )
}

/** Three filters with a pill that slides to the chosen one. */
function WhenTabs({ value, onChange }: { value: When; onChange: (w: When) => void }) {
  const index = WHEN.findIndex((w) => w.key === value)
  return (
    <div role="tablist" aria-label="Filter waktu" className="relative grid grid-cols-3 rounded-2xl bg-muted p-1">
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-xl bg-card shadow-sm transition-transform duration-300 ease-(--ease-soft)"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {WHEN.map((w) => (
        <button
          key={w.key}
          type="button"
          role="tab"
          aria-selected={value === w.key}
          onClick={() => onChange(w.key)}
          className={cn('relative min-h-11 rounded-xl text-sm font-semibold transition-colors', value === w.key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
        >
          {w.label}
        </button>
      ))}
    </div>
  )
}

function VenueChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap transition',
        active ? 'border-brand bg-brand text-white' : 'bg-card text-foreground hover:border-foreground/30',
      )}
    >
      {children}
    </button>
  )
}

function availabilityOf(e: EventSummary, now: Date): { label: string; tone: Tone } | null {
  if (e.event.infoOnly) return { label: 'Masuk bebas', tone: 'brand' }
  const open = e.sessions.filter((s) => new Date(s.endAt).getTime() > now.getTime())
  if (!open.length) return { label: 'Sudah selesai', tone: 'neutral' }
  const available = open.reduce((a, s) => a + s.available, 0)
  const total = open.reduce((a, s) => a + s.total, 0)
  const unit = e.event.seatingMode === 'RESERVED' ? 'kursi' : 'tempat'
  if (available === 0) return { label: 'Habis', tone: 'invalid' }
  if (total && available / total < 0.15) return { label: `Sisa ${available} ${unit}`, tone: 'warn' }
  return { label: `Sisa ${available} ${unit}`, tone: 'valid' }
}

function dateLabelOf(e: EventSummary) {
  const realSessions = e.sessions.filter((s) => !s.demoLive)
  const sameDay = fmtDate(e.event.startAt, { day: 'numeric', month: 'short' }) === fmtDate(e.event.endAt, { day: 'numeric', month: 'short' })
  const day = sameDay ? fmtDate(e.event.startAt, { weekday: 'long', day: 'numeric', month: 'long' }) : `${fmtShortDate(e.event.startAt)} – ${fmtShortDate(e.event.endAt)}`
  return realSessions.length > 1 ? `${day} · ${realSessions.length} sesi` : day
}

/** Day and month on a small tile, as on a printed ticket stub. */
function DateTile({ iso, className }: { iso: string; className?: string }) {
  return (
    <span className={cn('flex w-14 flex-col items-center rounded-2xl bg-white py-1.5 text-ink shadow-md', className)}>
      <span className="text-xl leading-none font-extrabold tabular-nums">{fmtDate(iso, { day: 'numeric' })}</span>
      <span className="mt-0.5 text-[0.68rem] font-bold uppercase">{fmtDate(iso, { month: 'short' })}</span>
    </span>
  )
}

function FeaturedCard({ e, now }: { e: EventSummary; now: Date }) {
  const av = availabilityOf(e, now)
  const hasDemo = e.sessions.some((s) => s.demoLive)
  return (
    <Link
      to={`/app/e/${e.event.slug}`}
      className="group relative block animate-rise overflow-hidden rounded-[1.75rem] shadow-lg shadow-ink/10 transition-transform duration-200 active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <Poster theme={e.event.posterTheme} title={e.event.title} bare className="h-72 transition-transform duration-700 ease-(--ease-soft) group-hover:scale-[1.03]" />
      <div className="absolute inset-0 bg-linear-to-t from-ink/90 via-ink/35 to-transparent" aria-hidden />
      <span className="absolute top-4 left-4 rounded-full bg-brand-yellow px-3 py-1 text-[0.7rem] font-extrabold tracking-wide text-ink uppercase">
        Sorotan · {POSTER_THEMES[e.event.posterTheme].label}
      </span>
      <DateTile iso={e.event.startAt} className="absolute top-4 right-4" />
      <div className="absolute inset-x-0 bottom-0 p-5 text-white">
        <h2 className="text-2xl leading-tight font-extrabold text-balance">{e.event.title}</h2>
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-white/85">
          <MapPin className="size-4 shrink-0" aria-hidden /> {e.venue.name}
        </p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="flex flex-wrap gap-1.5 text-xs font-semibold">
            {av && <span className="rounded-full bg-white/15 px-2.5 py-1 ring-1 ring-white/20">{av.label}</span>}
            {hasDemo && <span className="rounded-full bg-white/15 px-2.5 py-1 ring-1 ring-white/20">Sesi demo juri</span>}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-base font-extrabold text-brand-yellow">
            {priceHint(e.categories)}
            <ArrowUpRight className="size-5 transition-transform duration-300 ease-(--ease-soft) group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  )
}

function EventCard({ e, now }: { e: EventSummary; now: Date }) {
  const av = availabilityOf(e, now)
  const methods = [...new Set(e.categories.map((c) => c.accessMethod))]
  const hasDemo = e.sessions.some((s) => s.demoLive)
  return (
    <Link
      to={`/app/e/${e.event.slug}`}
      className="group flex gap-3.5 rounded-[1.4rem] border bg-card p-3 shadow-xs transition hover:shadow-md active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="relative w-24 shrink-0 self-stretch overflow-hidden rounded-2xl">
        <Poster theme={e.event.posterTheme} title={e.event.title} bare className="absolute inset-0 transition-transform duration-500 ease-(--ease-soft) group-hover:scale-105" />
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="text-[0.7rem] font-bold tracking-wide text-brand uppercase">{POSTER_THEMES[e.event.posterTheme].label}</p>
        <h3 className="mt-0.5 leading-snug font-bold text-balance">{e.event.title}</h3>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5 shrink-0" aria-hidden /> {dateLabelOf(e)}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" aria-hidden /> {e.venue.name}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {e.event.infoOnly ? 'Tanpa tiket' : methods.map((m) => ACCESS_METHOD_LABEL[m]).join(' · ')}
          {hasDemo ? ' · Sesi demo juri' : ''}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-extrabold text-brand">{e.event.infoOnly ? 'Gratis' : priceHint(e.categories)}</span>
          {av && <StatusBadge tone={av.tone}>{av.label}</StatusBadge>}
        </div>
      </div>
    </Link>
  )
}
