import { createHash } from 'node:crypto'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Preload the two faces of the first screen (Anton for titles, Plus Jakarta Sans for the rest). Without a preload the
 * browser only finds them once the stylesheet has been read, so the largest text would paint twice and late.
 */
function preloadDisplayFont(): Plugin {
  let base = '/'
  return {
    name: 'preload-display-font',
    apply: 'build',
    configResolved(config) {
      base = config.base
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {}).filter((f) => /(anton-latin-400-normal|plus-jakarta-sans-latin-wght-normal)[^/]*\.woff2$/.test(f))
        return files.map((file) => ({ tag: 'link', attrs: { rel: 'preload', href: base + file, as: 'font', type: 'font/woff2', crossorigin: '' }, injectTo: 'head' as const }))
      },
    },
  }
}

/**
 * Content-Security-Policy for the built app, as a meta tag so it holds on any host (Vercel, a preview, a test server).
 * The inline scripts of index.html (the splash) are allowed by their hash, worked out here at build time, so editing
 * them never breaks the policy. Outside our origin the app only reaches: the shared backend (Convex), and the receipt
 * reader's worker, engine and Indonesian language data (jsDelivr, projectnaptha). WebAssembly runs for the QR and
 * receipt readers. The demo also asks the live version (VITE_LIVE_URL) whether it is up. Only the build gets it: the
 * dev server injects its own inline scripts.
 */
function contentSecurityPolicy(): Plugin {
  let live = ''
  return {
    name: 'content-security-policy',
    apply: 'build',
    configResolved(config) {
      const url = config.env.VITE_LIVE_URL as string | undefined
      live = url ? new URL(url).origin : ''
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // the browser hashes a script after turning CRLF (a Windows checkout) into LF, so the hash is taken the same way
        const hash = (code: string) => createHash('sha256').update(code.replace(/\r\n?/g, '\n')).digest('base64')
        const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${hash(m[1])}'`)
        const policy = [
          "default-src 'self'",
          `script-src 'self' ${inline.join(' ')} 'wasm-unsafe-eval' https://cdn.jsdelivr.net`,
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https:",
          "font-src 'self' data:",
          `connect-src 'self' https://*.convex.site https://*.convex.cloud https://cdn.jsdelivr.net https://tessdata.projectnaptha.com${live ? ` ${live}` : ''}`,
          "worker-src 'self' blob:",
          "media-src 'self' blob: data:",
          "manifest-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; ')
        return html.replace(/<head>/, `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`)
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), preloadDisplayFont(), contentSecurityPolicy()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    host: true,
  },
})
