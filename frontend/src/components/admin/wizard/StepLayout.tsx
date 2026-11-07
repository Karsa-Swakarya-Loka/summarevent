import { useMemo, useState } from 'react'
import { Accessibility, Ban, Lock, Plus, Shuffle, Trash2 } from 'lucide-react'
import type { SeatMapData } from '@/api/contract'
import { Field, SectionCard } from '@/components/admin/AdminUi'
import { SeatMap, SeatSample } from '@/components/seatmap/SeatMap'
import { Button } from '@/components/ui/button'
import { PRIORITY_SEAT_LABEL, SEAT_STATUS_LABEL } from '@/domain/labels'
import { rowIndex, rowLetter, seatLabel } from '@/domain/rules'
import type { EventItem, SessionSeat, TicketCategory } from '@/domain/types'
import { cn } from '@/lib/utils'
import { NumberInput, ToggleRow } from './inputs'
import { distributeRows, key, LAYOUT_TEMPLATES, maxSellable, previewSeats, rowCategoryKeys, rowClosed, seatCategories, seatCounts, sellOnly, toggleRow, type LayoutForm, type StepProps } from './model'

const selectCls =
  'h-10 w-full min-w-0 rounded-lg border border-input bg-card px-2 text-sm pointer-coarse:h-11 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive disabled:opacity-60'

export function StepLayout({ form, update, err, locked }: StepProps & { locked: boolean }) {
  const L = form.layout
  const [mode, setMode] = useState<'block' | 'priority'>('block')
  // what the panitia is typing in "Kursi dijual per sesi" while the box is empty; otherwise it shows the live count
  const [sellDraft, setSellDraft] = useState<number | null>(null)
  const seatCats = seatCategories(form)
  const noSeatCats = form.categories.filter((c) => c.noSeat)
  const counts = seatCounts(L)
  const validSize = L.rows >= 1 && L.rows <= 26 && L.seatsPerRow >= 1 && L.seatsPerRow <= 40

  const setLayout = (fn: (l: LayoutForm) => LayoutForm) => update((f) => ({ ...f, layout: fn(f.layout) }))

  const setRows = (n: number) =>
    setLayout((l) => {
      if (!Number.isInteger(n) || n < 1) return { ...l, rows: n }
      const ranges = l.ranges
        .filter((r) => r.from <= n - 1)
        .map((r) => ({ ...r, to: r.to === l.rows - 1 || r.to > n - 1 ? n - 1 : r.to }))
      return { ...l, rows: n, ranges }
    })

  const preview: SeatMapData | null = useMemo(() => {
    if (!validSize) return null
    const seats = previewSeats(L)
    const rowCats = rowCategoryKeys(L)
    const blocked = new Set(L.blocked)
    const categories: TicketCategory[] = seatCats.map((c) => ({
      id: c.key,
      eventId: 'preview',
      name: c.name.trim() || 'Tanpa nama',
      color: c.color,
      accessMethod: c.accessMethod,
      price: Number.isFinite(c.price) ? c.price : 0,
      quota: null,
      saleStart: '',
      saleCloseMinBeforeSession: 0,
    }))
    const known = new Set(categories.map((c) => c.id))
    const sessionSeats: SessionSeat[] = seats.map((s) => {
      const k = rowCats[rowIndex(s.row)]
      const cat = k && known.has(k) ? k : null
      return { sessionId: 'preview', seatId: s.id, categoryId: cat, status: !cat || blocked.has(seatLabel(s)) ? 'BLOCKED' : 'AVAILABLE', orderId: null, holdExpiresAt: null }
    })
    const event: EventItem = {
      id: 'preview',
      slug: 'preview',
      title: form.title,
      description: '',
      posterTheme: form.posterTheme,
      venueId: form.venueId,
      layoutId: 'preview',
      seatingMode: 'RESERVED',
      status: 'DRAFT',
      startAt: '',
      endAt: '',
      rules: form.rules,
      seatAssignments: {},
      createdBy: '',
      createdAt: '',
    }
    return {
      session: { id: 'preview', eventId: 'preview', startAt: '', endAt: '' },
      event,
      layout: { id: 'preview', venueId: form.venueId, name: 'preview', rows: L.rows, seatsPerRow: L.seatsPerRow, aisleAfter: L.aisleAfter },
      seats,
      sessionSeats,
      categories,
      quotas: [],
      waitlist: [],
      bonus: [],
      version: 0,
      serverTime: '',
    }
  }, [L, seatCats, form.title, form.posterTheme, form.venueId, form.rules, validSize])

  const toggleSeat = (label: string) => {
    if (locked) return
    setLayout((l) => {
      const listKey = mode === 'block' ? 'blocked' : 'priority'
      const list = l[listKey]
      return { ...l, [listKey]: list.includes(label) ? list.filter((x) => x !== label) : [...list, label] }
    })
  }

  const rowOptions = Array.from({ length: Math.max(0, Math.min(L.rows, 26)) }, (_, i) => i)
  const rangeSeats = (from: number, to: number) => {
    let n = 0
    for (const s of previewSeats(L)) {
      const r = rowIndex(s.row)
      if (r >= from && r <= to && !L.blocked.includes(seatLabel(s))) n++
    }
    return n
  }
  const totalSellable = [...counts.values()].reduce((a, b) => a + b, 0)
  const maxSeats = validSize ? maxSellable(L) : 0
  const sellTo = (n: number) => {
    if (!Number.isFinite(n)) return setSellDraft(n)
    setSellDraft(null)
    setLayout((l) => ({ ...l, blocked: sellOnly(l, n) }))
  }

  return (
    <div className="flex flex-col gap-4">
      {locked && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-status-warn/50 bg-status-warn/10 p-4 text-sm">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <div className="font-semibold">Denah terkunci</div>
            Event ini sudah punya pesanan, jadi denah tidak bisa diubah supaya kursi pembeli tidak berpindah. Info, harga, dan sesi tetap bisa diubah.
          </div>
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <SectionCard title="Ukuran denah" description="Mulai dari template, lalu sesuaikan.">
            <div className="mb-4 flex flex-wrap gap-2">
              {LAYOUT_TEMPLATES.map((t) => (
                <Button
                  key={t.name}
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={locked}
                  onClick={() =>
                    update((f) => {
                      const layout = { ...f.layout, rows: t.rows, seatsPerRow: t.seatsPerRow, aisleAfter: t.aisleAfter }
                      return { ...f, layout: { ...layout, ranges: distributeRows({ ...f, layout }) } }
                    })
                  }
                >
                  {t.name} <span className="text-muted-foreground">{t.rows}×{t.seatsPerRow}</span>
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field id="lay-rows" label="Jumlah baris" error={err('layout.rows')} hint={L.rows >= 1 && L.rows <= 26 ? `Baris A–${rowLetter(L.rows - 1)}` : undefined}>
                <NumberInput id="lay-rows" min={1} max={26} value={L.rows} disabled={locked} invalid={!!err('layout.rows')} onChange={setRows} />
              </Field>
              <Field id="lay-seats" label="Kursi per baris" error={err('layout.seatsPerRow')}>
                <NumberInput id="lay-seats" min={1} max={40} value={L.seatsPerRow} disabled={locked} invalid={!!err('layout.seatsPerRow')} onChange={(n) => setLayout((l) => ({ ...l, seatsPerRow: n }))} />
              </Field>
            </div>
            <div className="mt-3 flex flex-col gap-3">
              <ToggleRow
                id="lay-aisle-on"
                checked={L.aisleAfter != null}
                disabled={locked}
                onChange={(v) => setLayout((l) => ({ ...l, aisleAfter: v ? Math.max(1, Math.floor((l.seatsPerRow || 2) / 2)) : null }))}
                title="Ada lorong di tengah"
                description="Kursi di kiri dan kanan lorong tidak dihitung berdampingan."
              />
              {L.aisleAfter != null && (
                <Field id="lay-aisle" label="Lorong setelah kursi ke-" error={err('layout.aisleAfter')}>
                  <NumberInput id="lay-aisle" min={1} max={Math.max(1, L.seatsPerRow - 1)} value={L.aisleAfter} disabled={locked} invalid={!!err('layout.aisleAfter')} onChange={(n) => setLayout((l) => ({ ...l, aisleAfter: n }))} />
                </Field>
              )}
              {/* sell part of the venue: the back seats close first, and every one of them can still be opened by hand */}
              <div onBlur={() => setSellDraft(null)}>
                <Field id="lay-sell" label="Kursi dijual per sesi" hint={maxSeats ? 'Kursi paling belakang ditutup duluan.' : 'Atur kategori per baris dulu.'}>
                  <NumberInput id="lay-sell" min={0} max={maxSeats} value={sellDraft ?? totalSellable} suffix={`dari ${maxSeats}`} disabled={locked || !maxSeats} onChange={sellTo} />
                </Field>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Kategori per baris"
            description="Baris depan biasanya untuk kategori termahal."
            actions={
              <Button type="button" variant="ghost" size="lg" disabled={locked || !seatCats.length} onClick={() => setLayout((l) => ({ ...l, ranges: distributeRows({ ...form, layout: l }) }))}>
                <Shuffle /> Bagi rata
              </Button>
            }
          >
            {!seatCats.length ? (
              <p className="text-sm text-muted-foreground">Belum ada kategori dengan kursi. Atur di langkah Kategori.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {L.ranges.map((rg, i) => {
                  const e = err(`range.${rg.key}`)
                  return (
                    <div key={rg.key} className="flex flex-col gap-1">
                      <div className="grid grid-cols-[minmax(0,1fr)_4.25rem_auto_4.25rem_auto] items-center gap-2">
                        <select
                          aria-label={`Kategori rentang ${i + 1}`}
                          className={selectCls}
                          value={rg.catKey}
                          disabled={locked}
                          aria-invalid={!!e || undefined}
                          onChange={(ev) => setLayout((l) => ({ ...l, ranges: l.ranges.map((x) => (x.key === rg.key ? { ...x, catKey: ev.target.value } : x)) }))}
                        >
                          {!seatCats.some((c) => c.key === rg.catKey) && <option value={rg.catKey}>Pilih kategori</option>}
                          {seatCats.map((c) => (
                            <option key={c.key} value={c.key}>
                              {c.name.trim() || 'Tanpa nama'}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label={`Dari baris (rentang ${i + 1})`}
                          className={selectCls}
                          value={rg.from}
                          disabled={locked}
                          onChange={(ev) => setLayout((l) => ({ ...l, ranges: l.ranges.map((x) => (x.key === rg.key ? { ...x, from: Number(ev.target.value) } : x)) }))}
                        >
                          {rowOptions.map((r) => (
                            <option key={r} value={r}>
                              {rowLetter(r)}
                            </option>
                          ))}
                        </select>
                        <span className="text-xs text-muted-foreground">s/d</span>
                        <select
                          aria-label={`Sampai baris (rentang ${i + 1})`}
                          className={selectCls}
                          value={rg.to}
                          disabled={locked}
                          onChange={(ev) => setLayout((l) => ({ ...l, ranges: l.ranges.map((x) => (x.key === rg.key ? { ...x, to: Number(ev.target.value) } : x)) }))}
                        >
                          {rowOptions.map((r) => (
                            <option key={r} value={r}>
                              {rowLetter(r)}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-lg"
                          disabled={locked}
                          aria-label={`Hapus rentang ${i + 1}`}
                          onClick={() => setLayout((l) => ({ ...l, ranges: l.ranges.filter((x) => x.key !== rg.key) }))}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                      {e ? (
                        <p className="text-xs font-medium text-status-invalid">{e}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Baris {rowLetter(rg.from)}–{rowLetter(rg.to)} · {validSize ? rangeSeats(rg.from, rg.to) : 0} kursi dijual
                        </p>
                      )}
                    </div>
                  )
                })}
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="self-start border-dashed"
                  disabled={locked}
                  onClick={() =>
                    setLayout((l) => {
                      const used = rowCategoryKeys(l)
                      const firstFree = used.findIndex((k) => !k)
                      const from = firstFree >= 0 ? firstFree : Math.max(0, l.rows - 1)
                      const unused = seatCats.find((c) => !l.ranges.some((r) => r.catKey === c.key)) ?? seatCats[0]
                      return { ...l, ranges: [...l.ranges, { key: key('r'), catKey: unused.key, from, to: Math.max(from, l.rows - 1) }] }
                    })
                  }
                >
                  <Plus /> Tambah rentang baris
                </Button>
                {err('ranges') && <p className="text-xs font-medium text-status-invalid">{err('ranges')}</p>}
              </div>
            )}
          </SectionCard>
        </div>

        <SectionCard
          title="Pratinjau denah"
          description="Persis seperti yang dilihat pengunjung. Pilih kursi untuk menandainya."
          className="min-w-0"
        >
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="text-sm font-semibold" id="seat-mode-label">
              Pilih kursi untuk:
            </span>
            <div role="radiogroup" aria-labelledby="seat-mode-label" className="inline-grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {(
                [
                  { v: 'block', label: 'Tandai tidak dijual', icon: <Ban /> },
                  { v: 'priority', label: PRIORITY_SEAT_LABEL, icon: <Accessibility /> },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  role="radio"
                  aria-checked={mode === o.v}
                  disabled={locked}
                  onClick={() => setMode(o.v)}
                  className={cn(
                    'flex min-h-9 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold transition pointer-coarse:min-h-11 [&_svg]:size-4 disabled:opacity-60',
                    mode === o.v ? 'bg-card shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {o.icon}
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {preview && (
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start">
              <span className="text-sm font-semibold sm:pt-2" id="row-close-label">
                Tutup satu baris:
              </span>
              <div role="group" aria-labelledby="row-close-label" className="flex flex-wrap gap-1.5">
                {rowOptions.map((r) => {
                  const closed = rowClosed(L, r)
                  return (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={closed}
                      aria-label={`Baris ${rowLetter(r)}${closed ? ', tidak dijual' : ''}`}
                      disabled={locked}
                      onClick={() => setLayout((l) => ({ ...l, blocked: toggleRow(l, r) }))}
                      className={cn(
                        'size-9 rounded-md border text-sm font-semibold tabular-nums transition pointer-coarse:size-11 disabled:opacity-60',
                        // a closed row looks like a not-for-sale seat: dashed outline, no fill
                        closed ? 'border-dashed border-foreground/35 bg-transparent text-muted-foreground' : 'border-border bg-card hover:border-foreground/40',
                      )}
                    >
                      {rowLetter(r)}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {err('layout.rows') || err('layout.seatsPerRow') || !preview ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Isi jumlah baris dan kursi per baris untuk melihat denah.</p>
          ) : (
            <SeatMap data={preview} interactive={false} onSeatClick={(s) => toggleSeat(seatLabel(s))} zoomKey={`${L.rows}x${L.seatsPerRow}`} />
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ul className="flex flex-col gap-1.5 text-sm" aria-label="Jumlah kursi per kategori">
              {seatCats.map((c) => (
                <li key={c.key} className="flex items-center gap-2">
                  <span className="size-3.5 shrink-0 rounded-[4px]" style={{ background: c.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{c.name.trim() || 'Tanpa nama'}</span>
                  <span className="font-semibold tabular-nums">{counts.get(c.key) ?? 0} kursi</span>
                </li>
              ))}
              {noSeatCats.map((c) => (
                <li key={c.key} className="flex items-center gap-2 text-muted-foreground">
                  <span className="size-3.5 shrink-0 rounded-[4px] opacity-60" style={{ background: c.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{c.name.trim() || 'Tanpa nama'} (tanpa denah)</span>
                  <span className="tabular-nums">kuota {Number.isFinite(c.quota) ? c.quota : '–'}</span>
                </li>
              ))}
              <li className="mt-1 flex items-center gap-2 border-t pt-2 font-semibold">
                <span className="flex-1">Total kursi dijual</span>
                <span className="tabular-nums">{totalSellable}</span>
              </li>
            </ul>
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center gap-2">
                <SeatSample visual="BLOCKED" />
                <span className="flex-1">{SEAT_STATUS_LABEL.BLOCKED}</span>
                <span className="font-semibold tabular-nums">{L.blocked.length}</span>
                {L.blocked.length > 0 && !locked && (
                  <button type="button" className="-my-2 min-h-9 px-1 text-xs font-semibold text-brand hover:underline pointer-coarse:min-h-11" onClick={() => setLayout((l) => ({ ...l, blocked: [] }))}>
                    Kosongkan
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex size-[18px] items-center justify-center rounded-[5px] bg-[#0e7c7b] text-[11px] text-white" aria-hidden>
                  ♿
                </span>
                <span className="flex-1">{PRIORITY_SEAT_LABEL}</span>
                <span className="font-semibold tabular-nums">{L.priority.length}</span>
                {L.priority.length > 0 && !locked && (
                  <button type="button" className="-my-2 min-h-9 px-1 text-xs font-semibold text-brand hover:underline pointer-coarse:min-h-11" onClick={() => setLayout((l) => ({ ...l, priority: [] }))}>
                    Kosongkan
                  </button>
                )}
              </div>
              {(L.blocked.length > 0 || L.priority.length > 0) && (
                <p className="text-xs text-muted-foreground">
                  {L.blocked.length > 0 && <>Tidak dijual: {L.blocked.join(', ')}. </>}
                  {L.priority.length > 0 && <>Prioritas: {L.priority.join(', ')}.</>}
                </p>
              )}
              {err('capacity') && <p className="text-xs font-medium text-[#7a5600]">{err('capacity')}</p>}
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
