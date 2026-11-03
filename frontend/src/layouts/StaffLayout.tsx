import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { api } from '@/api'
import { DemoMenu } from '@/components/common/DemoMenu'
import { useNavStack } from '@/lib/navStack'

/** Petugas: phone-sized, no decoration. The scanner page goes full-screen on its own. */
export function StaffLayout() {
  const [user, setUser] = useState(() => api.currentUser('STAFF'))
  const { pathname } = useLocation()
  useNavStack()
  useEffect(() => {
    if (!user) void api.demoLogin('STAFF').then(setUser)
  }, [user])
  const scanning = pathname.startsWith('/staff/scan/')
  return (
    <div className="min-h-dvh bg-[#efece6]">
      <div className="mx-auto min-h-dvh w-full max-w-md bg-background">
        {user ? <Outlet /> : <p className="py-16 text-center text-sm text-muted-foreground">Menyiapkan akses petugas…</p>}
      </div>
      {!scanning && <DemoMenu className="bottom-4 left-4" />}
    </div>
  )
}
