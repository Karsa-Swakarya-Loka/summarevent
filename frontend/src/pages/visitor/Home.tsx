/**
 * Beranda (PV-01), laid out like an app's home: the SUMMABA stage with a greeting, the visitor's own status at a glance,
 * shortcuts to the ways in, highlights to swipe through, then every event with its filters. A first-time visitor is
 * sent through the onboarding first.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router'
import { Bell, CalendarDays, Hourglass, MapPin, MessageCircle, Ticket, UserRound } from 'lucide-react'
import { api } from '@/api'
import type { EventSummary } from '@/api/contract'
import { Countdown, EmptyState, StatusBadge } from '@/components/common/bits'
import { Illustration } from '@/components/common/Illustration'
import { Poster } from '@/components/common/Poster'
import { POSTER_THEMES } from '@/components/common/posterThemes'
import type { ArtName } from '@/components/stickers/Art'
import { Skeleton } from '@/components/ui/skeleton'
import { LoadError } from '@/components/visitor/Common'
import { StageScene } from '@/components/visitor/StageScene'
import { UserAvatar } from '@/components/visitor/UserAvatar'
import { continuePath, eventInRange, isPendingOrder, pendingTitle, placeUnit, priceHint, wibTodayRange, wibWeekRange } from '@/components/visitor/helpers'
import { useVisitor } from '@/components/visitor/hooks'
import { prefetchEvent, whenIdle } from '@/components/visitor/prefetch'
import type { Tone } from '@/domain/labels'
import type { User } from '@/domain/types'
import { useLive, useNow } from '@/hooks/useLive'
import { fmtDate, fmtShortDate } from '@/lib/format'
import { onboardingDone } from '@/lib/intro'
import { readSeen } from '@/lib/seen'
import { cn } from '@/lib/utils'

type When = 'ALL' | 'TODAY' | 'WEEK'
const WHEN: Array<{ key: When; label: string }> = [
  { key: 'ALL', label: 'Semua' },
  { key: 'TODAY', label: 'Hari ini' },
  { key: 'WEEK', label: 'Minggu ini' },
]

/** A status card's place in the row: two share the width, more scroll sideways. */
const CARD_SLOT = 'flex min-w-[9.75rem] flex-1 shrink-0 animate-rise'

/** "Rp300rb" */
const shortRupiah = (n: number) => (n % 1000 === 0 ? `Rp${n / 1000}rb` : `Rp${new Intl.NumberFormat('id-ID').format(n)}`)

export default function Home() {
  const { user } = useVisitor()
  const events = useLive(() => api.listEvents(), [])
  const orders = useLive(() => api.myOrders(), [user?.id])
  const tickets = useLive(() => (user ? api.myTickets() : Promise.resolve([])), [user?.id])
  const notes = useLive(() => (user ? api.myNotifications() : Promise.resolve([])), [user?.id])
  const [seen] = useState(readSeen)
  const [when, setWhen] = useState<When>('ALL')
  const [venue, setVenue] = useState<string | null>(null)
  const listRef = useRef<HTMLElement>(null)
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

  // the event pages, one by one while the phone is idle, so the first tap on a card opens a finished page
  const slugs = (events.data ?? []).map((e) => e.event.slug).join('|')
  useEffect(() => {
    if (!slugs) return
    const queue = slugs.split('|')
    let cancel = () => {}
    const next = () => {
      const slug = queue.shift()
      if (!slug) return
      prefetchEvent(slug)
      cancel = whenIdle(next)
    }
    cancel = whenIdle(next)
    return () => cancel()
  }, [slugs])

  if (!onboardingDone()) return <Navigate to="/app/mulai" replace />

  const all = events.data ?? []
  const pending = (orders.data ?? []).filter((d) => isPendingOrder(d.order) && !d.order.simulated)
  const activeTickets = (tickets.data ?? []).filter((t) => t.ticket.status === 'ACTIVE').length
  const unread = (notes.data ?? []).filter((n) => !n.scheduledFor && !seen.read.has(n.id)).length
  const today = wibTodayRange(now)
  const todaySessions = all.flatMap((e) => e.sessions).filter((s) => s.demoLive || (new Date(s.startAt) >= today.from && new Date(s.startAt) < today.to)).length
  const demo = all.find((e) => e.sessions.some((s) => s.demoLive))
  const demoSession = demo?.sessions.find((s) => s.demoLive)
  const free = all.find((e) => !e.event.infoOnly && e.categories.some((c) => c.accessMethod === 'FREE'))
  const receipt = all.find((e) => e.categories.some((c) => c.accessMethod === 'RECEIPT'))
  // a shortcut opens the seat map of the first regular session with its category already picked
  const shortcutTo = (e: EventSummary | undefined, access: 'FREE' | 'RECEIPT') => {
    const cat = e?.categories.find((c) => c.accessMethod === access)
    const session = e?.sessions.find((s) => !s.demoLive) ?? e?.sessions[0]
    return e && cat && session ? `/app/e/${e.event.slug}/s/${session.id}?c=${cat.id}` : e ? `/app/e/${e.event.slug}` : '/app'
  }
  const minSpend = receipt?.categories.find((c) => c.accessMethod === 'RECEIPT')?.receiptRules?.minSpend
  const spotlight = all.filter((e) => !e.event.infoOnly && e.sessions.some((s) => new Date(s.endAt) > now))

  const showToday = () => {
    setWhen('TODAY')
    setVenue(null)
    listRef.current?.scrollIntoView({ block: 'start' })
  }

  return (
    <div>
      {/* on a laptop the stage becomes a green band: the greeting on the left, the stage framed on the right; the
          avatar and the bell go, the top bar already has Akun and Pesan; on a short laptop the stage is smaller, so the
          shortcuts still show without scrolling */}
      <header className="relative h-[23.5rem] overflow-hidden text-white lg:h-auto lg:bg-brand">
        <div className="contents lg:mx-auto lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center lg:gap-12 lg:px-8 lg:pt-10 lg:pb-16 lg:[@media(max-height:760px)]:grid-cols-[minmax(0,1fr)_15rem] lg:[@media(max-height:760px)]:pt-6 lg:[@media(max-height:760px)]:pb-14">
          <div className="absolute inset-0 lg:relative lg:inset-auto lg:order-2 lg:aspect-[390/334] lg:overflow-hidden lg:rounded-[2rem] lg:shadow-xl lg:ring-1 lg:shadow-ink/30 lg:ring-white/15">
            <StageScene className="absolute inset-0 size-full lg:bottom-auto lg:h-auto lg:aspect-[390/376]" />
          </div>
          <div className="relative flex items-center gap-3 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] lg:px-0 lg:pt-0">
            {user && <Avatar user={user} />}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white/85 lg:text-xl">Selamat datang</p>
              <h1 className="truncate text-xl leading-tight font-extrabold lg:mt-3 lg:font-poster lg:text-[5.5rem] lg:leading-[0.92] lg:font-normal lg:text-balance lg:whitespace-normal lg:uppercase">
                {user ? user.name : 'Mau nonton apa?'}
              </h1>
            </div>
            <Link
              to="/app/inbox"
              aria-label={unread ? `Pesan, ${unread} belum dibaca` : 'Pesan'}
              className="relative grid size-11 shrink-0 place-items-center rounded-full bg-white text-ink shadow-md transition active:scale-90 lg:hidden"
            >
              <Bell className="size-5" aria-hidden />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-status-invalid px-1 text-[0.65rem] font-bold text-white ring-2 ring-white" aria-hidden>
                  {unread}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>

      {/* the visitor's own status, over the bottom of the stage */}
      <ul
        className="relative z-10 -mt-7 flex gap-3 overflow-x-auto px-4 pt-1 pb-3 [scrollbar-width:none] lg:mx-auto lg:-mt-10 lg:grid lg:max-w-6xl lg:auto-cols-fr lg:grid-flow-col lg:gap-4 lg:overflow-visible lg:px-8"
        aria-label="Ringkasan"
      >
        {pending.map((d) => (
          <li key={d.order.id} className={CARD_SLOT}>
            <StatusCard to={continuePath(d)} tint="orange" icon={<Hourglass />} label={pendingTitle(d, true)} value={<Countdown to={d.order.holdExpiresAt} className="[&_svg]:hidden" />} />
          </li>
        ))}
        <li className={cn(CARD_SLOT, '[animation-delay:60ms]')}>
          {user ? (
            <StatusCard to="/app/pass" tint="green" icon={<Ticket />} label="Tiket aktif" value={`${activeTickets} e‑ticket`} />
          ) : (
            <StatusCard to="/app/masuk" tint="green" icon={<UserRound />} label="Belum masuk" value="Masuk" />
          )}
        </li>
        <li className={cn(CARD_SLOT, '[animation-delay:120ms]')}>
          <StatusCard onClick={showToday} tint="yellow" icon={<CalendarDays />} label="Hari ini" value={`${todaySessions} sesi`} />
        </li>
        {user && (
          <li className={cn(CARD_SLOT, '[animation-delay:180ms]')}>
            <StatusCard to="/app/inbox" tint="blue" icon={<MessageCircle />} label="Pesan" value={unread ? `${unread} baru` : 'Tak ada yang baru'} />
          </li>
        )}
      </ul>

      <div className="space-y-8 px-4 pt-4 pb-4 lg:mx-auto lg:max-w-6xl lg:space-y-12 lg:px-8 lg:pt-10">
        {(demoSession || free || receipt) && (
          <section aria-labelledby="quick-title">
            <h2 id="quick-title" className="px-1 font-poster text-[1.9rem] leading-none uppercase">
              Pintasan
            </h2>
            <ul className="mt-3 divide-y overflow-hidden rounded-[1.4rem] bg-card shadow-xs lg:grid lg:grid-cols-3 lg:gap-4 lg:divide-y-0 lg:overflow-visible lg:rounded-none lg:bg-transparent lg:shadow-none">
              {demo && demoSession && (
                <QuickRow
                  to={`/app/e/${demo.event.slug}/s/${demoSession.id}`}
                  art="kursi"
                  tint="bg-brand-soft"
                  title="Pilih kursi sendiri"
                  sub="Sesi demo sedang berlangsung"
                  chip={
                    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-[#0b6b35]">
                      <span className="size-1.5 rounded-full bg-status-valid" aria-hidden /> Live
                    </span>
                  }
                />
              )}
              {free && <QuickRow to={shortcutTo(free, 'FREE')} art="gift" tint="bg-[#fff1e2]" title="Daftar gratis" sub={free.event.title} chip={<Chip>Gratis</Chip>} />}
              {receipt && (
                <QuickRow
                  to={shortcutTo(receipt, 'RECEIPT')}
                  art="notes"
                  tint="bg-[#fff7c7]"
                  title="Tukar struk"
                  sub={receipt.event.title}
                  // short enough that "Tukar struk" stays on one line on a 360 px phone
                  chip={minSpend ? <Chip>Min. {shortRupiah(minSpend)}</Chip> : null}
                />
              )}
            </ul>
          </section>
        )}

        {spotlight.length > 0 && (
          <section aria-labelledby="spot-title">
            <h2 id="spot-title" className="px-1 font-poster text-[1.9rem] leading-none uppercase">
              Sorotan
            </h2>
            <ul
              className="-mx-4 mt-3 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0"
              aria-label="Event sorotan"
            >
              {spotlight.map((e, i) => (
                <li key={e.event.id} className="w-[80%] max-w-[20rem] shrink-0 animate-rise snap-start lg:w-auto lg:max-w-none" style={{ animationDelay: `${Math.min(i, 4) * 70}ms` }}>
                  <SpotCard e={e} now={now} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section ref={listRef} aria-labelledby="event-list" className="scroll-mt-4 space-y-3">
          <h2 id="event-list" className="px-1 font-poster text-[1.9rem] leading-none uppercase">
            Semua event
          </h2>
          {/* on a laptop the two filters sit on one line */}
          <div className="space-y-3 lg:flex lg:flex-wrap lg:items-center lg:gap-3 lg:space-y-0">
            <WhenTabs value={when} onChange={setWhen} />
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0" role="group" aria-label="Filter venue">
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
            <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 xl:grid-cols-3">
              <Skeleton className="h-28 w-full rounded-[1.4rem]" />
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
            <ul className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 xl:grid-cols-3" aria-label="Daftar event">
              {list.map((e, i) => (
                <li key={e.event.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 5) * 60}ms` }}>
                  <EventCard e={e} now={now} today={when === 'TODAY'} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function Avatar({ user }: { user: User }) {
  return (
    <Link to="/app/akun" aria-label={`Akun ${user.name}`} className="shrink-0 rounded-full transition active:scale-90 lg:hidden">
      <UserAvatar user={user} className="size-11 text-lg ring-2 ring-white/40" />
    </Link>
  )
}

const TINT = {
  green: 'bg-brand-soft text-[#0b6b35]',
  orange: 'bg-[#fff1e2] text-[#b4480b]',
  yellow: 'bg-[#fff7c7] text-[#7a5600]',
  blue: 'bg-[#e8eefa] text-[#2d4c8f]',
} as const

/** A fact about the visitor on a small card: what it is, how it stands, one tap to it. */
function StatusCard({ to, onClick, tint, icon, label, value }: { to?: string; onClick?: () => void; tint: keyof typeof TINT; icon: ReactNode; label: string; value: ReactNode }) {
  const body = (
    <>
      <span className={cn('grid size-11 shrink-0 place-items-center rounded-full [&_svg]:size-5', TINT[tint])} aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="line-clamp-2 block leading-tight font-bold tabular-nums">{value}</span>
      </span>
    </>
  )
  const cls = 'flex w-full items-center gap-3 rounded-[1.4rem] bg-card p-3 shadow-[0_12px_28px_-16px_rgb(35_31_32/0.45)] transition active:scale-[0.97] lg:gap-4 lg:p-4'
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  )
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-bold">{children}</span>
}

/** A shortcut: its sticker, what it does, where, and a chip with the gist. */
function QuickRow({ to, art, tint, title, sub, chip }: { to: string; art: ArtName; tint: string; title: string; sub: string; chip?: ReactNode }) {
  return (
    <li>
      <Link to={to} className="flex min-h-20 items-center gap-3.5 px-3.5 py-3 transition active:bg-muted lg:h-full lg:rounded-[1.4rem] lg:bg-card lg:shadow-xs lg:hover:shadow-md">
        <span className={cn('grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl', tint)}>
          <Illustration name={art} loop={false} className="w-16 max-w-none" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{title}</span>
          <span className="line-clamp-2 block text-sm leading-snug text-muted-foreground">{sub}</span>
        </span>
        {chip}
      </Link>
    </li>
  )
}

/** Three filters with a pill that slides to the chosen one. */
function WhenTabs({ value, onChange }: { value: When; onChange: (w: When) => void }) {
  const index = WHEN.findIndex((w) => w.key === value)
  return (
    <div role="tablist" aria-label="Filter waktu" className="relative grid grid-cols-3 rounded-full bg-ink/[0.07] p-1 lg:w-[22rem] lg:shrink-0">
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-full bg-ink shadow-sm transition-transform duration-300 ease-(--ease-soft)"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {WHEN.map((w) => (
        <button
          key={w.key}
          type="button"
          role="tab"
          aria-selected={value === w.key}
          onClick={() => onChange(w.key)}
          className={cn('relative min-h-11 rounded-full text-sm font-semibold transition-colors duration-300', value === w.key ? 'text-white' : 'text-ink/70 hover:text-ink')}
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
        active ? 'border-ink bg-ink text-white' : 'bg-card text-foreground hover:border-foreground/30',
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
  const unit = placeUnit(e.categories)
  if (available === 0) return { label: 'Habis', tone: 'invalid' }
  if (total && available / total < 0.15) return { label: `Sisa ${available} ${unit}`, tone: 'warn' }
  return { label: `Sisa ${available} ${unit}`, tone: 'valid' }
}

function dateLabelOf(e: EventSummary, today = false) {
  // under "Hari ini" an event is listed for its session running today, so that is the date it shows
  const live = today ? e.sessions.find((s) => s.demoLive) : undefined
  if (live) return `Hari ini · ${live.label ?? 'Sesi demo'}`
  const realSessions = e.sessions.filter((s) => !s.demoLive)
  const sameDay = fmtDate(e.event.startAt, { day: 'numeric', month: 'short' }) === fmtDate(e.event.endAt, { day: 'numeric', month: 'short' })
  const day = sameDay ? fmtDate(e.event.startAt, { weekday: 'long', day: 'numeric', month: 'long' }) : `${fmtShortDate(e.event.startAt)} – ${fmtShortDate(e.event.endAt)}`
  return realSessions.length > 1 ? `${day} · ${realSessions.length} sesi` : day
}

/** Day and month on a small tile, as on a printed ticket stub. */
function DateTile({ iso, className }: { iso: string; className?: string }) {
  return (
    <span className={cn('flex w-14 flex-col items-center rounded-2xl bg-white py-1.5 text-ink shadow-md', className)}>
      <span className="font-poster text-xl leading-none tabular-nums">{fmtDate(iso, { day: 'numeric' })}</span>
      <span className="mt-0.5 text-[0.68rem] font-bold uppercase">{fmtDate(iso, { month: 'short' })}</span>
    </span>
  )
}

/** A highlight to swipe through: the poster, its date and price on top, the title in display type below. */
function SpotCard({ e, now }: { e: EventSummary; now: Date }) {
  const av = availabilityOf(e, now)
  return (
    <Link
      to={`/app/e/${e.event.slug}`}
      className="group relative block h-64 overflow-hidden rounded-[1.6rem] shadow-md shadow-ink/10 transition-transform duration-200 active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <Poster theme={e.event.posterTheme} palette={e.event.posterPalette} image={e.event.posterImage} title={e.event.title} bare className="absolute inset-0 transition-transform duration-700 ease-(--ease-soft) group-hover:scale-[1.04]" />
      <div className="absolute inset-0 bg-linear-to-t from-ink/90 via-ink/25 to-transparent" aria-hidden />
      <DateTile iso={e.event.startAt} className="absolute top-3 left-3" />
      <span className="absolute top-3 right-3 rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-ink shadow-md">{priceHint(e.categories)}</span>
      <div className="absolute inset-x-0 bottom-0 p-4 text-white">
        <p className="truncate text-xs font-semibold text-white/80">
          {POSTER_THEMES[e.event.posterTheme].label}
          {av ? ` · ${av.label}` : ''}
        </p>
        <h3 className="mt-1 line-clamp-3 font-poster text-[1.5rem] leading-[0.95] text-balance uppercase">{e.event.title}</h3>
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-white/85">
          <MapPin className="size-3.5 shrink-0" aria-hidden /> {e.venue.name}
        </p>
      </div>
    </Link>
  )
}

function EventCard({ e, now, today = false }: { e: EventSummary; now: Date; today?: boolean }) {
  const av = availabilityOf(e, now)
  return (
    <Link
      to={`/app/e/${e.event.slug}`}
      className="group flex gap-3.5 rounded-[1.4rem] bg-card p-3 shadow-xs transition hover:shadow-md active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none lg:h-full"
    >
      <div className="relative aspect-square w-28 shrink-0 self-start overflow-hidden rounded-2xl">
        <Poster theme={e.event.posterTheme} palette={e.event.posterPalette} image={e.event.posterImage} title={e.event.title} bare className="absolute inset-0 transition-transform duration-500 ease-(--ease-soft) group-hover:scale-105" />
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="text-xs font-semibold text-muted-foreground">{POSTER_THEMES[e.event.posterTheme].label}</p>
        <h3 className="mt-0.5 leading-snug font-bold text-balance">{e.event.title}</h3>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5 shrink-0" aria-hidden /> {dateLabelOf(e, today)}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" aria-hidden /> {e.venue.name}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-extrabold">{e.event.infoOnly ? 'Gratis' : priceHint(e.categories)}</span>
          {av && <StatusBadge tone={av.tone}>{av.label}</StatusBadge>}
        </div>
      </div>
    </Link>
  )
}
