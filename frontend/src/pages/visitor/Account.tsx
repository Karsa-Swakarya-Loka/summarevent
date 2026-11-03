/**
 * Akun (PV-06): the way in (Masuk, Daftar, or the sample visitor), or the visitor's profile and order history.
 */
import { useState } from 'react'
import { Link } from 'react-router'
import { ChevronRight, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import { EmptyState, StatusBadge } from '@/components/common/bits'
import { Illustration } from '@/components/common/Illustration'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { LoadError } from '@/components/visitor/Common'
import { AppSetupCard } from '@/components/visitor/AppSetup'
import { continuePath, seatRangeLabel, sessionWhen } from '@/components/visitor/helpers'
import { useVisitor } from '@/components/visitor/hooks'
import { ORDER_TONE, orderStatusLabel } from '@/domain/labels'
import { errorMessage, useLive } from '@/hooks/useLive'
import { maskPhone } from '@/lib/format'

export default function Account() {
  const { user, refresh } = useVisitor()
  const [demoBusy, setDemoBusy] = useState(false)

  const loginAsPersona = async () => {
    setDemoBusy(true)
    try {
      const u = await api.demoLogin('VISITOR')
      refresh()
      toast.success(`Masuk sebagai ${u.name} (data contoh).`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setDemoBusy(false)
    }
  }

  if (!user) {
    return (
      <div className="px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-10">
        <div className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[2rem] bg-brand-soft">
          <div className="seat-dots absolute inset-0 text-brand/15" aria-hidden />
          <Illustration name="tiket" className="relative w-44 animate-pop" />
        </div>
        <h1 className="mt-6 text-[1.75rem] leading-tight font-extrabold tracking-tight">Akun Summarevent</h1>
        <p className="mt-1.5 text-base text-muted-foreground">Masuk untuk melihat e-ticket, pesanan, dan daftar tunggumu. Cukup nomor HP, tanpa kata sandi.</p>
        <div className="mt-6 grid gap-2">
          <Button asChild className="h-14 text-base">
            <Link to="/app/masuk?next=/app/akun">Masuk</Link>
          </Button>
          <Button asChild variant="outline" className="h-12 text-base">
            <Link to="/app/daftar?next=/app/akun">Daftar akun baru</Link>
          </Button>
        </div>
        <div className="mt-5 rounded-2xl border border-dashed border-ink/25 p-4 text-sm">
          <p className="font-semibold">Mau lihat akun yang sudah punya tiket?</p>
          <p className="mt-0.5 text-muted-foreground">Rina adalah pengunjung contoh dengan tiket dan pesanan.</p>
          <Button variant="outline" className="mt-3 h-11 w-full" onClick={() => void loginAsPersona()} disabled={demoBusy}>
            Masuk sebagai Rina (data contoh)
          </Button>
        </div>
      </div>
    )
  }

  return <Profile name={user.name} phone={user.phone} userId={user.id} onLogout={refresh} />
}

function Profile({ name, phone, userId, onLogout }: { name: string; phone: string; userId: string; onLogout: () => void }) {
  const orders = useLive(() => api.myOrders(), [userId])
  const waitlist = useLive(() => api.myWaitlist(), [userId])
  const leave = async (id: string) => {
    try {
      await api.leaveWaitlist(id)
      toast('Kamu keluar dari daftar tunggu.')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  const list = (orders.data ?? []).filter((d) => !d.order.simulated)
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div>
      <header className="px-4 pt-6 pb-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Akun</h1>
      </header>
      <div className="space-y-5 px-4 pt-2 pb-16">
        <section className="flex items-center gap-3 rounded-2xl border bg-card p-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-bold text-white" aria-hidden>
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{name}</p>
            <p className="text-sm text-muted-foreground tabular-nums">{maskPhone(phone)}</p>
          </div>
          <Button
            variant="outline"
            className="h-11"
            onClick={() => {
              api.logout('VISITOR')
              onLogout()
              toast('Kamu sudah keluar.')
            }}
          >
            <LogOut /> Keluar
          </Button>
        </section>

        <AppSetupCard />

        {!!waitlist.data?.length && (
          <section aria-label="Daftar tunggu" className="space-y-2">
            <h2 className="px-1 text-base font-bold">Daftar tunggu</h2>
            <ul className="space-y-2">
              {waitlist.data.map((w) => (
                <li key={w.id} className="flex items-center gap-3 rounded-2xl border bg-card p-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{w.event.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {sessionWhen(w.session)} · {w.category.name} · {w.qty} orang
                    </span>
                    <span className="mt-1 block text-xs font-semibold">
                      {w.status === 'NOTIFIED' ? (
                        <Link to={`/app/e/${w.event.slug}/s/${w.sessionId}?c=${w.categoryId}`} className="text-brand underline-offset-2 hover:underline">
                          Ada tempat lepas, pesan sekarang
                        </Link>
                      ) : (
                        <span className="text-[#7a5600]">Menunggu, urutan ke-{w.position}</span>
                      )}
                    </span>
                  </span>
                  {w.status === 'WAITING' && (
                    <Button variant="ghost" className="h-11 text-muted-foreground" onClick={() => void leave(w.id)}>
                      Keluar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label="Riwayat pesanan" className="space-y-2">
          <h2 className="px-1 text-base font-bold">Pesanan</h2>
          {orders.loading && !orders.data ? (
            <div className="space-y-2" aria-busy="true" aria-label="Memuat pesanan">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-2xl" />
              ))}
            </div>
          ) : orders.error && !orders.data ? (
            <LoadError error={orders.error} onRetry={orders.reload} />
          ) : !list.length ? (
            <EmptyState
              icon={<Illustration name="kursi" className="w-28" />}
              title="Belum ada pesanan"
              action={
                <Button asChild className="h-11">
                  <Link to="/app">Cari event</Link>
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2">
              {list.map((d) => {
                const seats = d.order.items.map((i) => i.seatLabel).filter((x): x is string => !!x)
                return (
                  <li key={d.order.id}>
                    <Link to={continuePath(d)} className="flex items-center gap-3 rounded-2xl border bg-card p-3 transition hover:border-foreground/25">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-bold">{d.event.title}</span>
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {sessionWhen(d.session)} · {d.category.name} · {seats.length ? seatRangeLabel(seats) : `${d.order.qty} orang`}
                        </span>
                        <span className="mt-1 flex items-center gap-2">
                          <StatusBadge tone={ORDER_TONE[d.order.status]}>{orderStatusLabel(d.order.status, d.order.paymentMethod, d.order.totalAmount)}</StatusBadge>
                          <span className="font-mono text-[0.7rem] text-muted-foreground">{d.order.code}</span>
                        </span>
                      </span>
                      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
