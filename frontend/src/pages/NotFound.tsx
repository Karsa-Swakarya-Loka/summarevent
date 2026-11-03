import { Link } from 'react-router'
import { Illustration } from '@/components/common/Illustration'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-10 text-center">
      <div className="relative grid size-56 place-items-center overflow-hidden rounded-[2.5rem] bg-brand-soft">
        <div className="seat-dots absolute inset-0 text-brand/15" aria-hidden />
        <Illustration name="search" className="relative w-48 animate-pop" />
      </div>
      <p className="mt-8 text-sm font-bold tracking-wide text-brand uppercase">404</p>
      <h1 className="mt-1 text-[1.75rem] leading-tight font-extrabold tracking-tight text-balance">Halaman ini tidak ada di denah</h1>
      <p className="mt-2 max-w-xs text-base text-muted-foreground">Mungkin link-nya salah ketik atau sudah tidak dipakai. Kembali ke awal untuk memilih event.</p>
      <Button asChild size="lg" className="mt-6 h-12 px-6 text-base">
        <Link to="/">Kembali ke halaman awal</Link>
      </Button>
    </div>
  )
}
