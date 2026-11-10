import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { CalendarDays, ChevronDown, ChevronLeft, CircleCheck, Clock, DoorOpen, Gift, MapPin, Radio } from 'lucide-react'
import { api } from '@/api'
import type { EventDetail as EventDetailData, SessionSummary } from '@/api/contract'
import { BackHeader } from '@/components/common/bits'
import { DemoMenu } from '@/components/common/DemoMenu'
import { Poster } from '@/components/common/Poster'
import { POSTER_THEMES } from '@/components/common/posterThemes'
import { CategoryLegend } from '@/components/seatmap/SeatLegend'
import { Button } from '@/components/ui/button'
import { BottomBar, LoadError, PageSkeleton, SectionTitle } from '@/components/visitor/Common'
import { placeUnit, priceHint, recallSession, rememberSession, sessionName } from '@/components/visitor/helpers'
import { saleState } from '@/domain/rules'
import { useLive, useNow } from '@/hooks/useLive'
import { fmtDate, fmtRange, fmtShortDate, fmtTime, rupiahPlain } from '@/lib/format'
import { useBack } from '@/lib/navStack'
import { cn } from '@/lib/utils'

export default function EventDetail() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const q = useLive(() => api.getEvent(slug), [slug])
  const [picked, setPicked] = useState<string | null>(() => recallSession(slug))

  if (q.loading && !q.data) return <PageSkeleton hero />
  if (!q.data) {
    return (
      <div>
        <BackHeader to="/app" title="Event" />
        <LoadError error={q.error} onRetry={q.reload} />
      </div>
    )
  }
  const d = q.data

  return <Detail d={d} picked={picked} onPick={(id) => {
    setPicked(id)
    rememberSession(slug, id)
  }} onGo={(id) => navigate(`/app/e/${slug}/s/${id}`)} />
}

function sessionOpen(d: EventDetailData, s: SessionSummary, now: Date): { open: boolean; reason?: string } {
  if (new Date(s.endAt) <= now) return { open: false, reason: 'Sesi sudah selesai' }
  const states = d.categories.map((c) => saleState(c, s, now))
  if (states.some((x) => x.open)) return { open: true }
  const first = states[0]
  if (first && !first.open && first.reason === 'NOT_YET') return { open: false, reason: `Dibuka ${fmtShortDate(first.at.toISOString())} ${fmtTime(first.at.toISOString())}` }
  return { open: false, reason: 'Penjualan ditutup' }
}

function Detail({ d, picked, onPick, onGo }: { d: EventDetailData; picked: string | null; onPick: (id: string) => void; onGo: (id: string) => void }) {
  const { event, venue, categories } = d
  const now = useNow(30_000)
  const back = useBack('/app')
  // real sessions first (chronological), the always-live demo session last
  const sessions = useMemo(
    () => [...d.sessions].sort((a, b) => Number(!!a.demoLive) - Number(!!b.demoLive) || a.startAt.localeCompare(b.startAt)),
    [d.sessions],
  )
  const fallback = sessions.find((s) => sessionOpen(d, s, now).open) ?? sessions[0]
  const selected = sessions.find((s) => s.id === picked && sessionOpen(d, s, now).open) ?? fallback
  const selOpen = selected ? sessionOpen(d, selected, now) : { open: false }
  const isReserved = event.seatingMode === 'RESERVED'
  const [more, setMore] = useState(false)
  const longText = event.description.length > 160

  // the app bar sits clear over the poster, and turns solid with the title once the poster has scrolled away
  const hero = useRef<HTMLDivElement>(null)
  const [pastHero, setPastHero] = useState(false)
  useEffect(() => {
    const el = hero.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setPastHero(!e.isIntersecting), { rootMargin: '-56px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const sameDay = fmtDate(event.startAt, { day: 'numeric', month: 'numeric' }) === fmtDate(event.endAt, { day: 'numeric', month: 'numeric' })
  const dateLabel = sameDay ? fmtDate(event.startAt) : `${fmtDate(event.startAt, { day: 'numeric', month: 'long' })} – ${fmtDate(event.endAt, { day: 'numeric', month: 'long', year: 'numeric' })}`
  const list = terms(d)

  return (
    <div className="flex flex-1 flex-col">
      <div className="sticky top-0 z-30 h-0">
        <div
          className={cn(
            'flex min-h-14 items-center gap-1 px-1.5 pt-[env(safe-area-inset-top)] transition-[background-color,box-shadow] duration-200',
            pastHero ? 'bg-background/90 shadow-[0_1px_0_rgb(0_0_0/0.08)] backdrop-blur-xl' : 'bg-transparent',
          )}
        >
          <button
            type="button"
            onClick={back}
            aria-label="Kembali"
            className={cn('flex size-11 shrink-0 items-center justify-center rounded-full transition active:scale-90', pastHero ? 'active:bg-muted' : 'bg-black/35 text-white backdrop-blur')}
          >
            <ChevronLeft className="size-6" />
          </button>
          <p aria-hidden className={cn('min-w-0 flex-1 truncate font-semibold transition-opacity duration-200', pastHero ? 'opacity-100' : 'opacity-0')}>
            {event.title}
          </p>
          <DemoMenu variant="bar" className={cn(!pastHero && 'bg-black/35 text-white backdrop-blur hover:bg-black/45')} />
        </div>
      </div>

      <div ref={hero} className="relative">
        <Poster theme={event.posterTheme} palette={event.posterPalette} title={event.title} bare className="h-64" />
        <div className="absolute inset-0 bg-linear-to-b from-black/25 via-transparent to-transparent" aria-hidden />
      </div>

      {/* the page itself rides up over the poster like a sheet */}
      <div className="relative -mt-7 flex-1 space-y-6 rounded-t-[1.75rem] bg-background px-4 pt-6 pb-6">
        <header>
          <p className="text-[0.7rem] font-bold tracking-[0.18em] text-muted-foreground uppercase">{POSTER_THEMES[event.posterTheme].label}</p>
          <h1 className="mt-1.5 font-poster text-[2.6rem] leading-[0.92] text-balance uppercase">{event.title}</h1>
          {event.subtitle && <p className="mt-1 text-muted-foreground">{event.subtitle}</p>}
          <ul className="mt-4 divide-y overflow-hidden rounded-[1.4rem] bg-card text-sm shadow-xs">
            <li className="flex min-h-12 items-center gap-3 px-3.5 py-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink/[0.06]">
                <CalendarDays className="size-4" aria-hidden />
              </span>
              <span>
                {dateLabel}
                {event.infoOnly && <> · {fmtRange(event.startAt, event.endAt)}</>}
              </span>
            </li>
            <li className="flex min-h-12 items-center gap-3 px-3.5 py-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink/[0.06]">
                <MapPin className="size-4" aria-hidden />
              </span>
              <span>{venue.name}, Summarecon Mall Bandung</span>
            </li>
          </ul>
          <p className={cn('mt-4 text-[0.95rem] leading-relaxed text-foreground/85', longText && !more && 'line-clamp-3')}>{event.description}</p>
          {longText && (
            <button type="button" onClick={() => setMore((m) => !m)} className="-ml-1 inline-flex min-h-11 items-center px-1 text-sm font-bold underline underline-offset-4" aria-expanded={more}>
              {more ? 'Tampilkan lebih sedikit' : 'Selengkapnya'}
            </button>
          )}
        </header>

        {event.infoOnly ? (
          <section className="rounded-[1.4rem] bg-[#ffe7a3] p-4 text-sm">
            <p className="flex items-center gap-2 text-base font-bold">
              <DoorOpen className="size-5" aria-hidden /> Masuk bebas, tanpa tiket
            </p>
            <p className="mt-1 text-foreground/80">Datang kapan saja selama jam buka mal. Tidak perlu daftar atau pilih kursi.</p>
          </section>
        ) : (
          <>
            <section aria-labelledby="sesi-title">
              <SectionTitle>
                <span id="sesi-title">Pilih sesi</span>
              </SectionTitle>
              <div role="radiogroup" aria-labelledby="sesi-title" className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto px-4 pt-0.5 pb-1.5 [scrollbar-width:none]">
                {sessions.map((s) => {
                  const st = sessionOpen(d, s, now)
                  const active = selected?.id === s.id
                  const pct = s.total ? Math.round(((s.total - s.available) / s.total) * 100) : 0
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={!st.open}
                      onClick={() => onPick(s.id)}
                      className={cn(
                        'w-44 shrink-0 snap-start rounded-2xl border bg-card p-3 text-left transition active:scale-[0.97] disabled:opacity-55',
                        active ? 'border-ink ring-1 ring-ink' : 'hover:border-foreground/30',
                        s.demoLive && !active && 'border-dashed',
                      )}
                    >
                      <span className="block text-[1.05rem] leading-tight font-extrabold tabular-nums">{fmtRange(s.startAt, s.endAt)}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {s.demoLive ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-[#c2410c]">
                            <Radio className="size-3.5" aria-hidden /> Sesi demo
                          </span>
                        ) : (
                          <>
                            {sessionName(s)} · {fmtShortDate(s.startAt)}
                          </>
                        )}
                      </span>
                      <span className="mt-2.5 flex items-baseline justify-between gap-2 text-xs">
                        {st.open ? (
                          <span className={cn('font-bold', s.available === 0 ? 'text-[#a11b1b]' : 'text-foreground')}>
                            {s.available === 0 ? 'Habis' : `Sisa ${s.available} ${placeUnit(categories)}`}
                          </span>
                        ) : (
                          <span className="font-semibold text-muted-foreground">{st.reason}</span>
                        )}
                      </span>
                      <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
                        <span className="block h-full rounded-full bg-ink/70" style={{ width: `${pct}%` }} />
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>

            <section aria-labelledby="kat-title">
              <SectionTitle right={selected && <span className="text-xs text-muted-foreground">Sisa untuk {selected.demoLive ? 'sesi demo' : fmtTime(selected.startAt)}</span>}>
                <span id="kat-title">Kategori & harga</span>
              </SectionTitle>
              <CategoryLegend categories={categories} availability={selected?.availability} className="grid-cols-1" />
              {categories
                .filter((c) => c.bonusFirstN && c.bonusDesc)
                .map((c) => {
                  const left = selected?.availability.find((a) => a.categoryId === c.id)?.bonusLeft
                  return (
                    <p key={c.id} className="mt-2 flex items-start gap-2 rounded-xl bg-[#ffe7a3] px-3 py-2.5 text-sm">
                      <Gift className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>
                        <strong>Bonus {c.name}:</strong> {c.bonusDesc} untuk {c.bonusFirstN} tiket pertama tiap sesi
                        {left != null && <span className="font-semibold">{left > 0 ? ` · sisa ${left}` : ' · sudah habis'}</span>}
                      </span>
                    </p>
                  )
                })}
            </section>

            <details className="group rounded-[1.4rem] bg-card shadow-xs">
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 font-bold [&::-webkit-details-marker]:hidden">
                <CircleCheck className="size-5 shrink-0" aria-hidden />
                <span className="flex-1">Syarat & ketentuan</span>
                <span className="text-xs font-semibold text-muted-foreground">{list.length} poin</span>
                <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" aria-hidden />
              </summary>
              <ul className="space-y-2 border-t px-4 py-3.5 text-sm">
                {list.map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink/40" aria-hidden />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </div>

      {!event.infoOnly && (
        <BottomBar>
          {selected && !selOpen.open && <p className="mb-2 text-center text-sm text-muted-foreground">{selOpen.reason}</p>}
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                <Clock className="size-3.5 shrink-0" aria-hidden />
                {selected ? `${sessionName(selected)} · ${fmtRange(selected.startAt, selected.endAt)}` : 'Pilih sesi dulu'}
              </p>
              <p className="truncate text-lg font-extrabold">{priceHint(categories)}</p>
            </div>
            <Button className="h-14 shrink-0 px-6 text-base" disabled={!selected || !selOpen.open} onClick={() => selected && onGo(selected.id)}>
              {selected && selected.available === 0 ? 'Lihat & ikut daftar tunggu' : isReserved ? 'Pilih kursi' : 'Pilih tiket'}
            </Button>
          </div>
        </BottomBar>
      )}
    </div>
  )
}

/** "Syarat" checklist derived from the event rules and the receipt rules (PRD §9). */
function terms(d: EventDetailData): string[] {
  const { rules } = d.event
  const methods = new Set(d.categories.map((c) => c.accessMethod))
  const out: string[] = []
  const unit = d.event.seatingMode === 'RESERVED' ? 'kursi' : 'orang'
  out.push(`Maksimal ${rules.maxSeatsPerOrder} ${unit} per pesanan, satu e-ticket QR per ${unit === 'kursi' ? 'kursi' : 'orang'}.`)
  if (methods.has('PAID') || methods.has('FREE')) out.push(`${unit === 'kursi' ? 'Kursi' : 'Tempat'} ditahan ${rules.paymentHoldMin} menit untuk ${methods.has('PAID') ? 'bayar' : 'konfirmasi'}.`)
  if (methods.has('RECEIPT')) out.push(`${unit === 'kursi' ? 'Kursi' : 'Tempat'} ditahan ${rules.receiptHoldMin} menit selama struk diverifikasi panitia.`)
  out.push(`Check-in dibuka ${rules.checkinOpenMin} menit sebelum mulai${rules.checkinCloseMin === 0 ? ', ditutup saat sesi selesai' : ''}.`)
  out.push(rules.transferable ? 'Tiket boleh dipindahtangankan.' : 'Tiket tidak bisa dipindahtangankan dan hanya berlaku di sesi yang tertulis.')
  if (!rules.reentryAllowed) out.push('Tidak bisa keluar-masuk setelah check-in.')
  const receiptCat = d.categories.find((c) => c.accessMethod === 'RECEIPT' && c.receiptRules)
  const rr = receiptCat?.receiptRules
  if (rr) {
    const pre = d.categories.filter((c) => c.accessMethod === 'RECEIPT').length > 1 || d.categories.length > 1 ? `${receiptCat.name}: ` : ''
    out.push(`${pre}belanja minimal ${rupiahPlain(rr.minSpend)} di tenant SUMMABA${rr.allowMultiple ? '' : ' (tidak berlaku kelipatan)'}.`)
    out.push(`${pre}struk ${rr.sameDayRequired ? 'tanggal hari ini' : ''} sebelum jam ${rr.cutoffTime.replace(':', '.')}.`.replace('  ', ' '))
    out.push(`${pre}maksimal ${rr.maxReceiptsCombined} struk digabung, satu struk hanya bisa dipakai sekali.`)
    const excluded = rr.excludedTenantIds.map((id) => d.tenants.find((t) => t.id === id)?.name).filter(Boolean)
    if (excluded.length) out.push(`${pre}struk dari ${excluded.join(', ')} tidak berlaku.`)
  }
  return out.map((t) => t.charAt(0).toUpperCase() + t.slice(1))
}
