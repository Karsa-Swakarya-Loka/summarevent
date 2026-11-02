import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { CircleAlert, ScanLine, Search, SearchX, X } from 'lucide-react'
import { api, type TicketSearchRow } from '@/api'
import { BackHeader, EmptyState, StatusBadge, Swatch } from '@/components/common/bits'
import { ScanResult } from '@/components/staff/ScanResult'
import { unlockAudio } from '@/components/staff/beep'
import { sessionName, useStaffSession } from '@/components/staff/session'
import { useCheckin } from '@/components/staff/useCheckin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CHECKIN_RESULT_LABEL, TICKET_STATUS_LABEL, TICKET_TONE } from '@/domain/labels'
import { errorMessage, useLive } from '@/hooks/useLive'
import { fmtShortDate, fmtTime, maskPhone } from '@/lib/format'

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
  const title = (
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="truncate">Cari tiket manual</span>
      {session && ctx.event && (
        <span className="truncate text-xs font-normal text-muted-foreground">
          {ctx.event.title} · {sessionName(session)}
        </span>
      )}
    </span>
  )

  return (
    <div className="pb-24" onPointerDown={unlockAudio}>
      <BackHeader
        to="/staff"
        title={title}
        right={
          <Link to={`/staff/scan/${sessionId}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-brand hover:bg-muted">
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
        <div className="px-4 pt-4">
          <form role="search" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="ticket-q" className="text-sm font-semibold">
              Kode tiket, kode pesanan, nomor HP, atau nama
            </label>
            <div className="relative mt-1.5">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
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
                placeholder="Contoh: Rina, 0812…, TKT-…, SEV-…"
                className="h-12 rounded-xl bg-card pr-12 pl-11 text-base md:text-base"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => {
                    setQ('')
                    inputRef.current?.focus()
                  }}
                  className="absolute top-1/2 right-1 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                  aria-label="Hapus pencarian"
                >
                  <X className="size-5" />
                </button>
              )}
            </div>
          </form>

          {checkin.error && (
            <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-status-invalid/30 bg-status-invalid/10 p-3 text-sm font-medium text-[#a11b1b]">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="flex-1">{checkin.error}</span>
            </div>
          )}

          <div className="mt-4" aria-live="polite" aria-busy={stale}>
            {!searching ? (
              <EmptyState
                icon={<Search />}
                title={q.trim().length === 1 ? 'Ketik minimal 2 huruf atau angka' : 'Cari tiket pengunjung'}
                action={
                  <Button variant="outline" className="h-11" onClick={() => setQ('Rina')}>
                    Coba cari “Rina”
                  </Button>
                }
              >
                Pakai kode tiket (TKT-…) atau kode pesanan (SEV-…) dari WA/email pengunjung, nomor HP pemesan, atau namanya.
              </EmptyState>
            ) : search.error ? (
              <EmptyState icon={<CircleAlert />} title="Pencarian gagal" action={<Button className="h-11" onClick={search.reload}>Coba lagi</Button>}>
                {errorMessage(search.error)}
              </EmptyState>
            ) : rows.length === 0 && !stale ? (
              <EmptyState icon={<SearchX />} title={`Tidak ada tiket untuk “${term}”`}>
                Cek ejaan nama, coba 4 digit terakhir nomor HP, atau minta kode pesanan dari WA/email pengunjung. Pesanan yang belum terkonfirmasi belum punya tiket.
              </EmptyState>
            ) : (
              <>
                <p className="mb-2 text-sm text-muted-foreground">{stale ? 'Mencari…' : `${rows.length} tiket ditemukan${rows.length >= 30 ? ' (30 teratas, perjelas pencarian)' : ''}`}</p>
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

function TicketRow({ row, sessionId, disabled, onCheckin }: { row: TicketSearchRow; sessionId: string; disabled: boolean; onCheckin: () => void }) {
  const { ticket, order, category, session } = row
  const otherSession = ticket.sessionId !== sessionId
  const ready = ticket.status === 'ACTIVE' && !otherSession
  const name = ticket.attendeeName || order.buyerName
  return (
    <li className="rounded-2xl border bg-card p-4" data-ticket={ticket.code}>
      <div className="flex items-start gap-3">
        <div className="flex min-h-16 min-w-16 flex-col items-center justify-center rounded-xl bg-muted px-2 py-1.5 text-center">
          <span className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">Kursi</span>
          <span className={ticket.seatLabel ? 'text-2xl leading-none font-black' : 'text-xs leading-tight font-semibold'}>{ticket.seatLabel ?? 'Tanpa nomor'}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={TICKET_TONE[ticket.status]}>{TICKET_STATUS_LABEL[ticket.status]}</StatusBadge>
            {otherSession && <StatusBadge tone="warn">{CHECKIN_RESULT_LABEL.WRONG_SESSION}</StatusBadge>}
          </div>
          <h3 className="mt-1 truncate text-base font-bold">{name}</h3>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Swatch color={category.color} />
            <span className="truncate">
              {category.name} · {ticket.seatLabel ? `Kursi ${ticket.seatLabel}` : `Tanpa nomor kursi · ${order.qty} tiket di pesanan`}
            </span>
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {sessionName(session)} · {fmtShortDate(session.startAt)} {fmtTime(session.startAt)}
          </p>
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {ticket.code} · {order.code} · {maskPhone(order.buyerPhone)}
          </p>
        </div>
      </div>
      <Button className="mt-3 h-11 w-full text-base" variant={ready ? 'default' : 'outline'} disabled={disabled} onClick={onCheckin}>
        {ready ? 'Check-in' : 'Periksa tiket'}
      </Button>
    </li>
  )
}
