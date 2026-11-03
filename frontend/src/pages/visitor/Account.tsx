/**
 * Akun (PV-06), like a phone's profile screen: who is signed in, one main button, then grouped rows: activity (orders,
 * waiting lists) and preferences (install, notifications, the intro again, sign out). Signed out: the way in.
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Hourglass, LogOut, Play, Ticket, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import { EmptyState, StatusBadge } from '@/components/common/bits'
import { Illustration } from '@/components/common/Illustration'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AppSetupRows } from '@/components/visitor/AppSetup'
import { LoadError } from '@/components/visitor/Common'
import { SettingsGroup, SettingsRow } from '@/components/visitor/SettingsList'
import { continuePath, seatRangeLabel, sessionWhen } from '@/components/visitor/helpers'
import { useVisitor } from '@/components/visitor/hooks'
import { ORDER_TONE, orderStatusLabel } from '@/domain/labels'
import type { User } from '@/domain/types'
import { errorMessage, useLive } from '@/hooks/useLive'
import { maskPhone } from '@/lib/format'
import { setOnboardingDone } from '@/lib/intro'

export default function Account() {
  const { user, refresh } = useVisitor()
  return user ? <Profile user={user} onLogout={refresh} /> : <SignedOut onLogin={refresh} />
}

/** Replays the visitor onboarding, from the preferences of either state. */
function IntroRow() {
  const navigate = useNavigate()
  return (
    <SettingsRow
      icon={<Play />}
      tint="bg-[#fff7c7] text-[#7a5600]"
      title="Lihat pengenalan lagi"
      onClick={() => {
        setOnboardingDone(false)
        navigate('/app/mulai')
      }}
    />
  )
}

function SignedOut({ onLogin }: { onLogin: () => void }) {
  const [busy, setBusy] = useState(false)
  const loginAsPersona = async () => {
    setBusy(true)
    try {
      const u = await api.demoLogin('VISITOR')
      onLogin()
      toast.success(`Masuk sebagai ${u.name} (data contoh).`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-7 px-4 pt-[max(2.25rem,env(safe-area-inset-top))] pb-6">
      <header className="flex animate-rise flex-col items-center text-center">
        <span className="relative grid size-28 place-items-center overflow-hidden rounded-full bg-brand-soft shadow-md ring-4 ring-white">
          <span className="seat-dots absolute inset-0 text-brand/15" aria-hidden />
          <Illustration name="tiket" className="relative w-24" />
        </span>
        <h1 className="mt-4 text-[1.7rem] leading-tight font-extrabold tracking-tight">Akun Summarevent</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Cukup nomor HP, tanpa kata sandi.</p>
        <div className="mt-5 flex gap-2">
          <Button asChild className="h-12 px-7 text-base">
            <Link to="/app/masuk?next=/app/akun">Masuk</Link>
          </Button>
          <Button asChild variant="outline" className="h-12 px-7 text-base">
            <Link to="/app/daftar?next=/app/akun">Daftar</Link>
          </Button>
        </div>
      </header>

      <SettingsGroup id="try-title" title="Coba dulu">
        <SettingsRow
          icon={<UserRound />}
          tint="bg-brand-soft text-[#0b6b35]"
          title="Masuk sebagai Rina"
          sub="Akun contoh yang sudah punya tiket"
          onClick={() => !busy && void loginAsPersona()}
        />
      </SettingsGroup>

      <SettingsGroup id="pref-title" title="Preferensi">
        <AppSetupRows />
        <IntroRow />
      </SettingsGroup>
    </div>
  )
}

function Profile({ user, onLogout }: { user: User; onLogout: () => void }) {
  const orders = useLive(() => api.myOrders(), [user.id])
  const waitlist = useLive(() => api.myWaitlist(), [user.id])
  const leave = async (id: string) => {
    try {
      await api.leaveWaitlist(id)
      toast('Kamu keluar dari daftar tunggu.')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  const list = (orders.data ?? []).filter((d) => !d.order.simulated)
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div className="space-y-7 px-4 pt-[max(2.25rem,env(safe-area-inset-top))] pb-6">
      <header className="flex animate-rise flex-col items-center text-center">
        <span className="grid size-24 place-items-center rounded-full bg-brand-yellow font-poster text-4xl text-ink shadow-md ring-4 ring-white" aria-hidden>
          {initials}
        </span>
        <h1 className="mt-4 text-[1.7rem] leading-tight font-extrabold tracking-tight">{user.name}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">{maskPhone(user.phone)}</p>
        <Button asChild className="mt-4 h-11 px-6">
          <Link to="/app/pass">Lihat Pass Saya</Link>
        </Button>
      </header>

      {!!waitlist.data?.length && (
        <SettingsGroup id="wl-title" title="Daftar tunggu">
          {waitlist.data.map((w) => (
            <SettingsRow
              key={w.id}
              icon={<Hourglass />}
              tint="bg-[#fff1e2] text-[#b4480b]"
              title={<span className="block truncate">{w.event.title}</span>}
              sub={
                <>
                  <span className="block truncate">
                    {sessionWhen(w.session)} · {w.category.name} · {w.qty} orang
                  </span>
                  <span className="mt-1 block font-semibold">
                    {w.status === 'NOTIFIED' ? (
                      <Link to={`/app/e/${w.event.slug}/s/${w.sessionId}?c=${w.categoryId}`} className="text-foreground underline underline-offset-2">
                        Ada tempat lepas, pesan sekarang
                      </Link>
                    ) : (
                      <span className="text-[#7a5600]">Menunggu, urutan ke-{w.position}</span>
                    )}
                  </span>
                </>
              }
              right={
                w.status === 'WAITING' ? (
                  <Button variant="ghost" className="h-11 shrink-0 text-muted-foreground" onClick={() => void leave(w.id)}>
                    Keluar
                  </Button>
                ) : null
              }
            />
          ))}
        </SettingsGroup>
      )}

      {orders.loading && !orders.data ? (
        <div className="space-y-2" aria-busy="true" aria-label="Memuat pesanan">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
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
        <SettingsGroup id="orders-title" title="Pesanan">
          {list.map((d) => {
            const seats = d.order.items.map((i) => i.seatLabel).filter((x): x is string => !!x)
            return (
              <SettingsRow
                key={d.order.id}
                to={continuePath(d)}
                icon={<Ticket />}
                tint="bg-ink/[0.06] text-ink"
                title={<span className="block truncate">{d.event.title}</span>}
                sub={
                  <>
                    <span className="block truncate">
                      {sessionWhen(d.session)} · {d.category.name} · {seats.length ? seatRangeLabel(seats) : `${d.order.qty} orang`}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <StatusBadge tone={ORDER_TONE[d.order.status]}>{orderStatusLabel(d.order.status, d.order.paymentMethod, d.order.totalAmount)}</StatusBadge>
                      <span className="font-mono text-[0.7rem] whitespace-nowrap">{d.order.code}</span>
                    </span>
                  </>
                }
              />
            )
          })}
        </SettingsGroup>
      )}

      <SettingsGroup id="pref-title" title="Preferensi">
        <AppSetupRows />
        <IntroRow />
        <SettingsRow
          danger
          icon={<LogOut />}
          title="Keluar dari akun"
          onClick={() => {
            api.logout('VISITOR')
            onLogout()
            toast('Kamu sudah keluar.')
          }}
        />
      </SettingsGroup>
    </div>
  )
}
