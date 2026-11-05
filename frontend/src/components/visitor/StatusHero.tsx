import type { ReactNode } from 'react'
import { Illustration } from '@/components/common/Illustration'
import type { ArtName } from '@/components/stickers/Art'
import { cn } from '@/lib/utils'

const TONE = {
  brand: 'bg-brand text-white',
  warn: 'bg-[#ffe7a3] text-ink',
  ink: 'bg-ink text-white',
} as const

/** One status, big: a sticker, the state in display type, at most a line or two under it. */
export function StatusHero({ tone, art, label, title, children }: { tone: keyof typeof TONE; art: ArtName; label: string; title: ReactNode; children?: ReactNode }) {
  const light = tone === 'warn'
  return (
    <section className={cn('relative overflow-hidden rounded-[1.75rem] px-5 pt-4 pb-6 text-center', TONE[tone])} aria-live="polite">
      <div className={cn('seat-dots pointer-events-none absolute inset-0', light ? 'text-ink/[0.07]' : 'text-white/[0.08]')} aria-hidden />
      <Illustration name={art} loop={false} className="relative mx-auto -mb-2 w-36 animate-pop" />
      <p className={cn('relative mx-auto w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold', light ? 'bg-ink/10 text-ink' : 'bg-white/15 text-white')}>{label}</p>
      <h1 className="relative mt-1.5 font-poster text-[2.6rem] leading-[0.95] text-balance uppercase">{title}</h1>
      {children && <div className={cn('relative mx-auto mt-3 max-w-xs space-y-2 text-sm', light ? 'text-ink/85' : 'text-white/85')}>{children}</div>}
    </section>
  )
}
