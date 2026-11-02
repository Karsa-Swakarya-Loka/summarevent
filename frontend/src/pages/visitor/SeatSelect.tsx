import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { BellRing, ChevronRight, FlaskConical, Gift, Hourglass, LoaderCircle, TriangleAlert, Users, WandSparkles, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import type { CategoryAvailability, SeatMapData } from '@/api/contract'
import { BackHeader, Countdown, SundaLabel } from '@/components/common/bits'
import { DoubleBookingButton } from '@/components/common/DoubleBookingInfo'
import { SeatMap } from '@/components/seatmap/SeatMap'
import { CategoryLegend, StatusLegend } from '@/components/seatmap/SeatLegend'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LoginPanel } from '@/components/visitor/LoginPanel'
import { Skeleton } from '@/components/ui/skeleton'
import { BarActions, LoadError, QtyStepper } from '@/components/visitor/Common'
import { continuePath, isPendingOrder, rememberSession, seatRangeLabel, seatsAdjacent, sessionName, sessionWhen } from '@/components/visitor/helpers'
import { useVisitor } from '@/components/visitor/hooks'
import { ORDER_STATUS_LABEL } from '@/domain/labels'
import { saleState, seatLabel } from '@/domain/rules'
import type { Seat, SeatStatus, TicketCategory } from '@/domain/types'
import { errorMessage, useLive, useNow } from '@/hooks/useLive'
import { fmtShortDate, fmtTime, rupiahPlain } from '@/lib/format'
import { cn } from '@/lib/utils'

export default function SeatSelect() {
  const { slug = '', sessionId = '' } = useParams()
  const map = useLive(() => api.getSeatMap(sessionId), [sessionId], { intervalMs: 3000 })

  useEffect(() => {
    if (slug && sessionId) rememberSession(slug, sessionId)
  }, [slug, sessionId])

  if (map.loading && !map.data) {
    return (
      <div>
        <BackHeader to={`/app/e/${slug}`} title="Pilih kursi" />
        <div className="space-y-3 p-4" aria-busy="true" aria-label="Memuat denah">
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-[45vh] rounded-2xl" />
        </div>
      </div>
    )
  }
  if (!map.data) {
    return (
      <div>
        <BackHeader to={`/app/e/${slug}`} title="Pilih kursi" />
        <LoadError error={map.error} onRetry={map.reload} backTo={`/app/e/${slug}`} backLabel="Kembali ke detail event" />
      </div>
    )
  }
  return <SeatPicker data={map.data} slug={slug} sessionId={sessionId} />
}

interface Conflict {
  ids: string[]
  suggestions: string[]
  message: string
}

function naturalSeats(labels: string[]): string {
  if (labels.length === 2) return `${labels[0]} dan ${labels[1]}`
  return seatRangeLabel(labels)
}

function SeatPicker({ data, slug, sessionId }: { data: SeatMapData; slug: string; sessionId: string }) {
  const navigate = useNavigate()
  const { user, refresh } = useVisitor()
  const mine = useLive(() => api.myOrders(), [user?.id])
  const myWaitlist = useLive(() => (user ? api.myWaitlist() : Promise.resolve([])), [user?.id])
  const [askLogin, setAskLogin] = useState(false)
  const [params, setParams] = useSearchParams()

  const { categories, event, session } = data
  const rules = event.rules
  const max = rules.maxSeatsPerOrder
  const hasLayout = !!data.layout && data.seats.length > 0
  const categoryId = params.get('c') ?? (categories.length === 1 ? categories[0].id : null)
  const category = categories.find((c) => c.id === categoryId) ?? null
  const isGeneral = category ? category.quota != null : false

  const [qty, setQty] = useState(2)
  const [selected, setSelected] = useState<string[]>([])
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [ruleError, setRuleError] = useState<string | null>(null)
  const [busy, setBusy] = useState<null | 'hold' | 'suggest' | 'fake' | 'waitlist'>(null)
  const [zoomNonce, setZoomNonce] = useState(0)
  const holdingRef = useRef(false)
  const now = useNow(15_000)

  const seatById = useMemo(() => new Map(data.seats.map((s) => [s.id, s])), [data.seats])
  const ssById = useMemo(() => new Map(data.sessionSeats.map((s) => [s.seatId, s])), [data.sessionSeats])
  const labelOf = (id: string) => {
    const s = seatById.get(id)
    return s ? seatLabel(s) : '?'
  }

  const availability = useMemo<CategoryAvailability[]>(
    () =>
      categories.map((c) => {
        if (c.quota != null) {
          const q = data.quotas.find((x) => x.categoryId === c.id)
          const total = q?.quota ?? c.quota
          return { categoryId: c.id, total, available: Math.max(0, total - (q?.filled ?? 0)), held: 0, sold: 0 }
        }
        let total = 0
        let available = 0
        let held = 0
        let sold = 0
        for (const ss of data.sessionSeats) {
          if (ss.categoryId !== c.id || ss.status === 'BLOCKED') continue
          total++
          if (ss.status === 'AVAILABLE') available++
          else if (ss.status === 'HELD') held++
          else if (ss.status === 'SOLD') sold++
        }
        return { categoryId: c.id, total, available, held, sold }
      }),
    [categories, data.quotas, data.sessionSeats],
  )
  const catAvail = category ? availability.find((a) => a.categoryId === category.id) : undefined
  // PV-14: a sold-out category offers the waiting list instead of "Hayu ngiring"
  const soldOut = !!category && !!catAvail && catAvail.total > 0 && catAvail.available === 0
  const waitingCount = category ? (data.waitlist.find((w) => w.categoryId === category.id)?.waiting ?? 0) : 0
  const bonusLeft = category ? (data.bonus.find((b) => b.categoryId === category.id)?.left ?? 0) : 0
  const myEntry = (myWaitlist.data ?? []).find((w) => w.sessionId === sessionId && w.categoryId === category?.id && w.status === 'WAITING')

  const pending = (mine.data ?? []).find((d) => d.order.sessionId === sessionId && isPendingOrder(d.order) && !d.order.simulated)

  // A selected seat was taken by someone else in a refresh → release it and tell the visitor.
  useEffect(() => {
    if (holdingRef.current) return
    const lost = selected.filter((id) => ssById.get(id)?.status !== 'AVAILABLE')
    if (!lost.length) return
    setSelected((s) => s.filter((id) => !lost.includes(id)))
    // seats held by your own order (e.g. from another tab) are not "taken by someone else"
    const theirs = lost.filter((id) => !ssById.get(id)?.orderId)
    if (theirs.length) toast.warning(`${naturalSeats(theirs.map(labelOf))} baru saja dipesan orang lain, jadi kami lepas dari pilihanmu. Pilih kursi lain, ya.`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ssById])

  const sale = category ? saleState(category, session, now) : null
  const ended = new Date(session.endAt) <= now
  const closedReason = ended
    ? 'Sesi ini sudah selesai.'
    : sale && !sale.open
      ? sale.reason === 'NOT_YET'
        ? `Penjualan ${category?.name} dibuka ${fmtShortDate(sale.at.toISOString())} jam ${fmtTime(sale.at.toISOString())}.`
        : `Penjualan ${category?.name} untuk sesi ini sudah ditutup.`
      : null

  const generalMax = soldOut ? max : Math.max(1, Math.min(max, catAvail?.available ?? max))

  const pickCategory = (id: string) => {
    if (id === categoryId) {
      setZoomNonce((n) => n + 1)
      return
    }
    setSelected([])
    setConflict(null)
    setRuleError(null)
    const c = categories.find((x) => x.id === id)
    if (c?.quota != null) {
      const av = availability.find((a) => a.categoryId === id)?.available ?? max
      setQty((q) => Math.max(1, Math.min(q, max, av)))
    }
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        n.set('c', id)
        return n
      },
      { replace: true },
    )
  }

  const changeQty = (n: number) => {
    setQty(n)
    setRuleError(null)
    if (selected.length > n) setSelected((s) => s.slice(0, n))
  }

  const onSeatClick = (seat: Seat, status: SeatStatus, cat: TicketCategory | null) => {
    if (!cat || cat.quota != null) return
    setRuleError(null)
    if (selected.includes(seat.id)) {
      setSelected((s) => s.filter((x) => x !== seat.id))
      return
    }
    if (status !== 'AVAILABLE') return
    if (cat.id !== categoryId) {
      pickCategory(cat.id)
      setSelected([seat.id])
      return
    }
    if (selected.length >= qty) {
      toast.info(
        qty >= max
          ? `Maksimal ${max} kursi per pesanan. Ketuk kursi pilihanmu dulu untuk melepasnya.`
          : `Kamu sudah memilih ${qty} kursi untuk ${qty} orang. Tambah “Jumlah orang” dulu, atau ketuk kursi pilihanmu untuk melepasnya.`,
      )
      return
    }
    setConflict(null)
    setSelected((s) => [...s, seat.id])
  }

  const autoPick = async () => {
    if (!category) return
    setBusy('suggest')
    setRuleError(null)
    try {
      const ids = await api.suggestSeats(sessionId, category.id, qty)
      if (ids.length < qty) {
        toast.error(`Sisa kursi ${category.name} tidak cukup untuk ${qty} orang. Kurangi jumlah orang atau pilih kategori lain.`)
        return
      }
      setConflict(null)
      setSelected(ids)
      setZoomNonce((n) => n + 1)
      const seats = ids.map((id) => seatById.get(id)).filter((s): s is Seat => !!s)
      if (!seatsAdjacent(seats)) toast.info(`Tidak ada ${qty} kursi berdampingan di ${category.name}. Ini kursi terdekat yang masih kosong.`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const hold = async () => {
    if (!category) return
    setBusy('hold')
    setRuleError(null)
    holdingRef.current = true
    try {
      const res = await api.createHold(sessionId, isGeneral ? { categoryId: category.id, qty } : { categoryId: category.id, seatIds: selected })
      if (res.ok) {
        navigate(`/app/checkout/${res.order.id}`)
        return
      }
      holdingRef.current = false
      if (res.reason === 'CONFLICT') {
        setSelected((s) => s.filter((id) => !res.conflictSeatIds.includes(id)))
        setConflict({ ids: res.conflictSeatIds, suggestions: res.suggestions, message: res.message })
      } else {
        setRuleError(res.message)
      }
    } catch (e) {
      holdingRef.current = false
      setRuleError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const moveToSuggested = () => {
    if (!conflict) return
    const ok = conflict.suggestions.filter((id) => ssById.get(id)?.status === 'AVAILABLE').slice(0, max)
    setSelected(ok)
    setConflict(null)
    if (ok.length > qty) setQty(ok.length)
    setZoomNonce((n) => n + 1)
  }

  const fakeBuyer = async () => {
    setBusy('fake')
    try {
      const res = await api.demo.fakeBuyer(sessionId, category && category.quota == null ? category.id : undefined)
      toast(`Pembeli lain (simulasi) sedang memesan ${naturalSeats(res.seatLabels)}.`, {
        description: 'Kursinya jadi “Sedang dipesan” selama 60 detik, lalu kembali Tersedia.',
      })
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  /**
   * Demo for judges on one device: the simulated buyer presses "Hayu ngiring" for your first
   * seat a split second before you do, so the real conflict path (message + nearest seats) shows.
   */
  const raceDemo = async () => {
    if (!category || !selected.length) return
    setBusy('fake')
    holdingRef.current = true
    try {
      const res = await api.demo.fakeBuyer(sessionId, category.id, selected.slice(0, 1))
      toast(`Pembeli lain (simulasi) menekan Hayu ngiring untuk ${naturalSeats(res.seatLabels)} sepersekian detik lebih dulu.`)
    } catch (e) {
      holdingRef.current = false
      toast.error(errorMessage(e))
      setBusy(null)
      return
    }
    await hold()
  }

  const joinWaitlist = async () => {
    if (!category) return
    setBusy('waitlist')
    try {
      const w = await api.joinWaitlist(sessionId, category.id, qty)
      toast.success(`Kamu masuk daftar tunggu ${category.name}, urutan ke-${w.position}.`, { description: 'Kami kabari lewat WhatsApp (simulasi) begitu ada tempat lepas.' })
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const leaveWaitlist = async (id: string) => {
    setBusy('waitlist')
    try {
      await api.leaveWaitlist(id)
      toast('Kamu keluar dari daftar tunggu.')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const conflictSet = useMemo(() => new Set(conflict?.ids ?? []), [conflict])
  const suggestionIds = (conflict?.suggestions ?? []).filter((id) => ssById.get(id)?.status === 'AVAILABLE')
  const suggestedSet = useMemo(() => new Set(suggestionIds), [suggestionIds.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- summary for the bottom sheet
  const labels = selected.map(labelOf)
  const count = isGeneral ? qty : selected.length
  const total = category ? category.price * count : 0
  const totalText = !category ? '' : category.accessMethod === 'FREE' ? 'Gratis' : rupiahPlain(total)
  const holdMin = category?.accessMethod === 'RECEIPT' ? rules.receiptHoldMin : rules.paymentHoldMin
  const summary = soldOut && category
    ? `${category.name} habis untuk sesi ini`
    : !category
    ? 'Pilih kategori dulu'
    : isGeneral
      ? `${qty} orang · ${category.name}`
      : count
        ? `${count} kursi · ${seatRangeLabel(labels)} · ${category.name}`
        : 'Belum ada kursi dipilih'
  const subline = soldOut && !closedReason
    ? myEntry
      ? `Kamu di daftar tunggu, urutan ke-${myEntry.position} untuk ${myEntry.qty} orang. Kami kabari lewat WhatsApp (simulasi).`
      : `${waitingCount ? `${waitingCount} orang sudah menunggu. ` : ''}Ikut daftar tunggu, kami kabari lewat WhatsApp kalau ada tempat lepas.`
    : !category
    ? 'Ketuk kategori di atas, atau langsung ketuk kursi di denah.'
    : closedReason
      ? closedReason
      : isGeneral
        ? `Tanpa nomor kursi · ditahan ${holdMin} menit setelah kamu tekan Hayu ngiring`
        : count
          ? `Kursi ditahan ${holdMin} menit setelah kamu tekan Hayu ngiring`
          : 'Ketuk kursi di denah, atau pakai “Pilihkan kursi berdampingan”.'
  const generalShort = isGeneral && catAvail && !soldOut ? catAvail.available < qty : false
  const canHold = !!category && !closedReason && !pending && (isGeneral ? !generalShort && qty >= 1 : selected.length > 0) && busy !== 'hold'

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader
        to={`/app/e/${slug}`}
        title={
          <div className="min-w-0 leading-tight">
            <div className="truncate">{event.title}</div>
            <div className="truncate text-xs font-normal text-muted-foreground">
              {sessionName(session)} · {sessionWhen(session)}
            </div>
          </div>
        }
      />

      <div className="space-y-3 px-4 pt-3">
        {pending && (
          <Link to={continuePath(pending)} className="flex items-center gap-3 rounded-xl border border-status-warn/50 bg-status-warn/12 p-3">
            <Hourglass className="size-5 shrink-0 text-[#7a5600]" aria-hidden />
            <span className="min-w-0 flex-1 text-sm">
              <span className="block font-bold">Kamu masih punya pesanan di sesi ini</span>
              <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                {ORDER_STATUS_LABEL[pending.order.status]} · <Countdown to={pending.order.holdExpiresAt} className="text-xs" />
              </span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        )}

        <CategoryLegend
          categories={categories}
          availability={availability}
          activeId={categoryId}
          onPick={pickCategory}
          className={cn(categories.length > 1 && 'grid-cols-2', '[&_button]:min-h-15 [&_button]:p-2.5')}
        />

        {category && !isGeneral && hasLayout && (
          <div className="flex items-stretch gap-2">
            <QtyStepper value={qty} max={max} onChange={changeQty} label="Jumlah orang" />
            <Button variant="outline" className="h-auto min-h-12 flex-1 gap-2 px-3 text-left text-sm leading-tight whitespace-normal" onClick={() => void autoPick()} disabled={busy === 'suggest' || !!closedReason}>
              {busy === 'suggest' ? <LoaderCircle className="size-5 animate-spin" /> : <WandSparkles className="size-5 text-brand" />}
              <span>
                Pilihkan {qty} kursi <span className="whitespace-nowrap">berdampingan</span>
              </span>
            </Button>
          </div>
        )}
      </div>

      {hasLayout && !isGeneral ? (
        <>
          <div className="relative mx-4 mt-3 min-h-[17rem] flex-1">
            <SeatMap
              data={data}
              selected={selectedSet}
              suggested={suggestedSet}
              conflicts={conflictSet}
              myOrderId={pending?.order.id ?? null}
              activeCategoryId={category?.id ?? null}
              onSeatClick={onSeatClick}
              zoomKey={`${category?.id ?? 'all'}-${zoomNonce}`}
              className="absolute inset-0"
            />
            {selected.length > 0 && !pending && !closedReason ? (
              <button
                type="button"
                onClick={() => void raceDemo()}
                disabled={!!busy}
                className="absolute bottom-2 left-2 z-10 inline-flex h-11 items-center gap-1.5 rounded-full border border-dashed border-ink/30 bg-card/95 px-3 text-xs font-semibold shadow-sm backdrop-blur hover:bg-muted disabled:opacity-60"
              >
                {busy === 'fake' ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Zap className="size-4" aria-hidden />}
                Uji rebutan kursi
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void fakeBuyer()}
                disabled={!!busy}
                className="absolute bottom-2 left-2 z-10 inline-flex h-11 items-center gap-1.5 rounded-full border border-dashed border-ink/30 bg-card/95 px-3 text-xs font-semibold shadow-sm backdrop-blur hover:bg-muted disabled:opacity-60"
              >
                {busy === 'fake' ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <FlaskConical className="size-4" aria-hidden />}
                Simulasikan pembeli lain
              </button>
            )}
          </div>
          <StatusLegend className="gap-x-3 gap-y-1.5 px-4 pt-2.5 text-[0.72rem]" showPriority />
          <DoubleBookingButton className="mx-4 self-start" />
        </>
      ) : category && isGeneral ? (
        <GeneralPanel category={category} available={catAvail?.available ?? 0} total={catAvail?.total ?? 0} qty={qty} max={generalMax} onQty={changeQty} disabled={!!closedReason} />
      ) : !hasLayout ? (
        <p className="mx-4 mt-4 rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Event ini tanpa nomor kursi. Pilih kategori di atas.</p>
      ) : null}

      {!(hasLayout && !isGeneral) && <div className="flex-1" />}

      <div className="sticky bottom-0 z-20 mt-3 border-t bg-card/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-10px_30px_-18px_rgb(0_0_0/0.35)] backdrop-blur">
        {conflict && (
          <div role="alert" className="mb-3 rounded-xl border border-status-invalid/35 bg-status-invalid/8 p-3">
            <p className="flex items-start gap-2 text-sm font-bold text-[#a11b1b]">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {conflict.message}
            </p>
            {suggestionIds.length ? (
              <>
                <p className="mt-1 pl-6 text-sm">{naturalSeats(suggestionIds.map(labelOf))} masih kosong, mau pindah ke situ?</p>
                <Button variant="outline" className="mt-2 h-11 w-full border-ink/20 bg-card font-semibold" onClick={moveToSuggested}>
                  Pindah ke kursi saran
                </Button>
              </>
            ) : (
              <p className="mt-1 pl-6 text-sm">Kursi lain di kategori ini sudah habis. Coba kategori lain.</p>
            )}
          </div>
        )}
        {ruleError && (
          <p role="alert" className="mb-2 rounded-lg bg-status-invalid/8 px-3 py-2 text-sm text-[#a11b1b]">
            {ruleError}
          </p>
        )}
        {generalShort && (
          <p role="alert" className="mb-2 rounded-lg bg-status-warn/15 px-3 py-2 text-sm text-[#7a5600]">
            Sisa kuota {category?.name} tinggal {catAvail?.available}. Kurangi jumlah orang.
          </p>
        )}
        {category?.bonusDesc && !soldOut && bonusLeft > 0 && (
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-brand">
            <Gift className="size-4 shrink-0" aria-hidden /> Bonus {category.bonusDesc} untuk tiket pertama · sisa {bonusLeft}
          </p>
        )}
        <div className="flex items-end justify-between gap-3" aria-live="polite">
          <div className="min-w-0">
            <p className={cn('font-bold', count ? 'text-base' : 'text-sm')}>
              {category && <span className="mr-1.5 inline-block size-3 rounded-[4px] align-middle" style={{ background: category.color }} aria-hidden />}
              {summary}
            </p>
            <p className={cn('text-xs', closedReason ? 'font-semibold text-[#a11b1b]' : 'text-muted-foreground')}>{subline}</p>
          </div>
          {category && count > 0 && <p className="shrink-0 text-2xl font-extrabold tabular-nums">{totalText}</p>}
        </div>
        <BarActions className="mt-3">
          {pending ? (
            <Button asChild className="h-14 flex-1 text-base">
              <Link to={continuePath(pending)}>Lanjutkan pesananmu</Link>
            </Button>
          ) : soldOut && !closedReason ? (
            myEntry ? (
              <Button variant="outline" className="h-14 flex-1 text-base" onClick={() => void leaveWaitlist(myEntry.id)} disabled={busy === 'waitlist'}>
                {busy === 'waitlist' && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
                Keluar dari daftar tunggu
              </Button>
            ) : (
              <Button className="h-14 flex-1 gap-2 text-base" onClick={() => (user ? void joinWaitlist() : setAskLogin(true))} disabled={busy === 'waitlist'}>
                {busy === 'waitlist' ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <BellRing className="size-5" aria-hidden />}
                Masuk daftar tunggu ({qty} orang)
              </Button>
            )
          ) : (
            <Button className="h-14 flex-1 gap-2 text-base" disabled={!canHold} onClick={() => void hold()}>
              {busy === 'hold' && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
              <SundaLabel k="join" />
            </Button>
          )}
        </BarActions>
      </div>

      <Dialog open={askLogin} onOpenChange={setAskLogin}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Masuk untuk ikut daftar tunggu</DialogTitle>
            <DialogDescription>Kabar tempat kosong dikirim ke nomor HP kamu lewat WhatsApp (simulasi).</DialogDescription>
          </DialogHeader>
          <LoginPanel
            onSuccess={() => {
              refresh()
              setAskLogin(false)
              setTimeout(() => void joinWaitlist(), 50)
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function GeneralPanel({
  category,
  available,
  total,
  qty,
  max,
  onQty,
  disabled,
}: {
  category: TicketCategory
  available: number
  total: number
  qty: number
  max: number
  onQty: (n: number) => void
  disabled: boolean
}) {
  return (
    <section className="mx-4 mt-3 rounded-2xl border bg-card p-4" aria-label={`Kuota ${category.name}`}>
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: category.color }}>
          <Users className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-bold">{category.name}</p>
          <p className="text-xs text-muted-foreground">{category.description ?? 'Tanpa nomor kursi'}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Sisa kuota</p>
          <p className="leading-none">
            <span className={cn('text-4xl font-extrabold tabular-nums', available === 0 && 'text-status-invalid')}>{available === 0 ? 'Habis' : available}</span>
            {available > 0 && <span className="text-sm font-semibold text-muted-foreground"> / {total} tempat</span>}
          </p>
        </div>
        <div className="text-right">
          <p className="mb-1 text-xs text-muted-foreground">Jumlah orang</p>
          <QtyStepper value={qty} max={max} onChange={onQty} label="Jumlah orang" className={cn(disabled && 'pointer-events-none opacity-50')} />
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Tanpa nomor kursi: datang lebih awal untuk posisi terbaik. Setiap orang dapat 1 e-ticket QR.</p>
    </section>
  )
}
