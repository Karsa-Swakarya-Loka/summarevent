import { NavLink, Outlet, useLocation } from 'react-router'
import { Home, Inbox, Ticket, UserRound } from 'lucide-react'
import { DemoMenu } from '@/components/common/DemoMenu'
import { NotificationWatcher } from '@/components/visitor/AppSetup'
import { cn } from '@/lib/utils'
import { useEffect } from 'react'

const NAV = [
  { to: '/app', label: 'Beranda', icon: Home, end: true },
  { to: '/app/pass', label: 'Pass Saya', icon: Ticket },
  { to: '/app/inbox', label: 'Pesan', icon: Inbox },
  { to: '/app/akun', label: 'Akun', icon: UserRound },
]

/** Phone-sized shell with a floating bottom navigation (hidden during checkout to keep one main action per screen). */
export function VisitorLayout() {
  const { pathname } = useLocation()
  // full-screen steps (onboarding, sign-in) and the checkout keep one main action on screen
  const fullScreen = /^\/app\/(mulai|masuk|daftar)\/?$/.test(pathname)
  const hideNav = fullScreen || pathname.includes('/checkout/') || /\/e\/[^/]+\/s\//.test(pathname)
  const active = NAV.findIndex(({ to, end }) => (end ? pathname.replace(/\/$/, '') === to : pathname.startsWith(to)))
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="min-h-dvh bg-[#efece6]">
      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background shadow-sm">
        {/* room for the floating navigation */}
        <main className={cn('flex-1', !hideNav && 'pb-[calc(var(--spacing-nav)+1.5rem)]')}>
          <Outlet />
        </main>
        {hideNav ? (
          !fullScreen && <DemoMenu className="bottom-4 left-4" />
        ) : (
          // the Demo button docks beside the navigation instead of floating over the page
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-md gap-2 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] *:pointer-events-auto">
            <DemoMenu docked />
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
                          'flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[1.35rem] text-[0.7rem] font-semibold transition-colors',
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
        )}
        <NotificationWatcher />
      </div>
    </div>
  )
}
