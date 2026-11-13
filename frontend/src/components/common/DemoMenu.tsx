import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Play, RotateCcw, ScanLine, Store, UserRound, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiMode } from '@/api'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { setOnboardingDone, type IntroRole } from '@/lib/intro'
import { markSplashSeen } from '@/lib/splash'
import { cn } from '@/lib/utils'

/**
 * Demo switcher (DM-01/DM-02): jump between roles, replay the onboarding, reset the sample data. It docks beside the
 * visitor's tab bar, sits in the app bar of a screen that has one, is a row of the panitia sidebar, and floats in a
 * corner elsewhere (hidden by CSS while an app bar carries it), so it never covers the page.
 */
export function DemoMenu({ className, variant = 'float' }: { className?: string; variant?: 'float' | 'docked' | 'bar' | 'row' }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  // the onboarding to replay is the one of the role on screen
  const here: IntroRole = pathname.startsWith('/admin') ? 'admin' : pathname.startsWith('/staff') ? 'staff' : 'visitor'

  // a shortcut for judges: straight into the role, past its splash, onboarding and sign-in (demo account)
  const go = async (role: 'VISITOR' | 'ADMIN' | 'STAFF') => {
    const to = role === 'VISITOR' ? '/app' : role === 'ADMIN' ? '/admin' : '/staff'
    if (role !== 'VISITOR') await api.demoLogin(role)
    markSplashSeen(to)
    setOnboardingDone(true, role === 'VISITOR' ? 'visitor' : role === 'ADMIN' ? 'admin' : 'staff')
    navigate(to)
  }

  const reset = async () => {
    setBusy(true)
    try {
      await api.demo.reset()
      toast.success('Data contoh sudah dikembalikan ke awal.')
      setConfirm(false)
      navigate('/')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* not modal: the page behind stays reachable, nothing is hidden from screen readers */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'transition-transform active:scale-95',
              variant === 'docked'
                ? 'flex w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[1.75rem] bg-card text-[0.7rem] font-semibold text-ink shadow-xl shadow-ink/15 ring-1 ring-ink/10 hover:bg-muted'
                : variant === 'bar'
                  ? 'inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full px-3 text-xs font-bold text-[#c2410c] hover:bg-muted max-[379px]:px-0'
                  : variant === 'row'
                    ? 'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-[#c2410c] hover:bg-panel active:scale-100'
                    : 'fixed z-40 flex h-11 items-center gap-1.5 rounded-full bg-ink/90 px-3 text-xs font-semibold text-white shadow-lg ring-1 ring-white/10 backdrop-blur hover:bg-ink',
              className,
            )}
            aria-label="Menu pintasan"
            {...(variant === 'bar' ? { 'data-demo-header': '' } : variant === 'float' ? { 'data-demo-float': '' } : {})}
          >
            <Zap className={variant === 'docked' ? 'size-5 text-brand-orange' : variant === 'row' ? 'size-[1.125rem]' : 'size-4'} aria-hidden />
            {/* in an app bar on a narrow phone the flask alone leaves the title its room */}
            <span className={cn(variant === 'bar' && 'max-[379px]:sr-only')}>Pintasan</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={variant === 'bar' ? 'end' : 'start'} side={variant === 'row' ? 'top' : undefined} className="w-60">
          <DropdownMenuLabel>{apiMode === 'live' ? 'Akun contoh siap pakai' : 'Versi cadangan (data di browser ini)'}</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => void go('VISITOR')}>
            <UserRound /> Masuk sebagai Pengunjung
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void go('ADMIN')}>
            <Store /> Masuk sebagai Panitia
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void go('STAFF')}>
            <ScanLine /> Masuk sebagai Petugas
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate('/')}>Halaman pilih peran</DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setOnboardingDone(false, here)
              navigate(here === 'admin' ? '/admin/mulai' : here === 'staff' ? '/staff/mulai' : '/app/mulai')
            }}
          >
            <Play /> Lihat pengenalan lagi
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}>
            <RotateCcw /> Reset data contoh
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset data contoh?</DialogTitle>
            <DialogDescription>
              {apiMode === 'live'
                ? 'Data ini dipakai bersama: semua pesanan, struk, dan check-in dari semua HP dihapus, lalu data contoh dimuat ulang. Setelah itu kamu perlu masuk lagi.'
                : 'Semua pesanan, struk, dan check-in yang dibuat di browser ini dihapus, lalu data contoh dimuat ulang. Setelah itu kamu perlu masuk lagi.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => setConfirm(false)}>
              Batal
            </Button>
            <Button variant="destructive" size="lg" disabled={busy} onClick={() => void reset()}>
              Reset sekarang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
