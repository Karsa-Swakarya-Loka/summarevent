/**
 * Peta kursi live (brief: "Memantau kursi dan tiket yang tersedia, dipesan, atau terjual"):
 * the same seat map visitors see, refreshed every 3 s, with counts per category and
 * a detail panel for the seat you click.
 */
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { BellRing, FlaskConical, LoaderCircle, MousePointerClick, Users } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import type { OrderRow, SeatMapData } from '@/api/contract'
import { LiveIndicator, LoadError, PageHeader, SectionCard } from '@/components/admin/AdminUi'
import { useAdminEvent } from '@/components/admin/hooks'
import { SEAT_TONE, seatSummary, sessionLabel } from '@/components/admin/lib'
import { Countdown, StatusBadge, Swatch } from '@/components/common/bits'
import { DoubleBookingPoints } from '@/components/common/DoubleBookingInfo'
import { AvailableSample } from '@/components/seatmap/SeatLegend'
import { SeatMap, SeatSample, type SeatVisual } from '@/components/seatmap/SeatMap'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ORDER_STATUS_LABEL, ORDER_TONE, PRIORITY_SEAT_LABEL, SEAT_STATUS_LABEL } from '@/domain/labels'
import { seatLabel } from '@/domain/rules'
import type { SeatStatus } from '@/domain/types'
import { errorMessage, useLive } from '@/hooks/useLive'
import { fmtTime } from '@/lib/format'
import { cn } from '@/lib/utils'

const LEGEND: Array<{ visual: SeatVisual; label: string }> = [
  { visual: 'AVAILABLE', label: SEAT_STATUS_LABEL.AVAILABLE },
  { visual: 'HELD', label: SEAT_STATUS_LABEL.HELD },
  { visual: 'SOLD', label: SEAT_STATUS_LABEL.SOLD },
  { visual: 'BLOCKED', label: SEAT_STATUS_LABEL.BLOCKED },
]

export default function LiveSeats() {
  const [params, setParams] = useSearchParams()
  const { eventId, summary, eventsError, reloadEvents } = useAdminEvent()
  const sessions = summary?.sessions ?? []
  const orders = useLive(() => api.admin.listOrders({ eventId }), [eventId], { enabled: !!eventId })

  // Default session: where the latest real order happened (shows a fresh purchase right away).
  const latest = (orders.data ?? []).find((r) => !r.order.simulated)
  const wanted = params.get('session')
  const sessionId = sessions.some((s) => s.id === wanted) ? wanted! : sessions.find((s) => s.id === latest?.order.sessionId)?.id ?? sessions[0]?.id ?? ''

  const map = useLive(() => api.getSeatMap(sessionId), [sessionId], { intervalMs: 3000, enabled: !!sessionId })
  const data = map.data && map.data.session.id === sessionId ? map.data : undefined
  const [busy, setBusy] = useState(false)

  const setQuery = (patch: Record<string, string>) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        for (const [k, v] of Object.entries(patch)) n.set(k, v)
        return n
      },
      { replace: true },
    )

  const fakeBuyer = async () => {
    setBusy(true)
    try {
      const res = await api.demo.fakeBuyer(sessionId)
      toast(`Pembeli lain (simulasi) sedang memesan ${res.seatLabels.join(', ')}.`, { description: 'Kursinya jadi “Sedang dipesan” selama 60 detik, lalu kembali Tersedia.' })
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Peta kursi live"
        description={`${summary ? `${summary.event.title} · ` : ''}Denah yang sama dengan yang dilihat pengunjung, berubah sendiri saat ada pesanan.`}
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="session-select" className="sr-only">
                  Pilih sesi
                </Label>
                <Select value={sessionId} onValueChange={(id) => setQuery({ event: eventId, session: id })} disabled={!sessions.length}>
                  <SelectTrigger id="session-select" className="h-10 w-full min-w-0 bg-card sm:w-64" aria-label="Pilih sesi">
                    <SelectValue placeholder="Pilih sesi" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {sessions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {sessionLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <LiveIndicator at={data?.serverTime} />
          </div>
        }
      />

      {eventsError ? <LoadError error={eventsError} onRetry={reloadEvents} className="mb-4" /> : null}
      {map.error && !data ? <LoadError error={map.error} onRetry={map.reload} className="mb-4" /> : null}

      {!data ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton className="h-[28rem] rounded-xl" />
          <Skeleton className="h-[28rem] rounded-xl" />
        </div>
      ) : (
        <LiveBody key={sessionId} data={data} orders={orders.data ?? []} busy={busy} onFakeBuyer={() => void fakeBuyer()} />
      )}
    </div>
  )
}

interface Counts {
  total: number
  available: number
  held: number
  sold: number
  blocked: number
}

function LiveBody({ data, orders, busy, onFakeBuyer }: { data: SeatMapData; orders: OrderRow[]; busy: boolean; onFakeBuyer: () => void }) {
  const [picked, setPicked] = useState<string | null>(null)
  const hasMap = !!data.layout && data.seats.length > 0
  const seatCats = useMemo(() => data.categories.filter((c) => c.quota == null), [data.categories])
  const seatColors = seatCats.map((c) => c.color)
  const quotaCats = data.categories.filter((c) => c.quota != null)

  const counts = useMemo(() => {
    const m = new Map<string, Counts>()
    for (const c of seatCats) m.set(c.id, { total: 0, available: 0, held: 0, sold: 0, blocked: 0 })
    for (const ss of data.sessionSeats) {
      const c = ss.categoryId ? m.get(ss.categoryId) : undefined
      if (!c) continue
      if (ss.status === 'BLOCKED') {
        c.blocked++
        continue
      }
      c.total++
      if (ss.status === 'AVAILABLE') c.available++
      else if (ss.status === 'HELD') c.held++
      else c.sold++
    }
    return m
  }, [data.sessionSeats, seatCats])

  const totals = [...counts.values()].reduce((a, c) => ({ total: a.total + c.total, available: a.available + c.available, held: a.held + c.held, sold: a.sold + c.sold, blocked: a.blocked + c.blocked }), {
    total: 0,
    available: 0,
    held: 0,
    sold: 0,
    blocked: 0,
  })

  // who holds / bought a seat (admin may see this, the public seat map hides it)
  const ownerBySeat = useMemo(() => {
    const m = new Map<string, OrderRow>()
    for (const r of orders) {
      if (r.order.sessionId !== data.session.id) continue
      if (!['CONFIRMED', 'AWAITING_PAYMENT', 'AWAITING_VERIFICATION'].includes(r.order.status)) continue
      for (const it of r.order.items) if (it.seatId) m.set(it.seatId, r)
    }
    return m
  }, [orders, data.session.id])

  const seat = picked ? data.seats.find((s) => s.id === picked) : undefined
  const ss = seat ? data.sessionSeats.find((x) => x.seatId === seat.id) : undefined
  const status: SeatStatus = ss?.status ?? 'BLOCKED'
  const category = ss?.categoryId ? data.categories.find((c) => c.id === ss.categoryId) : undefined
  const owner = seat && (status === 'HELD' || status === 'SOLD') ? ownerBySeat.get(seat.id) : undefined

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <SectionCard
        title={sessionLabel(data.session)}
        description={hasMap ? `${totals.total} kursi dijual · ${totals.available} tersedia · ${totals.held} sedang dipesan · ${totals.sold} terjual` : 'Event tanpa nomor kursi, pantau kuota di samping.'}
        actions={
          <Button variant="outline" size="lg" className="border-dashed" onClick={onFakeBuyer} disabled={busy || !hasMap}>
            {busy ? <LoaderCircle className="animate-spin" /> : <FlaskConical />} Simulasikan pembeli lain
          </Button>
        }
      >
        {hasMap ? (
          <>
            <div className="rounded-xl bg-card p-2 shadow-[0_1px_2px_rgb(35_31_32/0.05)]">
              <SeatMap data={data} interactive={false} onSeatClick={(s) => setPicked(s.id)} suggested={picked ? new Set([picked]) : undefined} className="min-h-72" />
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label="Keterangan status kursi">
              {LEGEND.map((l) => (
                <li key={l.label} className="flex items-center gap-1.5">
                  {l.visual === 'AVAILABLE' && seatColors.length > 1 ? (
                    <AvailableSample colors={seatColors} />
                  ) : (
                    <SeatSample visual={l.visual} color={l.visual === 'AVAILABLE' && seatColors[0] ? seatColors[0] : '#0e7c7b'} />
                  )}
                  {l.label}
                </li>
              ))}
              <li className="flex items-center gap-1.5">
                <span className="inline-flex size-[18px] items-center justify-center rounded-[5px] bg-[#0e7c7b] text-[11px] text-white" aria-hidden>
                  ♿
                </span>
                {PRIORITY_SEAT_LABEL}
              </li>
            </ul>
          </>
        ) : (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Sesi ini tidak memakai denah kursi.</p>
        )}
      </SectionCard>

      <div className="flex flex-col gap-4">
        {hasMap && (
          <SectionCard title="Detail kursi" className="bg-card ring-1 ring-foreground/[0.07]">
            {seat ? (
              <div className="flex flex-col gap-3 text-sm" aria-live="polite">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-3xl font-extrabold tabular-nums">{seatLabel(seat)}</span>
                  <StatusBadge tone={SEAT_TONE[status]}>{SEAT_STATUS_LABEL[status]}</StatusBadge>
                </div>
                <dl className="grid grid-cols-[6rem_1fr] gap-x-2 gap-y-1.5">
                  <dt className="text-muted-foreground">Kategori</dt>
                  <dd className="flex items-center gap-1.5 font-medium">
                    {category ? (
                      <>
                        <Swatch color={category.color} /> {category.name}
                      </>
                    ) : (
                      '–'
                    )}
                  </dd>
                  {seat.isPriority && (
                    <>
                      <dt className="text-muted-foreground">Catatan</dt>
                      <dd className="font-medium">Kursi prioritas difabel</dd>
                    </>
                  )}
                  {status === 'HELD' && ss?.holdExpiresAt && (
                    <>
                      <dt className="text-muted-foreground">Ditahan s.d.</dt>
                      <dd className="flex flex-wrap items-center gap-2 font-medium">
                        {fmtTime(ss.holdExpiresAt)} WIB <Countdown to={ss.holdExpiresAt} className="text-xs text-muted-foreground" />
                      </dd>
                    </>
                  )}
                  {owner && (
                    <>
                      <dt className="text-muted-foreground">Pemesan</dt>
                      <dd className="min-w-0 font-medium">
                        <span className="block truncate">{owner.order.buyerName}</span>
                        <span className="text-xs text-muted-foreground">
                          {owner.order.code} · {seatSummary(owner.order.items)}
                        </span>
                      </dd>
                      <dt className="text-muted-foreground">Pesanan</dt>
                      <dd>
                        <StatusBadge tone={ORDER_TONE[owner.order.status]}>{ORDER_STATUS_LABEL[owner.order.status]}</StatusBadge>
                      </dd>
                    </>
                  )}
                </dl>
                {owner && !owner.order.simulated && (
                  <Button variant="outline" size="lg" asChild>
                    <Link to={`/admin/orders?event=${owner.order.eventId}&q=${owner.order.code}`}>Buka pesanan</Link>
                  </Button>
                )}
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <MousePointerClick className="size-4 shrink-0" aria-hidden /> Klik kursi di denah untuk melihat status dan pemesannya.
              </p>
            )}
          </SectionCard>
        )}

        <SectionCard title="Per kategori">
          <ul className="flex flex-col gap-4">
            {seatCats.map((c) => {
              const n = counts.get(c.id) ?? { total: 0, available: 0, held: 0, sold: 0, blocked: 0 }
              const pct = (v: number) => (n.total ? (v / n.total) * 100 : 0)
              return (
                <li key={c.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2 font-semibold">
                      <Swatch color={c.color} /> <span className="truncate">{c.name}</span>
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">{n.total} kursi</span>
                  </div>
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${c.name}: ${n.sold} terjual, ${n.held} sedang dipesan, ${n.available} tersedia`}>
                    <span className="h-full bg-foreground/55" style={{ width: `${pct(n.sold)}%` }} />
                    <span className="h-full bg-status-warn" style={{ width: `${pct(n.held)}%` }} />
                    <span className="h-full bg-status-valid/70" style={{ width: `${pct(n.available)}%` }} />
                  </div>
                  <dl className="grid grid-cols-3 gap-1 text-xs">
                    <Stat label={SEAT_STATUS_LABEL.AVAILABLE} value={n.available} />
                    <Stat label={SEAT_STATUS_LABEL.HELD} value={n.held} />
                    <Stat label={SEAT_STATUS_LABEL.SOLD} value={n.sold} />
                  </dl>
                  <WaitingNote count={data.waitlist.find((w) => w.categoryId === c.id)?.waiting ?? 0} />
                </li>
              )
            })}
            {quotaCats.map((c) => {
              const q = data.quotas.find((x) => x.categoryId === c.id)
              const quota = q?.quota ?? c.quota ?? 0
              const filled = q?.filled ?? 0
              return (
                <li key={c.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2 font-semibold">
                      <Swatch color={c.color} /> <span className="truncate">{c.name}</span>
                      <Users className="size-3.5 shrink-0 text-muted-foreground" aria-label="tanpa nomor kursi" />
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">kuota {quota}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${c.name}: ${filled} dari ${quota} terisi`}>
                    <span className={cn('block h-full rounded-full', filled >= quota ? 'bg-status-invalid' : 'bg-foreground/55')} style={{ width: `${quota ? Math.min(100, (filled / quota) * 100) : 0}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground tabular-nums">{filled}</span> terisi (terjual + sedang dipesan) ·{' '}
                    <span className="font-semibold text-foreground tabular-nums">{Math.max(0, quota - filled)}</span> sisa
                  </p>
                  <WaitingNote count={data.waitlist.find((w) => w.categoryId === c.id)?.waiting ?? 0} />
                </li>
              )
            })}
          </ul>
          {hasMap && totals.blocked > 0 && <p className="mt-4 text-xs text-muted-foreground">{totals.blocked} kursi ditandai “Tidak dijual” (tidak dihitung).</p>}
        </SectionCard>

        <SectionCard title="Satu kursi, satu pemesan" description="Cara sistem mencegah dua pesanan berhasil untuk kursi yang sama.">
          <DoubleBookingPoints />
        </SectionCard>
      </div>
    </div>
  )
}

function WaitingNote({ count }: { count: number }) {
  if (!count) return null
  return (
    <p className="flex items-center gap-1.5 text-xs font-semibold text-[#7a5600]">
      <BellRing className="size-3.5" aria-hidden /> {count} orang di daftar tunggu
    </p>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <dt className="leading-tight text-muted-foreground">{label}</dt>
      <dd className="text-base font-bold tabular-nums">{value}</dd>
    </div>
  )
}
