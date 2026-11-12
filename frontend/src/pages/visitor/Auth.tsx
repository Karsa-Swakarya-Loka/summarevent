/**
 * Masuk and Daftar (PV-06): one phone + OTP flow, two entrances. Sign-up asks the name first; sign-in asks it only for
 * a number it has not seen. Afterwards the visitor goes back to where they came from (?next=, app paths only).
 */
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import { AuthArt, AuthTile } from '@/components/common/AuthArt'
import { Button } from '@/components/ui/button'
import { LoginPanel } from '@/components/visitor/LoginPanel'
import { useVisitor } from '@/components/visitor/hooks'
import { SimTag } from '@/components/visitor/Common'
import { errorMessage } from '@/hooks/useLive'
import { setOnboardingDone } from '@/lib/intro'
import { safeNext } from '@/lib/safeNext'
import { cn } from '@/lib/utils'

const COPY = {
  masuk: {
    art: 'padlock',
    title: 'Masuk ke Summarevent',
    lead: 'Cukup nomor HP, tanpa kata sandi.',
    switchText: 'Belum punya akun?',
    switchLabel: 'Daftar',
    switchTo: '/app/daftar',
  },
  daftar: {
    art: 'kursi',
    title: 'Daftar akun baru',
    lead: 'Cukup nama dan nomor HP, tanpa kata sandi.',
    switchText: 'Sudah punya akun?',
    switchLabel: 'Masuk',
    switchTo: '/app/masuk',
  },
} as const

// what the visitor gets, as on the visitor's onboarding; shown on the green half on a laptop
const POINTS = ['Pilih kursimu sendiri', 'Bayar, gratis, atau tukar struk', 'Satu QR untuk masuk']
const NOTE = 'Di demo ini, kode OTP tampil di layar.'

/** Only paths inside the visitor app, so ?next= cannot send anyone elsewhere. */
function nextScreen(raw: string | null): string {
  return safeNext(raw, 'app') ?? '/app'
}

export default function Auth({ mode }: { mode: 'masuk' | 'daftar' }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { refresh } = useVisitor()
  const [demoBusy, setDemoBusy] = useState(false)
  const next = nextScreen(params.get('next'))
  const c = COPY[mode]
  const query = params.get('next') ? `?next=${encodeURIComponent(next)}` : ''

  const done = () => {
    refresh()
    navigate(next, { replace: true })
  }
  const loginAsPersona = async () => {
    setDemoBusy(true)
    try {
      const u = await api.demoLogin('VISITOR')
      // the sample account is the shortcut past the intro, so Beranda must not send her back to it
      setOnboardingDone(true, 'visitor')
      toast.success(`Masuk sebagai ${u.name} (data contoh).`)
      done()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setDemoBusy(false)
    }
  }

  // the sample account, laid out like the panitia's and petugas' demo account: under the form on a phone, at the foot
  // of the green half on a laptop (only one of the two is ever shown)
  const demo = (variant: 'outline' | 'secondary', className: string) => (
    <section aria-label="Akun contoh" className={cn('flex items-center gap-3 rounded-2xl border border-dashed py-2.5 pr-2.5 pl-4 text-sm', className)}>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-semibold">
          <SimTag /> Akun contoh
        </p>
        <p className="mt-1 text-xs leading-relaxed">Rina Kartika, sudah punya e-ticket</p>
      </div>
      <Button variant={variant} className="h-11 shrink-0 px-4" onClick={() => void loginAsPersona()} disabled={demoBusy} aria-label="Masuk sebagai Rina (akun contoh)">
        Masuk
      </Button>
    </section>
  )

  return (
    <div className="flex min-h-dvh flex-col bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-1 flex-col lg:relative lg:min-h-dvh lg:items-center lg:justify-center">
        <header className="px-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:absolute lg:top-0 lg:left-0 lg:px-6 lg:pt-5">
          <Button variant="ghost" className="size-11 rounded-full" aria-label="Kembali" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/app'))}>
            <ArrowLeft className="size-5" />
          </Button>
        </header>

        {/* on a short laptop screen the spacing follows the height, and once the code has arrived the lead and the switch give way */}
        <main className="group/auth flex-1 px-6 pb-10 lg:w-[27rem] lg:flex-none lg:px-0 lg:pt-14 lg:pb-[clamp(0.5rem,6dvh,3rem)]">
          <AuthTile art={c.art} />
          <h1 className="mt-2 animate-rise font-poster text-[2.5rem] leading-[0.95] text-balance uppercase max-lg:text-center lg:mt-0 lg:text-[clamp(2rem,6.5dvh,2.75rem)]">{c.title}</h1>
          <p className="mt-1.5 animate-rise text-base text-muted-foreground [animation-delay:60ms] max-lg:text-center lg:[@media(max-height:600px)]:group-has-[[data-testid=sim-otp]]/auth:hidden">{c.lead}</p>

          <LoginPanel key={mode} mode={mode} className="mt-7 lg:mt-[clamp(1rem,3dvh,1.75rem)]" onSuccess={done} />

          <p className="mt-6 text-center text-sm text-muted-foreground lg:mt-[clamp(0.5rem,1.5dvh,1.5rem)] lg:[@media(max-height:600px)]:group-has-[[data-testid=sim-otp]]/auth:hidden">
            {c.switchText}{' '}
            <Link to={c.switchTo + query} replace className="inline-flex min-h-11 items-center px-1 font-bold underline underline-offset-4">
              {c.switchLabel}
            </Link>
          </p>

          {mode === 'masuk' && demo('outline', 'mt-5 border-ink/25 lg:hidden')}

          <p className="mt-4 text-center text-xs text-muted-foreground lg:hidden">{NOTE}</p>
        </main>
      </div>

      {/* after the form in the page order, so Tab reaches the form first; drawn as the left half */}
      <AuthArt art={c.art} label="Pengunjung SUMMABA" lines={POINTS}>
        {mode === 'masuk' && demo('secondary', 'mb-4 max-w-md border-white/40')}
        <p className="text-sm text-white/75">{NOTE}</p>
      </AuthArt>
    </div>
  )
}
