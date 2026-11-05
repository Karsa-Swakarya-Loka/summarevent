import { Link, useLocation } from 'react-router'
import { Illustration } from '@/components/common/Illustration'
import { Button } from '@/components/ui/button'

/** A wrong link takes each role back to its own home: a visitor to Beranda, not to the role picker. */
function homeFor(pathname: string): { to: string; label: string } {
  if (/^\/app(\/|$)/.test(pathname)) return { to: '/app', label: 'Kembali ke Beranda' }
  if (/^\/admin(\/|$)/.test(pathname)) return { to: '/admin', label: 'Kembali ke dashboard' }
  if (/^\/staff(\/|$)/.test(pathname)) return { to: '/staff', label: 'Kembali ke beranda petugas' }
  return { to: '/', label: 'Kembali ke halaman awal' }
}

export default function NotFound() {
  const home = homeFor(useLocation().pathname)
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-10 text-center" data-shell="intro">
      <div className="relative grid size-56 place-items-center overflow-hidden rounded-[2.5rem] bg-brand-soft">
        <div className="seat-dots absolute inset-0 text-brand/15" aria-hidden />
        <Illustration name="search" className="relative w-48 animate-pop" />
      </div>
      <p className="mt-8 text-[0.7rem] font-bold tracking-[0.18em] text-muted-foreground uppercase">404</p>
      <h1 className="mt-1.5 font-poster text-[2.5rem] leading-[0.95] text-balance uppercase">Halaman ini tidak ada di denah</h1>
      <p className="mt-2 max-w-xs text-base text-muted-foreground">Link-nya mungkin salah ketik atau sudah tidak dipakai.</p>
      <Button asChild size="lg" className="mt-6 h-12 px-6 text-base">
        <Link to={home.to}>{home.label}</Link>
      </Button>
    </div>
  )
}
