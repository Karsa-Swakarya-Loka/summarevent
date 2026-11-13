/**
 * The app's Content-Security-Policy, in one place. vite.config.ts writes it into the built index.html as a meta tag (so
 * it holds on any host), and vercel.json sends the same policy as a header, plus what only a header can carry
 * (frame-ancestors). src/test/csp.test.ts fails when the two drift apart or an inline script changes.
 *
 * Outside our own origin the app only reaches: the shared backend (Convex: its API and its file storage), and the
 * receipt reader's worker, engine and Indonesian language data (jsDelivr, projectnaptha). WebAssembly runs for the QR
 * and receipt readers. The inline scripts of index.html (the splash and the schema.org data) are allowed by their hash.
 */
export const CONVEX_DEPLOYMENT = 'good-gnu-186'

/** `scriptHashes` as "sha256-…", `live` the origin of the live host (VITE_LIVE_URL). */
export function cspDirectives(scriptHashes: string[], live: string): string[] {
  const convex = [`https://${CONVEX_DEPLOYMENT}.convex.site`, `https://${CONVEX_DEPLOYMENT}.convex.cloud`]
  const own = live ? ` ${live}` : ''
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.map((h) => `'${h}'`).join(' ')} 'wasm-unsafe-eval' https://cdn.jsdelivr.net`,
    // React and the UI libraries set a few styles at run time (toasts, the scroll lock of a dialog)
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${convex.join(' ')}${own}`,
    "font-src 'self' data:",
    `connect-src 'self' ${convex.join(' ')} https://cdn.jsdelivr.net https://tessdata.projectnaptha.com${own}`,
    "worker-src 'self' blob:",
    "media-src 'self' blob: data:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ]
}

/** Only a header can say who may frame the page, and ask for https everywhere. */
export const HEADER_ONLY = ["frame-ancestors 'none'", 'upgrade-insecure-requests']
