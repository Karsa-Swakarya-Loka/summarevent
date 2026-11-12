/**
 * Masuk for panitia and petugas: email and kata sandi through `api.login` (the demo keeps the accounts of
 * lib/demoAccounts.ts with the demo password). Afterwards the user goes on to where they were headed (?next=, inside
 * their own area only).
 */
import { useId, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { api } from '@/api'
import { AuthArt, AuthTile } from '@/components/common/AuthArt'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SimTag } from '@/components/visitor/Common'
import { errorMessage } from '@/hooks/useLive'
import { safeNext } from '@/lib/safeNext'
import { DEMO_PASSWORD, DEMO_SIGN_IN } from '@/lib/demoAccounts'
import { finePointer } from '@/lib/pointer'
import { cn } from '@/lib/utils'

const COPY = {
  ADMIN: {
    area: 'admin',
    art: 'notes',
    title: 'Masuk panitia',
    lead: 'Kelola event, kursi, dan struk SUMMABA.',
    joinTitle: 'Daftar panitia',
    join: 'Akun panitia dibuat oleh pengelola Summarecon Mall Bandung. Sudah dapat undangan? Masuk dengan email dan kata sandi dari undangan itu.',
    role: 'Panitia',
    points: ['Event jadi dalam lima langkah', 'Kursi terpantau live', 'Struk, pesanan, laporan CSV'],
  },
  STAFF: {
    area: 'staff',
    art: 'camera',
    title: 'Masuk petugas',
    lead: 'Scan e-ticket pengunjung di pintu masuk.',
    joinTitle: 'Daftar petugas',
    join: 'Akun petugas dibuat oleh panitia event. Buka email undangan untuk membuat kata sandi, lalu masuk di sini.',
    role: 'Petugas',
    points: ['Scan QR di pintu', 'Hasil terbaca dari jauh', 'Cari manual kalau QR rusak'],
  },
} as const

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NOTE = 'Di demo ini, email undangan dan link reset tampil di layar.'

export default function RoleSignIn({ role }: { role: 'ADMIN' | 'STAFF' }) {
  const id = useId()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const c = COPY[role]
  // from Daftar: there is no self sign-up for these roles, so the screen says how an account comes about
  const joining = params.get('daftar') === '1'
  const raw = params.get('next')
  const allowed = safeNext(raw, c.area)
  const next = allowed && !/\/(masuk|mulai)\/?$/.test(allowed) ? allowed : `/${c.area}`
  const demo = DEMO_SIGN_IN[role][0]
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<{ field: 'email' | 'password' | null; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const address = email.trim().toLowerCase()
    if (!EMAIL.test(address)) return setError({ field: 'email', text: 'Tulis email lengkap, misalnya nama@contoh.id.' })
    if (!password) return setError({ field: 'password', text: 'Isi kata sandi dulu.' })
    setError(null)
    setBusy(true)
    try {
      await api.login(address, password, role)
      navigate(next, { replace: true })
    } catch (err) {
      setError({ field: null, text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  // the demo account: under the form on a phone, at the foot of the green half on a laptop (only one is ever shown)
  const demoAccount = (variant: 'outline' | 'secondary', className: string) => (
    <section aria-label="Akun demo" className={cn('flex items-center gap-3 rounded-2xl border border-dashed py-2.5 pr-2.5 pl-4 text-sm', className)}>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-semibold">
          <SimTag /> Akun demo
        </p>
        <dl className="mt-1 font-mono text-xs leading-relaxed">
          <dt className="sr-only">Email</dt>
          {/* a narrow phone breaks the address before its @, never inside the domain */}
          <dd className="[overflow-wrap:anywhere]">
            {demo.email.split('@')[0]}
            <wbr />@{demo.email.split('@')[1]}
          </dd>
          <dt className="sr-only">Kata sandi</dt>
          <dd>{DEMO_PASSWORD}</dd>
        </dl>
      </div>
      <Button
        type="button"
        variant={variant}
        className="h-11 shrink-0 px-4"
        onClick={() => {
          setEmail(demo.email)
          setPassword(DEMO_PASSWORD)
          setError(null)
        }}
      >
        Isi otomatis
      </Button>
    </section>
  )

  return (
    <div className="flex min-h-dvh bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" data-shell="intro">
      {/* on a laptop the brand takes the left half: what this role gets, in the app's own stickers, and the demo notes */}
      <AuthArt art={c.art} label={`${c.role} SUMMABA`} lines={c.points}>
        {demoAccount('secondary', 'mb-4 max-w-md border-white/40')}
        <p className="text-sm text-white/75">{NOTE}</p>
      </AuthArt>

      <div className="mx-auto flex w-full max-w-md flex-col lg:relative lg:min-h-dvh lg:max-w-none lg:items-center lg:justify-center">
        <header className="px-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:absolute lg:top-0 lg:left-0 lg:px-6 lg:pt-5">
          <Button variant="ghost" className="size-11 rounded-full" aria-label="Kembali ke halaman awal" onClick={() => navigate('/')}>
            <ArrowLeft className="size-5" />
          </Button>
        </header>

        <main className="flex-1 px-6 pb-10 lg:w-[27rem] lg:flex-none lg:px-0 lg:pt-14 lg:pb-[clamp(1.25rem,6dvh,3rem)]">
          <AuthTile art={c.art} />
          <h1 className="mt-2 animate-rise font-poster text-[2.5rem] leading-[0.95] text-balance uppercase max-lg:text-center lg:mt-0 lg:text-[clamp(2rem,6.5dvh,2.75rem)]">{joining ? c.joinTitle : c.title}</h1>
          <p className="mt-1.5 animate-rise text-base text-muted-foreground [animation-delay:60ms] max-lg:text-center">{joining ? c.join : c.lead}</p>

          <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4" noValidate>
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
                aria-invalid={error?.field === 'email' || undefined}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor={`${id}-password`}>Kata sandi</Label>
                <Link to={`/lupa-sandi?role=${role}`} className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">
                  Lupa kata sandi?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id={`${id}-password`}
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="h-14 bg-card pr-14 text-base"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={error?.field === 'password' || undefined}
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
            {error && (
              <p role="alert" className="animate-rise rounded-xl bg-status-invalid/10 px-3 py-2 text-sm font-medium text-[#a11b1b]">
                {error.text}
              </p>
            )}
            <Button type="submit" className="h-14 w-full text-base" disabled={busy}>
              {busy && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
              Masuk
            </Button>
          </form>

          {demoAccount('outline', 'mt-5 border-ink/25 lg:hidden')}

          <p className="mt-4 text-center text-xs text-muted-foreground lg:hidden">{NOTE}</p>
        </main>
      </div>
    </div>
  )
}
