/**
 * One e-ticket on its own screen (PV-10): the black Talón ticket, its QR one tap away, its stub to pull, and the other
 * tickets of the same order one swipe of the arrows away.
 */
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ChevronLeft, ChevronRight, Maximize2, Sun } from 'lucide-react'
import { api } from '@/api'
import { BackHeader } from '@/components/common/bits'
import { QrCode } from '@/components/common/QrCode'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LoadError, PageSkeleton } from '@/components/visitor/Common'
import { TalonTicket } from '@/components/visitor/TalonTicket'
import { sessionWhen } from '@/components/visitor/helpers'
import { useVisitor } from '@/components/visitor/hooks'
import { useLive } from '@/hooks/useLive'
import { markSeen, readSeen } from '@/lib/seen'
import { cn } from '@/lib/utils'

export default function TicketPage() {
  const { ticketId = '' } = useParams()
  const { user } = useVisitor()
  const tickets = useLive(() => api.myTickets(), [user?.id])
  const [seen] = useState(readSeen)
  const [zoom, setZoom] = useState(false)

  if (tickets.loading && !tickets.data) return <PageSkeleton hero />
  if (!tickets.data) return <LoadError error={tickets.error} onRetry={tickets.reload} backTo="/app/pass" backLabel="Kembali ke Pass Saya" />
  const item = tickets.data.find((it) => it.ticket.id === ticketId)
  if (!item) return <LoadError error={new Error('E-ticket ini tidak ada di akunmu.')} backTo="/app/pass" backLabel="Kembali ke Pass Saya" />

  const id = item.ticket.id
  const active = item.ticket.status === 'ACTIVE'
  const siblings = tickets.data.filter((it) => it.order.id === item.order.id)
  const at = siblings.findIndex((it) => it.ticket.id === id)
  const prev = siblings[at - 1]
  const next = siblings[at + 1]

  return (
    <div className="flex flex-1 flex-col">
      <BackHeader to="/app/pass" title={item.ticket.seatLabel ? `Kursi ${item.ticket.seatLabel}` : item.category.name} />
      <div className="flex flex-1 flex-col items-center px-5 pt-3 pb-10">
        <TalonTicket
          key={id}
          item={item}
          issue={active && !seen.issued.has(id)}
          tear={item.ticket.status === 'USED' && !seen.torn.has(id)}
          onIssued={() => markSeen('issued', [id])}
          onTorn={() => markSeen('torn', [id])}
        />

        {siblings.length > 1 && (
          <nav className="mt-6 flex w-full max-w-[24rem] items-center justify-between" aria-label="Tiket lain di pesanan ini">
            <Pager to={prev && `/app/pass/${prev.ticket.id}`} back label="Tiket sebelumnya" />
            <span className="flex gap-1.5">
              <span className="sr-only">
                Tiket {at + 1} dari {siblings.length}
              </span>
              {siblings.map((it, i) => (
                <span key={it.ticket.id} className={cn('h-2 rounded-full transition-all', i === at ? 'w-6 bg-ink' : 'w-2 bg-ink/20')} aria-hidden />
              ))}
            </span>
            <Pager to={next && `/app/pass/${next.ticket.id}`} label="Tiket berikutnya" />
          </nav>
        )}

        {active && (
          <>
            <Button className="mt-6 h-14 w-full max-w-[24rem] gap-2 text-base" onClick={() => setZoom(true)} aria-label={`Perbesar QR tiket ${item.ticket.code}`}>
              <Maximize2 className="size-5" /> Perbesar QR
            </Button>
            <p className="mt-3 text-sm text-muted-foreground">Tarik talonnya ke bawah</p>
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

function Pager({ to, back = false, label }: { to?: string; back?: boolean; label: string }) {
  const Icon = back ? ChevronLeft : ChevronRight
  if (!to) return <span className="size-11" aria-hidden />
  return (
    <Link to={to} replace state={back ? { back: true } : undefined} aria-label={label} className="flex size-11 items-center justify-center rounded-full border-[1.5px] border-ink transition active:scale-90">
      <Icon className="size-5" />
    </Link>
  )
}
