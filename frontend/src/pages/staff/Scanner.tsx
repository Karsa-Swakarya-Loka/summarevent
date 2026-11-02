import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { ArrowLeft, CalendarX2, CameraOff, ChevronDown, CircleAlert, Clock, CloudOff, FlaskConical, RefreshCw, RotateCcw, Search, ShieldX, Shuffle } from 'lucide-react'
import { api } from '@/api'
import { CameraView } from '@/components/staff/CameraView'
import { cameraPrecheck, type CameraProblem } from '@/components/staff/camera'
import { ScanResult } from '@/components/staff/ScanResult'
import { unlockAudio } from '@/components/staff/beep'
import { fetchEventTickets, pickRandom, tamperToken } from '@/components/staff/demoTickets'
import { loadQueue, offlineCapable, QUEUE_EVENT, refreshManifest, syncQueue, type SyncConflict } from '@/components/staff/offline'
import { sessionName, sessionWindow, useStaffSession } from '@/components/staff/session'
import { useCheckin } from '@/components/staff/useCheckin'
import { errorMessage, useLive, useNow } from '@/hooks/useLive'
import { fmtDateTime, fmtRange } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Same QR is ignored while its result is on screen and for this long after. */
const SAME_TOKEN_MS = 3000
const VALID_AUTO_DISMISS_MS = 3500
const DEMO_OPEN_KEY = 'summarevent:staff:demo-open'

const PROBLEM_TEXT: Record<CameraProblem, { title: string; body: string }> = {
  'insecure-context': {
    title: 'Kamera butuh koneksi aman (HTTPS)',
    body: 'Browser hanya mengizinkan kamera di alamat https:// atau localhost. Buka tautan https, atau tempel kode QR / cari tiket manual.',
  },
  'permission-denied': {
    title: 'Izin kamera ditolak',
    body: 'Izinkan akses kamera untuk situs ini di pengaturan browser, lalu ketuk Coba lagi. Sementara itu, tempel kode QR atau cari tiket manual.',
  },
  'no-camera': { title: 'Kamera tidak ditemukan', body: 'Perangkat ini tidak punya kamera yang bisa dipakai. Tempel kode QR atau cari tiket manual.' },
  'in-use': { title: 'Kamera sedang dipakai aplikasi lain', body: 'Tutup aplikasi lain yang memakai kamera, lalu ketuk Coba lagi.' },
  overconstrained: { title: 'Kamera belakang tidak tersedia', body: 'Ketuk Coba lagi, atau tempel kode QR / cari tiket manual.' },
  unsupported: { title: 'Browser ini belum mendukung kamera', body: 'Pakai Chrome atau Safari versi terbaru, atau tempel kode QR / cari tiket manual.' },
  aborted: { title: 'Kamera berhenti', body: 'Ketuk Coba lagi untuk menyalakan kamera.' },
  security: { title: 'Kamera diblokir browser', body: 'Cek izin kamera di pengaturan browser, atau tempel kode QR / cari tiket manual.' },
  'type-error': { title: 'Kamera tidak bisa dibuka', body: 'Ketuk Coba lagi, atau tempel kode QR / cari tiket manual.' },
  unknown: { title: 'Kamera tidak bisa dibuka', body: 'Ketuk Coba lagi, atau tempel kode QR / cari tiket manual.' },
}

/** PT-02 / PT-03 / PT-04: full-screen dark scanner. No animations on this screen. */
export default function Scanner() {
  const { sessionId = '' } = useParams()
  const ctx = useStaffSession(sessionId)
  const counter = useLive(() => api.staff.recentCheckins(sessionId), [sessionId], { intervalMs: 15_000 })
  const checkin = useCheckin(sessionId)
  const now = useNow(30_000)

  const [problem, setProblem] = useState<CameraProblem | null>(() => cameraPrecheck())
  const [cameraKey, setCameraKey] = useState(0)

  const last = useRef<{ token: string; at: number } | null>(null)
  const showing = useRef(false)
  const { submit, busy, current } = checkin
  useEffect(() => {
    showing.current = !!current
  }, [current])

  const run = useCallback(
    (token: string) => {
      last.current = { token: token.trim(), at: Date.now() }
      void submit(token)
    },
    [submit],
  )

  // PT-04 anti double scan: one at a time, nothing while a result is shown, same QR muted for 3 s.
  const onCameraToken = useCallback(
    (raw: string) => {
      const token = raw.trim()
      if (!token || showing.current || busy.current) return
      const prev = last.current
      if (prev && prev.token === token && Date.now() - prev.at < SAME_TOKEN_MS) return
      run(token)
    },
    [run, busy],
  )

  const onProblem = useCallback((kind: CameraProblem) => setProblem(kind), [])

  const dismiss = () => {
    if (checkin.current) last.current = { token: checkin.current.token, at: Date.now() }
    checkin.dismiss()
  }

  const retryCamera = () => {
    setProblem(cameraPrecheck())
    setCameraKey((k) => k + 1)
  }

  const event = ctx.event
  const session = ctx.session
  const win = event && session ? sessionWindow(session, event.rules, now) : null

  if (ctx.notFound || ctx.error) {
    return (
      <DarkShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <CircleAlert className="size-12" aria-hidden />
          <h1 className="text-2xl font-bold">{ctx.notFound ? 'Sesi tidak ditemukan' : 'Data sesi belum bisa dimuat'}</h1>
          <p className="text-white/80">{ctx.notFound ? 'Sesi ini sudah dihapus atau tautannya salah.' : errorMessage(ctx.error)}</p>
          <Link to="/staff" className="flex h-14 items-center rounded-2xl bg-white px-6 text-lg font-bold text-ink">
            Pilih sesi lain
          </Link>
        </div>
      </DarkShell>
    )
  }

  return (
    <DarkShell onPointerDown={unlockAudio}>
      {/* Top bar: back, event + session, live counter */}
      <header className="flex shrink-0 items-center gap-2 bg-[#111] px-2 pt-[max(env(safe-area-inset-top),8px)] pb-2">
        <Link to="/staff" className="flex size-14 shrink-0 items-center justify-center rounded-full hover:bg-white/10" aria-label="Kembali ke pilih sesi">
          <ArrowLeft className="size-6" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base leading-tight font-bold">{event?.title ?? 'Memuat sesi…'}</h1>
          {session && (
            <p className="truncate text-sm text-white/80">
              {sessionName(session)} · {fmtRange(win?.session.startAt ?? session.startAt, win?.session.endAt ?? session.endAt)}
            </p>
          )}
        </div>
        <div
          className="shrink-0 rounded-xl bg-white/12 px-3 py-1 text-right"
          aria-live="polite"
          aria-label={counter.data ? `Hadir ${counter.data.checkedIn} dari ${counter.data.capacity}` : 'Jumlah hadir'}
        >
          <div className="text-xs font-semibold text-white/80">Hadir</div>
          <div className="text-xl leading-tight font-black tabular-nums" data-testid="attendance">
            {counter.data ? `${counter.data.checkedIn} / ${counter.data.capacity}` : '– / –'}
          </div>
        </div>
      </header>

      <OfflineBar sessionId={sessionId} />

      {win && win.state !== 'OPEN' && (
        <div className="flex shrink-0 items-start gap-2 bg-status-warn px-4 py-2 text-sm font-bold text-ink" role="status">
          <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {win.state === 'NOT_YET' ? `Check-in sesi ini belum dibuka (dibuka ${fmtDateTime(win.open.toISOString())}).` : `Check-in sesi ini sudah ditutup (${fmtDateTime(win.close.toISOString())}).`}{' '}
            Tiket akan tampil kuning.
          </span>
        </div>
      )}

      {/* Camera or fallback */}
      <div className="relative min-h-0 flex-1">
        {problem ? (
          <CameraFallback problem={problem} sessionId={sessionId} onRetry={retryCamera} onSubmit={run} pending={checkin.pending} />
        ) : (
          <CameraView key={cameraKey} onToken={onCameraToken} onProblem={onProblem} />
        )}
        {checkin.error && (
          <div role="alert" className="absolute top-3 right-3 left-3 flex items-start gap-2 rounded-2xl bg-white p-3 text-base font-semibold text-ink shadow-lg">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-status-invalid" aria-hidden />
            <span className="flex-1">{checkin.error}</span>
            <button type="button" className="min-h-11 rounded-lg px-3 font-bold underline" onClick={checkin.clearError}>
              Tutup
            </button>
          </div>
        )}
        {checkin.pending && (
          <div className="absolute inset-x-0 top-3 flex justify-center" role="status">
            <span className="rounded-full bg-white px-4 py-2 text-base font-bold text-ink">Memeriksa tiket…</span>
          </div>
        )}
      </div>

      <BottomBar sessionId={sessionId} eventId={event?.id} onSubmit={run} pending={checkin.pending} showPaste={!problem} />

      {checkin.current && (
        <ScanResult
          key={checkin.current.key}
          res={checkin.current.res}
          sessionId={sessionId}
          onNext={dismiss}
          nextLabel="Scan berikutnya"
          autoDismissMs={VALID_AUTO_DISMISS_MS}
          offline={checkin.current.offline}
        />
      )}
    </DarkShell>
  )
}

/**
 * PT-07 (live version): keeps the session's ticket list on the phone, says when the scanner is working
 * offline, and sends queued scans once the connection is back. Silent while everything is online.
 */
function OfflineBar({ sessionId }: { sessionId: string }) {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)
  const [queued, setQueued] = useState(() => loadQueue().length)
  const [syncing, setSyncing] = useState(false)
  const [conflicts, setConflicts] = useState<SyncConflict[]>([])

  const sync = useCallback(async () => {
    if (!loadQueue().length || navigator.onLine === false) return
    setSyncing(true)
    try {
      const r = await syncQueue()
      if (r.synced) toast.success(`${r.synced} scan offline sudah tersimpan di server.`)
      if (r.conflicts.length) setConflicts((c) => [...c, ...r.conflicts])
    } finally {
      setSyncing(false)
      setQueued(loadQueue().length)
    }
  }, [])

  useEffect(() => {
    if (!offlineCapable) return
    const refresh = () => {
      if (navigator.onLine !== false) refreshManifest(sessionId).catch(() => undefined)
    }
    const goOnline = () => {
      setOnline(true)
      refresh()
      void sync()
    }
    const goOffline = () => setOnline(false)
    const queueChanged = () => setQueued(loadQueue().length)
    refresh()
    const first = setTimeout(() => void sync(), 0) // scans left from an earlier visit
    const timer = setInterval(() => {
      refresh()
      void sync()
    }, 30_000)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    window.addEventListener(QUEUE_EVENT, queueChanged)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      window.removeEventListener(QUEUE_EVENT, queueChanged)
    }
  }, [sessionId, sync])

  if (!offlineCapable || (online && !queued && !conflicts.length)) return null
  return (
    <div className="shrink-0" data-testid="offline-bar">
      {(!online || queued > 0) && (
        <div className="flex items-start gap-2 bg-status-warn px-4 py-2 text-sm font-bold text-ink" role="status">
          {online ? <RefreshCw className={cn('mt-0.5 size-4 shrink-0', syncing && 'animate-spin')} aria-hidden /> : <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden />}
          <span>
            {!online
              ? `Offline. Scan tetap jalan dari daftar tiket di HP ini${queued ? `, ${queued} menunggu sinkron` : ''}.`
              : syncing
                ? `Menyinkronkan ${queued} scan offline…`
                : `${queued} scan offline menunggu sinkron.`}
          </span>
        </div>
      )}
      {conflicts.length > 0 && (
        <div className="bg-white px-4 py-3 text-sm text-ink" role="alert" data-testid="offline-conflicts">
          <p className="font-bold text-status-invalid">{conflicts.length} scan offline ditolak server. Cek ke meja bantuan:</p>
          <ul className="mt-1 list-disc pl-5">
            {conflicts.map((c) => (
              <li key={`${c.ticketId}-${c.scannedAt}`}>
                {c.label} ({fmtDateTime(c.scannedAt)}): {c.message}
              </li>
            ))}
          </ul>
          <button type="button" className="mt-1 min-h-11 font-bold underline" onClick={() => setConflicts([])}>
            Tutup
          </button>
        </div>
      )}
    </div>
  )
}

function DarkShell({ children, onPointerDown }: { children: ReactNode; onPointerDown?: () => void }) {
  return (
    <div className="fixed inset-0 z-30 bg-[#0b0b0c] text-white" onPointerDown={onPointerDown}>
      <main className="mx-auto flex h-dvh w-full max-w-md flex-col">{children}</main>
    </div>
  )
}

function CameraFallback({
  problem,
  sessionId,
  onRetry,
  onSubmit,
  pending,
}: {
  problem: CameraProblem
  sessionId: string
  onRetry: () => void
  onSubmit: (token: string) => void
  pending: boolean
}) {
  const text = PROBLEM_TEXT[problem] ?? PROBLEM_TEXT.unknown
  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="flex min-h-full flex-col items-center justify-center gap-4 px-5 py-6 text-center">
        <CameraOff className="size-12 text-white/85" aria-hidden />
        <div>
          <h2 className="text-2xl font-bold">{text.title}</h2>
          <p className="mt-2 text-base text-white/80">{text.body}</p>
        </div>
        <PasteForm onSubmit={onSubmit} pending={pending} className="w-full text-left" />
        <div className="grid w-full grid-cols-2 gap-3">
          {problem !== 'insecure-context' && problem !== 'unsupported' && (
            <button type="button" onClick={onRetry} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-white/12 text-lg font-bold ring-1 ring-white/25">
              <RotateCcw className="size-5" aria-hidden /> Coba lagi
            </button>
          )}
          <Link
            to={`/staff/search/${sessionId}`}
            className={cn(
              'flex h-14 items-center justify-center gap-2 rounded-2xl bg-white text-lg font-bold text-ink',
              (problem === 'insecure-context' || problem === 'unsupported') && 'col-span-2',
            )}
          >
            <Search className="size-5" aria-hidden /> Cari manual
          </Link>
        </div>
      </div>
    </div>
  )
}

function PasteForm({ onSubmit, pending, className, compact = false }: { onSubmit: (token: string) => void; pending: boolean; className?: string; compact?: boolean }) {
  const [value, setValue] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const v = value.trim()
    if (!v) return
    onSubmit(v)
    setValue('')
  }
  return (
    <form onSubmit={submit} className={className}>
      <label htmlFor="paste-qr" className={cn('block font-bold', compact ? 'text-sm' : 'text-base')}>
        Tempel kode QR
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          id="paste-qr"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="SEV1.tkt_…"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          className="h-14 min-w-0 flex-1 rounded-xl bg-white px-4 font-mono text-base text-ink placeholder:text-ink/45 focus:outline-4 focus:outline-white/40"
        />
        <button type="submit" disabled={pending || !value.trim()} className="h-14 shrink-0 rounded-xl bg-white/15 px-4 text-base font-bold ring-1 ring-white/30 disabled:opacity-50">
          Periksa
        </button>
      </div>
    </form>
  )
}

type DemoKind = 'session' | 'repeat' | 'other' | 'fake'

function BottomBar({
  sessionId,
  eventId,
  onSubmit,
  pending,
  showPaste,
}: {
  sessionId: string
  eventId: string | undefined
  onSubmit: (token: string) => void
  pending: boolean
  showPaste: boolean
}) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(DEMO_OPEN_KEY) === '1'
    } catch {
      return false
    }
  })
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [lastDemo, setLastDemo] = useState<{ token: string; label: string } | null>(null)

  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(DEMO_OPEN_KEY, o ? '0' : '1')
      } catch {
        /* per-viewer convenience only */
      }
      return !o
    })
  }

  const demo = async (kind: DemoKind) => {
    if (!eventId || busy || pending) return
    setBusy(true)
    setNote(null)
    try {
      if (kind === 'repeat') {
        if (lastDemo) {
          setNote(`Scan ulang: ${lastDemo.label}`)
          onSubmit(lastDemo.token)
        }
        return
      }
      const all = await fetchEventTickets(eventId)
      if (kind === 'fake') {
        const base = pickRandom(all.filter((r) => r.ticket.sessionId === sessionId)) ?? pickRandom(all)
        setNote('QR palsu: kode QR asli yang tanda tangannya diubah.')
        onSubmit(tamperToken(base?.ticket.qrToken))
        return
      }
      const pool = all.filter((r) => r.ticket.status === 'ACTIVE' && (kind === 'session' ? r.ticket.sessionId === sessionId : r.ticket.sessionId !== sessionId))
      const row = pickRandom(pool)
      if (!row) {
        setNote(
          kind === 'session'
            ? 'Semua tiket contoh sesi ini sudah dipakai. Reset data demo dari halaman Pilih sesi (menu Demo), atau beli tiket baru di sisi pengunjung.'
            : 'Tidak ada tiket aktif di sesi lain event ini.',
        )
        return
      }
      const who = row.ticket.attendeeName || row.order.buyerName
      const label = `${row.ticket.seatLabel ? `Kursi ${row.ticket.seatLabel}` : 'Tanpa nomor kursi'} · ${who} · ${row.ticket.code}`
      setLastDemo({ token: row.ticket.qrToken, label })
      setNote(kind === 'session' ? `Tiket contoh: ${label}` : `Tiket ${sessionName(row.session)}: ${label}`)
      onSubmit(row.ticket.qrToken)
    } catch (e) {
      setNote(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const tool = 'flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white/12 px-3 text-base leading-tight font-bold ring-1 ring-white/25 disabled:opacity-45'
  const disabled = busy || pending || !eventId

  return (
    <div className="shrink-0 border-t border-white/10 bg-[#111] px-3 pt-3 pb-[max(env(safe-area-inset-bottom),12px)]">
      <div className="grid grid-cols-2 gap-3">
        <Link to={`/staff/search/${sessionId}`} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-white text-lg font-bold text-ink">
          <Search className="size-5" aria-hidden /> Cari manual
        </Link>
        <button type="button" onClick={toggle} aria-expanded={open} aria-controls="demo-tools" className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-white/12 text-lg font-bold ring-1 ring-white/25">
          <FlaskConical className="size-5" aria-hidden /> Alat bantu demo
          <ChevronDown className={cn('size-5', open && 'rotate-180')} aria-hidden />
        </button>
      </div>

      {open && (
        <section id="demo-tools" aria-label="Alat bantu demo" className="mt-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/15">
          <p className="text-sm text-white/80">
            Untuk juri tanpa HP kedua: tiket dari data demo diperiksa lewat alur check-in yang sama dengan kamera.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className={tool} disabled={disabled} onClick={() => void demo('session')}>
              <Shuffle className="size-5 shrink-0" aria-hidden /> Ambil tiket contoh
            </button>
            <button type="button" className={tool} disabled={disabled || !lastDemo} onClick={() => void demo('repeat')}>
              <RotateCcw className="size-5 shrink-0" aria-hidden /> Scan ulang tiket tadi
            </button>
            <button type="button" className={tool} disabled={disabled} onClick={() => void demo('other')}>
              <CalendarX2 className="size-5 shrink-0" aria-hidden /> Tiket sesi lain
            </button>
            <button type="button" className={tool} disabled={disabled} onClick={() => void demo('fake')}>
              <ShieldX className="size-5 shrink-0" aria-hidden /> QR palsu
            </button>
          </div>
          <p className="mt-2 min-h-5 text-sm font-semibold text-white" aria-live="polite" data-testid="demo-note">
            {busy ? 'Mengambil tiket…' : note}
          </p>
          {showPaste && <PasteForm onSubmit={onSubmit} pending={pending} compact className="mt-2" />}
        </section>
      )}
    </div>
  )
}
