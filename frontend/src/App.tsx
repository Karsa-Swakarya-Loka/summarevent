import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AdminLayout } from '@/layouts/AdminLayout'
import { StaffLayout } from '@/layouts/StaffLayout'
import { VisitorLayout } from '@/layouts/VisitorLayout'
import NotFound from '@/pages/NotFound'
import RolePicker from '@/pages/RolePicker'
import Account from '@/pages/visitor/Account'
import Checkout from '@/pages/visitor/Checkout'
import EventDetail from '@/pages/visitor/EventDetail'
import Home from '@/pages/visitor/Home'
import Inbox from '@/pages/visitor/Inbox'
import MyPass from '@/pages/visitor/MyPass'
import OrderStatus from '@/pages/visitor/OrderStatus'
import SeatSelect from '@/pages/visitor/SeatSelect'

/**
 * Panitia and petugas screens load on demand, so a visitor's phone never downloads the
 * dashboard charts or the QR scanner.
 */
function page(load: () => Promise<{ default: ComponentType }>) {
  const Page = lazy(load)
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-3 p-6" aria-busy="true" aria-label="Memuat halaman">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      }
    >
      <Page />
    </Suspense>
  )
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

/**
 * Routes
 *  /                          role picker (DM-01)
 *  /app/...                   visitor (mobile-first)
 *  /admin/...                 panitia (desktop-first, works on phone)
 *  /staff/...                 petugas (mobile, scanner)
 */
const router = createBrowserRouter([
  { path: '/', element: <RolePicker /> },
  {
    path: '/app',
    element: <VisitorLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'e/:slug', element: <EventDetail /> },
      { path: 'e/:slug/s/:sessionId', element: <SeatSelect /> },
      { path: 'checkout/:orderId', element: <Checkout /> },
      { path: 'orders/:orderId', element: <OrderStatus /> },
      { path: 'pass', element: <MyPass /> },
      { path: 'inbox', element: <Inbox /> },
      { path: 'akun', element: <Account /> },
    ],
  },
  {
    path: '/admin',
    element: <AdminLayout />,
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
    element: <StaffLayout />,
    children: [
      { index: true, element: page(StaffHome) },
      { path: 'scan/:sessionId', element: page(Scanner) },
      { path: 'search/:sessionId', element: page(ManualSearch) },
      { path: 'receipts', element: page(DeskReceipts) },
    ],
  },
  { path: '*', element: <NotFound /> },
])

/** Phones dismiss a toast with a swipe; only a mouse gets the small close button. */
const finePointer = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches

export default function App() {
  return (
    <TooltipProvider>
      <RouterProvider router={router} />
      <Toaster position="top-center" richColors closeButton={finePointer} />
    </TooltipProvider>
  )
}
