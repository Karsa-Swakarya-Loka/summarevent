/**
 * Panitia dashboard (AD-08 / AD-09): registrants, tickets, revenue, receipts,
 * attendance per session with venue occupancy, charts and CSV export.
 */
import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowRight, Banknote, Download, FileSpreadsheet, ReceiptText, Rows3, Ticket, Users, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import type { SessionStats } from '@/api/contract'
import { EventSelect, KpiTile, LiveIndicator, LoadError, PageHeader, SectionCard } from '@/components/admin/AdminUi'
import { CategoryChart, StatusChart, TenantChart } from '@/components/admin/charts'
import { downloadEventCsv, pickEventId, ticketedEvents } from '@/components/admin/lib'
import { StatusBadge } from '@/components/common/bits'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SEAT_STATUS_LABEL, type Tone } from '@/domain/labels'
import { errorMessage, useLive } from '@/hooks/useLive'
import { fmtRange, fmtShortDate, rupiahPlain } from '@/lib/format'
import { cn } from '@/lib/utils'

function occupancy(pct: number): { tone: Tone; label: string; bar: string } {
  if (pct >= 90) return { tone: 'invalid', label: 'Hampir penuh', bar: 'bg-status-invalid' }
  if (pct >= 70) return { tone: 'warn', label: 'Mulai padat', bar: 'bg-status-warn' }
  return { tone: 'valid', label: 'Aman', bar: 'bg-status-valid' }
}

function SessionCard({ s, eventId }: { s: SessionStats; eventId: string }) {
  const occ = occupancy(s.occupancyPct)
  const soldPct = s.capacity ? Math.round((s.sold / s.capacity) * 100) : 0
  const stats = [
    { label: 'Kapasitas', value: s.capacity },
    { label: SEAT_STATUS_LABEL.SOLD, value: s.sold },
    { label: SEAT_STATUS_LABEL.HELD, value: s.held },
    { label: 'Hadir', value: s.checkedIn },
  ]
  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="line-clamp-2 font-bold">{s.session.label ?? 'Sesi'}</div>
          <div className="text-xs text-muted-foreground">
            {s.session.demoLive ? 'Selalu berlangsung (demo juri)' : `${fmtShortDate(s.session.startAt)} · ${fmtRange(s.session.startAt, s.session.endAt)}`}
          </div>
        </div>
        {s.session.demoLive && <StatusBadge tone="brand">Demo</StatusBadge>}
      </div>
      <dl className="grid grid-cols-4 gap-2">
        {stats.map((x) => (
          <div key={x.label} className="flex min-w-0 flex-col justify-end">
            <dt className="text-[0.7rem] leading-tight text-muted-foreground">{x.label}</dt>
            <dd className="text-xl font-extrabold tabular-nums">{x.value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Tiket terjual</span>
          <span className="font-semibold tabular-nums">{soldPct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, soldPct)}%` }} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">Okupansi venue (hadir ÷ kapasitas)</span>
          <StatusBadge tone={occ.tone}>
            {s.occupancyPct}% · {occ.label}
          </StatusBadge>
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className={cn('h-full rounded-full', occ.bar)} style={{ width: `${Math.min(100, s.occupancyPct)}%` }} />
          <span className="absolute inset-y-0 left-[70%] w-px bg-foreground/25" />
          <span className="absolute inset-y-0 left-[90%] w-px bg-foreground/25" />
        </div>
      </div>
      <Button variant="ghost" size="sm" className="-mx-1 self-start text-brand" asChild>
        <Link to={`/admin/live?event=${eventId}&session=${s.session.id}`}>
          <Rows3 /> Lihat peta kursi live <ArrowRight />
        </Link>
      </Button>
    </div>
  )
}

export default function Dashboard() {
  const [params, setParams] = useSearchParams()
  const events = useLive(() => api.admin.listEvents(), [])
  const list = ticketedEvents(events.data)
  const eventId = pickEventId(list, params.get('event'))
  const stats = useLive(() => api.admin.stats(eventId), [eventId], { intervalMs: 5000, enabled: !!eventId })
  const s = stats.data && stats.data.event.id === eventId ? stats.data : undefined
  const [busy, setBusy] = useState<string | null>(null)

  const exportCsv = async (type: 'attendees' | 'transactions') => {
    setBusy(type)
    try {
      const { filename, rows } = await downloadEventCsv(eventId, type)
      toast.success(`${filename} diunduh (${rows} baris).`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const loading = !s && !stats.error

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Dashboard"
        description="Pantau pendaftar, penjualan, struk, dan kehadiran per sesi. Angka diperbarui otomatis."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <EventSelect
              events={events.data ? list : undefined}
              value={eventId}
              onChange={(id) => setParams({ event: id }, { replace: true })}
              hideLabel
              label="Pilih event"
              className="w-full sm:w-auto"
            />
            <LiveIndicator at={s?.generatedAt} everySec={5} />
          </div>
        }
      />

      {events.error ? <LoadError error={events.error} onRetry={events.reload} className="mb-4" /> : null}
      {stats.error && !s ? <LoadError error={stats.error} onRetry={stats.reload} className="mb-4" /> : null}

      <section aria-label="Ringkasan angka" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 [&>*]:min-w-0">
        <KpiTile label="Pendaftar" icon={<Users />} value={s?.registrants} loading={loading} hint="Akun unik dengan pesanan aktif" />
        <KpiTile label="Tiket terjual" icon={<Ticket />} value={s?.ticketsSold} loading={loading} hint={s ? `${s.transactions.CONFIRMED} pesanan terkonfirmasi` : undefined} />
        <KpiTile label="Pendapatan" icon={<Wallet />} value={s ? rupiahPlain(s.revenue) : undefined} loading={loading} hint="Simulasi QRIS / VA" className="col-span-2 md:col-span-1" />
        <KpiTile
          label="Struk menunggu"
          icon={<ReceiptText />}
          value={s?.receiptsPending}
          loading={loading}
          to="/admin/receipts"
          tone={s && s.receiptsPending > 0 ? 'warn' : 'default'}
          className="col-span-2 md:col-span-1"
          hint={
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              Buka antrean verifikasi <ArrowRight className="size-3" />
            </span>
          }
        />
        <KpiTile label="Total nilai struk" icon={<Banknote />} value={s ? rupiahPlain(s.receiptTotal) : undefined} loading={loading} hint="Belanja di tenant dari struk disetujui" className="col-span-2 md:col-span-1" />
      </section>

      <section aria-labelledby="sesi-heading" className="mt-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="sesi-heading" className="text-lg font-bold">
            Kehadiran per sesi
          </h2>
          <p className="text-xs text-muted-foreground">
            Okupansi: <span className="font-semibold text-foreground">≥70% mulai padat</span> · <span className="font-semibold text-foreground">≥90% hampir penuh</span>
            {s?.noShowPct != null && <> · No-show sesi selesai: {s.noShowPct}%</>}
          </p>
        </div>
        {loading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-60 rounded-xl" />
            ))}
          </div>
        ) : s && s.bySession.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {s.bySession.map((x) => (
              <SessionCard key={x.session.id} s={x} eventId={eventId} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">Event ini belum punya sesi.</p>
        )}
      </section>

      <div className="mt-8 grid gap-4 xl:grid-cols-2">
        <SectionCard title="Tiket per kategori" description="Terjual dibanding total kursi/kuota, semua sesi digabung.">
          {s ? <CategoryChart data={s.byCategory} /> : <Skeleton className="h-48" />}
        </SectionCard>
        <SectionCard title="Transaksi per status" description="Jumlah pesanan (tanpa pembeli simulasi).">
          {s ? <StatusChart data={s.transactions} /> : <Skeleton className="h-48" />}
        </SectionCard>
        <SectionCard title="Tenant teratas" description="Nilai struk belanja yang sudah disetujui.">
          {s ? <TenantChart data={s.topTenants} /> : <Skeleton className="h-40" />}
        </SectionCard>
        <SectionCard title="Unduh laporan" description="File CSV (UTF-8) siap dibuka di Excel atau Google Sheets.">
          <div className="grid gap-3 sm:grid-cols-2">
            <ExportButton
              icon={<Users />}
              title="Unduh data peserta"
              body="Kode tiket, nama, kursi, sesi, status & waktu check-in."
              busy={busy === 'attendees'}
              disabled={!eventId || busy !== null}
              onClick={() => void exportCsv('attendees')}
            />
            <ExportButton
              icon={<FileSpreadsheet />}
              title="Unduh laporan transaksi"
              body="Kode pesanan, pemesan, total, metode & status bayar."
              busy={busy === 'transactions'}
              disabled={!eventId || busy !== null}
              onClick={() => void exportCsv('transactions')}
            />
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

function ExportButton({ icon, title, body, onClick, disabled, busy }: { icon: ReactNode; title: string; body: string; onClick: () => void; disabled?: boolean; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-24 items-start gap-3 rounded-xl border bg-background p-4 text-left transition hover:border-brand/50 hover:bg-brand-soft/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand [&_svg]:size-5">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 font-semibold">
          {title} <Download className="size-4 text-muted-foreground" aria-hidden />
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{busy ? 'Menyiapkan file…' : body}</span>
      </span>
    </button>
  )
}
