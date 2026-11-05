import { useEffect, useState } from 'react'
import { NavLink, Outlet, ScrollRestoration, useLocation, useNavigationType } from 'react-router'
import { Home, Inbox, Ticket, UserRound } from 'lucide-react'
import { BrandLockup } from '@/components/common/Brand'
import { DemoMenu } from '@/components/common/DemoMenu'
import { NotificationWatcher } from '@/components/visitor/AppSetup'
import { useNavStack } from '@/lib/navStack'
import { prefetchScreens } from '@/screens'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/app', label: 'Beranda', icon: Home, end: true },
  { to: '/app/pass', label: 'Pass Saya', icon: Ticket },
  { to: '/app/inbox', label: 'Pesan', icon: Inbox },
  { to: '/app/akun', label: 'Akun', icon: UserRound },
]
/** The four tab screens. Every other screen is pushed on top of them: it has a back button and no tab bar. */
const TAB_ROOT = /^\/app(\/(pass|inbox|akun))?\/?$/

/**
 * Phone shell of the visitor app. Tab screens carry the floating tab bar; pushed screens (event, seats, checkout, order)
 * get the whole screen and one main action. Screens change like in a native app: a pushed screen slides in from the
 * right, going back slides from the left, tabs cross-fade.
 */
export function VisitorLayout() {
  const location = useLocation()
  const { pathname } = location
  const navType = useNavigationType()
  useNavStack()
  const fullScreen = /^\/app\/(mulai|masuk|daftar)\/?$/.test(pathname)
  const tabRoot = TAB_ROOT.test(pathname)
  const active = NAV.findIndex(({ to, end }) => (end ? pathname.replace(/\/$/, '') === to : pathname.startsWith(to)))

  // the screen's entrance, worked out when the path changes; the first screen just appears
  const [screen, setScreen] = useState({ path: pathname, motion: '' })
  if (screen.path !== pathname) {
    const back = navType === 'POP' || !!(location.state as { back?: boolean } | null)?.back
    setScreen({
      path: pathname,
      motion: back ? 'animate-screen-pop' : TAB_ROOT.test(screen.path) && tabRoot ? 'animate-screen-fade' : 'animate-screen-push',
    })
  }

  useEffect(() => prefetchScreens(), [])

  // dialogs and sheets render in a portal outside this layout: the body carries the visitor look for them too
  useEffect(() => {
    document.body.dataset.shell = 'visitor'
    return () => {
      delete document.body.dataset.shell
    }
  }, [])

  // installed on a phone, the status bar takes the colour of the top of the screen: green Beranda, cream elsewhere
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    meta?.setAttribute('content', /^\/app\/?$/.test(pathname) ? '#006426' : '#fbfaf7')
    return () => meta?.setAttribute('content', '#006426')
  }, [pathname])

  return (
    <div className="min-h-dvh overflow-x-clip bg-[#efece6] lg:bg-background" data-shell="visitor">
      {/* on a laptop the app is a website: one top bar with the four sections, and each screen lays itself out wide */}
      {!fullScreen && <DeskBar />}
      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background shadow-sm lg:min-h-[calc(100dvh-var(--spacing-desk-bar))] lg:max-w-none lg:shadow-none">
        <main key={pathname} className={cn('flex flex-1 flex-col', screen.motion, tabRoot && 'pb-[calc(var(--spacing-nav)+1.5rem)] lg:pb-16')}>
          <Outlet />
        </main>
        {tabRoot ? (
          // the Demo button docks beside the navigation instead of floating over the page
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-md gap-2 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] *:pointer-events-auto lg:hidden">
            <DemoMenu variant="docked" />
            <nav className="relative flex-1 rounded-[1.75rem] bg-ink/95 p-1.5 shadow-xl shadow-ink/25 backdrop-blur" aria-label="Navigasi utama">
              {active >= 0 && (
                <span
                  aria-hidden
                  className="absolute inset-y-1.5 left-1.5 w-[calc((100%-0.75rem)/4)] rounded-[1.35rem] bg-brand-yellow transition-transform duration-300 ease-(--ease-soft)"
                  style={{ transform: `translateX(${active * 100}%)` }}
                />
              )}
              <ul className="relative grid grid-cols-4">
                {NAV.map(({ to, label, icon: Icon, end }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={end}
                      className={({ isActive }) =>
                        cn(
                          'flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[1.35rem] text-[0.7rem] font-semibold transition active:scale-95',
                          isActive ? 'text-ink' : 'text-white/75 hover:text-white',
                        )
                      }
                    >
                      <Icon className="size-5" aria-hidden />
                      {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        ) : (
          !fullScreen && <DemoMenu className="bottom-4 left-4 lg:hidden" />
        )}
        <NotificationWatcher />
      </div>
      <ScrollRestoration />
    </div>
  )
}

/** Laptop top bar: brand, the four sections, the demo menu. Hidden below lg, where the floating tab bar does this job. */
function DeskBar() {
  const { pathname } = useLocation()
  return (
    <header data-desk-bar className="sticky top-0 z-40 hidden h-(--spacing-desk-bar) border-b border-ink/8 bg-background/90 backdrop-blur-xl lg:block">
      <div className="mx-auto flex h-full w-full max-w-6xl items-center gap-8 px-8">
        <NavLink to="/app" aria-label="Summarevent, Beranda" className="shrink-0">
          <BrandLockup className="h-7" />
        </NavLink>
        <nav aria-label="Navigasi utama" className="flex-1">
          <ul className="flex items-center gap-1">
            {NAV.map(({ to, label, icon: Icon, end }) => {
              const on = end ? pathname.replace(/\/$/, '') === to : pathname.startsWith(to)
              return (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    aria-current={on ? 'page' : undefined}
                    className={cn(
                      'flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition',
                      on ? 'bg-ink text-white' : 'text-ink/70 hover:bg-ink/5 hover:text-ink',
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {label}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>
        <DemoMenu variant="bar" />
      </div>
    </header>
  )
}
