/** PV-16: read a receipt photo in the browser (tesseract.js, loaded only when asked). */
import { parseReceiptText, type ReceiptReading } from '@/domain/ocr'
import type { Tenant } from '@/domain/types'

/** OCR works on raster images: draw the photo (or the SVG sample receipt) on a canvas, upscaled. */
async function rasterize(url: string): Promise<string> {
  const img = new Image()
  // a stored photo comes from the API's own address; asking with CORS keeps the canvas readable
  if (/^https?:/i.test(url)) img.crossOrigin = 'anonymous'
  img.src = url
  await img.decode()
  const w0 = img.naturalWidth || 320
  const h0 = img.naturalHeight || 440
  const scale = Math.min(3, Math.max(1, 1400 / Math.max(w0, h0)))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w0 * scale)
  canvas.height = Math.round(h0 * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Browser tidak bisa memproses foto.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

export async function readReceiptPhoto(photoUrl: string, tenants: Tenant[], onProgress?: (p: number) => void): Promise<ReceiptReading> {
  const image = await rasterize(photoUrl)
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('ind', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress)
    },
  })
  try {
    const { data } = await worker.recognize(image)
    return parseReceiptText(data.text, tenants)
  } finally {
    await worker.terminate()
  }
}
