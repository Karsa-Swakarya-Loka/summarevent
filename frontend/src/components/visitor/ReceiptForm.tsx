import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { Camera, CircleCheck, CircleDashed, CircleX, FlaskConical, ImagePlus, LoaderCircle, Plus, ScanText, Sparkles, Trash2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import type { OrderDetail, ReceiptInput, RuleCheck } from '@/api/contract'
import { dummyReceiptSvg, randomReceiptNo } from '@/domain/dummyReceipt'
import { sha256Hex } from '@/domain/qr'
import type { ReceiptRules } from '@/domain/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { errorMessage } from '@/hooks/useLive'
import { shrinkPhoto } from '@/lib/image'
import { rupiahPlain, wibDate, wibTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BottomBar, SectionLabel } from './Common'
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
 * Tukar Struk form (PV-09): photo + tenant + receipt number + amount + date/time per receipt, a meter toward the minimum
 * spend (R3), a live checklist of every rule, and two demo helpers for judges without a SUMMABA receipt at hand. It
 * ends the screen: its send button sits in the bottom bar, so render it as the last block of a page.
 */
export function ReceiptForm({
  detail,
  onSubmitted,
  beforeSubmit,
  disabled = false,
  children,
}: {
  detail: OrderDetail
  onSubmitted: () => void
  beforeSubmit?: () => Promise<void>
  disabled?: boolean
  /** shown after the checklist, above the send button */
  children?: ReactNode
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

  if (!rules) return <p className="px-4 text-sm text-muted-foreground">Kategori ini tidak memakai struk.</p>

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
      const [photoUrl, photoHash] = await Promise.all([shrinkPhoto(file), file.arrayBuffer().then((b) => sha256Hex(b))])
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
    toast('Foto struk contoh ditambahkan. Tekan Baca otomatis dari foto.')
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
        toast.error('Masih ada syarat struk yang belum terpenuhi.')
      }
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  // the meter tells how far the total is; the checklist names the minimum once, so it counts the same rules as the bar
  const listed = allChecks.map((c) => (c.rule === 'R3' ? { ...c, message: `Total belanja minimal ${rupiahPlain(rules.minSpend)}` } : c))
  const passed = allChecks.filter((c) => c.ok).length
  const short = Math.max(0, rules.minSpend - total)
  const chips = ['Tenant SUMMABA', rules.sameDayRequired ? 'Struk hari ini' : null, `Sebelum ${rules.cutoffTime.replace(':', '.')}`, `Maks ${rules.maxReceiptsCombined} struk`].filter(
    (c): c is string => !!c,
  )

  return (
    <>
      <div className="flex-1 space-y-5 px-4 pb-8 lg:px-0">
        {revision.length > 0 && (
          <div role="alert" className="animate-rise rounded-[1.4rem] bg-[#ffe7a3] p-4 text-sm">
            <p className="font-bold">Panitia minta struk diperbaiki</p>
            <p className="mt-0.5">{revision[0].reason ?? 'Periksa lagi data struk kamu.'}</p>
          </div>
        )}

        {/* how far the receipts are from the minimum spend, the rule that matters most, as one big number */}
        <section aria-labelledby={`${uid}-meter`} className="relative animate-rise overflow-hidden rounded-[1.4rem] bg-[#ffe7a3] p-4">
          <div className="seat-dots pointer-events-none absolute inset-0 text-ink/[0.07]" aria-hidden />
          <div className="relative">
            <div className="flex items-baseline justify-between gap-2 text-xs font-semibold text-ink/70">
              <h2 id={`${uid}-meter`}>Total struk</h2>
              <span>Min {rupiahPlain(rules.minSpend)}</span>
            </div>
            <p className="mt-1 font-poster text-[2.5rem] leading-none tabular-nums">{rupiahPlain(total)}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/12" aria-hidden>
              <div className={cn('h-full rounded-full transition-[width] duration-500 ease-(--ease-soft)', pct >= 100 ? 'bg-brand' : 'bg-ink')} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold">
              {short > 0 ? (
                `Kurang ${rupiahPlain(short)}`
              ) : (
                <>
                  <CircleCheck className="size-4 text-brand" aria-hidden /> Cukup untuk ditukar
                </>
              )}
            </p>
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Syarat struk">
              {chips.map((c) => (
                <li key={c} className="rounded-full bg-white/60 px-2.5 py-1 text-xs font-semibold">
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* no SUMMABA receipt at hand: a filled sample, or a sample photo for the automatic reading */}
        <div className="rounded-2xl border border-dashed border-ink/25 p-1.5">
          <p className="flex items-center gap-1.5 px-1.5 pt-1 pb-1.5 text-xs font-semibold text-muted-foreground">
            <FlaskConical className="size-3.5" aria-hidden /> Coba tanpa struk asli
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => void fillSample()}
              disabled={disabled}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-ink/15 bg-card px-2 text-xs font-bold transition hover:bg-muted active:scale-95 disabled:opacity-60"
            >
              <Sparkles className="size-3.5 shrink-0" aria-hidden /> Isi struk contoh
            </button>
            <button
              type="button"
              onClick={() => void samplePhotoOnly()}
              disabled={disabled}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-ink/15 bg-card px-2 text-xs font-bold transition hover:bg-muted active:scale-95 disabled:opacity-60"
            >
              <ScanText className="size-3.5 shrink-0" aria-hidden /> Foto contoh
            </button>
          </div>
        </div>

        <ol className="space-y-3">
          {drafts.map((d, i) => {
            const f = `${uid}-${d.key}`
            return (
              <li key={d.key} className="animate-rise rounded-[1.4rem] bg-card p-3 shadow-xs">
                <div className="mb-2 flex min-h-11 items-center justify-between pl-1">
                  <p className="text-xs font-semibold text-muted-foreground">Struk {i + 1}</p>
                  {drafts.length > 1 && (
                    <Button type="button" variant="ghost" className="h-11 text-muted-foreground" onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))} aria-label={`Hapus struk ${i + 1}`}>
                      <Trash2 /> Hapus
                    </Button>
                  )}
                </div>

                <div className="flex gap-3">
                  <label
                    className={cn(
                      'relative flex h-28 w-22 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border-2 border-dashed text-center text-[0.7rem] font-semibold text-muted-foreground hover:border-ink/50 focus-within:ring-3 focus-within:ring-ring/50',
                      d.photoUrl && 'border-solid border-border',
                    )}
                  >
                    {d.processing ? (
                      <LoaderCircle className="size-6 animate-spin" aria-hidden />
                    ) : d.photoUrl ? (
                      <>
                        <img src={d.photoUrl} alt={`Foto struk ${i + 1}`} className="absolute inset-0 size-full animate-pop object-cover object-top" />
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
                      <Select value={d.tenantId} onValueChange={(v) => update(d.key, { tenantId: v })} disabled={disabled}>
                        <SelectTrigger id={`${f}-tenant`} className="w-full min-w-0 bg-card data-[size=default]:h-11">
                          <SelectValue placeholder="Pilih tenant…" />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {tenants.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                              {rules.excludedTenantIds.includes(t.id) ? ' (tidak berlaku)' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                    className="mt-2 h-11 w-full border-dashed text-sm"
                    onClick={() => void readPhoto(d.key)}
                    disabled={disabled || d.reading != null}
                  >
                    {d.reading != null ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ScanText className="size-4" aria-hidden />}
                    {d.reading != null ? `Membaca foto… ${Math.round((d.reading ?? 0) * 100)}%` : 'Baca otomatis dari foto'}
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
          <Button type="button" variant="outline" className="h-11 w-full bg-card" onClick={() => setDrafts((ds) => [...ds, emptyDraft()])} disabled={disabled}>
            <Plus /> Tambah struk ({drafts.length}/{rules.maxReceiptsCombined})
          </Button>
        )}

        <section aria-labelledby={`${uid}-checks`} aria-live="polite" className="space-y-2.5">
          <SectionLabel id={`${uid}-checks`} right={checking ? <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-label="Mengecek" /> : undefined}>
            Cek syarat
          </SectionLabel>
          <ul className="space-y-2 rounded-[1.4rem] bg-card p-3.5 shadow-xs">
            {listed.map((c, idx) => {
              const pending = !c.ok && !touched
              return (
                <li key={`${c.rule}-${idx}`} className="flex items-start gap-2 text-sm">
                  {c.ok && c.warning ? (
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[#b07d00]" aria-label="Perhatian" />
                  ) : c.ok ? (
                    <CircleCheck className="mt-0.5 size-4 shrink-0 animate-pop text-status-valid" aria-label="Terpenuhi" />
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

        {children}
      </div>

      <BottomBar className="lg:rounded-[1.4rem] lg:bg-card lg:p-4 lg:pl-5 lg:shadow-xs">
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 leading-tight">
            <span className="block text-xs font-semibold text-muted-foreground">Syarat</span>
            <span className="font-bold tabular-nums">{checks.length ? `${passed}/${allChecks.length} terpenuhi` : '…'}</span>
          </p>
          <Button type="button" className="h-14 shrink-0 px-6 text-base" disabled={!allOk || busy || disabled} onClick={() => void submit()}>
            {busy ? <LoaderCircle className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            Kirim struk
          </Button>
        </div>
      </BottomBar>
    </>
  )
}
