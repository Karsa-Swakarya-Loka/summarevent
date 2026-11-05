import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { CircleAlert, ScanLine, Search, X } from 'lucide-react'
import { api, type TicketSearchRow } from '@/api'
import { BackHeader, EmptyState, StatusBadge, Swatch } from '@/components/common/bits'
import { Illustration } from '@/components/common/Illustration'
import { ScanResult } from '@/components/staff/ScanResult'
import { sessionName, useStaffSession } from '@/components/staff/session'
import { useCheckin } from '@/components/staff/useCheckin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CHECKIN_RESULT_LABEL, TICKET_STATUS_LABEL, TICKET_TONE } from '@/domain/labels'
import { errorMessage, useLive } from '@/hooks/useLive'
import { fmtShortDate, fmtTime, maskPhone, wibDate } from '@/lib/format'
import { cn } from '@/lib/utils'

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

const STATUS_RANK = { ACTIVE: 0, USED: 1, CANCELLED: 2 } as const

/** PT-05: when the QR can't be read, find the ticket by code, order code, phone number or name. */
export default function ManualSearch() {
  const { sessionId = '' } = useParams()
  const ctx = useStaffSession(sessionId)
  const checkin = useCheckin(sessionId)
  const inputRef = useRef<HTMLInputElement>(null)

  const [q, setQ] = useState('')
  const term = useDebounced(q.trim(), 300)
  const eventId = ctx.event?.id
  const searching = term.length >= 2 && !!eventId
  const search = useLive(() => (searching ? api.staff.searchTickets(term, eventId) : Promise.resolve<TicketSearchRow[]>([])), [term, eventId, searching], {
    enabled: !!eventId,
  })

  const rows = [...(searching ? (search.data ?? []) : [])].sort(
    (a, b) =>
      Number(a.ticket.sessionId !== sessionId) - Number(b.ticket.sessionId !== sessionId) ||
      STATUS_RANK[a.ticket.status] - STATUS_RANK[b.ticket.status] ||
      (a.ticket.seatLabel ?? '').localeCompare(b.ticket.seatLabel ?? '', 'id', { numeric: true }),
  )
  const stale = q.trim() !== term || (searching && search.loading)
  const session = ctx.session

  return (
    <div className="pb-24">
      <BackHeader
        to="/staff"
        title={session && ctx.event ? <span className="block truncate text-sm text-muted-foreground">{ctx.event.title} · {sessionName(session)}</span> : undefined}
        right={
          <Link to={`/staff/scan/${sessionId}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold hover:bg-muted">
            <ScanLine className="size-5" aria-hidden /> Scan
          </Link>
        }
      />

      {ctx.notFound ? (
        <div className="p-4">
          <EmptyState icon={<CircleAlert />} title="Sesi tidak ditemukan" action={<Button asChild className="h-11"><Link to="/staff">Pilih sesi lain</Link></Button>}>
            Sesi ini sudah dihapus atau tautannya salah.
          </EmptyState>
        </div>
      ) : (
        <div className="px-4 pt-1">
          <h1 className="font-poster text-[2.4rem] leading-[0.95] uppercase">Cari tiket manual</h1>
          <p className="mt-1 text-sm text-muted-foreground">Untuk QR yang tidak terbaca atau HP pengunjung yang mati.</p>
          <form role="search" onSubmit={(e) => e.preventDefault()} className="mt-4">
            <label htmlFor="ticket-q" className="block px-1 text-sm font-semibold">
              Kode tiket, kode pesanan, nomor HP, atau nama
            </label>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="ticket-q"
                ref={inputRef}
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rina, 0812…, TKT-…, SEV-…"
                className="h-14 rounded-full border-transparent bg-card pr-12 pl-12 text-base shadow-xs md:text-base [&::-webkit-search-cancel-button]:appearance-none"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => {
                    setQ('')
                    inputRef.current?.focus()
                  }}
                  className="absolute top-1/2 right-1.5 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                  aria-label="Hapus pencarian"
                >
                  <X className="size-5" />
                </button>
              )}
            </div>
          </form>

          {checkin.error && (
            <div role="alert" className="mt-3 flex items-start gap-2 rounded-2xl bg-status-invalid/10 p-3 text-sm font-medium text-[#a11b1b]">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="flex-1">{checkin.error}</span>
            </div>
          )}

          <div className="mt-5" aria-live="polite" aria-busy={stale}>
            {!searching ? (
              <Note
                art="search"
                title={q.trim().length === 1 ? 'Ketik minimal 2 huruf atau angka' : 'Cari tiket pengunjung'}
                action={
                  <Button variant="outline" className="h-11" onClick={() => setQ('Rina')}>
                    Coba cari “Rina”
                  </Button>
                }
              >
                Kode tiket (TKT-…) atau kode pesanan (SEV-…) dari WA/email pengunjung, nomor HP pemesan, atau namanya.
              </Note>
            ) : search.error ? (
              <EmptyState icon={<CircleAlert />} title="Pencarian gagal" action={<Button className="h-11" onClick={search.reload}>Coba lagi</Button>}>
                {errorMessage(search.error)}
              </EmptyState>
            ) : rows.length === 0 && !stale ? (
              <Note title="Tiket tidak ditemukan">
                Tidak ada tiket yang cocok dengan “{term}”. Cek ejaan nama, coba 4 digit terakhir nomor HP, atau minta kode pesanan dari WA/email pengunjung. Pesanan yang belum terkonfirmasi belum punya tiket.
              </Note>
            ) : (
              <>
                <p className="mb-2 px-1 text-sm font-semibold text-muted-foreground">{stale ? 'Mencari…' : `${rows.length} tiket ditemukan${rows.length >= 30 ? ' · 30 teratas, perjelas pencarian' : ''}`}</p>
                <ul className="space-y-3">
                  {rows.map((row) => (
                    <TicketRow key={row.ticket.id} row={row} sessionId={sessionId} disabled={checkin.pending} onCheckin={() => void checkin.submit(row.ticket.qrToken)} />
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      {checkin.current && (
        <ScanResult
          key={checkin.current.key}
          res={checkin.current.res}
          sessionId={sessionId}
          onNext={checkin.dismiss}
          nextLabel="Kembali ke pencarian"
          autoDismissMs={3500}
        />
      )}
    </div>
  )
}

/** A quiet card with a sticker and a display-type title, for the states before and after a search. */
function Note({ art, title, children, action }: { art?: 'search'; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[1.4rem] bg-card px-6 py-7 text-center shadow-xs">
      {art && <Illustration name={art} loop={false} className="w-28" />}
      <p className={cn('font-poster text-2xl leading-[0.95] text-balance uppercase', art && 'mt-1')}>{title}</p>
      {children && <p className="mt-2 max-w-xs text-sm text-muted-foreground">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

function TicketRow({ row, sessionId, disabled, onCheckin }: { row: TicketSearchRow; sessionId: string; disabled: boolean; onCheckin: () => void }) {
  const { ticket, order, category, session } = row
  const otherSession = ticket.sessionId !== sessionId
  const ready = ticket.status === 'ACTIVE' && !otherSession
  const name = ticket.attendeeName || order.buyerName
  return (
    <li className="overflow-hidden rounded-[1.4rem] bg-card shadow-xs" data-ticket={ticket.code}>
      <div className="flex items-stretch">
        <div className="flex w-[5.5rem] shrink-0 flex-col items-center justify-center border-r border-dashed border-ink/15 bg-muted/60 px-2 py-3 text-center">
          <span className="text-xs font-semibold text-muted-foreground">{ticket.seatLabel ? 'Kursi' : 'Area'}</span>
          <span className={cn('mt-0.5 font-poster leading-none', ticket.seatLabel ? 'text-[2rem]' : 'text-base leading-tight uppercase')}>{ticket.seatLabel ?? category.name}</span>
        </div>
        <div className="min-w-0 flex-1 p-3.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={TICKET_TONE[ticket.status]}>{TICKET_STATUS_LABEL[ticket.status]}</StatusBadge>
            {otherSession && <StatusBadge tone="warn">{CHECKIN_RESULT_LABEL.WRONG_SESSION}</StatusBadge>}
          </div>
          <h3 className="mt-1.5 truncate text-base font-bold">{name}</h3>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Swatch color={category.color} />
            <span className="truncate">{ticket.seatLabel ? category.name : `${order.qty} tiket di pesanan`}</span>
          </p>
          {ticket.status === 'USED' && ticket.usedAt && <p className="text-sm font-semibold">Masuk {wibDate(new Date(ticket.usedAt)) === wibDate() ? 'jam' : fmtShortDate(ticket.usedAt)} {fmtTime(ticket.usedAt)}</p>}
          {otherSession && (
            <p className="text-sm text-muted-foreground">
              {sessionName(session)} · {fmtShortDate(session.startAt)} {fmtTime(session.startAt)}
            </p>
          )}
          <p className="mt-1 flex flex-wrap gap-x-2 font-mono text-xs text-muted-foreground">
            <span>{ticket.code}</span>
            <span>{order.code}</span>
            <span>{maskPhone(order.buyerPhone)}</span>
          </p>
        </div>
      </div>
      <div className="px-3.5 pb-3.5">
        <Button className="h-12 w-full text-base" variant={ready ? 'default' : 'outline'} disabled={disabled} onClick={onCheckin}>
          {ready ? 'Check-in' : 'Periksa tiket'}
        </Button>
      </div>
    </li>
  )
}
