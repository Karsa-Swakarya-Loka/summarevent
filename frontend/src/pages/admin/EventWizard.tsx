/**
 * Event wizard (AD-01…AD-04, brief: "Mengatur acara, jenis tiket, harga, kuota,
 * denah kursi, dan periode penjualan"): Info → Kategori → Denah → Sesi → Publish.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ExternalLink, Rocket, Rows3, Save } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/api'
import { LoadError, PageHeader, SectionCard } from '@/components/admin/AdminUi'
import { ShareEventPanel } from '@/components/admin/ShareEvent'
import { StepCategories } from '@/components/admin/wizard/StepCategories'
import { StepInfo } from '@/components/admin/wizard/StepInfo'
import { StepLayout } from '@/components/admin/wizard/StepLayout'
import { StepReview } from '@/components/admin/wizard/StepReview'
import { StepSessions } from '@/components/admin/wizard/StepSessions'
import { distributeRows, emptyForm, fromDraft, seatCategories, STEPS, toDraft, validate, type StepId, type WizardForm } from '@/components/admin/wizard/model'
import { StatusBadge } from '@/components/common/bits'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { EventItem, Tenant, Venue } from '@/domain/types'
import { errorMessage } from '@/hooks/useLive'
import { cn } from '@/lib/utils'

function Stepper({ step, onPick, skipped, issuesByStep }: { step: StepId; onPick: (s: StepId) => void; skipped: Set<StepId>; issuesByStep: Map<StepId, number> }) {
  const current = STEPS.findIndex((s) => s.id === step)
  return (
    <nav aria-label="Langkah pembuatan event" className="mb-6 overflow-x-auto">
      <ol className="flex min-w-max items-center gap-1 sm:gap-2">
        {STEPS.map((s, i) => {
          const active = s.id === step
          const done = i < current && !skipped.has(s.id)
          const disabled = skipped.has(s.id)
          const bad = (issuesByStep.get(s.id) ?? 0) > 0 && i < current
          return (
            <li key={s.id} className="flex items-center gap-1 sm:gap-2">
              <button
                type="button"
                disabled={disabled}
                aria-current={active ? 'step' : undefined}
                onClick={() => onPick(s.id)}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm font-semibold transition focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                  active ? 'bg-brand text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
                )}
              >
                <span
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full text-xs font-bold',
                    active ? 'bg-white text-brand' : done && !bad ? 'bg-brand-soft text-brand' : bad ? 'bg-status-invalid/10 text-status-invalid' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {done && !bad ? <Check className="size-4" aria-hidden /> : i + 1}
                </span>
                {/* on a phone only the current step shows its name; the others keep it for screen readers */}
                <span className={cn(!active && 'sr-only sm:not-sr-only')}>{s.label}</span>
                {disabled && <span className="hidden text-xs font-normal lg:inline">(tidak perlu)</span>}
              </button>
              {i < STEPS.length - 1 && <span className="h-px w-3 bg-border sm:w-6" aria-hidden />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export default function EventWizard() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const editing = !!eventId
  const [venues, setVenues] = useState<Venue[] | null>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [form, setForm] = useState<WizardForm | null>(null)
  const [saved, setSaved] = useState<EventItem | null>(null)
  const [orderCount, setOrderCount] = useState(0)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [step, setStep] = useState<StepId>('info')
  const [attempted, setAttempted] = useState<Set<StepId>>(() => new Set())
  const [saving, setSaving] = useState<null | 'draft' | 'publish'>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [done, setDone] = useState<{ event: EventItem; published: boolean } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [v, t] = await Promise.all([api.admin.venues(), api.admin.tenants()])
        if (!alive) return
        setVenues(v)
        setTenants(t)
        if (eventId) {
          const [{ draft, event }, orders] = await Promise.all([api.admin.getEventDraft(eventId), api.admin.listOrders({ eventId })])
          if (!alive) return
          setSaved(event)
          setOrderCount(orders.length)
          setForm(fromDraft(draft).form)
        } else {
          setSaved(null)
          setOrderCount(0)
          setForm(emptyForm(v))
        }
      } catch (e) {
        if (alive) setLoadError(e)
      }
    })()
    return () => {
      alive = false
    }
  }, [eventId, reloadKey])

  const issues = useMemo(() => (form && venues ? validate(form, venues) : []), [form, venues])
  const errors = issues.filter((i) => !i.warning)
  const issuesByStep = useMemo(() => {
    const m = new Map<StepId, number>()
    for (const i of errors) m.set(i.step, (m.get(i.step) ?? 0) + 1)
    return m
  }, [errors])
  const err = (field: string) => issues.find((i) => i.field === field && attempted.has(i.step) && (!i.warning || field === 'capacity'))?.message
  const layoutLocked = editing && orderCount > 0
  const skipped = new Set<StepId>(form?.seatingMode === 'GENERAL' ? ['denah'] : [])
  const order = STEPS.map((s) => s.id).filter((s) => !skipped.has(s))
  const idx = order.indexOf(step)

  const update = (fn: (f: WizardForm) => WizardForm) => setForm((f) => (f ? fn(f) : f))

  const goTo = (s: StepId) => {
    if (skipped.has(s)) return
    if (s === 'denah' && form && !form.layout.ranges.length && seatCategories(form).length) {
      update((f) => ({ ...f, layout: { ...f.layout, ranges: distributeRows(f) } }))
    }
    if (s !== 'publish') setAttempted((a) => (a.has(s) ? a : new Set(a).add(s)))
    setStep(s)
    setServerError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const next = () => {
    setAttempted((a) => new Set(a).add(step))
    const own = errors.filter((e) => e.step === step)
    if (own.length) {
      toast.error(own.length === 1 ? own[0].message : `Masih ada ${own.length} isian yang perlu diperbaiki di langkah ini.`)
      setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 50)
      return
    }
    const target = order[idx + 1]
    if (target === 'publish') setAttempted(new Set(STEPS.map((s) => s.id)))
    if (target) goTo(target)
  }

  const save = async (publish: boolean) => {
    if (!form) return
    setAttempted(new Set(STEPS.map((s) => s.id)))
    if (errors.length) {
      toast.error('Masih ada data yang belum lengkap. Lihat daftar di atas.')
      return
    }
    setSaving(publish ? 'publish' : 'draft')
    setServerError(null)
    try {
      const draft = toDraft(form)
      let ev = saved ? await api.admin.updateEvent(saved.id, draft) : await api.admin.createEvent(draft)
      if (publish && ev.status === 'DRAFT') ev = await api.admin.publishEvent(ev.id)
      setSaved(ev)
      // re-sync ids of new categories / sessions so the next save updates instead of re-creating
      const fresh = await api.admin.getEventDraft(ev.id)
      setForm(fromDraft(fresh.draft).form)
      setOrderCount((await api.admin.listOrders({ eventId: ev.id })).length)
      if (ev.status === 'PUBLISHED') {
        setDone({ event: ev, published: publish })
        toast.success(publish ? 'Event dipublikasikan. Bagikan link & QR-nya.' : 'Perubahan disimpan.')
        window.scrollTo({ top: 0 })
      } else {
        toast.success('Draft disimpan. Belum terlihat oleh pengunjung.')
      }
    } catch (e) {
      const msg = errorMessage(e)
      setServerError(msg)
      toast.error(msg)
      if (e instanceof ApiError && e.code === 'LOCKED_LAYOUT' && saved) {
        // put the stored layout back so the other changes can still be saved
        setOrderCount((n) => Math.max(1, n))
        try {
          const fresh = fromDraft((await api.admin.getEventDraft(saved.id)).draft).form
          update((f) => ({ ...f, seatingMode: fresh.seatingMode, layout: fresh.layout }))
          setServerError(`${msg} Denah sudah dikembalikan ke versi tersimpan; tekan simpan lagi untuk menyimpan perubahan lainnya.`)
        } catch {
          /* keep the original message */
        }
      }
    } finally {
      setSaving(null)
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title={editing ? 'Edit event' : 'Buat event'} />
        <LoadError
          error={loadError}
          onRetry={() => {
            setLoadError(null)
            setReloadKey((k) => k + 1)
          }}
        />
        <Button variant="link" asChild className="mt-2 px-0">
          <Link to="/admin/events">← Kembali ke daftar event</Link>
        </Button>
      </div>
    )
  }

  if (!form || !venues) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-4" aria-busy="true">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    )
  }

  if (done) {
    const ev = done.event
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <SectionCard>
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            <CheckCircle2 className="size-12 text-status-valid" aria-hidden />
            <h1 className="text-2xl font-extrabold">{done.published ? 'Event dipublikasikan!' : 'Perubahan disimpan'}</h1>
            <p className="max-w-md text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{ev.title}</span> sudah bisa dibuka pengunjung. Tempel QR di poster atau bagikan link-nya.
            </p>
          </div>
        </SectionCard>
        <SectionCard title="Link & QR poster">
          <ShareEventPanel event={ev} />
        </SectionCard>
        <div className="flex flex-wrap gap-2">
          <Button size="lg" className="h-11" asChild>
            <a href={`/app/e/${ev.slug}`} target="_blank" rel="noreferrer">
              <ExternalLink /> Lihat di aplikasi pengunjung
            </a>
          </Button>
          <Button size="lg" variant="outline" className="h-11" asChild>
            <Link to={`/admin/live?event=${ev.id}`}>
              <Rows3 /> Pantau kursi live
            </Link>
          </Button>
          <Button size="lg" variant="outline" className="h-11" onClick={() => navigate('/admin/events')}>
            Ke daftar event
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="h-11"
            onClick={() => {
              setDone(null)
              if (!editing) navigate(`/admin/events/${ev.id}/edit`, { replace: true })
            }}
          >
            Lanjut edit
          </Button>
        </div>
      </div>
    )
  }

  const isPublished = saved?.status === 'PUBLISHED' || saved?.status === 'ENDED'
  const stepTitle = STEPS.find((s) => s.id === step)?.label

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/admin/events" className="mb-2 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground pointer-coarse:min-h-11">
        <ArrowLeft className="size-4" /> Daftar event
      </Link>
      <PageHeader
        title={editing ? 'Edit event' : 'Buat event'}
        description={
          <>
            Langkah {idx + 1} dari {order.length}: {stepTitle}.{' '}
            {!editing && 'Isi seperlunya, sisanya sudah diberi nilai umum. Target: kurang dari 5 menit.'}
            {editing && form.title && <span className="font-medium text-foreground">{form.title}</span>}
          </>
        }
        actions={saved && <StatusBadge tone={saved.status === 'DRAFT' ? 'neutral' : 'valid'}>{saved.status === 'DRAFT' ? 'Draft' : 'Dipublikasikan'}</StatusBadge>}
      />
      <Stepper step={step} onPick={goTo} skipped={skipped} issuesByStep={issuesByStep} />

      {step === 'info' && <StepInfo form={form} update={update} err={err} venues={venues} layoutLocked={layoutLocked} />}
      {step === 'kategori' && <StepCategories form={form} update={update} err={err} tenants={tenants} />}
      {step === 'denah' && <StepLayout form={form} update={update} err={err} locked={layoutLocked} />}
      {step === 'sesi' && <StepSessions form={form} update={update} err={err} />}
      {step === 'publish' && <StepReview form={form} venues={venues} issues={issues} goTo={goTo} />}

      {serverError && (
        <div role="alert" className="mt-4 rounded-xl border border-status-invalid/30 bg-status-invalid/5 p-4 text-sm">
          <div className="font-semibold text-[#a11b1b]">Belum tersimpan</div>
          {serverError}
        </div>
      )}

      <div className="mt-6 flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" size="lg" className="h-11" disabled={idx <= 0} onClick={() => goTo(order[idx - 1])}>
          <ArrowLeft /> Kembali
        </Button>
        {step !== 'publish' ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {/* editing: a quick fix (a typo, a price) is saved from any step, no need to walk to the end */}
            {editing && (
              <Button variant="outline" size="lg" className="h-11" disabled={!!saving} onClick={() => void save(false)}>
                <Save /> {saving ? 'Menyimpan…' : isPublished ? 'Simpan perubahan' : 'Simpan draft'}
              </Button>
            )}
            <Button size="lg" className="h-11 px-5 text-base" onClick={next}>
              Lanjut: {STEPS.find((s) => s.id === order[idx + 1])?.label} <ArrowRight />
            </Button>
          </div>
        ) : isPublished ? (
          <Button size="lg" className="h-11 px-5 text-base" disabled={!!saving} onClick={() => void save(false)}>
            <Save /> {saving ? 'Menyimpan…' : 'Simpan perubahan'}
          </Button>
        ) : (
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" size="lg" className="h-11" disabled={!!saving} onClick={() => void save(false)}>
              <Save /> {saving === 'draft' ? 'Menyimpan…' : 'Simpan draft'}
            </Button>
            <Button size="lg" className="h-11 px-5 text-base" disabled={!!saving} onClick={() => void save(true)}>
              <Rocket /> {saving === 'publish' ? 'Mempublikasikan…' : 'Simpan & publish'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
