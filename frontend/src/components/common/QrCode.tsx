import { useMemo } from 'react'
import { encode } from 'uqr'

/** The e-ticket QR as crisp SVG, from the same encoder as the ticket card, so the zoomed code shows the same pattern. */
export function QrCode({ value, className }: { value: string; className?: string }) {
  const qr = useMemo(() => {
    const q = encode(value, { ecc: 'M', border: 0 })
    let d = ''
    q.data.forEach((row, y) => row.forEach((on, x) => on && (d += `M${x} ${y}h1v1h-1z`)))
    return { d, n: q.size }
  }, [value])
  return (
    <svg viewBox={`0 0 ${qr.n} ${qr.n}`} className={className} role="img" aria-label="QR e-ticket" shapeRendering="crispEdges">
      <path d={qr.d} fill="#14241a" />
    </svg>
  )
}
