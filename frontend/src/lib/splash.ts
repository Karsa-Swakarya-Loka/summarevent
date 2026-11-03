/**
 * The splash lives in index.html so it paints before any JavaScript. Once the app has painted underneath, it fades out
 * after its motion has played (or at once when tapped). Its inline script already removed it on a second visit.
 */
declare global {
  interface Window {
    __splashAt?: number
    __splashSkip?: () => void
  }
}

const MOTION_MS = 1950
const REDUCED_MS = 500
const FADE_MS = 400

export function endSplash() {
  const el = document.getElementById('splash')
  if (!el) return
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const shown = performance.now() - (window.__splashAt ?? 0)
  let done = false
  const finish = () => {
    if (done) return
    done = true
    el.classList.add('sp-done')
    window.setTimeout(() => el.remove(), FADE_MS)
  }
  window.__splashSkip = finish
  window.setTimeout(finish, Math.max(0, (reduced ? REDUCED_MS : MOTION_MS) - shown))
}
