/**
 * The splash lives in index.html so it paints before any JavaScript. Once the app has painted underneath, it fades out
 * after its motion has played (or at once when tapped). Its inline script already removed it on a second visit.
 *
 * It plays once per session for the web, and once per session for each role, which it names. Opening a role's page
 * directly is decided in index.html; entering a role from inside the app (the role picker) plays it from here.
 */
declare global {
  interface Window {
    __splashAt?: number
    __splashSkip?: () => void
    /** an untouched copy of the splash, kept by index.html for the role splashes */
    __splashTpl?: HTMLElement
  }
}

const MOTION_MS = 1950
const REDUCED_MS = 500
const FADE_MS = 400

/** The same names the inline script in index.html writes. */
const ROLE_LABEL = { app: 'Pengunjung', admin: 'Panitia', staff: 'Petugas' } as const
type Scope = keyof typeof ROLE_LABEL

function scopeOf(pathname: string): Scope | null {
  const m = /^\/(app|admin|staff)(\/|$)/.exec(pathname)
  return m ? (m[1] as Scope) : null
}

const seenKey = (scope: Scope) => `summarevent:splash:${scope}`

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

/** Count a role's splash as seen, so a shortcut (the demo menu) goes straight in. */
export function markSplashSeen(pathname: string) {
  const scope = scopeOf(pathname)
  try {
    sessionStorage.setItem('summarevent:splash', '1')
    if (scope) sessionStorage.setItem(seenKey(scope), '1')
  } catch {
    /* blocked storage: the splash may simply play */
  }
}

/** On every navigation: the first time this session that a role is entered, its splash plays over the new screen. */
export function roleSplash(pathname: string) {
  const scope = scopeOf(pathname)
  const tpl = window.__splashTpl
  if (!scope || !tpl || document.getElementById('splash')) return
  try {
    if (sessionStorage.getItem(seenKey(scope))) return
    sessionStorage.setItem(seenKey(scope), '1')
  } catch {
    return
  }
  const el = tpl.cloneNode(true) as HTMLElement
  const label = el.querySelector('.sp-role')
  if (label) label.textContent = ROLE_LABEL[scope]
  // a skipped first splash left the page marked so; the copy has to show
  document.documentElement.classList.remove('no-splash')
  document.body.append(el)
  window.__splashAt = performance.now()
  el.addEventListener('click', () => window.__splashSkip?.())
  requestAnimationFrame(() => endSplash())
}
