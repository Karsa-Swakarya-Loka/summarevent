/**
 * Pesanan & peserta (brief: "Melihat serta mengelola data peserta dan status pembayaran",
 * "Mengunduh data peserta dan laporan transaksi").
 */
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Ban, CircleCheck, Download, FileSpreadsheet, LoaderCircle, ReceiptText, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import type { OrderRow } from '@/api/contract'
import { EventSelect, ListSkeleton, LoadError, PageHeader } from '@/components/admin/AdminUi'
import { useAdminEvent } from '@/components/admin/hooks'
import { downloadEventCsv, seatSummary, sessionLabel } from '@/components/admin/lib'
import { EmptyState, StatusBadge, Swatch } from '@/components/common/bits'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useDebounced } from '@/components/visitor/hooks'
import { ORDER_STATUS_LABEL, ORDER_TONE, PAYMENT_METHOD_LABEL, RECEIPT_STATUS_LABEL, RECEIPT_TONE, orderStatusLabel } from '@/domain/labels'
import type { OrderStatus } from '@/domain/types'
import { errorMessage, useLive } from '@/hooks/useLive'
import { fmtDateTime, maskPhone, rupiahPlain } from '@/lib/format'
import { cn } from '@/lib/utils'

const STATUSES = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]
const ACTIVE: OrderStatus[] = ['AWAITING_PAYMENT', 'AWAITING_VERIFICATION', 'CONFIRMED']

const methodLabel = (r: OrderRow) => (r.order.paymentMethod ? PAYMENT_METHOD_LABEL[r.order.paymentMethod] : r.category.accessMethod === 'PAID' ? 'Belum dipilih' : '–')
const statusText = (r: OrderRow) => orderStatusLabel(r.order.status, r.order.paymentMethod, r.order.totalAmount)

export default function Orders() {
  const [params, setParams] = useSearchParams()
  const ctx = useAdminEvent()
  // the event in view comes from the admin shell; this page alone can also look across all of them
  const eventId = params.get('event') === 'ALL' ? 'ALL' : ctx.eventId
  const status = (STATUSES as string[]).includes(params.get('status') ?? '') ? (params.get('status') as OrderStatus) : 'ALL'
  const [q, setQ] = useState(() => params.get('q') ?? '')
  const dq = useDebounced(q.trim(), 250)
  const rows = useLive(() => api.admin.listOrders({ eventId: eventId === 'ALL' ? undefined : eventId, status: 'ALL', q: dq || undefined }), [eventId, dq], {
    enabled: !!eventId,
  })
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const all = useMemo(() => rows.data ?? [], [rows.data])
  const counts = useMemo(() => {
    const m = new Map<OrderStatus, number>()
    for (const r of all) m.set(r.order.status, (m.get(r.order.status) ?? 0) + 1)
    return m
  }, [all])
  const shown = status === 'ALL' ? all : all.filter((r) => r.order.status === status)
  const open = openId ? all.find((r) => r.order.id === openId) : undefined

  const setQuery = (patch: Record<string, string | null>) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        for (const [k, v] of Object.entries(patch)) {
          if (v == null) n.delete(k)
          else n.set(k, v)
        }
        return n
      },
      { replace: true },
    )

  const exportCsv = async (type: 'attendees' | 'transactions') => {
    if (eventId === 'ALL') return
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
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Pesanan & peserta"
        description="Cari pesanan, lalu kelola dari panel detailnya."
        actions={
          <>
            <Button variant="outline" size="lg" onClick={() => void exportCsv('attendees')} disabled={eventId === 'ALL' || !!busy} title={eventId === 'ALL' ? 'Pilih satu event dulu' : undefined}>
              {busy === 'attendees' ? <LoaderCircle className="animate-spin" /> : <Download />} Unduh data peserta
            </Button>
            <Button variant="outline" size="lg" onClick={() => void exportCsv('transactions')} disabled={eventId === 'ALL' || !!busy} title={eventId === 'ALL' ? 'Pilih satu event dulu' : undefined}>
              {busy === 'transactions' ? <LoaderCircle className="animate-spin" /> : <FileSpreadsheet />} Unduh laporan transaksi
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-end">
        <EventSelect events={ctx.events ? ctx.list : undefined} value={eventId} onChange={(id) => (id === 'ALL' ? setQuery({ event: 'ALL' }) : ctx.setEventId(id))} allowAll label="Event" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor="order-search" className="text-xs text-muted-foreground">
            Cari
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="order-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kode pesanan, nama, no. HP, atau kursi (mis. C7)" className="h-10 bg-card pr-10 pl-9" />
            {q && (
              <button type="button" className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" onClick={() => setQ('')} aria-label="Hapus pencarian">
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] md:flex-wrap md:overflow-visible" role="group" aria-label="Filter status">
        <FilterChip active={status === 'ALL'} onClick={() => setQuery({ status: null })} count={all.length}>
          Semua
        </FilterChip>
        {STATUSES.map((s) => (
          <FilterChip key={s} active={status === s} onClick={() => setQuery({ status: s })} count={counts.get(s) ?? 0}>
            {ORDER_STATUS_LABEL[s]}
          </FilterChip>
        ))}
      </div>

      {rows.error && !rows.data ? (
        <LoadError error={rows.error} onRetry={rows.reload} />
      ) : !rows.data ? (
        <ListSkeleton rows={6} />
      ) : !shown.length ? (
        <EmptyState icon={<Search />} title="Tidak ada pesanan yang cocok">
          {dq ? `Tidak ada hasil untuk “${dq}”. ` : ''}Coba ganti filter status atau event.
        </EmptyState>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-[1.25rem] bg-card ring-1 ring-foreground/[0.07] md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-panel hover:bg-panel">
                  <TableHead>Pesanan</TableHead>
                  <TableHead>Pemesan</TableHead>
                  <TableHead>Sesi & kategori</TableHead>
                  <TableHead>Kursi</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Hadir</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((r) => (
                  <TableRow key={r.order.id} className="cursor-pointer" onClick={() => setOpenId(r.order.id)}>
                    <TableCell>
                      <button type="button" className="font-mono text-sm font-semibold text-brand hover:underline focus-visible:underline" onClick={() => setOpenId(r.order.id)}>
                        {r.order.code}
                      </button>
                      <div className="text-xs text-muted-foreground">{fmtDateTime(r.order.createdAt)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-44 truncate font-medium">{r.order.buyerName}</div>
                      {/* the full number is one tap away in the detail panel, not on a screen others can read over a shoulder */}
                      <div className="text-xs text-muted-foreground tabular-nums">{maskPhone(r.order.buyerPhone)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-56 truncate">{sessionLabel(r.session)}</div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Swatch color={r.category.color} /> {r.category.name}
                        {eventId === 'ALL' && <span className="truncate">· {r.event.title}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-40 truncate font-semibold tabular-nums">{seatSummary(r.order.items)}</TableCell>
                    <TableCell className="text-right">
                      <div className="font-semibold tabular-nums">{r.order.totalAmount ? rupiahPlain(r.order.totalAmount) : r.category.accessMethod === 'RECEIPT' ? 'Tukar struk' : 'Gratis'}</div>
                      <div className="ml-auto max-w-28 text-xs leading-tight whitespace-normal text-muted-foreground">{methodLabel(r)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge tone={ORDER_TONE[r.order.status]}>{statusText(r)}</StatusBadge>
                        {r.order.simulated && <span className="text-[0.7rem] font-semibold text-muted-foreground">Simulasi</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.order.status === 'CONFIRMED' ? (
                        <span className={cn('font-semibold', r.checkedIn === r.order.qty && 'text-[#0b6b35]')}>
                          {r.checkedIn}/{r.order.qty}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="flex flex-col gap-2 md:hidden" aria-label="Daftar pesanan">
            {shown.map((r) => (
              <li key={r.order.id}>
                <button type="button" onClick={() => setOpenId(r.order.id)} className="w-full rounded-xl bg-panel p-3 text-left transition hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold">{r.order.code}</span>
                    <StatusBadge tone={ORDER_TONE[r.order.status]}>{statusText(r)}</StatusBadge>
                  </div>
                  <div className="mt-1 truncate font-medium">{r.order.buyerName}</div>
                  <div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    <Swatch color={r.category.color} /> {r.category.name} · {seatSummary(r.order.items)} · {sessionLabel(r.session)}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-sm">
                    <span className="font-semibold tabular-nums">{r.order.totalAmount ? rupiahPlain(r.order.totalAmount) : r.category.accessMethod === 'RECEIPT' ? 'Tukar struk' : 'Gratis'}</span>
                    {r.order.status === 'CONFIRMED' && (
                      <span className="text-xs text-muted-foreground">
                        Hadir {r.checkedIn}/{r.order.qty}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            {shown.length} pesanan{status !== 'ALL' ? ` berstatus ${ORDER_STATUS_LABEL[status].toLowerCase()}` : ''}. Pesanan berlabel Simulasi dibuat tombol demo dan tidak ikut CSV.
          </p>
        </>
      )}

      <Sheet open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">{open ? <OrderDetailPanel row={open} /> : <SheetTitle className="sr-only">Detail pesanan</SheetTitle>}</SheetContent>
      </Sheet>
    </div>
  )
}

function FilterChip({ active, onClick, count, children }: { active: boolean; onClick: () => void; count: number; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 pointer-coarse:min-h-11 text-sm font-medium whitespace-nowrap transition',
        active ? 'border-brand bg-brand text-white' : 'bg-card hover:border-foreground/30',
      )}
    >
      {children}
      <span className={cn('rounded-full px-1.5 text-xs tabular-nums', active ? 'bg-white/20' : 'bg-muted text-muted-foreground')}>{count}</span>
    </button>
  )
}

/**
 * The order, its receipts and the panitia's actions, in the side panel. Shared with the dashboard's table, whose
 * "Tandai lunas" opens it with the confirmation already up (`askPaid`).
 */
export function OrderDetailPanel({ row, askPaid = false }: { row: OrderRow; askPaid?: boolean }) {
  const { order, event, session, category, receipts } = row
  const [busy, setBusy] = useState<null | 'paid' | 'cancel'>(null)
  const [askCancel, setAskCancel] = useState(false)
  const [askPay, setAskPay] = useState(askPaid && order.status === 'AWAITING_PAYMENT' && !order.simulated)
  const free = order.paymentMethod === 'FREE' || (order.totalAmount === 0 && category.accessMethod !== 'RECEIPT')

  const markPaid = async () => {
    setBusy('paid')
    try {
      await api.admin.markPaid(order.id)
      toast.success(free ? `Pesanan ${order.code} dikonfirmasi. E-ticket terbit.` : `Pesanan ${order.code} ditandai lunas. E-ticket terbit.`)
      setAskPay(false)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const cancel = async () => {
    setBusy('cancel')
    try {
      await api.admin.cancelOrder(order.id)
      toast.success(`Pesanan ${order.code} dibatalkan. Kursi dilepas.`)
      setAskCancel(false)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const timeline: Array<{ at: string; label: string }> = [{ at: order.createdAt, label: 'Pesanan dibuat, kursi ditahan' }]
  for (const r of receipts) timeline.push({ at: r.createdAt, label: `Struk ${r.receiptNo} dikirim` })
  const reviewed = receipts.find((r) => r.reviewedAt)
  if (reviewed?.reviewedAt) timeline.push({ at: reviewed.reviewedAt, label: `Struk direview: ${RECEIPT_STATUS_LABEL[reviewed.status].toLowerCase()}${reviewed.reason ? ` (${reviewed.reason})` : ''}` })
  if (order.confirmedAt) timeline.push({ at: order.confirmedAt, label: 'Terkonfirmasi, e-ticket terbit' })
  if (order.cancelledAt) {
    const by = order.cancelledBy === 'ADMIN' ? 'panitia' : 'pengunjung'
    timeline.push({ at: order.cancelledAt, label: `Dibatalkan oleh ${by}${order.refundAmount ? `, refund ${rupiahPlain(order.refundAmount)} (simulasi)` : ''}` })
  }
  timeline.sort((a, b) => a.at.localeCompare(b.at))

  return (
    <>
      <SheetHeader>
        <SheetTitle className="font-mono">{order.code}</SheetTitle>
        <SheetDescription>{event.title}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-5 px-4 pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={ORDER_TONE[order.status]}>{statusText(row)}</StatusBadge>
          {order.simulated && <StatusBadge tone="neutral">Simulasi (tombol demo)</StatusBadge>}
        </div>

        <Section title="Pemesan">
          <dl className="grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Nama</dt>
            <dd className="font-medium">{order.buyerName}</dd>
            <dt className="text-muted-foreground">No. HP</dt>
            <dd className="tabular-nums">{order.buyerPhone}</dd>
            <dt className="text-muted-foreground">Sesi</dt>
            <dd>{sessionLabel(session)}</dd>
            <dt className="text-muted-foreground">Kategori</dt>
            <dd className="flex items-center gap-1.5">
              <Swatch color={category.color} /> {category.name}
            </dd>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="font-semibold tabular-nums">{order.totalAmount ? rupiahPlain(order.totalAmount) : category.accessMethod === 'RECEIPT' ? 'Tukar struk' : 'Gratis'}</dd>
            <dt className="text-muted-foreground">Metode</dt>
            <dd>{methodLabel(row)}</dd>
          </dl>
        </Section>

        <Section title={`Kursi & peserta (${order.items.length})`} right={order.status === 'CONFIRMED' ? <span className="text-xs text-muted-foreground">Hadir {row.checkedIn}/{order.qty}</span> : undefined}>
          <ul className="divide-y rounded-lg border">
            {order.items.map((it, i) => (
              <li key={it.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-12 shrink-0 font-bold tabular-nums">{it.seatLabel ?? `#${i + 1}`}</span>
                <span className="min-w-0 flex-1 truncate">{it.attendeeName ?? <span className="text-muted-foreground">Nama belum diisi</span>}</span>
              </li>
            ))}
          </ul>
        </Section>

        {receipts.length > 0 && (
          <Section
            title={`Struk (${receipts.length})`}
            right={
              <Link to="/admin/receipts" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                <ReceiptText className="size-3.5" aria-hidden /> Verifikasi struk
              </Link>
            }
          >
            <ul className="flex flex-col gap-2">
              {receipts.map((r) => (
                <li key={r.id} className="flex items-center gap-3 text-sm">
                  <img src={r.photoUrl} alt={`Struk ${r.receiptNo}`} className="h-12 w-10 shrink-0 rounded border object-cover object-top" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-xs">{r.receiptNo}</span>
                    <span className="font-semibold tabular-nums">{rupiahPlain(r.amount)}</span>
                  </span>
                  <StatusBadge tone={RECEIPT_TONE[r.status]}>{RECEIPT_STATUS_LABEL[r.status]}</StatusBadge>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Riwayat">
          <ol className="flex flex-col gap-2 border-l-2 border-border pl-4 text-sm">
            {timeline.map((t, i) => (
              <li key={i} className="relative">
                <span className="absolute top-1.5 -left-[1.3rem] size-2.5 rounded-full bg-brand ring-2 ring-card" aria-hidden />
                <span className="block text-xs text-muted-foreground">{fmtDateTime(t.at)}</span>
                {t.label}
              </li>
            ))}
            {(order.status === 'AWAITING_PAYMENT' || order.status === 'AWAITING_VERIFICATION') && (
              <li className="relative text-muted-foreground">
                <span className="absolute top-1.5 -left-[1.3rem] size-2.5 rounded-full bg-status-warn ring-2 ring-card" aria-hidden />
                <span className="block text-xs">{fmtDateTime(order.holdExpiresAt)}</span>
                Batas tahan kursi
              </li>
            )}
          </ol>
        </Section>

        {order.simulated && ACTIVE.includes(order.status) && (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            Pesanan ini dibuat tombol demo pembeli lain. Kursinya lepas sendiri saat waktu tahan habis, jadi tidak perlu diproses.
          </p>
        )}

        {ACTIVE.includes(order.status) && !order.simulated && (
          <div className="flex flex-col gap-2 border-t pt-4">
            {order.status === 'AWAITING_PAYMENT' && (
              <Button size="lg" className="h-11" onClick={() => setAskPay(true)} disabled={!!busy}>
                {busy === 'paid' ? <LoaderCircle className="animate-spin" /> : <CircleCheck />} {free ? 'Konfirmasi pendaftaran' : 'Tandai lunas'}
              </Button>
            )}
            <Button variant="destructive" size="lg" className="h-11" onClick={() => setAskCancel(true)} disabled={!!busy}>
              <Ban /> Batalkan pesanan
            </Button>
            {order.status === 'AWAITING_VERIFICATION' && <p className="text-xs text-muted-foreground">Setujui atau tolak struk dari menu Verifikasi struk.</p>}
          </div>
        )}
      </div>

      {/* a ticket issued without money is hard to take back: say what happens before it does */}
      <Dialog open={askPay} onOpenChange={(o) => busy !== 'paid' && setAskPay(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{free ? `Konfirmasi ${order.code}?` : `Tandai ${order.code} lunas?`}</DialogTitle>
            <DialogDescription>
              E-ticket untuk {seatSummary(order.items)} langsung terbit.{free ? '' : ' Pastikan pembayarannya sudah masuk.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="lg" onClick={() => setAskPay(false)} disabled={busy === 'paid'}>
              Batal
            </Button>
            <Button size="lg" onClick={() => void markPaid()} disabled={busy === 'paid'}>
              {busy === 'paid' && <LoaderCircle className="animate-spin" />} {free ? 'Ya, konfirmasi' : 'Ya, tandai lunas'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={askCancel} onOpenChange={(o) => busy !== 'cancel' && setAskCancel(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Batalkan {order.code}?</DialogTitle>
            <DialogDescription>
              {seatSummary(order.items)} dilepas dan bisa dipesan orang lain.
              {order.status === 'CONFIRMED' ? ' E-ticket ikut dibatalkan dan pengunjung dapat pesan WA (simulasi).' : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="lg" onClick={() => setAskCancel(false)} disabled={busy === 'cancel'}>
              Tidak jadi
            </Button>
            <Button variant="destructive" size="lg" onClick={() => void cancel()} disabled={busy === 'cancel'}>
              {busy === 'cancel' && <LoaderCircle className="animate-spin" />} Ya, batalkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  )
}
