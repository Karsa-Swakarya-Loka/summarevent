import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAccount } from '@/hooks/useLive'
import { onboardingDone } from '@/lib/intro'
import { useNavStack } from '@/lib/navStack'

/**
 * Petugas: phone-sized, in the visitor app's visual language (ink pills, borderless cards), except the scanner page,
 * which goes full-screen and dark on its own. Signed out, it sends the petugas to their onboarding (first time on
 * this device) or the sign-in, and back to the page afterwards.
 */
export function StaffLayout() {
  const user = useAccount('STAFF')
  const { pathname, search } = useLocation()
  useNavStack()
  const scanning = pathname.startsWith('/staff/scan/')
  // portal dialogs and toasts sit outside this tree, so the shell is marked on body too
  useEffect(() => {
    if (scanning) return
    document.body.dataset.shell = 'staff'
    return () => {
      delete document.body.dataset.shell
    }
  }, [scanning])
  if (!user) {
    const next = encodeURIComponent(pathname + search)
    return <Navigate to={`/staff/${onboardingDone('staff') ? 'masuk' : 'mulai'}?next=${next}`} replace />
  }
  return (
    <div className="min-h-dvh bg-[#efece6]" data-shell={scanning ? undefined : 'staff'}>
      <div className="mx-auto min-h-dvh w-full max-w-md bg-background">
        <Outlet />
      </div>
    </div>
  )
}
