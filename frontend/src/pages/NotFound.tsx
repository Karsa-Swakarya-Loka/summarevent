import { Link } from 'react-router'
import { Illustration } from '@/components/common/Illustration'
import { Button } from '@/components/ui/button'

export default function NotFound() {
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
        <Link to="/">Kembali ke halaman awal</Link>
      </Button>
    </div>
  )
}
