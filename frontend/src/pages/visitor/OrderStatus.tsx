/**
 * Order status (PV-11): one big status, what happens next, and the tickets once confirmed.
 * Live: when the panitia approves a receipt in another tab, this screen flips to "Tos siap!".
 */
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { Ban, FlaskConical, Gift, PencilLine, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import type { OrderDetail } from '@/api/contract'
import { BackHeader, Countdown, StatusBadge, SundaText } from '@/components/common/bits'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadError, PageSkeleton } from '@/components/visitor/Common'
import { OrderSummary } from '@/components/visitor/OrderSummary'
import { StatusHero } from '@/components/visitor/StatusHero'
import { seatRangeLabel } from '@/components/visitor/helpers'
import { useVisitor } from '@/components/visitor/hooks'
import { PAYMENT_METHOD_LABEL, RECEIPT_STATUS_LABEL, RECEIPT_TONE, TICKET_STATUS_LABEL, TICKET_TONE, orderStatusLabel } from '@/domain/labels'
import { CANCEL_MIN_HOURS, attendeeEditPolicy, visitorCancelPolicy } from '@/domain/rules'
import { errorMessage, useLive, useNow } from '@/hooks/useLive'
import { rupiahPlain } from '@/lib/format'

export default function OrderStatus() {
  const { orderId = '' } = useParams()
  const { user } = useVisitor()
  const q = useLive(() => api.getOrder(orderId), [orderId, user?.id])

  if (q.loading && !q.data) {
    return (
      <div>
        <BackHeader to="/app/pass" title="Status pesanan" />
        <PageSkeleton />
      </div>
    )
  }
  if (!q.data) {
    return (
      <div>
        <BackHeader to="/app/pass" title="Status pesanan" />
        <LoadError error={q.error} onRetry={q.reload} backTo="/app/pass" backLabel="Ke Pass Saya" />
      </div>
    )
  }
  return <StatusBody detail={q.data} />
}

function StatusBody({ detail }: { detail: OrderDetail }) {
  const { order, event, session, receipts, tickets } = detail
  const seats = order.items.map((i) => i.seatLabel).filter((x): x is string => !!x)
  const what = seats.length ? `Kursi ${seatRangeLabel(seats)}` : `${order.qty} tempat`
  const label = orderStatusLabel(order.status, order.paymentMethod, order.totalAmount)
  const again = (
    <Button asChild className="h-14 w-full text-base">
      <Link to={`/app/e/${event.slug}/s/${session.id}`}>
        <RotateCcw className="size-4" aria-hidden /> Pesan lagi
      </Link>
    </Button>
  )
  const inReview = receipts.filter((r) => r.status === 'PENDING')
  const revision = receipts.filter((r) => r.status === 'NEEDS_REVISION')
  const rejected = receipts.find((r) => r.status === 'REJECTED')

  let hero: ReactNode
  let after: ReactNode = null

  if (order.status === 'CONFIRMED') {
    hero = (
      <StatusHero tone="brand" art="tiket" label={label} title={<SundaText k="ready" size="xl" className="items-center [&>span:first-child]:font-poster [&>span:first-child]:text-6xl [&>span:first-child]:font-normal [&>span:first-child]:uppercase" />}>
        {tickets.length} e-ticket aktif
      </StatusHero>
    )
    after = (
      <>
        <Button asChild className="h-14 w-full text-base">
          <Link to={tickets[0] ? `/app/pass/${tickets[0].id}` : '/app/pass'}>Lihat e-ticket</Link>
        </Button>
        <section aria-label="E-ticket" className="overflow-hidden rounded-[1.4rem] bg-card shadow-xs">
          <ul className="divide-y">
            {tickets.map((t, i) => (
              <li key={t.id}>
                <Link to={`/app/pass/${t.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 transition active:bg-muted">
                  <span className="flex h-11 min-w-14 items-center justify-center rounded-xl bg-ink px-2 font-poster text-xl text-white">{t.seatLabel ?? `#${i + 1}`}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{t.attendeeName ?? 'Nama belum diisi'}</span>
                    <span className="block font-mono text-xs text-muted-foreground">{t.code}</span>
                    {t.bonus && (
                      <span className="mt-0.5 flex items-center gap-1 text-xs font-semibold">
                        <Gift className="size-3.5" aria-hidden /> {t.bonus}
                      </span>
                    )}
                  </span>
                  <StatusBadge tone={TICKET_TONE[t.status]}>{TICKET_STATUS_LABEL[t.status]}</StatusBadge>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <ManageOrder detail={detail} />
      </>
    )
  } else if (order.status === 'AWAITING_VERIFICATION' && inReview.length) {
    hero = (
      <StatusHero tone="warn" art="notes" label={label} title="Struk dicek panitia">
        <HoldLine detail={detail} what={what} />
      </StatusHero>
    )
    after = (
      <>
        <ReceiptList detail={detail} />
        <Button asChild variant="outline" className="h-12 w-full">
          <Link to="/admin/receipts" target="_blank" rel="noopener">
            <FlaskConical className="size-4" aria-hidden /> Demo: setujui sebagai panitia
          </Link>
        </Button>
      </>
    )
  } else if (order.status === 'AWAITING_VERIFICATION' && revision.length) {
    hero = (
      <StatusHero tone="warn" art="notes" label={RECEIPT_STATUS_LABEL.NEEDS_REVISION} title="Struk perlu diperbaiki">
        <p className="font-semibold">{revision[0].reason ?? 'Periksa lagi data struk kamu.'}</p>
        <HoldLine detail={detail} what={what} />
      </StatusHero>
    )
    after = (
      <Button asChild className="h-14 w-full text-base">
        <Link to={`/app/checkout/${order.id}`}>Perbaiki struk</Link>
      </Button>
    )
  } else if (order.status === 'AWAITING_PAYMENT' || order.status === 'AWAITING_VERIFICATION') {
    const free = order.paymentMethod === 'FREE' || order.totalAmount === 0
    const receipt = order.status === 'AWAITING_VERIFICATION'
    hero = (
      <StatusHero tone="warn" art={receipt ? 'notes' : free ? 'gift' : 'coins'} label={label} title={receipt ? 'Struk belum dikirim' : free ? 'Tinggal konfirmasi' : 'Tinggal bayar'}>
        <HoldLine detail={detail} what={what} />
      </StatusHero>
    )
    after = (
      <Button asChild className="h-14 w-full text-base">
        <Link to={`/app/checkout/${order.id}`}>{receipt ? 'Kirim struk' : free ? 'Konfirmasi pendaftaran' : 'Lanjutkan pembayaran'}</Link>
      </Button>
    )
  } else if (order.status === 'REJECTED') {
    hero = (
      <StatusHero tone="ink" art="notes" label={label} title="Struk ditolak">
        <p className="font-semibold">{rejected?.reason ?? 'Struk tidak memenuhi syarat.'}</p>
        <p>{what} sudah dilepas.</p>
      </StatusHero>
    )
    after = (
      <>
        {again}
        <ReceiptList detail={detail} />
      </>
    )
  } else {
    const cancelled = order.status === 'CANCELLED'
    hero = (
      <StatusHero tone="ink" art="kursi" label={label} title={cancelled ? (order.cancelledBy === 'ADMIN' ? 'Dibatalkan panitia' : 'Pesanan dibatalkan') : 'Waktu tahan habis'}>
        <p>{what} sudah dilepas.</p>
        {cancelled && !!order.refundAmount && (
          <p className="font-semibold">
            Refund {rupiahPlain(order.refundAmount)} ke {order.paymentMethod ? PAYMENT_METHOD_LABEL[order.paymentMethod] : 'metode bayar asal'}, 3–5 hari kerja
          </p>
        )}
      </StatusHero>
    )
    after = again
  }

  return (
    <div>
      <BackHeader to="/app/pass" title="Status pesanan" right={<span className="font-mono text-xs text-muted-foreground">{order.code}</span>} />
      <div className="space-y-4 p-4 pb-10">
        {hero}
        {after}
        <OrderSummary detail={detail} />
      </div>
    </div>
  )
}

function HoldLine({ detail, what }: { detail: OrderDetail; what: string }) {
  const { order } = detail
  return (
    <p className="flex items-center justify-center gap-2">
      <span>{what} ditahan</span>
      <Countdown to={order.holdExpiresAt} className="rounded-full bg-ink px-2.5 py-0.5 text-sm text-white [&_svg]:size-3.5" />
    </p>
  )
}

function ReceiptList({ detail }: { detail: OrderDetail }) {
  const tenantName = (id: string) => detail.tenants.find((t) => t.id === id)?.name ?? 'Tenant'
  const total = detail.receipts.reduce((s, r) => s + r.amount, 0)
  return (
    <section className="rounded-[1.4rem] bg-card p-4 shadow-xs" aria-label="Struk yang dikirim">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-bold">Struk yang dikirim</h2>
        <span className="text-sm text-muted-foreground">
          Total <strong className="text-foreground tabular-nums">{rupiahPlain(total)}</strong>
        </span>
      </div>
      <ul className="mt-2 space-y-2">
        {detail.receipts.map((r) => (
          <li key={r.id} className="flex items-center gap-3">
            <img src={r.photoUrl} alt={`Foto struk ${r.receiptNo}`} className="h-14 w-11 shrink-0 rounded-md border object-cover object-top" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{tenantName(r.tenantId)}</span>
              <span className="block text-xs text-muted-foreground tabular-nums">
                {r.receiptNo} · {rupiahPlain(r.amount)}
              </span>
              <StatusBadge tone={RECEIPT_TONE[r.status]} className="mt-1">
                {RECEIPT_STATUS_LABEL[r.status]}
              </StatusBadge>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** PV-12 / PV-13: change attendee names, or cancel with a simulated refund. */
function ManageOrder({ detail }: { detail: OrderDetail }) {
  const { order, session, tickets } = detail
  const now = useNow(60_000)
  const [mode, setMode] = useState<null | 'names' | 'cancel'>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const editPolicy = attendeeEditPolicy(order, session, now)
  const cancelPolicy = visitorCancelPolicy(order, session, tickets, now)
  const ticketOf = (itemId: string) => tickets.find((t) => t.orderItemId === itemId)

  const openNames = () => {
    setNames(Object.fromEntries(order.items.map((i) => [i.id, i.attendeeName ?? ''])))
    setMode('names')
  }

  const saveNames = async () => {
    setBusy(true)
    try {
      const changes = order.items
        .filter((i) => ticketOf(i.id)?.status !== 'USED' && (names[i.id] ?? '').trim() !== (i.attendeeName ?? ''))
        .map((i) => ({ itemId: i.id, name: names[i.id] ?? '' }))
      if (changes.length) await api.updateAttendees(order.id, changes)
      toast.success(changes.length ? 'Nama peserta diperbarui. E-ticket ikut berubah.' : 'Tidak ada nama yang berubah.')
      setMode(null)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    setBusy(true)
    try {
      const o = await api.cancelOrder(order.id)
      toast.success(o.refundAmount ? `Pesanan dibatalkan. Refund ${rupiahPlain(o.refundAmount)} diproses (simulasi).` : 'Pesanan dibatalkan.')
      setMode(null)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-[1.4rem] bg-card p-4 shadow-xs" aria-label="Kelola pesanan">
      <h2 className="font-bold">Kelola pesanan</h2>
      <div className="mt-3 grid gap-2">
        <Button variant="outline" className="h-11 justify-start" onClick={openNames} disabled={!editPolicy.allowed}>
          <PencilLine className="size-4" aria-hidden /> Ubah nama peserta
        </Button>
        <Button variant="outline" className="h-11 justify-start text-[#a11b1b] hover:text-[#a11b1b]" onClick={() => setMode('cancel')} disabled={!cancelPolicy.allowed}>
          <Ban className="size-4" aria-hidden /> Batalkan tiket
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {cancelPolicy.allowed ? `Batal paling lambat ${CANCEL_MIN_HOURS} jam sebelum mulai${cancelPolicy.refund ? ', uang kembali penuh' : ''}.` : cancelPolicy.reason}
        {!editPolicy.allowed && ` ${editPolicy.reason}`}
      </p>

      <Dialog open={mode === 'names'} onOpenChange={(o) => !busy && setMode(o ? 'names' : null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ubah nama peserta</DialogTitle>
            <DialogDescription>Nama tampil di e-ticket.</DialogDescription>
          </DialogHeader>
          <ul className="grid gap-2">
            {order.items.map((item, i) => {
              const used = ticketOf(item.id)?.status === 'USED'
              const id = `rename-${item.id}`
              return (
                <li key={item.id} className="grid grid-cols-[5rem_1fr] items-center gap-2">
                  <Label htmlFor={id} className="text-sm font-semibold">
                    {item.seatLabel ? `Kursi ${item.seatLabel}` : `Orang ${i + 1}`}
                  </Label>
                  <Input
                    id={id}
                    value={names[item.id] ?? ''}
                    onChange={(e) => setNames({ ...names, [item.id]: e.target.value })}
                    placeholder={used ? 'Sudah check-in' : 'Nama peserta'}
                    disabled={used}
                    maxLength={60}
                    className="h-11"
                  />
                </li>
              )
            })}
          </ul>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11" onClick={() => setMode(null)} disabled={busy}>
              Batal
            </Button>
            <Button className="h-11" onClick={() => void saveNames()} disabled={busy}>
              Simpan nama
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === 'cancel'} onOpenChange={(o) => !busy && setMode(o ? 'cancel' : null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Batalkan tiket ini?</DialogTitle>
            <DialogDescription>
              Semua e-ticket di pesanan {order.code} tidak berlaku lagi.
              {cancelPolicy.allowed && cancelPolicy.refund ? ` Refund ${rupiahPlain(cancelPolicy.refund)} ke metode bayar asal.` : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11" onClick={() => setMode(null)} disabled={busy}>
              Tidak jadi
            </Button>
            <Button variant="destructive" className="h-11" onClick={() => void cancel()} disabled={busy}>
              Ya, batalkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
