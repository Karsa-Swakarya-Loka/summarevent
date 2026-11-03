/**
 * Pesan (PV-13): the WhatsApp / email messages the backend would send, shown in-app
 * because both channels are simulated. Scheduled reminders show when they will go out.
 */
import { Link } from 'react-router'
import { CalendarClock, CheckCheck, Mail, MessageCircle } from 'lucide-react'
import { api } from '@/api'
import type { AppNotification } from '@/domain/types'
import { EmptyState } from '@/components/common/bits'
import { Illustration } from '@/components/common/Illustration'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { LoadError, SimTag, TabHeader } from '@/components/visitor/Common'
import { useVisitor } from '@/components/visitor/hooks'
import { useLive } from '@/hooks/useLive'
import { fmtDateTime, fmtTime } from '@/lib/format'
import { cn } from '@/lib/utils'

export default function Inbox() {
  const { user } = useVisitor()
  const notes = useLive(() => api.myNotifications(), [user?.id])
  const list = notes.data ?? []
  const scheduled = list.filter((n) => n.scheduledFor)
  const sent = list.filter((n) => !n.scheduledFor)

  return (
    <div>
      <TabHeader title="Pesan" subtitle="Konfirmasi dan pengingat yang dikirim lewat WhatsApp dan email." />

      <div className="space-y-5 px-4 pt-1 pb-6">
        <p className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
          <SimTag /> Di prototype ini WA dan email tidak benar-benar terkirim. Isinya ditampilkan di sini.
        </p>

        {notes.loading && !notes.data ? (
          <div className="space-y-3" aria-busy="true" aria-label="Memuat pesan">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        ) : notes.error && !notes.data ? (
          <LoadError error={notes.error} onRetry={notes.reload} />
        ) : !list.length ? (
          <EmptyState
            icon={<Illustration name="mailbox" className="w-32" />}
            title="Belum ada pesan"
            action={
              <Button asChild className="h-11">
                <Link to={user ? '/app' : '/app/akun'}>{user ? 'Cari event' : 'Masuk'}</Link>
              </Button>
            }
          >
            {user ? 'Konfirmasi pesanan, hasil verifikasi struk, dan pengingat H-1 akan muncul di sini.' : 'Masuk dulu untuk melihat pesan yang dikirim ke nomor HP kamu.'}
          </EmptyState>
        ) : (
          <>
            {scheduled.length > 0 && (
              <section aria-label="Pengingat terjadwal" className="space-y-2">
                <h2 className="px-1 text-sm font-bold">Terjadwal</h2>
                <ul className="space-y-2">
                  {scheduled.map((n) => (
                    <li key={n.id}>
                      <ScheduledCard n={n} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {sent.length > 0 && (
              <section aria-label="Pesan terkirim" className="space-y-3">
                <h2 className="px-1 text-sm font-bold">Terkirim</h2>
                <ul className="space-y-3">
                  {sent.map((n) => (
                    <li key={n.id}>{n.channel === 'WA' ? <WaBubble n={n} /> : <EmailCard n={n} />}</li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function WaBubble({ n }: { n: AppNotification }) {
  return (
    <article className="flex gap-2" aria-label={`WhatsApp: ${n.title}`}>
      <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-white" aria-hidden>
        <MessageCircle className="size-4" />
      </span>
      <div className="relative max-w-[85%] min-w-0 rounded-2xl rounded-tl-sm bg-brand-soft px-3 py-2 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-brand">WhatsApp · Summarevent</span>
          <SimTag />
        </div>
        <p className="mt-1 text-sm font-semibold">{n.title}</p>
        <p className="text-sm text-pretty">{n.body}</p>
        <p className="mt-1 flex items-center justify-end gap-1 text-[0.68rem] text-muted-foreground">
          {fmtDateTime(n.createdAt)} <CheckCheck className="size-3.5 text-blue-600" aria-label="Terkirim" />
        </p>
      </div>
    </article>
  )
}

function EmailCard({ n }: { n: AppNotification }) {
  return (
    <article className="rounded-2xl border bg-card p-3" aria-label={`Email: ${n.title}`}>
      <div className="flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
          <Mail className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Email dari Summarevent</p>
          <p className="truncate text-sm font-bold">{n.title}</p>
        </div>
        <SimTag />
      </div>
      <p className="mt-2 text-sm text-pretty">{n.body}</p>
      <p className="mt-1 text-right text-[0.68rem] text-muted-foreground">{fmtDateTime(n.createdAt)}</p>
    </article>
  )
}

function ScheduledCard({ n }: { n: AppNotification }) {
  return (
    <article className={cn('rounded-2xl border border-dashed border-ink/25 bg-card p-3')} aria-label={`Terjadwal: ${n.title}`}>
      <div className="flex items-start gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand" aria-hidden>
          <CalendarClock className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-brand">
            Terjadwal: {fmtDateTime(n.scheduledFor!)} · {n.channel === 'WA' ? 'WhatsApp' : 'Email'}
          </p>
          <p className="text-sm font-bold">{n.title}</p>
          <p className="text-sm text-pretty text-muted-foreground">{n.body}</p>
        </div>
      </div>
      <p className="mt-1 text-right text-[0.68rem] text-muted-foreground">Dijadwalkan {fmtTime(n.createdAt)} WIB</p>
    </article>
  )
}
