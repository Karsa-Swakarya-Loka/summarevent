import type { User } from '@/domain/types'
import { cn } from '@/lib/utils'

/** The visitor's profile photo, or their initials on yellow when there is none. Size and type size come from className. */
export function UserAvatar({ user, src, className }: { user: Pick<User, 'name' | 'avatarUrl'>; src?: string | null; className?: string }) {
  const photo = src === undefined ? user.avatarUrl : src
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <span className={cn('relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand-yellow font-poster text-ink', className)} aria-hidden>
      {photo ? <img src={photo} alt="" className="absolute inset-0 size-full object-cover" /> : initials}
    </span>
  )
}
