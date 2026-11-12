import type { ReactNode } from 'react'
import { CoBrand } from '@/components/common/Brand'
import { Illustration } from '@/components/common/Illustration'
import type { ArtName } from '@/components/stickers/Art'
import { cn } from '@/lib/utils'

/**
 * The green half of the sign-in screens on a laptop: the brand, the screen's sticker large and, when given, what the
 * role gets in poster type, with room at the foot for the demo notes. It stays put while the form beside it scrolls,
 * and sizes itself to the window's height so a short laptop screen still shows all of it. Hidden below lg, where these
 * screens are a single column. It always takes the left column, wherever it sits in the page order.
 */
export function AuthArt({ art, label, lines, children }: { art: ArtName; label?: string; lines?: ReadonlyArray<string>; children?: ReactNode }) {
  return (
    <aside className="sticky top-0 hidden h-dvh overflow-hidden bg-brand px-12 py-[clamp(1.75rem,6dvh,3rem)] text-white lg:order-first lg:flex lg:flex-col">
      <div className="seat-dots pointer-events-none absolute inset-0 text-white/[0.08]" aria-hidden />
      <CoBrand tone="light" className="relative" />
      <div className={cn('relative flex min-h-0 flex-1 flex-col justify-center py-[3dvh]', !lines && 'items-center')}>
        <Illustration name={art} className={cn('animate-pop', lines ? 'w-[clamp(5rem,22dvh,14rem)]' : 'w-[clamp(10rem,52dvh,24rem)]')} />
        {label && <p className="mt-[3dvh] text-base font-semibold text-white/80 [@media(max-height:640px)]:hidden">{label}</p>}
        {lines && (
          <ul className="mt-2 space-y-1.5">
            {lines.map((line) => (
              <li key={line} className="font-poster text-[clamp(1.75rem,5.6dvh,2.6rem)] leading-[0.95] text-balance uppercase">
                {line}
              </li>
            ))}
          </ul>
        )}
      </div>
      {children && <div className="relative">{children}</div>}
    </aside>
  )
}

/**
 * The phone's counterpart of AuthArt: the screen's sticker on a small seat-dot tile above the title, the same on every
 * sign-in, sign-up and password screen. On a short phone the form comes first, so the tile gives way; on a laptop the
 * green half carries the sticker instead.
 */
export function AuthTile({ art }: { art: ArtName }) {
  return (
    <div className="relative mx-auto mb-6 grid size-28 place-items-center overflow-hidden rounded-[1.75rem] bg-brand-soft lg:hidden [@media(max-height:780px)]:hidden">
      <div className="seat-dots absolute inset-0 text-brand/15" aria-hidden />
      <Illustration name={art} className="relative w-22 animate-pop" />
    </div>
  )
}
