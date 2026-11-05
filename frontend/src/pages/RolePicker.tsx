import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiMode, DEMO_URL, LIVE_URL, liveVersionReady } from '@/api'
import { BrandLockup, CoBrand } from '@/components/common/Brand'
import { Illustration } from '@/components/common/Illustration'
import { StickerSlap, type StickerSpec } from '@/components/landing/StickerSlap'

/**
 * DM-01: one link, three roles, so judges can try every side of the system. The page is the Sticker Slap landing:
 * the three roles as columns on the green panel, the wordmark writing itself along the bottom, and our stickers
 * slapped on it. Each role opens with its splash, its onboarding the first time, and its sign-in; Rina is the
 * visitor shortcut.
 */
export default function RolePicker() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const live = apiMode === 'live'
  const [liveReady, setLiveReady] = useState(false)

  // Demo version: offer the live version (shared backend, real two-phone test) only when one is configured
  // (VITE_LIVE_URL) and it answers its health check.
  useEffect(() => {
    if (live || !LIVE_URL) return
    const ctl = new AbortController()
    void liveVersionReady(ctl.signal).then((ok) => {
      if (!ctl.signal.aborted) setLiveReady(ok)
    })
    return () => ctl.abort()
  }, [live])

  const enter = async (role: 'VISITOR' | 'VISITOR_RINA' | 'ADMIN' | 'STAFF') => {
    setBusy(role)
    try {
      if (role === 'VISITOR_RINA') await api.demoLogin('VISITOR')
      navigate(role === 'ADMIN' ? '/admin' : role === 'STAFF' ? '/staff' : role === 'VISITOR_RINA' ? '/app/pass' : '/app')
    } finally {
      setBusy(null)
    }
  }

  const reset = async () => {
    if (live && !window.confirm('Versi live dipakai bersama. Reset akan menghapus pesanan dan check-in dari semua HP. Lanjut?')) return
    await api.demo.reset()
    toast.success('Data demo dikembalikan ke awal.')
  }

  const stickers: StickerSpec[] = [
    { node: <Illustration name="kursi" className="w-full" />, label: 'Stiker kursi', size: 12 },
    { kind: 'burst', text: 'hayu!', label: 'Stiker "hayu!"' },
    { node: <Illustration name="tiket" className="w-full" />, label: 'Stiker tiket', size: 12 },
    { node: <Illustration name="camera" className="w-full" />, label: 'Stiker kamera', size: 12 },
    { kind: 'bubble', text: 'sampurasun', label: 'Stiker "sampurasun"' },
    { node: <Illustration name="coins" className="w-full" />, label: 'Stiker koin', size: 12 },
  ]

  return (
    <main>
      <h1 className="sr-only">Summarevent: satu pass untuk semua event Summarecon Mall Bandung</h1>
      <StickerSlap
        wordmark="summarevent"
        nav={
          live
            ? { label: 'live', href: DEMO_URL, title: 'Versi live memakai server bersama. Buka versi demo (data per browser).' }
            : liveReady && LIVE_URL
              ? { label: 'demo', href: LIVE_URL, title: 'Versi demo: data di browser ini. Buka versi live untuk uji dua HP.' }
              : { label: 'demo', title: 'Versi demo: data di browser ini, pembayaran dan WA/email disimulasikan.' }
        }
        centre={
          <>
            <CoBrand tone="dark" className="max-sm:hidden" />
            <BrandLockup className="h-7 sm:hidden" />
          </>
        }
        corner={
          <button
            type="button"
            onClick={() => void reset()}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full text-sm font-semibold text-ink ring-1 ring-ink/20 transition max-sm:size-11 max-sm:justify-center sm:px-3 hover:bg-ink/5"
          >
            <RotateCcw className="size-4" aria-hidden /> <span className="max-sm:sr-only">Reset data demo</span>
          </button>
        }
        columns={[
          {
            tag: 'pengunjung',
            lines: [
              { label: 'Masuk sebagai pengunjung', onClick: () => void enter('VISITOR'), disabled: busy !== null },
              {
                label: (
                  <>
                    masuk cepat sebagai Rina<span className="ssf-ast">*</span>
                  </>
                ),
                name: 'atau masuk cepat sebagai Rina (persona)',
                onClick: () => void enter('VISITOR_RINA'),
                disabled: busy !== null,
              },
            ],
            note: '*Rina sudah punya tiket. Pilih kursi di denah, bayar (simulasi) atau tukar struk, lalu dapat e-ticket QR.',
          },
          {
            tag: 'panitia',
            lines: [{ label: 'Masuk sebagai panitia', onClick: () => void enter('ADMIN'), disabled: busy !== null }, { label: 'dashboard, event, struk' }],
            note: 'Atur event, kategori, denah, dan sesi. Pantau kursi, transaksi, struk, dan kehadiran.',
          },
          {
            tag: 'petugas',
            lines: [{ label: 'Masuk sebagai petugas', onClick: () => void enter('STAFF'), disabled: busy !== null }, { label: 'scan QR di pintu' }],
            note: 'Valid, sudah dipakai, atau tidak valid. Cari tiket manual kalau QR rusak.',
          },
        ]}
        stickers={stickers}
        credits={[
          { role: 'frontend', name: 'Haikal' },
          { role: 'backend', name: 'Bintang' },
          { role: 'user testing & ux', name: 'Shelvia' },
          { role: 'product & pitch', name: 'Awwal' },
          { role: 'system qa', name: 'Said' },
          { role: 'stiker', name: 'fun-isometric, digambar dalam kode' },
          { role: 'e-ticket', name: 'Talón oleh Moxen' },
        ]}
        note={
          <span className="ssf-pill">
            <span>{live ? 'Versi live · semua HP memakai data yang sama' : 'Prototype · bayar, OTP, dan WA/email disimulasikan'}</span>
          </span>
        }
      />
    </main>
  )
}
