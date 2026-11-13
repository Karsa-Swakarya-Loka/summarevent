/**
 * First-run onboarding, one per role, in three steps: the visitor's seats, ways in and e-ticket; the panitia's events,
 * live seats and reports; the petugas' scan, results and manual search. Shown once per device (replayable from the demo
 * menu); swipe, the arrow keys or the buttons move between steps. Panitia and petugas go on to sign in.
 */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { BrandLockup } from '@/components/common/Brand'
import { Illustration } from '@/components/common/Illustration'
import { Button } from '@/components/ui/button'
import type { ArtName } from '@/components/stickers/Art'
import { ACCESS_METHOD_LABEL } from '@/domain/labels'
import { safeNext } from '@/lib/safeNext'
import { setOnboardingDone, type IntroRole } from '@/lib/intro'
import { cn } from '@/lib/utils'

interface Step {
  art: ReadonlyArray<{ name: ArtName; label?: string }>
  panel: string
  dots: string
  title: string
  body: string
}

const PANELS = [
  { panel: 'bg-brand-soft', dots: 'text-brand/15' },
  { panel: 'bg-[#fff1e2]', dots: 'text-brand-orange/20' },
  { panel: 'bg-[#fff7c7]', dots: 'text-[#8a6d00]/15' },
] as const

const STEPS: Record<IntroRole, ReadonlyArray<Step>> = {
  visitor: [
    { art: [{ name: 'kursi' }], ...PANELS[0], title: 'Pilih kursimu sendiri', body: 'Ketuk kursi kosong di denah, atau biar kami pilihkan yang berdampingan.' },
    {
      art: [
        { name: 'coins', label: ACCESS_METHOD_LABEL.PAID },
        { name: 'gift', label: ACCESS_METHOD_LABEL.FREE },
        { name: 'notes', label: ACCESS_METHOD_LABEL.RECEIPT },
      ],
      ...PANELS[1],
      title: 'Bayar, gratis, atau tukar struk',
      body: 'Bayar lewat QRIS atau Virtual Account, atau tukar struk belanja dari tenant SUMMABA.',
    },
    { art: [{ name: 'tiket' }], ...PANELS[2], title: 'Satu QR untuk masuk', body: 'Satu e-ticket per kursi, tersimpan di Pass Saya. Tunjukkan di pintu.' },
  ],
  admin: [
    { art: [{ name: 'notes' }], ...PANELS[0], title: 'Event jadi dalam lima langkah', body: 'Info, kategori dan harga, denah, sesi, lalu publikasi.' },
    { art: [{ name: 'kursi' }], ...PANELS[1], title: 'Kursi terpantau live', body: 'Tersedia, sedang dipesan, dan terjual, saat itu juga di tiap sesi.' },
    { art: [{ name: 'coins' }], ...PANELS[2], title: 'Struk, pesanan, laporan', body: 'Setujui tukar struk, kelola pesanan, unduh CSV.' },
  ],
  staff: [
    { art: [{ name: 'camera' }], ...PANELS[0], title: 'Scan QR di pintu', body: 'Arahkan kamera ke e-ticket pengunjung.' },
    { art: [{ name: 'tiket' }], ...PANELS[1], title: 'Hasilnya terbaca dari jauh', body: 'Valid, Sudah digunakan, atau Tidak valid, dengan bunyi dan getar berbeda.' },
    { art: [{ name: 'search' }], ...PANELS[2], title: 'QR rusak? Cari manual', body: 'Kode tiket, nomor HP, atau nama. Rombongan bisa check-in sekaligus.' },
  ],
}


export default function Onboarding({ role }: { role: IntroRole }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [step, setStep] = useState(0)
  // 0 until the first move: the first step is simply there (its text is the page's largest paint), later ones slide in
  const [dir, setDir] = useState(0)
  const swipeFrom = useRef<number | null>(null)
  const steps = STEPS[role]
  const last = step === steps.length - 1
  const s = steps[step]

  // panitia and petugas sign in next, carrying where they were headed; from Daftar on the role picker, everyone goes on
  // to sign up (?daftar=1)
  const signUp = params.get('daftar') === '1'
  const area = role === 'admin' ? 'admin' : 'staff'
  const next = safeNext(params.get('next'), area)
  const signIn = signUp ? `/${area}/masuk?daftar=1` : `/${area}/masuk${next ? `?next=${encodeURIComponent(next)}` : ''}`
  const visitorExit = signUp ? '/app/daftar' : '/app'

  const go = (n: number) => {
    const to = Math.max(0, Math.min(steps.length - 1, n))
    if (to === step) return
    setDir(to > step ? 1 : -1)
    setStep(to)
  }
  const finish = (to: string) => {
    setOnboardingDone(true, role)
    navigate(to, { replace: true })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(step + 1)
      if (e.key === 'ArrowLeft') go(step - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const onPointerUp = (e: PointerEvent) => {
    if (swipeFrom.current === null) return
    const dx = e.clientX - swipeFrom.current
    swipeFrom.current = null
    if (Math.abs(dx) > 48) go(step + (dx < 0 ? 1 : -1))
  }

  return (
    // One fixed screen: the art panel takes whatever height is left, and the text and buttons keep the same size on
    // every step, so nothing jumps while swiping and nothing scrolls on a short phone. On a laptop the same pieces sit
    // in a grid: the art panel fills the left half, and the text and buttons stand centred in the right.
    <div className="flex h-dvh justify-center overflow-hidden bg-background" data-shell="intro">
      <div className="flex min-h-0 w-full max-w-md flex-col lg:grid lg:max-w-none lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)_auto_auto_minmax(0,1fr)]">
        <header className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] lg:z-10 lg:col-span-full lg:row-start-1 lg:px-8 lg:pt-6">
          <div className="flex items-center gap-2">
            {/* back to where the pengenalan was opened from (the landing's Daftar/Masuk), or the landing itself */}
            <Button variant="ghost" className="-ml-2.5 size-11 rounded-full" aria-label="Kembali" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
              <ArrowLeft className="size-5" />
            </Button>
            <BrandLockup className="hidden h-8 lg:block" />
          </div>
          <Button variant="ghost" className="h-11 px-4 text-base text-muted-foreground" onClick={() => finish(role === 'visitor' ? visitorExit : signIn)}>
            Lewati
          </Button>
        </header>

        <section
          key={step}
          aria-labelledby="onboarding-title"
          className="flex min-h-0 flex-1 touch-pan-y flex-col px-6 lg:contents"
          style={{ '--slide-from': `${dir * 36}px` } as CSSProperties}
          onPointerDown={(e) => (swipeFrom.current = e.clientX)}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (swipeFrom.current = null)}
        >
          <div className="mt-4 flex min-h-0 flex-1 items-center justify-center lg:col-start-1 lg:row-span-full lg:mt-0">
            <div
              className={cn(
                'relative grid aspect-square h-full max-h-[19rem] max-w-full place-items-center overflow-hidden rounded-[2.5rem] lg:aspect-auto lg:max-h-none lg:w-full lg:rounded-none',
                s.panel,
              )}
            >
              <div className={cn('seat-dots absolute inset-0', s.dots)} aria-hidden />
              {s.art.length === 1 ? (
                <Illustration name={s.art[0].name} className="relative w-[82%] animate-pop lg:w-[min(64%,62dvh)]" />
              ) : (
                <ul className="relative grid w-full grid-cols-3 lg:w-[min(86%,92dvh)]">
                  {s.art.map(({ name, label }, i) => (
                    <li key={name} className="animate-rise text-center" style={{ animationDelay: `${120 + i * 110}ms` }}>
                      <Illustration name={name} className="mx-auto -mb-2 w-[125%] max-w-none -translate-x-[10%]" />
                      <span className="mt-1 block text-sm font-bold lg:text-lg">{label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className={cn('mt-6 shrink-0 lg:col-start-2 lg:row-start-3 lg:mt-0 lg:w-[27rem] lg:justify-self-center', dir !== 0 && 'animate-slide-in')} aria-live="polite">
            <p className="sr-only">
              Langkah {step + 1} dari {steps.length}
            </p>
            <h1 id="onboarding-title" className="min-h-[1.9em] font-poster text-[2.5rem] leading-[0.95] text-balance uppercase lg:text-[clamp(2.75rem,8dvh,4rem)]">
              {s.title}
            </h1>
            <p className="mt-3 min-h-[3.25rem] text-base leading-relaxed text-muted-foreground lg:min-h-[3.6rem] lg:text-lg">{s.body}</p>
          </div>
        </section>

        <footer className="shrink-0 px-6 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:col-start-2 lg:row-start-4 lg:w-[27rem] lg:justify-self-center lg:px-0 lg:pt-[clamp(1.25rem,4dvh,2rem)] lg:pb-0">
          <div className="mb-5 flex justify-center gap-2 lg:justify-start" aria-hidden>
            {steps.map((_, i) => (
              <span key={i} className={cn('h-2 rounded-full transition-[width,background-color] duration-300 ease-(--ease-soft)', i === step ? 'w-7 bg-ink' : 'w-2 bg-foreground/15')} />
            ))}
          </div>
          <div className={role === 'visitor' ? 'min-h-[7rem]' : undefined}>
            {last ? (
              role === 'visitor' ? (
                signUp ? (
                  <div className="grid gap-2">
                    <Button className="h-14 text-base" onClick={() => finish('/app/daftar')}>
                      Lanjut daftar <ArrowRight />
                    </Button>
                    <Button variant="outline" className="h-12 text-base" onClick={() => finish('/app')}>
                      Lihat event dulu
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <Button className="h-14 text-base" onClick={() => finish('/app')}>
                      Lihat event <ArrowRight />
                    </Button>
                    <Button variant="outline" className="h-12 text-base" onClick={() => finish('/app/masuk')}>
                      Masuk atau daftar
                    </Button>
                  </div>
                )
              ) : (
                <Button className="h-14 w-full text-base" onClick={() => finish(signIn)}>
                  {signUp ? 'Lanjut daftar' : role === 'admin' ? 'Masuk sebagai panitia' : 'Masuk sebagai petugas'} <ArrowRight />
                </Button>
              )
            ) : (
              <div className="flex gap-2">
                {step > 0 && (
                  <Button variant="outline" className="size-14" aria-label="Langkah sebelumnya" onClick={() => go(step - 1)}>
                    <ArrowLeft className="size-5" />
                  </Button>
                )}
                <Button className="h-14 flex-1 text-base" onClick={() => go(step + 1)}>
                  Lanjut <ArrowRight />
                </Button>
              </div>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}
