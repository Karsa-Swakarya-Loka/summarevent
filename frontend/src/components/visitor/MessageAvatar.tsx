import { CalendarClock, Mail, MessageCircle } from 'lucide-react'
import type { AppNotification } from '@/domain/types'
import { cn } from '@/lib/utils'

/** WhatsApp in the brand green, email in ink, a reminder still waiting in yellow. */
export function MessageAvatar({ n, small = false }: { n: AppNotification; small?: boolean }) {
  const Icon = n.scheduledFor ? CalendarClock : n.channel === 'WA' ? MessageCircle : Mail
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full',
        small ? 'size-9' : 'size-11',
        n.scheduledFor ? 'bg-brand-yellow text-ink' : n.channel === 'WA' ? 'bg-brand text-white' : 'bg-ink text-white',
      )}
      aria-hidden
    >
      <Icon className={small ? 'size-4' : 'size-5'} />
    </span>
  )
}
