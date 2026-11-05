import { lazy, Suspense } from 'react'
import type { ArtName } from '@/components/stickers/Art'
import { cn } from '@/lib/utils'

const Art = lazy(() => import('@/components/stickers/Art'))

/**
 * A moving sticker (fun-isometric kit, Summarecon colours). Decorative, so hidden from screen readers; the text next to
 * it carries the meaning. Under reduced motion it rests on its still frame.
 */
export function Illustration({ name, className, loop = true, enter, still }: { name: ArtName; className?: string; loop?: boolean; enter?: number; still?: boolean }) {
  return (
    <div aria-hidden="true" className={cn('aspect-square', className)}>
      <Suspense fallback={null}>
        <Art name={name} loop={loop} enter={enter} still={still} />
      </Suspense>
    </div>
  )
}
