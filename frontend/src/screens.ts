/**
 * The visitor screens reached by tapping through the app, each its own chunk (Beranda, the event page and the seat map,
 * where links land, ship with the app). The router loads one when it is navigated to and keeps the current screen up
 * meanwhile, as a native app does. main.tsx starts the first screen's chunk while the data boots, and the shell fetches
 * the rest once the page has loaded and the phone is idle, so every later screen opens at once.
 */
const load = {
  checkout: () => import('@/pages/visitor/Checkout'),
  order: () => import('@/pages/visitor/OrderStatus'),
  pass: () => import('@/pages/visitor/MyPass'),
  ticket: () => import('@/pages/visitor/TicketPage'),
  inbox: () => import('@/pages/visitor/Inbox'),
  account: () => import('@/pages/visitor/Account'),
}
type ScreenName = keyof typeof load

/** A route's `lazy`: the screen's component once its chunk is in. */
export const screen = (name: ScreenName) => () => load[name]().then((m) => ({ Component: m.default }))

const ROUTES: Array<[RegExp, ScreenName]> = [
  [/^\/app\/checkout\//, 'checkout'],
  [/^\/app\/orders\//, 'order'],
  [/^\/app\/pass\/?$/, 'pass'],
  [/^\/app\/pass\/[^/]+\/?$/, 'ticket'],
  [/^\/app\/inbox\/?$/, 'inbox'],
  [/^\/app\/akun\/?$/, 'account'],
]

/** Start loading the screen at `path`: the first screen, in parallel with the data. */
export function preloadScreen(path: string) {
  const hit = ROUTES.find(([re]) => re.test(path))
  if (hit) void load[hit[1]]()
}

/** Fetch the other screens a moment after the page has loaded, when the phone is idle, so they never compete with it. */
export function prefetchScreens() {
  const run = () => Object.values(load).forEach((l) => void l())
  const idle = () => (typeof requestIdleCallback === 'function' ? requestIdleCallback(run, { timeout: 3000 }) : run())
  const later = () => window.setTimeout(idle, 2500)
  if (document.readyState === 'complete') later()
  else window.addEventListener('load', later, { once: true })
}
