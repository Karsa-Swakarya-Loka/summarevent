import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { unlockAudio } from '@/components/staff/beep'
import { StaffDeskBar } from '@/components/staff/StaffDeskBar'
import { useAccount } from '@/hooks/useLive'
import { onboardingDone } from '@/lib/intro'
import { useNavStack } from '@/lib/navStack'
import { cn } from '@/lib/utils'

/**
 * Petugas: phone-sized, in the visitor app's visual language (ink pills, borderless cards), except the scanner page,
 * which goes full-screen and dark on its own. On a laptop (lg) it is a desk console: a top bar, and each screen lays
 * itself out wide. Signed out, it sends the petugas to their onboarding (first time on
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
    // any tap on a petugas page unlocks the scan beep, so the first camera scan is heard too (iOS needs a tap first)
    <div className={cn('min-h-dvh bg-[#efece6]', !scanning && 'lg:bg-background')} data-shell={scanning ? undefined : 'staff'} onPointerDown={unlockAudio}>
      {!scanning && <StaffDeskBar />}
      <div className={cn('mx-auto min-h-dvh w-full max-w-md bg-background', !scanning && 'lg:min-h-[calc(100dvh-var(--spacing-desk-bar))] lg:max-w-none')}>
        <Outlet />
      </div>
    </div>
  )
}
