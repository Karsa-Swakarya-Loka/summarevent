/**
 * "Satu kursi, satu pemesan": how the system keeps one seat from being sold twice
 * (brief: "Jelaskan atau demonstrasikan pencegahan pemesanan ganda"). Mirrors PRD §8.
 */
import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const POINTS = [
  {
    title: 'Ditahan sekaligus',
    body: 'Semua kursi satu pesanan ditahan dalam satu transaksi. Kalau satu saja sudah diambil orang, tidak ada yang ditahan dan pemesan langsung dapat saran kursi terdekat.',
  },
  {
    title: 'Terlihat oleh semua',
    body: 'Kursi yang ditahan langsung tampil Sedang dipesan di layar semua orang, lalu Tersedia lagi kalau waktu tahannya habis.',
  },
  {
    title: 'Dicek ulang saat konfirmasi',
    body: 'Tiket hanya terbit kalau kursinya masih ditahan pesananmu. Satu kursi tidak bisa punya dua tiket di sesi yang sama.',
  },
  {
    title: 'Satu pembayaran per percobaan',
    body: 'Tombol bayar yang tertekan dua kali tetap tercatat satu pembayaran.',
  },
] as const

export function DoubleBookingPoints({ className }: { className?: string }) {
  return (
    <div className={className}>
      <ol className="flex flex-col gap-3">
        {POINTS.map((p, i) => (
          <li key={p.title} className="flex gap-3 text-sm">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand" aria-hidden>
              {i + 1}
            </span>
            <span>
              <span className="block font-semibold">{p.title}</span>
              <span className="text-muted-foreground">{p.body}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
        Diuji otomatis: 100 permintaan bersamaan untuk 1 kursi, hanya 1 yang berhasil.
      </p>
    </div>
  )
}

/** Small text button that opens the explanation (visitor seat map). */
export function DoubleBookingButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn('inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-brand underline-offset-2 hover:underline', className)}
      >
        <ShieldCheck className="size-4" aria-hidden /> Kenapa satu kursi tidak bisa terjual dua kali?
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Satu kursi, satu pemesan</DialogTitle>
            <DialogDescription>Empat lapis yang menjaga kursimu. Coba dengan tombol Uji rebutan kursi di denah.</DialogDescription>
          </DialogHeader>
          <DoubleBookingPoints />
        </DialogContent>
      </Dialog>
    </>
  )
}
