import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { CalendarDays, LayoutDashboard, LogOut, Menu, ReceiptText, Rows3, UserCog, Users, X } from 'lucide-react'
import { api } from '@/api'
import { BrandLockup, SummabaLogo } from '@/components/common/Brand'
import { DemoMenu } from '@/components/common/DemoMenu'
import { useLive } from '@/hooks/useLive'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/events', label: 'Event', icon: CalendarDays },
  { to: '/admin/live', label: 'Peta kursi live', icon: Rows3 },
  { to: '/admin/orders', label: 'Pesanan & peserta', icon: Users },
  { to: '/admin/receipts', label: 'Verifikasi struk', icon: ReceiptText, badge: true },
  { to: '/admin/staff', label: 'Petugas', icon: UserCog },
]

export function AdminLayout() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [user, setUser] = useState(() => api.currentUser('ADMIN'))

  useEffect(() => {
    if (!user) void api.demoLogin('ADMIN').then(setUser)
  }, [user])

  // Pages load only after the demo login, so the backend never sees a request without a token.
  const pending = useLive(() => api.admin.listReceipts('PENDING').then((r) => r.length), [], { enabled: !!user })

  const nav = (
    <nav className="flex flex-col gap-1" aria-label="Menu panitia">
      {NAV.map(({ to, label, icon: Icon, end, badge }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            cn(
              'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium',
              isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )
          }
        >
          <Icon className="size-4.5" aria-hidden />
          <span className="flex-1">{label}</span>
          {badge && !!pending.data && (
            <span className="rounded-full bg-status-warn px-2 py-0.5 text-[0.7rem] font-bold text-ink">{pending.data}</span>
          )}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[248px_1fr]">
      {/* sticky so the menu stays in reach on long pages; bottom padding keeps the Demo button off "Keluar" */}
      <aside className="hidden border-r bg-sidebar lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-6 lg:overflow-y-auto lg:p-4 lg:pb-16">
        <div className="flex flex-col gap-2 px-2 pt-1">
          <BrandLockup className="h-auto w-full max-w-[12.5rem] self-start" />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            untuk <SummabaLogo className="h-6 text-xs" />
          </div>
        </div>
        {nav}
        <div className="mt-auto rounded-lg border p-3 text-xs">
          <div className="font-semibold">{user?.name ?? 'Panitia'}</div>
          <div className="text-muted-foreground">Panitia · akses demo</div>
          <button
            type="button"
            className="mt-1 inline-flex min-h-9 items-center gap-1 text-muted-foreground hover:text-foreground pointer-coarse:min-h-11"
            onClick={() => {
              api.logout('ADMIN')
              navigate('/')
            }}
          >
            <LogOut className="size-3.5" /> Keluar
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/95 px-3 backdrop-blur lg:hidden">
        <button type="button" className="flex size-11 items-center justify-center rounded-lg hover:bg-muted" onClick={() => setOpen((v) => !v)} aria-label="Buka menu">
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
        <BrandLockup className="h-6" />
        <span className="ml-auto text-xs text-muted-foreground">Panitia</span>
      </header>
      {open && <div className="border-b bg-card p-3 lg:hidden">{nav}</div>}

      <main className="min-w-0 p-4 pb-24 lg:p-8">
        {user ? <Outlet /> : <p className="py-16 text-center text-sm text-muted-foreground">Menyiapkan akses panitia…</p>}
      </main>
      <DemoMenu className="bottom-4 left-4" />
    </div>
  )
}
