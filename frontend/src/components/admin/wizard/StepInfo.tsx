import { Armchair, Users } from 'lucide-react'
import { Field, SectionCard } from '@/components/admin/AdminUi'
import { Poster } from '@/components/common/Poster'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { PosterTheme, SeatingMode, Venue } from '@/domain/types'
import { cn } from '@/lib/utils'
import { ChoiceCards, NumberInput, TextInput, ToggleRow } from './inputs'
import type { StepProps } from './model'

const THEMES: Array<{ id: PosterTheme; name: string }> = [
  { id: 'stage', name: 'Pertunjukan' },
  { id: 'acoustic', name: 'Konser' },
  { id: 'craft', name: 'Kelas' },
  { id: 'expo', name: 'Pameran' },
]

export function StepInfo({ form, update, err, venues, layoutLocked }: StepProps & { venues: Venue[]; layoutLocked: boolean }) {
  const setMode = (mode: SeatingMode) =>
    update((f) => ({
      ...f,
      seatingMode: mode,
      categories: f.categories.map((c) => ({
        ...c,
        noSeat: mode === 'GENERAL' ? true : false,
        quota: mode === 'GENERAL' && !Number.isFinite(c.quota) ? 50 : c.quota,
      })),
    }))
  const rules = form.rules
  const setRule = <K extends keyof typeof rules>(k: K, v: (typeof rules)[K]) => update((f) => ({ ...f, rules: { ...f.rules, [k]: v } }))

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Informasi event" description="Tampil di halaman event pengunjung.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="ev-title" label="Judul event" error={err('title')} className="md:col-span-2">
            <TextInput id="ev-title" value={form.title} invalid={!!err('title')} placeholder='mis. Pentas Musikal Keluarga "Sangkuriang"' onChange={(e) => update((f) => ({ ...f, title: e.target.value }))} />
          </Field>
          <Field id="ev-subtitle" label="Subjudul" optional className="md:col-span-2">
            <TextInput id="ev-subtitle" value={form.subtitle} placeholder="Satu kalimat pemikat" onChange={(e) => update((f) => ({ ...f, subtitle: e.target.value }))} />
          </Field>
          <Field id="ev-desc" label="Deskripsi" error={err('description')} hint="Isi acara, durasi, dan cocok untuk siapa." className="md:col-span-2">
            <Textarea
              id="ev-desc"
              rows={3}
              className="bg-card"
              value={form.description}
              aria-invalid={!!err('description') || undefined}
              placeholder="Pertunjukan 60 menit untuk keluarga…"
              onChange={(e) => update((f) => ({ ...f, description: e.target.value }))}
            />
          </Field>
          <Field id="ev-venue" label="Venue" error={err('venueId')} hint="Kapasitas venue adalah asumsi dan bisa diubah nanti.">
            <Select value={form.venueId} onValueChange={(v) => update((f) => ({ ...f, venueId: v }))}>
              <SelectTrigger id="ev-venue" className="h-10 w-full bg-card" aria-invalid={!!err('venueId') || undefined}>
                <SelectValue placeholder="Pilih venue" />
              </SelectTrigger>
              <SelectContent position="popper">
                {venues.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name} <span className="text-xs text-muted-foreground">· kapasitas {v.capacity}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Tema poster" description="Poster dibuat otomatis dari judul. Tidak perlu unggah gambar.">
        <div role="radiogroup" aria-label="Tema poster" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {THEMES.map((t) => {
            const active = form.posterTheme === t.id
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`Tema ${t.name}`}
                onClick={() => update((f) => ({ ...f, posterTheme: t.id }))}
                className={cn('overflow-hidden rounded-xl text-left ring-1 ring-border transition focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none', active ? 'ring-3 ring-brand' : 'hover:ring-foreground/30')}
              >
                <Poster theme={t.id} title={form.title.trim() || 'Judul event'} compact className="aspect-[5/3] w-full" />
                <span className={cn('flex items-center justify-between px-3 py-2 text-sm font-semibold', active && 'bg-brand-soft text-brand')}>
                  {t.name}
                  {active && <span className="text-xs">Dipilih</span>}
                </span>
              </button>
            )
          })}
        </div>
      </SectionCard>

      <SectionCard title="Mode kursi" description={layoutLocked ? 'Mode kursi terkunci karena event ini sudah punya pesanan.' : 'Bisa diubah sebelum ada pesanan.'}>
        <ChoiceCards<SeatingMode>
          label="Mode kursi"
          value={form.seatingMode}
          onChange={setMode}
          disabled={layoutLocked}
          className="sm:grid-cols-2"
          options={[
            { value: 'RESERVED', icon: <Armchair />, title: 'Kursi bernomor', description: 'Pengunjung memilih kursi di denah. Bisa ditambah area tanpa nomor (mis. Festival).' },
            { value: 'GENERAL', icon: <Users />, title: 'Tanpa nomor kursi', description: 'Cukup pilih sesi & jumlah orang. Kapasitas dari kuota per kategori.' },
          ]}
        />
      </SectionCard>

      <SectionCard title="Aturan event" description="Berlaku untuk semua kategori dan sesi.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="rule-max" label="Maks kursi per pesanan" error={err('rules.maxSeatsPerOrder')}>
            <NumberInput id="rule-max" value={rules.maxSeatsPerOrder} min={1} max={10} suffix="kursi" invalid={!!err('rules.maxSeatsPerOrder')} onChange={(n) => setRule('maxSeatsPerOrder', n)} />
          </Field>
          <Field id="rule-pay" label="Waktu tahan bayar" error={err('rules.paymentHoldMin')} hint="Kursi ditahan selama pembayaran.">
            <NumberInput id="rule-pay" value={rules.paymentHoldMin} min={3} max={60} suffix="menit" invalid={!!err('rules.paymentHoldMin')} onChange={(n) => setRule('paymentHoldMin', n)} />
          </Field>
          <Field id="rule-rcp" label="Waktu tahan struk" error={err('rules.receiptHoldMin')} hint="Selama struk diverifikasi panitia.">
            <NumberInput id="rule-rcp" value={rules.receiptHoldMin} min={5} max={180} suffix="menit" invalid={!!err('rules.receiptHoldMin')} onChange={(n) => setRule('receiptHoldMin', n)} />
          </Field>
          <Field id="rule-checkin" label="Check-in dibuka" error={err('rules.checkinOpenMin')} hint="Sebelum sesi mulai.">
            <NumberInput id="rule-checkin" value={rules.checkinOpenMin} min={0} max={240} suffix="menit" invalid={!!err('rules.checkinOpenMin')} onChange={(n) => setRule('checkinOpenMin', n)} />
          </Field>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ToggleRow id="rule-transfer" checked={rules.transferable} onChange={(v) => setRule('transferable', v)} title="Tiket bisa dipindahtangankan" description="Nama peserta boleh diganti setelah tiket terbit." />
          <ToggleRow id="rule-reentry" checked={rules.reentryAllowed} onChange={(v) => setRule('reentryAllowed', v)} title="Boleh keluar-masuk" description="QR bisa dipindai ulang di sesi yang sama." />
        </div>
      </SectionCard>
    </div>
  )
}
