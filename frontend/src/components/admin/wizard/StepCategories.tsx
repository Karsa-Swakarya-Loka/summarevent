import { Check, Plus, Sparkles, Trash2 } from 'lucide-react'
import { Field, SectionCard } from '@/components/admin/AdminUi'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ACCESS_METHOD_LABEL, CATEGORY_COLORS } from '@/domain/labels'
import type { AccessMethod, ReceiptRules, Tenant } from '@/domain/types'
import { rupiahPlain } from '@/lib/format'
import { cn } from '@/lib/utils'
import { NumberInput, TextInput, ToggleRow } from './inputs'
import { emptyReceiptRules, newCategory, presetReceiptRules, seatCounts, type CatForm, type StepProps } from './model'

const METHODS: AccessMethod[] = ['PAID', 'FREE', 'RECEIPT']
const METHOD_HINT: Record<AccessMethod, string> = {
  PAID: 'Pengunjung bayar lewat QRIS atau VA (simulasi).',
  FREE: 'Pengunjung cukup daftar, tanpa bayar.',
  RECEIPT: 'Pengunjung menukar struk belanja di tenant SUMMABA.',
}

function Segmented({ id, value, onChange }: { id: string; value: AccessMethod; onChange: (v: AccessMethod) => void }) {
  return (
    <div role="radiogroup" aria-labelledby={`${id}-label`} className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
      {METHODS.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={value === m}
          onClick={() => onChange(m)}
          className={cn(
            'flex min-h-9 flex-col items-center justify-center rounded-md px-1 text-sm font-semibold transition pointer-coarse:min-h-11 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
            value === m ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {ACCESS_METHOD_LABEL[m]}
        </button>
      ))}
    </div>
  )
}

function ReceiptRulesPanel({ c, set, err, tenants }: { c: CatForm; set: (r: ReceiptRules) => void; err: StepProps['err']; tenants: Tenant[] }) {
  const rr = c.receiptRules ?? emptyReceiptRules()
  const preset = presetReceiptRules(tenants)
  const isPreset = JSON.stringify({ ...rr, excludedTenantIds: [...rr.excludedTenantIds].sort() }) === JSON.stringify({ ...preset, excludedTenantIds: [...preset.excludedTenantIds].sort() })
  const f = (x: string) => `cat.${c.key}.${x}`
  const id = (x: string) => `${c.key}-${x}`
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-brand-orange/30 bg-accent/50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-bold">Aturan tukar struk</div>
          <p className="text-xs text-muted-foreground">
            Aturan yang biasa dipakai mal: belanja minimal Rp300.000, paling banyak 3 struk digabung, struk hari ini sebelum jam 22.00, struk Bazaar tidak diterima.
          </p>
        </div>
        <Button type="button" size="lg" variant={isPreset ? 'outline' : 'default'} className="h-10 shrink-0" onClick={() => set(preset)}>
          {isPreset ? <Check /> : <Sparkles />} {isPreset ? 'Aturan standar dipakai' : 'Pakai aturan standar mal'}
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field id={id('min')} label="Minimal belanja" error={err(f('minSpend'))} hint={Number.isFinite(rr.minSpend) ? `Total semua struk minimal ${rupiahPlain(rr.minSpend)} untuk 1 kali tukar.` : undefined}>
          <NumberInput id={id('min')} prefix="Rp" step={10000} min={0} value={rr.minSpend} invalid={!!err(f('minSpend'))} placeholder="mis. 300000" onChange={(n) => set({ ...rr, minSpend: n })} />
        </Field>
        <Field id={id('maxr')} label="Gabung paling banyak" error={err(f('maxReceipts'))} hint={`Struk boleh digabung untuk mencapai minimal belanja. Lebih dari ${Number.isFinite(rr.maxReceiptsCombined) ? rr.maxReceiptsCombined : 3} struk ditolak.`}>
          <NumberInput id={id('maxr')} min={1} max={10} suffix="struk" value={rr.maxReceiptsCombined} invalid={!!err(f('maxReceipts'))} onChange={(n) => set({ ...rr, maxReceiptsCombined: n })} />
        </Field>
        <Field id={id('cut')} label="Jam struk paling lambat" error={err(f('cutoff'))} hint="Struk dengan jam setelah ini tidak bisa ditukar. Contoh: batas 22.00, struk jam 22.15 ditolak.">
          <input
            id={id('cut')}
            type="time"
            value={rr.cutoffTime}
            onChange={(e) => set({ ...rr, cutoffTime: e.target.value })}
            className="h-10 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {/* "kelipatan" (Rp600.000 counting as two exchanges) is not enforced by the server yet, so it is not offered; every
            exchange is one order, whatever the total above the minimum */}
        <ToggleRow id={id('same')} checked={rr.sameDayRequired} onChange={(v) => set({ ...rr, sameDayRequired: v })} title="Hanya struk hari ini" description="Tanggal struk harus sama dengan hari pengunjung menukarnya. Struk kemarin ditolak." />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">Struk yang tidak diterima</legend>
        <p className="-mt-1 mb-1 text-xs text-muted-foreground">Centang tenant yang struknya tidak bisa ditukar. Pengunjung yang mengunggah struk dari tenant ini langsung diberi tahu struknya tidak berlaku.</p>
        <div className="flex flex-wrap gap-2">
          {tenants.map((t) => {
            const checked = rr.excludedTenantIds.includes(t.id)
            const cid = id(`ex-${t.id}`)
            return (
              <label
                key={t.id}
                htmlFor={cid}
                className={cn('flex min-h-9 cursor-pointer items-center gap-2 rounded-full border bg-card px-3 text-xs font-medium pointer-coarse:min-h-11', checked && 'border-status-invalid/40 bg-status-invalid/5')}
              >
                <Checkbox
                  id={cid}
                  checked={checked}
                  onCheckedChange={(v) =>
                    set({ ...rr, excludedTenantIds: v ? [...rr.excludedTenantIds, t.id] : rr.excludedTenantIds.filter((x) => x !== t.id) })
                  }
                />
                {t.name}
                <span className="text-muted-foreground">{t.category}</span>
              </label>
            )
          })}
        </div>
      </fieldset>
    </div>
  )
}

export function StepCategories({ form, update, err, tenants }: StepProps & { tenants: Tenant[] }) {
  const general = form.seatingMode === 'GENERAL'
  const counts = seatCounts(form.layout)
  const setCat = (k: string, patch: Partial<CatForm>) => update((f) => ({ ...f, categories: f.categories.map((c) => (c.key === k ? { ...c, ...patch } : c)) }))
  const remove = (k: string) =>
    update((f) => ({
      ...f,
      categories: f.categories.filter((c) => c.key !== k),
      layout: { ...f.layout, ranges: f.layout.ranges.filter((r) => r.catKey !== k) },
    }))
  const add = () => update((f) => ({ ...f, categories: [...f.categories, newCategory(f.categories.length, f.seatingMode)] }))
  const usedColors = (k: string) => new Set(form.categories.filter((c) => c.key !== k).map((c) => c.color))

  return (
    <div className="flex flex-col gap-4">
      {err('categories') && (
        <p role="alert" className="rounded-lg border border-status-invalid/30 bg-status-invalid/5 p-3 text-sm font-medium text-[#a11b1b]">
          {err('categories')}
        </p>
      )}
      {form.categories.map((c, i) => {
        const f = (x: string) => `cat.${c.key}.${x}`
        const id = (x: string) => `${c.key}-${x}`
        const others = usedColors(c.key)
        const seats = counts.get(c.key)
        return (
          <SectionCard
            key={c.key}
            title={
              <span className="flex items-center gap-2">
                <span className="size-4 rounded-[5px]" style={{ background: c.color }} aria-hidden />
                Kategori {i + 1}
                {c.name.trim() && <span className="font-normal text-muted-foreground">· {c.name.trim()}</span>}
              </span>
            }
            description={
              general || c.noSeat
                ? 'Tanpa nomor kursi. Jumlah tiket ikut kuota per sesi.'
                : seats
                  ? `${seats} kursi di denah`
                  : 'Kursi diatur di langkah Denah'
            }
            actions={
              <Button type="button" variant="ghost" size="lg" className="text-muted-foreground hover:text-status-invalid" disabled={form.categories.length <= 1} onClick={() => remove(c.key)} aria-label={`Hapus kategori ${c.name || i + 1}`}>
                <Trash2 /> Hapus
              </Button>
            }
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field id={id('name')} label="Nama kategori" error={err(f('name'))}>
                <TextInput id={id('name')} value={c.name} invalid={!!err(f('name'))} placeholder={i === 0 ? 'mis. VIP' : 'mis. Reguler'} onChange={(e) => setCat(c.key, { name: e.target.value })} />
              </Field>
              <div className="flex flex-col gap-1.5">
                <span id={id('color-label')} className="text-sm font-semibold">
                  Warna di denah
                </span>
                <div role="radiogroup" aria-labelledby={id('color-label')} className="flex flex-wrap gap-2">
                  {CATEGORY_COLORS.map((col) => {
                    const active = c.color === col.value
                    return (
                      <button
                        key={col.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        aria-label={`${col.name}${others.has(col.value) ? ' (sudah dipakai kategori lain)' : ''}`}
                        title={col.name}
                        onClick={() => setCat(c.key, { color: col.value })}
                        className={cn('relative flex size-10 items-center justify-center rounded-lg ring-offset-2 transition pointer-coarse:size-11 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none', active && 'ring-2 ring-foreground')}
                        style={{ background: col.value }}
                      >
                        {active && <Check className="size-5 text-white" aria-hidden />}
                        {!active && others.has(col.value) && <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-card ring-2 ring-foreground/40" aria-hidden />}
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">Hijau, kuning, dan merah tidak ada di sini karena dipakai untuk status kursi.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <span id={`${id('method')}-label`} className="text-sm font-semibold">
                  Cara dapat
                </span>
                <Segmented
                  id={id('method')}
                  value={c.accessMethod}
                  onChange={(m) =>
                    setCat(c.key, {
                      accessMethod: m,
                      receiptRules: m === 'RECEIPT' ? (c.receiptRules ?? emptyReceiptRules()) : c.receiptRules,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">{METHOD_HINT[c.accessMethod]}</p>
              </div>
              {c.accessMethod === 'PAID' ? (
                <Field id={id('price')} label="Harga per kursi" error={err(f('price'))} hint={Number.isFinite(c.price) && c.price > 0 ? rupiahPlain(c.price) : 'Minimal Rp1.000'}>
                  <NumberInput id={id('price')} prefix="Rp" step={5000} min={0} value={c.price} invalid={!!err(f('price'))} placeholder="mis. 50000" onChange={(n) => setCat(c.key, { price: n })} />
                </Field>
              ) : (
                <div className="flex flex-col justify-center rounded-lg bg-muted/60 p-3 text-sm">
                  <span className="font-semibold">Harga Rp0</span>
                  <span className="text-xs text-muted-foreground">{c.accessMethod === 'FREE' ? 'Tiket gratis, tidak perlu bayar.' : 'Tiket gratis setelah struk disetujui panitia.'}</span>
                </div>
              )}

              {!general && (
                <ToggleRow
                  id={id('noseat')}
                  checked={c.noSeat}
                  onChange={(v) => setCat(c.key, { noSeat: v, quota: v && !Number.isFinite(c.quota) ? 50 : c.quota })}
                  title="Tanpa nomor kursi"
                  description="Untuk area bebas, misalnya Festival berdiri. Tidak ada di denah; jumlah tiket diatur lewat kuota."
                />
              )}
              {(general || c.noSeat) && (
                <Field id={id('quota')} label="Kuota per sesi" error={err(f('quota'))}>
                  <NumberInput id={id('quota')} min={1} max={5000} suffix="orang" value={c.quota} invalid={!!err(f('quota'))} onChange={(n) => setCat(c.key, { quota: n })} />
                </Field>
              )}

              <Field id={id('sale')} label="Penjualan dibuka" error={err(f('saleStart'))} hint="Jam WIB. Sebelum waktu ini pengunjung belum bisa memesan.">
                <input
                  id={id('sale')}
                  type="datetime-local"
                  value={c.saleStart}
                  aria-invalid={!!err(f('saleStart')) || undefined}
                  onChange={(e) => setCat(c.key, { saleStart: e.target.value })}
                  className="h-10 w-full min-w-0 rounded-lg border border-input bg-card px-2.5 text-sm outline-none pointer-coarse:min-h-11 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
                />
              </Field>
              <Field id={id('close')} label="Penjualan ditutup" error={err(f('saleCloseMin'))} hint="Contoh: 30 berarti sesi jam 19.00 berhenti dijual jam 18.30. Isi 0 kalau tetap dijual sampai sesi mulai. Jam pastinya terlihat di langkah Sesi.">
                <NumberInput id={id('close')} min={0} max={1440} suffix="menit sebelum sesi mulai" value={c.saleCloseMin} invalid={!!err(f('saleCloseMin'))} onChange={(n) => setCat(c.key, { saleCloseMin: n })} />
              </Field>
              <Field id={id('desc')} label="Keterangan singkat" optional className="md:col-span-2" hint="Tampil di legenda denah, mis. “Baris A–B, paling dekat panggung”.">
                <TextInput id={id('desc')} value={c.description} onChange={(e) => setCat(c.key, { description: e.target.value })} />
              </Field>
              <Field id={id('bonusN')} label="Bonus untuk pemesan pertama" optional error={err(f('bonusN'))} hint="Contoh: 50 berarti 50 tiket pertama di tiap sesi dapat bonus. Kosongkan kalau tidak ada.">
                <NumberInput
                  id={id('bonusN')}
                  min={1}
                  max={10000}
                  suffix="tiket pertama"
                  value={c.bonusFirstN ?? Number.NaN}
                  invalid={!!err(f('bonusN'))}
                  onChange={(n) => setCat(c.key, { bonusFirstN: Number.isFinite(n) ? n : null })}
                />
              </Field>
              <Field id={id('bonusDesc')} label="Isi bonus" optional error={err(f('bonusDesc'))}>
                <TextInput id={id('bonusDesc')} value={c.bonusDesc ?? ''} placeholder="mis. Poster bertanda tangan" invalid={!!err(f('bonusDesc'))} onChange={(e) => setCat(c.key, { bonusDesc: e.target.value || null })} />
              </Field>
            </div>
            {c.accessMethod === 'RECEIPT' && (
              <div className="mt-4">
                <ReceiptRulesPanel c={c} err={err} tenants={tenants} set={(r) => setCat(c.key, { receiptRules: r })} />
              </div>
            )}
          </SectionCard>
        )
      })}
      <Button type="button" variant="outline" size="lg" className="h-11 self-start border-dashed" onClick={add} disabled={form.categories.length >= CATEGORY_COLORS.length}>
        <Plus /> Tambah kategori
      </Button>
    </div>
  )
}
