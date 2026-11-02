import { useId, useRef, useState, type FormEvent } from 'react'
import { MessageSquareText, Smartphone, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/api'
import type { User } from '@/domain/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/hooks/useLive'
import { isValidPhone, normalizePhone } from '@/lib/format'
import { cn } from '@/lib/utils'
import { SimTag } from './Common'

/**
 * Phone + OTP login (PV-06). The OTP is simulated and shown on screen ("SMS simulasi"),
 * new numbers are asked for a name. Guest holds are claimed by the API on login.
 */
export function LoginPanel({ onSuccess, intro, className }: { onSuccess: (user: User, isNew: boolean) => void; intro?: string; className?: string }) {
  const id = useId()
  const [phone, setPhone] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [simCode, setSimCode] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [needName, setNeedName] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const request = async (e?: FormEvent) => {
    e?.preventDefault()
    setError(null)
    const p = normalizePhone(phone)
    if (!isValidPhone(p)) {
      setError('Nomor HP belum benar. Tulis seperti 0812 3456 7890 (10–13 angka, diawali 08).')
      return
    }
    setBusy(true)
    try {
      const res = await api.requestOtp(p)
      setSentTo(p)
      setSimCode(res.simulatedCode)
      setCode('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const verify = async (e?: FormEvent, codeOverride?: string) => {
    e?.preventDefault()
    if (!sentTo) return
    const c = (codeOverride ?? code).trim()
    setError(null)
    if (!/^\d{6}$/.test(c)) {
      setError('Kode OTP terdiri dari 6 angka. Lihat kotak SMS simulasi di atas.')
      return
    }
    if (needName && !name.trim()) {
      setError('Isi nama kamu dulu, supaya tiket atas namamu.')
      nameRef.current?.focus()
      return
    }
    setBusy(true)
    try {
      const res = await api.verifyOtp(sentTo, c, needName ? name.trim() : undefined)
      toast.success(res.isNew ? `Akun dibuat. Halo, ${res.user.name}!` : `Halo lagi, ${res.user.name}!`)
      onSuccess(res.user, res.isNew)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NEED_NAME') {
        setNeedName(true)
        setTimeout(() => nameRef.current?.focus(), 50)
      } else {
        setError(errorMessage(err))
      }
    } finally {
      setBusy(false)
    }
  }

  const autofill = () => {
    if (!simCode) return
    setCode(simCode)
    if (!needName) void verify(undefined, simCode)
  }

  return (
    <div className={cn('space-y-3', className)}>
      {intro && <p className="text-sm text-muted-foreground">{intro}</p>}

      {!sentTo ? (
        <form onSubmit={request} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-phone`}>Nomor HP</Label>
            <div className="relative">
              <Smartphone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id={`${id}-phone`}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="0812 3456 7890"
                className="h-12 pl-9 text-base"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                aria-invalid={!!error}
                aria-describedby={`${id}-phone-hint`}
              />
            </div>
            <p id={`${id}-phone-hint`} className="text-xs text-muted-foreground">
              Kami kirim kode OTP lewat SMS (disimulasikan, kodenya tampil di layar).
            </p>
          </div>
          {error && <FormError>{error}</FormError>}
          <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
            Kirim kode OTP
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3" noValidate>
          {simCode && (
            <div className="rounded-xl border border-dashed border-ink/25 bg-muted/60 p-3" aria-live="polite">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <MessageSquareText className="size-4" aria-hidden /> SMS ke {sentTo}
                </span>
                <SimTag />
              </div>
              <p className="mt-2 text-sm">
                Kode OTP Summarevent kamu: <strong className="font-mono text-lg tracking-[0.2em]" data-testid="sim-otp">{simCode}</strong>. Jangan bagikan kode ini.
              </p>
              <Button type="button" variant="outline" className="mt-2 h-11 w-full bg-card" onClick={autofill} disabled={busy}>
                Isi otomatis
              </Button>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-code`}>Kode OTP</Label>
            <Input
              id={`${id}-code`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="6 angka"
              className="h-12 text-center font-mono text-xl tracking-[0.4em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </div>
          {needName && (
            <div className="space-y-1.5 rounded-xl bg-brand-soft p-3">
              <Label htmlFor={`${id}-name`} className="text-brand">
                <UserRound className="size-4" aria-hidden /> Nomor baru! Siapa namamu?
              </Label>
              <Input
                ref={nameRef}
                id={`${id}-name`}
                autoComplete="name"
                placeholder="Nama lengkap"
                className="h-12 bg-card text-base"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Nama ini dipakai sebagai nama pemesan di e-ticket.</p>
            </div>
          )}
          {error && <FormError>{error}</FormError>}
          <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
            {needName ? 'Buat akun & masuk' : 'Masuk'}
          </Button>
          <div className="flex justify-between text-sm">
            <button
              type="button"
              className="min-h-11 px-1 font-semibold text-brand underline-offset-4 hover:underline"
              onClick={() => {
                setSentTo(null)
                setSimCode(null)
                setNeedName(false)
                setError(null)
              }}
            >
              Ganti nomor
            </button>
            <button type="button" className="min-h-11 px-1 font-semibold text-brand underline-offset-4 hover:underline" onClick={() => void request()} disabled={busy}>
              Kirim ulang kode
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function FormError({ children }: { children: string }) {
  return (
    <p role="alert" className="rounded-lg bg-status-invalid/8 px-3 py-2 text-sm text-[#a11b1b]">
      {children}
    </p>
  )
}
