import { useEffect, useId, useRef, useState, type FormEvent, type Ref } from 'react'
import { Smartphone, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/api'
import type { User } from '@/domain/types'
import { BrandAppIcon } from '@/components/common/Brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/hooks/useLive'
import { isValidPhone, normalizePhone } from '@/lib/format'
import { cn } from '@/lib/utils'
import { SimTag } from './Common'

const RESEND_SEC = 30
const NAME_ERROR = 'Isi nama kamu dulu, supaya tiket atas namamu.'

/**
 * Phone + OTP sign-in and sign-up (PV-06). The OTP is simulated: it arrives as an on-screen SMS with an auto-fill
 * button. A new number is asked for a name after the code; in sign-up mode the name comes first. Guest holds are
 * claimed by the API on login.
 */
export function LoginPanel({
  onSuccess,
  mode = 'masuk',
  className,
}: {
  onSuccess: (user: User, isNew: boolean) => void
  mode?: 'masuk' | 'daftar'
  className?: string
}) {
  const id = useId()
  const signUp = mode === 'daftar'
  const [phone, setPhone] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [simCode, setSimCode] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [needName, setNeedName] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)
  const nameRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  // Focus the field of the step that just opened, in the commit that shows it. A focus from a timer could land later,
  // while the visitor (or a test) is already typing in the next field, and take their typing with it.
  useEffect(() => {
    if (sentTo) codeRef.current?.focus()
  }, [sentTo, simCode])
  useEffect(() => {
    if (needName) nameRef.current?.focus()
  }, [needName])

  useEffect(() => {
    if (resendIn <= 0) return
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [resendIn])

  const request = async (e?: FormEvent) => {
    e?.preventDefault()
    setError(null)
    if (signUp && !name.trim()) {
      setError(NAME_ERROR)
      nameRef.current?.focus()
      return
    }
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
      setResendIn(RESEND_SEC)
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
      setError('Kode OTP terdiri dari 6 angka. Lihat SMS simulasi di atas.')
      return
    }
    if (needName && !name.trim()) {
      setError(NAME_ERROR)
      nameRef.current?.focus()
      return
    }
    setBusy(true)
    try {
      const res = await api.verifyOtp(sentTo, c, needName || signUp ? name.trim() : undefined)
      toast.success(
        res.isNew ? `Akun dibuat. Halo, ${res.user.name}!` : signUp ? `Nomor ini sudah terdaftar. Halo lagi, ${res.user.name}!` : `Halo lagi, ${res.user.name}!`,
      )
      onSuccess(res.user, res.isNew)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NEED_NAME') {
        setNeedName(true)
      } else {
        setError(errorMessage(err))
      }
    } finally {
      setBusy(false)
    }
  }

  const nameError = error === NAME_ERROR

  const autofill = () => {
    if (!simCode) return
    setCode(simCode)
    if (!needName) void verify(undefined, simCode)
  }

  return (
    <div className={cn('space-y-4', className)}>
      {!sentTo ? (
        <form onSubmit={request} className="space-y-4" noValidate>
          {signUp && (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-signup-name`}>Nama lengkap</Label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  ref={nameRef}
                  id={`${id}-signup-name`}
                  autoComplete="name"
                  placeholder="mis. Rina Kartika"
                  className="h-14 bg-card pl-11 text-base"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={nameError || undefined}
                />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-phone`}>Nomor HP</Label>
            <div className="relative">
              <Smartphone className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id={`${id}-phone`}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="0812 3456 7890"
                className="h-14 bg-card pl-11 text-base"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                aria-invalid={(!!error && !nameError) || undefined}
                aria-describedby={`${id}-phone-hint`}
              />
            </div>
            <p id={`${id}-phone-hint`} className="text-xs text-muted-foreground">
              Kode OTP tampil di layar (simulasi).
            </p>
          </div>
          {error && <FormError>{error}</FormError>}
          <Button type="submit" className="h-14 w-full text-base" disabled={busy}>
            {busy ? <Dots /> : 'Kirim kode OTP'}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4" noValidate>
          {simCode && (
            <div role="status" className="animate-drop-in rounded-2xl bg-ink p-3.5 text-white shadow-lg shadow-ink/20">
              <div className="flex items-center gap-2 text-xs text-white/75">
                <BrandAppIcon className="size-5 rounded-md" />
                <span className="font-semibold text-white">Pesan</span>
                <span>· sekarang</span>
                <SimTag className="ml-auto bg-white text-ink" />
              </div>
              <p className="mt-2 text-sm leading-relaxed">
                Kode OTP Summarevent ke {sentTo}:{' '}
                <strong className="font-mono text-lg tracking-[0.2em] text-brand-yellow" data-testid="sim-otp">
                  {simCode}
                </strong>
                . Jangan bagikan kode ini.
              </p>
              <Button type="button" variant="secondary" className="mt-3 h-11 w-full" onClick={autofill} disabled={busy}>
                Isi otomatis
              </Button>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-code`}>Kode OTP</Label>
            <OtpBoxes ref={codeRef} id={`${id}-code`} value={code} onChange={setCode} invalid={!!error && !nameError} />
          </div>
          {needName && (
            <div className="animate-rise space-y-1.5 rounded-2xl bg-brand-soft p-3.5">
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
                aria-invalid={nameError || undefined}
              />
              <p className="text-xs text-muted-foreground">Nama ini dipakai sebagai nama pemesan di e-ticket.</p>
            </div>
          )}
          {error && <FormError>{error}</FormError>}
          <Button type="submit" className="h-14 w-full text-base" disabled={busy}>
            {busy ? <Dots /> : needName || signUp ? 'Buat akun & masuk' : 'Masuk'}
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
            <button
              type="button"
              className="min-h-11 px-1 font-semibold text-brand tabular-nums underline-offset-4 hover:underline disabled:text-muted-foreground disabled:no-underline"
              onClick={() => void request()}
              disabled={busy || resendIn > 0}
            >
              {resendIn > 0 ? `Kirim ulang dalam 0:${String(resendIn).padStart(2, '0')}` : 'Kirim ulang kode'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

/**
 * Six boxes that show the code, driven by one transparent input on top of them: one label, native SMS autofill
 * (one-time-code), paste and backspace all work as in a plain field.
 */
function OtpBoxes({
  id,
  value,
  onChange,
  invalid,
  ref,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  invalid: boolean
  ref: Ref<HTMLInputElement>
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div className="relative">
      <input
        ref={ref}
        id={id}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-invalid={invalid || undefined}
        className="absolute inset-0 z-10 size-full cursor-text opacity-0"
      />
      <div className="grid grid-cols-6 gap-2" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => {
          const ch = value[i]
          const here = focused && (i === value.length || (i === 5 && value.length === 6))
          return (
            <span
              key={i}
              className={cn(
                'flex h-14 items-center justify-center rounded-xl border-2 bg-card font-mono text-2xl font-bold tabular-nums transition-[border-color,box-shadow] duration-150',
                ch ? 'border-foreground/30' : 'border-input',
                here && 'border-brand ring-3 ring-brand/20',
                invalid && 'border-destructive',
              )}
            >
              {ch ? <span className="animate-pop">{ch}</span> : here ? <span className="h-6 w-0.5 animate-pulse rounded-full bg-brand" /> : null}
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** Three dots that bounce while a request runs. */
function Dots() {
  return (
    <span className="flex items-center gap-1" role="status" aria-label="Memproses">
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1.5 animate-bounce rounded-full bg-current" style={{ animationDelay: `${i * 120}ms` }} />
      ))}
    </span>
  )
}

function FormError({ children }: { children: string }) {
  return (
    <p role="alert" className="animate-rise rounded-xl bg-status-invalid/8 px-3 py-2.5 text-sm text-[#a11b1b]">
      {children}
    </p>
  )
}
