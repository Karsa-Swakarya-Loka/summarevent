import { useEffect, useRef, useState } from 'react'
import { CircleCheck, CircleHelp, CircleX, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { matchReceipt, matchVerdict, type FieldMatch, type ReceiptField } from '@/domain/ocr'
import type { Receipt, Tenant } from '@/domain/types'
import { fmtDayMonth, rupiahPlain } from '@/lib/format'
import { cn } from '@/lib/utils'

const LABEL: Record<ReceiptField, string> = { tenant: 'Tenant', receiptNo: 'No. struk', amount: 'Nominal', date: 'Tanggal', time: 'Jam' }

const SUMMARY: Record<ReturnType<typeof matchVerdict>, string> = {
  differ: 'beda dengan foto. Cek fotonya sebelum menyetujui.',
  match: 'Nominal dan nomor struk cocok dengan foto.',
  partial: 'Sebagian belum terbaca. Cek nominal dan nomor struk dari fotonya.',
  unread: 'Tulisan di foto belum terbaca. Cek manual dari fotonya.',
}

const FAILED = 'Foto belum bisa dibaca. Cek koneksi lalu coba lagi, atau cek manual dari fotonya.'

type State = { phase: 'idle' } | { phase: 'reading'; progress: number } | { phase: 'done'; matches: FieldMatch[] } | { phase: 'failed' }

function summaryOf(matches: FieldMatch[]): string {
  const verdict = matchVerdict(matches)
  if (verdict !== 'differ') return SUMMARY[verdict]
  return `${matches.filter((m) => m.state === 'differ').length} isian ${SUMMARY.differ}`
}

/**
 * AD-07 cross-check: AI reads the receipt photo (tesseract.js, on this device) and lays what it found next to what the
 * visitor typed, so a typed amount or number that is not on the photo stands out. It only advises; the panitia decides.
 */
export function ReceiptAiCheck({ receipt, tenants }: { receipt: Receipt; tenants: Tenant[] }) {
  const [state, setState] = useState<State>({ phase: 'idle' })
  const heading = useRef<HTMLHeadingElement>(null)

  // the button that started the reading is gone once it finishes: keyboard focus moves to the result
  useEffect(() => {
    if (state.phase === 'done' || state.phase === 'failed') heading.current?.focus()
  }, [state.phase])

  const run = async () => {
    setState({ phase: 'reading', progress: 0 })
    try {
      const { readReceiptPhoto } = await import('@/components/visitor/ocr')
      const reading = await readReceiptPhoto(receipt.photoUrl, tenants, (progress) => setState({ phase: 'reading', progress }))
      setState({ phase: 'done', matches: matchReceipt(reading, receipt) })
    } catch {
      setState({ phase: 'failed' })
    }
  }

  const shown = (field: ReceiptField, value: string | number | undefined): string => {
    if (value === undefined) return '-'
    if (field === 'tenant') return tenants.find((t) => t.id === value)?.name ?? String(value)
    if (field === 'amount') return rupiahPlain(Number(value))
    if (field === 'date') return fmtDayMonth(String(value))
    if (field === 'time') return String(value).replace(':', '.')
    return String(value)
  }

  const announce = state.phase === 'reading' ? 'Membaca foto struk…' : state.phase === 'done' ? summaryOf(state.matches) : state.phase === 'failed' ? FAILED : ''
  const differ = state.phase === 'done' && matchVerdict(state.matches) === 'differ'

  return (
    <section aria-label="Cek silang AI" className="rounded-xl border border-dashed p-3">
      <h4 ref={heading} tabIndex={-1} className="flex items-center gap-1.5 text-sm font-bold focus:outline-none">
        <Sparkles className="size-4 text-brand" aria-hidden /> Cek silang AI
      </h4>

      {state.phase === 'idle' && <p className="mt-1 text-xs text-muted-foreground">AI membaca foto struk lalu membandingkannya dengan isian pengunjung. Fotonya dibaca di perangkat ini.</p>}

      {/* one live region that stays on the page, so screen readers announce each change once */}
      <p role="status" className={cn('text-sm', announce && 'mt-2', state.phase === 'done' ? 'font-semibold' : 'text-muted-foreground', (differ || state.phase === 'failed') && 'text-[#a11b1b]')}>
        {state.phase === 'reading' && <LoaderCircle className="mr-1.5 inline size-4 animate-spin align-[-3px]" aria-hidden />}
        {announce}
        {state.phase === 'reading' && <span aria-hidden> {Math.round(state.progress * 100)}%</span>}
      </p>

      {(state.phase === 'idle' || state.phase === 'failed') && (
        <Button type="button" variant="outline" className="mt-2 h-11 w-full sm:w-auto" onClick={() => void run()}>
          {state.phase === 'failed' ? (
            <>
              <RefreshCw aria-hidden /> Coba lagi
            </>
          ) : (
            'Bandingkan foto dengan isian'
          )}
        </Button>
      )}

      {state.phase === 'done' && <Result matches={state.matches} shown={shown} />}
    </section>
  )
}

function Result({ matches, shown }: { matches: FieldMatch[]; shown: (field: ReceiptField, value: string | number | undefined) => string }) {
  return (
    <>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm">
        {matches.map((m) => (
          <li key={m.field} className="grid grid-cols-[5.5rem_1fr_auto] items-start gap-2">
            <span className="text-muted-foreground">{LABEL[m.field]}</span>
            <span className="min-w-0 break-words tabular-nums">
              <span className={cn(m.state === 'differ' && 'font-semibold text-[#a11b1b]')}>{shown(m.field, m.read)}</span>
              {m.state === 'differ' && <span className="block text-xs text-muted-foreground">Diisi {shown(m.field, m.typed)}</span>}
            </span>
            <MatchBadge state={m.state} />
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Kolom tengah adalah yang terbaca di foto. AI bisa salah baca, jadi keputusan tetap di panitia.</p>
    </>
  )
}

function MatchBadge({ state }: { state: FieldMatch['state'] }) {
  if (state === 'same')
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-status-valid">
        <CircleCheck className="size-3.5" aria-hidden /> Sama
      </span>
    )
  if (state === 'differ')
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-status-invalid">
        <CircleX className="size-3.5" aria-hidden /> Beda
      </span>
    )
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <CircleHelp className="size-3.5" aria-hidden /> Tidak terbaca
    </span>
  )
}
