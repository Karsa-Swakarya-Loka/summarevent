/**
 * Edit profil (PV-06): the visitor's photo, name and email, in a sheet. The phone number is the login, so it is shown
 * and kept. A picked photo is cut to its middle square on the phone and only sent with Simpan. The form checks itself
 * with the same rule the API applies, then saves through `api.updateProfile`.
 */
import { useId, useState, type FormEvent } from 'react'
import { Camera, LoaderCircle, Lock, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NAME_MAX, profileChanges } from '@/domain/rules'
import type { User } from '@/domain/types'
import { errorMessage } from '@/hooks/useLive'
import { maskPhone } from '@/lib/format'
import { squarePhoto } from '@/lib/image'
import { UserAvatar } from './UserAvatar'

export function EditProfileSheet({ user, open, onOpenChange, onSaved }: { user: User; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit profil</DialogTitle>
          <DialogDescription>Foto dan nama tampil di Akun. Nama jadi nama awal di e-ticket berikutnya.</DialogDescription>
        </DialogHeader>
        {/* a fresh form each time the sheet opens, filled with what is saved now */}
        {open && <ProfileForm user={user} onDone={() => onOpenChange(false)} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  )
}

function ProfileForm({ user, onDone, onSaved }: { user: User; onDone: () => void; onSaved: () => void }) {
  const id = useId()
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email ?? '')
  // undefined: the photo stays as it is; null: removed; a data URL: the new one
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<{ field: 'name' | 'email' | 'avatar' | null; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const shown = avatar === undefined ? user.avatarUrl : avatar

  const pick = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return setError({ field: 'avatar', text: 'Pilih file foto (JPG atau PNG).' })
    setReading(true)
    try {
      setAvatar(await squarePhoto(file))
      setError(null)
    } catch (err) {
      setError({ field: 'avatar', text: errorMessage(err) })
    } finally {
      setReading(false)
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const changes = { name, email, ...(avatar !== undefined && { avatar }) }
    const checked = profileChanges(changes)
    if (!checked.ok) return setError({ field: checked.field, text: checked.reason })
    setError(null)
    setBusy(true)
    try {
      await api.updateProfile(changes)
      onSaved()
      toast.success('Profil disimpan.')
      onDone()
    } catch (err) {
      const field = err instanceof ApiError && err.code === 'DUPLICATE' ? 'email' : null
      setError({ field, text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-4" noValidate>
      <div className="flex items-center gap-4">
        <span className="relative">
          <UserAvatar user={user} src={shown} className="size-20 text-3xl ring-4 ring-muted" />
          {reading && (
            <span className="absolute inset-0 grid place-items-center rounded-full bg-ink/50 text-white">
              <LoaderCircle className="size-6 animate-spin" aria-label="Menyiapkan foto" />
            </span>
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-ink px-4 text-sm font-semibold transition focus-within:ring-3 focus-within:ring-ring/50 hover:bg-muted active:scale-95">
            <Camera className="size-4" aria-hidden />
            {shown ? 'Ganti foto' : 'Pilih foto'}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={busy || reading}
              onChange={(e) => {
                void pick(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
          {shown && (
            <Button type="button" variant="ghost" className="h-11 text-muted-foreground" onClick={() => setAvatar(null)} disabled={busy || reading}>
              <Trash2 className="size-4" /> Hapus foto
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-name`}>Nama</Label>
        <Input
          id={`${id}-name`}
          autoComplete="name"
          value={name}
          maxLength={NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          className="h-12 text-base"
          aria-invalid={error?.field === 'name' || undefined}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-email`}>Email</Label>
        <Input
          id={`${id}-email`}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          placeholder="nama@contoh.id"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-12 text-base"
          aria-invalid={error?.field === 'email' || undefined}
          aria-describedby={`${id}-email-hint`}
        />
        <p id={`${id}-email-hint`} className="text-xs text-muted-foreground">
          Untuk kiriman e-ticket. Boleh dikosongkan.
        </p>
      </div>
      <p className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 text-sm">
        <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0">
          <span className="font-semibold tabular-nums">{maskPhone(user.phone)}</span>
          <span className="text-muted-foreground"> · nomor untuk masuk, tidak bisa diubah</span>
        </span>
      </p>
      {error && (
        <p role="alert" className="animate-rise rounded-xl bg-status-invalid/10 px-3 py-2 text-sm font-medium text-[#a11b1b]">
          {error.text}
        </p>
      )}
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" className="h-11" onClick={onDone} disabled={busy}>
          Batal
        </Button>
        <Button type="submit" className="h-11" disabled={busy || reading}>
          {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          Simpan
        </Button>
      </DialogFooter>
    </form>
  )
}
