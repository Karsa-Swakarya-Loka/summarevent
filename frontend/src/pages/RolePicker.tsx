import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ExternalLink, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiMode, DEMO_URL, LIVE_URL, liveVersionReady } from '@/api'
import { BrandLockup, CoBrand } from '@/components/common/Brand'
import { Illustration } from '@/components/common/Illustration'
import { Afiche, type PosterSpec } from '@/components/landing/Afiche'
import { StickerSlap, type StickerSpec } from '@/components/landing/StickerSlap'
import { TEAM } from '@/components/landing/team'
import { TeamSlide } from '@/components/landing/TeamSlide'

const CREDITS = [
  ...TEAM.map((m) => [m.role, m.name]),
  ['stiker', 'fun-isometric, digambar dalam kode'],
  ['e-ticket & poster', 'Talón dan Afiche oleh Moxen'],
  ['poster tim', 'Crumple Changelog oleh Kedhareswer'],
]

/**
 * DM-01: one link, three roles, so judges can try every side of the system. The page is the Sticker Slap landing;
 * on the green panel a notch switches between the fan of posters (one per role) and the team's crumpling posters. The wordmark writes itself along the bottom with our stickers slapped on it.
 * Each role opens with its splash, its onboarding the first time, and its sign-in; Rina is the visitor shortcut.
 */
export default function RolePicker() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const [tab, setTab] = useState<0 | 1>(0)
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

  const other = live ? { href: DEMO_URL, label: 'Buka versi demo', hint: 'data per browser' } : liveReady && LIVE_URL ? { href: LIVE_URL, label: 'Buka versi live', hint: 'uji dua HP, data bersama' } : null
  const off = busy !== null

  const posters: PosterSpec[] = [
    {
      key: 'visitor',
      variant: 'crema',
      word: 'Kursi',
      title: 'Pengunjung',
      note: 'Pilih kursi di denah, bayar atau tukar struk, dapat e-ticket QR',
      top: ['Pengunjung', '01'],
      foot: (
        <>
          <b>01</b>Pilih kursimu sendiri.
        </>
      ),
      art: <Illustration name="kursi" className="w-full" still />,
      action: { label: 'Masuk sebagai pengunjung', onClick: () => void enter('VISITOR'), disabled: off },
      secondary: { label: 'masuk sebagai Rina (akun contoh)', name: 'atau masuk sebagai Rina (akun contoh)', onClick: () => void enter('VISITOR_RINA'), disabled: off },
    },
    {
      key: 'admin',
      variant: 'negro',
      word: 'Event',
      title: 'Panitia',
      note: 'Dashboard, event, denah, struk, dan kehadiran',
      top: ['Panitia', '02'],
      foot: (
        <>
          <b>02</b>Atur, lalu pantau.
        </>
      ),
      art: <Illustration name="notes" className="w-full" still />,
      action: { label: 'Masuk sebagai panitia', onClick: () => void enter('ADMIN'), disabled: off },
    },
    {
      key: 'staff',
      variant: 'ambar',
      word: 'Scan',
      title: 'Petugas',
      note: 'Scan QR di pintu: valid, sudah digunakan, atau tidak valid',
      top: ['Petugas', '03'],
      foot: (
        <>
          <b>03</b>Valid dalam sedetik.
        </>
      ),
      art: <Illustration name="camera" className="w-full" still />,
      action: { label: 'Masuk sebagai petugas', onClick: () => void enter('STAFF'), disabled: off },
    },
  ]

  const stickers: StickerSpec[] = [
    { node: <Illustration name="kursi" className="w-full" />, label: 'Stiker kursi', size: 12 },
    { kind: 'burst', text: 'ayo!', label: 'Stiker "ayo!"' },
    { node: <Illustration name="tiket" className="w-full" />, label: 'Stiker tiket', size: 12 },
    { node: <Illustration name="camera" className="w-full" />, label: 'Stiker kamera', size: 12 },
    { kind: 'bubble', text: 'halo!', label: 'Stiker "halo!"' },
    { node: <Illustration name="coins" className="w-full" />, label: 'Stiker koin', size: 12 },
  ]

  return (
    <main>
      <h1 className="sr-only">Summarevent: satu pass untuk semua event Summarecon Mall Bandung</h1>
      <StickerSlap
        wordmark="summarevent"
        badge={{
          label: live ? 'live' : 'demo',
          href: other?.href,
          title: live ? 'Versi live: semua HP memakai data yang sama di server. Buka versi demo.' : other ? 'Versi demo: data di browser ini. Buka versi live untuk uji dua HP.' : 'Versi demo: data di browser ini, pembayaran dan WA/email disimulasikan.',
        }}
        centre={
          <>
            <CoBrand tone="dark" className="max-sm:hidden" />
            <BrandLockup className="h-6 min-[400px]:h-7 sm:hidden" />
          </>
        }
        menu={
          <>
            <p className="ssf-mhead">{live ? 'Versi live' : 'Prototipe'}</p>
            <p className="ssf-mnote">{live ? 'Semua HP dan laptop memakai data yang sama di server. Buka denah yang sama di dua HP dan rebut kursinya.' : 'Data contoh di browser ini. Bayar, OTP, dan WA/email disimulasikan, bukan transaksi sungguhan.'}</p>
            <div className="ssf-msep" />
            <button type="button" className="ssf-mi" onClick={() => void reset()}>
              <RotateCcw aria-hidden /> Reset data demo
            </button>
            {other && (
              <a className="ssf-mi" href={other.href}>
                <ExternalLink aria-hidden /> {other.label}
                <span className="ssf-mnote" style={{ marginTop: 0 }}>
                  · {other.hint}
                </span>
              </a>
            )}
            <div className="ssf-msep" />
            <p className="ssf-mhead">Tim Summarevent</p>
            <dl className="ssf-mcred">
              {CREDITS.map(([role, name]) => (
                <div key={role} className="contents">
                  <dt>{role}</dt>
                  <dd>{name}</dd>
                </div>
              ))}
            </dl>
          </>
        }
        notch={{ tabs: ['Pilih peran', 'Tim'], value: tab, onChange: setTab, label: 'Isi panel' }}
        stickers={stickers}
      >
        <div className="ssf-slides" style={{ transform: `translateX(${-tab * 100}%)` }}>
          <section className="ssf-slide" aria-label="Pilih peran" inert={tab !== 0}>
            <div className="h-full">
              <Afiche posters={posters} label="Kipas poster: satu untuk tiap cara masuk; geser untuk mengocok, klik untuk membuka" />
            </div>
          </section>
          <section className="ssf-slide" aria-label="Tim" inert={tab !== 1}>
            <TeamSlide open={tab === 1} />
          </section>
        </div>
      </StickerSlap>
    </main>
  )
}
