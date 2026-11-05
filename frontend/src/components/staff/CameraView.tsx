import './zxing'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Flashlight, FlashlightOff, ZoomIn, ZoomOut } from 'lucide-react'
import { Scanner, type IDetectedBarcode, type IScannerError, type IScannerHandle } from '@yudiel/react-qr-scanner'
import { cn } from '@/lib/utils'
import type { CameraProblem } from './camera'

/** Extra camera capabilities not (yet) in lib.dom. */
type ExtCapabilities = MediaTrackCapabilities & { torch?: boolean; zoom?: { min: number; max: number; step?: number } }
type ExtSettings = MediaTrackSettings & { torch?: boolean; zoom?: number }

const CONSTRAINTS: MediaTrackConstraints = { facingMode: 'environment' }
const FORMATS: BarcodeFormat[] = ['qr_code']
const STYLES = {
  container: { position: 'absolute', inset: 0, width: '100%', height: '100%', aspectRatio: 'auto' },
  video: { width: '100%', height: '100%', objectFit: 'cover' },
} as const
const COMPONENTS = { finder: false, torch: false, zoom: false, onOff: false } as const

/**
 * Rear camera + QR detection (PT-02). Static frame, no animation, library sound off
 * (we beep per result). Torch and zoom buttons appear only when the camera supports them.
 */
export function CameraView({ onToken, onProblem }: { onToken: (token: string) => void; onProblem: (kind: CameraProblem, message: string) => void }) {
  const scannerRef = useRef<IScannerHandle>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)
  const [live, setLive] = useState(false)
  const [torch, setTorch] = useState<{ supported: boolean; on: boolean }>({ supported: false, on: false })
  const [zoom, setZoom] = useState<{ min: number; max: number; step: number; value: number } | null>(null)

  const onTokenRef = useRef(onToken)
  const onProblemRef = useRef(onProblem)
  useEffect(() => {
    onTokenRef.current = onToken
    onProblemRef.current = onProblem
  }, [onToken, onProblem])

  const handleScan = useCallback((codes: IDetectedBarcode[]) => {
    const value = codes.find((c) => c.rawValue)?.rawValue
    if (value) onTokenRef.current(value)
  }, [])

  const handleError = useCallback((e: IScannerError) => {
    onProblemRef.current(e.kind, e.message)
  }, [])

  // The scanner has no "started" callback: watch for the live video track, then read its capabilities.
  useEffect(() => {
    const t = setInterval(() => {
      const track = scannerRef.current?.getStream()?.getVideoTracks()[0] ?? null
      if (!track || track.readyState !== 'live') {
        if (trackRef.current) {
          trackRef.current = null
          setLive(false)
        }
        return
      }
      if (track === trackRef.current) return
      trackRef.current = track
      setLive(true)
      const caps = (track.getCapabilities?.() ?? {}) as ExtCapabilities
      const settings = track.getSettings() as ExtSettings
      setTorch({ supported: !!caps.torch, on: !!settings.torch })
      if (caps.zoom && caps.zoom.max > caps.zoom.min) {
        const range = caps.zoom.max - caps.zoom.min
        setZoom({ min: caps.zoom.min, max: caps.zoom.max, step: Math.max(caps.zoom.step || 0.1, range / 6), value: settings.zoom ?? caps.zoom.min })
      } else {
        setZoom(null)
      }
    }, 500)
    return () => clearInterval(t)
  }, [])

  const apply = async (set: Record<string, unknown>) => {
    const track = trackRef.current
    if (!track) return false
    try {
      await track.applyConstraints({ advanced: [set as MediaTrackConstraintSet] })
      return true
    } catch {
      return false
    }
  }

  const toggleTorch = async () => {
    const next = !torch.on
    if (await apply({ torch: next })) setTorch({ supported: true, on: next })
  }

  const changeZoom = async (dir: 1 | -1) => {
    if (!zoom) return
    const value = Math.min(zoom.max, Math.max(zoom.min, +(zoom.value + dir * zoom.step).toFixed(2)))
    if (await apply({ zoom: value })) setZoom({ ...zoom, value })
  }

  const scanner = useMemo(
    () => (
      <Scanner
        ref={scannerRef}
        onScan={handleScan}
        onError={handleError}
        constraints={CONSTRAINTS}
        formats={FORMATS}
        components={COMPONENTS}
        styles={STYLES}
        sound={false}
        allowMultiple
        scanDelay={400}
      />
    ),
    [handleScan, handleError],
  )

  const btn = 'flex size-14 items-center justify-center rounded-full bg-black/65 text-white ring-1 ring-white/35 disabled:opacity-40'

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      {scanner}

      {/* Static aiming frame (guide only – the whole picture is scanned). */}
      {/* sized to the camera's own box, so the frame and its hint fit when the demo tools take room below */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 [container-type:size]" aria-hidden>
        <div className="relative aspect-square w-[clamp(7rem,min(68cqw,calc(100cqh-6rem)),300px)] rounded-3xl shadow-[0_0_0_200vmax_rgba(0,0,0,0.42)]">
          <span className="absolute -top-1 -left-1 size-12 rounded-tl-3xl border-t-[6px] border-l-[6px] border-white" />
          <span className="absolute -top-1 -right-1 size-12 rounded-tr-3xl border-t-[6px] border-r-[6px] border-white" />
          <span className="absolute -bottom-1 -left-1 size-12 rounded-bl-3xl border-b-[6px] border-l-[6px] border-white" />
          <span className="absolute -right-1 -bottom-1 size-12 rounded-br-3xl border-r-[6px] border-b-[6px] border-white" />
        </div>
        <p className="relative rounded-full bg-black/60 px-4 py-1.5 text-center text-lg font-semibold text-white">
          {live ? 'Arahkan QR e-ticket ke kotak' : 'Menyalakan kamera…'}
        </p>
      </div>

      {(torch.supported || zoom) && (
        <div className="absolute right-3 bottom-3 left-3 flex items-end justify-between gap-3">
          {zoom ? (
            <div className="flex items-center gap-2" role="group" aria-label="Zoom kamera">
              <button type="button" className={btn} onClick={() => void changeZoom(-1)} disabled={zoom.value <= zoom.min} aria-label="Perkecil">
                <ZoomOut className="size-6" />
              </button>
              <span className="min-w-12 rounded-full bg-black/65 px-2 py-1 text-center text-base font-bold text-white tabular-nums">{zoom.value.toFixed(1)}×</span>
              <button type="button" className={btn} onClick={() => void changeZoom(1)} disabled={zoom.value >= zoom.max} aria-label="Perbesar">
                <ZoomIn className="size-6" />
              </button>
            </div>
          ) : (
            <span />
          )}
          {torch.supported && (
            <button type="button" className={cn(btn, torch.on && 'bg-white text-ink')} onClick={() => void toggleTorch()} aria-pressed={torch.on} aria-label="Senter">
              {torch.on ? <FlashlightOff className="size-6" /> : <Flashlight className="size-6" />}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
