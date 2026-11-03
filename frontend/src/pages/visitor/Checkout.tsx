/**
 * Checkout (PV-06 … PV-10): masuk → data peserta → bayar / tukar struk / konfirmasi gratis.
 * The hold countdown sits in the sticky header so it is always visible.
 */
import { useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { Check, Copy, FlaskConical, Landmark, LoaderCircle, QrCode, TimerOff, UserRound } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { api } from '@/api'
import type { OrderDetail, PaymentRequest } from '@/api/contract'
import { BackHeader, HoldPill } from '@/components/common/bits'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadError, PageSkeleton, SimTag } from '@/components/visitor/Common'
import { LoginPanel } from '@/components/visitor/LoginPanel'
import { OrderSummary } from '@/components/visitor/OrderSummary'
import { ReceiptForm } from '@/components/visitor/ReceiptForm'
import { seatRangeLabel } from '@/components/visitor/helpers'
import { useVisitor } from '@/components/visitor/hooks'
import type { User } from '@/domain/types'
import { errorMessage, useLive, useNow } from '@/hooks/useLive'
import { fmtTime, maskPhone, rupiahPlain } from '@/lib/format'
import { cn } from '@/lib/utils'

export default function Checkout() {
  const { orderId = '' } = useParams()
  const { user, refresh } = useVisitor()
  const q = useLive(() => api.getOrder(orderId), [orderId, user?.id])

  if (q.loading && !q.data) {
    return (
      <div>
        <BackHeader to="/app" title="Selesaikan pesanan" />
        <PageSkeleton />
      </div>
    )
  }
  if (!q.data) {
    return (
      <div>
        <BackHeader to="/app" title="Selesaikan pesanan" />
        <LoadError error={q.error} onRetry={q.reload} />
      </div>
    )
  }
  return <CheckoutBody detail={q.data} user={user} onLogin={refresh} />
}

type MethodKey = PaymentRequest['method']

function CheckoutBody({ detail, user, onLogin }: { detail: OrderDetail; user: User | null; onLogin: () => void }) {
  const navigate = useNavigate()
  const now = useNow(1000)
  const { order, event, session, category } = detail
  const seatPath = `/app/e/${event.slug}/s/${session.id}`
  const statusPath = `/app/orders/${order.id}`
  const seats = order.items.map((i) => i.seatLabel).filter((x): x is string => !!x)
  const what = seats.length ? `Kursi ${seatRangeLabel(seats)}` : `${order.qty} tempat ${category.name}`

  const [names, setNames] = useState<Record<string, string> | null>(null)
  const [method, setMethod] = useState<MethodKey>('SIM_QRIS')
  const [busy, setBusy] = useState<null | 'pay-ok' | 'pay-fail' | 'free' | 'cancel' | 'expire'>(null)
  const [payError, setPayError] = useState<string | null>(null)
  const [askCancel, setAskCancel] = useState(false)
  const payKey = useRef<string | null>(null)

  const pending = order.status === 'AWAITING_PAYMENT' || order.status === 'AWAITING_VERIFICATION'
  const expired = order.status === 'EXPIRED' || (pending && new Date(order.holdExpiresAt).getTime() <= now.getTime())
  const receiptsInReview = order.status === 'AWAITING_VERIFICATION' && detail.receipts.some((r) => r.status === 'PENDING')

  if (!expired && (!pending || receiptsInReview)) return <Navigate to={statusPath} replace />

  if (expired) {
    return (
      <div>
        <BackHeader to={`/app/e/${event.slug}`} title="Waktu tahan habis" />
        <div className="space-y-4 p-4">
          <section className="rounded-2xl border bg-card p-6 text-center" role="alert">
            <TimerOff className="mx-auto size-12 text-muted-foreground" aria-hidden />
            <h1 className="mt-3 text-xl font-bold">Waktu tahan habis</h1>
            <p className="mt-1 text-sm text-pretty text-muted-foreground">
              {what} sudah dilepas supaya bisa dipilih pengunjung lain. Pilih lagi dari denah, ya.
            </p>
            <Button asChild className="mt-5 h-12 w-full text-base">
              <Link to={seatPath}>Pesan ulang</Link>
            </Button>
          </section>
          <OrderSummary detail={{ ...detail, order: { ...order, status: 'EXPIRED' } }} compact />
        </div>
      </div>
    )
  }

  const fromOrder = () => Object.fromEntries(order.items.map((i) => [i.id, i.attendeeName ?? '']))
  const shownNames = names ?? fromOrder()

  const saveNames = async () => {
    if (!names) return
    const changes = order.items
      .filter((i) => (names[i.id] ?? '').trim() !== (i.attendeeName ?? ''))
      .map((i) => ({ itemId: i.id, name: (names[i.id] ?? '').trim() }))
    if (changes.length) await api.updateAttendees(order.id, changes)
  }

  const pay = async (outcome: PaymentRequest['outcome']) => {
    setBusy(outcome === 'SUCCESS' ? 'pay-ok' : 'pay-fail')
    setPayError(null)
    payKey.current ??= crypto.randomUUID()
    try {
      await saveNames()
      const res = await api.simulatePayment(order.id, { method, outcome, idempotencyKey: payKey.current })
      if (res.paymentStatus === 'SUCCESS') {
        toast.success('Pembayaran berhasil (simulasi).')
        navigate(statusPath, { replace: true })
        return
      }
      payKey.current = null
      setPayError(res.message)
    } catch (e) {
      payKey.current = null
      setPayError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const confirmFree = async () => {
    setBusy('free')
    setPayError(null)
    try {
      await saveNames()
      await api.confirmFree(order.id)
      toast.success('Pendaftaran terkonfirmasi.')
      navigate(statusPath, { replace: true })
    } catch (e) {
      setPayError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const expireNow = async () => {
    setBusy('expire')
    try {
      await api.demo.expireHold(order.id)
      toast('Waktu tahan dibuat habis (simulasi).', { description: `${what} kembali Tersedia untuk pengunjung lain.` })
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const cancel = async () => {
    setBusy('cancel')
    try {
      await api.cancelOrder(order.id)
      toast(`Pesanan dibatalkan. ${what} sudah dilepas.`)
      navigate(`/app/e/${event.slug}`, { replace: true })
    } catch (e) {
      toast.error(errorMessage(e))
      setBusy(null)
    }
  }

  const loggedIn = !!user
  const step3Title = category.accessMethod === 'PAID' ? 'Pembayaran' : category.accessMethod === 'RECEIPT' ? 'Tukar struk belanja' : 'Konfirmasi pendaftaran'

  return (
    <div>
      <BackHeader
        to={seatPath}
        title="Selesaikan pesanan"
        right={<HoldPill to={order.holdExpiresAt} label={seats.length ? 'Kursi ditahan' : 'Tempat ditahan'} />}
      />

      <div className="space-y-3 p-4 pb-10">
        <OrderSummary detail={detail} />
        <p className="px-1 text-xs text-muted-foreground">
          Selesaikan sebelum <strong className="text-foreground">{fmtTime(order.holdExpiresAt)} WIB</strong>. Lewat dari itu, {seats.length ? 'kursi' : 'tempat'} dilepas otomatis.
        </p>

        <Step n={1} title="Masuk" state={loggedIn ? 'done' : 'active'} hint={loggedIn ? undefined : 'E-ticket disimpan di akun nomor HP kamu.'}>
          {user ? (
            <p className="flex items-center gap-2 text-sm">
              <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0">
                <strong>{user.name}</strong> · {maskPhone(user.phone)}
              </span>
            </p>
          ) : (
            <LoginPanel intro="Kursimu tetap ditahan selama kamu masuk." onSuccess={() => onLogin()} />
          )}
        </Step>

        <Step n={2} title="Data peserta" state={loggedIn ? 'active' : 'locked'} hint={loggedIn ? 'Opsional. Nama tampil di e-ticket dan dicek petugas.' : 'Terbuka setelah kamu masuk.'}>
          {loggedIn && (
            <ul className="space-y-2">
              {order.items.map((item, i) => {
                const id = `att-${item.id}`
                return (
                  <li key={item.id} className="grid grid-cols-[5rem_1fr] items-center gap-2">
                    <Label htmlFor={id} className="text-sm font-semibold">
                      {item.seatLabel ? `Kursi ${item.seatLabel}` : `Orang ${i + 1}`}
                    </Label>
                    <Input
                      id={id}
                      value={shownNames[item.id] ?? ''}
                      onChange={(e) => setNames({ ...shownNames, [item.id]: e.target.value })}
                      placeholder="Nama peserta"
                      autoComplete="off"
                      className="h-11"
                      maxLength={60}
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </Step>

        <Step n={3} title={step3Title} state={loggedIn ? 'active' : 'locked'} hint={loggedIn ? undefined : 'Terbuka setelah kamu masuk.'}>
          {loggedIn && category.accessMethod === 'PAID' && (
            <div className="space-y-3">
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">Pilih cara bayar</legend>
                <div className="grid grid-cols-2 gap-2">
                  <MethodOption value="SIM_QRIS" current={method} onPick={setMethod} icon={<QrCode />} title="QRIS" sub="E-wallet atau m-banking" />
                  <MethodOption value="SIM_VA" current={method} onPick={setMethod} icon={<Landmark />} title="Virtual Account" sub="Transfer bank" />
                </div>
              </fieldset>

              {method === 'SIM_QRIS' ? <QrisBox detail={detail} /> : <VaBox detail={detail} phone={user.phone} />}

              {payError && (
                <p role="alert" className="rounded-lg bg-status-invalid/8 px-3 py-2 text-sm text-[#a11b1b]">
                  {payError}
                </p>
              )}
              <Button className="h-14 w-full text-base" onClick={() => void pay('SUCCESS')} disabled={!!busy}>
                {busy === 'pay-ok' ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Check className="size-5" aria-hidden />}
                Simulasikan bayar berhasil
              </Button>
              <Button variant="outline" className="h-11 w-full" onClick={() => void pay('FAIL')} disabled={!!busy}>
                {busy === 'pay-fail' && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
                Simulasikan bayar gagal
              </Button>
              <p className="text-center text-xs text-muted-foreground">Pembayaran disimulasikan. Tidak ada uang yang ditarik.</p>
            </div>
          )}

          {loggedIn && category.accessMethod === 'FREE' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Gratis, cukup konfirmasi. E-ticket QR langsung terbit untuk setiap {seats.length ? 'kursi' : 'orang'}.</p>
              {payError && (
                <p role="alert" className="rounded-lg bg-status-invalid/8 px-3 py-2 text-sm text-[#a11b1b]">
                  {payError}
                </p>
              )}
              <Button className="h-14 w-full text-base" onClick={() => void confirmFree()} disabled={!!busy}>
                {busy === 'free' ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Check className="size-5" aria-hidden />}
                Konfirmasi pendaftaran
              </Button>
            </div>
          )}

          {loggedIn && category.accessMethod === 'RECEIPT' && (
            <ReceiptForm detail={detail} beforeSubmit={saveNames} onSubmitted={() => navigate(statusPath, { replace: true })} disabled={!!busy} />
          )}
        </Step>

        <Button variant="ghost" className="h-11 w-full text-muted-foreground" onClick={() => setAskCancel(true)} disabled={!!busy}>
          Batalkan pesanan
        </Button>
        <button
          type="button"
          onClick={() => void expireNow()}
          disabled={!!busy}
          className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-ink/25 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-60"
        >
          {busy === 'expire' ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <FlaskConical className="size-4" aria-hidden />}
          Simulasikan waktu habis (demo)
        </button>
      </div>

      <Dialog open={askCancel} onOpenChange={(o) => busy !== 'cancel' && setAskCancel(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Batalkan pesanan ini?</DialogTitle>
            <DialogDescription>{what} akan dilepas dan bisa dipilih pengunjung lain.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11" onClick={() => setAskCancel(false)} disabled={busy === 'cancel'}>
              Tidak jadi
            </Button>
            <Button variant="destructive" className="h-11" onClick={() => void cancel()} disabled={busy === 'cancel'}>
              {busy === 'cancel' && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              Ya, batalkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Step({ n, title, hint, state, children }: { n: number; title: string; hint?: ReactNode; state: 'done' | 'active' | 'locked'; children?: ReactNode }) {
  const id = `step-${n}`
  return (
    <section aria-labelledby={id} className={cn('rounded-2xl border bg-card p-4', state === 'active' && 'border-brand/35', state === 'locked' && 'bg-muted/40')}>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
            state === 'done' ? 'bg-brand text-white' : state === 'active' ? 'bg-brand-soft text-brand ring-1 ring-brand/30' : 'bg-muted text-muted-foreground',
          )}
          aria-hidden
        >
          {state === 'done' ? <Check className="size-4" /> : n}
        </span>
        <div className="min-w-0">
          <h2 id={id} className={cn('leading-tight font-bold', state === 'locked' && 'text-muted-foreground')}>
            {title}
            {state === 'done' && <span className="sr-only"> (selesai)</span>}
          </h2>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {children && <div className="mt-3">{children}</div>}
    </section>
  )
}

function MethodOption({ value, current, onPick, icon, title, sub }: { value: MethodKey; current: MethodKey; onPick: (v: MethodKey) => void; icon: ReactNode; title: string; sub: string }) {
  const active = value === current
  return (
    <label
      className={cn(
        'flex min-h-16 cursor-pointer items-center gap-2.5 rounded-xl border p-3 transition has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
        active ? 'border-brand bg-brand-soft' : 'bg-card hover:border-foreground/30',
      )}
    >
      <input type="radio" name="pay-method" value={value} checked={active} onChange={() => onPick(value)} className="sr-only" />
      <span className={cn('[&_svg]:size-5', active ? 'text-brand' : 'text-muted-foreground')} aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-sm font-bold">{title}</span>
        <span className="block text-[0.7rem] text-muted-foreground">{sub}</span>
      </span>
    </label>
  )
}

function QrisBox({ detail }: { detail: OrderDetail }) {
  const { order } = detail
  return (
    <div className="flex items-center gap-4 rounded-xl border border-dashed border-ink/25 bg-muted/50 p-3">
      <div className="relative shrink-0 rounded-lg bg-white p-2">
        <QRCodeSVG value={`SUMMAREVENT-SIMULASI|QRIS|${order.code}|${order.totalAmount}`} size={112} level="M" marginSize={0} fgColor="#231f20" title="QRIS simulasi" />
        <SimTag className="absolute -top-2 left-1/2 -translate-x-1/2" />
      </div>
      <div className="min-w-0 text-sm">
        <p className="text-xs text-muted-foreground">Bayar ke</p>
        <p className="font-semibold">Summarevent · SUMMABA</p>
        <p className="mt-2 text-xs text-muted-foreground">Total</p>
        <p className="text-xl font-extrabold tabular-nums">{rupiahPlain(order.totalAmount)}</p>
        <p className="mt-1 text-[0.7rem] text-muted-foreground">QR simulasi, tidak bisa dipindai untuk bayar sungguhan.</p>
      </div>
    </div>
  )
}

function VaBox({ detail, phone }: { detail: OrderDetail; phone: string }) {
  const va = `8808${phone.replace(/\D/g, '').slice(-10).padStart(10, '0')}`
  const pretty = va.replace(/(\d{4})(?=\d)/g, '$1 ')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(va)
      toast.success('Nomor VA disalin.')
    } catch {
      toast.info(`Nomor VA: ${va}`)
    }
  }
  return (
    <div className="rounded-xl border border-dashed border-ink/25 bg-muted/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Nomor Virtual Account · Bank Simulasi</span>
        <SimTag />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="font-mono text-xl font-bold tracking-wide tabular-nums">{pretty}</span>
        <Button type="button" variant="outline" className="h-11 bg-card" onClick={() => void copy()} aria-label="Salin nomor virtual account">
          <Copy /> Salin
        </Button>
      </div>
      <div className="mt-2 flex items-baseline justify-between border-t border-dashed border-ink/15 pt-2 text-sm">
        <span className="text-muted-foreground">Total transfer</span>
        <span className="text-xl font-extrabold tabular-nums">{rupiahPlain(detail.order.totalAmount)}</span>
      </div>
    </div>
  )
}
