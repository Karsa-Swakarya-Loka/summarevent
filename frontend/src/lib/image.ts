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
