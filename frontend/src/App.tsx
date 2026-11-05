import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { Toaster } from '@/components/ui/sonner'
import { VisitorLayout } from '@/layouts/VisitorLayout'
import { roleSplash } from '@/lib/splash'
import NotFound from '@/pages/NotFound'
import RolePicker from '@/pages/RolePicker'
import EventDetail from '@/pages/visitor/EventDetail'
import Home from '@/pages/visitor/Home'
import SeatSelect from '@/pages/visitor/SeatSelect'
import { screen } from '@/screens'

/**
 * Panitia and petugas screens load on demand, so a visitor's phone never downloads the
 * dashboard charts or the QR scanner.
 */
function page(load: () => Promise<{ default: ComponentType }>) {
  const Page = lazy(load)
  return (
    <Suspense fallback={<Loading />}>
      <Page />
    </Suspense>
  )
}

/**
 * The outline of a page while its code arrives. The router shows it too when a link opens straight on a screen that
 * loads on demand (a ticket, the panitia, the petugas), so a slow phone never stares at a blank page.
 */
function Loading() {
  return (
    <div className="flex flex-col gap-3 p-6" role="status" aria-busy="true" aria-label="Memuat halaman">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}

// their shells too: the panitia sidebar, event switcher and search stay off a visitor's phone. Opened straight on an
// admin or petugas link, the shell starts loading at once, beside the sample data
const adminLayout = () => import('@/layouts/AdminLayout').then((m) => ({ Component: m.AdminLayout }))
const staffLayout = () => import('@/layouts/StaffLayout').then((m) => ({ Component: m.StaffLayout }))
if (typeof location !== 'undefined') {
  if (/^\/admin(\/|$)/.test(location.pathname)) void adminLayout()
  else if (/^\/staff(\/|$)/.test(location.pathname)) void staffLayout()
}

const AdminDashboard = () => import('@/pages/admin/Dashboard')
const AdminEvents = () => import('@/pages/admin/Events')
const EventWizard = () => import('@/pages/admin/EventWizard')
const LiveSeats = () => import('@/pages/admin/LiveSeats')
const AdminOrders = () => import('@/pages/admin/Orders')
const ReceiptQueue = () => import('@/pages/admin/ReceiptQueue')
const AdminStaff = () => import('@/pages/admin/Staff')
const StaffHome = () => import('@/pages/staff/StaffHome')
const Scanner = () => import('@/pages/staff/Scanner')
const ManualSearch = () => import('@/pages/staff/ManualSearch')
const DeskReceipts = () => import('@/pages/staff/DeskReceipts')
// first-run and sign-in screens: seen once, so they load on demand too
const VisitorOnboarding = () => import('@/pages/Onboarding').then((m) => ({ default: () => <m.default role="visitor" /> }))
const AdminOnboarding = () => import('@/pages/Onboarding').then((m) => ({ default: () => <m.default role="admin" /> }))
const StaffOnboarding = () => import('@/pages/Onboarding').then((m) => ({ default: () => <m.default role="staff" /> }))
const SignIn = () => import('@/pages/visitor/Auth').then((m) => ({ default: () => <m.default mode="masuk" /> }))
const SignUp = () => import('@/pages/visitor/Auth').then((m) => ({ default: () => <m.default mode="daftar" /> }))
const AdminSignIn = () => import('@/pages/RoleSignIn').then((m) => ({ default: () => <m.default role="ADMIN" /> }))
const StaffSignIn = () => import('@/pages/RoleSignIn').then((m) => ({ default: () => <m.default role="STAFF" /> }))
const ForgotPassword = () => import('@/pages/PasswordReset').then((m) => ({ default: m.ForgotPassword }))
const ResetPassword = () => import('@/pages/PasswordReset').then((m) => ({ default: m.ResetPassword }))

/**
 * Routes
 *  /                          role picker (DM-01)
 *  /app/...                   visitor (mobile-first); /app/mulai onboarding, /app/masuk and /app/daftar sign-in
 *  /admin/...                 panitia (desktop-first, works on phone); /admin/mulai onboarding, /admin/masuk sign-in
 *  /staff/...                 petugas (mobile, scanner); /staff/mulai onboarding, /staff/masuk sign-in
 */
const router = createBrowserRouter([
  { path: '/', element: <RolePicker /> },
  {
    path: '/app',
    element: <VisitorLayout />,
    hydrateFallbackElement: <Loading />,
    children: [
      { index: true, element: <Home /> },
      { path: 'e/:slug', element: <EventDetail /> },
      { path: 'e/:slug/s/:sessionId', element: <SeatSelect /> },
      { path: 'checkout/:orderId', lazy: screen('checkout') },
      { path: 'orders/:orderId', lazy: screen('order') },
      { path: 'pass', lazy: screen('pass') },
      { path: 'pass/:ticketId', lazy: screen('ticket') },
      { path: 'inbox', lazy: screen('inbox') },
      { path: 'inbox/:noteId', lazy: screen('message') },
      { path: 'akun', lazy: screen('account') },
      { path: 'akun/profil', lazy: screen('profile') },
      { path: 'mulai', element: page(VisitorOnboarding) },
      { path: 'masuk', element: page(SignIn) },
      { path: 'daftar', element: page(SignUp) },
    ],
  },
  { path: '/admin/mulai', element: page(AdminOnboarding) },
  { path: '/admin/masuk', element: page(AdminSignIn) },
  { path: '/staff/mulai', element: page(StaffOnboarding) },
  { path: '/staff/masuk', element: page(StaffSignIn) },
  { path: '/lupa-sandi', element: page(ForgotPassword) },
  { path: '/reset', element: page(ResetPassword) },
  {
    path: '/admin',
    lazy: adminLayout,
    hydrateFallbackElement: <Loading />,
    children: [
      { index: true, element: page(AdminDashboard) },
      { path: 'events', element: page(AdminEvents) },
      { path: 'events/new', element: page(EventWizard) },
      { path: 'events/:eventId/edit', element: page(EventWizard) },
      { path: 'live', element: page(LiveSeats) },
      { path: 'orders', element: page(AdminOrders) },
      { path: 'receipts', element: page(ReceiptQueue) },
      { path: 'staff', element: page(AdminStaff) },
    ],
  },
  {
    path: '/staff',
    lazy: staffLayout,
    hydrateFallbackElement: <Loading />,
    children: [
      { index: true, element: page(StaffHome) },
      { path: 'scan/:sessionId', element: page(Scanner) },
      { path: 'search/:sessionId', element: page(ManualSearch) },
      { path: 'receipts', element: page(DeskReceipts) },
    ],
  },
  { path: '*', element: <NotFound /> },
])

// entering a role from inside the app (the role picker) plays its splash, once per session
router.subscribe((state) => roleSplash(state.location.pathname))

/** Phones dismiss a toast with a swipe; only a mouse gets the small close button. */
const finePointer = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster position="top-center" richColors closeButton={finePointer} />
    </>
  )
}
