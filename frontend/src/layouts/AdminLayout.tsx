import { useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router'
import { Bell, ChevronRight, ChevronsUpDown, LogOut, Menu, Search, X } from 'lucide-react'
import { api } from '@/api'
import type { EventSummary } from '@/api/contract'
import { CommandPalette } from '@/components/admin/CommandPalette'
import { EventSwitcher } from '@/components/admin/EventSwitcher'
import { ADMIN_NAV, EVENT_PAGES, pickEventId, rememberEventId, ticketedEvents, type AdminOutlet } from '@/components/admin/lib'
import { BrandAppIcon } from '@/components/common/Brand'
import { DemoMenu } from '@/components/common/DemoMenu'
import { Poster } from '@/components/common/Poster'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAccount, useLive } from '@/hooks/useLive'
import { onboardingDone } from '@/lib/intro'
import { cn } from '@/lib/utils'

/** The shortcut as this keyboard prints it: ⌘K on a Mac, Ctrl K elsewhere (the judges' laptops are mostly Windows). */
const SHORTCUT = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K'

/** The page's name in the breadcrumb, from the nav; deeper pages add their own last crumb. */
function crumbsFor(pathname: string): Array<{ label: string; to?: string }> {
  const item = [...ADMIN_NAV].sort((a, b) => b.to.length - a.to.length).find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)))
  const crumbs: Array<{ label: string; to?: string }> = []
  if (item && !item.end) crumbs.push({ label: item.label, to: item.to })
  if (/^\/admin\/events\/new/.test(pathname)) crumbs.push({ label: 'Buat event' })
  else if (/^\/admin\/events\/[^/]+\/edit/.test(pathname)) crumbs.push({ label: 'Edit event' })
  else if (item?.end) crumbs.push({ label: item.label })
  else if (item) crumbs[crumbs.length - 1] = { label: item.label }
  return crumbs
}

/**
 * Panitia shell, laid out like a floating dashboard: the sidebar is a card beside the white page with the account on
 * top, search, the menu, and the event in view at the foot; the page opens with a breadcrumb that names that event.
 * The event comes from `?event=` or the one chosen last on this device, and every page gets it through the outlet
 * context (useAdminEvent). On a phone the sidebar is a drawer. Signed out, it sends the visitor of an admin page to
 * the panitia onboarding (first time on this device) or the sign-in, and brings them back to that page afterwards.
 */
export function AdminLayout() {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const [params, setParams] = useSearchParams()
  // the drawer remembers the path it opened on, so it is closed again on any other page
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => setOpenOn((typeof v === 'function' ? v(open) : v) ? pathname : null)
  const [palette, setPalette] = useState(false)
  const user = useAccount('ADMIN')

  // pages load only once signed in, so the backend never sees a request without a token
  const pending = useLive(() => api.admin.listReceipts('PENDING').then((r) => r.length), [], { enabled: !!user })
  const events = useLive(() => api.admin.listEvents(), [], { intervalMs: 15000, enabled: !!user })
  const list = ticketedEvents(events.data)
  const eventId = pickEventId(list, params.get('event'))
  const summary = list.find((e) => e.event.id === eventId)
  useEffect(() => {
    if (eventId) rememberEventId(eventId)
  }, [eventId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!user) {
    const next = encodeURIComponent(pathname + search)
    return <Navigate to={`/admin/${onboardingDone('admin') ? 'masuk' : 'mulai'}?next=${next}`} replace />
  }

  const ctx: AdminOutlet = {
    events: events.data,
    eventsError: events.error,
    reloadEvents: events.reload,
    list,
    eventId,
    summary,
    setEventId: (id) => {
      rememberEventId(id)
      if (EVENT_PAGES.includes(pathname)) {
        setParams(
          (p) => {
            const n = new URLSearchParams(p)
            n.set('event', id)
            n.delete('session')
            return n
          },
          { replace: true },
        )
      } else navigate(`/admin?event=${id}`)
    },
  }

  const signOut = () => {
    api.logout('ADMIN')
    navigate('/')
  }
  const crumbs = crumbsFor(pathname)

  const sidebar = (
    <div className="flex h-full flex-col gap-3 p-3">
      <AccountMenu user={user} onSignOut={signOut} />

      <button type="button" onClick={() => setPalette(true)} className="flex h-11 items-center gap-2.5 rounded-xl bg-panel px-3 text-left text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground">
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="flex-1">Cari cepat</span>
        <kbd className="rounded-md bg-card px-1.5 py-0.5 font-sans text-[0.68rem] font-semibold text-muted-foreground ring-1 ring-foreground/10 pointer-coarse:hidden">{SHORTCUT}</kbd>
      </button>

      <nav className="flex flex-col gap-0.5" aria-label="Menu panitia">
        {ADMIN_NAV.map(({ to, label, icon: Icon, end, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn('flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition', isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground/80 hover:bg-panel hover:text-foreground')
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="size-[1.125rem] shrink-0" aria-hidden />
                <span className="flex-1">{label}</span>
                {badge && !!pending.data && <span className={cn('rounded-md px-1.5 py-0.5 text-[0.68rem] font-bold tabular-nums', isActive ? 'bg-white/20 text-white' : 'bg-brand-yellow text-ink')}>{pending.data}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-2">
        {/* the demo shortcuts sit in the sidebar (the drawer on a phone), never floating over a table or a form */}
        <DemoMenu variant="row" />
        <button type="button" onClick={signOut} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition hover:bg-panel hover:text-foreground">
          <LogOut className="size-[1.125rem]" aria-hidden /> Keluar
        </button>
        <EventSwitcher ctx={ctx} variant="card" />
      </div>
    </div>
  )

  return (
    <div className="min-h-dvh bg-card lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-4 lg:p-4">
      <aside className="hidden lg:sticky lg:top-4 lg:block lg:h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:rounded-2xl lg:bg-card lg:shadow-[0_1px_2px_rgb(35_31_32/0.06),0_12px_32px_-20px_rgb(35_31_32/0.35)] lg:ring-1 lg:ring-foreground/[0.07]">
        {sidebar}
      </aside>

      {/* phone: a top bar with the menu button, and the sidebar as a drawer */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-card/95 px-2 backdrop-blur lg:hidden">
        <button type="button" className="flex size-11 items-center justify-center rounded-xl hover:bg-panel" onClick={() => setOpen((v) => !v)} aria-label={open ? 'Tutup menu' : 'Buka menu'} aria-expanded={open}>
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
        <Breadcrumb crumbs={crumbs} compact />
        <button type="button" onClick={() => setPalette(true)} className="ml-auto flex size-11 items-center justify-center rounded-xl hover:bg-panel" aria-label="Cari cepat">
          <Search className="size-5" />
        </button>
        <Link to="/admin/receipts" className="relative flex size-11 items-center justify-center rounded-xl hover:bg-panel" aria-label={pending.data ? `Struk menunggu: ${pending.data}` : 'Verifikasi struk'}>
          <Bell className="size-5" />
          {!!pending.data && <Badge n={pending.data} />}
        </Link>
      </header>
      {open && (
        // under the bar, so its X stays in sight and closes the drawer where it opened it
        <div className="fixed inset-x-0 top-14 bottom-0 z-40 lg:hidden" role="dialog" aria-label="Menu panitia">
          <button type="button" className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} aria-label="Tutup menu" />
          <div className="absolute inset-y-3 left-3 w-[18rem] max-w-[calc(100%-1.5rem)] animate-slide-in overflow-y-auto rounded-2xl bg-card shadow-2xl [--slide-from:-24px]">{sidebar}</div>
        </div>
      )}

      <div className="min-w-0 lg:flex lg:flex-col">
        {/* as wide as the pages (max-w-7xl), so on a wide screen the breadcrumb starts where the page does */}
        <div className="mx-auto hidden w-full max-w-7xl items-center gap-3 px-1 pt-1 pb-4 lg:flex">
          <Breadcrumb crumbs={crumbs} event={summary} />
          <Link
            to="/admin/receipts"
            className="relative ml-auto flex size-10 items-center justify-center rounded-xl bg-card ring-1 ring-foreground/10 transition hover:bg-panel"
            aria-label={pending.data ? `Struk menunggu: ${pending.data}` : 'Verifikasi struk'}
          >
            <Bell className="size-[1.125rem]" />
            {!!pending.data && <Badge n={pending.data} />}
          </Link>
        </div>
        <main className="min-w-0 p-4 pb-24 lg:p-0 lg:pb-16">
          {/* tooltips are a panitia thing (desktop icon buttons), so their provider lives here, not on a visitor's phone */}
          <TooltipProvider>
            <Outlet context={ctx} />
          </TooltipProvider>
        </main>
      </div>

      <CommandPalette open={palette} onOpenChange={setPalette} />
    </div>
  )
}

function Badge({ n }: { n: number }) {
  return (
    <span className="absolute -top-1 -right-1 grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full bg-status-invalid px-1 text-[0.62rem] font-bold text-white ring-2 ring-card" aria-hidden>
      {n}
    </span>
  )
}

const Sep = () => <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />

/** "Pentas Musikal … › Pesanan & peserta": the event in view, then the page. */
function Breadcrumb({ crumbs, event, compact = false }: { crumbs: Array<{ label: string; to?: string }>; event?: EventSummary; compact?: boolean }) {
  return (
    <nav aria-label="Lokasi halaman" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
        {!compact && (
          <>
            <li className="flex min-w-0 items-center gap-1.5">
              {event ? (
                <Link to={`/admin?event=${event.event.id}`} className="-mx-1 flex min-h-11 min-w-0 items-center gap-1.5 px-1 hover:text-foreground">
                  <Poster theme={event.event.posterTheme} palette={event.event.posterPalette} image={event.event.posterImage} title={event.event.title} bare className="h-5 w-7 shrink-0 rounded-md" />
                  <span className="max-w-[16rem] truncate">{event.event.title}</span>
                </Link>
              ) : (
                <>
                  <BrandAppIcon className="size-5 rounded-md" />
                  Summarevent
                </>
              )}
            </li>
          </>
        )}
        {crumbs.map((c, i) => (
          <li key={c.label} className="flex min-w-0 items-center gap-1.5">
            {(!compact || i > 0) && <Sep />}
            {c.to && i < crumbs.length - 1 ? (
              <Link to={c.to} className="-mx-1 flex min-h-11 min-w-11 items-center justify-center truncate px-1 hover:text-foreground">
                {c.label}
              </Link>
            ) : (
              <span className="truncate font-semibold text-foreground" aria-current="page">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

/** The panitia account on top of the sidebar, as a menu: who is signed in, the visitor app, sign out. */
function AccountMenu({ user, onSignOut }: { user: { name: string; email?: string | null }; onSignOut: () => void }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex min-h-12 w-full items-center gap-2.5 rounded-xl px-2 text-left transition hover:bg-panel">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-white" aria-hidden>
            {user.name[0]}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-semibold">{user.name.replace(/\s*\(demo\)\s*$/i, '')}</span>
            <span className="block truncate text-xs text-muted-foreground">{user.email ?? 'Panitia SUMMABA'}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="sr-only">, menu akun</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm font-semibold">{user.name}</span>
          <span className="block text-xs text-muted-foreground">{user.email ?? 'Panitia SUMMABA'}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/app">Buka aplikasi pengunjung</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/staff">Buka app petugas</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut}>
          <LogOut /> Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
