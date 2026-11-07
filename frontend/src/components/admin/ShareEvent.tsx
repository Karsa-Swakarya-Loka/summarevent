/** AD-11: public link + QR for the event poster (copy link, download QR as PNG). */
import { useRef, useState } from 'react'
import { Check, Copy, Download, ExternalLink } from 'lucide-react'
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import type { EventItem } from '@/domain/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { finePointer } from '@/lib/pointer'
import { cn } from '@/lib/utils'
import { downloadDataUrl, publicEventUrl } from './lib'

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = w
    } else line = test
  }
  if (line) lines.push(line)
  return lines.slice(0, 3)
}

export function ShareEventPanel({ event, className }: { event: Pick<EventItem, 'slug' | 'title' | 'status' | 'infoOnly'>; className?: string }) {
  const url = publicEventUrl(event.slug)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Link event disalin.')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const input = document.getElementById(`share-url-${event.slug}`) as HTMLInputElement | null
      input?.select()
      toast.error('Browser menolak menyalin otomatis. Link sudah ditandai, tekan Ctrl+C / ⌘C.')
    }
  }

  const download = () => {
    const qr = canvasRef.current
    if (!qr) return
    // Poster-ready PNG: brand frame, title, QR and the link underneath.
    const W = 720
    const H = 900
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#006426'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.roundRect(40, 40, W - 80, H - 80, 32)
    ctx.fill()
    ctx.fillStyle = '#f26f22'
    ctx.font = '700 22px "Plus Jakarta Sans Variable", system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(event.infoOnly ? 'SCAN UNTUK INFO EVENT' : 'SCAN UNTUK PESAN TIKET', W / 2, 105)
    ctx.fillStyle = '#231f20'
    ctx.font = '800 34px "Plus Jakarta Sans Variable", system-ui, sans-serif'
    const lines = wrapText(ctx, event.title, W - 160)
    lines.forEach((l, i) => ctx.fillText(l, W / 2, 155 + i * 42))
    const top = 155 + lines.length * 42
    const size = 440
    ctx.drawImage(qr, (W - size) / 2, top, size, size)
    ctx.fillStyle = '#6b6560'
    ctx.font = '500 20px "Plus Jakarta Sans Variable", system-ui, sans-serif'
    ctx.fillText(url.replace(/^https?:\/\//, ''), W / 2, top + size + 48)
    ctx.fillStyle = '#006426'
    ctx.font = '700 22px "Plus Jakarta Sans Variable", system-ui, sans-serif'
    ctx.fillText('Summarevent · Summarecon Mall Bandung', W / 2, H - 80)
    downloadDataUrl(c.toDataURL('image/png'), `qr-${event.slug}.png`)
    toast.success('QR poster diunduh (PNG).')
  }

  return (
    <div className={cn('flex flex-col items-center gap-4 sm:flex-row sm:items-start', className)}>
      <div className="shrink-0 rounded-2xl bg-white p-3 ring-1 ring-border">
        <QRCodeSVG value={url} size={168} level="M" marginSize={0} fgColor="#231f20" title={`QR link ${event.title}`} />
        <QRCodeCanvas ref={canvasRef} value={url} size={440} level="M" marginSize={1} fgColor="#231f20" className="hidden" aria-hidden />
      </div>
      <div className="flex w-full min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`share-url-${event.slug}`} className="text-sm font-semibold">
            Link publik event
          </label>
          <div className="flex gap-2">
            <Input id={`share-url-${event.slug}`} readOnly value={url} className="h-11 min-w-0 font-mono text-xs sm:h-10" onFocus={(e) => e.currentTarget.select()} />
            <Button variant="outline" size="icon-lg" className="size-11 sm:size-10" onClick={() => void copy()} aria-label="Salin link">
              {copied ? <Check className="text-status-valid" /> : <Copy />}
            </Button>
          </div>
          {event.status === 'DRAFT' && <p className="text-xs font-medium text-[#7a5600]">Event masih draft: link baru bisa dibuka pengunjung setelah dipublikasikan.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="lg" className="h-11 sm:h-10" onClick={download}>
            <Download /> Unduh QR (PNG)
          </Button>
          <Button variant="outline" size="lg" className="h-11 sm:h-10" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink /> Buka halaman
            </a>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Tempel QR di poster atau unggah link ke Instagram. Pengunjung langsung masuk ke halaman event.</p>
      </div>
    </div>
  )
}

export function ShareEventDialog({ event, open, onOpenChange }: { event: Pick<EventItem, 'slug' | 'title' | 'status' | 'infoOnly'> | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-xl"
        // the first field is the link: focusing it on a phone selects it and can open the keyboard, so touch starts on the dialog itself
        onOpenAutoFocus={(e) => {
          if (finePointer()) return
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Link & QR poster</DialogTitle>
          <DialogDescription className="line-clamp-2">{event?.title}</DialogDescription>
        </DialogHeader>
        {event && <ShareEventPanel event={event} />}
      </DialogContent>
    </Dialog>
  )
}
