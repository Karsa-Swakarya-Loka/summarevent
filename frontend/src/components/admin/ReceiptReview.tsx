/**
 * Receipt review UI shared by the panitia queue (AD-07) and the petugas desk check (PT-06):
 * queue rows and the review panel (zoomable photo, automatic checks, approve / revise / reject).
 */
import { useState } from 'react'
import { TransformComponent, TransformWrapper, useControls } from 'react-zoom-pan-pinch'
import { Ban, CircleCheck, CircleX, LoaderCircle, Maximize2, Minus, Plus, TriangleAlert, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/api'
import type { ReceiptQueueItem, ReviewDecision } from '@/api/contract'
import { SectionCard } from '@/components/admin/AdminUi'
import { canDecide, seatSummary, sessionLabel } from '@/components/admin/lib'
import { Countdown, StatusBadge, Swatch } from '@/components/common/bits'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ORDER_STATUS_LABEL, ORDER_TONE, RECEIPT_STATUS_LABEL, RECEIPT_TONE } from '@/domain/labels'
import { errorMessage, useLive } from '@/hooks/useLive'
import { fmtDayMonth, fmtTime, rupiahPlain } from '@/lib/format'
import { finePointer } from '@/lib/pointer'
import { cn } from '@/lib/utils'

const REASONS: Record<Exclude<ReviewDecision, 'APPROVE'>, string[]> = {
  NEEDS_REVISION: ['Foto buram', 'Nominal tidak terbaca', 'Tanggal struk tidak sesuai'],
  REJECT: ['Struk duplikat', 'Bukan tenant SUMMABA', 'Struk terpotong / dicoret'],
}


export function QueueRow({ item, active, onOpen }: { item: ReceiptQueueItem; active: boolean; onOpen: () => void }) {
  const total = item.siblings.reduce((s, r) => s + r.amount, 0)
  const failing = item.checks.some((c) => !c.ok)
  const dup = item.siblings.some((s) => s.possibleDuplicate)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'w-full rounded-xl bg-panel p-3 text-left transition hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
        active && 'bg-card shadow-[0_1px_2px_rgb(35_31_32/0.06)] ring-2 ring-brand',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-semibold">{item.order.buyerName}</span>
        <StatusBadge tone={RECEIPT_TONE[item.receipt.status]}>{RECEIPT_STATUS_LABEL[item.receipt.status]}</StatusBadge>
      </div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">
        {item.order.code} · {seatSummary(item.order.items)} · {sessionLabel(item.session)}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-sm">
        <span>
          <span className="font-bold tabular-nums">{rupiahPlain(total)}</span>
          <span className="text-xs text-muted-foreground"> · {item.siblings.length} struk</span>
        </span>
        {canDecide(item) ? <Countdown to={item.order.holdExpiresAt} className="text-xs text-muted-foreground" /> : <span className="text-xs text-muted-foreground">{fmtTime(item.receipt.createdAt)}</span>}
      </div>
      {(failing || dup) && (
        <div className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-[#a11b1b]">
          <TriangleAlert className="size-3.5" aria-hidden /> {dup ? 'Kemungkinan struk duplikat' : 'Ada syarat belum terpenuhi'}
        </div>
      )}
    </button>
  )
}

function PhotoControls() {
  const { zoomIn, zoomOut, resetTransform } = useControls()
  const btn = 'flex size-11 items-center justify-center rounded-full bg-card/95 shadow ring-1 ring-border hover:bg-muted'
  return (
    <div className="absolute top-2 right-2 z-10 flex flex-col gap-1.5">
      <button type="button" className={btn} onClick={() => zoomIn()} aria-label="Perbesar foto">
        <Plus className="size-4" />
      </button>
      <button type="button" className={btn} onClick={() => zoomOut()} aria-label="Perkecil foto">
        <Minus className="size-4" />
      </button>
      <button type="button" className={btn} onClick={() => resetTransform()} aria-label="Kembalikan ukuran foto">
        <Maximize2 className="size-4" />
      </button>
    </div>
  )
}

export function ReviewPanel({
  item,
  onDone,
  review = (id, d, r) => api.admin.reviewReceipt(id, d, r),
}: {
  item: ReceiptQueueItem
  onDone: (orderId: string) => void
  /** Who decides: panitia (default) or petugas at the desk. */
  review?: (receiptId: string, decision: ReviewDecision, reason?: string) => Promise<unknown>
}) {
  const [photoIdx, setPhotoIdx] = useState(0)
  const [busy, setBusy] = useState<ReviewDecision | null>(null)
  const [ask, setAsk] = useState<null | 'APPROVE_ANYWAY' | 'NEEDS_REVISION' | 'REJECT'>(null)
  const [reason, setReason] = useState('')
  const tenants = useLive(() => api.admin.tenants(), [])
  const r = item.siblings[Math.min(photoIdx, item.siblings.length - 1)]
  const tenantOf = (id: string) => tenants.data?.find((t) => t.id === id)?.name ?? (id === item.tenant?.id ? item.tenant.name : null)
  const total = item.siblings.reduce((s, x) => s + x.amount, 0)
  const min = item.category.receiptRules?.minSpend ?? 0
  const failing = item.checks.filter((c) => !c.ok)
  const decidable = canDecide(item)
  const reviewed = item.siblings.find((s) => s.reviewedAt)

  const decide = async (decision: ReviewDecision, why?: string) => {
    setBusy(decision)
    try {
      await review(item.receipt.id, decision, why)
      const who = item.order.buyerName.split(' ')[0]
      toast.success(
        decision === 'APPROVE'
          ? `Struk disetujui. E-ticket ${who} terbit.`
          : decision === 'NEEDS_REVISION'
            ? `Permintaan revisi dikirim ke ${who}. Kursinya tetap ditahan.`
            : `Struk ditolak. Kursi ${seatSummary(item.order.items)} dilepas.`,
      )
      setAsk(null)
      setReason('')
      onDone(item.order.id)
    } catch (e) {
      toast.error(e instanceof ApiError && e.code === 'HOLD_EXPIRED' ? 'Waktu tahan kursi sudah habis, pesanan kedaluwarsa. Struk tidak bisa diproses lagi.' : errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <SectionCard
      title={
        <span className="flex flex-wrap items-center gap-2">
          {item.order.buyerName}
          <StatusBadge tone={ORDER_TONE[item.order.status]}>{ORDER_STATUS_LABEL[item.order.status]}</StatusBadge>
        </span>
      }
      description={`${item.order.code} · ${item.user?.phone ?? item.order.buyerPhone}`}
      actions={
        decidable ? (
          <span className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground sm:flex-col sm:items-end">
            Kursi ditahan sampai {fmtTime(item.order.holdExpiresAt)} WIB
            <Countdown to={item.order.holdExpiresAt} className="text-base text-foreground" />
          </span>
        ) : undefined
      }
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="relative h-[22rem] overflow-hidden rounded-xl bg-muted ring-1 ring-border sm:h-[28rem]">
            <TransformWrapper key={r.id} minScale={1} maxScale={5} initialScale={1} centerOnInit doubleClick={{ mode: 'toggle', step: 1.5 }}>
              <PhotoControls />
              <TransformComponent wrapperClass="!size-full" contentClass="!size-full">
                <img src={r.photoUrl} alt={`Foto struk ${r.receiptNo}`} className="size-full object-contain" draggable={false} />
              </TransformComponent>
            </TransformWrapper>
          </div>
          {item.siblings.length > 1 && (
            <div className="flex gap-2" role="group" aria-label="Pilih foto struk">
              {item.siblings.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setPhotoIdx(i)}
                  aria-pressed={i === photoIdx}
                  aria-label={`Struk ${i + 1}: ${s.receiptNo}`}
                  className={cn('h-20 w-16 overflow-hidden rounded-lg ring-1 ring-border', i === photoIdx && 'ring-3 ring-brand')}
                >
                  <img src={s.photoUrl} alt="" className="size-full object-cover object-top" />
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{finePointer() ? 'Scroll untuk memperbesar, klik dua kali untuk zoom cepat.' : 'Cubit untuk memperbesar, ketuk dua kali untuk zoom cepat.'}</p>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold">
                Struk {photoIdx + 1} dari {item.siblings.length}
              </h3>
              <StatusBadge tone={RECEIPT_TONE[r.status]}>{RECEIPT_STATUS_LABEL[r.status]}</StatusBadge>
            </div>
            <dl className="grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Tenant</dt>
              <dd className="font-medium">{tenantOf(r.tenantId) ?? r.tenantId}</dd>
              <dt className="text-muted-foreground">No. struk</dt>
              <dd className="font-mono">{r.receiptNo}</dd>
              <dt className="text-muted-foreground">Nominal</dt>
              <dd className="font-semibold tabular-nums">{rupiahPlain(r.amount)}</dd>
              <dt className="text-muted-foreground">Tanggal, jam</dt>
              <dd className="tabular-nums">
                {fmtDayMonth(r.receiptDate)}, {r.receiptTime.replace(':', '.')}
              </dd>
            </dl>
            {r.possibleDuplicate && (
              <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-status-warn/15 px-2.5 py-1.5 text-xs font-semibold text-[#7a5600]">
                <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden /> Foto ini sama dengan struk lain yang pernah dikirim. Cek struk aslinya.
              </p>
            )}
          </div>

          <div className="rounded-xl bg-muted/60 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
              <span className="font-bold whitespace-nowrap">Cek otomatis</span>
              <span className="text-muted-foreground">
                Total <strong className={cn('tabular-nums', total >= min ? 'text-foreground' : 'text-[#a11b1b]')}>{rupiahPlain(total)}</strong> / min {rupiahPlain(min)}
              </span>
            </div>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm">
              {item.checks.map((c, i) => (
                <li key={`${c.rule}-${i}`} className="flex items-start gap-2">
                  {c.ok && c.warning ? (
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[#b07d00]" aria-label="Perhatian" />
                  ) : c.ok ? (
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-valid" aria-label="Terpenuhi" />
                  ) : (
                    <CircleX className="mt-0.5 size-4 shrink-0 text-status-invalid" aria-label="Belum terpenuhi" />
                  )}
                  <span className={cn(!c.ok && 'font-medium text-[#a11b1b]')}>{c.message}</span>
                </li>
              ))}
            </ul>
          </div>

          <dl className="grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Event</dt>
            <dd className="font-medium">{item.event.title}</dd>
            <dt className="text-muted-foreground">Sesi</dt>
            <dd>{sessionLabel(item.session)}</dd>
            <dt className="text-muted-foreground">Kategori</dt>
            <dd className="flex items-center gap-1.5">
              <Swatch color={item.category.color} /> {item.category.name}
            </dd>
            <dt className="text-muted-foreground">Kursi</dt>
            <dd className="font-semibold tabular-nums">{seatSummary(item.order.items)}</dd>
          </dl>

          {decidable ? (
            <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap">
              <Button size="lg" className="h-11 sm:flex-1" onClick={() => (failing.length ? setAsk('APPROVE_ANYWAY') : void decide('APPROVE'))} disabled={!!busy}>
                {busy === 'APPROVE' ? <LoaderCircle className="animate-spin" /> : <CircleCheck />} Setujui
              </Button>
              <Button variant="outline" size="lg" className="h-11 sm:flex-1" onClick={() => setAsk('NEEDS_REVISION')} disabled={!!busy}>
                <Undo2 /> Minta revisi
              </Button>
              <Button variant="destructive" size="lg" className="h-11 sm:flex-1" onClick={() => setAsk('REJECT')} disabled={!!busy}>
                <Ban /> Tolak
              </Button>
            </div>
          ) : (
            <p className="border-t pt-4 text-sm text-muted-foreground">
              {reviewed?.reviewedAt
                ? `Diputuskan ${fmtTime(reviewed.reviewedAt)}: ${RECEIPT_STATUS_LABEL[reviewed.status].toLowerCase()}${reviewed.reason ? `, alasan: ${reviewed.reason}` : ''}.`
                : item.order.status === 'EXPIRED'
                  ? 'Waktu tahan kursi habis sebelum struk diputuskan. Pesanan kedaluwarsa.'
                  : item.siblings.some((s) => s.status === 'NEEDS_REVISION')
                    ? 'Menunggu pengunjung mengirim ulang struk.'
                    : `Pesanan ${ORDER_STATUS_LABEL[item.order.status].toLowerCase()}.`}
            </p>
          )}
        </div>
      </div>

      <Dialog
        open={ask === 'APPROVE_ANYWAY'}
        onOpenChange={(o) => {
          if (!o && !busy) setAsk(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tetap setujui?</DialogTitle>
            <DialogDescription>Cek otomatis menemukan syarat yang belum terpenuhi:</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-1 text-sm text-[#a11b1b]">
            {failing.map((c, i) => (
              <li key={i} className="flex items-start gap-2">
                <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden /> {c.message}
              </li>
            ))}
          </ul>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="lg" onClick={() => setAsk('NEEDS_REVISION')} disabled={!!busy}>
              Minta revisi saja
            </Button>
            <Button size="lg" onClick={() => void decide('APPROVE')} disabled={!!busy}>
              {busy === 'APPROVE' && <LoaderCircle className="animate-spin" />} Tetap setujui
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={ask === 'NEEDS_REVISION' || ask === 'REJECT'}
        onOpenChange={(o) => {
          if (!o && !busy) {
            setAsk(null)
            setReason('')
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          {(ask === 'NEEDS_REVISION' || ask === 'REJECT') && (
            <>
              <DialogHeader>
                <DialogTitle>{ask === 'NEEDS_REVISION' ? 'Minta revisi struk' : 'Tolak struk'}</DialogTitle>
                <DialogDescription>
                  {ask === 'NEEDS_REVISION'
                    ? `Alasan dikirim ke ${item.order.buyerName} lewat WA (simulasi). Kursinya tetap ditahan sampai ${fmtTime(item.order.holdExpiresAt)} WIB.`
                    : `Pesanan ditolak dan kursi ${seatSummary(item.order.items)} dilepas. Alasan dikirim ke pengunjung.`}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Alasan cepat">
                {REASONS[ask].map((x) => (
                  <button
                    key={x}
                    type="button"
                    aria-pressed={reason === x}
                    onClick={() => setReason(x)}
                    className={cn('min-h-9 rounded-full border px-3 text-sm font-medium', reason === x ? 'border-brand bg-brand-soft text-brand' : 'bg-card hover:border-foreground/30')}
                  >
                    {x}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="review-reason">Alasan</Label>
                <Textarea
                  id="review-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={ask === 'NEEDS_REVISION' ? 'Apa yang perlu diperbaiki pengunjung?' : 'Kenapa struk ditolak?'}
                  rows={3}
                  maxLength={200}
                />
                <p className="text-xs text-muted-foreground">Wajib diisi, supaya pengunjung tahu harus apa.</p>
              </div>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => {
                    setAsk(null)
                    setReason('')
                  }}
                  disabled={!!busy}
                >
                  Batal
                </Button>
                <Button variant={ask === 'REJECT' ? 'destructive' : 'default'} size="lg" onClick={() => void decide(ask, reason)} disabled={!reason.trim() || !!busy}>
                  {busy === ask && <LoaderCircle className="animate-spin" />}
                  {ask === 'NEEDS_REVISION' ? 'Kirim permintaan revisi' : 'Tolak struk'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </SectionCard>
  )
}
