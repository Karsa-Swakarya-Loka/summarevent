import { useState } from 'react'
import { useNavigate } from 'react-router'
import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiMode } from '@/api'
import { BrandLockup, CoBrand } from '@/components/common/Brand'
import { Illustration } from '@/components/common/Illustration'
import { Afiche, type PosterSpec } from '@/components/landing/Afiche'
import { StickerSlap, type StickerSpec } from '@/components/landing/StickerSlap'
import { TEAM } from '@/components/landing/team'
import { TeamSlide } from '@/components/landing/TeamSlide'
import { setOnboardingDone, type IntroRole } from '@/lib/intro'

const CREDITS: ReadonlyArray<readonly [string, string]> = [
  ...TEAM.map((m) => [m.role, m.name] as const),
  ['ilustrasi', 'fun-isometric oleh Kelvin Adithya'],
  ['e-ticket & poster', 'Talón dan Afiche oleh Moxen'],
  ['poster tim', 'Crumple Changelog oleh Kedhareswer'],
]

/** Masuk goes straight to the role's sign-in; Daftar shows the role's pengenalan first, then signing up. */
const MASUK: Record<IntroRole, string> = { visitor: '/app/masuk', admin: '/admin/masuk', staff: '/staff/masuk' }
const DAFTAR: Record<IntroRole, string> = { visitor: '/app/mulai?daftar=1', admin: '/admin/mulai?daftar=1', staff: '/staff/mulai?daftar=1' }

const MENU_ITEM = 'flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-sm font-semibold transition-colors hover:bg-muted [&_svg]:size-4.5 [&_svg]:shrink-0'

/**
 * DM-01: one link, three roles, so judges can try every side of the system. The Sticker Slap landing: on the green
 * panel a notch switches between the fan of posters (one per role, each with Masuk and Daftar) and the team's
 * crumpling posters; the wordmark writes itself along the bottom with our stickers on it. One door: the demo badge is a
 * watermark, not a link to another version; the menu holds the reset and the credits. Each role opens with its splash.
 */
export default function RolePicker() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<0 | 1>(0)
  const live = apiMode === 'live'
  // coming back (Back from a sign-in), the fan opens on the poster that was chosen, not on the middle one
  const [lastRole] = useState(readLastRole)

  const masuk = (role: IntroRole) => {
    // signing in skips the pengenalan; Daftar shows it
    rememberRole(role)
    setOnboardingDone(true, role)
    navigate(MASUK[role])
  }
  const daftar = (role: IntroRole) => {
    rememberRole(role)
    setOnboardingDone(false, role)
    navigate(DAFTAR[role])
  }
  const reset = async () => {
    if (live && !window.confirm('Data ini dipakai bersama semua HP. Reset akan menghapus pesanan dan check-in dari semua HP. Lanjut?')) return
    await api.demo.reset()
    toast.success('Data contoh dikembalikan ke awal.')
  }

  const poster = (role: IntroRole, spec: Omit<PosterSpec, 'key' | 'actions'>): PosterSpec => ({
    ...spec,
    key: role,
    actions: [
      { label: `Masuk sebagai ${spec.title.toLowerCase()}`, onClick: () => masuk(role) },
      { label: `Daftar sebagai ${spec.title.toLowerCase()}`, onClick: () => daftar(role) },
    ],
  })
  // the circle Panitia → Pengunjung → Petugas; the fan starts on the middle one, the visitor
  const posters: PosterSpec[] = [
    poster('admin', { variant: 'negro', word: 'Event', title: 'Panitia', art: <Illustration name="notes" className="w-full" still /> }),
    poster('visitor', { variant: 'crema', word: 'Kursi', title: 'Pengunjung', art: <Illustration name="kursi" className="w-full" still /> }),
    poster('staff', { variant: 'ambar', word: 'Scan', title: 'Petugas', art: <Illustration name="camera" className="w-full" still /> }),
  ]

  // still stickers: nothing on the landing loops while the fan is swiped
  const stickers: StickerSpec[] = [
    { node: <Illustration name="kursi" className="w-full" still />, label: 'Stiker kursi', size: 12 },
    { node: <Illustration name="tiket" className="w-full" still />, label: 'Stiker tiket', size: 12 },
    { node: <Illustration name="camera" className="w-full" still />, label: 'Stiker kamera', size: 12 },
    { node: <Illustration name="coins" className="w-full" still />, label: 'Stiker koin', size: 12 },
  ]

  return (
    <main>
      <h1 className="sr-only">Summarevent, tiket event Summarecon Mall Bandung</h1>
      <StickerSlap
        wordmark="summarevent"
        className="sev-landing"
        badge={{
          label: live ? 'live' : 'demo',
          title: live ? 'Terhubung ke server Summarevent. Pembayaran, OTP, dan WA/email masih simulasi.' : 'Versi cadangan: data tersimpan di browser ini. Pembayaran, OTP, dan WA/email disimulasikan.',
        }}
        centre={
          <>
            <CoBrand tone="dark" className="max-sm:hidden" />
            <BrandLockup className="h-6 min-[400px]:h-7 sm:hidden" />
          </>
        }
        menu={
          <div className="grid gap-3 text-ink">
            <div>
              <p className="text-base font-extrabold">{live ? 'Prototype' : 'Versi cadangan'}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{live ? 'Terhubung ke server. Pembayaran, OTP, dan WA/email masih simulasi.' : 'Data tersimpan di browser ini. Pembayaran, OTP, dan WA/email disimulasikan.'}</p>
            </div>
            <div className="-mx-2.5 grid border-y py-1.5">
              <button type="button" className={MENU_ITEM} onClick={() => void reset()}>
                <RotateCcw aria-hidden /> Reset data contoh
              </button>
            </div>
            <div>
              <p className="text-base font-extrabold">Tim Summarevent</p>
              <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm leading-snug">
                {CREDITS.map(([role, name]) => (
                  <div key={role} className="contents">
                    <dt className="text-muted-foreground">{role}</dt>
                    <dd className="font-semibold">{name}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        }
        notch={{ tabs: ['Pilih peran', 'Tim'], value: tab, onChange: setTab, label: 'Isi panel' }}
        stickers={stickers}
      >
        <div className="ssf-slides" style={{ transform: `translateX(${-tab * 100}%)` }}>
          <section className="ssf-slide" aria-label="Pilih peran" inert={tab !== 0}>
            <div className="h-full">
              <Afiche posters={posters} label="Poster tiap peran" start={lastRole ? posters.findIndex((p) => p.key === lastRole) : undefined} />
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

/** The role whose poster was last used on this tab, so Back lands on it again. Per tab, gone when the tab closes. */
const LAST_ROLE_KEY = 'sev-landing-role'
const ROLES: ReadonlyArray<IntroRole> = ['visitor', 'admin', 'staff']

function readLastRole(): IntroRole | null {
  try {
    const v = sessionStorage.getItem(LAST_ROLE_KEY)
    return ROLES.find((r) => r === v) ?? null
  } catch {
    return null
  }
}

function rememberRole(role: IntroRole) {
  try {
    sessionStorage.setItem(LAST_ROLE_KEY, role)
  } catch {
    /* storage blocked: Back opens on the middle poster */
  }
}
