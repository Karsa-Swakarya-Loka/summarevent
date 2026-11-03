/**
 * First-run onboarding for visitors: seats, the three ways in, and the e-ticket, in three steps. Shown once per device
 * (replayable from the demo menu); swipe, the arrow keys or the buttons move between steps.
 */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { BrandAppIcon } from '@/components/common/Brand'
import { Illustration } from '@/components/common/Illustration'
import { Button } from '@/components/ui/button'
import type { ArtName } from '@/components/stickers/Art'
import { ACCESS_METHOD_LABEL } from '@/domain/labels'
import { setOnboardingDone } from '@/lib/intro'
import { cn } from '@/lib/utils'

const STEPS: ReadonlyArray<{ art: ReadonlyArray<{ name: ArtName; label?: string }>; panel: string; dots: string; title: string; body: string }> = [
  {
    art: [{ name: 'kursi' }],
    panel: 'bg-brand-soft',
    dots: 'text-brand/15',
    title: 'Pilih kursimu sendiri',
    body: 'Lihat denahnya, ketuk kursi yang masih kosong, atau biar kami pilihkan yang berdampingan. Kursi pilihanmu ditahan selama kamu menyelesaikan pesanan.',
  },
  {
    art: [
      { name: 'coins', label: ACCESS_METHOD_LABEL.PAID },
      { name: 'gift', label: ACCESS_METHOD_LABEL.FREE },
      { name: 'notes', label: ACCESS_METHOD_LABEL.RECEIPT },
    ],
    panel: 'bg-[#fff1e2]',
    dots: 'text-brand-orange/20',
    title: 'Bayar, gratis, atau tukar struk',
    body: 'Tiap kategori kursi punya caranya sendiri: bayar lewat QRIS atau Virtual Account, daftar gratis, atau tukar struk belanja di tenant SUMMABA.',
  },
  {
    art: [{ name: 'tiket' }],
    panel: 'bg-[#fff7c7]',
    dots: 'text-[#8a6d00]/15',
    title: 'Satu QR untuk masuk',
    body: 'E-ticket QR tersimpan di Pass Saya, satu untuk tiap kursi. Tunjukkan ke petugas di pintu, langsung masuk.',
  },
]

export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const swipeFrom = useRef<number | null>(null)
  const last = step === STEPS.length - 1
  const s = STEPS[step]

  const go = (next: number) => {
    const n = Math.max(0, Math.min(STEPS.length - 1, next))
    if (n === step) return
    setDir(n > step ? 1 : -1)
    setStep(n)
  }
  const finish = (to: string) => {
    setOnboardingDone(true)
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
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <BrandAppIcon className="size-10 rounded-xl" />
        <Button variant="ghost" className="h-11 px-4 text-base text-muted-foreground" onClick={() => finish('/app')}>
          Lewati
        </Button>
      </header>

      <section
        key={step}
        aria-labelledby="onboarding-title"
        className="flex flex-1 touch-pan-y flex-col px-6"
        style={{ '--slide-from': `${dir * 36}px` } as CSSProperties}
        onPointerDown={(e) => (swipeFrom.current = e.clientX)}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipeFrom.current = null)}
      >
        <div className={cn('relative mx-auto mt-4 grid aspect-square w-full max-w-[19rem] place-items-center overflow-hidden rounded-[2.5rem]', s.panel)}>
          <div className={cn('seat-dots absolute inset-0', s.dots)} aria-hidden />
          {s.art.length === 1 ? (
            <Illustration name={s.art[0].name} className="relative w-[82%] animate-pop" />
          ) : (
            <ul className="relative grid w-full grid-cols-3">
              {s.art.map(({ name, label }, i) => (
                <li key={name} className="animate-rise text-center" style={{ animationDelay: `${120 + i * 110}ms` }}>
                  <Illustration name={name} className="mx-auto -mb-2 w-[125%] max-w-none -translate-x-[10%]" />
                  <span className="mt-1 block text-sm font-bold">{label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-8 animate-slide-in" aria-live="polite">
          <p className="text-sm font-semibold text-brand">
            Langkah {step + 1} dari {STEPS.length}
          </p>
          <h1 id="onboarding-title" className="mt-1 text-[1.75rem] leading-tight font-extrabold tracking-tight text-balance">
            {s.title}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">{s.body}</p>
        </div>
      </section>

      <footer className="px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="mb-5 flex justify-center gap-2" aria-hidden>
          {STEPS.map((_, i) => (
            <span key={i} className={cn('h-2 rounded-full transition-[width,background-color] duration-300 ease-(--ease-soft)', i === step ? 'w-7 bg-brand' : 'w-2 bg-foreground/15')} />
          ))}
        </div>
        {last ? (
          <div className="grid gap-2">
            <Button className="h-14 text-base" onClick={() => finish('/app')}>
              Mulai pilih kursi <ArrowRight />
            </Button>
            <Button variant="outline" className="h-12 text-base" onClick={() => finish('/app/masuk')}>
              Masuk atau daftar
            </Button>
          </div>
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
      </footer>
    </div>
  )
}
