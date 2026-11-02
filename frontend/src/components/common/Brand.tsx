import { useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Summarevent mark. Artwork lives in /public/brand so the logo can be swapped
 * (logo kit) without touching code.
 */
export function BrandSymbol({ className, title = 'Summarevent' }: { className?: string; title?: string }) {
  return <img src="/brand/summarevent-symbol.svg" alt={title} className={cn('size-8 select-none', className)} draggable={false} />
}

/** The app icon exactly as it appears on a phone home screen (green tile). */
export function BrandAppIcon({ className }: { className?: string }) {
  return <img src="/brand/summarevent-app-icon.svg" alt="Ikon app Summarevent" className={cn('size-16 select-none', className)} draggable={false} />
}

export function BrandLockup({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <img
      src={inverted ? '/brand/summarevent-lockup-white.svg' : '/brand/summarevent-lockup.svg'}
      alt="Summarevent"
      className={cn('h-8 w-auto select-none', className)}
      draggable={false}
    />
  )
}

/**
 * Official SUMMABA logo (/public/brand/summaba-logo.png, file supplied by the team).
 * The artwork is never recoloured: on dark or green backgrounds (tone "light") it sits
 * on a white plate. If the file is missing, a plain text fallback is shown instead.
 */
export function SummabaLogo({ className, tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span
        className={cn(
          'inline-flex flex-col leading-none font-semibold tracking-tight',
          tone === 'light' ? 'text-white' : 'text-brand',
          className,
        )}
        aria-label="Summarecon Mall Bandung"
      >
        <span className="text-[0.95em]">Summarecon Mall</span>
        <span className="text-[0.7em] font-medium opacity-80">Bandung</span>
      </span>
    )
  }
  const img = (
    <img
      src="/brand/summaba-logo.png"
      alt="Summarecon Mall Bandung"
      className={cn('h-8 w-auto select-none', tone === 'light' ? 'h-full' : className)}
      width={431}
      height={98}
      onError={() => setFailed(true)}
      draggable={false}
    />
  )
  if (tone === 'light') {
    return <span className={cn('inline-flex h-8 items-center rounded-lg bg-white px-2 py-1 shadow-sm', className)}>{img}</span>
  }
  return img
}

/** "Untuk SUMMABA" co-brand strip used on the role picker and the visitor home. */
export function CoBrand({ className, tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <BrandLockup className="h-auto w-[min(13rem,50vw)]" inverted={tone === 'light'} />
      <span className={cn('h-6 w-px shrink-0', tone === 'light' ? 'bg-white/40' : 'bg-border')} aria-hidden />
      <SummabaLogo className="h-8 shrink-0 text-sm" tone={tone} />
    </div>
  )
}
