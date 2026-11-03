/**
 * Pass Saya (PV-10): one ticket card per seat, QR always one tap away, status always visible.
 */
import { useState } from 'react'
import { Link } from 'react-router'
import { ChevronRight, CircleCheck, Hourglass, Sun } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import type { OrderDetail, PassItem } from '@/api/contract'
import { Countdown, EmptyState, StatusBadge, SundaText } from '@/components/common/bits'
import { QrCode } from '@/components/common/QrCode'
import { Illustration } from '@/components/common/Illustration'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { LoadError, TabHeader } from '@/components/visitor/Common'
import { TalonTicket } from '@/components/visitor/TalonTicket'
import { continuePath, isPendingOrder, seatRangeLabel, sessionWhen } from '@/components/visitor/helpers'
import { useVisitor } from '@/components/visitor/hooks'
import { ORDER_STATUS_LABEL, TICKET_STATUS_LABEL, TICKET_TONE } from '@/domain/labels'
import { errorMessage, useLive, useNow } from '@/hooks/useLive'
import { fmtTime } from '@/lib/format'

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
  const [big, setBig] = useState<PassItem | null>(null)
  const [demoBusy, setDemoBusy] = useState(false)

  const pending: OrderDetail[] = (orders.data ?? []).filter((d) => isPendingOrder(d.order) && !d.order.simulated)
  const all = tickets.data ?? []
  const isCurrent = (it: PassItem) => it.ticket.status === 'ACTIVE' && !timing(it, now).ended
  const current = groupByOrder(all.filter(isCurrent))
  const checkedIn = groupByOrder(all.filter((it) => isRecentCheckin(it, now)))
  const recentIds = new Set(checkedIn.flatMap((g) => g.items.map((it) => it.ticket.id)))
  const history = all.filter((it) => !isCurrent(it) && !recentIds.has(it.ticket.id))

  // each ticket's issuing and tearing plays once on this phone: what was already seen is read when the screen opens
  const [seen] = useState(readSeen)

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
      <TabHeader title="Pass Saya" subtitle={user ? `E-ticket atas nama ${user.name}` : 'E-ticket QR kamu ada di sini.'} />

      <div className="space-y-5 px-4 pt-1 pb-6">
        {pending.map((d) => (
          <Link key={d.order.id} to={continuePath(d)} className="flex items-center gap-3 rounded-2xl border border-status-warn/50 bg-status-warn/12 p-3 transition hover:bg-status-warn/20">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-status-warn/25 text-[#7a5600]">
              <Hourglass className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">Selesaikan pesananmu</span>
              <span className="block truncate text-xs text-muted-foreground">
                {d.event.title} · {d.category.name}
                {d.order.items.some((i) => i.seatLabel) ? ` · ${seatRangeLabel(d.order.items.map((i) => i.seatLabel ?? '').filter(Boolean))}` : ` · ${d.order.qty} orang`}
              </span>
              <span className="mt-0.5 flex items-center gap-2 text-xs">
                <span className="font-semibold text-[#7a5600]">{ORDER_STATUS_LABEL[d.order.status]}</span>
                <Countdown to={d.order.holdExpiresAt} className="text-sm" />
              </span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        ))}

        {tickets.loading && !tickets.data ? (
          <div className="space-y-4" aria-busy="true" aria-label="Memuat tiket">
            <Skeleton className="h-[30rem] w-full rounded-3xl" />
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
            >
              Pilih event dan kursimu. Begitu terkonfirmasi, e-ticket QR muncul di sini.
            </EmptyState>
          ) : (
            <EmptyState
              icon={<Illustration name="padlock" className="w-28" />}
              title="Masuk untuk melihat e-ticket"
              action={
                <div className="flex w-full flex-col gap-2">
                  <Button asChild className="h-11">
                    <Link to="/app/akun">Masuk dengan nomor HP</Link>
                  </Button>
                  <Button variant="outline" className="h-11" onClick={() => void loginAsPersona()} disabled={demoBusy}>
                    Lihat contoh: masuk sebagai Rina
                  </Button>
                </div>
              }
            >
              E-ticket tersimpan di akun nomor HP yang kamu pakai saat memesan.
            </EmptyState>
          )
        ) : (
          <>
            {checkedIn.map((g) => (
              <div key={g.orderId} className="space-y-4">
                <ThanksCard items={g.items} />
                {g.items.map((it) => (
                  <TalonTicket key={it.ticket.id} item={it} status="" live={false} torn tear={!seen.torn.has(it.ticket.id)} onTorn={() => markSeen([], [it.ticket.id])} />
                ))}
              </div>
            ))}

            {current.length > 0 ? (
              current.map((g) => {
                const first = g.items[0]
                return (
                  <section key={g.orderId} aria-label={`Pesanan ${first.order.code}`} className="space-y-3">
                    <div className="flex items-baseline justify-between gap-2 px-1">
                      <h2 className="min-w-0 truncate text-sm font-bold">{first.event.title}</h2>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {g.items.length} tiket · {first.order.code}
                      </span>
                    </div>
                    {g.items.map((it) => {
                      const time = timing(it, now)
                      return (
                        <TalonTicket
                          key={it.ticket.id}
                          item={it}
                          status={time.text}
                          live={time.live}
                          issue={!seen.issued.has(it.ticket.id)}
                          onIssued={() => markSeen([it.ticket.id], [])}
                          onZoom={() => setBig(it)}
                        />
                      )
                    })}
                  </section>
                )
              })
            ) : checkedIn.length > 0 ? null : (
              <EmptyState
                icon={<Illustration name="tiket" className="w-28" />}
                title="Tidak ada tiket aktif"
                action={
                  <Button asChild className="h-11">
                    <Link to="/app">Cari event</Link>
                  </Button>
                }
              >
                Tiket yang sudah dipakai atau selesai ada di Riwayat.
              </EmptyState>
            )}

            {history.length > 0 && (
              <section aria-label="Riwayat tiket" className="space-y-2">
                <h2 className="px-1 text-sm font-bold text-muted-foreground">Riwayat</h2>
                <ul className="space-y-2">
                  {history.map((it) => (
                    <li key={it.ticket.id}>
                      <HistoryRow item={it} now={now} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      <Dialog open={!!big} onOpenChange={(o) => !o && setBig(null)}>
        <DialogContent className="sm:max-w-sm">
          {big && (
            <>
              <DialogHeader>
                <DialogTitle>{big.ticket.seatLabel ? `Kursi ${big.ticket.seatLabel}` : big.category.name}</DialogTitle>
                <DialogDescription>
                  {big.event.title} · {sessionWhen(big.session)}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-3">
                <div className="w-full max-w-[19rem] rounded-xl bg-white p-3 ring-1 ring-border">
                  <QrCode value={big.ticket.qrToken} className="block h-auto w-full" />
                </div>
                <p className="font-mono text-lg font-bold tracking-wider">{big.ticket.code}</p>
                <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  <Sun className="size-4 shrink-0" aria-hidden /> Naikkan kecerahan layar supaya QR mudah dipindai.
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Tickets whose issuing (QR assembly) and tearing (check-in) this phone has already shown. */
const SEEN_KEY = 'summarevent:talon'
function readSeen(): { issued: Set<string>; torn: Set<string> } {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as { issued?: string[]; torn?: string[] }
    return { issued: new Set(v.issued ?? []), torn: new Set(v.torn ?? []) }
  } catch {
    return { issued: new Set(), torn: new Set() }
  }
}
function markSeen(issued: string[], torn: string[]) {
  const now = readSeen()
  issued.forEach((id) => now.issued.add(id))
  torn.forEach((id) => now.torn.add(id))
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ issued: [...now.issued].slice(-200), torn: [...now.torn].slice(-200) }))
  } catch {
    /* blocked storage: the animations simply play again next time */
  }
}

/** How long the "Hatur nuhun!" card stays after the gate scanned a ticket. */
const THANKS_MS = 3 * 3600_000

function isRecentCheckin(it: PassItem, now: Date): boolean {
  if (it.ticket.status !== 'USED' || !it.ticket.usedAt) return false
  return now.getTime() - new Date(it.ticket.usedAt).getTime() < THANKS_MS
}

/** "Hatur nuhun!" after check-in (PRD §1), once per order, while the visit is fresh. */
function ThanksCard({ items }: { items: PassItem[] }) {
  const { event } = items[0]
  const firstScan = items.map((it) => it.ticket.usedAt ?? '').sort()[0]
  const seats = items.map((it) => it.ticket.seatLabel).filter((s): s is string => !!s)
  return (
    <section aria-label="Sudah check-in" className="flex items-start gap-3 rounded-3xl bg-brand-soft p-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-white">
        <CircleCheck className="size-6" aria-hidden />
      </span>
      <div className="min-w-0">
        <SundaText k="thanks" size="lg" />
        <p className="mt-1.5 text-sm">
          {seats.length ? `Kursi ${seatRangeLabel(seats)}` : `${items.length} tiket`} sudah check-in jam {fmtTime(firstScan)} WIB. Selamat menikmati {event.title}.
        </p>
      </div>
    </section>
  )
}

function HistoryRow({ item, now }: { item: PassItem; now: Date }) {
  const { ticket, event, session, category } = item
  const time = timing(item, now)
  const note = ticket.status === 'USED' && ticket.usedAt ? `Dipakai ${fmtTime(ticket.usedAt)} WIB` : ticket.status === 'CANCELLED' ? 'Tiket dibatalkan' : time.text
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-3">
      <span className="flex h-12 min-w-14 items-center justify-center rounded-xl border-2 px-2 text-lg font-extrabold text-muted-foreground tabular-nums" style={{ borderColor: category.color }}>
        {ticket.seatLabel ?? '–'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{event.title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {sessionWhen(session)} · {note}
        </span>
      </span>
      <StatusBadge tone={TICKET_TONE[ticket.status]}>{TICKET_STATUS_LABEL[ticket.status]}</StatusBadge>
    </div>
  )
}
