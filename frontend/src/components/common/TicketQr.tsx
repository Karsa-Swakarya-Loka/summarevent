import { QRCodeSVG } from 'qrcode.react'
import { cn } from '@/lib/utils'

/** The e-ticket QR. Its own module, so the QR encoder only ships with the screens that show one. */
export function TicketQr({ value, size = 200, className }: { value: string; size?: number; className?: string }) {
  return (
    <div className={cn('rounded-xl bg-white p-3', className)}>
      <QRCodeSVG value={value} size={size} level="M" marginSize={0} fgColor="#231f20" bgColor="#ffffff" title="QR e-ticket" />
    </div>
  )
}
