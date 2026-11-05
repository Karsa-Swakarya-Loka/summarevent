/**
 * Pesan (PV-13): the WhatsApp and email messages the backend would send, as an inbox. Both channels are simulated, so
 * this is where they arrive. Each opens on its own screen; reminders still waiting to go out sit on top.
 */
import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '@/api'
import type { AppNotification } from '@/domain/types'
import { EmptyState } from '@/components/common/bits'
import { Illustration } from '@/components/common/Illustration'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { LoadError, SectionLabel, SimTag, TabHeader } from '@/components/visitor/Common'
import { useVisitor } from '@/components/visitor/hooks'
import { messageWhen } from '@/components/visitor/helpers'
import { MessageAvatar } from '@/components/visitor/MessageAvatar'
import { useLive } from '@/hooks/useLive'
import { readSeen, type Seen } from '@/lib/seen'
import { cn } from '@/lib/utils'

export default function Inbox() {
  const { user } = useVisitor()
  const notes = useLive(() => api.myNotifications(), [user?.id])
  const [seen] = useState(readSeen)
  const list = notes.data ?? []
  const scheduled = list.filter((n) => n.scheduledFor)
  const sent = list.filter((n) => !n.scheduledFor)

  return (
    <div className="lg:mx-auto lg:w-full lg:max-w-3xl lg:px-4">
      <TabHeader title="Pesan" />

      <div className="space-y-6 px-4 pt-1 pb-6">
        <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <SimTag /> WA dan email tidak benar-benar terkirim.
        </p>

        {notes.loading && !notes.data ? (
          <div className="space-y-2" role="status" aria-busy="true" aria-label="Memuat pesan">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-18 w-full rounded-2xl" />
            ))}
          </div>
        ) : notes.error && !notes.data ? (
          <LoadError error={notes.error} onRetry={notes.reload} />
        ) : !list.length ? (
          <EmptyState
            icon={<Illustration name="mailbox" className="w-32" />}
            title={user ? 'Belum ada pesan' : 'Masuk untuk melihat pesan'}
            action={
              <Button asChild className="h-11">
                <Link to={user ? '/app' : '/app/masuk?next=/app/inbox'}>{user ? 'Cari event' : 'Masuk dengan nomor HP'}</Link>
              </Button>
            }
          />
        ) : (
          <>
            {scheduled.length > 0 && <Group id="sched-title" title="Terjadwal" items={scheduled} seen={seen} />}
            {sent.length > 0 && <Group id="sent-title" title="Terkirim" items={sent} seen={seen} />}
          </>
        )}
      </div>
    </div>
  )
}

function Group({ id, title, items, seen }: { id: string; title: string; items: AppNotification[]; seen: Seen }) {
  return (
    <section aria-labelledby={id} className="space-y-2.5">
      <SectionLabel id={id}>{title}</SectionLabel>
      <ul className="divide-y overflow-hidden rounded-[1.4rem] bg-card shadow-xs">
        {items.map((n, i) => (
          <li key={n.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 6) * 45}ms` }}>
            <Row n={n} unread={!n.scheduledFor && !seen.read.has(n.id)} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** One line per message, the way a chat list shows it: who, the title, the first words, when. */
function Row({ n, unread }: { n: AppNotification; unread: boolean }) {
  return (
    <Link to={`/app/inbox/${n.id}`} className="flex min-h-18 items-center gap-3 px-3.5 py-3 transition active:bg-muted">
      <MessageAvatar n={n} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cn('min-w-0 flex-1 truncate', unread ? 'font-extrabold' : 'font-semibold')}>{n.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{messageWhen(n.scheduledFor ?? n.createdAt)}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className={cn('min-w-0 flex-1 truncate text-sm', unread ? 'text-foreground' : 'text-muted-foreground')}>{n.body}</span>
          {unread && (
            <>
              <span className="size-2.5 shrink-0 rounded-full bg-ink" aria-hidden />
              <span className="sr-only">Belum dibaca</span>
            </>
          )}
        </span>
      </span>
    </Link>
  )
}
