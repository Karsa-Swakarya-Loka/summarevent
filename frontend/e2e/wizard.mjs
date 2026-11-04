// Event wizard: create a RESERVED event, publish it, open it as a visitor.
// Usage: dev server running (npm run dev), then node e2e/wizard.mjs [desktop|mobile]
// Env: BASE (default http://localhost:5173), E2E_OUT (default e2e/out), CHROME_PATH (installed Chrome).
import { chromium } from 'playwright-core'
import { signIn, skipIntro } from './skip-intro.mjs'
import fs from 'node:fs'
import path from 'node:path'
const OUT = path.join(process.env.E2E_OUT || 'e2e/out', 'wizard')
const BASE = process.env.BASE || 'http://localhost:5173'
fs.mkdirSync(OUT, { recursive: true })
const mobile = process.argv[2] === 'mobile'
const P = mobile ? 'wm' : 'wd'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 900 } })
await skipIntro(ctx)
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
const shot = async (name, full = true) => {
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/${P}-${name}.png`, fullPage: full })
  const sw = await page.evaluate(() => document.documentElement.scrollWidth)
  const vw = await page.evaluate(() => window.innerWidth)
  console.log('shot', name, sw > vw ? `!! scrollWidth ${sw} > ${vw}` : '')
  if (sw > vw) errors.push(`${name}: scrollWidth ${sw} > ${vw} (geser horizontal)`)
}
const next = async () => { await page.getByRole('button', { name: /^Lanjut/ }).click(); await page.waitForTimeout(500) }
await signIn(page, 'ADMIN', BASE)
const t0 = Date.now()
await page.goto(BASE + '/admin/events/new', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
const TITLE = 'Teater Boneka Si Kabayan'
await page.getByRole('textbox', { name: 'Judul event' }).fill(TITLE)
await page.getByRole('textbox', { name: 'Deskripsi' }).fill('Pertunjukan boneka 45 menit tentang Si Kabayan. Cocok untuk anak 3 tahun ke atas.')
await next()
// categories
const cats = page.getByRole('textbox', { name: 'Nama kategori' })
await cats.nth(0).fill('Premium')
await page.getByLabel('Harga per kursi', { exact: true }).nth(0).fill('75000')
await page.getByRole('button', { name: 'Tambah kategori' }).click()
await page.waitForTimeout(300)
await cats.nth(1).fill('Tukar Struk')
const method2 = page.getByRole('radiogroup').filter({ has: page.getByRole('radio', { name: 'Tukar Struk' }) }).nth(1)
await method2.getByRole('radio', { name: 'Tukar Struk' }).click()
await page.getByRole('button', { name: 'Pakai preset umum mal' }).click()
// QA-11: the Tukar Struk category only goes on sale in 3 days
const wibDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
await page.getByLabel('Penjualan dibuka').nth(1).fill(`${wibDay(new Date(Date.now() + 3 * 86_400_000))}T10:00`)
await shot('2-kategori')
await next()
// layout
await page.getByRole('button', { name: /Teater kecil/ }).click()
await page.waitForTimeout(400)
await page.getByRole('button', { name: /^Baris A nomor 1,/ }).first().click({ force: true })
await page.waitForTimeout(300)
await shot('3-denah')
await next()
// sessions
await page.getByRole('button', { name: 'Tambah sesi' }).click()
await page.waitForTimeout(300)
await shot('4-sesi')
await next()
await shot('5-review')
await page.getByRole('button', { name: /Simpan & publish/ }).click()
// create + publish are two requests; the toast says when both are done
await page.getByRole('heading', { name: 'Event dipublikasikan!' }).waitFor({ timeout: 15_000 })
await shot('6-published')
console.log(`wizard done in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
// visitor
await page.goto(BASE + '/app', { waitUntil: 'networkidle' })
const card = page.getByRole('link').filter({ hasText: TITLE })
await card.first().waitFor({ timeout: 15_000 }).catch(() => undefined)
console.log('visitor card found:', await card.count())
if (!(await card.count())) errors.push('event baru tidak muncul di app pengunjung')
await card.first().click()
await page.getByRole('button', { name: 'Pilih kursi' }).click()
await page.waitForURL(/\/s\//)
await page.getByRole('radiogroup', { name: 'Kategori tiket' }).waitFor({ timeout: 15_000 })
// the seat map draws once the session's seats have arrived
const blockedSeat = page.getByRole('img', { name: /Baris A nomor 1,.*tidak dijual/ })
await blockedSeat.waitFor({ timeout: 15_000 }).catch(() => undefined)
const blocked = await blockedSeat.count()
console.log('seat A1 shows Tidak dijual:', blocked > 0)
if (!blocked) errors.push('kursi A1 yang diblokir tidak tampil "Tidak dijual"')
await page.getByRole('radiogroup', { name: 'Kategori tiket' }).getByRole('radio', { name: /Premium/ }).click()
await page.getByRole('button', { name: /Pilihkan 2 kursi/ }).click()
const holdBtn = page.getByRole('button', { name: /Hayu ngiring/ })
// the suggestion is a request; the summary names the two seats once they are picked
await page.locator('p.font-bold').filter({ hasText: /^2 kursi ·/ }).first().waitFor({ timeout: 15_000 }).catch(() => undefined)
console.log('hold button enabled:', await holdBtn.isEnabled())
if (!(await holdBtn.isEnabled())) errors.push('tombol Hayu ngiring nonaktif padahal 2 kursi Premium dipilih')
await shot('7-visitor-seatmap', false)
// QA-11: outside the sale period the button is off and the reason says when sales open
await page.getByRole('radiogroup', { name: 'Kategori tiket' }).getByRole('radio', { name: /Tukar Struk/ }).click()
const notYet = page.getByText(/^Penjualan Tukar Struk dibuka /)
await notYet.first().waitFor({ timeout: 5000 }).catch(() => undefined)
console.log('QA-11 reason:', (await notYet.count()) ? await notYet.first().innerText() : 'missing', '| hold enabled:', await holdBtn.isEnabled())
if (!(await notYet.count())) errors.push('QA-11: pesan "Penjualan Tukar Struk dibuka …" tidak muncul')
if (await holdBtn.isEnabled()) errors.push('QA-11: tombol Hayu ngiring aktif di luar periode penjualan')
await shot('8-visitor-not-on-sale', false)
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
if (errors.length) process.exitCode = 1
await browser.close()
