import { useId, useRef, useState, type DragEvent } from 'react'
import { AlertCircle, ImagePlus, LoaderCircle, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { POSTER_IMAGE_MAX } from '@/domain/rules'
import { posterPhoto } from '@/lib/image'
import { cn } from '@/lib/utils'

/**
 * The event's own poster picture (AD-01): pick or drop a photo, see it as the poster, change or remove it. The photo is
 * shrunk in the browser before it is kept, so a big phone photo is fine. Without one the generated poster applies.
 */
export function PosterImageField({ value, onChange, error }: { value: string | null; onChange: (image: string | null) => void; error?: string }) {
  const inputId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const message = problem ?? error

  const take = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setProblem(null)
    try {
      onChange(await posterPhoto(file, POSTER_IMAGE_MAX))
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Gambar tidak bisa dipakai. Pilih gambar lain.')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }
  const drop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    void take(e.dataTransfer.files[0])
  }
  const pick = () => input.current?.click()

  return (
    <div>
      <input
        ref={input}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void take(e.target.files?.[0])}
      />
      {value ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <img src={value} alt="Gambar poster event" className="aspect-[16/9] w-full rounded-xl bg-muted object-cover shadow-[0_1px_2px_rgb(35_31_32/0.05)] sm:w-80 lg:w-96" />
          <div className="flex gap-2 sm:w-44 sm:flex-col">
            <Button type="button" variant="outline" className="h-11 flex-1 sm:flex-none" onClick={pick} disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : <RefreshCw />} Ganti gambar
            </Button>
            <Button type="button" variant="ghost" className="h-11 flex-1 text-status-invalid hover:text-status-invalid sm:flex-none" onClick={() => onChange(null)} disabled={busy}>
              <Trash2 aria-hidden /> Hapus gambar
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
          disabled={busy}
          aria-describedby={message ? `${inputId}-error` : undefined}
          className={cn(
            'flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-card px-4 py-6 text-center transition focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
            over ? 'border-brand bg-brand-soft' : 'border-border hover:border-foreground/30',
          )}
        >
          {busy ? <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-hidden /> : <ImagePlus className="size-6 text-muted-foreground" aria-hidden />}
          <span className="text-sm font-semibold">{busy ? 'Menyiapkan gambar…' : 'Unggah gambar poster'}</span>
          <span className="text-xs text-muted-foreground">JPG, PNG, atau WebP. Paling pas gambar mendatar, misalnya 1600 × 900.</span>
        </button>
      )}
      {message && (
        <p id={`${inputId}-error`} role="alert" className="mt-2 flex items-start gap-1 text-xs font-medium text-status-invalid">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {message}
        </p>
      )}
    </div>
  )
}
