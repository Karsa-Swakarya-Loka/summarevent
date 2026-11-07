/**
 * PT-06: verifikasi struk di desk. The petugas compares the paper receipt with the photo and the
 * automatic checks, then decides on the spot. Same rules and panel as the panitia queue (AD-07).
 */
import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { Inbox } from 'lucide-react'
import { api } from '@/api'
import { QueueRow, ReviewPanel } from '@/components/admin/ReceiptReview'
import { BackHeader, EmptyState } from '@/components/common/bits'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage, useLive } from '@/hooks/useLive'
import { useBack } from '@/lib/navStack'

export default function DeskReceipts() {
  const [params, setParams] = useSearchParams()
  const eventId = params.get('event') ?? undefined
  const q = useLive(() => api.staff.listReceipts(eventId), [eventId])
  // the open receipt lives in the URL, so the header back and the phone's back button return to the queue
  const openId = params.get('order')
  const items = q.data ?? []
  const current = items.find((i) => i.order.id === openId)
  // the next receipt (or the queue) starts at its top, not where the last long panel was scrolled to
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [openId])
  const listUrl = `/staff/receipts${eventId ? `?event=${eventId}` : ''}`

  const open = (orderId: string | null, replace: boolean) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        if (orderId) n.set('order', orderId)
        else n.delete('order')
        return n
      },
      { replace },
    )

  const toList = useBack(listUrl)
  // the desk serves the visitor standing at it: after a decision, back to the queue to pick the next one
  const next = () => toList()

  return (
    <div className="pb-24">
      <BackHeader to={current ? listUrl : `/staff${eventId ? `?event=${eventId}` : ''}`} title={current ? 'Verifikasi struk' : undefined} />
      <div className="space-y-4 px-4 pt-1">
        {!current && (
          <div>
            <h1 className="font-poster text-[2.4rem] leading-[0.95] uppercase">Struk di desk</h1>
            <p className="mt-1 text-sm text-muted-foreground">Cocokkan struk kertasnya dengan foto dan cek otomatis, lalu putuskan. Keputusan tercatat atas namamu.</p>
          </div>
        )}
        {q.error && !q.data ? (
          <EmptyState title="Antrean struk belum bisa dimuat" action={<Button className="h-11" onClick={q.reload}>Coba lagi</Button>}>
            {errorMessage(q.error)}
          </EmptyState>
        ) : !q.data ? (
          <div className="space-y-2" role="status" aria-busy="true" aria-label="Memuat antrean">
            <Skeleton className="h-24 rounded-[1.4rem]" />
            <Skeleton className="h-24 rounded-[1.4rem]" />
          </div>
        ) : current ? (
          <div className="space-y-2">
            <ReviewPanel key={current.order.id} item={current} onDone={next} review={(id, d, r) => api.staff.reviewReceipt(id, d, r)} />
          </div>
        ) : !items.length ? (
          <EmptyState icon={<Inbox />} title="Tidak ada struk yang menunggu">
            Struk dari pengunjung kategori Tukar Struk muncul di sini sampai panitia atau petugas memutuskan.
          </EmptyState>
        ) : (
          <>
            <p className="px-1 text-sm font-semibold text-muted-foreground">{items.length} struk menunggu keputusan</p>
            <ul className="flex flex-col gap-2" aria-label="Antrean struk">
              {items.map((it) => (
                <li key={it.order.id}>
                  <QueueRow item={it} active={false} onOpen={() => open(it.order.id, false)} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
