/**
 * Petugas (AD-13): accounts that scan QR at the door and check receipts at the desk.
 * The panitia adds them, switches them off or on again, and sees their scan activity.
 */
import { useState, type FormEvent } from 'react'
import { LoaderCircle, Power, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError, apiMode } from '@/api'
import type { StaffAccount } from '@/api/contract'
import { Field, ListSkeleton, LoadError, PageHeader, SectionCard } from '@/components/admin/AdminUi'
import { EmptyState, StatusBadge } from '@/components/common/bits'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { errorMessage, useLive } from '@/hooks/useLive'
import { profileChanges } from '@/domain/rules'
import { fmtShortDate, fmtTime, isValidPhone, normalizePhone } from '@/lib/format'
import { cn } from '@/lib/utils'

export default function Staff() {
  const staff = useLive(() => api.admin.listStaff(), [])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<{ name?: string; phone?: string; email?: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const add = async (e: FormEvent) => {
    e.preventDefault()
    const errs: { name?: string; phone?: string; email?: string } = {}
    if (name.trim().length < 3) errs.name = 'Tulis nama petugas, minimal 3 huruf.'
    if (!isValidPhone(normalizePhone(phone))) errs.phone = 'Nomor HP belum benar. Contoh: 0812 3456 7890.'
    const mail = profileChanges({ email })
    if (!mail.ok || !mail.email) errs.email = 'Tulis email petugas, misalnya nama@contoh.id.'
    if (errs.name || errs.phone || errs.email) return setError(errs)
    setError(null)
    setBusy('add')
    try {
      const u = await api.admin.createStaff({ name, phone, email })
      toast.success(`Akun ${u.name} dibuat. Undangan dikirim ke ${u.email}.`, { description: apiMode === 'live' ? undefined : 'Di versi demo, petugas membuat kata sandi lewat Lupa kata sandi di halaman masuk.' })
      setName('')
      setPhone('')
      setEmail('')
    } catch (err) {
      const field = err instanceof ApiError && (err.details as { field?: string } | undefined)?.field
      if (field === 'email' || field === 'phone' || field === 'name') setError({ [field]: errorMessage(err) })
      else toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const toggle = async (s: StaffAccount) => {
    setBusy(s.id)
    try {
      await api.admin.setStaffActive(s.id, !s.active)
      toast.success(s.active ? `${s.name} dinonaktifkan. Akun ini tidak bisa scan lagi.` : `${s.name} aktif lagi.`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const list = staff.data ?? []
  const active = list.filter((s) => s.active).length

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Petugas" description="Akun untuk scan QR di pintu masuk dan verifikasi struk di desk. Setiap scan tercatat atas nama petugasnya." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <SectionCard title={`${list.length} akun petugas`} description={staff.data ? `${active} aktif` : undefined}>
          {staff.error && !staff.data ? (
            <LoadError error={staff.error} onRetry={staff.reload} />
          ) : !staff.data ? (
            <ListSkeleton rows={3} />
          ) : !list.length ? (
            <EmptyState icon={<Users />} title="Belum ada akun petugas">
              Tambahkan petugas pertama lewat formulir di samping.
            </EmptyState>
          ) : (
            <ul className="divide-y">
              {list.map((s) => {
                const initials = s.name
                  .replace(/\(.*\)/, '')
                  .trim()
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase() ?? '')
                  .join('')
                return (
                  <li key={s.id} className={cn('flex flex-wrap items-center gap-3 py-3', !s.active && 'opacity-70')}>
                    <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold', s.active ? 'bg-brand text-white' : 'bg-muted text-muted-foreground')} aria-hidden>
                      {initials}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{s.name}</span>
                        <StatusBadge tone={s.active ? 'valid' : 'neutral'}>{s.active ? 'Aktif' : 'Nonaktif'}</StatusBadge>
                      </span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {s.phone} · {s.scans} tiket dipindai{s.lastScanAt ? ` · scan terakhir ${fmtShortDate(s.lastScanAt)} ${fmtTime(s.lastScanAt)}` : ''}
                      </span>
                    </span>
                    <Button variant="outline" size="lg" onClick={() => void toggle(s)} disabled={busy === s.id}>
                      {busy === s.id ? <LoaderCircle className="animate-spin" /> : <Power />} {s.active ? 'Nonaktifkan' : 'Aktifkan'}
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Tambah petugas" description="Undangan untuk membuat kata sandi dikirim ke email petugas.">
          <form onSubmit={(e) => void add(e)} className="flex flex-col gap-3" noValidate>
            <Field id="staff-name" label="Nama" error={error?.name}>
              <Input id="staff-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Petugas Pintu Selatan" className="h-11 sm:h-10" aria-invalid={!!error?.name} />
            </Field>
            <Field id="staff-phone" label="Nomor HP" error={error?.phone}>
              <Input id="staff-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0812 3456 7890" className="h-11 sm:h-10" aria-invalid={!!error?.phone} />
            </Field>
            <Field id="staff-email" label="Email" error={error?.email}>
              <Input id="staff-email" type="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@contoh.id" className="h-11 sm:h-10" aria-invalid={!!error?.email} />
            </Field>
            <Button type="submit" size="lg" className="h-11" disabled={busy === 'add'}>
              {busy === 'add' ? <LoaderCircle className="animate-spin" /> : <UserPlus />} Tambah petugas
            </Button>
          </form>
        </SectionCard>
      </div>
    </div>
  )
}
