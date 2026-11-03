import { useState } from 'react'
import { useNavigate } from 'react-router'
import { FlaskConical, Play, RotateCcw, ScanLine, Store, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiMode } from '@/api'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { setOnboardingDone } from '@/lib/intro'
import { cn } from '@/lib/utils'

/**
 * Demo switcher (DM-01/DM-02): jump between roles, replay the onboarding, reset the sample data. Floats in a corner,
 * or docks beside the visitor's navigation so it never covers the page.
 */
export function DemoMenu({ className, docked = false }: { className?: string; docked?: boolean }) {
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  const go = async (role: 'VISITOR' | 'ADMIN' | 'STAFF') => {
    if (role !== 'VISITOR') await api.demoLogin(role)
    navigate(role === 'VISITOR' ? '/app' : role === 'ADMIN' ? '/admin' : '/staff')
  }

  const reset = async () => {
    setBusy(true)
    try {
      await api.demo.reset()
      toast.success('Data demo sudah dikembalikan ke awal.')
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
              docked
                ? 'flex w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[1.75rem] bg-card text-[0.7rem] font-semibold text-ink shadow-xl shadow-ink/15 ring-1 ring-ink/10 hover:bg-muted'
                : 'fixed z-40 flex h-11 items-center gap-1.5 rounded-full bg-ink/90 px-3 text-xs font-semibold text-white shadow-lg ring-1 ring-white/10 backdrop-blur hover:bg-ink',
              className,
            )}
            aria-label="Menu demo"
          >
            <FlaskConical className={docked ? 'size-5 text-brand-orange' : 'size-4'} aria-hidden /> Demo
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel>{apiMode === 'live' ? 'Versi live (data bersama)' : 'Mode demo juri'}</DropdownMenuLabel>
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
          <DropdownMenuItem onClick={() => navigate('/')}>Halaman pilih role</DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setOnboardingDone(false)
              navigate('/app/mulai')
            }}
          >
            <Play /> Lihat pengenalan lagi
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}>
            <RotateCcw /> Reset data demo
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset data demo?</DialogTitle>
            <DialogDescription>
              {apiMode === 'live'
                ? 'Versi live dipakai bersama: semua pesanan, struk, dan check-in dari semua HP dihapus, lalu data contoh dimuat ulang.'
                : 'Semua pesanan, struk, dan check-in yang dibuat di browser ini dihapus, lalu data contoh dimuat ulang.'}
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
