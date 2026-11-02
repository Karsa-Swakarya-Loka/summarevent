import type { ScannerErrorKind } from '@yudiel/react-qr-scanner'

export type CameraProblem = ScannerErrorKind

/** Before mounting the camera: is it even possible here? (HTTPS + getUserMedia) */
export function cameraPrecheck(): CameraProblem | null {
  if (typeof window === 'undefined') return 'unsupported'
  if (!window.isSecureContext) return 'insecure-context'
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported'
  return null
}
