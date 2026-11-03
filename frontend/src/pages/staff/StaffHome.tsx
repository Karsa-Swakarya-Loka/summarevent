import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { CalendarDays, LogOut, MapPin, ReceiptText, ScanLine, Search, Ticket } from 'lucide-react'
import { api, type EventSummary, type SessionSummary } from '@/api'
import { toast } from 'sonner'
import type { User } from '@/domain/types'
import { BrandLockup } from '@/components/common/Brand'
import { EmptyState, StatusBadge } from '@/components/common/bits'
import { scannableEvents, sessionName, sessionWindow, WINDOW_LABEL, type WindowState } from '@/components/staff/session'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { Tone } from '@/domain/labels'
import { errorMessage, useLive, useNow } from '@/hooks/useLive'
import { fmtDateTime, fmtRange, fmtShortDate, fmtTime } from '@/lib/format'
import { cn } from '@/lib/utils'

const WINDOW_TONE: Record<WindowState, Tone> = { NOT_YET: 'info', OPEN: 'valid', CLOSED: 'neutral' }

/** PT-01: pick the event and the session that is running, then scan or search. */
export default function StaffHome() {
  // StaffLayout only renders its pages for a signed-in petugas
  const [user, setUser] = useState(() => api.currentUser('STAFF'))
  const navigate = useNavigate()

  const events = useLive(() => api.listEvents(), [])
  const now = useNow(30_000)
  const [params, setParams] = useSearchParams()

  const list = scannableEvents(events.data ?? [])
  const fallback = list.find((e) => e.sessions.some((s) => s.demoLive)) ?? list[0]
  const selected = list.find((e) => e.event.id === params.get('event')) ?? fallback

  const firstName = user?.name.split(' (')[0] ?? 'Petugas'

  return (
    <div className="pb-24">
      <header className="bg-brand px-5 pt-5 pb-6 text-white">
        <div className="flex items-center justify-between gap-3">
          <BrandLockup inverted className="h-7" />
          <button
            type="button"
            onClick={() => {
              api.logout('STAFF')
              navigate('/staff/masuk', { replace: true })
            }}
            className="-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-white/85 hover:bg-white/10"
          >
            <LogOut className="size-4" aria-hidden /> Keluar
          </button>
        </div>
        <p className="mt-5 text-sm font-semibold text-white/80">Petugas check-in</p>
        <h1 className="text-2xl leading-tight font-extrabold">Halo, {firstName}</h1>
        <p className="mt-1 text-sm text-white/85">Pilih event dan sesi yang sedang berjalan, lalu mulai scan QR e-ticket.</p>
        <StaffSwitcher userId={user?.id ?? null} onSwitch={setUser} />
      </header>

      <div className="space-y-6 px-4 pt-5">
        {events.error && !events.data ? (
          <EmptyState title="Daftar event belum bisa dimuat" action={<Button className="h-11" onClick={events.reload}>Coba lagi</Button>}>
            {errorMessage(events.error)}
          </EmptyState>
        ) : !events.data ? (
          <div className="space-y-3" aria-busy="true" aria-label="Memuat event">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        ) : !selected ? (
          <EmptyState icon={<Ticket />} title="Belum ada event untuk di-scan">
            Event yang sudah dipublikasikan dan punya tiket akan muncul di sini.
          </EmptyState>
        ) : (
          <>
            <section aria-labelledby="pick-event">
              <h2 id="pick-event" className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
                1 · Event
              </h2>
              {list.length > 1 ? (
                <div role="radiogroup" aria-labelledby="pick-event" className="mt-2 space-y-2">
                  {list.map((e) => (
                    <EventOption
                      key={e.event.id}
                      summary={e}
                      checked={e.event.id === selected.event.id}
                      onSelect={() => setParams({ event: e.event.id }, { replace: true })}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-2">
                  <EventOption summary={selected} checked onSelect={() => undefined} />
                </div>
              )}
            </section>

            <section aria-labelledby="pick-session">
              <h2 id="pick-session" className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
                2 · Sesi
              </h2>
              <div className="mt-2 space-y-3">
                {sortSessions(selected, now).map((s) => (
                  <SessionCard key={s.id} summary={selected} session={s} now={now} />
                ))}
              </div>
            </section>

            <DeskReceiptsLink eventId={selected.event.id} />

            <p className="rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground">
              Tips demo: <b>Sesi Demo Juri</b> selalu sedang berlangsung, jadi scan bisa dicoba kapan saja. Di layar scan ada <b>Alat bantu demo</b> untuk mencoba tanpa HP kedua.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/** Demo: switch between staff accounts (AD-13) so "dipindai oleh …" shows different people. */
function StaffSwitcher({ userId, onSwitch }: { userId: string | null; onSwitch: (u: User) => void }) {
  const staff = useLive(() => api.staff.accounts(), [])
  const options = staff.data ?? []
  if (options.length < 2) return null
  return (
    <label className="mt-3 flex flex-col gap-1.5 text-xs font-semibold text-white/85 sm:flex-row sm:items-center sm:gap-2">
      Akun petugas (demo)
      <select
        value={userId ?? ''}
        onChange={(e) =>
          void api
            .demoLogin('STAFF', e.target.value)
            .then((u) => {
              onSwitch(u)
              toast(`Masuk sebagai ${u.name}.`)
            })
            .catch((err: unknown) => toast.error(errorMessage(err)))
        }
        className="h-11 w-full min-w-0 rounded-lg border border-white/30 bg-white/10 px-2 text-sm text-white sm:w-auto sm:flex-1"
      >
        {options.map((s) => (
          <option key={s.id} value={s.id} className="text-ink">
            {s.name}
          </option>
        ))}
      </select>
    </label>
  )
}

/** PT-06: receipts can also be checked at the desk against the paper original. */
function DeskReceiptsLink({ eventId }: { eventId: string }) {
  const pending = useLive(() => api.staff.listReceipts(eventId).then((r) => r.length), [eventId])
  return (
    <section aria-labelledby="desk-receipts">
      <h2 id="desk-receipts" className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
        3 · Struk di desk
      </h2>
      <Link
        to={`/staff/receipts?event=${eventId}`}
        className="mt-2 flex min-h-14 items-center gap-3 rounded-2xl border bg-card px-4 py-3 hover:bg-muted/60"
      >
        <ReceiptText className="size-5 shrink-0 text-brand" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-bold">Verifikasi struk di desk</span>
          <span className="block text-xs text-muted-foreground">Cocokkan struk kertas, lalu setujui atau minta revisi</span>
        </span>
        {!!pending.data && <StatusBadge tone="warn">{pending.data} menunggu</StatusBadge>}
      </Link>
    </section>
  )
}

function sortSessions(summary: EventSummary, now: Date): SessionSummary[] {
  const rank = (s: SessionSummary) => {
    if (s.demoLive) return 0
    const w = sessionWindow(s, summary.event.rules, now)
    return w.state === 'OPEN' ? 1 : w.state === 'NOT_YET' ? 2 : 3
  }
  return [...summary.sessions].sort((a, b) => rank(a) - rank(b) || a.startAt.localeCompare(b.startAt))
}

function EventOption({ summary, checked, onSelect }: { summary: EventSummary; checked: boolean; onSelect: () => void }) {
  const { event, venue } = summary
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        'flex min-h-14 w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left',
        checked ? 'border-brand ring-2 ring-brand/25' : 'hover:bg-muted/60',
      )}
    >
      <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border-2', checked ? 'border-brand' : 'border-muted-foreground/50')} aria-hidden>
        {checked && <span className="size-2.5 rounded-full bg-brand" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold leading-snug">{event.title}</span>
        <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5" aria-hidden />
            {fmtShortDate(event.startAt)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden />
            {venue.name}
          </span>
        </span>
      </span>
    </button>
  )
}

function SessionCard({ summary, session, now }: { summary: EventSummary; session: SessionSummary; now: Date }) {
  const w = sessionWindow(session, summary.event.rules, now)
  const s = w.session
  const live = !!session.demoLive || w.running
  const counter = useLive(() => api.staff.recentCheckins(session.id), [session.id])
  const windowText =
    w.state === 'NOT_YET'
      ? `Check-in dibuka ${fmtDateTime(w.open.toISOString())}`
      : w.state === 'OPEN'
        ? `Check-in dibuka sampai ${fmtTime(w.close.toISOString())} WIB`
        : `Check-in ditutup ${fmtDateTime(w.close.toISOString())}`

  return (
    <article
      className={cn('rounded-2xl border bg-card p-4', live && 'border-brand bg-brand-soft/50 ring-2 ring-brand/25')}
      aria-label={`${sessionName(s)}${live ? ', sedang berlangsung' : ''}`}
      data-session={session.id}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {live && <StatusBadge tone="brand">Sedang berlangsung</StatusBadge>}
        <StatusBadge tone={WINDOW_TONE[w.state]}>{WINDOW_LABEL[w.state]}</StatusBadge>
      </div>
      <h3 className="mt-2 text-lg leading-snug font-bold">{sessionName(s)}</h3>
      <p className="text-sm text-muted-foreground">
        {fmtShortDate(s.startAt)} · {fmtRange(s.startAt, s.endAt)}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{windowText}</span>
        <span className="font-semibold tabular-nums">{counter.data ? `Hadir ${counter.data.checkedIn} / ${counter.data.capacity}` : 'Hadir – / –'}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button asChild className="h-12 text-base" variant={w.state === 'OPEN' ? 'default' : 'secondary'}>
          <Link to={`/staff/scan/${session.id}`}>
            <ScanLine className="size-5" /> Mulai scan
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-12 text-base">
          <Link to={`/staff/search/${session.id}`}>
            <Search className="size-5" /> Cari manual
          </Link>
        </Button>
      </div>
    </article>
  )
}
