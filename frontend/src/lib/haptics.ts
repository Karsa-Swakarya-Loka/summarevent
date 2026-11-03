/**
 * A short vibration for the moments that matter (a seat picked, a hold that worked or lost). Android only: iOS Safari has
 * no vibration API, and it stays still when the phone asks for less motion.
 */
export function haptic(kind: 'tap' | 'success' | 'error' = 'tap') {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  navigator.vibrate(kind === 'tap' ? 8 : kind === 'success' ? [12, 60, 18] : [28, 40, 28])
}
