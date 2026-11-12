/**
 * Masuk and Daftar (PV-06): one phone + OTP flow, two entrances. Sign-up asks the name first; sign-in asks it only for
 * a number it has not seen. Afterwards the visitor goes back to where they came from (?next=, app paths only).
 */
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import { AuthArt } from '@/components/common/AuthArt'
import { Illustration } from '@/components/common/Illustration'
import { Button } from '@/components/ui/button'
import { LoginPanel } from '@/components/visitor/LoginPanel'
import { useVisitor } from '@/components/visitor/hooks'
import { errorMessage } from '@/hooks/useLive'
import { safeNext } from '@/lib/safeNext'

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
      toast.success(`Masuk sebagai ${u.name} (data contoh).`)
      done()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setDemoBusy(false)
    }
  }

  // the sample account: under the form on a phone, on the green half on a laptop (only one of the two is ever shown)
  const demo = (variant: 'outline' | 'secondary', className: string) => (
    <div className={className}>
      <p className="font-semibold">Akun contoh yang sudah punya tiket</p>
      <Button variant={variant} className="mt-3 h-11 w-full" onClick={() => void loginAsPersona()} disabled={demoBusy}>
        Masuk sebagai Rina (akun contoh)
      </Button>
    </div>
  )

  return (
    <div className="flex min-h-dvh flex-col bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <AuthArt art={c.art} label="Pengunjung SUMMABA" lines={POINTS}>
        {mode === 'masuk' && demo('secondary', 'max-w-md rounded-2xl border border-dashed border-white/40 p-4 text-sm')}
      </AuthArt>

      <div className="flex flex-1 flex-col lg:relative lg:min-h-dvh lg:items-center lg:justify-center">
        <header className="px-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:absolute lg:top-0 lg:left-0 lg:px-6 lg:pt-5">
          <Button variant="ghost" className="size-11 rounded-full" aria-label="Kembali" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/app'))}>
            <ArrowLeft className="size-5" />
          </Button>
        </header>

        {/* on a short laptop screen the spacing follows the height, and once the code has arrived the lead and the switch give way */}
        <main className="group/auth flex-1 px-6 pb-10 lg:w-[27rem] lg:flex-none lg:px-0 lg:pt-14 lg:pb-[clamp(0.5rem,6dvh,3rem)]">
          <div className="relative mx-auto grid size-36 place-items-center overflow-hidden rounded-[2rem] bg-brand-soft lg:hidden">
            <div className="seat-dots absolute inset-0 text-brand/15" aria-hidden />
            <Illustration name={c.art} className="relative w-28 animate-pop" />
          </div>
          <h1 className="mt-6 animate-rise text-center font-poster text-[2.5rem] leading-[0.95] text-balance uppercase lg:mt-0 lg:text-left lg:text-[clamp(2rem,6.5dvh,2.75rem)]">{c.title}</h1>
          <p className="mt-1.5 animate-rise text-center text-base text-muted-foreground [animation-delay:60ms] lg:text-left lg:[@media(max-height:600px)]:group-has-[[data-testid=sim-otp]]/auth:hidden">{c.lead}</p>

          <LoginPanel key={mode} mode={mode} className="mt-7 lg:mt-[clamp(1rem,3dvh,1.75rem)]" onSuccess={done} />

          <p className="mt-6 text-center text-sm text-muted-foreground lg:mt-[clamp(0.5rem,1.5dvh,1.5rem)] lg:[@media(max-height:600px)]:group-has-[[data-testid=sim-otp]]/auth:hidden">
            {c.switchText}{' '}
            <Link to={c.switchTo + query} replace className="inline-flex min-h-11 items-center px-1 font-bold underline underline-offset-4">
              {c.switchLabel}
            </Link>
          </p>

          {mode === 'masuk' && demo('outline', 'mt-4 rounded-2xl border border-dashed border-ink/25 p-4 text-sm lg:hidden')}
        </main>
      </div>
    </div>
  )
}
