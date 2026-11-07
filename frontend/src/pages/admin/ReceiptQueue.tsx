/**
 * Verifikasi struk (AD-07): receipt sets waiting for a decision, a zoomable photo, the automatic
 * rule checks, and Setujui / Minta revisi / Tolak. The visitor's seats stay held meanwhile.
 */
import { useState } from 'react'
import { ArrowLeft, Inbox } from 'lucide-react'
import { api } from '@/api'
import { ListSkeleton, LoadError, PageHeader } from '@/components/admin/AdminUi'
import { useMedia } from '@/components/admin/hooks'
import { QueueRow, ReviewPanel } from '@/components/admin/ReceiptReview'
import { EmptyState } from '@/components/common/bits'
import { Button } from '@/components/ui/button'
import { useLive } from '@/hooks/useLive'
import { cn } from '@/lib/utils'

type Tab = 'PENDING' | 'ALL'

export default function ReceiptQueue() {
  const [tab, setTab] = useState<Tab>('PENDING')
  const pendingQ = useLive(() => api.admin.listReceipts('PENDING'), [])
  const allQ = useLive(() => api.admin.listReceipts('ALL'), [], { enabled: tab === 'ALL' })
  const q = tab === 'PENDING' ? pendingQ : allQ
  const items = tab === 'ALL' ? [...(allQ.data ?? [])].reverse() : (pendingQ.data ?? [])
  const [openId, setOpenId] = useState<string | null>(null)
  const current = items.find((i) => i.order.id === openId) ?? items[0]
  // list and detail side by side (lg): the row open in the pane is marked. On a phone the list stands alone, so no row is
  const sideBySide = useMedia('(min-width: 1024px)')

  const afterDecision = (doneOrderId: string) => {
    const idx = items.findIndex((i) => i.order.id === doneOrderId)
    const rest = items.filter((i) => i.order.id !== doneOrderId)
    const next = tab === 'PENDING' ? (rest[idx] ?? rest[idx - 1] ?? null) : (items[idx] ?? null)
    setOpenId(next ? next.order.id : null)
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Verifikasi struk" description="Cek foto dan hasil cek otomatis, lalu putuskan. Kursi pengunjung tetap ditahan selama menunggu." />

      <div className="mb-4 inline-flex rounded-xl bg-panel p-1" role="tablist" aria-label="Filter antrean">
        {(
          [
            ['PENDING', `Menunggu (${pendingQ.data?.length ?? 0})`],
            ['ALL', 'Semua'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => {
              setTab(key)
              setOpenId(null)
            }}
            className={cn('min-h-9 rounded-lg px-4 text-sm font-semibold transition pointer-coarse:min-h-11', tab === key ? 'bg-card shadow-[0_1px_2px_rgb(35_31_32/0.08)] ring-1 ring-foreground/[0.06]' : 'text-muted-foreground hover:text-foreground')}
          >
            {label}
          </button>
        ))}
      </div>

      {q.error && !q.data ? (
        <LoadError error={q.error} onRetry={q.reload} />
      ) : !q.data ? (
        <ListSkeleton rows={4} />
      ) : !items.length ? (
        <EmptyState icon={<Inbox />} title={tab === 'PENDING' ? 'Antrean kosong' : 'Belum ada struk'}>
          {tab === 'PENDING' ? 'Semua struk sudah diputuskan.' : 'Struk muncul di sini setelah pengunjung mengirim foto struk untuk kategori Tukar struk.'}
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <ul className={cn('flex flex-col gap-2', openId && 'hidden lg:flex')} aria-label="Antrean struk">
            {items.map((it) => (
              <li key={it.order.id}>
                <QueueRow item={it} active={sideBySide && current?.order.id === it.order.id} onOpen={() => setOpenId(it.order.id)} />
              </li>
            ))}
          </ul>
          {current && (
            <div className={cn(!openId && 'hidden lg:block')}>
              <Button variant="ghost" size="lg" className="mb-2 lg:hidden" onClick={() => setOpenId(null)}>
                <ArrowLeft /> Kembali ke antrean
              </Button>
              <ReviewPanel key={current.order.id} item={current} onDone={afterDecision} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

