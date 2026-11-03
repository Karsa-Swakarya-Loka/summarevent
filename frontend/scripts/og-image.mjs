#!/usr/bin/env node
// Regenerates public/og.png, the 1200×630 link preview (WhatsApp, Google Form), from the brand assets in the app's font.
//   node scripts/og-image.mjs
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const root = path.resolve(import.meta.dirname, '..')
const font = path.join(root, 'node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2')
const logo = fs.readFileSync(path.join(root, 'public/brand/summarevent-lockup-white.svg'), 'utf8')
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'PJS'; src: url('file://${font}') format('woff2'); font-weight: 200 800; }
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; background: #006426; font-family: 'PJS', sans-serif; color: #fbf8f1; overflow: hidden; position: relative; }
.wrap { position: absolute; inset: 0; padding: 72px 80px; display: flex; flex-direction: column; gap: 30px; }
.logo svg { height: 54px; width: auto; display: block; }
.pill { align-self: flex-start; background: #fedc01; color: #14241a; font-weight: 700; font-size: 22px; padding: 8px 20px; border-radius: 999px; }
h1 { font-size: 66px; line-height: 1.06; font-weight: 800; letter-spacing: -1.5px; max-width: 900px; }
h1 span { color: #fedc01; }
p { font-size: 26px; line-height: 1.4; color: #d7eadc; max-width: 820px; }
.url { position: absolute; left: 80px; bottom: 56px; font-size: 26px; font-weight: 700; color: #fbf8f1; }
.seats { position: absolute; right: 64px; bottom: 56px; display: grid; grid-template-columns: repeat(5, 30px); gap: 8px; }
.seats i { width: 30px; height: 30px; border-radius: 8px; display: block; }
</style></head><body>
<div class="wrap">
  <div class="logo">${logo}</div>
  <div class="pill">Bandung Build Challenge 2026 · Event Ticketing</div>
  <h1>Satu pass untuk semua event <span>Summarecon Mall Bandung</span>.</h1>
  <p>Pilih kursi langsung dari denah. Bayar, daftar gratis, atau tukar struk belanja, lalu dapat e-ticket QR.</p>
</div>
<div class="url">summarevent.vercel.app</div>
<div class="seats">${[
  '#7c3aed', '#7c3aed', '#7c3aed', '#7c3aed', '#7c3aed',
  '#f26f22', '#f26f22', '#fedc01', '#fedc01', '#f26f22',
  '#2563eb', '#2563eb', '#2563eb', '#2563eb', '#2563eb',
].map((c) => (c === '#fedc01' ? '<i style="background:#004a1c;box-shadow:inset 0 0 0 3px #fedc01"></i>' : `<i style="background:${c}"></i>`)).join('')}</div>
</body></html>`
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'summarevent-og-')), 'og.html')
fs.writeFileSync(tmp, html)
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.goto('file://' + tmp)
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(300)
await page.screenshot({ path: path.join(root, 'public/og.png') })
await browser.close()
console.log('wrote public/og.png')
