import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { CalendarDays, CalendarSearch, ChevronRight, Hourglass, MapPin } from 'lucide-react'
import { api } from '@/api'
import type { EventSummary } from '@/api/contract'
import { CoBrand } from '@/components/common/Brand'
import { Countdown, DemoNotice, EmptyState, StatusBadge, SundaText } from '@/components/common/bits'
import { Poster } from '@/components/common/Poster'
import { Skeleton } from '@/components/ui/skeleton'
import { Chip, LoadError } from '@/components/visitor/Common'
import { continuePath, eventInRange, isPendingOrder, priceHint, seatRangeLabel, wibTodayRange, wibWeekRange } from '@/components/visitor/helpers'
import { useVisitor } from '@/components/visitor/hooks'
import { ACCESS_METHOD_LABEL, ORDER_STATUS_LABEL, type Tone } from '@/domain/labels'
import { useLive, useNow } from '@/hooks/useLive'
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

  const pending = (orders.data ?? []).filter((d) => isPendingOrder(d.order) && !d.order.simulated)

  return (
    <div>
      <header className="relative overflow-hidden rounded-b-[2rem] bg-brand px-4 pt-5 pb-7 text-white">
        <svg className="pointer-events-none absolute -top-10 -right-12 size-56 opacity-15" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="48" fill="none" stroke="#fedc01" strokeWidth="6" strokeDasharray="10 8" />
          <circle cx="50" cy="50" r="30" fill="#f9a61b" />
        </svg>
        <CoBrand tone="light" />
        <div className="mt-6">
          <SundaText k="welcome" size="lg" className="[&>span:first-child]:text-3xl" />
          <p className="mt-2 text-base font-semibold">{user ? `Halo, ${user.name.split(' ')[0]}!` : 'Halo!'} Mau nonton apa di SUMMABA?</p>
          <p className="mt-1 text-sm text-white/80">Pilih event, pilih kursimu langsung di denah, lalu terima e-ticket QR.</p>
        </div>
      </header>

      <div className="space-y-4 px-4 pt-4 pb-16">
        {pending.map((d) => (
          <Link
            key={d.order.id}
            to={continuePath(d)}
            className="flex items-center gap-3 rounded-2xl border border-status-warn/50 bg-status-warn/12 p-3 transition hover:bg-status-warn/20"
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

        <div className="space-y-2">
          <div role="tablist" aria-label="Filter waktu" className="grid grid-cols-3 rounded-xl bg-muted p-1">
            {WHEN.map((w) => (
              <button
                key={w.key}
                type="button"
                role="tab"
                aria-selected={when === w.key}
                onClick={() => setWhen(w.key)}
                className={cn(
                  'min-h-11 rounded-lg text-sm font-semibold transition',
                  when === w.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
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
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-72 w-full rounded-2xl" />
            ))}
          </div>
        ) : events.error && !events.data ? (
          <LoadError error={events.error} onRetry={events.reload} />
        ) : list.length === 0 ? (
          <EmptyState icon={<CalendarSearch />} title="Belum ada event di filter ini">
            {when === 'TODAY' ? 'Tidak ada event hari ini' : when === 'WEEK' ? 'Tidak ada event minggu ini' : 'Tidak ada event'}
            {venue ? ' di venue ini' : ''}. Coba pilih “Semua”.
          </EmptyState>
        ) : (
          <ul className="space-y-4" aria-label="Daftar event">
            {list.map((e) => (
              <li key={e.event.id}>
                <EventCard e={e} now={now} />
              </li>
            ))}
          </ul>
        )}

        <DemoNotice />
      </div>
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

function EventCard({ e, now }: { e: EventSummary; now: Date }) {
  const av = availabilityOf(e, now)
  const methods = [...new Set(e.categories.map((c) => c.accessMethod))]
  const realSessions = e.sessions.filter((s) => !s.demoLive)
  const hasDemo = e.sessions.some((s) => s.demoLive)
  const sameDay = fmtDate(e.event.startAt, { day: 'numeric', month: 'short' }) === fmtDate(e.event.endAt, { day: 'numeric', month: 'short' })
  const dateLabel = sameDay ? fmtDate(e.event.startAt, { weekday: 'long', day: 'numeric', month: 'long' }) : `${fmtShortDate(e.event.startAt)} – ${fmtShortDate(e.event.endAt)}`
  return (
    <Link
      to={`/app/e/${e.event.slug}`}
      className="group block overflow-hidden rounded-2xl border bg-card shadow-xs transition hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <Poster theme={e.event.posterTheme} title={e.event.title} compact className="h-36" />
      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="leading-snug font-bold text-balance">{e.event.title}</h3>
          {av && (
            <StatusBadge tone={av.tone} className="mt-0.5 shrink-0">
              {av.label}
            </StatusBadge>
          )}
        </div>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="size-4 shrink-0" aria-hidden />
          <span>
            {dateLabel}
            {realSessions.length > 1 ? ` · ${realSessions.length} sesi` : ''}
          </span>
        </p>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-4 shrink-0" aria-hidden />
          {e.venue.name}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap gap-1.5">
            {e.event.infoOnly ? (
              <Chip>Tanpa tiket</Chip>
            ) : (
              methods.map((m) => <Chip key={m}>{ACCESS_METHOD_LABEL[m]}</Chip>)
            )}
            {hasDemo && <Chip className="bg-brand-soft text-brand">Sesi demo juri</Chip>}
          </div>
          <span className="text-base font-extrabold text-brand">{e.event.infoOnly ? 'Gratis' : priceHint(e.categories)}</span>
        </div>
      </div>
    </Link>
  )
}
