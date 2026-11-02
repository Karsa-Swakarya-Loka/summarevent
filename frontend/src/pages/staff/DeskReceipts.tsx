/**
 * PT-06: verifikasi struk di desk. The petugas compares the paper receipt with the photo and the
 * automatic checks, then decides on the spot. Same rules and panel as the panitia queue (AD-07).
 */
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { ArrowLeft, Inbox } from 'lucide-react'
import { api } from '@/api'
import { QueueRow, ReviewPanel } from '@/components/admin/ReceiptReview'
import { BackHeader, EmptyState } from '@/components/common/bits'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage, useLive } from '@/hooks/useLive'

export default function DeskReceipts() {
  const [params] = useSearchParams()
  const eventId = params.get('event') ?? undefined
  const q = useLive(() => api.staff.listReceipts(eventId), [eventId])
  const [openId, setOpenId] = useState<string | null>(null)
  const items = q.data ?? []
  const current = items.find((i) => i.order.id === openId)

  const next = (doneId: string) => {
    const rest = items.filter((i) => i.order.id !== doneId)
    setOpenId(rest[0]?.order.id ?? null)
  }

  return (
    <div className="pb-24">
      <BackHeader to={`/staff${eventId ? `?event=${eventId}` : ''}`} title="Verifikasi struk di desk" />
      <div className="space-y-4 px-4 pt-4">
        <p className="rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground">
          Minta struk kertasnya, cocokkan tenant, nomor, nominal, dan jam dengan foto di bawah, lalu putuskan. Keputusan tercatat atas namamu.
        </p>
        {q.error && !q.data ? (
          <EmptyState title="Antrean struk belum bisa dimuat" action={<Button className="h-11" onClick={q.reload}>Coba lagi</Button>}>
            {errorMessage(q.error)}
          </EmptyState>
        ) : !q.data ? (
          <div className="space-y-2" aria-busy="true" aria-label="Memuat antrean">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        ) : current ? (
          <div className="space-y-2">
            <Button variant="ghost" size="lg" className="-ml-2" onClick={() => setOpenId(null)}>
              <ArrowLeft /> Kembali ke antrean
            </Button>
            <ReviewPanel key={current.order.id} item={current} onDone={next} review={(id, d, r) => api.staff.reviewReceipt(id, d, r)} />
          </div>
        ) : !items.length ? (
          <EmptyState icon={<Inbox />} title="Tidak ada struk yang menunggu">
            Struk dari pengunjung kategori Tukar Struk muncul di sini sampai panitia atau petugas memutuskan.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Antrean struk">
            {items.map((it) => (
              <li key={it.order.id}>
                <QueueRow item={it} active={false} onOpen={() => setOpenId(it.order.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
