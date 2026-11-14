/**
 * Panitia dashboard (AD-08 / AD-09), laid out like a product dashboard: a welcome row with the event in view and the
 * main action; the sessions beside the money per day; tickets per day beside the attendance card; four stat tiles;
 * then the latest orders as a table with filters and pages. Every number comes from `api.admin.stats`, refreshed
 * every 5 seconds, and the table from `api.admin.listOrders`. The event comes from the admin shell (useAdminEvent).
 */
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, ArrowRight, Download, Plus, Rows3 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import type { EventStats, SessionStats } from '@/api/contract'
import { LiveIndicator, LoadError } from '@/components/admin/AdminUi'
import { CheckinHeatmap, RevenueBars, TicketsArea, type HeatCell } from '@/components/admin/dashboardCharts'
import { EventSwitcher } from '@/components/admin/EventSwitcher'
import { useAdminEvent, useCountUp } from '@/components/admin/hooks'
import { RANGES, downloadEventCsv, lastDays, seatSummary, sessionLabel, sessionShort, type Range } from '@/components/admin/lib'
import { StatusBadge, Swatch } from '@/components/common/bits'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ORDER_STATUS_LABEL, ORDER_TONE, orderStatusLabel } from '@/domain/labels'
import type { OrderStatus } from '@/domain/types'
import { errorMessage, useLive } from '@/hooks/useLive'
import { fmtDateTime, fmtRange, fmtShortDate, rupiahPlain } from '@/lib/format'
import { cn } from '@/lib/utils'
import { OrderDetailPanel } from './Orders'

const PAGE = 8

export default function Dashboard() {
  const ctx = useAdminEvent()
  const { eventId } = ctx
  const stats = useLive(() => api.admin.stats(eventId), [eventId], {
    intervalMs: 5000,
    enabled: !!eventId,
  })
  const s = stats.data && stats.data.event.id === eventId ? stats.data : undefined
  const user = api.currentUser('ADMIN')
  const firstName = (user?.name ?? 'Panitia').replace(/\s*\(demo\)\s*$/i, '').split(' ')[0]
  const loading = !s && !stats.error

  return (
    <div className="mx-auto max-w-[80rem]">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 basis-full sm:basis-auto">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Selamat datang, {firstName}</h1>
          <LiveIndicator at={s?.generatedAt} className="mt-0.5" />
        </div>
        <EventSwitcher ctx={ctx} variant="pill" className="min-w-0 flex-1 sm:flex-none" />
        <Button asChild size="lg" className="h-11 sm:h-10">
          <Link to="/admin/events/new">
            <Plus /> Buat event
          </Link>
        </Button>
      </div>

      {ctx.eventsError ? <LoadError error={ctx.eventsError} onRetry={ctx.reloadEvents} className="mb-4" /> : null}
      {stats.error && !s ? <LoadError error={stats.error} onRetry={stats.reload} className="mb-4" /> : null}

      <div className="grid gap-4 xl:grid-cols-[2fr_3fr]">
        <SessionsCard s={s} eventId={eventId} loading={loading} />
        <RevenueCard s={s} loading={loading} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[3fr_2fr]">
        <TicketsCard s={s} loading={loading} />
        <AttendanceCard s={s} loading={loading} />
      </div>

      <section aria-label="Ringkasan angka" className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile label="Pendaftar" value={s?.registrants} hint="Akun dengan pesanan aktif" loading={loading} />
        <StatTile label="Total tiket terjual" value={s?.ticketsSold} hint={s ? `Semua sesi, ${s.transactions.CONFIRMED} pesanan terkonfirmasi` : undefined} loading={loading} />
        <StatTile label="Total pendapatan" value={s ? rupiahPlain(s.revenue) : undefined} hint="Dari QRIS dan VA (simulasi)" loading={loading} />
        <StatTile
          label="Struk menunggu"
          value={s?.receiptsPending}
          hint={s && s.receiptsPending > 0 ? 'Ketuk untuk memeriksa' : 'Tidak ada yang menunggu'}
          tone={s && s.receiptsPending > 0 ? 'warn' : 'default'}
          to="/admin/receipts"
          loading={loading}
        />
      </section>

      <OrdersCard eventId={eventId} eventTitle={s?.event.title} />
    </div>
  )
}

/* ---------------------------------------------------------------- cards */

/** The reference's card: a grey panel on the white page, its tiles white. */
function Card({ className, children, label }: { className?: string; children: ReactNode; label?: string }) {
  return (
    <section aria-label={label} className={cn('flex flex-col rounded-[1.25rem] bg-panel p-4 sm:p-5', className)}>
      {children}
    </section>
  )
}

/** Weekly / Monthly / Yearly in the reference: here the last 7, 14 or 30 days. The chosen one sits on a white pill. */
function RangeTabs({ value, onChange, id }: { value: Range; onChange: (r: Range) => void; id: string }) {
  return (
    <div role="tablist" aria-label="Rentang waktu" className="flex gap-0.5 text-sm font-semibold">
      {RANGES.map((r) => (
        <button
          key={r.days}
          type="button"
          role="tab"
          id={`${id}-${r.days}`}
          aria-selected={value === r.days}
          onClick={() => onChange(r.days)}
          className={cn('min-h-9 rounded-lg px-3 transition pointer-coarse:min-h-11', value === r.days ? 'bg-card text-foreground shadow-[0_1px_2px_rgb(35_31_32/0.08)] ring-1 ring-foreground/[0.06]' : 'text-muted-foreground hover:text-foreground')}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}

/** "+14% vs 7 hari sebelumnya": against the same number of days before, said out loud; nothing when there is nothing to compare with. */
function DeltaChip({ now, before, days }: { now: number; before: number; days: Range }) {
  if (!before) return null
  const pct = Math.round(((now - before) / before) * 100)
  const tone = pct > 0 ? 'bg-brand-soft text-[#0b6b35]' : pct < 0 ? 'bg-status-invalid/10 text-[#a11b1b]' : 'bg-card text-muted-foreground ring-1 ring-foreground/[0.06]'
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
      <span className={cn('rounded-md px-1.5 py-0.5 font-semibold tabular-nums', tone)}>
        {pct > 0 ? '+' : ''}
        {pct.toLocaleString('id-ID')}%
      </span>
      dibanding {days} hari sebelumnya
    </span>
  )
}

/** The card's headline: a label, the big number counting up, and what sits beside it. */
function Headline({ label, value, format = (n) => n.toLocaleString('id-ID'), beside, loading, width = 'w-24' }: { label: ReactNode; value: number; format?: (n: number) => string; beside?: ReactNode; loading: boolean; width?: string }) {
  const n = useCountUp(value)
  return (
    <div className="min-w-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className={cn('mt-1 h-8 bg-track', width)} />
      ) : (
        <p className="flex min-w-0 flex-wrap items-center gap-2 text-2xl font-semibold tabular-nums">
          <span className="truncate">{format(Math.round(n))}</span>
          {beside}
        </p>
      )}
    </div>
  )
}

function sumRange(daily: EventStats['daily'], days: Range, key: 'revenue' | 'tickets') {
  const now = daily.slice(-days).reduce((a, d) => a + d[key], 0)
  const before = daily.slice(-days * 2, -days).reduce((a, d) => a + d[key], 0)
  return { now, before }
}

/** The reference's "Recent hires": the event's sessions, four at a time, each with its seats and attendance. */
function SessionsCard({ s, eventId, loading }: { s?: EventStats; eventId: string; loading: boolean }) {
  const [page, setPage] = useState(0)
  const sessions = s?.bySession ?? []
  const pages = Math.max(1, Math.ceil(sessions.length / 4))
  const at = Math.min(page, pages - 1)
  const shown = sessions.slice(at * 4, at * 4 + 4)
  return (
    <Card label="Sesi">
      <div className="flex items-start justify-between gap-2">
        <Headline label="Sesi" value={sessions.length} loading={loading} width="w-10" />
        <Button asChild variant="ghost" size="sm" className="-mr-2 text-foreground hover:bg-card">
          <Link to={`/admin/live?event=${eventId}`}>
            Peta kursi live <Rows3 />
          </Link>
        </Button>
      </div>
      {loading ? (
        <div className="mt-4 grid grid-cols-1 gap-3 min-[440px]:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl bg-track" />
          ))}
        </div>
      ) : sessions.length ? (
        // two tiles a row only where both fit their numbers and badge; a phone stacks them
        <ul className="mt-4 grid grid-cols-1 gap-3 min-[440px]:grid-cols-2">
          {shown.map((x) => (
            <li key={x.session.id}>
              <SessionTile s={x} eventId={eventId} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-foreground/15 p-6 text-center text-sm text-muted-foreground">Event ini belum punya sesi.</p>
      )}
      {pages > 1 && (
        <div className="mt-auto grid grid-cols-2 gap-3 pt-3">
          <Button variant="outline" className="h-11 border-transparent bg-card shadow-[0_1px_2px_rgb(35_31_32/0.06)]" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={at === 0} aria-label="Sesi sebelumnya">
            <ArrowLeft /> Sebelumnya
          </Button>
          <Button variant="outline" className="h-11 border-transparent bg-card shadow-[0_1px_2px_rgb(35_31_32/0.06)]" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={at >= pages - 1} aria-label="Sesi berikutnya">
            Berikutnya <ArrowRight />
          </Button>
        </div>
      )}
    </Card>
  )
}

function SessionTile({ s, eventId }: { s: SessionStats; eventId: string }) {
  const soldPct = s.capacity ? Math.round((s.sold / s.capacity) * 100) : 0
  return (
    <Link to={`/admin/live?event=${eventId}&session=${s.session.id}`} className="block rounded-xl bg-card p-3 shadow-[0_1px_2px_rgb(35_31_32/0.05)] transition hover:shadow-[0_6px_18px_-8px_rgb(35_31_32/0.3)] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
      <div className="flex items-center gap-2.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-panel text-sm font-bold tabular-nums" aria-hidden>
          {s.session.demoLive ? '▶' : fmtShortDate(s.session.startAt).split(',')[0].slice(0, 3)}
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold">{sessionShort(s.session)}</span>
          <span className="block truncate text-xs text-muted-foreground">{s.session.demoLive ? 'Selalu berlangsung' : fmtRange(s.session.startAt, s.session.endAt)}</span>
        </span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-track" role="img" aria-label={`${soldPct}% terjual`}>
        <div className="h-full rounded-full bg-brand" style={{ width: `${soldPct}%` }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="tabular-nums">
          <span className="font-semibold">{s.sold}</span>
          <span className="text-muted-foreground">/{s.capacity} terjual</span>
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          Hadir <span className="font-semibold text-foreground">{s.checkedIn}</span>
        </span>
      </div>
    </Link>
  )
}

/** The reference's "Earned so far": money per day as bars on tracks. */
function RevenueCard({ s, loading }: { s?: EventStats; loading: boolean }) {
  const [range, setRange] = useState<Range>(7)
  const rows = useMemo(() => (s ? lastDays(s.daily, range) : []), [s, range])
  const sum = s ? sumRange(s.daily, range, 'revenue') : { now: 0, before: 0 }
  return (
    <Card label="Pendapatan per hari">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Headline label={`Pendapatan ${range} hari terakhir`} value={sum.now} format={rupiahPlain} beside={<DeltaChip now={sum.now} before={sum.before} days={range} />} loading={loading} width="w-40" />
        <RangeTabs id="rev" value={range} onChange={setRange} />
      </div>
      <div className="mt-4 flex min-h-56 flex-1 flex-col">{loading ? <Skeleton className="flex-1 rounded-xl bg-track" /> : <RevenueBars rows={rows} className="flex-1" />}</div>
    </Card>
  )
}

/** The reference's "Revenue" area: tickets sold per day. */
function TicketsCard({ s, loading }: { s?: EventStats; loading: boolean }) {
  const [range, setRange] = useState<Range>(7)
  const rows = useMemo(() => (s ? lastDays(s.daily, range) : []), [s, range])
  const sum = s ? sumRange(s.daily, range, 'tickets') : { now: 0, before: 0 }
  return (
    <Card label="Tiket terjual per hari">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Headline label={`Tiket terjual ${range} hari terakhir`} value={sum.now} beside={<DeltaChip now={sum.now} before={sum.before} days={range} />} loading={loading} />
        <RangeTabs id="tix" value={range} onChange={setRange} />
      </div>
      <div className="mt-4 flex min-h-48 flex-1 flex-col">{loading ? <Skeleton className="flex-1 rounded-xl bg-track" /> : <TicketsArea rows={rows} className="flex-1" />}</div>
    </Card>
  )
}

/** The reference's "Contributions": attendance, four small facts, and the check-in heatmap, whose hovered cell takes over the headline. */
function AttendanceCard({ s, loading }: { s?: EventStats; loading: boolean }) {
  const [cell, setCell] = useState<HeatCell | null>(null)
  const checkedIn = s ? s.bySession.reduce((a, x) => a + x.checkedIn, 0) : 0
  const sold = s ? s.bySession.reduce((a, x) => a + x.sold, 0) : 0
  const top = s?.topTenants[0]
  const facts = [
    {
      label: 'Tiket terjual yang hadir',
      value: s ? `${sold ? Math.round((checkedIn / sold) * 100) : 0}%` : '',
    },
    {
      label: 'Tidak datang di sesi yang selesai',
      value: s ? (s.noShowPct == null ? '–' : `${s.noShowPct}%`) : '',
    },
    {
      label: 'Belanja dari struk disetujui',
      value: s ? rupiahPlain(s.receiptTotal) : '',
    },
    { label: 'Tenant teratas', value: top ? top.tenant.name : '–' },
  ]
  return (
    <Card label="Kehadiran">
      <Headline
        label={cell ? `${cell.day} ${String(cell.hour).padStart(2, '0')}.00` : 'Sudah check-in'}
        value={cell ? cell.value : checkedIn}
        beside={<span className="text-sm font-normal text-muted-foreground">{cell ? 'check-in' : `dari ${sold} tiket`}</span>}
        loading={loading}
      />
      <dl className="mt-4 grid grid-cols-2 gap-2">
        {facts.map((f) => (
          <div key={f.label} className="rounded-xl bg-card px-3 py-2.5 shadow-[0_1px_2px_rgb(35_31_32/0.05)]">
            {loading ? <Skeleton className="h-5 w-16 bg-track" /> : <dd className="truncate text-base font-semibold tabular-nums">{f.value}</dd>}
            {/* a long label wraps instead of being cut on a 360 px phone */}
            <dt className="text-xs leading-snug text-muted-foreground">{f.label}</dt>
          </div>
        ))}
      </dl>
      <p className="mt-4 mb-2 text-sm text-muted-foreground">Check-in per jam</p>
      {loading || !s ? <Skeleton className="h-28 rounded-xl bg-track" /> : <CheckinHeatmap data={s.checkinsByHour} onHover={setCell} />}
    </Card>
  )
}

/** The metric tiles: the label, the number, and one line on what it counts. */
function StatTile({ label, value, hint, tone = 'default', to, loading }: { label: string; value?: ReactNode; hint?: string; tone?: 'default' | 'warn'; to?: string; loading: boolean }) {
  const body = (
    <>
      <span className="block text-sm text-muted-foreground">{label}</span>
      {loading ? <Skeleton className="mt-1 h-8 w-20 bg-track" /> : <span className="mt-1 block truncate text-xl font-semibold tabular-nums sm:text-2xl">{value}</span>}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </>
  )
  const cls = cn('block min-w-0 rounded-[1.25rem] bg-panel p-4 sm:p-5', tone === 'warn' && 'ring-2 ring-brand-yellow', to && 'transition hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none')
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/* ---------------------------------------------------------------- orders table */

const STATUSES = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]

/** The reference's customers table: the latest orders with status and category filters, pages of eight, CSV. */
function OrdersCard({ eventId, eventTitle }: { eventId: string; eventTitle?: string }) {
  const rows = useLive(() => api.admin.listOrders({ eventId, status: 'ALL' }), [eventId], { intervalMs: 5000, enabled: !!eventId })
  const [status, setStatus] = useState<OrderStatus | 'ALL'>('ALL')
  const [category, setCategory] = useState('ALL')
  const [page, setPage] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)
  // "Tandai lunas" on a row opens the order with its confirmation up; "Detail" just opens it
  const [askPaid, setAskPaid] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const all = useMemo(() => (rows.data ?? []).filter((r) => !r.order.simulated).sort((a, b) => b.order.createdAt.localeCompare(a.order.createdAt)), [rows.data])
  const categories = useMemo(() => [...new Map(all.map((r) => [r.category.id, r.category])).values()], [all])
  const shown = all.filter((r) => (status === 'ALL' || r.order.status === status) && (category === 'ALL' || r.category.id === category))
  const pages = Math.max(1, Math.ceil(shown.length / PAGE))
  const at = Math.min(page, pages - 1)
  const slice = shown.slice(at * PAGE, at * PAGE + PAGE)
  const open = openId ? all.find((r) => r.order.id === openId) : undefined

  const exportCsv = async (type: 'attendees' | 'transactions') => {
    setBusy(type)
    try {
      const { filename, rows: n } = await downloadEventCsv(eventId, type)
      toast.success(`${filename} diunduh (${n} baris).`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section aria-label="Pesanan terbaru" className="mt-4 overflow-hidden rounded-[1.25rem] bg-card ring-1 ring-foreground/[0.07]">
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-full sm:basis-auto">
            <p className="text-sm text-muted-foreground">Pesanan terbaru</p>
            <p className="truncate text-base font-semibold">
              {rows.data ? `${shown.length} pesanan` : 'Memuat…'}
              {eventTitle && <span className="font-normal text-muted-foreground"> · {eventTitle}</span>}
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button variant="outline" className="h-11 bg-card sm:h-10" onClick={() => void exportCsv('attendees')} disabled={!eventId || !!busy} aria-label="Unduh data peserta">
              <Download /> Data peserta
            </Button>
            <Button variant="outline" className="h-11 bg-card sm:h-10" onClick={() => void exportCsv('transactions')} disabled={!eventId || !!busy} aria-label="Unduh laporan transaksi">
              <Download /> Laporan transaksi
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as OrderStatus | 'ALL')
            setPage(0)
          }}
        >
          <SelectTrigger className="w-full min-w-0 bg-card data-[size=default]:h-11 sm:w-auto sm:data-[size=default]:h-10" aria-label="Filter status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Semua status</SelectItem>
            {STATUSES.map((st) => (
              <SelectItem key={st} value={st}>
                {ORDER_STATUS_LABEL[st]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={category}
          onValueChange={(v) => {
            setCategory(v)
            setPage(0)
          }}
        >
          <SelectTrigger className="w-full min-w-0 bg-card data-[size=default]:h-11 sm:w-auto sm:data-[size=default]:h-10" aria-label="Filter kategori">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Semua kategori</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        </div>
      </div>

      {rows.error && !rows.data ? (
        <LoadError error={rows.error} onRetry={rows.reload} className="m-4" />
      ) : !rows.data ? (
        <div className="space-y-2 p-4" role="status" aria-busy="true" aria-label="Memuat pesanan">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : !slice.length ? (
        <div className="flex flex-col items-start gap-3 border-t px-4 py-6 text-sm text-muted-foreground sm:px-5">
          {all.length ? 'Tidak ada pesanan yang cocok dengan filter ini.' : 'Belum ada pesanan untuk event ini.'}
          {all.length > 0 && (
            <Button
              variant="outline"
              className="h-11 bg-card sm:h-10"
              onClick={() => {
                setStatus('ALL')
                setCategory('ALL')
                setPage(0)
              }}
            >
              Hapus filter
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="hidden xl:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-panel hover:bg-panel">
                  <TableHead className="pl-5">Pemesan</TableHead>
                  <TableHead>Kursi</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dibuat</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="pr-5 text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slice.map((r) => (
                  <TableRow key={r.order.id} className="cursor-pointer" onClick={() => {
                    setAskPaid(false)
                    setOpenId(r.order.id)
                  }}>
                    <TableCell className="pl-5">
                      <span className="flex items-center gap-2.5">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-bold text-[#0b6b35]" aria-hidden>
                          {r.order.buyerName[0]}
                        </span>
                        <span className="min-w-0">
                          <span className="block max-w-44 truncate font-medium">{r.order.buyerName}</span>
                          <span className="block font-mono text-xs text-muted-foreground">{r.order.code}</span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        <Swatch color={r.category.color} />
                        <span className="font-semibold tabular-nums">{seatSummary(r.order.items)}</span>
                        <span className="max-w-40 truncate text-xs text-muted-foreground" title={sessionLabel(r.session)}>
                          · {sessionShort(r.session)}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={ORDER_TONE[r.order.status]}>{orderStatusLabel(r.order.status, r.order.paymentMethod, r.order.totalAmount)}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDateTime(r.order.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <span className={cn('tabular-nums', r.order.totalAmount ? 'font-semibold' : 'text-muted-foreground')}>
                        {r.order.totalAmount ? rupiahPlain(r.order.totalAmount) : r.category.accessMethod === 'RECEIPT' ? 'Tukar struk' : 'Gratis'}
                      </span>
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 bg-card"
                        onClick={(e) => {
                          e.stopPropagation()
                          setAskPaid(r.order.status === 'AWAITING_PAYMENT' && !r.order.simulated)
                          setOpenId(r.order.id)
                        }}
                      >
                        {r.order.status === 'AWAITING_PAYMENT' && !r.order.simulated ? 'Tandai lunas' : 'Detail'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="flex flex-col divide-y xl:hidden" aria-label="Pesanan terbaru">
            {slice.map((r) => (
              <li key={r.order.id}>
                <button type="button" onClick={() => {
                    setAskPaid(false)
                    setOpenId(r.order.id)
                  }} className="flex w-full items-start gap-3 px-4 py-3 text-left transition active:bg-muted">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-bold text-[#0b6b35]" aria-hidden>
                    {r.order.buyerName[0]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium">{r.order.buyerName}</span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{r.order.totalAmount ? rupiahPlain(r.order.totalAmount) : r.category.accessMethod === 'RECEIPT' ? 'Tukar struk' : 'Gratis'}</span>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {seatSummary(r.order.items)} · {r.category.name} · {sessionShort(r.session)}
                    </span>
                    <StatusBadge tone={ORDER_TONE[r.order.status]} className="mt-1.5">
                      {orderStatusLabel(r.order.status, r.order.paymentMethod, r.order.totalAmount)}
                    </StatusBadge>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <nav className="flex items-center justify-between gap-3 border-t px-4 py-3 sm:px-5" aria-label="Halaman pesanan">
            <Button variant="outline" size="sm" className="h-9 bg-card pointer-coarse:h-11 pointer-coarse:min-w-11" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={at === 0} aria-label="Halaman sebelumnya">
              <ArrowLeft /> <span className="max-sm:sr-only">Sebelumnya</span>
            </Button>
            <ol className="flex items-center gap-1 text-sm">
              {Array.from({ length: pages }, (_, i) => i)
                .filter((i) => i === 0 || i === pages - 1 || Math.abs(i - at) <= 1)
                .map((i, idx, arr) => (
                  <li key={i} className="flex items-center gap-1">
                    {idx > 0 && arr[idx - 1] !== i - 1 && <span className="px-1 text-muted-foreground">…</span>}
                    <button
                      type="button"
                      onClick={() => setPage(i)}
                      aria-current={i === at ? 'page' : undefined}
                      className={cn('grid size-9 place-items-center rounded-lg text-sm font-medium transition pointer-coarse:size-11', i === at ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
                    >
                      {i + 1}
                    </button>
                  </li>
                ))}
            </ol>
            <Button variant="outline" size="sm" className="h-9 bg-card pointer-coarse:h-11 pointer-coarse:min-w-11" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={at >= pages - 1} aria-label="Halaman berikutnya">
              <span className="max-sm:sr-only">Berikutnya</span> <ArrowRight />
            </Button>
          </nav>
        </>
      )}

      <Sheet open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto data-[side=right]:w-full sm:max-w-md data-[side=right]:sm:max-w-md">{open ? <OrderDetailPanel key={open.order.id} row={open} askPaid={askPaid} /> : <SheetTitle className="sr-only">Detail pesanan</SheetTitle>}</SheetContent>
      </Sheet>
    </section>
  )
}
