import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowRight, RadioTower, RotateCcw, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiMode, DEMO_URL, LIVE_URL, liveVersionReady } from '@/api'
import { CoBrand } from '@/components/common/Brand'
import { Illustration } from '@/components/common/Illustration'
import { SundaText } from '@/components/common/bits'
import { Button } from '@/components/ui/button'

/** DM-01: one link, three roles – so judges can try every side of the system. */
export default function RolePicker() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const live = apiMode === 'live'
  const [liveReady, setLiveReady] = useState(false)

  // Demo version: offer the live version (shared backend, real two-phone test) only when one is
  // configured (VITE_LIVE_URL) and it answers its health check.
  useEffect(() => {
    if (live || !LIVE_URL) return
    const ctl = new AbortController()
    void liveVersionReady(ctl.signal).then((ok) => {
      if (!ctl.signal.aborted) setLiveReady(ok)
    })
    return () => ctl.abort()
  }, [live])

  // each role opens with its splash, its onboarding the first time, and its sign-in (Rina is the visitor shortcut)
  const enter = async (role: 'VISITOR' | 'VISITOR_RINA' | 'ADMIN' | 'STAFF') => {
    setBusy(role)
    try {
      if (role === 'VISITOR_RINA') await api.demoLogin('VISITOR')
      navigate(role === 'ADMIN' ? '/admin' : role === 'STAFF' ? '/staff' : role === 'VISITOR_RINA' ? '/app/pass' : '/app')
    } finally {
      setBusy(null)
    }
  }

  const roles = [
    {
      key: 'VISITOR' as const,
      art: 'kursi' as const,
      title: 'Pengunjung',
      body: 'Pilih event, pilih kursi di denah, bayar (simulasi) atau tukar struk, lalu dapat e-ticket QR.',
      cta: 'Masuk sebagai pengunjung',
    },
    {
      key: 'ADMIN' as const,
      art: 'notes' as const,
      title: 'Panitia',
      body: 'Atur event, kategori, harga, denah & periode jual. Pantau kursi, transaksi, struk, dan kehadiran.',
      cta: 'Masuk sebagai panitia',
    },
    {
      key: 'STAFF' as const,
      art: 'camera' as const,
      title: 'Petugas',
      body: 'Scan QR di pintu masuk: Valid, Sudah digunakan, atau Tidak valid. Cari tiket manual kalau QR rusak.',
      cta: 'Masuk sebagai petugas',
    },
  ]

  return (
    <main className="relative min-h-dvh overflow-hidden bg-brand text-white">
      {/* the splash's seat-grid dots carry on behind the page, so the splash hands over without a seam */}
      <div className="seat-dots pointer-events-none absolute inset-0 text-white/[0.07]" aria-hidden />
      <div className="relative mx-auto flex min-h-dvh max-w-5xl flex-col px-4 py-8 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <CoBrand tone="light" />
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-white/20">
            Bandung Build Challenge 2026 · {live ? 'Versi live' : 'Prototype'}
          </span>
        </header>

        <section className="mt-10 grid gap-8 lg:mt-16 lg:grid-cols-[1.1fr_1fr] lg:items-end">
          <div>
            <SundaText k="welcome" size="xl" />
            <h1 className="mt-6 text-3xl font-extrabold leading-tight text-balance sm:text-5xl">
              Satu pass untuk semua event <span className="text-brand-yellow">Summarecon Mall Bandung</span>.
            </h1>
            <p className="mt-4 max-w-xl text-base text-white/80 sm:text-lg">
              Pilih kursi langsung dari denah. Bayar, daftar gratis, atau tukar struk belanja — semuanya berakhir di satu e-ticket QR.
            </p>
          </div>
          <div className="hidden justify-end lg:flex">
            <Illustration name="tiket" className="w-80 drop-shadow-2xl" />
          </div>
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-3" aria-label="Pilih role demo">
          {roles.map(({ key, art, title, body, cta }, i) => (
            <div key={key} className="flex animate-rise flex-col rounded-[1.75rem] bg-white p-5 text-ink shadow-xl shadow-ink/20" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex items-center gap-3">
                <span className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-brand-soft">
                  <span className="seat-dots absolute inset-0 text-brand/15" aria-hidden />
                  <Illustration name={art} className="relative w-16" />
                </span>
                <h2 className="text-xl font-extrabold">{title}</h2>
              </div>
              <p className="mt-3 flex-1 text-sm text-muted-foreground">{body}</p>
              <Button size="lg" className="mt-4 h-12 text-base" disabled={busy !== null} onClick={() => void enter(key)}>
                {cta} <ArrowRight />
              </Button>
              {key === 'VISITOR' && (
                <button
                  type="button"
                  className="mt-2 min-h-11 text-sm font-medium text-brand underline-offset-4 hover:underline"
                  onClick={() => void enter('VISITOR_RINA')}
                  disabled={busy !== null}
                >
                  atau masuk cepat sebagai Rina (persona) →
                </button>
              )}
            </div>
          ))}
        </section>

        {live ? (
          <section className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-white/10 p-4 text-sm ring-1 ring-white/20">
            <RadioTower className="size-5 shrink-0 text-brand-yellow" aria-hidden />
            <p className="min-w-0 flex-1">
              <strong>Versi live:</strong> semua HP dan laptop memakai data yang sama di server. Buka denah yang sama di dua HP, pilih
              kursi yang sama, lalu tekan Hayu ngiring berbarengan: hanya satu yang berhasil.
            </p>
            <a href={DEMO_URL} className="font-semibold text-brand-yellow underline-offset-4 hover:underline">
              Versi demo (data per browser) →
            </a>
          </section>
        ) : (
          liveReady &&
          LIVE_URL && (
            <section className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-white/10 p-4 text-sm ring-1 ring-white/20">
              <Smartphone className="size-5 shrink-0 text-brand-yellow" aria-hidden />
              <p className="min-w-0 flex-1">
                Mau uji rebutan kursi pakai <strong>dua HP sungguhan</strong>? Versi live memakai server dan database bersama.
              </p>
              <a href={LIVE_URL} className="font-semibold text-brand-yellow underline-offset-4 hover:underline">
                Buka versi live →
              </a>
            </section>
          )
        )}

        <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-10 text-xs text-white/80">
          <span>Data contoh · pembayaran, OTP, dan WA/email disimulasikan · bukan transaksi sungguhan</span>
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-semibold text-white ring-1 ring-white/30 hover:bg-white/10"
            onClick={async () => {
              if (live && !window.confirm('Versi live dipakai bersama. Reset akan menghapus pesanan dan check-in dari semua HP. Lanjut?')) return
              await api.demo.reset()
              toast.success('Data demo dikembalikan ke awal.')
            }}
          >
            <RotateCcw className="size-3.5" /> Reset data demo
          </button>
        </footer>
      </div>
    </main>
  )
}
