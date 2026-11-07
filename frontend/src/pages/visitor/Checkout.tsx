/**
 * Checkout (PV-06 … PV-10) in two steps: masuk, then bayar, kirim struk or konfirmasi gratis. The slip on top says what
 * is being ordered, the hold countdown rides in the app bar, and the step's one action waits at the bottom of the screen.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { Check, Copy, FlaskConical, Landmark, LoaderCircle, QrCode, UserRound } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { api } from '@/api'
import type { OrderDetail, PaymentRequest } from '@/api/contract'
import { BackHeader, HoldPill } from '@/components/common/bits'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BottomBar, LoadError, PageSkeleton, SectionLabel, SimTag } from '@/components/visitor/Common'
import { LoginPanel } from '@/components/visitor/LoginPanel'
import { OrderSummary } from '@/components/visitor/OrderSummary'
import { ReceiptForm } from '@/components/visitor/ReceiptForm'
import { StatusHero } from '@/components/visitor/StatusHero'
import { seatRangeLabel } from '@/components/visitor/helpers'
import { useVisitor } from '@/components/visitor/hooks'
import type { AccessMethod, OrderItem, User } from '@/domain/types'
import { errorMessage, useLive } from '@/hooks/useLive'
import { maskPhone, rupiahPlain } from '@/lib/format'
import { cn } from '@/lib/utils'

export default function Checkout() {
  const { orderId = '' } = useParams()
  const { user, refresh } = useVisitor()
  const q = useLive(() => api.getOrder(orderId), [orderId, user?.id])

  if (q.loading && !q.data) {
    return (
      <div>
        <BackHeader to="/app" title="Pesanan" />
        <PageSkeleton />
      </div>
    )
  }
  if (!q.data) {
    return (
      <div>
        <BackHeader to="/app" title="Pesanan" />
        <LoadError error={q.error} onRetry={q.reload} />
      </div>
    )
  }
  return <CheckoutBody detail={q.data} user={user} onLogin={refresh} />
}

type MethodKey = PaymentRequest['method']

const TITLE: Record<AccessMethod, string> = { PAID: 'Pembayaran', RECEIPT: 'Tukar struk', FREE: 'Pendaftaran' }
const LAST_STEP: Record<AccessMethod, string> = { PAID: 'Bayar', RECEIPT: 'Kirim struk', FREE: 'Konfirmasi' }

/**
 * True once `iso` has passed. It wakes the screen once at that moment instead of every second, so the form (and the QR
 * on it) is not drawn again sixty times a minute on the visitor's phone; the countdown in the app bar ticks on its own.
 */
function usePassed(iso: string): boolean {
  const at = new Date(iso).getTime()
  // the moment last seen as passed; a later hold (a new order on the same screen) starts unpassed again
  const [passedAt, setPassedAt] = useState(() => (at <= Date.now() ? at : null))
  useEffect(() => {
    const left = at - Date.now()
    // browsers cap a timer near 24.8 days; a hold is minutes, so this is only a guard
    const t = window.setTimeout(() => setPassedAt(at), Math.max(0, Math.min(left + 50, 2 ** 31 - 1)))
    return () => window.clearTimeout(t)
  }, [at])
  return passedAt === at
}

function CheckoutBody({ detail, user, onLogin }: { detail: OrderDetail; user: User | null; onLogin: () => void }) {
  const navigate = useNavigate()
  const { order, event, session, category } = detail
  const holdPassed = usePassed(order.holdExpiresAt)
  const access = category.accessMethod
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
  const expired = order.status === 'EXPIRED' || (pending && holdPassed)
  const receiptsInReview = order.status === 'AWAITING_VERIFICATION' && detail.receipts.some((r) => r.status === 'PENDING')

  if (!expired && (!pending || receiptsInReview)) return <Navigate to={statusPath} replace />

  if (expired) {
    return (
      <div>
        <BackHeader to={`/app/e/${event.slug}`} title="Pesanan" />
        <div className="space-y-4 p-4 pb-10">
          <StatusHero tone="ink" art="kursi" label={seats.length ? 'Kursi dilepas' : 'Tempat dilepas'} title="Waktu tahan habis">
            <p>{what} kembali tersedia.</p>
          </StatusHero>
          <Button asChild className="h-14 w-full text-base">
            <Link to={seatPath}>Pesan ulang</Link>
          </Button>
          <OrderSummary detail={detail} />
        </div>
      </div>
    )
  }

  const shownNames = names ?? Object.fromEntries(order.items.map((i) => [i.id, i.attendeeName ?? '']))

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
      toast('Waktu tahan habis (simulasi).')
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
      toast(`Pesanan dibatalkan. ${what} dilepas.`)
      navigate(`/app/e/${event.slug}`, { replace: true })
    } catch (e) {
      toast.error(errorMessage(e))
      setBusy(null)
    }
  }

  const error = payError && (
    <p role="alert" className="mb-2 animate-rise rounded-xl bg-status-invalid/10 px-3 py-2 text-sm font-medium text-[#a11b1b]">
      {payError}
    </p>
  )

  const footer = (
    <div className="space-y-1 pt-1">
      <div className="flex items-center gap-2 rounded-2xl border border-dashed border-ink/25 p-1.5 pl-3">
        <span className="flex flex-1 items-center gap-1.5 text-[0.66rem] font-bold tracking-[0.16em] text-muted-foreground uppercase">
          <FlaskConical className="size-3.5" aria-hidden /> Demo
        </span>
        {user && access === 'PAID' && (
          <DemoButton label="Simulasikan bayar gagal" busy={busy === 'pay-fail'} disabled={!!busy} onClick={() => void pay('FAIL')}>
            Bayar gagal
          </DemoButton>
        )}
        <DemoButton label="Simulasikan waktu habis" busy={busy === 'expire'} disabled={!!busy} onClick={() => void expireNow()}>
          Waktu habis
        </DemoButton>
      </div>
      <Button variant="ghost" className="h-11 w-full text-muted-foreground" onClick={() => setAskCancel(true)} disabled={!!busy}>
        Batalkan pesanan
      </Button>
    </div>
  )

  return (
    <div className="flex flex-1 flex-col">
      <BackHeader to={seatPath} title={TITLE[access]} right={<HoldPill to={order.holdExpiresAt} label={seats.length ? 'Kursi ditahan' : 'Tempat ditahan'} />} />

      <div className="space-y-5 px-4 pt-1 pb-5">
        <div className="space-y-3">
          <Progress step={user ? 2 : 1} last={LAST_STEP[access]} />
          {user && (
            <p className="flex animate-rise items-center gap-2 px-1 text-sm text-muted-foreground">
              <UserRound className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">
                <strong className="text-foreground">{user.name}</strong> · {maskPhone(user.phone)}
              </span>
            </p>
          )}
        </div>

        <OrderSummary detail={detail} />

        {user ? (
          <AttendeeNames items={order.items} names={shownNames} onChange={(id, name) => setNames({ ...shownNames, [id]: name })} />
        ) : (
          <section aria-labelledby="login-title" className="animate-rise">
            <h2 id="login-title" className="font-poster text-[2.1rem] leading-none uppercase">
              Masuk dulu
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">E-ticket disimpan di nomor HP kamu.</p>
            <LoginPanel className="mt-4" onSuccess={() => onLogin()} />
          </section>
        )}
      </div>

      {user && access === 'RECEIPT' ? (
        <ReceiptForm detail={detail} beforeSubmit={saveNames} onSubmitted={() => navigate(statusPath, { replace: true })} disabled={!!busy}>
          {footer}
        </ReceiptForm>
      ) : (
        <>
          <div className="flex-1 space-y-5 px-4 pb-8">
            {user && access === 'PAID' && (
              <section aria-labelledby="pay-title" className="animate-rise space-y-2.5">
                <SectionLabel id="pay-title">Bayar pakai</SectionLabel>
                <MethodSwitch labelledBy="pay-title" value={method} onChange={setMethod} />
                <div key={method} className="animate-rise">
                  {method === 'SIM_QRIS' ? <QrisBox detail={detail} /> : <VaBox phone={user.phone} />}
                </div>
              </section>
            )}
            {footer}
          </div>

          {user && access === 'PAID' && (
            <BottomBar>
              {error}
              <Button className="h-14 w-full gap-2 text-base" onClick={() => void pay('SUCCESS')} disabled={!!busy}>
                {busy === 'pay-ok' && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
                Bayar {rupiahPlain(order.totalAmount)}
                <SimTag className="bg-white text-ink" />
              </Button>
            </BottomBar>
          )}
          {user && access === 'FREE' && (
            <BottomBar>
              {error}
              <Button className="h-14 w-full text-base" onClick={() => void confirmFree()} disabled={!!busy}>
                {busy === 'free' ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Check className="size-5" aria-hidden />}
                Konfirmasi pendaftaran
              </Button>
            </BottomBar>
          )}
        </>
      )}

      <Dialog open={askCancel} onOpenChange={(o) => busy !== 'cancel' && setAskCancel(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Batalkan pesanan ini?</DialogTitle>
            <DialogDescription>{what} dilepas dan bisa dipilih orang lain.</DialogDescription>
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

/** Two steps as two bars: the one in progress partly filled, the one done full, so signing in visibly moves it on. */
function Progress({ step, last }: { step: 1 | 2; last: string }) {
  return (
    <ol className="grid grid-cols-2 gap-2" aria-label="Langkah pesanan">
      {['Masuk', last].map((title, i) => {
        const n = i + 1
        const done = n < step
        const now = n === step
        return (
          <li key={title} aria-current={now ? 'step' : undefined} className="min-w-0">
            <span className="block h-1.5 overflow-hidden rounded-full bg-ink/10">
              <span
                className="block h-full origin-left rounded-full bg-ink transition-transform duration-700 ease-(--ease-soft)"
                style={{ transform: `scaleX(${done ? 1 : now ? 0.4 : 0})` }}
              />
            </span>
            <span className={cn('mt-1.5 flex items-center gap-1 text-[0.66rem] font-bold tracking-[0.16em] uppercase', done || now ? 'text-ink' : 'text-muted-foreground')}>
              {done ? <Check className="size-3.5 animate-pop" aria-hidden /> : <span aria-hidden>{n}</span>}
              {title}
              {done && <span className="sr-only">(selesai)</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** One name per seat; the seat sits beside it in display type, the way it is printed on the e-ticket. */
function AttendeeNames({ items, names, onChange }: { items: OrderItem[]; names: Record<string, string>; onChange: (itemId: string, name: string) => void }) {
  return (
    <section aria-labelledby="names-title" className="animate-rise space-y-2.5">
      <SectionLabel id="names-title" right={<span className="text-xs text-muted-foreground">Opsional</span>}>
        Nama di e-ticket
      </SectionLabel>
      <ul className="space-y-2">
        {items.map((item, i) => {
          const id = `att-${item.id}`
          return (
            <li key={item.id} className="flex items-center gap-2">
              <Label htmlFor={id} className="flex h-11 min-w-13 shrink-0 justify-center rounded-[0.9rem] bg-ink px-2 font-poster text-xl font-normal text-white">
                <span className="sr-only">{item.seatLabel ? 'Kursi ' : 'Orang '}</span>
                {item.seatLabel ?? i + 1}
              </Label>
              <Input
                id={id}
                value={names[item.id] ?? ''}
                onChange={(e) => onChange(item.id, e.target.value)}
                placeholder="Nama peserta"
                autoComplete="off"
                className="h-11 bg-card"
                maxLength={60}
              />
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const METHODS: Array<{ value: MethodKey; title: string; icon: typeof QrCode }> = [
  { value: 'SIM_QRIS', title: 'QRIS', icon: QrCode },
  { value: 'SIM_VA', title: 'Virtual Account', icon: Landmark },
]

/** QRIS or Virtual Account as one switch; the ink pill slides to the choice. */
function MethodSwitch({ value, onChange, labelledBy }: { value: MethodKey; onChange: (v: MethodKey) => void; labelledBy: string }) {
  const at = METHODS.findIndex((m) => m.value === value)
  return (
    <fieldset aria-labelledby={labelledBy} className="relative grid grid-cols-2 rounded-full bg-ink/[0.07] p-1">
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-ink shadow-sm transition-transform duration-300 ease-(--ease-soft)"
        style={{ transform: `translateX(${at * 100}%)` }}
      />
      {METHODS.map(({ value: v, title, icon: Icon }) => (
        <label
          key={v}
          className={cn(
            'relative flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full text-sm font-bold transition-colors duration-300 has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
            v === value ? 'text-white' : 'text-ink/70',
          )}
        >
          <input type="radio" name="pay-method" value={v} checked={v === value} onChange={() => onChange(v)} className="sr-only" />
          <Icon className="size-4 shrink-0" aria-hidden />
          {title}
        </label>
      ))}
    </fieldset>
  )
}

function QrisBox({ detail }: { detail: OrderDetail }) {
  const { order } = detail
  return (
    <div className="flex items-center gap-4 rounded-[1.4rem] bg-card p-4 shadow-xs">
      <div className="shrink-0 rounded-xl bg-white p-2 ring-1 ring-border">
        <QRCodeSVG value={`SUMMAREVENT-SIMULASI|QRIS|${order.code}|${order.totalAmount}`} size={112} level="M" marginSize={0} fgColor="#231f20" title="QRIS simulasi" />
      </div>
      <div className="min-w-0">
        <SimTag />
        <p className="mt-2 leading-snug font-bold">QR simulasi, tidak perlu dipindai. Tekan tombol bayar di bawah.</p>
        <p className="mt-1 text-xs text-muted-foreground">Summarevent · SUMMABA</p>
      </div>
    </div>
  )
}

function VaBox({ phone }: { phone: string }) {
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
    <div className="rounded-[1.4rem] bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.66rem] font-bold tracking-[0.16em] text-muted-foreground uppercase">Nomor VA · Bank Simulasi</span>
        <SimTag />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-mono text-xl font-bold tracking-wide tabular-nums">{pretty}</span>
        <Button type="button" variant="outline" size="icon" className="size-11 shrink-0" onClick={() => void copy()} aria-label="Salin nomor virtual account">
          <Copy />
        </Button>
      </div>
    </div>
  )
}

function DemoButton({ label, busy, disabled, onClick, children }: { label: string; busy: boolean; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-ink/15 bg-card px-3 text-xs font-bold transition hover:bg-muted active:scale-95 disabled:opacity-60"
    >
      {busy && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}
