/**
 * Lupa kata sandi and the reset page for panitia and petugas, one screen each. `/lupa-sandi` asks for the email and
 * always answers the same, so it cannot be used to find out which addresses exist; in the demo the link the email
 * would carry is shown on screen. `/reset?token=…` sets the new password and signs the person in; the token works
 * once, for 30 minutes.
 */
import { useEffect, useId, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, Eye, EyeOff, LoaderCircle, MailCheck } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import { AuthArt, AuthTile } from '@/components/common/AuthArt'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SimTag } from '@/components/visitor/Common'
import { passwordCheck, PASSWORD_MIN } from '@/domain/rules'
import { errorMessage } from '@/hooks/useLive'
import { finePointer } from '@/lib/pointer'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RESET_POINTS = ['Link reset lewat email', 'Berlaku 30 menit', 'Sekali pakai']
const RESET_NOTE = 'Simulasi: link reset juga tampil di layar.'

function Frame({ title, lead, back, children }: { title: string; lead: string; back: string; children: React.ReactNode }) {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-dvh justify-center bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" data-shell="intro">
      {/* on a laptop the green half as on the panitia and petugas sign-in: the padlock, who this is for, and the demo note */}
      <AuthArt art="padlock" label="Panitia & petugas SUMMABA" lines={RESET_POINTS}>
        <p className="text-sm text-white/75">{RESET_NOTE}</p>
      </AuthArt>
      <div className="flex w-full max-w-md flex-col lg:relative lg:min-h-dvh lg:max-w-none lg:items-center lg:justify-center">
        <header className="px-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:absolute lg:top-0 lg:left-0 lg:px-6 lg:pt-5">
          <Button variant="ghost" className="size-11 rounded-full" aria-label="Kembali" onClick={() => navigate(back)}>
            <ArrowLeft className="size-5" />
          </Button>
        </header>
        <main className="flex-1 px-6 pb-10 lg:w-[27rem] lg:flex-none lg:px-0 lg:pt-14 lg:pb-[clamp(1.25rem,6dvh,3rem)]">
          <AuthTile art="padlock" />
          <h1 className="mt-2 animate-rise font-poster text-[2.5rem] leading-[0.95] text-balance uppercase max-lg:text-center lg:mt-0 lg:text-[clamp(2rem,6.5dvh,2.75rem)]">{title}</h1>
          <p className="mt-1.5 animate-rise text-base text-muted-foreground [animation-delay:60ms] max-lg:text-center">{lead}</p>
          {children}
          <p className="mt-6 text-center text-xs text-muted-foreground lg:hidden">{RESET_NOTE}</p>
        </main>
      </div>
    </div>
  )
}

export function ForgotPassword() {
  const id = useId()
  const [params] = useSearchParams()
  const role = params.get('role') === 'STAFF' ? 'STAFF' : 'ADMIN'
  const back = role === 'STAFF' ? '/staff/masuk' : '/admin/masuk'
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<{ email: string; link?: string } | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const address = email.trim().toLowerCase()
    if (!EMAIL.test(address)) return setError('Tulis email lengkap, misalnya nama@contoh.id.')
    setError(null)
    setBusy(true)
    try {
      const r = await api.forgotPassword(address)
      setSent({ email: address, link: r.simulatedLink })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Frame title="Lupa kata sandi" lead="Kami kirim link untuk membuat kata sandi baru." back={back}>
      {sent ? (
        <section className="mt-7 animate-rise rounded-2xl bg-card p-5 shadow-xs" aria-live="polite">
          <p className="flex items-center gap-2 font-semibold">
            <MailCheck className="size-5 text-[#0b6b35]" aria-hidden /> Cek email {sent.email}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Kalau email itu terdaftar, link-nya sudah terkirim dan berlaku 30 menit.</p>
          {sent.link && (
            <div className="mt-4 rounded-xl border border-dashed border-ink/25 p-3 text-sm">
              <p className="flex items-center gap-2 font-semibold">
                <SimTag /> Isi email (simulasi)
              </p>
              <Button asChild className="mt-3 h-11 w-full">
                <a href={sent.link}>Buka link reset</a>
              </Button>
            </div>
          )}
          <Button asChild variant="outline" className="mt-3 h-11 w-full">
            <Link to={back}>Kembali ke halaman masuk</Link>
          </Button>
        </section>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="mt-7 space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-email`}>Email</Label>
            <Input
              id={`${id}-email`}
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoFocus={finePointer()}
              placeholder="nama@contoh.id"
              className="h-14 bg-card text-base"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!error || undefined}
            />
          </div>
          {error && (
            <p role="alert" className="animate-rise rounded-xl bg-status-invalid/10 px-3 py-2 text-sm font-medium text-[#a11b1b]">
              {error}
            </p>
          )}
          <Button type="submit" className="h-14 w-full text-base" disabled={busy}>
            {busy && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
            Kirim link reset
          </Button>
        </form>
      )}
    </Frame>
  )
}

export function ResetPassword() {
  const id = useId()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // the token is read once, then taken out of the address so it does not stay in the history or show on screen
  const [token] = useState(() => params.get('token') ?? '')
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('token')) window.history.replaceState(window.history.state, '', window.location.pathname)
  }, [])
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const check = passwordCheck(password)
    if (!check.ok) return setError(check.reason)
    if (password !== again) return setError('Kata sandi yang diulang belum sama.')
    setError(null)
    setBusy(true)
    try {
      const user = await api.resetPassword(token, password)
      toast.success(`Kata sandi tersimpan. Halo, ${user.name}!`)
      navigate(user.role === 'STAFF' ? '/staff' : '/admin', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <Frame title="Link tidak lengkap" lead="Buka link reset dari email, atau minta link baru." back="/admin/masuk">
        <Button asChild className="mt-7 h-12 w-full">
          <Link to="/lupa-sandi">Minta link baru</Link>
        </Button>
      </Frame>
    )
  }

  return (
    <Frame title="Kata sandi baru" lead={`Minimal ${PASSWORD_MIN} karakter.`} back="/admin/masuk">
      <form onSubmit={(e) => void submit(e)} className="mt-7 space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-password`}>Kata sandi baru</Label>
          <div className="relative">
            <Input
              id={`${id}-password`}
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              autoFocus={finePointer()}
              className="h-14 bg-card pr-14 text-base"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!error || undefined}
            />
            <button
              type="button"
              className="absolute top-1/2 right-1.5 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted active:scale-90"
              aria-label={show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
              aria-pressed={show}
              onClick={() => setShow((v) => !v)}
            >
              {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-again`}>Ulangi kata sandi</Label>
          <Input id={`${id}-again`} type={show ? 'text' : 'password'} autoComplete="new-password" className="h-14 bg-card text-base" value={again} onChange={(e) => setAgain(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="animate-rise rounded-xl bg-status-invalid/10 px-3 py-2 text-sm font-medium text-[#a11b1b]">
            {error}
          </p>
        )}
        <Button type="submit" className="h-14 w-full text-base" disabled={busy}>
          {busy && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
          Simpan dan masuk
        </Button>
      </form>
    </Frame>
  )
}
