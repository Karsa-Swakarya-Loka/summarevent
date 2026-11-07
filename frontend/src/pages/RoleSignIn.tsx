/**
 * Masuk for panitia and petugas: email and kata sandi through `api.login` (the demo keeps the accounts of
 * lib/demoAccounts.ts with the demo password). Afterwards the user goes on to where they were headed (?next=, inside
 * their own area only).
 */
import { useId, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { api } from '@/api'
import { CoBrand } from '@/components/common/Brand'
import { Illustration } from '@/components/common/Illustration'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SimTag } from '@/components/visitor/Common'
import { errorMessage } from '@/hooks/useLive'
import { DEMO_PASSWORD, DEMO_SIGN_IN } from '@/lib/demoAccounts'
import { safeNext } from '@/lib/safeNext'

const COPY = {
  ADMIN: {
    area: 'admin',
    art: 'notes',
    title: 'Masuk panitia',
    lead: 'Kelola event, kursi, dan struk SUMMABA.',
    role: 'Panitia',
    points: ['Event jadi dalam lima langkah', 'Kursi terpantau live', 'Struk, pesanan, laporan CSV'],
  },
  STAFF: {
    area: 'staff',
    art: 'camera',
    title: 'Masuk petugas',
    lead: 'Scan e-ticket pengunjung di pintu masuk.',
    role: 'Petugas',
    points: ['Scan QR di pintu', 'Hasil terbaca dari jauh', 'Cari manual kalau QR rusak'],
  },
} as const

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function RoleSignIn({ role }: { role: 'ADMIN' | 'STAFF' }) {
  const id = useId()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const c = COPY[role]
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

  return (
    <div className="flex min-h-dvh bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" data-shell="intro">
      {/* on a laptop the brand takes the left half: what this role gets, in the app's own stickers */}
      <aside className="relative hidden overflow-hidden bg-brand p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="seat-dots pointer-events-none absolute inset-0 text-white/[0.08]" aria-hidden />
        <CoBrand tone="light" className="relative" />
        <div className="relative">
          <Illustration name={c.art} className="w-56" />
          <p className="mt-6 text-base font-semibold text-white/80">{c.role} SUMMABA</p>
          <ul className="mt-3 space-y-2">
            {c.points.map((point) => (
              <li key={point} className="font-poster text-[2.4rem] leading-[0.95] uppercase">
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/75">Bandung Build Challenge 2026 · prototype</p>
      </aside>

      <div className="mx-auto flex w-full max-w-md flex-col lg:justify-center">
        <header className="px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Button variant="ghost" className="size-11 rounded-full" aria-label="Kembali ke halaman awal" onClick={() => navigate('/')}>
            <ArrowLeft className="size-5" />
          </Button>
        </header>

        <main className="flex-1 px-6 pb-10">
          {/* on a short phone the form and the demo account come first, so the tile gives way */}
          <div className="relative mx-auto mb-6 grid size-28 place-items-center overflow-hidden rounded-[1.75rem] bg-brand-soft lg:hidden [@media(max-height:780px)]:hidden">
            <div className="seat-dots absolute inset-0 text-brand/15" aria-hidden />
            <Illustration name={c.art} className="relative w-22 animate-pop" />
          </div>
          <h1 className="mt-2 animate-rise font-poster text-[2.5rem] leading-[0.95] uppercase max-lg:text-center">{c.title}</h1>
          <p className="mt-1.5 animate-rise text-base text-muted-foreground [animation-delay:60ms] max-lg:text-center">{c.lead}</p>

          <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-email`}>Email</Label>
              <Input
                id={`${id}-email`}
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
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

          <section aria-label="Akun demo" className="mt-5 flex items-center gap-3 rounded-2xl border border-dashed border-ink/25 py-2.5 pr-2.5 pl-4 text-sm">
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
              variant="outline"
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

          <p className="mt-4 text-center text-xs text-muted-foreground">Di versi demo, link untuk membuat atau mengganti kata sandi tampil di layar lewat Lupa kata sandi.</p>
        </main>
      </div>
    </div>
  )
}
