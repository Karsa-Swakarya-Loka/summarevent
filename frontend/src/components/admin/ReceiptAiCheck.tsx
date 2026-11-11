import { useState } from 'react'
import { CircleCheck, CircleHelp, CircleX, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { matchReceipt, type FieldMatch, type ReceiptField } from '@/domain/ocr'
import type { Receipt, Tenant } from '@/domain/types'
import { errorMessage } from '@/hooks/useLive'
import { fmtDayMonth, rupiahPlain } from '@/lib/format'
import { cn } from '@/lib/utils'

const LABEL: Record<ReceiptField, string> = { tenant: 'Tenant', receiptNo: 'No. struk', amount: 'Nominal', date: 'Tanggal', time: 'Jam' }

type State = { phase: 'idle' } | { phase: 'reading'; progress: number } | { phase: 'done'; matches: FieldMatch[] } | { phase: 'failed'; message: string }

/**
 * AD-07 cross-check: AI reads the receipt photo (tesseract.js, on this device) and lays what it found next to what the
 * visitor typed, so a typed amount or number that is not on the photo stands out. It only advises; the panitia decides.
 */
export function ReceiptAiCheck({ receipt, tenants }: { receipt: Receipt; tenants: Tenant[] }) {
  const [state, setState] = useState<State>({ phase: 'idle' })

  const run = async () => {
    setState({ phase: 'reading', progress: 0 })
    try {
      const { readReceiptPhoto } = await import('@/components/visitor/ocr')
      const reading = await readReceiptPhoto(receipt.photoUrl, tenants, (progress) => setState({ phase: 'reading', progress }))
      setState({ phase: 'done', matches: matchReceipt(reading, receipt) })
    } catch (e) {
      setState({ phase: 'failed', message: errorMessage(e) })
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

  return (
    <section aria-label="Cek silang AI" className="rounded-xl border border-dashed p-3">
      <div className="flex items-center gap-1.5 text-sm font-bold">
        <Sparkles className="size-4 text-brand" aria-hidden /> Cek silang AI
      </div>

      {state.phase === 'idle' && (
        <>
          <p className="mt-1 text-xs text-muted-foreground">AI membaca foto struk lalu membandingkannya dengan isian pengunjung. Fotonya dibaca di perangkat ini.</p>
          <Button type="button" variant="outline" className="mt-2 h-11 w-full sm:w-auto" onClick={() => void run()}>
            Bandingkan foto dengan isian
          </Button>
        </>
      )}

      {state.phase === 'reading' && (
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Membaca foto… {Math.round(state.progress * 100)}%
        </p>
      )}

      {state.phase === 'failed' && (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-sm text-[#a11b1b]" role="alert">
            Foto belum bisa dibaca: {state.message}. Cek manual dari fotonya.
          </p>
          <Button type="button" variant="outline" className="h-11 w-full sm:w-auto" onClick={() => void run()}>
            <RefreshCw aria-hidden /> Coba lagi
          </Button>
        </div>
      )}

      {state.phase === 'done' && <Result matches={state.matches} shown={shown} />}
    </section>
  )
}

function Result({ matches, shown }: { matches: FieldMatch[]; shown: (field: ReceiptField, value: string | number | undefined) => string }) {
  const differ = matches.filter((m) => m.state === 'differ').length
  const read = matches.filter((m) => m.state !== 'unread').length
  const summary =
    differ > 0
      ? `${differ} isian beda dengan foto. Cek fotonya sebelum menyetujui.`
      : read === 0
        ? 'Tulisan di foto belum terbaca. Cek manual dari fotonya.'
        : `Isian cocok dengan foto (${read} dari ${matches.length} bagian terbaca).`
  return (
    <div className="mt-2" role="status">
      <p className={cn('text-sm font-semibold', differ > 0 && 'text-[#a11b1b]')}>{summary}</p>
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
    </div>
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
