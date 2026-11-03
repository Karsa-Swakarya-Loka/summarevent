import { useEffect, useState } from 'react'
import { NavLink, Outlet, ScrollRestoration, useLocation, useNavigationType } from 'react-router'
import { Home, Inbox, Ticket, UserRound } from 'lucide-react'
import { DemoMenu } from '@/components/common/DemoMenu'
import { NotificationWatcher } from '@/components/visitor/AppSetup'
import { useNavStack } from '@/lib/navStack'
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

  // installed on a phone, the status bar takes the colour of the top of the screen: green Beranda, cream elsewhere
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    meta?.setAttribute('content', /^\/app\/?$/.test(pathname) ? '#006426' : '#fbfaf7')
    return () => meta?.setAttribute('content', '#006426')
  }, [pathname])

  return (
    <div className="min-h-dvh overflow-x-clip bg-[#efece6]" data-shell="visitor">
      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background shadow-sm">
        <main key={pathname} className={cn('flex flex-1 flex-col', screen.motion, tabRoot && 'pb-[calc(var(--spacing-nav)+1.5rem)]')}>
          <Outlet />
        </main>
        {tabRoot ? (
          // the Demo button docks beside the navigation instead of floating over the page
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-md gap-2 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] *:pointer-events-auto">
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
          !fullScreen && <DemoMenu className="bottom-4 left-4" />
        )}
        <NotificationWatcher />
      </div>
      <ScrollRestoration />
    </div>
  )
}
