#!/usr/bin/env node
/**
 * Regenerates the four promo cards at the top of the README (docs/gambar/promo-*.webp):
 * a headline on brand green above a real phone screenshot of the running app.
 *
 *   npm run dev                       # in another terminal
 *   node scripts/readme-promo.mjs     # needs cwebp (brew install webp)
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const BASE = process.env.BASE || 'http://localhost:5173'
const OUT = path.resolve(import.meta.dirname, '../../docs/gambar')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'summarevent-promo-'))
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }

async function capture(name, steps) {
  const ctx = await browser.newContext(phone)
  await ctx.grantPermissions(['camera'], { origin: BASE })
  const page = await ctx.newPage()
  await steps(page)
  // the floating demo switcher is for judges, not for the poster
  await page.addStyleTag({ content: 'button[aria-label="Menu demo"] { display: none !important; }' })
  await page.waitForTimeout(900)
  const file = path.join(tmp, `${name}.png`)
  await page.screenshot({ path: file })
  await ctx.close()
  return file
}

const pickCategory = (page, name) => page.getByRole('radiogroup', { name: 'Kategori tiket' }).getByRole('radio', { name: new RegExp(name) }).click()

const cards = [
  {
    file: 'promo-1-denah',
    title: 'Pilih kursi langsung dari <em>denah</em>',
    alt: 'Pilih kursi langsung dari denah: denah Sangkuriang diperbesar ke kategori Reguler dengan dua kursi terpilih',
    shot: () =>
      capture('denah', async (page) => {
        await page.goto(BASE + '/app/e/pentas-musikal-sangkuriang/s/ses_sk_16', { waitUntil: 'networkidle' })
        await pickCategory(page, 'Reguler')
        await page.getByRole('button', { name: /Pilihkan 2 kursi/ }).click()
      }),
  },
  {
    file: 'promo-2-rebutan',
    title: 'Rebutan kursi? Yang kalah dapat <em>saran</em>',
    alt: 'Rebutan kursi: pesan bentrok "A4 baru saja dipilih orang lain" dengan tombol pindah ke kursi saran',
    shot: () =>
      capture('rebutan', async (page) => {
        await page.goto(BASE + '/app/e/pentas-musikal-sangkuriang/s/ses_sk_13', { waitUntil: 'networkidle' })
        await pickCategory(page, 'VIP')
        await page.getByRole('button', { name: /Pilihkan 2 kursi/ }).click()
        await page.waitForTimeout(500)
        await page.getByRole('button', { name: 'Uji rebutan kursi' }).click()
        await page.getByRole('alert').filter({ hasText: 'baru saja dipilih orang lain' }).waitFor()
        await page.locator('[data-sonner-toast] button[aria-label]').first().click().catch(() => {})
      }),
  },
  {
    file: 'promo-3-pass',
    title: 'Satu <em>QR</em> untuk tiap kursi, di Pass Saya',
    alt: 'Satu QR untuk tiap kursi: e-ticket kursi di Pass Saya lengkap dengan QR dan hitung mundur sesi',
    shot: () =>
      capture('pass', async (page) => {
        await page.goto(BASE + '/', { waitUntil: 'networkidle' })
        await page.getByRole('button', { name: /masuk cepat sebagai Rina/ }).click()
        await page.waitForURL(/\/app\/pass/)
      }),
  },
  {
    file: 'promo-4-scan',
    title: 'Scan di pintu, hasilnya <em>terbaca</em> dari 1 meter',
    alt: 'Scan di pintu: layar petugas hijau "Valid, Mangga lebet" dengan nomor kursi besar',
    shot: () =>
      capture('scan', async (page) => {
        await page.goto(BASE + '/staff/scan/ses_sk_demo', { waitUntil: 'networkidle' })
        await page.getByRole('button', { name: /Alat bantu demo/ }).click()
        await page.getByRole('button', { name: 'Ambil tiket contoh' }).click()
      }),
  },
]

const card = (title, img) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'PJS'; src: url('file://${path.resolve(import.meta.dirname, '../node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2')}') format('woff2'); font-weight: 200 800; }
* { margin: 0; box-sizing: border-box; }
body { width: 540px; height: 960px; background: #006426; font-family: 'PJS', sans-serif; display: flex; flex-direction: column; align-items: center; padding: 46px 40px 0; gap: 30px; overflow: hidden; }
h1 { color: #fbf8f1; font-size: 34px; line-height: 1.15; font-weight: 800; letter-spacing: -0.5px; text-align: center; text-wrap: balance; }
h1 em { font-style: normal; color: #fedc01; }
img { width: 340px; border-radius: 40px; border: 8px solid #14241a; box-shadow: 0 24px 48px rgba(0, 0, 0, 0.35); }
</style></head><body><h1>${title}</h1><img src="file://${img}"></body></html>`

const render = await browser.newPage({ viewport: { width: 540, height: 960 } })
for (const c of cards) {
  const shot = await c.shot()
  const html = path.join(tmp, `${c.file}.html`)
  fs.writeFileSync(html, card(c.title, shot))
  await render.goto('file://' + html)
  await render.evaluate(() => document.fonts.ready)
  const png = path.join(tmp, `${c.file}.png`)
  await render.screenshot({ path: png })
  execFileSync('cwebp', ['-quiet', '-q', '80', png, '-o', path.join(OUT, `${c.file}.webp`)])
  console.log(`docs/gambar/${c.file}.webp  ·  alt: ${c.alt}`)
}
await browser.close()
fs.rmSync(tmp, { recursive: true, force: true })
