/**
 * Edit profil (PV-06): the visitor's name and email, in a sheet. The phone number is the login, so it is shown and kept.
 * The form checks itself with the same rule the API applies, then saves through `api.updateProfile`.
 */
import { useId, useState, type FormEvent } from 'react'
import { LoaderCircle, Lock } from 'lucide-react'
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

export function EditProfileSheet({ user, open, onOpenChange, onSaved }: { user: User; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit profil</DialogTitle>
          <DialogDescription>Nama tampil di Akun dan jadi nama awal di e-ticket berikutnya.</DialogDescription>
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
  const [error, setError] = useState<{ field: 'name' | 'email' | null; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const checked = profileChanges({ name, email })
    if (!checked.ok) return setError({ field: checked.field, text: checked.reason })
    setError(null)
    setBusy(true)
    try {
      await api.updateProfile({ name, email })
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
        <Button type="submit" className="h-11" disabled={busy}>
          {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          Simpan
        </Button>
      </DialogFooter>
    </form>
  )
}
