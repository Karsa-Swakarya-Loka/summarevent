/**
 * Pass Saya (PV-10): every ticket as a small black ticket with its seat on the stub. Tapping one opens it on its own
 * screen, with the QR and the stub to pull.
 */
import { useState } from 'react'
import { Link } from 'react-router'
import { ChevronRight, CircleCheck, Hourglass } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import type { OrderDetail, PassItem } from '@/api/contract'
import { Countdown, EmptyState, SundaText } from '@/components/common/bits'
import { Illustration } from '@/components/common/Illustration'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { LoadError, TabHeader } from '@/components/visitor/Common'
import { continuePath, isPendingOrder, seatRangeLabel } from '@/components/visitor/helpers'
import { useVisitor } from '@/components/visitor/hooks'
import { ORDER_STATUS_LABEL, TICKET_STATUS_LABEL } from '@/domain/labels'
import { errorMessage, useLive, useNow } from '@/hooks/useLive'
import { fmtDate, fmtTime } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Group {
  orderId: string
  items: PassItem[]
}

function groupByOrder(items: PassItem[]): Group[] {
  const map = new Map<string, PassItem[]>()
  for (const it of items) map.set(it.order.id, [...(map.get(it.order.id) ?? []), it])
  return [...map.entries()].map(([orderId, list]) => ({ orderId, items: list }))
}

/** "Mulai dalam 3 hari 4 jam" / "Sedang berlangsung" / "Sudah selesai". */
function timing(item: PassItem, now: Date): { text: string; live: boolean; ended: boolean } {
  const start = new Date(item.session.startAt).getTime()
  const end = new Date(item.session.endAt).getTime()
  const t = now.getTime()
  if (item.session.demoLive || (t >= start && t < end)) return { text: 'Sedang berlangsung', live: true, ended: false }
  if (t >= end) return { text: 'Sudah selesai', live: false, ended: true }
  const min = Math.ceil((start - t) / 60_000)
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  const text = d > 0 ? `Mulai dalam ${d} hari${h ? ` ${h} jam` : ''}` : h > 0 ? `Mulai dalam ${h} jam${m ? ` ${m} menit` : ''}` : `Mulai dalam ${m} menit`
  return { text, live: false, ended: false }
}

export default function MyPass() {
  const { user, refresh } = useVisitor()
  const tickets = useLive(() => api.myTickets(), [user?.id])
  const orders = useLive(() => api.myOrders(), [user?.id])
  const now = useNow(30_000)
  const [demoBusy, setDemoBusy] = useState(false)

  const pending: OrderDetail[] = (orders.data ?? []).filter((d) => isPendingOrder(d.order) && !d.order.simulated)
  const all = tickets.data ?? []
  const isCurrent = (it: PassItem) => it.ticket.status === 'ACTIVE' && !timing(it, now).ended
  const current = all.filter(isCurrent).sort((a, b) => a.session.startAt.localeCompare(b.session.startAt))
  const checkedIn = groupByOrder(all.filter((it) => isRecentCheckin(it, now)))
  const recentIds = new Set(checkedIn.flatMap((g) => g.items.map((it) => it.ticket.id)))
  const history = all.filter((it) => !isCurrent(it) && !recentIds.has(it.ticket.id))

  const loginAsPersona = async () => {
    setDemoBusy(true)
    try {
      const u = await api.demoLogin('VISITOR')
      refresh()
      toast.success(`Masuk sebagai ${u.name} (data contoh).`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setDemoBusy(false)
    }
  }

  return (
    <div>
      <TabHeader title="Pass Saya" />

      <div className="space-y-6 px-4 pt-1 pb-6">
        {pending.map((d) => (
          <Link key={d.order.id} to={continuePath(d)} className="flex items-center gap-3 rounded-2xl border border-status-warn/60 bg-[#fff6dc] p-3 transition active:scale-[0.98]">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-status-warn/30 text-[#7a5600]">
              <Hourglass className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">Selesaikan pesananmu</span>
              <span className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-[#7a5600]">{ORDER_STATUS_LABEL[d.order.status]}</span>
                <Countdown to={d.order.holdExpiresAt} className="text-xs" />
              </span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-[#7a5600]" aria-hidden />
          </Link>
        ))}

        {tickets.loading && !tickets.data ? (
          <div className="space-y-3" aria-busy="true" aria-label="Memuat tiket">
            <Skeleton className="h-32 w-full rounded-[1.1rem]" />
            <Skeleton className="h-32 w-full rounded-[1.1rem]" />
          </div>
        ) : tickets.error && !tickets.data ? (
          <LoadError error={tickets.error} onRetry={tickets.reload} />
        ) : !all.length ? (
          user ? (
            <EmptyState
              icon={<Illustration name="tiket" className="w-32" />}
              title="Belum ada e-ticket"
              action={
                <Button asChild className="h-11">
                  <Link to="/app">Cari event</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Illustration name="padlock" className="w-28" />}
              title="Masuk untuk melihat e-ticket"
              action={
                <div className="flex w-full flex-col gap-2">
                  <Button asChild className="h-11">
                    <Link to="/app/masuk?next=/app/pass">Masuk dengan nomor HP</Link>
                  </Button>
                  <Button variant="outline" className="h-11" onClick={() => void loginAsPersona()} disabled={demoBusy}>
                    Lihat contoh: masuk sebagai Rina
                  </Button>
                </div>
              }
            />
          )
        ) : (
          <>
            {checkedIn.map((g) => (
              <div key={g.orderId} className="space-y-3">
                <ThanksCard items={g.items} />
                <ul className="space-y-3">
                  {g.items.map((it) => (
                    <li key={it.ticket.id}>
                      <MiniTicket item={it} now={now} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {current.length > 0 ? (
              <ul className="space-y-3" aria-label="E-ticket aktif">
                {current.map((it, i) => (
                  <li key={it.ticket.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 6) * 55}ms` }}>
                    <MiniTicket item={it} now={now} />
                  </li>
                ))}
              </ul>
            ) : checkedIn.length > 0 ? null : (
              <EmptyState
                icon={<Illustration name="tiket" className="w-28" />}
                title="Tidak ada tiket aktif"
                action={
                  <Button asChild className="h-11">
                    <Link to="/app">Cari event</Link>
                  </Button>
                }
              />
            )}

            {history.length > 0 && (
              <section aria-labelledby="history-title" className="space-y-3">
                <h2 id="history-title" className="px-1 text-[0.7rem] font-bold tracking-[0.18em] text-muted-foreground uppercase">
                  Riwayat
                </h2>
                <ul className="space-y-3">
                  {history.map((it) => (
                    <li key={it.ticket.id}>
                      <MiniTicket item={it} now={now} />
                    </li>
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

/** A ticket in the list: the event in display type, its seat on the stub. */
function MiniTicket({ item, now }: { item: PassItem; now: Date }) {
  const { ticket, event, session, category } = item
  const time = timing(item, now)
  const active = ticket.status === 'ACTIVE' && !time.ended
  const day = session.demoLive ? 'Hari ini' : fmtDate(session.startAt, { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')
  const note = ticket.status === 'USED' && ticket.usedAt ? `Masuk ${fmtTime(ticket.usedAt)}` : ticket.status === 'ACTIVE' ? time.text : TICKET_STATUS_LABEL[ticket.status]
  return (
    <article aria-label={`E-ticket ${ticket.seatLabel ? `kursi ${ticket.seatLabel}` : category.name}`}>
      <Link
        to={`/app/pass/${ticket.id}`}
        className={cn('ticket-mini relative flex min-h-32 overflow-hidden rounded-[1.1rem] text-[#ededed] transition active:scale-[0.98]', active ? 'talon-card' : 'bg-[#4a4746]')}
      >
        <i className="talon-grain" aria-hidden />
        <span className="relative flex min-w-0 flex-1 flex-col justify-between gap-2.5 py-3.5 pr-3 pl-4">
          <span className="talon-label truncate">
            {category.name} · {day} · {fmtTime(session.startAt)}
          </span>
          <span className="line-clamp-2 font-poster text-[1.6rem] leading-[0.92] uppercase">{event.title}</span>
          <span className={cn('flex items-center gap-1.5 text-xs font-semibold', active && time.live ? 'text-[#2fb36d]' : 'text-white/65')}>
            {active && time.live && <span className="size-1.5 rounded-full bg-[#2fb36d]" aria-hidden />}
            {note}
          </span>
        </span>
        <span className="relative flex w-[5.5rem] shrink-0 flex-col items-center justify-center border-l-2 border-dashed border-white/20">
          <span className="talon-label">{ticket.seatLabel ? 'Kursi' : 'Untuk'}</span>
          <span className="font-poster text-[2.2rem] leading-none">{ticket.seatLabel ?? '1'}</span>
        </span>
      </Link>
    </article>
  )
}

/** How long the "Hatur nuhun!" card stays after the gate scanned a ticket. */
const THANKS_MS = 3 * 3600_000

function isRecentCheckin(it: PassItem, now: Date): boolean {
  if (it.ticket.status !== 'USED' || !it.ticket.usedAt) return false
  return now.getTime() - new Date(it.ticket.usedAt).getTime() < THANKS_MS
}

/** "Hatur nuhun!" after check-in (PRD §1), once per order, while the visit is fresh. */
function ThanksCard({ items }: { items: PassItem[] }) {
  const firstScan = items.map((it) => it.ticket.usedAt ?? '').sort()[0]
  const seats = items.map((it) => it.ticket.seatLabel).filter((s): s is string => !!s)
  return (
    <section aria-label="Sudah check-in" className="flex items-center gap-3 rounded-[1.1rem] bg-brand p-4 text-white">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/15">
        <CircleCheck className="size-6" aria-hidden />
      </span>
      <div className="min-w-0">
        <SundaText k="thanks" size="lg" />
        <p className="mt-1 text-sm text-white/85">
          {seats.length ? seatRangeLabel(seats) : `${items.length} tiket`} masuk jam {fmtTime(firstScan)}
        </p>
      </div>
    </section>
  )
}
