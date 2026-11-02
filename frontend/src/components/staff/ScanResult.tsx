import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Ban, CalendarX2, CircleCheck, Clock, Gift, OctagonX, UsersRound, type LucideIcon } from 'lucide-react'
import { api, type CheckinResponse, type TicketSearchRow } from '@/api'
import { SundaText } from '@/components/common/bits'
import { CHECKIN_RESULT_LABEL } from '@/domain/labels'
import type { CheckinResult } from '@/domain/types'
import { errorMessage } from '@/hooks/useLive'
import { fmtShortDate, fmtTime, wibDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { beep, kindOf, type BeepKind } from './beep'
import { sessionName } from './session'

/**
 * Full-screen check-in result (PT-03), readable from 1 metre: full-bleed status
 * colour, label + icon (never colour alone), huge seat number. No animations.
 * Used by the scanner and by manual search.
 */

const ICON: Record<CheckinResult, LucideIcon> = {
  VALID: CircleCheck,
  ALREADY_USED: Ban,
  INVALID: OctagonX,
  WRONG_SESSION: CalendarX2,
  OUTSIDE_WINDOW: Clock,
}

const SURFACE: Record<BeepKind, string> = {
  valid: 'bg-status-valid text-white',
  warn: 'bg-status-warn text-ink',
  invalid: 'bg-status-invalid text-white',
}

/** Inner panels: a touch darker on green/red (white text), lighter on yellow (dark text). */
const PANEL: Record<BeepKind, string> = {
  valid: 'bg-black/15 ring-2 ring-white/45',
  warn: 'bg-white/40 ring-2 ring-ink/25',
  invalid: 'bg-black/20 ring-2 ring-white/45',
}

const NEXT_BUTTON: Record<BeepKind, string> = {
  valid: 'bg-white text-[#0b5e2e]',
  warn: 'bg-ink text-white',
  invalid: 'bg-white text-[#a11b1b]',
}

/** SundaText at scan-result size; Indonesian line kept at full opacity for contrast on colour. */
const SUNDA_BIG = '[&>span:first-child]:text-5xl [&>span:first-child]:font-black [&>span:last-child]:mt-1 [&>span:last-child]:text-2xl [&>span:last-child]:font-bold [&>span:last-child]:opacity-100'

type GroupItem = { row: TicketSearchRow; res: CheckinResponse | null; error?: string }
type Group =
  | { phase: 'loading' }
  | { phase: 'none' }
  | { phase: 'offer'; rows: TicketSearchRow[] }
  | { phase: 'running'; rows: TicketSearchRow[]; done: GroupItem[] }
  | { phase: 'done'; done: GroupItem[] }

export interface ScanResultProps {
  res: CheckinResponse
  /** Session being checked in (used to find more tickets of the same order). */
  sessionId: string
  onNext: () => void
  /** "Scan berikutnya" / "Kembali ke pencarian". */
  nextLabel: string
  /** VALID results go back on their own after this many ms (paused while more tickets can be admitted). */
  autoDismissMs?: number
}

export function ScanResult({ res, sessionId, onNext, nextLabel, autoDismissMs }: ScanResultProps) {
  const kind = kindOf(res.result)
  const Icon = ICON[res.result]
  const label = CHECKIN_RESULT_LABEL[res.result]
  const nextRef = useRef<HTMLButtonElement>(null)
  const onNextRef = useRef(onNext)
  useEffect(() => {
    onNextRef.current = onNext
  }, [onNext])

  const canGroup = res.result === 'VALID' && !!res.order && !!res.ticket
  const [group, setGroup] = useState<Group>(() => (canGroup ? { phase: 'loading' } : { phase: 'none' }))
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  // Focus the main action (keyboard / handheld scanners), give focus back afterwards.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    nextRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onNextRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])

  // "Konfirmasi jumlah orang yang masuk": other ACTIVE tickets of the same order in this session.
  useEffect(() => {
    if (!canGroup || !res.order || !res.ticket) return
    let alive = true
    const { order, ticket } = res
    api.staff
      .searchTickets(order.code, order.eventId)
      .then((rows) => {
        if (!alive) return
        const others = rows
          .filter((r) => r.ticket.orderId === order.id && r.ticket.id !== ticket.id && r.ticket.status === 'ACTIVE' && r.ticket.sessionId === sessionId)
          .sort((a, b) => (a.ticket.seatLabel ?? '').localeCompare(b.ticket.seatLabel ?? '', 'id', { numeric: true }))
        setGroup(others.length ? { phase: 'offer', rows: others } : { phase: 'none' })
      })
      .catch(() => alive && setGroup({ phase: 'none' }))
    return () => {
      alive = false
    }
  }, [canGroup, res, sessionId])

  // VALID auto-dismiss (only when there is nothing else to decide).
  const autoActive = !!autoDismissMs && res.result === 'VALID' && group.phase === 'none'
  useEffect(() => {
    if (!autoActive || !autoDismissMs) return
    const end = Date.now() + autoDismissMs
    const tick = setInterval(() => setSecondsLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 250)
    const done = setTimeout(() => onNextRef.current(), autoDismissMs)
    return () => {
      clearInterval(tick)
      clearTimeout(done)
    }
  }, [autoActive, autoDismissMs])

  const admitOthers = async () => {
    if (group.phase !== 'offer') return
    const rows = group.rows
    const done: GroupItem[] = []
    setGroup({ phase: 'running', rows, done: [] })
    for (const row of rows) {
      try {
        done.push({ row, res: await api.staff.checkin(row.ticket.qrToken, sessionId) })
      } catch (e) {
        done.push({ row, res: null, error: errorMessage(e) })
      }
      setGroup({ phase: 'running', rows, done: [...done] })
    }
    beep(done.every((d) => d.res?.result === 'VALID') ? 'valid' : 'invalid')
    setGroup({ phase: 'done', done })
  }

  const ticket = res.ticket
  const name = ticket?.attendeeName || res.order?.buyerName || null
  const seat = ticket?.seatLabel ?? null

  let body: ReactNode
  if (res.result === 'VALID') {
    body = (
      <>
        <SundaText k="enter" size="xl" className={cn('mt-5', SUNDA_BIG)} />
        <div className={cn('mt-5 rounded-3xl px-4 py-4 text-center', PANEL.valid)}>
          {seat ? (
            <>
              <div className="text-xl font-bold uppercase tracking-wider">Kursi</div>
              <div className="text-[clamp(88px,30vw,140px)] font-black leading-[0.95] tracking-tight tabular-nums" data-testid="seat-label">
                {seat}
              </div>
            </>
          ) : (
            <div className="py-3 text-4xl font-black leading-tight" data-testid="seat-label">
              Tanpa nomor kursi
            </div>
          )}
        </div>
        {name && <div className="mt-5 text-3xl font-extrabold leading-tight break-words">{name}</div>}
        <div className="mt-2 text-xl font-bold leading-snug">
          {[res.category?.name, res.session && sessionName(res.session)].filter(Boolean).join(' · ')}
        </div>
        {ticket?.bonus && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white/95 px-4 py-3 text-lg font-extrabold text-[#0b6b35]" data-testid="bonus">
            <Gift className="size-6 shrink-0" aria-hidden /> Berikan bonus: {ticket.bonus}
          </div>
        )}
      </>
    )
  } else if (res.result === 'ALREADY_USED') {
    const first = res.firstScan
    body = (
      <>
        {first ? (
          <div className={cn('mt-6 rounded-3xl px-4 py-4', PANEL.invalid)}>
            <div className="text-xl font-bold">Dipindai pertama jam</div>
            <div className="mt-1 text-7xl font-black leading-none tabular-nums">{fmtTime(first.scannedAt)}</div>
            <div className="mt-2 text-xl font-bold leading-snug">
              {wibDate(new Date(first.scannedAt)) !== wibDate() && `${fmtShortDate(first.scannedAt)} · `}oleh {first.staffName}
            </div>
          </div>
        ) : (
          <p className="mt-6 text-2xl font-bold leading-snug">{res.message}</p>
        )}
        <TicketFacts res={res} kind={kind} />
        <p className="mt-4 text-xl font-bold leading-snug">Satu tiket hanya untuk satu kali masuk. Arahkan ke meja bantuan bila ada keluhan.</p>
      </>
    )
  } else if (res.result === 'INVALID') {
    body = (
      <>
        <SundaText k="invalid" size="xl" className={cn('mt-5', SUNDA_BIG, '[&>span:first-child]:text-4xl')} />
        <p className="mt-5 text-2xl font-bold leading-snug">{res.message}</p>
        {ticket && <TicketFacts res={res} kind={kind} />}
      </>
    )
  } else {
    body = (
      <>
        <p className="mt-5 text-3xl font-extrabold leading-tight">{res.message}</p>
        <TicketFacts res={res} kind={kind} showSessionTime />
        <p className="mt-4 text-xl font-bold leading-snug">
          {res.result === 'WRONG_SESSION'
            ? 'Belum bisa masuk di sesi ini. Minta pengunjung datang di sesi yang tertulis di tiket.'
            : 'Belum bisa masuk sekarang. Minta pengunjung kembali saat check-in dibuka.'}
        </p>
      </>
    )
  }

  return (
    <section className={cn('fixed inset-0 z-50 overflow-y-auto', SURFACE[kind])} aria-label="Hasil check-in" data-result={res.result}>
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 pt-[max(env(safe-area-inset-top),20px)] pb-[max(env(safe-area-inset-bottom),20px)]">
        <div role="alert" aria-live="assertive" aria-atomic="true">
          <div className="flex items-center gap-3">
            <Icon className="size-16 shrink-0" strokeWidth={2.5} aria-hidden />
            <h2 className="text-5xl font-black leading-[1.05] tracking-tight">{label}</h2>
          </div>
          {body}
        </div>

        <div className="mt-auto flex flex-col gap-3 pt-6">
          {group.phase === 'offer' && (
            <button
              type="button"
              onClick={() => void admitOthers()}
              className="flex min-h-16 items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left text-[#0b5e2e] ring-4 ring-black/10"
            >
              <UsersRound className="size-9 shrink-0" aria-hidden />
              <span>
                <span className="block text-xl leading-tight font-extrabold">
                  Masukkan juga {group.rows.length} tiket lain di pesanan ini
                </span>
                <span className="mt-0.5 block text-base font-semibold">
                  {group.rows.map((r) => r.ticket.seatLabel ?? 'Tanpa nomor kursi').join(', ')} · {res.order?.code}
                </span>
              </span>
            </button>
          )}
          {group.phase === 'running' && (
            <div className={cn('rounded-2xl px-4 py-4 text-xl font-extrabold', PANEL.valid)} aria-live="polite">
              Memasukkan tiket {Math.min(group.done.length + 1, group.rows.length)} dari {group.rows.length}…
            </div>
          )}
          {group.phase === 'done' && <GroupSummary done={group.done} />}

          <button
            ref={nextRef}
            type="button"
            onClick={onNext}
            className={cn('flex min-h-16 flex-col items-center justify-center rounded-2xl px-4 py-2 text-2xl font-extrabold outline-offset-4 focus-visible:outline-4 focus-visible:outline-current', NEXT_BUTTON[kind])}
          >
            {nextLabel}
            {autoActive && autoDismissMs && <span className="text-base font-bold">otomatis dalam {secondsLeft ?? Math.ceil(autoDismissMs / 1000)} detik</span>}
          </button>
        </div>
      </div>
    </section>
  )
}

function TicketFacts({ res, kind, showSessionTime = false }: { res: CheckinResponse; kind: BeepKind; showSessionTime?: boolean }) {
  const t = res.ticket
  if (!t) return null
  const name = t.attendeeName || res.order?.buyerName
  const s = res.session
  return (
    <div className={cn('mt-5 flex items-center gap-4 rounded-3xl px-4 py-3', PANEL[kind])}>
      <div className="shrink-0 text-center">
        <div className="text-base font-bold uppercase tracking-wider">Kursi</div>
        <div className="text-5xl font-black leading-none tabular-nums">{t.seatLabel ?? '–'}</div>
      </div>
      <div className="min-w-0 flex-1">
        {name && <div className="text-2xl font-extrabold leading-tight break-words">{name}</div>}
        <div className="text-lg font-bold leading-snug">
          {[res.category?.name, !t.seatLabel && 'Tanpa nomor kursi'].filter(Boolean).join(' · ')}
        </div>
        {s && (
          <div className="text-lg font-bold leading-snug">
            {sessionName(s)}
            {showSessionTime && ` · ${fmtShortDate(s.startAt)} ${fmtTime(s.startAt)}`}
          </div>
        )}
      </div>
    </div>
  )
}

function GroupSummary({ done }: { done: GroupItem[] }) {
  const admitted = 1 + done.filter((d) => d.res?.result === 'VALID').length
  return (
    <div className={cn('rounded-2xl px-4 py-3', PANEL.valid)} aria-live="polite">
      <div className="text-3xl font-black">Total {admitted} orang masuk</div>
      <ul className="mt-2 space-y-1">
        {done.map(({ row, res, error }) => {
          const result = res?.result
          const ItemIcon = result ? ICON[result] : OctagonX
          return (
            <li key={row.ticket.id} className="flex items-center gap-2 text-xl font-bold">
              <ItemIcon className="size-6 shrink-0" aria-hidden />
              <span>
                {row.ticket.seatLabel ?? 'Tanpa nomor kursi'} – {result ? CHECKIN_RESULT_LABEL[result] : `Gagal: ${error ?? ''}`}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
