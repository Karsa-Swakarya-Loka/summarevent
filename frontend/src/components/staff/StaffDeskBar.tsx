import { Link, NavLink, useLocation, useNavigate } from 'react-router'
import { LogOut, ReceiptText, ScanLine } from 'lucide-react'
import { api } from '@/api'
import { BrandLockup } from '@/components/common/Brand'
import { DemoMenu } from '@/components/common/DemoMenu'
import { clearOfflineManifests } from '@/components/staff/offline'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/staff', label: 'Pilih sesi', icon: ScanLine, on: (p: string) => p === '/staff' || p.startsWith('/staff/search/') },
  { to: '/staff/receipts', label: 'Struk di desk', icon: ReceiptText, on: (p: string) => p.startsWith('/staff/receipts') },
]

/**
 * Laptop top bar of the petugas desk (lg and up): brand, the two desk screens, Demo and Keluar. Below lg it is hidden
 * and each screen carries its own header, as on the phone.
 */
export function StaffDeskBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const path = pathname.replace(/\/$/, '') || '/'
  return (
    <header data-desk-bar className="sticky top-0 z-40 hidden h-(--spacing-desk-bar) border-b border-ink/8 bg-background/90 backdrop-blur-xl lg:block">
      <div className="mx-auto flex h-full w-full max-w-6xl items-center gap-6 px-8">
        <Link to="/staff" aria-label="Summarevent, pilih sesi" className="shrink-0">
          <BrandLockup className="h-7" />
        </Link>
        <nav aria-label="Menu petugas" className="min-w-0 flex-1">
          <ul className="flex items-center gap-1">
            {NAV.map(({ to, label, icon: Icon, on }) => {
              const active = on(path)
              return (
                <li key={to}>
                  <NavLink
                    to={to}
                    end
                    aria-current={active ? 'page' : undefined}
                    className={cn('flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition', active ? 'bg-ink text-white' : 'text-ink/70 hover:bg-ink/5 hover:text-ink')}
                  >
                    <Icon className="size-4" aria-hidden />
                    {label}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="flex items-center gap-1">
          <DemoMenu variant="bar" />
          <button
            type="button"
            onClick={() => {
              api.logout('STAFF')
              clearOfflineManifests()
              navigate('/staff/masuk', { replace: true })
            }}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink/75 hover:bg-ink/5 hover:text-ink"
          >
            <LogOut className="size-4" aria-hidden /> Keluar
          </button>
        </div>
      </div>
    </header>
  )
}
