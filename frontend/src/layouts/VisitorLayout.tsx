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

/** Phone-sized shell with a bottom navigation (hidden during checkout to keep one main action per screen). */
export function VisitorLayout() {
  const { pathname } = useLocation()
  const hideNav = pathname.includes('/checkout/') || /\/e\/[^/]+\/s\//.test(pathname)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="min-h-dvh bg-[#efece6]">
      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background shadow-sm">
        <main className={cn('flex-1', !hideNav && 'pb-20')}>
          <Outlet />
        </main>
        {!hideNav && (
          <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="Navigasi utama">
            <ul className="grid grid-cols-4">
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      cn('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-medium', isActive ? 'text-brand' : 'text-muted-foreground')
                    }
                  >
                    <Icon className="size-5" aria-hidden />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <DemoMenu className={hideNav ? 'bottom-4 left-4' : 'bottom-20 left-3'} />
        <NotificationWatcher />
      </div>
    </div>
  )
}
