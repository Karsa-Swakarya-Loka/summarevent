import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Preload the display font (Anton). The first screens set their titles in it, and without a preload the browser only
 * finds the file once the page has rendered, so the largest text would paint twice and late.
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
        const file = Object.keys(ctx.bundle ?? {}).find((f) => /anton-latin-400-normal[^/]*\.woff2$/.test(f))
        return file ? [{ tag: 'link', attrs: { rel: 'preload', href: base + file, as: 'font', type: 'font/woff2', crossorigin: '' }, injectTo: 'head' }] : []
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), preloadDisplayFont()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    host: true,
  },
})
