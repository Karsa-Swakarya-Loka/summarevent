/** Photos picked on the phone, made small enough to send: drawn onto a canvas and saved as JPEG. */

function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Foto tidak bisa dibaca. Coba ambil ulang fotonya.'))
    img.src = url
  }).finally(() => URL.revokeObjectURL(url))
}

/** Part of the image (sx, sy, sw, sh) drawn at w × h on white, as a JPEG data URL. */
function toJpeg(img: HTMLImageElement, [sx, sy, sw, sh]: [number, number, number, number], w: number, h: number, quality: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Browser tidak bisa memproses foto.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}

/** A receipt: longest side at most `max` px, so it stays readable and the upload stays small. */
export async function shrinkPhoto(file: File, max = 1000): Promise<string> {
  const img = await loadImage(file)
  const iw = img.naturalWidth || 1
  const ih = img.naturalHeight || 1
  const scale = Math.min(1, max / Math.max(iw, ih))
  return toJpeg(img, [0, 0, iw, ih], Math.max(1, Math.round(iw * scale)), Math.max(1, Math.round(ih * scale)), 0.82)
}

/** A profile photo: the middle square of the picture, `size` px a side. */
export async function squarePhoto(file: File, size = 320): Promise<string> {
  const img = await loadImage(file)
  const iw = img.naturalWidth || 1
  const ih = img.naturalHeight || 1
  const side = Math.min(iw, ih)
  return toJpeg(img, [(iw - side) / 2, (ih - side) / 2, side, side], size, size, 0.85)
}

/** Files a poster picture may be picked from; anything else is refused before it is read. */
const POSTER_TYPES = ['image/jpeg', 'image/png', 'image/webp']
/** A picture bigger than this is refused before decoding: it would only be shrunk anyway, and decoding it is slow. */
const POSTER_FILE_MAX = 15 * 1024 * 1024
/** About 40 megapixels: above this, decoding alone can run a low-end phone out of memory. */
const POSTER_PIXELS_MAX = 40_000_000

/**
 * An event poster picture: longest side at most `max` px, as a JPEG data URL of at most `limit` characters. The
 * quality steps down until it fits, then the size does, so a large photo still ends up small enough to store.
 */
export async function posterPhoto(file: File, limit: number, max = 1080): Promise<string> {
  if (!POSTER_TYPES.includes(file.type)) throw new Error('Pilih gambar JPG, PNG, atau WebP.')
  if (file.size > POSTER_FILE_MAX) throw new Error('Gambar lebih dari 15 MB. Pilih gambar yang lebih kecil.')
  const img = await loadImage(file)
  const iw = img.naturalWidth || 1
  const ih = img.naturalHeight || 1
  // drawing a huge photo needs hundreds of MB on a phone; refuse it before it is drawn
  if (iw * ih > POSTER_PIXELS_MAX) throw new Error('Resolusi gambar terlalu besar. Pilih gambar lain atau perkecil dulu.')
  for (let side = max; side >= 480; side = Math.round(side * 0.75)) {
    const scale = Math.min(1, side / Math.max(iw, ih))
    const w = Math.max(1, Math.round(iw * scale))
    const h = Math.max(1, Math.round(ih * scale))
    for (const quality of [0.82, 0.72, 0.6]) {
      const url = toJpeg(img, [0, 0, iw, ih], w, h, quality)
      if (url.length <= limit) return url
    }
  }
  throw new Error('Gambar terlalu besar untuk dipakai. Pilih gambar lain.')
}
