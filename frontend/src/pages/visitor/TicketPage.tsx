/**
 * One e-ticket on its own screen (PV-10): the black Talón ticket, its QR one tap away, and the other tickets of the same
 * order side by side: a swipe (or the arrows) slides to the next one and the address follows.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ChevronLeft, ChevronRight, Maximize2, ShieldAlert, Sun } from 'lucide-react'
import { api, ApiError } from '@/api'
import { BackHeader } from '@/components/common/bits'
import { QrCode } from '@/components/common/QrCode'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LoadError, PageSkeleton } from '@/components/visitor/Common'
import { TalonTicket } from '@/components/visitor/TalonTicket'
import { sessionWhen } from '@/components/visitor/helpers'
import { useVisitor } from '@/components/visitor/hooks'
import { useLive } from '@/hooks/useLive'
import { replaceTop } from '@/lib/navStack'
import { markSeen, readSeen } from '@/lib/seen'
import { cn } from '@/lib/utils'

/** A new ticket in the address (a link, a notification) starts the screen afresh on that ticket. */
export default function TicketPage() {
  const { ticketId = '' } = useParams()
  return <TicketScreen key={ticketId} ticketId={ticketId} />
}

function TicketScreen({ ticketId }: { ticketId: string }) {
  const { user } = useVisitor()
  const tickets = useLive(() => api.myTickets(), [user?.id])
  const [seen] = useState(readSeen)
  const [zoom, setZoom] = useState(false)
  // the ticket on screen; it starts as the one in the address and follows the swipe
  const [shownId, setShownId] = useState(ticketId)
  const track = useRef<HTMLDivElement>(null)
  const placed = useRef(false)
  const list = tickets.data
  const opened = list?.find((it) => it.ticket.id === ticketId)
  const orderId = opened?.order.id
  const siblings = useMemo(() => (list && orderId ? list.filter((it) => it.order.id === orderId) : []), [list, orderId])
  // the scroll listener reads the latest list without being torn down by every live refresh
  const siblingsRef = useRef(siblings)
  useLayoutEffect(() => {
    siblingsRef.current = siblings
  }, [siblings])
  const startAt = siblings.findIndex((it) => it.ticket.id === ticketId)
  const many = siblings.length > 1

  // open on the ticket from the address, without a slide, once; later refreshes leave the strip where the finger put it
  useLayoutEffect(() => {
    const el = track.current
    if (!el || placed.current || startAt < 0) return
    placed.current = true
    if (startAt > 0) el.scrollLeft = startAt * el.clientWidth
  }, [startAt])

  // whichever ticket the swipe settles on becomes the shown one, and the address follows (replaced, so Back still goes
  // where it went before). The router is left out of it: a route change would rebuild the screen under the finger.
  useEffect(() => {
    const el = track.current
    if (!el || !many) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const it = siblingsRef.current[Math.round(el.scrollLeft / el.clientWidth)]
        if (!it) return
        setShownId(it.ticket.id)
        const path = `/app/pass/${it.ticket.id}`
        if (window.location.pathname !== path) {
          window.history.replaceState(window.history.state, '', path)
          replaceTop(path)
        }
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('scroll', onScroll)
    }
  }, [many])

  if (tickets.loading && !tickets.data) return <PageSkeleton hero />
  if (!tickets.data) return <LoadError error={tickets.error} onRetry={tickets.reload} backTo="/app/pass" backLabel="Kembali ke Pass Saya" />
  if (!opened) return <LoadError error={new ApiError('NOT_FOUND', 'E-ticket tidak ditemukan. Pastikan kamu masuk dengan nomor HP pemesan.')} backTo="/app/pass" backLabel="Kembali ke Pass Saya" />

  const at = Math.max(0, siblings.findIndex((it) => it.ticket.id === shownId))
  const item = siblings[at] ?? opened
  const active = item.ticket.status === 'ACTIVE'
  const slideTo = (i: number) => {
    const el = track.current
    if (!el) return
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' })
  }

  return (
    <div className="flex flex-1 flex-col">
      <BackHeader to="/app/pass" title={item.ticket.seatLabel ? `Kursi ${item.ticket.seatLabel}` : item.category.name} />
      <div className="flex flex-1 flex-col items-center pt-3 pb-10">
        {/* every ticket of the order in one row that snaps per ticket; only the one opened plays its issuing, a used one
            tears once it is swiped into view. With more than one it is a region the keyboard can scroll too. */}
        <div
          ref={track}
          tabIndex={many ? 0 : undefined}
          role={many ? 'region' : undefined}
          aria-label={many ? 'E-ticket di pesanan ini, geser untuk tiket lain' : undefined}
          className="flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain outline-none [scrollbar-width:none] focus-visible:ring-3 focus-visible:ring-brand/40 [&::-webkit-scrollbar]:hidden"
        >
          {siblings.map((it) => {
            const tid = it.ticket.id
            return (
              <div key={tid} className="flex w-full shrink-0 snap-center snap-always justify-center px-5" inert={tid !== item.ticket.id}>
                <TalonTicket
                  item={it}
                  issue={tid === ticketId && it.ticket.status === 'ACTIVE' && !seen.issued.has(tid)}
                  tear={it.ticket.status === 'USED' && !seen.torn.has(tid)}
                  onIssued={() => markSeen('issued', [tid])}
                  onTorn={() => markSeen('torn', [tid])}
                />
              </div>
            )
          })}
        </div>

        {many && (
          <nav className="mt-6 flex w-[calc(100%-2.5rem)] max-w-[24rem] items-center justify-between" aria-label="Tiket lain di pesanan ini">
            <Pager onClick={() => slideTo(at - 1)} disabled={at === 0} back label="Tiket sebelumnya" />
            <span className="flex gap-1.5">
              <span className="sr-only" aria-live="polite">
                Tiket {at + 1} dari {siblings.length}
              </span>
              {siblings.map((it, i) => (
                <span key={it.ticket.id} className={cn('h-2 rounded-full transition-all', i === at ? 'w-6 bg-ink' : 'w-2 bg-ink/20')} aria-hidden />
              ))}
            </span>
            <Pager onClick={() => slideTo(at + 1)} disabled={at === siblings.length - 1} label="Tiket berikutnya" />
          </nav>
        )}

        {active && (
          <>
            <Button className="mt-6 h-14 w-[calc(100%-2.5rem)] max-w-[24rem] gap-2 text-base" onClick={() => setZoom(true)} aria-label={`Perbesar QR tiket ${item.ticket.code}`}>
              <Maximize2 className="size-5" /> Perbesar QR
            </Button>
            <p className="mt-3 flex items-center gap-1.5 px-5 text-sm text-muted-foreground">
              <ShieldAlert className="size-4 shrink-0" aria-hidden /> Jangan unggah foto QR ini ke media sosial.
            </p>
            <Button asChild variant="outline" className="mt-4 h-12 w-[calc(100%-2.5rem)] max-w-[24rem]">
              <Link to={`/app/orders/${item.order.id}`}>Kelola pesanan: ubah nama atau batalkan</Link>
            </Button>
          </>
        )}
      </div>

      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{item.ticket.seatLabel ? `Kursi ${item.ticket.seatLabel}` : item.category.name}</DialogTitle>
            <DialogDescription>{sessionWhen(item.session)}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3">
            <div className="w-full max-w-[19rem] rounded-xl bg-white p-3 ring-1 ring-border">
              <QrCode value={item.ticket.qrToken} className="block h-auto w-full" />
            </div>
            <p className="font-mono text-lg font-bold tracking-wider">{item.ticket.code}</p>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sun className="size-4 shrink-0" aria-hidden /> Naikkan kecerahan layar
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Stays a button at the ends too (disabled), so keyboard focus is not lost when the last ticket comes into view. */
function Pager({ onClick, disabled, back = false, label }: { onClick: () => void; disabled: boolean; back?: boolean; label: string }) {
  const Icon = back ? ChevronLeft : ChevronRight
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} className="flex size-11 items-center justify-center rounded-full border-[1.5px] border-ink transition active:scale-90 disabled:border-ink/15 disabled:text-ink/25">
      <Icon className="size-5" />
    </button>
  )
}
