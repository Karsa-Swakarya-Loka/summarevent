/**
 * Order status (PV-11): one big status, what happens next, and the tickets once confirmed.
 * Live: when the panitia approves a receipt in another tab, this screen flips to "Tos siap!".
 */
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { Ban, FlaskConical, Gift, Hourglass, PencilLine, ReceiptText, RotateCcw, TimerOff, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import type { OrderDetail } from '@/api/contract'
import { BackHeader, Countdown, StatusBadge, SundaText } from '@/components/common/bits'
import { Illustration } from '@/components/common/Illustration'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadError, PageSkeleton } from '@/components/visitor/Common'
import { OrderSummary } from '@/components/visitor/OrderSummary'
import { seatRangeLabel } from '@/components/visitor/helpers'
import { useVisitor } from '@/components/visitor/hooks'
import { ORDER_TONE, PAYMENT_METHOD_LABEL, RECEIPT_STATUS_LABEL, RECEIPT_TONE, TICKET_STATUS_LABEL, TICKET_TONE, orderStatusLabel } from '@/domain/labels'
import { CANCEL_MIN_HOURS, attendeeEditPolicy, visitorCancelPolicy } from '@/domain/rules'
import { errorMessage, useLive, useNow } from '@/hooks/useLive'
import { fmtTime, rupiahPlain } from '@/lib/format'
import { cn } from '@/lib/utils'

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
    <Button asChild className="h-12 w-full text-base">
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
      <section className="relative overflow-hidden rounded-3xl bg-brand px-5 pt-7 pb-6 text-center text-white" aria-live="polite">
        <div className="seat-dots pointer-events-none absolute inset-0 text-white/[0.08]" aria-hidden />
        <Illustration name="tiket" loop={false} className="relative mx-auto -my-3 w-40 animate-pop" />
        <SundaText k="ready" size="xl" className="relative mt-1 items-center" />
        <p className="relative mx-auto mt-3 max-w-xs text-sm text-pretty text-white/90">
          {tickets.length} e-ticket QR aktif. Tunjukkan QR di Pass Saya ke petugas saat masuk.
        </p>
      </section>
    )
    after = (
      <>
        <section className="rounded-2xl border bg-card p-4" aria-label="E-ticket">
          <h2 className="font-bold">E-ticket kamu</h2>
          <ul className="mt-2 divide-y">
            {tickets.map((t, i) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5">
                <span
                  className="flex h-11 min-w-14 items-center justify-center rounded-lg border-2 px-2 text-lg font-extrabold tabular-nums"
                  style={{ borderColor: detail.category.color }}
                >
                  {t.seatLabel ?? `#${i + 1}`}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{t.attendeeName ?? 'Nama belum diisi'}</span>
                  <span className="block font-mono text-xs text-muted-foreground">{t.code}</span>
                  {t.bonus && (
                    <span className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-brand">
                      <Gift className="size-3.5" aria-hidden /> Bonus: {t.bonus}
                    </span>
                  )}
                </span>
                <StatusBadge tone={TICKET_TONE[t.status]}>{TICKET_STATUS_LABEL[t.status]}</StatusBadge>
              </li>
            ))}
          </ul>
        </section>
        <Button asChild className="h-14 w-full text-base">
          <Link to="/app/pass">Buka e-ticket di Pass Saya</Link>
        </Button>
        <ManageOrder detail={detail} />
      </>
    )
  } else if (order.status === 'AWAITING_VERIFICATION' && inReview.length) {
    hero = (
      <Hero tone="warn" icon={<Hourglass />} label={label} title="Struk sedang diverifikasi panitia">
        <p>Kamu dapat pesan WA (simulasi) begitu panitia memutuskan. Layar ini juga berubah sendiri.</p>
        <HoldLine detail={detail} what={what} />
      </Hero>
    )
    after = (
      <>
        <ReceiptList detail={detail} />
        <div className="rounded-2xl border border-dashed border-ink/25 p-3 text-sm">
          <p className="flex items-center gap-1.5 font-semibold">
            <FlaskConical className="size-4" aria-hidden /> Alat bantu demo
          </p>
          <p className="mt-0.5 text-muted-foreground">Coba jadi panitia di tab lain, lalu setujui struk ini. Status di sini ikut berubah.</p>
          <Button asChild variant="outline" className="mt-2 h-11 w-full">
            <Link to="/admin/receipts" target="_blank" rel="noopener">
              <ReceiptText className="size-4" aria-hidden /> Buka Verifikasi struk (panitia)
            </Link>
          </Button>
        </div>
      </>
    )
  } else if (order.status === 'AWAITING_VERIFICATION' && revision.length) {
    hero = (
      <Hero tone="warn" icon={<TriangleAlert />} label={RECEIPT_STATUS_LABEL.NEEDS_REVISION} title="Struk perlu diperbaiki">
        <p className="font-semibold text-foreground">Catatan panitia: {revision[0].reason ?? 'Periksa lagi data struk kamu.'}</p>
        <HoldLine detail={detail} what={what} />
      </Hero>
    )
    after = (
      <Button asChild className="h-14 w-full text-base">
        <Link to={`/app/checkout/${order.id}`}>Perbaiki dan kirim ulang struk</Link>
      </Button>
    )
  } else if (order.status === 'AWAITING_PAYMENT' || order.status === 'AWAITING_VERIFICATION') {
    const free = order.paymentMethod === 'FREE' || order.totalAmount === 0
    const receipt = order.status === 'AWAITING_VERIFICATION'
    hero = (
      <Hero tone="warn" icon={<Hourglass />} label={label} title={receipt ? 'Struk belum dikirim' : free ? 'Tinggal konfirmasi' : 'Tinggal bayar'}>
        <HoldLine detail={detail} what={what} />
      </Hero>
    )
    after = (
      <Button asChild className="h-14 w-full text-base">
        <Link to={`/app/checkout/${order.id}`}>{receipt ? 'Kirim struk' : free ? 'Konfirmasi pendaftaran' : 'Lanjutkan pembayaran'}</Link>
      </Button>
    )
  } else if (order.status === 'REJECTED') {
    hero = (
      <Hero tone="invalid" icon={<Ban />} label={label} title="Struk ditolak">
        <p className="font-semibold text-foreground">Alasan: {rejected?.reason ?? 'Struk tidak memenuhi syarat.'}</p>
        <p>{what} sudah dilepas. Kamu bisa pesan lagi dengan struk lain atau kategori lain.</p>
      </Hero>
    )
    after = (
      <>
        <ReceiptList detail={detail} />
        {again}
      </>
    )
  } else {
    const cancelled = order.status === 'CANCELLED'
    hero = (
      <Hero
        tone="neutral"
        icon={cancelled ? <Ban /> : <TimerOff />}
        label={label}
        title={cancelled ? (order.cancelledBy === 'ADMIN' ? 'Dibatalkan panitia' : 'Pesanan dibatalkan') : 'Waktu tahan habis'}
      >
        <p>{what} sudah dilepas supaya bisa dipilih pengunjung lain.</p>
        {cancelled && !!order.refundAmount && (
          <p className="rounded-xl bg-card/80 px-3 py-2 text-foreground">
            Refund <strong className="tabular-nums">{rupiahPlain(order.refundAmount)}</strong> diproses ke{' '}
            {order.paymentMethod ? PAYMENT_METHOD_LABEL[order.paymentMethod] : 'metode bayar asal'}, biasanya 3–5 hari kerja.
          </p>
        )}
      </Hero>
    )
    after = again
  }

  return (
    <div>
      <BackHeader to="/app/pass" title="Status pesanan" right={<span className="mr-3 font-mono text-xs text-muted-foreground">{order.code}</span>} />
      <div className="space-y-4 p-4 pb-10">
        {hero}
        {after}
        <OrderSummary detail={detail} />
      </div>
    </div>
  )
}

const HERO_TONE = {
  warn: { box: 'border-status-warn/50 bg-status-warn/10', icon: 'bg-status-warn/25 text-[#7a5600]' },
  invalid: { box: 'border-status-invalid/30 bg-status-invalid/6', icon: 'bg-status-invalid/12 text-[#a11b1b]' },
  neutral: { box: 'bg-card', icon: 'bg-muted text-muted-foreground' },
} as const

function Hero({ tone, icon, label, title, children }: { tone: keyof typeof HERO_TONE; icon: ReactNode; label: string; title: string; children?: ReactNode }) {
  const t = HERO_TONE[tone]
  return (
    <section className={cn('rounded-3xl border p-5', t.box)} aria-live="polite">
      <div className="flex items-start gap-3">
        <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-2xl [&_svg]:size-6', t.icon)} aria-hidden>
          {icon}
        </span>
        <div className="min-w-0">
          <StatusBadge tone={tone}>{label}</StatusBadge>
          <h1 className="mt-1.5 text-xl leading-tight font-extrabold text-balance">{title}</h1>
        </div>
      </div>
      {children && <div className="mt-3 space-y-2 text-sm text-muted-foreground">{children}</div>}
    </section>
  )
}

function HoldLine({ detail, what }: { detail: OrderDetail; what: string }) {
  const { order } = detail
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card/80 px-3 py-2">
      <span>
        {what} ditahan sampai <strong className="text-foreground">{fmtTime(order.holdExpiresAt)} WIB</strong>
      </span>
      <Countdown to={order.holdExpiresAt} className={cn('text-lg text-foreground', ORDER_TONE[order.status] === 'warn' && 'text-[#7a5600]')} />
    </div>
  )
}

function ReceiptList({ detail }: { detail: OrderDetail }) {
  const tenantName = (id: string) => detail.tenants.find((t) => t.id === id)?.name ?? 'Tenant'
  const total = detail.receipts.reduce((s, r) => s + r.amount, 0)
  return (
    <section className="rounded-2xl border bg-card p-4" aria-label="Struk yang dikirim">
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
            </span>
            <StatusBadge tone={RECEIPT_TONE[r.status]}>{RECEIPT_STATUS_LABEL[r.status]}</StatusBadge>
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
    <section className="rounded-2xl border bg-card p-4" aria-label="Kelola pesanan">
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
        {cancelPolicy.allowed
          ? `Bisa dibatalkan sampai ${CANCEL_MIN_HOURS} jam sebelum sesi mulai${cancelPolicy.refund ? ', uang kembali penuh (simulasi)' : ''}.`
          : cancelPolicy.reason}
        {!editPolicy.allowed && ` ${editPolicy.reason}`}
      </p>

      <Dialog open={mode === 'names'} onOpenChange={(o) => !busy && setMode(o ? 'names' : null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ubah nama peserta</DialogTitle>
            <DialogDescription>Nama tampil di e-ticket dan dicocokkan petugas. Tiket tetap terikat ke akunmu.</DialogDescription>
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
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Batalkan tiket ini?</DialogTitle>
            <DialogDescription>
              Semua e-ticket di pesanan {order.code} jadi tidak berlaku dan kursinya dilepas untuk pengunjung lain.
              {cancelPolicy.allowed && cancelPolicy.refund
                ? ` Refund ${rupiahPlain(cancelPolicy.refund)} diproses ke metode bayar asal (simulasi).`
                : ' Pesanan ini tidak memakai pembayaran, jadi tidak ada refund.'}
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
