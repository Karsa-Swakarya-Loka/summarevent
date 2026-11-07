/**
 * ⌘K for the panitia: type to jump to a page or to find an order by its code, buyer, phone or seat. Pages come from
 * the sidebar's menu; orders are looked up through `api.admin.listOrders` once the query settles.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { CornerDownLeft, Search } from 'lucide-react'
import { api } from '@/api'
import type { OrderRow } from '@/api/contract'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useDebounced } from '@/components/visitor/hooks'
import { ORDER_STATUS_LABEL } from '@/domain/labels'
import { useLive } from '@/hooks/useLive'
import { rupiahPlain } from '@/lib/format'
import { finePointer } from '@/lib/pointer'
import { cn } from '@/lib/utils'
import { ADMIN_NAV, seatSummary } from './lib'

type Hit = {
  key: string
  group: 'Halaman' | 'Pesanan'
  title: string
  sub?: string
  to: string
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:top-[12vh] sm:max-w-lg sm:translate-y-0"
        showCloseButton={false}
        // Radix focuses the search box on open; on touch that opens the keyboard before the person chose to type
        onOpenAutoFocus={(e) => {
          if (finePointer()) return
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).focus()
        }}
      >
        <DialogTitle className="sr-only">Cari cepat</DialogTitle>
        <DialogDescription className="sr-only">Lompat ke halaman panitia atau cari pesanan.</DialogDescription>
        {/* a fresh search each time it opens */}
        {open && <Palette close={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function Palette({ close }: { close: () => void }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const dq = useDebounced(q.trim(), 200)
  const input = useRef<HTMLInputElement>(null)
  const orders = useLive(() => (dq.length >= 2 ? api.admin.listOrders({ q: dq }) : Promise.resolve([] as OrderRow[])), [dq])

  useEffect(() => {
    if (!finePointer()) return
    const t = setTimeout(() => input.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [])

  const needle = q.trim().toLowerCase()
  const pages: Hit[] = ADMIN_NAV.filter((n) => !needle || n.label.toLowerCase().includes(needle)).map((n) => ({ key: n.to, group: 'Halaman', title: n.label, to: n.to }))
  const rows: Hit[] = (orders.data ?? []).slice(0, 6).map((r) => ({
    key: r.order.id,
    group: 'Pesanan',
    title: `${r.order.code} · ${r.order.buyerName}`,
    sub: `${r.event.title} · ${seatSummary(r.order.items)} · ${ORDER_STATUS_LABEL[r.order.status]} · ${r.order.totalAmount ? rupiahPlain(r.order.totalAmount) : r.category.accessMethod === 'RECEIPT' ? 'Tukar struk' : 'Gratis'}`,
    to: `/admin/orders?event=${r.event.id}&q=${encodeURIComponent(r.order.code)}`,
  }))
  const hits = [...pages, ...rows]
  const current = Math.min(active, Math.max(0, hits.length - 1))

  const go = (hit: Hit | undefined) => {
    if (!hit) return
    close()
    navigate(hit.to)
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b px-4">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(a + 1, hits.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              go(hits[current])
            }
          }}
          placeholder="Cari halaman atau pesanan…"
          className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={hits[current] ? `palette-${hits[current].key}` : undefined}
          aria-autocomplete="list"
          aria-label="Cari cepat"
        />
        <kbd className="hidden rounded-md bg-muted px-1.5 py-0.5 font-sans text-[0.68rem] font-semibold text-muted-foreground sm:block">Esc</kbd>
      </div>
      <ul id="palette-list" role="listbox" aria-label="Hasil" className="max-h-[50vh] overflow-y-auto p-2">
        {(['Halaman', 'Pesanan'] as const).map((group) => {
          const items = hits.filter((h) => h.group === group)
          if (!items.length) return null
          return (
            <li key={group} role="presentation">
              <p className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">{group}</p>
              <ul role="group" aria-label={group}>
                {items.map((h) => {
                  const i = hits.indexOf(h)
                  return (
                    <li
                      key={h.key}
                      id={`palette-${h.key}`}
                      role="option"
                      aria-selected={i === current}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(h)}
                      className={cn('flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm pointer-coarse:min-h-11', i === current ? 'bg-muted' : '')}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{h.title}</span>
                        {h.sub && <span className="block truncate text-xs text-muted-foreground">{h.sub}</span>}
                      </span>
                      {i === current && <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                    </li>
                  )
                })}
              </ul>
            </li>
          )
        })}
        {!hits.length && <li className="px-2 py-6 text-center text-sm text-muted-foreground">{dq.length >= 2 && orders.loading ? 'Mencari…' : 'Tidak ada yang cocok.'}</li>}
      </ul>
    </>
  )
}
