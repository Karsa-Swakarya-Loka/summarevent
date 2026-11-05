import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { BellRing, ChevronRight, FlaskConical, Gift, Hourglass, LoaderCircle, TriangleAlert, WandSparkles, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import type { CategoryAvailability, SeatMapData } from '@/api/contract'
import { BackHeader, Countdown } from '@/components/common/bits'
import { DoubleBookingButton } from '@/components/common/DoubleBookingInfo'
import { SeatMap } from '@/components/seatmap/SeatMap'
import { CategoryLegend, StatusLegend } from '@/components/seatmap/SeatLegend'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LoginPanel } from '@/components/visitor/LoginPanel'
import { Skeleton } from '@/components/ui/skeleton'
import { DeskHead, LoadError, PhoneOnly, QtyStepper } from '@/components/visitor/Common'
import { continuePath, isPendingOrder, pendingTitle, rememberSession, seatRangeLabel, seatsAdjacent, sessionName, sessionWhen, tapSeat } from '@/components/visitor/helpers'
import { useVisitor } from '@/components/visitor/hooks'
import { saleState, seatLabel } from '@/domain/rules'
import type { Seat, SeatStatus, TicketCategory } from '@/domain/types'
import { errorMessage, useLive, useNow } from '@/hooks/useLive'
import { fmtShortDate, fmtTime, rupiahPlain } from '@/lib/format'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/utils'

export default function SeatSelect() {
  const { slug = '', sessionId = '' } = useParams()
  const map = useLive(() => api.getSeatMap(sessionId), [sessionId], { intervalMs: 3000 })

  useEffect(() => {
    if (slug && sessionId) rememberSession(slug, sessionId)
  }, [slug, sessionId])

  if (map.loading && !map.data) {
    return (
      <div className="lg:mx-auto lg:w-full lg:max-w-6xl lg:px-8">
        <PhoneOnly>
          <BackHeader to={`/app/e/${slug}`} title="Pilih kursi" />
        </PhoneOnly>
        <DeskHead to={`/app/e/${slug}`} title="Pilih kursi" />
        <div className="space-y-3 p-4" role="status" aria-busy="true" aria-label="Memuat denah">
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
      <div className="lg:mx-auto lg:w-full lg:max-w-6xl lg:px-8">
        <PhoneOnly>
          <BackHeader to={`/app/e/${slug}`} title="Pilih kursi" />
        </PhoneOnly>
        <DeskHead to={`/app/e/${slug}`} title="Pilih kursi" />
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
  // PV-14: a sold-out category offers the waiting list instead of the order button
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
    const picking = selected.includes(seat.id)
    if (!picking && status !== 'AVAILABLE') return
    if (!picking && cat.id !== categoryId) {
      haptic()
      pickCategory(cat.id)
      setSelected([seat.id])
      setQty(1)
      return
    }
    // the people count follows the seats tapped, so "Pesan 1 kursi" never sits beside "2 orang"
    const tap = tapSeat(selected, seat.id, qty, max)
    if (tap.full) {
      toast.info(`Maksimal ${max} kursi per pesanan. Ketuk kursi pilihanmu dulu untuk melepasnya.`)
      return
    }
    haptic()
    if (!picking) setConflict(null)
    setSelected(tap.picked)
    setQty(tap.qty)
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
      haptic()
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
        haptic('success')
        navigate(`/app/checkout/${res.order.id}`)
        return
      }
      holdingRef.current = false
      haptic('error')
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
   * Demo for judges on one device: the simulated buyer orders your first seat a split second
   * before you do, so the real conflict path (message + nearest seats) shows.
   */
  const raceDemo = async () => {
    if (!category || !selected.length) return
    setBusy('fake')
    holdingRef.current = true
    try {
      const res = await api.demo.fakeBuyer(sessionId, category.id, selected.slice(0, 1))
      toast(`Pembeli lain (simulasi) memesan ${naturalSeats(res.seatLabels)} sepersekian detik lebih dulu.`)
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
  // what the hold is for, so "ditahan" is not read as already held
  const holdFor = category?.accessMethod === 'RECEIPT' ? 'kirim struk' : category?.accessMethod === 'FREE' ? 'konfirmasi' : 'bayar'
  const summary = soldOut && category
    ? `${category.name} habis`
    : !category
    ? 'Pilih kategori dulu'
    : isGeneral
      ? `${qty} orang · ${category.name}`
      : count
        ? `${count} kursi · ${seatRangeLabel(labels)} · ${category.name}`
        : 'Belum ada kursi dipilih'
  const subline = pending
    ? pending.order.status === 'AWAITING_VERIFICATION'
      ? 'Pesan lagi setelah struk selesai dicek.'
      : 'Selesaikan pesanan ini dulu sebelum memesan lagi.'
    : soldOut && !closedReason
    ? myEntry
      ? `Urutan ke-${myEntry.position} di daftar tunggu · ${myEntry.qty} orang`
      : waitingCount
        ? `${waitingCount} orang menunggu · kabar lewat WA`
        : 'Kabar lewat WA kalau ada yang lepas'
    : !category
    ? 'Ketuk kategori untuk memperbesar denah.'
    : closedReason
      ? closedReason
      : isGeneral
        ? `Tanpa nomor kursi · setelah pesan, ditahan ${holdMin} menit`
        : count
          ? count < qty
            ? `Ketuk ${qty - count} kursi lagi untuk ${qty} orang.`
            : `Setelah pesan, ditahan ${holdMin} menit untuk ${holdFor}`
          : 'Ketuk kursi di denah'
  const generalShort = isGeneral && catAvail && !soldOut ? catAvail.available < qty : false
  const canHold = !!category && !closedReason && !pending && (isGeneral ? !generalShort && qty >= 1 : selected.length > 0) && busy !== 'hold'

  return (
    // on a laptop: the map fills the left, categories, the summary and the action stand in a column on the right
    <div className="flex min-h-dvh flex-col lg:mx-auto lg:grid lg:min-h-0 lg:w-full lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-x-8 lg:px-8 lg:pb-10">
      <PhoneOnly>
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
      </PhoneOnly>
      <DeskHead to={`/app/e/${slug}`} title={event.title} subtitle={`${sessionName(session)} · ${sessionWhen(session)}`} className="lg:col-span-2" />

      <div className="space-y-3 px-4 pt-3 lg:col-start-2 lg:row-start-2 lg:px-0 lg:pt-0">
        {pending && (
          <Link to={continuePath(pending)} className="flex items-center gap-3 rounded-xl border border-status-warn/50 bg-status-warn/12 p-3">
            <Hourglass className="size-5 shrink-0 text-[#7a5600]" aria-hidden />
            <span className="min-w-0 flex-1 text-sm">
              <span className="block font-bold">Kamu masih punya pesanan di sesi ini</span>
              <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                {pendingTitle(pending)} · <Countdown to={pending.order.holdExpiresAt} className="text-xs" />
              </span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        )}

        <CategoryLegend categories={categories} availability={availability} activeId={categoryId} onPick={pickCategory} chips className="lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0" />

        {category && !isGeneral && hasLayout && (
          <div className="flex items-stretch gap-2">
            <QtyStepper value={qty} max={max} onChange={changeQty} label="Jumlah orang" />
            <Button variant="outline" className="h-auto min-h-12 flex-1 gap-2 px-3 text-left text-sm leading-tight whitespace-normal" onClick={() => void autoPick()} disabled={busy === 'suggest' || !!closedReason}>
              {busy === 'suggest' ? <LoaderCircle className="size-5 animate-spin" /> : <WandSparkles className="size-5" />}
              <span>
                Pilihkan {qty} kursi
                {qty > 1 && (
                  <>
                    {' '}
                    <span className="whitespace-nowrap">berdampingan</span>
                  </>
                )}
              </span>
            </Button>
          </div>
        )}
      </div>

      <div className="contents lg:sticky lg:top-[calc(var(--spacing-desk-bar)+1rem)] lg:col-start-1 lg:row-span-2 lg:row-start-2 lg:flex lg:h-[calc(100dvh-var(--spacing-desk-bar)-8.5rem)] lg:min-h-[26rem] lg:flex-col">
      {hasLayout && !isGeneral ? (
        <>
          <div className="relative mx-4 mt-3 min-h-[18rem] flex-1 lg:mx-0 lg:mt-0">
            <SeatMap
              data={data}
              selected={selectedSet}
              suggested={suggestedSet}
              conflicts={conflictSet}
              myOrderId={pending?.order.id ?? null}
              activeCategoryId={category?.id ?? null}
              onSeatClick={onSeatClick}
              zoomKey={`${category?.id ?? 'all'}-${zoomNonce}`}
              focusSeatIds={selected}
              wholeOnDesk
              className="absolute inset-0"
              toolbar={
                selected.length > 0 && !pending && !closedReason ? (
                  <button
                    type="button"
                    onClick={() => void raceDemo()}
                    disabled={!!busy}
                    className="inline-flex h-11 min-w-0 items-center gap-1.5 rounded-full border border-dashed border-ink/30 bg-card px-3 text-xs font-semibold shadow-xs hover:bg-muted disabled:opacity-60"
                  >
                    {busy === 'fake' ? <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden /> : <Zap className="size-4 shrink-0" aria-hidden />}
                    Uji rebutan kursi
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void fakeBuyer()}
                    disabled={!!busy}
                    className="inline-flex h-11 min-w-0 items-center gap-1.5 rounded-full border border-dashed border-ink/30 bg-card px-3 text-xs font-semibold shadow-xs hover:bg-muted disabled:opacity-60"
                  >
                    {busy === 'fake' ? <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden /> : <FlaskConical className="size-4 shrink-0" aria-hidden />}
                    Uji pembeli lain
                  </button>
                )
              }
            />
          </div>
          <StatusLegend
            className="gap-x-3 gap-y-1.5 px-4 pt-2.5 text-[0.72rem] lg:gap-x-5 lg:px-0 lg:pt-3 lg:text-xs"
            showPriority
            availableColors={categories.filter((c) => c.quota == null).map((c) => c.color)}
          />
          <DoubleBookingButton className="mx-4 self-start lg:mx-0" />
        </>
      ) : category && isGeneral ? (
        <GeneralPanel category={category} available={catAvail?.available ?? 0} total={catAvail?.total ?? 0} qty={qty} max={generalMax} onQty={changeQty} disabled={!!closedReason} />
      ) : !hasLayout ? (
        <p className="mx-4 mt-4 rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground lg:mx-0 lg:mt-0">Event ini tanpa nomor kursi. Pilih kategori di atas.</p>
      ) : null}
      </div>

      {!hasLayout && !(category && isGeneral) && <div className="flex-1 lg:hidden" />}

      <div className="sticky bottom-0 z-20 mt-3 border-t bg-card/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-10px_30px_-18px_rgb(0_0_0/0.35)] backdrop-blur lg:static lg:col-start-2 lg:row-start-3 lg:mt-4 lg:rounded-[1.4rem] lg:border-0 lg:bg-card lg:p-5 lg:shadow-xs lg:backdrop-blur-none">
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
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
            <Gift className="size-4 shrink-0" aria-hidden /> Bonus {category.bonusDesc} untuk {category.bonusFirstN} tiket pertama · sisa {bonusLeft}
          </p>
        )}
        <div aria-live="polite">
          {/* the summary has the bar's full width: beside the price it broke after a separator on a 360 px phone */}
          <p className={cn('font-bold', count ? 'text-base' : 'text-sm')}>
            {category && <span className="mr-1.5 inline-block size-3 rounded-[4px] align-middle" style={{ background: category.color }} aria-hidden />}
            {summary}
          </p>
          <div className="flex items-end justify-between gap-3">
            <p className={cn('min-w-0 text-xs', closedReason ? 'font-semibold text-[#a11b1b]' : 'text-muted-foreground')}>{subline}</p>
            {category && count > 0 && !soldOut && category.accessMethod !== 'RECEIPT' && <p className="shrink-0 text-2xl leading-none font-extrabold tabular-nums">{totalText}</p>}
          </div>
        </div>
        <div className="mt-3 flex items-stretch gap-2">
          {pending ? (
            <Button asChild className="h-14 flex-1 text-base">
              <Link to={continuePath(pending)}>{pending.order.status === 'AWAITING_VERIFICATION' ? 'Lihat pesananmu' : 'Lanjutkan pesananmu'}</Link>
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
              {isGeneral ? `Pesan ${qty} tiket` : selected.length ? `Pesan ${selected.length} kursi` : 'Pesan kursi'}
            </Button>
          )}
        </div>
      </div>

      <Dialog open={askLogin} onOpenChange={setAskLogin}>
        <DialogContent className="sm:max-w-sm">
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

/** Spread `k` of `n` places the same way on every render, a little denser at the front, as people stand at an event. */
function scatter(n: number, k: number): Set<number> {
  const weight = (i: number) => ((Math.imul(i + 1, 2654435761) >>> 0) / 2 ** 32) * 0.65 + (i / n) * 0.35
  return new Set([...Array(n).keys()].sort((a, b) => weight(a) - weight(b)).slice(0, k))
}

/** A category without seat numbers: its places as a field of dots in front of the stage, the visitor's own in colour. */
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
  const cells = Math.max(1, Math.min(total, 96))
  const per = total > 0 ? total / cells : 1
  const takenCells = Math.min(cells, Math.round((total - available) / per))
  const taken = useMemo(() => scatter(cells, takenCells), [cells, takenCells])
  let mine = available > 0 ? Math.min(cells - takenCells, Math.ceil(qty / per)) : 0
  const dots = Array.from({ length: cells }, (_, i) => (taken.has(i) ? 'taken' : mine-- > 0 ? 'mine' : 'free'))
  return (
    <section className="mx-4 mt-3 flex flex-1 flex-col rounded-[1.4rem] bg-card p-4 shadow-xs lg:mx-0 lg:mt-0" aria-label={`Kuota ${category.name}`}>
      <p className="flex items-center gap-1.5 text-[0.66rem] font-bold tracking-[0.18em] text-muted-foreground uppercase">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: category.color }} aria-hidden />
        {category.name}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{category.description ?? 'Tanpa nomor kursi'}</p>

      <div className="flex flex-1 flex-col justify-center py-5" aria-hidden>
        <div className="mx-auto flex h-7 w-3/4 items-center justify-center rounded-b-[2rem] bg-ink text-[0.6rem] font-bold tracking-[0.3em] text-white/75 uppercase">Depan</div>
        <div className="mx-auto mt-4 grid w-full max-w-[21rem] grid-cols-12 gap-1.5">
          {dots.map((d, i) =>
            d === 'mine' ? (
              <svg key={i} viewBox="0 0 24 24" className="aspect-square w-full animate-pop rounded-full" style={{ background: category.color }}>
                <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <span key={i} className={cn('aspect-square rounded-full', d === 'taken' ? 'bg-ink/15' : 'border-2 border-ink/15')} />
            ),
          )}
        </div>
        <p className="mt-4 flex justify-center gap-4 text-xs text-muted-foreground">
          {dots.includes('taken') && (
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-ink/15" /> Terisi
            </span>
          )}
          {dots.includes('free') && (
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full border-2 border-ink/15" /> Kosong
            </span>
          )}
          {dots.includes('mine') && (
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full" style={{ background: category.color }} /> Punyamu
            </span>
          )}
        </p>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[0.66rem] font-bold tracking-[0.18em] text-muted-foreground uppercase">Sisa</p>
          <p className="font-poster text-[2.6rem] leading-none uppercase tabular-nums">
            {available === 0 ? (
              <span className="text-[#a11b1b]">Habis</span>
            ) : (
              <>
                {available}
                <span className="text-xl text-muted-foreground"> / {total}</span>
              </>
            )}
          </p>
        </div>
        <QtyStepper value={qty} max={max} onChange={onQty} label="Jumlah orang" className={cn(disabled && 'pointer-events-none opacity-50')} />
      </div>
    </section>
  )
}
