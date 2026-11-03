/**
 * Profil (PV-06): who the visitor is to Summarevent. The avatar and name, their tickets and orders at a glance, then
 * the account's data as settings rows; the name and the email open the edit sheet, the phone number is the login.
 */
import { useState } from 'react'
import { Navigate } from 'react-router'
import { CalendarDays, Lock, Mail, Smartphone, UserRound } from 'lucide-react'
import { api } from '@/api'
import { BackHeader } from '@/components/common/bits'
import { Button } from '@/components/ui/button'
import { EditProfileSheet } from '@/components/visitor/EditProfileSheet'
import { SettingsGroup, SettingsRow } from '@/components/visitor/SettingsList'
import { useVisitor } from '@/components/visitor/hooks'
import { useLive } from '@/hooks/useLive'
import { fmtDate, maskPhone } from '@/lib/format'

export default function Profile() {
  const { user, refresh } = useVisitor()
  const tickets = useLive(() => (user ? api.myTickets() : Promise.resolve([])), [user?.id])
  const orders = useLive(() => (user ? api.myOrders() : Promise.resolve([])), [user?.id])
  const [edit, setEdit] = useState(false)

  if (!user) return <Navigate to="/app/masuk?next=/app/akun/profil" replace />

  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
  const active = (tickets.data ?? []).filter((t) => t.ticket.status === 'ACTIVE').length
  const placed = (orders.data ?? []).filter((d) => !d.order.simulated).length
  const value = (text: string, muted = false) => <span className={`max-w-[55%] truncate text-right text-sm ${muted ? 'text-muted-foreground' : ''}`}>{text}</span>

  return (
    <div className="flex flex-1 flex-col">
      <BackHeader to="/app/akun" title="Profil" />
      <div className="space-y-7 px-4 pt-3 pb-10">
        <header className="flex animate-rise flex-col items-center text-center">
          <span className="grid size-28 place-items-center rounded-full bg-brand-yellow font-poster text-5xl text-ink shadow-md ring-4 ring-white" aria-hidden>
            {initials}
          </span>
          <h1 className="mt-4 text-[1.7rem] leading-tight font-extrabold tracking-tight">{user.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{user.email ?? maskPhone(user.phone)}</p>
          <Button className="mt-4 h-11 px-6" onClick={() => setEdit(true)}>
            Edit profil
          </Button>
        </header>

        <dl className="grid animate-rise grid-cols-2 gap-3 [animation-delay:60ms]">
          <div className="rounded-[1.4rem] bg-card p-4 shadow-xs">
            <dt className="text-[0.66rem] font-bold tracking-[0.18em] text-muted-foreground uppercase">Tiket aktif</dt>
            <dd className="mt-1 font-poster text-[2.4rem] leading-none tabular-nums">{active}</dd>
          </div>
          <div className="rounded-[1.4rem] bg-card p-4 shadow-xs">
            <dt className="text-[0.66rem] font-bold tracking-[0.18em] text-muted-foreground uppercase">Pesanan</dt>
            <dd className="mt-1 font-poster text-[2.4rem] leading-none tabular-nums">{placed}</dd>
          </div>
        </dl>

        <SettingsGroup id="data-title" title="Data akun">
          <SettingsRow icon={<UserRound />} tint="bg-brand-soft text-[#0b6b35]" title="Nama" right={value(user.name)} onClick={() => setEdit(true)} chevron />
          <SettingsRow icon={<Mail />} tint="bg-[#e8eefa] text-[#2d4c8f]" title="Email" right={value(user.email ?? 'Belum diisi', !user.email)} onClick={() => setEdit(true)} chevron />
          <SettingsRow
            icon={<Smartphone />}
            tint="bg-[#fff1e2] text-[#b4480b]"
            title="Nomor HP"
            sub="Untuk masuk, tidak bisa diubah"
            right={
              <span className="flex shrink-0 items-center gap-1.5 text-sm tabular-nums">
                {maskPhone(user.phone)} <Lock className="size-3.5 text-muted-foreground" aria-hidden />
              </span>
            }
          />
          <SettingsRow
            icon={<CalendarDays />}
            tint="bg-[#fff7c7] text-[#7a5600]"
            title="Bergabung"
            right={value(fmtDate(user.createdAt, { day: 'numeric', month: 'long', year: 'numeric' }), true)}
          />
        </SettingsGroup>
      </div>

      <EditProfileSheet user={user} open={edit} onOpenChange={setEdit} onSaved={refresh} />
    </div>
  )
}
