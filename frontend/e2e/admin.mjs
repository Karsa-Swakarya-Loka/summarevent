// Panitia flows: receipts approve/revise, mark paid, CSV export, live seats.
// Usage: dev server running (npm run dev), then node e2e/admin.mjs [desktop|mobile]
// Env: BASE (default http://localhost:5173), E2E_OUT (default e2e/out), CHROME_PATH (installed Chrome).
import { chromium } from 'playwright-core'
import { signIn, skipIntro } from './skip-intro.mjs'
import fs from 'node:fs'
import path from 'node:path'
const OUT = path.join(process.env.E2E_OUT || 'e2e/out', 'admin')
const BASE = process.env.BASE || 'http://localhost:5173'
fs.mkdirSync(OUT, { recursive: true })
const mobile = process.argv[2] === 'mobile'
const P = mobile ? 'am' : 'ad'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true } : { viewport: { width: 1366, height: 900 }, acceptDownloads: true })
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
await signIn(page, 'ADMIN', BASE)
await page.goto(BASE + '/admin', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await shot('dashboard')
// the dashboard: every card has numbers, the orders table filters and pages, ⌘K finds an order
const dash = page.getByRole('heading', { name: /^Selamat datang/ })
await dash.waitFor()
for (const label of ['Sesi', 'Pendapatan per hari', 'Tiket terjual per hari', 'Kehadiran', 'Ringkasan angka', 'Pesanan terbaru']) {
  if (!(await page.getByRole('region', { name: label }).count())) errors.push(`dashboard: kartu "${label}" tidak ada`)
}
const orders = page.getByRole('region', { name: 'Pesanan terbaru' })
const before = await orders.getByText(/^\d+ pesanan/).innerText()
await orders.getByRole('combobox', { name: 'Filter status' }).click()
await page.getByRole('option', { name: 'Menunggu pembayaran' }).click()
await page.waitForTimeout(300)
const after = await orders.getByText(/^\d+ pesanan/).innerText()
console.log('dashboard orders:', before, '→', after)
if (before === after) errors.push('dashboard: filter status tidak mengubah daftar pesanan')
if (!mobile && !(await orders.getByRole('button', { name: 'Tandai lunas' }).count())) errors.push('dashboard: pesanan menunggu pembayaran tidak menawarkan Tandai lunas')
await orders.getByRole('combobox', { name: 'Filter status' }).click()
await page.getByRole('option', { name: 'Semua status' }).click()
await orders.getByRole('button', { name: 'Halaman berikutnya' }).click()
await page.waitForTimeout(300)
if (!(await orders.getByRole('button', { name: '2', exact: true }).getAttribute('aria-current'))) errors.push('dashboard: halaman 2 tidak aktif setelah Berikutnya')
// the event switcher: a tree of events and sessions; picking Sawarga moves the dashboard, picking back restores it
await page.getByRole('button', { name: /ganti event$/ }).first().click()
const tree = page.getByRole('tree', { name: 'Pilih event' })
await tree.waitFor()
if (!(await tree.getByRole('treeitem', { name: /Sesi Demo Juri/ }).count())) errors.push('switcher: sesi event yang dipantau tidak terbuka di pohon')
await tree.getByRole('treeitem', { name: /Konser Akustik Sawarga/ }).click()
await page.waitForURL(/event=evt_akustik/)
await page.getByRole('region', { name: 'Pesanan terbaru' }).getByText('Konser Akustik Sawarga').waitFor({ timeout: 8000 })
console.log('switcher: dashboard follows Sawarga')
await page.getByRole('button', { name: /ganti event$/ }).first().click()
await page.getByLabel('Cari event').fill('Sangkur')
await tree.getByRole('treeitem', { name: /Sangkuriang/ }).click()
await page.waitForURL(/event=evt_sangkuriang/)
await page.getByRole('region', { name: 'Pesanan terbaru' }).getByText(/Sangkuriang/).waitFor({ timeout: 8000 })
// a session in the tree opens its live seat map
await page.getByRole('button', { name: /ganti event$/ }).first().click()
await tree.getByRole('treeitem', { name: /^Sesi 2 ·/ }).click()
await page.waitForURL(/\/admin\/live\?event=evt_sangkuriang&session=ses_sk_16/)
console.log('switcher: a session opens the live map')
await page.goto(BASE + '/admin', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
if (!mobile) {
  await page.keyboard.press('Meta+k')
  const palette = page.getByRole('dialog', { name: 'Cari cepat' })
  await palette.waitFor()
  await page.keyboard.type('Bayu')
  await palette.getByRole('option', { name: /Bayu Saputra/ }).first().waitFor({ timeout: 5000 })
  await page.keyboard.press('Enter')
  await page.waitForURL(/\/admin\/orders\?event=.*q=SEV/)
  console.log('dashboard: ⌘K opened an order on the orders page')
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle' })
}

// ---- receipts
await page.goto(BASE + '/admin/receipts', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
const queue = page.getByRole('list', { name: 'Antrean struk' }).getByRole('listitem')
console.log('queue items:', await queue.count())
if (!(await queue.count())) errors.push('antrean struk kosong, padahal data contoh punya struk menunggu')
if (mobile) await queue.first().getByRole('button').click()
await shot('receipts')
// AI cross-check: reads the sample receipt photo and compares it with what Rina typed (needs the OCR model from the CDN)
await page.getByRole('button', { name: 'Bandingkan foto dengan isian' }).click()
const ai = page.getByRole('region', { name: 'Cek silang AI' })
const aiText = await ai
  .getByText(/cocok dengan foto|beda dengan foto|belum terbaca|belum bisa dibaca/)
  .first()
  .innerText({ timeout: 120000 })
  .catch((e) => `timeout: ${String(e?.message ?? e).split('\n')[0]}`)
console.log('ai check:', aiText)
if (/beda dengan foto/.test(aiText)) errors.push(`cek silang AI: struk contoh Rina dianggap beda (${aiText})`)
await shot('receipts-ai', false)
// approve the first (Rina, 2 receipts, valid)
await page.getByRole('button', { name: 'Setujui' }).click()
await page.waitForTimeout(400)
if (await page.getByRole('button', { name: 'Tetap setujui' }).count()) { console.log('!! approve-anyway dialog shown'); await page.getByRole('button', { name: 'Tetap setujui' }).click() }
await page.getByText(/Struk disetujui/).waitFor()
console.log('approved first')
await page.waitForTimeout(600)
// second (Yudi, below minimum) -> revision
if (mobile && !(await page.getByRole('button', { name: 'Minta revisi' }).isVisible())) await queue.first().getByRole('button').click()
await page.getByRole('button', { name: 'Minta revisi' }).click()
await page.getByRole('button', { name: 'Nominal tidak terbaca' }).click()
await shot('receipts-revise-dialog', false)
await page.getByRole('button', { name: 'Kirim permintaan revisi' }).click()
await page.getByText(/Permintaan revisi dikirim/).waitFor()
console.log('revision requested')
await page.waitForTimeout(500)
await shot('receipts-empty')
await page.getByRole('tab', { name: 'Semua' }).click()
await page.waitForTimeout(500)
if (mobile) await queue.first().getByRole('button').click()
await shot('receipts-all')

// ---- orders
await page.goto(BASE + '/admin/orders', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await shot('orders')
await page.getByRole('button', { name: /^Menunggu pembayaran/ }).click()
await page.waitForTimeout(400)
const firstOrder = mobile
  ? page.getByRole('list', { name: 'Daftar pesanan' }).getByRole('button').filter({ hasText: 'Bayu' }).first()
  : page.locator('tbody tr').filter({ hasText: 'Bayu' }).first().getByRole('button').first()
const code = (await firstOrder.innerText()).split('\n')[0]
console.log('opening order', code)
await firstOrder.click()
await page.waitForTimeout(500)
await shot('orders-sheet', false)
const markBtn = page.getByRole('button', { name: /Tandai lunas|Konfirmasi pendaftaran/ })
if (await markBtn.count()) {
  await markBtn.click()
  // tickets issued without money are hard to take back: the panel asks first
  await page.getByRole('button', { name: /^Ya, (tandai lunas|konfirmasi)$/ }).click()
  await page.getByText(/ditandai lunas|dikonfirmasi/).first().waitFor()
  console.log('marked paid')
  await page.waitForTimeout(500)
  await shot('orders-sheet-paid', false)
}
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
for (const [label, type] of [['Unduh data peserta', 'peserta'], ['Unduh laporan transaksi', 'transaksi']]) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: label }).click()])
  const file = `${OUT}/${P}-${type}.csv`
  await dl.saveAs(file)
  const txt = fs.readFileSync(file, 'utf8')
  const lines = txt.split('\n')
  console.log(`${type}.csv: ${dl.suggestedFilename()} ${lines.length - 1} rows, BOM=${txt.charCodeAt(0) === 0xfeff}`)
  console.log('  ' + lines.slice(0, 3).join('\n  '))
}

// ---- live seats
await page.goto(BASE + '/admin/live?event=evt_sangkuriang&session=ses_sk_16', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.getByRole('button', { name: 'Simulasikan pembeli lain' }).click()
await page.getByText(/Pembeli lain \(simulasi\) sedang memesan/).waitFor()
await page.waitForTimeout(600)
await page.getByRole('button', { name: /Baris C nomor 7,/ }).first().click({ force: true })
await page.waitForTimeout(400)
await shot('live')

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
if (errors.length) process.exitCode = 1
await browser.close()
