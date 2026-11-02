import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-5xl font-extrabold text-brand">404</div>
      <p className="text-muted-foreground">Halaman tidak ditemukan.</p>
      <Button asChild size="lg">
        <Link to="/">Kembali ke halaman awal</Link>
      </Button>
    </div>
  )
}
