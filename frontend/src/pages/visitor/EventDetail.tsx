import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, CalendarDays, CircleCheck, Clock, DoorOpen, Gift, MapPin, Radio } from 'lucide-react'
import { api } from '@/api'
import type { EventDetail as EventDetailData, SessionSummary } from '@/api/contract'
import { SundaLabel } from '@/components/common/bits'
import { Poster } from '@/components/common/Poster'
import { CategoryLegend } from '@/components/seatmap/SeatLegend'
import { Button } from '@/components/ui/button'
import { BarActions, BottomBar, LoadError, PageSkeleton, SectionTitle } from '@/components/visitor/Common'
import { recallSession, rememberSession, sessionName } from '@/components/visitor/helpers'
import { ACCESS_METHOD_LABEL } from '@/domain/labels'
import { saleState } from '@/domain/rules'
import { useLive, useNow } from '@/hooks/useLive'
import { fmtDate, fmtRange, fmtShortDate, fmtTime, rupiahPlain } from '@/lib/format'
import { cn } from '@/lib/utils'

export default function EventDetail() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const q = useLive(() => api.getEvent(slug), [slug])
  const [picked, setPicked] = useState<string | null>(() => recallSession(slug))

  if (q.loading && !q.data) return <PageSkeleton hero />
  if (!q.data) return <LoadError error={q.error} onRetry={q.reload} />
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
  // real sessions first (chronological), the always-live demo session last
  const sessions = useMemo(
    () => [...d.sessions].sort((a, b) => Number(!!a.demoLive) - Number(!!b.demoLive) || a.startAt.localeCompare(b.startAt)),
    [d.sessions],
  )
  const fallback = sessions.find((s) => sessionOpen(d, s, now).open) ?? sessions[0]
  const selected = sessions.find((s) => s.id === picked && sessionOpen(d, s, now).open) ?? fallback
  const selOpen = selected ? sessionOpen(d, selected, now) : { open: false }
  const isReserved = event.seatingMode === 'RESERVED'

  const sameDay = fmtDate(event.startAt, { day: 'numeric', month: 'numeric' }) === fmtDate(event.endAt, { day: 'numeric', month: 'numeric' })
  const dateLabel = sameDay ? fmtDate(event.startAt) : `${fmtDate(event.startAt, { day: 'numeric', month: 'long' })} – ${fmtDate(event.endAt, { day: 'numeric', month: 'long', year: 'numeric' })}`

  return (
    <div>
      <div className="relative">
        <Poster theme={event.posterTheme} title={event.title} className="h-60" />
        <Link
          to="/app"
          aria-label="Kembali ke Beranda"
          className="absolute top-3 left-3 flex size-11 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur hover:bg-black/50"
        >
          <ArrowLeft className="size-5" />
        </Link>
      </div>

      <div className="space-y-6 px-4 pt-4">
        <header className="space-y-2">
          <h1 className="text-2xl leading-tight font-extrabold text-balance">{event.title}</h1>
          {event.subtitle && <p className="text-muted-foreground">{event.subtitle}</p>}
          <ul className="space-y-1.5 pt-1 text-sm">
            <li className="flex items-start gap-2">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <span>
                {dateLabel}
                {event.infoOnly && <> · {fmtRange(event.startAt, event.endAt)}</>}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <span>{venue.name}, Summarecon Mall Bandung</span>
            </li>
          </ul>
          <p className="pt-1 text-sm leading-relaxed">{event.description}</p>
        </header>

        {event.infoOnly ? (
          <section className="rounded-2xl bg-brand-soft p-4 text-sm">
            <p className="flex items-center gap-2 text-base font-bold text-brand">
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
              <div role="radiogroup" aria-labelledby="sesi-title" className="grid gap-2">
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
                        'relative flex min-h-16 flex-col gap-2 rounded-xl border bg-card p-3 text-left transition disabled:opacity-55',
                        active ? 'border-brand ring-2 ring-brand/30' : 'hover:border-foreground/30',
                        s.demoLive && !active && 'border-dashed',
                      )}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="flex items-start gap-3">
                          <span
                            className={cn('mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border-2', active ? 'border-brand' : 'border-input')}
                            aria-hidden
                          >
                            {active && <span className="size-2.5 rounded-full bg-brand" />}
                          </span>
                          <span>
                            <span className="block text-lg leading-tight font-extrabold tabular-nums">{fmtRange(s.startAt, s.endAt)}</span>
                            <span className="block text-xs text-muted-foreground">
                              {s.demoLive ? (
                                <span className="inline-flex items-center gap-1 font-semibold text-brand">
                                  <Radio className="size-3.5" aria-hidden /> Sesi demo juri · sedang berlangsung
                                </span>
                              ) : (
                                <>
                                  {sessionName(s)} · {fmtShortDate(s.startAt)}
                                </>
                              )}
                            </span>
                          </span>
                        </span>
                        <span className="text-right">
                          {st.open ? (
                            <>
                              <span className={cn('block text-lg leading-tight font-extrabold tabular-nums', s.available === 0 && 'text-status-invalid')}>
                                {s.available === 0 ? 'Habis' : s.available}
                              </span>
                              {s.available > 0 && <span className="block text-xs text-muted-foreground">sisa {isReserved ? 'kursi' : 'tempat'}</span>}
                            </>
                          ) : (
                            <span className="text-xs font-semibold text-muted-foreground">{st.reason}</span>
                          )}
                        </span>
                      </span>
                      <span className="block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <span className="block h-full rounded-full bg-brand/70" style={{ width: `${pct}%` }} />
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
                    <p key={c.id} className="mt-2 flex items-start gap-2 rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand">
                      <Gift className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>
                        <strong>Bonus {c.name}:</strong> {c.bonusDesc} untuk {c.bonusFirstN} tiket pertama tiap sesi
                        {left != null && <span className="font-semibold">{left > 0 ? ` · sisa ${left}` : ' · sudah habis'}</span>}
                      </span>
                    </p>
                  )
                })}
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {[...new Set(categories.map((c) => c.accessMethod))].map((m) => (
                  <li key={m}>
                    <span className="font-semibold text-foreground">{ACCESS_METHOD_LABEL[m]}:</span>{' '}
                    {m === 'PAID'
                      ? 'bayar lewat QRIS atau Virtual Account (simulasi).'
                      : m === 'RECEIPT'
                        ? 'gratis, tukar struk belanja di tenant SUMMABA.'
                        : 'gratis, cukup daftar.'}
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="syarat-title">
              <SectionTitle>
                <span id="syarat-title">Syarat</span>
              </SectionTitle>
              <ul className="space-y-2 rounded-2xl border bg-card p-4 text-sm">
                {terms(d).map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <CircleCheck className="mt-0.5 size-[18px] shrink-0 text-brand" aria-hidden />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>

      {!event.infoOnly ? (
        <BottomBar aboveNav>
          {selected && !selOpen.open && <p className="mb-2 text-center text-sm text-muted-foreground">{selOpen.reason}</p>}
          <BarActions>
            <Button className="h-14 flex-1 text-base" disabled={!selected || !selOpen.open} onClick={() => selected && onGo(selected.id)}>
              {selected && selected.available === 0 ? 'Lihat & ikut daftar tunggu' : isReserved ? 'Pilih kursi' : <SundaLabel k="join" />}
            </Button>
          </BarActions>
          {selected && (
            <p className="mt-1.5 flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3.5" aria-hidden /> {selected.demoLive ? 'Sesi demo juri' : `${sessionName(selected)}, ${fmtShortDate(selected.startAt)}`} · {fmtRange(selected.startAt, selected.endAt)}
            </p>
          )}
        </BottomBar>
      ) : (
        <div className="h-16" />
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
