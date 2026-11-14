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
// a title of its own per run: on the live version the edge may still list the event of a run before the last reset
const TITLE = `Teater Boneka Si Kabayan ${Date.now().toString(36).slice(-4).toUpperCase()}`
await page.getByRole('textbox', { name: 'Judul event' }).fill(TITLE)
await page.getByRole('textbox', { name: 'Deskripsi' }).fill('Pertunjukan boneka 45 menit tentang Si Kabayan. Cocok untuk anak 3 tahun ke atas.')
// the poster in the panitia's own colours: navy with an amber accent
await page.getByRole('switch', { name: 'Warna sendiri' }).click()
await page.getByRole('radiogroup', { name: 'Warna dasar' }).getByRole('radio', { name: 'Biru malam' }).click()
await page.getByRole('radiogroup', { name: 'Warna aksen' }).getByRole('radio', { name: 'Amber' }).click()
// the panitia's own poster picture: a 1600x900 PNG drawn in the page, shrunk to a JPEG by the wizard
const png = await page.evaluate(() => {
  const c = document.createElement('canvas')
  c.width = 1600
  c.height = 900
  const g = c.getContext('2d')
  const grad = g.createLinearGradient(0, 0, 1600, 900)
  grad.addColorStop(0, '#006426')
  grad.addColorStop(1, '#f9a61b')
  g.fillStyle = grad
  g.fillRect(0, 0, 1600, 900)
  g.fillStyle = '#fbf3e4'
  g.font = 'bold 160px sans-serif'
  g.fillText('KABAYAN', 220, 520)
  return c.toDataURL('image/png').split(',')[1]
})
await page.locator('input[type="file"][accept^="image/jpeg"]').setInputFiles({ name: 'poster-kabayan.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
await page.getByRole('img', { name: 'Gambar poster event' }).waitFor({ timeout: 8000 }).catch(() => errors.push('gambar poster: pratinjau tidak muncul setelah diunggah'))
await shot('1-info')
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
await page.getByRole('button', { name: 'Pakai aturan standar mal' }).click()
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
// the row ranges use the app's own lists: picking the option already shown leaves the layout as it is
for (const name of ['Kategori rentang 1', 'Sampai baris (rentang 1)']) {
  const box = page.getByRole('combobox', { name })
  const shown = (await box.innerText()).trim()
  await box.click()
  await page.getByRole('option', { name: shown, exact: true }).click()
  if ((await box.innerText()).trim() !== shown) errors.push(`${name}: pilihan berubah dari ${shown}`)
}
// sell fewer seats than the layout has, typed key by key as on a phone: the back seats close, the front row stays on
// sale and A1 (closed by hand) stays closed
const sell = page.getByLabel('Kursi dijual per sesi')
const before = Number(await sell.inputValue())
await sell.fill('')
await sell.pressSequentially(String(before - 10), { delay: 60 })
if ((await sell.inputValue()) !== String(before - 10)) errors.push(`kolom kursi dijual berisi ${await sell.inputValue()} saat diketik, seharusnya ${before - 10}`)
await page.waitForTimeout(300)
const frontClosed = await page.getByRole('button', { name: /^Baris A nomor \d+,.*tidak dijual/ }).count()
if (frontClosed !== 1) errors.push(`kursi dijual per sesi: ${frontClosed} kursi baris A tidak dijual, seharusnya hanya A1 (yang ditutup kursi belakang)`)
const totalSold = async () => Number((await page.getByRole('list', { name: 'Jumlah kursi per kategori' }).innerText()).match(/Total kursi dijual\s+(\d+)/)?.[1])
if ((await totalSold()) !== before - 10) errors.push(`kursi dijual per sesi: total ${await totalSold()}, seharusnya ${before - 10}`)
// one tap closes a whole row (B, untouched so far), a second opens it again
const lastRow = page.getByRole('group', { name: 'Tutup satu baris:' }).getByRole('button', { name: /^Baris B/ })
await lastRow.click()
if ((await lastRow.getAttribute('aria-pressed')) !== 'true') errors.push('tombol baris tidak menutup barisnya')
await lastRow.click()
if ((await lastRow.getAttribute('aria-pressed')) !== 'false') errors.push('tombol baris tidak membuka barisnya lagi')
// curved rows: the visitor part below picks and holds seats on this curved map
await page.getByRole('switch', { name: 'Baris melengkung' }).click()
await page.waitForTimeout(300)
await shot('3-denah')
await next()
// sessions
await page.getByRole('button', { name: 'Tambah sesi' }).click()
await page.waitForTimeout(300)
await shot('4-sesi')
await next()
await shot('5-review')
await page.getByRole('button', { name: /Simpan & publikasikan/ }).click()
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
const cardImg = await card.first().locator('img[src^="data:image/jpeg"]').count()
console.log('visitor card shows the poster picture:', cardImg > 0)
if (!cardImg) errors.push('gambar poster: kartu event pengunjung tidak memakai gambar yang diunggah')
await card.first().click()
await page.getByRole('button', { name: 'Pilih kursi' }).waitFor()
const navy = await page.locator('[style*="rgb(28, 47, 94)"]').count()
console.log('visitor poster in the panitia colours:', navy > 0)
if (!navy) errors.push('warna poster pilihan panitia tidak tampil di halaman event pengunjung')
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
const holdBtn = page.getByRole('button', { name: /^Pesan( \d+)? (kursi|tiket)$/ })
// the suggestion is a request; the summary names the two seats once they are picked
await page.locator('p.font-bold').filter({ hasText: /^2 kursi ·/ }).first().waitFor({ timeout: 15_000 }).catch(() => undefined)
console.log('hold button enabled:', await holdBtn.isEnabled())
if (!(await holdBtn.isEnabled())) errors.push('tombol Pesan nonaktif padahal 2 kursi Premium dipilih')
await shot('7-visitor-seatmap', false)
// QA-11: outside the sale period the button is off and the reason says when sales open
await page.getByRole('radiogroup', { name: 'Kategori tiket' }).getByRole('radio', { name: /Tukar Struk/ }).click()
const notYet = page.getByText(/^Penjualan Tukar Struk dibuka /)
await notYet.first().waitFor({ timeout: 5000 }).catch(() => undefined)
console.log('QA-11 reason:', (await notYet.count()) ? await notYet.first().innerText() : 'missing', '| hold enabled:', await holdBtn.isEnabled())
if (!(await notYet.count())) errors.push('QA-11: pesan "Penjualan Tukar Struk dibuka …" tidak muncul')
if (await holdBtn.isEnabled()) errors.push('QA-11: tombol Pesan aktif di luar periode penjualan')
await shot('8-visitor-not-on-sale', false)
// AD-01 with AI: the assistant asks for what is missing, then fills the form. Gemini is stood in for here, so the
// test checks the app, not the model: the first answer asks for the date, the second has everything.
await page.route('**/api/ai-event', async (route) => {
  const { messages } = route.request().postDataJSON()
  const first = messages.length === 1
  await route.fulfill({
    json: first
      ? { reply: 'Siap. Acaranya tanggal berapa, jam berapa?', fields: { title: 'Bandung Kids Fest', venueName: 'Atrium Cibadak', seating: 'bernomor', categories: [{ name: 'Reguler', method: 'bayar', price: 50000 }], audience: 200 } }
      : { reply: 'Bandung Kids Fest, Atrium Cibadak, 28 November 09.30. Form siap diisi.', fields: { title: 'Bandung Kids Fest', venueName: 'Atrium Cibadak', seating: 'bernomor', categories: [{ name: 'Reguler', method: 'bayar', price: 50000 }], audience: 200, sessions: [{ date: '2099-11-28', start: '09:30' }], description: 'Festival anak dan keluarga di Atrium Cibadak.' } },
  })
})
await page.goto(BASE + '/admin/events/new', { waitUntil: 'networkidle' })
const ai = page.getByRole('region', { name: 'Isi cepat dengan AI' })
await ai.getByRole('textbox', { name: 'Pesan untuk AI' }).fill('Mau bikin Bandung Kids Fest di Atrium Cibadak, pengunjung 100-200 orang, tiket 50 ribu')
await ai.getByRole('button', { name: 'Kirim' }).click()
await ai.getByText('Acaranya tanggal berapa').waitFor()
await ai.getByRole('textbox', { name: 'Pesan untuk AI' }).fill('Sabtu 28 November jam setengah 10 pagi')
await ai.getByRole('textbox', { name: 'Pesan untuk AI' }).press('Enter')
await ai.getByText('Form siap diisi').waitFor()
await page.getByText(/Form terisi dari jawaban AI/).first().waitFor({ timeout: 5000 }).catch(() => errors.push('AI: form tidak terisi otomatis setelah semua terjawab'))
const aiTitle = await page.getByRole('textbox', { name: 'Judul event' }).inputValue()
console.log('ai filled title:', aiTitle)
if (aiTitle !== 'Bandung Kids Fest') errors.push(`AI: judul terisi "${aiTitle}"`)
const venueText = await page.getByText('Atrium Cibadak').count()
if (!venueText) errors.push('AI: venue Atrium Cibadak tidak terpilih')
await shot('9-ai-filled')
await next()
const price = await page.getByLabel('Harga per kursi').first().inputValue().catch(() => '')
console.log('ai filled price:', price)
if (price.replace(/\D/g, '') !== '50000') errors.push(`AI: harga kategori pertama "${price}"`)
await page.unroute('**/api/ai-event')
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
if (errors.length) process.exitCode = 1
await browser.close()
