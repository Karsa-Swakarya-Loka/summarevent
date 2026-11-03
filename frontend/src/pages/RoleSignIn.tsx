/**
 * Masuk for panitia and petugas: email and kata sandi. Simulated until the backend has its own login: the demo
 * accounts (lib/demoAccounts.ts) are checked here, then opened through the demo login. Afterwards the user goes on to
 * where they were headed (?next=, inside their own area only).
 */
import { useId, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import { CoBrand } from '@/components/common/Brand'
import { Illustration } from '@/components/common/Illustration'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SimTag } from '@/components/visitor/Common'
import { errorMessage } from '@/hooks/useLive'
import { DEMO_PASSWORD, DEMO_SIGN_IN } from '@/lib/demoAccounts'

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
  const next = raw && raw.startsWith(`/${c.area}`) && !raw.startsWith('//') && !/\/(masuk|mulai)\/?$/.test(raw) ? raw : `/${c.area}`
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
    const account = DEMO_SIGN_IN[role].find((a) => a.email === address)
    if (!account || password !== DEMO_PASSWORD) return setError({ field: null, text: 'Email atau kata sandi salah.' })
    setError(null)
    setBusy(true)
    try {
      const user = await api.demoLogin(role, account.userId)
      toast.success(`Halo, ${user.name}!`)
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
          <p className="mt-6 text-[0.7rem] font-bold tracking-[0.2em] text-white/75 uppercase">{c.role} SUMMABA</p>
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
          <div className="relative grid size-36 place-items-center overflow-hidden rounded-[2rem] bg-brand-soft lg:hidden">
            <div className="seat-dots absolute inset-0 text-brand/15" aria-hidden />
            <Illustration name={c.art} className="relative w-28 animate-pop" />
          </div>
          <h1 className="mt-6 animate-rise font-poster text-[2.5rem] leading-[0.95] uppercase">{c.title}</h1>
          <p className="mt-1.5 animate-rise text-base text-muted-foreground [animation-delay:60ms]">{c.lead}</p>

          <form onSubmit={(e) => void submit(e)} className="mt-7 space-y-4" noValidate>
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
              <Label htmlFor={`${id}-password`}>Kata sandi</Label>
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

          <section aria-label="Akun demo" className="mt-6 rounded-2xl border border-dashed border-ink/25 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <SimTag /> Akun demo
            </p>
            <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-mono text-xs break-all">{demo.email}</dd>
              <dt className="text-muted-foreground">Kata sandi</dt>
              <dd className="font-mono text-xs">{DEMO_PASSWORD}</dd>
            </dl>
            <Button
              type="button"
              variant="outline"
              className="mt-3 h-11 w-full"
              onClick={() => {
                setEmail(demo.email)
                setPassword(DEMO_PASSWORD)
                setError(null)
              }}
            >
              Isi otomatis
            </Button>
          </section>

          <p className="mt-8 text-center text-xs text-muted-foreground">Login disimulasikan sampai server login siap.</p>
        </main>
      </div>
    </div>
  )
}
