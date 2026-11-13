import { useId, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { LogOut, ReceiptText, ScanLine, Search, Ticket } from 'lucide-react'
import { api, type EventSummary, type SessionSummary } from '@/api'
import { toast } from 'sonner'
import type { User } from '@/domain/types'
import { BrandLockup } from '@/components/common/Brand'
import { EmptyState, StatusBadge } from '@/components/common/bits'
import { DemoMenu } from '@/components/common/DemoMenu'
import { Illustration } from '@/components/common/Illustration'
import { Poster } from '@/components/common/Poster'
import { useMedia } from '@/components/admin/hooks'
import { clearOfflineManifests } from '@/components/staff/offline'
import { scannableEvents, sessionName, sessionWindow } from '@/components/staff/session'
import { SettingsRow } from '@/components/visitor/SettingsList'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { CHECKIN_WINDOW_LABEL, CHECKIN_WINDOW_TONE } from '@/domain/labels'
import { errorMessage, useLive, useNow } from '@/hooks/useLive'
import { fmtDateTime, fmtRange, fmtShortDate, fmtTime } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Section title: plain words, the same weight as the rest of the screen. */
function Heading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="px-1 text-lg leading-tight font-bold">
      {children}
    </h2>
  )
}

/** PT-01: pick the event and the session that is running, then scan or search. */
export default function StaffHome() {
  // StaffLayout only renders its pages for a signed-in petugas
  const [user, setUser] = useState(() => api.currentUser('STAFF'))
  const navigate = useNavigate()
  // on a laptop the sessions take the wide column and the rest stays beside them
  const wide = useMedia('(min-width: 1024px)')

  const events = useLive(() => api.listEvents(), [])
  const now = useNow(30_000)
  const [params, setParams] = useSearchParams()

  const list = scannableEvents(events.data ?? [])
  const fallback = list.find((e) => e.sessions.some((s) => s.demoLive)) ?? list[0]
  const selected = list.find((e) => e.event.id === params.get('event')) ?? fallback

  const firstName = user?.name.split(' (')[0] ?? 'Petugas'

  return (
    <div className="pb-24 lg:pb-12">
      <header className="relative overflow-hidden bg-brand px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-6 text-white lg:px-0 lg:py-5 lg:[@media(max-height:640px)]:py-3">
        <div className="seat-dots absolute inset-0 text-white/10" aria-hidden />
        <div className="relative lg:mx-auto lg:max-w-6xl lg:px-8">
        {/* on a laptop the top bar carries Demo and Keluar */}
        <div className="relative flex items-center gap-1 lg:hidden">
          <BrandLockup inverted className="mr-auto h-6 min-w-0" />
          {/* the demo shortcuts live in the bar, never floating over a session's Mulai scan */}
          <DemoMenu variant="bar" className="text-white hover:bg-white/10" />
          <button
            type="button"
            onClick={() => {
              api.logout('STAFF')
              clearOfflineManifests()
              navigate('/staff/masuk', { replace: true })
            }}
            className="-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-white/85 hover:bg-white/10"
          >
            <LogOut className="size-4" aria-hidden /> Keluar
          </button>
        </div>
        <div className="relative mt-4 flex items-end justify-between gap-2 lg:mt-0 lg:items-center">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white/80 lg:[@media(max-height:640px)]:sr-only">Petugas check-in</p>
            <h1 className="mt-1 font-poster text-[2.4rem] leading-[0.95] text-balance uppercase lg:text-[2.6rem] lg:[@media(max-height:640px)]:mt-0 lg:[@media(max-height:640px)]:text-[2.2rem]">Halo, {firstName}</h1>
          </div>
          <Illustration name="camera" className="-mb-3 w-24 shrink-0 lg:-my-2 lg:mr-6 lg:w-20 lg:[@media(max-height:640px)]:w-14" enter={0.15} />
        </div>
        </div>
      </header>

      <div className="space-y-6 px-4 pt-5 lg:mx-auto lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] lg:items-start lg:gap-x-8 lg:space-y-0 lg:px-8 lg:pt-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:[@media(max-height:640px)]:pt-4">
        {events.error && !events.data ? (
          <EmptyState title="Daftar event belum bisa dimuat" action={<Button className="h-11" onClick={events.reload}>Coba lagi</Button>}>
            {errorMessage(events.error)}
          </EmptyState>
        ) : !events.data ? (
          <div className="space-y-3" role="status" aria-busy="true" aria-label="Memuat event">
            <Skeleton className="h-20 rounded-[1.4rem]" />
            <Skeleton className="h-48 rounded-[1.4rem]" />
            <Skeleton className="h-48 rounded-[1.4rem]" />
          </div>
        ) : !selected ? (
          <EmptyState icon={<Ticket />} title="Belum ada event untuk di-scan">
            Event yang sudah dipublikasikan dan punya tiket akan muncul di sini.
          </EmptyState>
        ) : (
          <>
            <div className="space-y-6">
            <section aria-labelledby="pick-event" className="space-y-2.5">
              <Heading id="pick-event">Pilih event</Heading>
              <div role="radiogroup" aria-labelledby="pick-event" className="divide-y overflow-hidden rounded-[1.4rem] bg-card shadow-xs">
                {list.map((e) => (
                  <EventOption key={e.event.id} summary={e} checked={e.event.id === selected.event.id} onSelect={() => setParams({ event: e.event.id }, { replace: true })} />
                ))}
              </div>
            </section>

            {wide && <DeskReceiptsLink eventId={selected.event.id} />}
            {wide && <DemoNote user={user} onSwitch={setUser} />}
            </div>

            <section aria-labelledby="pick-session" className="space-y-2.5 lg:col-start-2 lg:row-start-1">
              <Heading id="pick-session">Pilih sesi</Heading>
              <div className="space-y-3 lg:grid lg:grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] lg:gap-4 lg:space-y-0">
                {sortSessions(selected, now).map((s) => (
                  <SessionCard key={s.id} summary={selected} session={s} now={now} />
                ))}
              </div>
            </section>

            {!wide && <DeskReceiptsLink eventId={selected.event.id} />}
            {!wide && <DemoNote user={user} onSwitch={setUser} />}
          </>
        )}
      </div>
    </div>
  )
}

/** Everything only a judge needs, together: the always-open session, the scan tools, another petugas. */
function DemoNote({ user, onSwitch }: { user: User | null; onSwitch: (u: User) => void }) {
  return (
    <section aria-label="Uji coba" className="rounded-2xl bg-accent px-4 py-3 text-sm text-accent-foreground">
      <p>
        Uji coba: <b>Sesi Hari Ini</b> selalu berlangsung, dan di layar scan ada <b>Alat uji</b> untuk mencoba tanpa HP kedua.
      </p>
      <StaffSwitcher userId={user?.id ?? null} onSwitch={onSwitch} />
    </section>
  )
}

/** Demo: switch between staff accounts (AD-13) so "dipindai oleh …" shows different people. Kept with the other demo help. */
function StaffSwitcher({ userId, onSwitch }: { userId: string | null; onSwitch: (u: User) => void }) {
  const staff = useLive(() => api.staff.accounts(), [])
  const options = staff.data ?? []
  const id = useId()
  if (options.length < 2) return null
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.7rem] font-bold tracking-[0.18em] uppercase">
        Ganti akun petugas
      </label>
      <Select
        value={userId ?? ''}
        onValueChange={(v) =>
          void api
            .demoLogin('STAFF', v)
            .then((u) => {
              onSwitch(u)
              toast(`Masuk sebagai ${u.name}.`)
            })
            .catch((err: unknown) => toast.error(errorMessage(err)))
        }
      >
        <SelectTrigger id={id} className="w-full min-w-0 rounded-full border-ink/15 bg-card px-4 font-semibold text-ink data-[size=default]:h-11">
          <SelectValue placeholder="Pilih akun petugas" />
        </SelectTrigger>
        <SelectContent position="popper">
          {options.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** PT-06: receipts can also be checked at the desk against the paper original. */
function DeskReceiptsLink({ eventId }: { eventId: string }) {
  const pending = useLive(() => api.staff.listReceipts(eventId).then((r) => r.length), [eventId])
  const n = pending.data ?? 0
  return (
    <section aria-labelledby="desk-receipts" className="space-y-2.5">
      <Heading id="desk-receipts">Struk di desk</Heading>
      <ul className="overflow-hidden rounded-[1.4rem] bg-card shadow-xs">
        <SettingsRow
          icon={<ReceiptText />}
          tint={n ? 'bg-[#ffe7a3] text-ink' : 'bg-muted text-ink'}
          title="Verifikasi struk"
          sub={pending.error && pending.data === undefined ? 'Antrean belum bisa dimuat, buka untuk mencoba lagi' : pending.data === undefined ? 'Memuat antrean…' : n ? `${n} struk menunggu keputusan` : 'Belum ada struk yang menunggu'}
          to={`/staff/receipts?event=${eventId}`}
        />
      </ul>
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
    <button type="button" role="radio" aria-checked={checked} onClick={onSelect} className={cn('flex min-h-16 w-full items-center gap-3 px-3.5 py-3 text-left transition active:bg-muted', checked && 'bg-muted/50')}>
      <Poster theme={event.posterTheme} palette={event.posterPalette} image={event.posterImage} title={event.title} bare className="h-11 w-16 shrink-0 rounded-xl" />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 font-bold leading-snug">{event.title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {fmtShortDate(event.startAt)} · {venue.name}
        </span>
      </span>
      <span className={cn('grid size-6 shrink-0 place-items-center rounded-full border-2 transition', checked ? 'border-ink' : 'border-muted-foreground/40')} aria-hidden>
        {checked && <span className="size-3 rounded-full bg-ink" />}
      </span>
    </button>
  )
}

function SessionCard({ summary, session, now }: { summary: EventSummary; session: SessionSummary; now: Date }) {
  const w = sessionWindow(session, summary.event.rules, now)
  const s = w.session
  const live = !!session.demoLive || w.running
  const counter = useLive(() => api.staff.recentCheckins(session.id), [session.id])
  const pct = counter.data?.capacity ? Math.min(100, Math.round((counter.data.checkedIn / counter.data.capacity) * 100)) : 0
  const windowText =
    w.state === 'NOT_YET'
      ? `Dibuka ${fmtDateTime(w.open.toISOString())}`
      : w.state === 'OPEN'
        ? `Sampai ${fmtTime(w.close.toISOString())} WIB`
        : `Ditutup ${fmtDateTime(w.close.toISOString())}`

  return (
    <article className={cn('overflow-hidden rounded-[1.4rem] bg-card shadow-xs', live && 'ring-2 ring-ink')} aria-label={`${sessionName(s)}${live ? ', sedang berlangsung' : ''}`} data-session={session.id}>
      <div className={cn('flex flex-wrap items-center gap-1.5 px-4 pt-3', live && 'seat-dots bg-brand-soft py-2.5 text-brand/25')}>
        {live && <StatusBadge tone="brand">Sedang berlangsung</StatusBadge>}
        <StatusBadge tone={CHECKIN_WINDOW_TONE[w.state]}>{CHECKIN_WINDOW_LABEL[w.state]}</StatusBadge>
      </div>
      <div className="p-4 pt-3">
        <h3 className="font-poster text-[1.7rem] leading-[0.95] text-balance uppercase">{sessionName(s)}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {fmtShortDate(s.startAt)} · {fmtRange(s.startAt, s.endAt)}
        </p>
        <div className="mt-3 rounded-2xl bg-muted/60 px-3.5 py-3">
          <div className="flex items-end justify-between gap-3">
            <p className="leading-none">
              <span className="block text-sm font-semibold text-muted-foreground">Hadir</span>
              <span className="mt-1 block font-poster text-3xl tabular-nums" data-testid="home-attendance">
                {counter.data ? counter.data.checkedIn : '–'}
                <span className="font-sans text-sm font-semibold text-muted-foreground"> dari {counter.data ? counter.data.capacity : '–'} tiket</span>
              </span>
            </p>
            <p className="max-w-[55%] text-right text-xs text-muted-foreground">{windowText}</p>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-ink/10" aria-hidden>
            <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
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
      </div>
    </article>
  )
}
