/**
 * One message from Pesan on its own screen: a WhatsApp message as a chat, an email as a letter, and under it the screen
 * it points to. Opening it marks it read on this phone.
 */
import { useEffect } from 'react'
import { Link, useParams } from 'react-router'
import { CheckCheck, Clock3 } from 'lucide-react'
import { api, ApiError } from '@/api'
import type { AppNotification, User } from '@/domain/types'
import { BackHeader } from '@/components/common/bits'
import { Button } from '@/components/ui/button'
import { LoadError, PageSkeleton, SimTag } from '@/components/visitor/Common'
import { useVisitor } from '@/components/visitor/hooks'
import { messageNext } from '@/components/visitor/helpers'
import { MessageAvatar } from '@/components/visitor/MessageAvatar'
import { useLive } from '@/hooks/useLive'
import { fmtDate, fmtDateTime, fmtTime } from '@/lib/format'
import { markSeen } from '@/lib/seen'

export default function Message() {
  const { noteId = '' } = useParams()
  const { user } = useVisitor()
  const notes = useLive(() => api.myNotifications(), [user?.id])
  const n = notes.data?.find((x) => x.id === noteId)
  const readId = n && !n.scheduledFor ? n.id : null
  useEffect(() => {
    if (readId) markSeen('read', [readId])
  }, [readId])

  if (notes.loading && !notes.data) {
    return (
      <div>
        <BackHeader to="/app/inbox" title="Pesan" />
        <PageSkeleton />
      </div>
    )
  }
  if (!n) {
    return (
      <div>
        <BackHeader to="/app/inbox" title="Pesan" />
        <LoadError error={notes.error ?? new ApiError('NOT_FOUND', 'Pesan tidak ditemukan. Pastikan kamu masuk dengan nomor HP yang sama.')} onRetry={notes.error ? notes.reload : undefined} backTo="/app/inbox" backLabel="Kembali ke Pesan" />
      </div>
    )
  }
  return n.channel === 'WA' ? <Chat n={n} /> : <Letter n={n} user={user} />
}

function Chat({ n }: { n: AppNotification }) {
  const next = messageNext(n)
  const at = n.scheduledFor ?? n.createdAt
  return (
    <div className="flex flex-1 flex-col">
      <BackHeader
        to="/app/inbox"
        title={
          <span className="flex items-center gap-2.5">
            <MessageAvatar n={n} small />
            <span className="min-w-0 leading-tight">
              <span className="block truncate">Summarevent</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">WhatsApp · simulasi</span>
            </span>
          </span>
        }
      />
      <div className="relative flex-1 overflow-hidden bg-[#efe9dd] px-4 pt-5 pb-10">
        <div className="seat-dots pointer-events-none absolute inset-0 text-ink/[0.05]" aria-hidden />
        <div className="relative space-y-3">
          <p className="mx-auto w-fit rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-muted-foreground shadow-xs">
            {n.scheduledFor ? `Terjadwal ${fmtDateTime(n.scheduledFor)}` : fmtDate(n.createdAt, { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <article aria-label={`WhatsApp: ${n.title}`} className="max-w-[86%] origin-top-left animate-pop rounded-2xl rounded-tl-sm bg-white px-3.5 pt-2.5 pb-2 shadow-xs">
            <h1 className="font-bold">{n.title}</h1>
            <p className="mt-1 text-[0.95rem] text-pretty">{n.body}</p>
            <p className="mt-1.5 flex items-center justify-end gap-1 text-[0.7rem] text-muted-foreground tabular-nums">
              {fmtTime(at)}
              {n.scheduledFor ? <Clock3 className="size-3.5" aria-label="Belum terkirim" /> : <CheckCheck className="size-3.5 text-[#2d4c8f]" aria-label="Terkirim" />}
            </p>
          </article>
          <div className="max-w-[86%] animate-rise [animation-delay:160ms]">
            <Button asChild variant="outline" className="h-11 w-full bg-white">
              <Link to={next.to}>{next.label}</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Letter({ n, user }: { n: AppNotification; user: User | null }) {
  const next = messageNext(n)
  return (
    <div>
      <BackHeader to="/app/inbox" title="Email" right={<SimTag className="mr-1" />} />
      <article aria-labelledby="mail-subject" className="px-4 pt-2 pb-10">
        <h1 id="mail-subject" className="animate-rise font-poster text-[2.3rem] leading-[0.95] text-balance uppercase">
          {n.title}
        </h1>
        <div className="mt-4 flex animate-rise items-center gap-3 [animation-delay:60ms]">
          <MessageAvatar n={n} />
          <p className="min-w-0 flex-1 text-sm leading-tight">
            <span className="block font-bold">Summarevent</span>
            <span className="block truncate text-muted-foreground">untuk {user?.name ?? 'kamu'}</span>
          </p>
          <span className="shrink-0 text-xs text-muted-foreground">{fmtDateTime(n.scheduledFor ?? n.createdAt)}</span>
        </div>
        <div className="mt-5 animate-rise rounded-[1.4rem] bg-card p-5 shadow-xs [animation-delay:120ms]">
          <p className="text-[0.95rem] leading-relaxed text-pretty">{n.body}</p>
          <Button asChild className="mt-5 h-12 w-full">
            <Link to={next.to}>{next.label}</Link>
          </Button>
        </div>
      </article>
    </div>
  )
}
