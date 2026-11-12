/**
 * The splash lives in index.html so it paints before any JavaScript. Once the app has painted underneath with its own
 * fonts, it fades out after its motion has played (or at once when tapped). On a second visit in the session it is a
 * plain cream cover instead, so a reload never shows the page in a fallback font and then reflowing: it lifts as soon
 * as the fonts are in (at once when they are cached, at most FONT_WAIT_MS on a slow network).
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
/** A later load shows the loader at least this long, so it reads as loading instead of a flash. */
const LOADER_MS = 450
const FONT_WAIT_MS = 2000
/** The faces the first screen is set in (src/index.css). */
const FACES = ['400 1em Anton', '600 1em "Plus Jakarta Sans Variable"']

/** Resolves once the first screen's fonts are loaded, or after FONT_WAIT_MS. */
function fontsIn(): Promise<unknown> {
  const fonts = document.fonts
  if (!fonts?.load) return Promise.resolve()
  return Promise.race([Promise.all(FACES.map((f) => fonts.load(f))).catch(() => undefined), new Promise((done) => setTimeout(done, FONT_WAIT_MS))])
}
// start the downloads now, alongside the app's own start
const fontsReady = fontsIn()

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
  const quiet = document.documentElement.classList.contains('no-splash')
  const shown = performance.now() - (window.__splashAt ?? 0)
  let done = false
  const finish = () => {
    if (done) return
    done = true
    el.classList.add('sp-done')
    window.setTimeout(() => el.remove(), quiet || reduced ? 160 : FADE_MS)
  }
  window.__splashSkip = finish
  const motion = new Promise((done) => window.setTimeout(done, Math.max(0, (quiet ? LOADER_MS : reduced ? REDUCED_MS : MOTION_MS) - shown)))
  // two frames after the fonts: the page has laid itself out in them (the poster words fitted, the fan measured)
  void Promise.all([motion, fontsReady]).then(() => requestAnimationFrame(() => requestAnimationFrame(finish)))
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
