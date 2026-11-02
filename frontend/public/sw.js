/* Summarevent service worker: cache the app shell so the basic UI opens offline (PRD §12, PWA). */
const CACHE = 'summarevent-shell-v3'
const SHELL = ['/', '/app', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/brand/summarevent-symbol.svg', '/brand/summarevent-lockup.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return
  // live version: API answers are never cached (seat status must always be fresh)
  if (url.pathname.startsWith('/api/')) return
  // SPA navigations: network first, fall back to the cached shell
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/app').then((r) => r || caches.match('/'))))
    return
  }
  // static assets: cache first, then network (and remember it)
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && (req.destination === 'script' || req.destination === 'style' || req.destination === 'font' || req.destination === 'image')) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
