import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react'
import { SectionCard } from '@/components/admin/AdminUi'
import { Poster } from '@/components/common/Poster'
import { Button } from '@/components/ui/button'
import { rowLetter } from '@/domain/rules'
import type { Venue } from '@/domain/types'
import { fmtDateTime, fmtShortDate } from '@/lib/format'
import { localInputToIso, wibIso } from '../lib'
import { accessSummary, capacityOf, seatCounts, STEPS, type Issue, type StepId, type WizardForm } from './model'

export function StepReview({ form, venues, issues, goTo }: { form: WizardForm; venues: Venue[]; issues: Issue[]; goTo: (s: StepId) => void }) {
  const venue = venues.find((v) => v.id === form.venueId)
  const errors = issues.filter((i) => !i.warning)
  const warnings = issues.filter((i) => i.warning)
  const counts = seatCounts(form.layout)
  const general = form.seatingMode === 'GENERAL'
  const stepLabel = (s: StepId) => STEPS.find((x) => x.id === s)?.label ?? s
  const L = form.layout

  return (
    <div className="flex flex-col gap-4">
      {errors.length > 0 ? (
        <div role="alert" className="rounded-xl border border-status-invalid/30 bg-status-invalid/5 p-4">
          <div className="mb-2 flex items-center gap-2 font-semibold text-[#a11b1b]">
            <AlertCircle className="size-5" aria-hidden /> {errors.length} hal perlu dilengkapi sebelum disimpan
          </div>
          <ul className="flex flex-col gap-2 text-sm">
            {errors.map((e, i) => (
              <li key={i} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <span>{e.message}</span>
                <Button type="button" variant="outline" size="sm" className="self-start sm:self-auto" onClick={() => goTo(e.step)}>
                  Perbaiki di {stepLabel(e.step)} <ArrowRight />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-status-valid/30 bg-status-valid/8 p-4 text-sm font-semibold text-[#0b6b35]">
          <CheckCircle2 className="size-5" aria-hidden /> Semua data lengkap. Event siap disimpan dan dipublikasikan.
        </div>
      )}
      {warnings.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-xl border border-status-warn/50 bg-status-warn/10 p-4 text-sm">
          {warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {w.message}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
          <Poster theme={form.posterTheme} title={form.title.trim() || 'Judul event'} className="aspect-[4/3] w-full" />
        </div>
        <SectionCard title={form.title.trim() || 'Tanpa judul'} description={form.subtitle.trim() || undefined}>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Venue</dt>
              <dd className="font-medium">
                {venue?.name ?? '–'} {venue && <span className="text-muted-foreground">(kapasitas {venue.capacity})</span>}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Mode kursi</dt>
              <dd className="font-medium">{general ? 'Tanpa nomor kursi' : 'Kursi bernomor'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Aturan</dt>
              <dd className="font-medium">
                Maks {form.rules.maxSeatsPerOrder} kursi/pesanan · tahan bayar {form.rules.paymentHoldMin} mnt · tahan struk {form.rules.receiptHoldMin} mnt
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Check-in</dt>
              <dd className="font-medium">
                Dibuka {form.rules.checkinOpenMin} mnt sebelum sesi · {form.rules.transferable ? 'bisa dipindahtangankan' : 'tidak dipindahtangankan'} · {form.rules.reentryAllowed ? 'boleh keluar-masuk' : 'sekali masuk'}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Kapasitas per sesi</dt>
              <dd className="text-xl font-extrabold tabular-nums">{capacityOf(form)} orang</dd>
            </div>
          </dl>
        </SectionCard>
      </div>

      <SectionCard title="Kategori tiket" actions={<Button variant="ghost" size="sm" onClick={() => goTo('kategori')}>Ubah</Button>}>
        <ul className="divide-y text-sm">
          {form.categories.map((c) => (
            <li key={c.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
              <span className="flex min-w-40 flex-1 items-center gap-2 font-semibold">
                <span className="size-3.5 rounded-[4px]" style={{ background: c.color }} aria-hidden />
                {c.name.trim() || 'Tanpa nama'}
              </span>
              <span className="min-w-36">{accessSummary(c)}</span>
              <span className="min-w-28 text-muted-foreground">{general || c.noSeat ? `Kuota ${Number.isFinite(c.quota) ? c.quota : '–'}/sesi` : `${counts.get(c.key) ?? 0} kursi`}</span>
              <span className="text-xs text-muted-foreground">Jual mulai {c.saleStart ? fmtDateTime(localInputToIso(c.saleStart)) : '–'}</span>
            </li>
          ))}
        </ul>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2">
        {!general && (
          <SectionCard title="Denah" actions={<Button variant="ghost" size="sm" onClick={() => goTo('denah')}>Ubah</Button>}>
            <p className="text-sm">
              {L.rows} baris (A–{L.rows > 0 ? rowLetter(Math.min(L.rows, 26) - 1) : '?'}) × {L.seatsPerRow} kursi
              {L.aisleAfter != null ? `, lorong setelah kursi ${L.aisleAfter}` : ', tanpa lorong'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {L.blocked.length} kursi tidak dijual · {L.priority.length} kursi prioritas difabel
            </p>
          </SectionCard>
        )}
        <SectionCard title={`Sesi (${form.sessions.length})`} actions={<Button variant="ghost" size="sm" onClick={() => goTo('sesi')}>Ubah</Button>}>
          <ul className="flex flex-col gap-1 text-sm">
            {form.sessions.map((s, i) => (
              <li key={s.key} className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{s.label.trim() || `Sesi ${i + 1}`}</span>
                <span className="text-muted-foreground">
                  {s.demoLive ? 'Selalu berlangsung (demo)' : s.date && s.start ? `${fmtShortDate(wibIso(s.date, s.start))}, ${s.start.replace(':', '.')}–${s.end.replace(':', '.')} WIB` : '–'}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  )
}
