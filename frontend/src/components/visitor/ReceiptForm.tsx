import { useEffect, useId, useMemo, useState } from 'react'
import { Camera, CircleCheck, CircleDashed, CircleX, ImagePlus, LoaderCircle, Plus, ReceiptText, ScanText, Sparkles, Trash2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import type { OrderDetail, ReceiptInput, RuleCheck } from '@/api/contract'
import { dummyReceiptSvg, randomReceiptNo } from '@/domain/dummyReceipt'
import { sha256Hex } from '@/domain/qr'
import type { ReceiptRules } from '@/domain/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/hooks/useLive'
import { rupiahPlain, wibDate, wibTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useDebounced } from './hooks'

interface Draft {
  key: string
  photoUrl: string
  photoHash: string
  tenantId: string
  receiptNo: string
  /** digits only */
  amount: string
  receiptDate: string
  receiptTime: string
  processing?: boolean
  /** OCR progress 0…1 while reading the photo (PV-16) */
  reading?: number | null
}

/** Server rule checks plus the local "photo attached" check. */
type FormCheck = Omit<RuleCheck, 'rule'> & { rule: RuleCheck['rule'] | 'PHOTO' }

const newKey = () => crypto.randomUUID().slice(0, 8)

function emptyDraft(): Draft {
  return { key: newKey(), photoUrl: '', photoHash: '', tenantId: '', receiptNo: '', amount: '', receiptDate: wibDate(), receiptTime: '', processing: false }
}

function toInput(d: Draft): ReceiptInput {
  return {
    tenantId: d.tenantId,
    receiptNo: d.receiptNo,
    amount: Number(d.amount || 0),
    receiptDate: d.receiptDate,
    receiptTime: d.receiptTime,
    photoUrl: d.photoUrl,
    photoHash: d.photoHash,
  }
}

/** Compress a photo to JPEG, longest side ≤ 1000 px (receipts stay readable, upload stays small). */
async function compressImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('Foto tidak bisa dibaca. Coba ambil ulang fotonya.'))
      i.src = url
    })
    const scale = Math.min(1, 1000 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Browser tidak bisa memproses foto.')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', 0.82)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function sampleTime(rules: ReceiptRules): string {
  const now = new Date()
  const earlier = new Date(now.getTime() - 30 * 60_000)
  let t = wibDate(earlier) === wibDate(now) ? wibTime(earlier) : '00:05'
  if (t > rules.cutoffTime) {
    const [h, m] = rules.cutoffTime.split(':').map(Number)
    t = `${String(Math.max(0, h - 1)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  return t
}

const randInt = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n

/**
 * Tukar Struk form (PV-09): photo + tenant + receipt number + amount + date/time per receipt,
 * a live rule checklist (R1–R4, R6) and a "Pakai struk contoh" helper for judges.
 */
export function ReceiptForm({
  detail,
  onSubmitted,
  beforeSubmit,
  disabled = false,
}: {
  detail: OrderDetail
  onSubmitted: () => void
  beforeSubmit?: () => Promise<void>
  disabled?: boolean
}) {
  const uid = useId()
  const { order, category, tenants } = detail
  const rules = category.receiptRules
  const revision = detail.receipts.filter((r) => r.status === 'NEEDS_REVISION')

  const [drafts, setDrafts] = useState<Draft[]>(() =>
    revision.length
      ? revision.map((r) => ({
          key: newKey(),
          photoUrl: r.photoUrl,
          photoHash: r.photoHash,
          tenantId: r.tenantId,
          receiptNo: r.receiptNo,
          amount: String(r.amount),
          receiptDate: r.receiptDate,
          receiptTime: r.receiptTime,
        }))
      : [emptyDraft()],
  )
  const [touched, setTouched] = useState(revision.length > 0)
  const [result, setResult] = useState<{ key: string; checks: RuleCheck[]; total: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const inputs = useMemo(
    () => drafts.map((d) => ({ tenantId: d.tenantId, receiptNo: d.receiptNo, amount: Number(d.amount || 0), receiptDate: d.receiptDate, receiptTime: d.receiptTime, photoHash: d.photoHash })),
    [drafts],
  )
  const debounced = useDebounced(inputs, 400)
  const debouncedKey = JSON.stringify(debounced)

  useEffect(() => {
    let alive = true
    const key = JSON.stringify(debounced)
    api
      .checkReceipts(order.id, debounced)
      .then((res) => {
        if (alive) setResult({ key, checks: res.checks, total: res.total })
      })
      .catch(() => {
        if (alive) setResult((r) => ({ key, checks: r?.checks ?? [], total: r?.total ?? 0 }))
      })
    return () => {
      alive = false
    }
  }, [debounced, order.id])

  const checking = result?.key !== debouncedKey
  const checks = result?.checks ?? []
  const total = result?.total ?? 0

  if (!rules) return <p className="text-sm text-muted-foreground">Kategori ini tidak memakai struk.</p>

  const update = (key: string, patch: Partial<Draft>) => {
    setTouched(true)
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  }

  const onPhoto = async (key: string, file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('File harus berupa foto (JPG/PNG).')
      return
    }
    update(key, { processing: true })
    try {
      const [photoUrl, photoHash] = await Promise.all([compressImage(file), file.arrayBuffer().then((b) => sha256Hex(b))])
      update(key, { photoUrl, photoHash, processing: false })
    } catch (e) {
      update(key, { processing: false })
      toast.error(errorMessage(e))
    }
  }

  const fillSample = async () => {
    const empty = drafts.find((d) => !d.photoUrl && !d.tenantId && !d.receiptNo && !d.amount)
    if (!empty && drafts.length >= rules.maxReceiptsCombined) {
      toast.info(`Sudah ${rules.maxReceiptsCombined} struk (maksimal). Hapus satu dulu kalau mau pakai struk contoh.`)
      return
    }
    const target = empty ?? emptyDraft()
    const valid = tenants.filter((t) => !rules.excludedTenantIds.includes(t.id))
    const used = new Set(drafts.map((d) => d.tenantId))
    const pool = valid.filter((t) => !used.has(t.id))
    const tenant = (pool.length ? pool : valid)[randInt((pool.length ? pool : valid).length)]
    const others = drafts.filter((d) => d.key !== target.key).reduce((s, d) => s + Number(d.amount || 0), 0)
    const need = Math.max(0, rules.minSpend - others)
    const amount = need > 0 ? Math.ceil(need / 5000) * 5000 + 5000 * randInt(11) : 25_000 + 5000 * randInt(20)
    const receiptNo = randomReceiptNo()
    const date = wibDate()
    const time = sampleTime(rules)
    const photoUrl = dummyReceiptSvg({ tenantName: tenant.name, receiptNo, amount, date, time }, tenant.category)
    const photoHash = await sha256Hex(photoUrl)
    const filled: Draft = { key: target.key, photoUrl, photoHash, tenantId: tenant.id, receiptNo, amount: String(amount), receiptDate: date, receiptTime: time }
    setTouched(true)
    setDrafts((ds) => (empty ? ds.map((d) => (d.key === target.key ? filled : d)) : [...ds, filled]))
  }

  const readPhoto = async (key: string) => {
    const d = drafts.find((x) => x.key === key)
    if (!d?.photoUrl) return
    update(key, { reading: 0 })
    try {
      const { readReceiptPhoto } = await import('./ocr')
      const r = await readReceiptPhoto(d.photoUrl, tenants, (p) => update(key, { reading: p }))
      const patch: Partial<Draft> = { reading: null }
      if (r.tenantId) patch.tenantId = r.tenantId
      if (r.receiptNo) patch.receiptNo = r.receiptNo
      if (r.amount) patch.amount = String(r.amount)
      if (r.receiptDate) patch.receiptDate = r.receiptDate
      if (r.receiptTime) patch.receiptTime = r.receiptTime
      update(key, patch)
      const found = [r.tenantId && 'tenant', r.receiptNo && 'nomor', r.amount && 'nominal', r.receiptDate && 'tanggal', r.receiptTime && 'jam'].filter(Boolean)
      if (found.length) toast.success(`Terbaca dari foto: ${found.join(', ')}. Cek lagi sebelum kirim.`)
      else toast.error('Tulisan di foto belum terbaca. Foto ulang struknya lurus dan terang, atau isi manual.')
    } catch (e) {
      update(key, { reading: null })
      toast.error(`Baca otomatis gagal: ${errorMessage(e)}. Isi manual dulu, ya.`)
    }
  }

  const samplePhotoOnly = async () => {
    if (drafts.length >= rules.maxReceiptsCombined && !drafts.some((d) => !d.photoUrl && !d.tenantId && !d.receiptNo && !d.amount)) {
      toast.info(`Sudah ${rules.maxReceiptsCombined} struk (maksimal). Hapus satu dulu.`)
      return
    }
    const valid = tenants.filter((t) => !rules.excludedTenantIds.includes(t.id))
    const tenant = valid[randInt(valid.length)]
    const amount = Math.ceil(rules.minSpend / 5000) * 5000 + 5000 * randInt(11)
    const photoUrl = dummyReceiptSvg({ tenantName: tenant.name, receiptNo: randomReceiptNo(), amount, date: wibDate(), time: sampleTime(rules) }, tenant.category)
    const photoHash = await sha256Hex(photoUrl)
    const empty = drafts.find((d) => !d.photoUrl && !d.tenantId && !d.receiptNo && !d.amount)
    const target: Draft = { ...(empty ?? emptyDraft()), photoUrl, photoHash, receiptDate: '', receiptTime: '' }
    setTouched(true)
    setDrafts((ds) => (empty ? ds.map((d) => (d.key === empty.key ? target : d)) : [...ds, target]))
    toast('Foto struk contoh ditambahkan tanpa data. Tekan Baca otomatis.')
  }

  const missingPhoto = drafts.findIndex((d) => !d.photoUrl)
  const photoCheck: FormCheck = {
    rule: 'PHOTO',
    ok: missingPhoto < 0 && !drafts.some((d) => d.processing),
    message: missingPhoto < 0 ? 'Foto struk lengkap' : drafts.length > 1 ? `Tambahkan foto untuk struk ${missingPhoto + 1}.` : 'Tambahkan foto struk.',
  }
  const allChecks: FormCheck[] = [photoCheck, ...checks]
  const fresh = debouncedKey === JSON.stringify(inputs) && !checking
  const allOk = checks.length > 0 && allChecks.every((c) => c.ok) && fresh
  const pct = Math.min(100, Math.round((total / rules.minSpend) * 100))

  const submit = async () => {
    setBusy(true)
    try {
      await beforeSubmit?.()
      const res = await api.submitReceipts(order.id, drafts.map(toInput))
      if (res.ok) {
        toast.success('Struk terkirim. Panitia sedang memverifikasi.')
        onSubmitted()
      } else {
        setResult({ key: debouncedKey, checks: res.checks, total: res.total })
        toast.error('Masih ada syarat struk yang belum terpenuhi. Cek daftar di bawah.')
      }
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {revision.length > 0 && (
        <div role="alert" className="rounded-xl border border-status-warn/50 bg-status-warn/12 p-3 text-sm">
          <p className="font-bold text-[#7a5600]">Panitia minta revisi struk</p>
          <p className="mt-0.5">{revision[0].reason ?? 'Periksa lagi data struk kamu.'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Perbaiki data di bawah, lalu kirim ulang.</p>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Belanja minimal <strong className="text-foreground">{rupiahPlain(rules.minSpend)}</strong> di tenant SUMMABA, struk {rules.sameDayRequired ? 'hari ini ' : ''}sebelum jam{' '}
        {rules.cutoffTime.replace(':', '.')}. Boleh gabung maksimal {rules.maxReceiptsCombined} struk.
      </p>

      <Button type="button" variant="outline" className="h-12 w-full border-dashed border-brand/50 bg-brand-soft text-brand hover:bg-brand-soft/70" onClick={() => void fillSample()} disabled={disabled}>
        <Sparkles className="size-4" /> Pakai struk contoh
      </Button>
      <button
        type="button"
        onClick={() => void samplePhotoOnly()}
        disabled={disabled}
        className="-mt-2 flex min-h-9 w-full items-center justify-center gap-1.5 text-xs font-semibold text-brand underline-offset-2 hover:underline disabled:opacity-50"
      >
        <ScanText className="size-4" aria-hidden /> Atau coba baca otomatis dari foto struk contoh
      </button>

      <ol className="space-y-3">
        {drafts.map((d, i) => {
          const f = `${uid}-${d.key}`
          return (
            <li key={d.key} className="rounded-xl border bg-background p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-sm font-bold">
                  <ReceiptText className="size-4 text-muted-foreground" aria-hidden /> Struk {i + 1}
                </p>
                {drafts.length > 1 && (
                  <Button type="button" variant="ghost" className="h-11 text-muted-foreground" onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))} aria-label={`Hapus struk ${i + 1}`}>
                    <Trash2 /> Hapus
                  </Button>
                )}
              </div>

              <div className="flex gap-3">
                <label
                  className={cn(
                    'relative flex h-28 w-22 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border-2 border-dashed text-center text-[0.7rem] font-semibold text-muted-foreground hover:border-brand/60 focus-within:ring-3 focus-within:ring-ring/50',
                    d.photoUrl && 'border-solid border-border',
                  )}
                >
                  {d.processing ? (
                    <LoaderCircle className="size-6 animate-spin" aria-hidden />
                  ) : d.photoUrl ? (
                    <>
                      <img src={d.photoUrl} alt={`Foto struk ${i + 1}`} className="absolute inset-0 size-full object-cover object-top" />
                      <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-0.5 text-white">Ganti foto</span>
                    </>
                  ) : (
                    <>
                      <Camera className="size-6" aria-hidden />
                      Foto struk
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    aria-label={`Foto struk ${i + 1}`}
                    disabled={disabled}
                    onChange={(e) => {
                      void onPhoto(d.key, e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                </label>

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="space-y-1">
                    <Label htmlFor={`${f}-tenant`} className="text-xs">
                      Tenant
                    </Label>
                    <select
                      id={`${f}-tenant`}
                      value={d.tenantId}
                      onChange={(e) => update(d.key, { tenantId: e.target.value })}
                      disabled={disabled}
                      className="h-11 w-full rounded-lg border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <option value="">Pilih tenant…</option>
                      {tenants.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {rules.excludedTenantIds.includes(t.id) ? ' (tidak berlaku)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${f}-no`} className="text-xs">
                      Nomor struk
                    </Label>
                    <Input
                      id={`${f}-no`}
                      value={d.receiptNo}
                      onChange={(e) => update(d.key, { receiptNo: e.target.value })}
                      placeholder="mis. INV123456"
                      className="h-11 uppercase placeholder:normal-case"
                      autoCapitalize="characters"
                      disabled={disabled}
                    />
                  </div>
                </div>
              </div>

              {d.photoUrl && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 h-10 w-full border-dashed text-sm"
                  onClick={() => void readPhoto(d.key)}
                  disabled={disabled || d.reading != null}
                >
                  {d.reading != null ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ScanText className="size-4" aria-hidden />}
                  {d.reading != null ? `Membaca foto… ${Math.round((d.reading ?? 0) * 100)}%` : 'Baca otomatis dari foto (beta)'}
                </Button>
              )}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="col-span-2 space-y-1">
                  <Label htmlFor={`${f}-amt`} className="text-xs">
                    Nominal
                  </Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">Rp</span>
                    <Input
                      id={`${f}-amt`}
                      inputMode="numeric"
                      value={d.amount ? new Intl.NumberFormat('id-ID').format(Number(d.amount)) : ''}
                      onChange={(e) => update(d.key, { amount: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                      placeholder="0"
                      className="h-11 pl-9 text-base font-semibold tabular-nums"
                      disabled={disabled}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${f}-date`} className="text-xs">
                    Tanggal
                  </Label>
                  <Input id={`${f}-date`} type="date" value={d.receiptDate} onChange={(e) => update(d.key, { receiptDate: e.target.value })} className="h-11 px-2 text-sm" disabled={disabled} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${f}-time`} className="text-xs">
                    Jam
                  </Label>
                  <Input id={`${f}-time`} type="time" value={d.receiptTime} onChange={(e) => update(d.key, { receiptTime: e.target.value })} className="h-11 px-2 text-sm" disabled={disabled} />
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      {drafts.length < rules.maxReceiptsCombined && (
        <Button type="button" variant="outline" className="h-11 w-full" onClick={() => setDrafts((ds) => [...ds, emptyDraft()])} disabled={disabled}>
          <Plus /> Tambah struk ({drafts.length}/{rules.maxReceiptsCombined})
        </Button>
      )}

      <section className="rounded-xl border bg-card p-3" aria-label="Cek syarat struk" aria-live="polite">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-bold">Cek syarat otomatis</p>
          {checking && <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-label="Mengecek" />}
        </div>
        <div className="mt-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Total struk</span>
            <span>
              <strong className="text-xl tabular-nums">{rupiahPlain(total)}</strong>
              <span className="text-xs text-muted-foreground"> / min {rupiahPlain(rules.minSpend)}</span>
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className={cn('h-full rounded-full transition-all', pct >= 100 ? 'bg-status-valid' : 'bg-status-warn')} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <ul className="mt-3 space-y-1.5">
          {allChecks.map((c, idx) => {
            const pending = !c.ok && !touched
            return (
              <li key={`${c.rule}-${idx}`} className="flex items-start gap-2 text-sm">
                {c.ok && c.warning ? (
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[#b07d00]" aria-label="Perhatian" />
                ) : c.ok ? (
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-valid" aria-label="Terpenuhi" />
                ) : pending ? (
                  <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Belum diisi" />
                ) : (
                  <CircleX className="mt-0.5 size-4 shrink-0 text-status-invalid" aria-label="Belum terpenuhi" />
                )}
                <span className={cn(!c.ok && !pending && 'text-[#a11b1b]', pending && 'text-muted-foreground')}>{c.message}</span>
              </li>
            )
          })}
        </ul>
      </section>

      <Button type="button" className="h-14 w-full text-base" disabled={!allOk || busy || disabled} onClick={() => void submit()}>
        {busy ? <LoaderCircle className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
        Kirim struk untuk diverifikasi
      </Button>
      {!allOk && touched && fresh && <p className="-mt-2 text-center text-xs text-muted-foreground">Tombol aktif setelah semua syarat di atas tercentang.</p>}
    </div>
  )
}
