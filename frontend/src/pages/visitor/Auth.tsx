/**
 * Masuk and Daftar (PV-06): one phone + OTP flow, two entrances. Sign-up asks the name first; sign-in asks it only for
 * a number it has not seen. Afterwards the visitor goes back to where they came from (?next=, app paths only).
 */
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import { Illustration } from '@/components/common/Illustration'
import { Button } from '@/components/ui/button'
import { LoginPanel } from '@/components/visitor/LoginPanel'
import { useVisitor } from '@/components/visitor/hooks'
import { errorMessage } from '@/hooks/useLive'

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

/** Only paths inside the visitor app, so ?next= cannot send anyone elsewhere. */
function safeNext(raw: string | null): string {
  return raw && /^\/app(\/|$)/.test(raw) && !raw.startsWith('//') ? raw : '/app'
}

export default function Auth({ mode }: { mode: 'masuk' | 'daftar' }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { refresh } = useVisitor()
  const [demoBusy, setDemoBusy] = useState(false)
  const next = safeNext(params.get('next'))
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

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Button variant="ghost" className="size-11 rounded-full" aria-label="Kembali" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/app'))}>
          <ArrowLeft className="size-5" />
        </Button>
      </header>

      <main className="flex-1 px-6 pb-10">
        <div className="relative mx-auto grid size-36 place-items-center overflow-hidden rounded-[2rem] bg-brand-soft">
          <div className="seat-dots absolute inset-0 text-brand/15" aria-hidden />
          <Illustration name={c.art} className="relative w-28 animate-pop" />
        </div>
        <h1 className="mt-6 animate-rise text-center font-poster text-[2.5rem] leading-[0.95] text-balance uppercase">{c.title}</h1>
        <p className="mt-1.5 animate-rise text-center text-base text-muted-foreground [animation-delay:60ms]">{c.lead}</p>

        <LoginPanel key={mode} mode={mode} className="mt-7" onSuccess={done} />

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {c.switchText}{' '}
          <Link to={c.switchTo + query} replace className="inline-flex min-h-11 items-center px-1 font-bold underline underline-offset-4">
            {c.switchLabel}
          </Link>
        </p>

        {mode === 'masuk' && (
          <div className="mt-4 rounded-2xl border border-dashed border-ink/25 p-4 text-sm">
            <p className="font-semibold">Akun contoh yang sudah punya tiket</p>
            <Button variant="outline" className="mt-3 h-11 w-full" onClick={() => void loginAsPersona()} disabled={demoBusy}>
              Masuk sebagai Rina
            </Button>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">Kami hanya meminta nama dan nomor HP.</p>
      </main>
    </div>
  )
}
