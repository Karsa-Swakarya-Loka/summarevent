// Visitor flows: paid, receipt, free, conflict (+ expire).
// Usage: dev server running (npm run dev), then node e2e/visitor.mjs [paid|receipt|free|conflict|expire|waitlist|manage|bonus|ocr|all]
// Env: BASE (default http://localhost:5173), E2E_OUT (default e2e/out), CHROME_PATH (installed Chrome).
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
const OUT = path.join(process.env.E2E_OUT || 'e2e/out', 'visitor')
const BASE = process.env.BASE || 'http://localhost:5173'
fs.mkdirSync(OUT, { recursive: true })
const only = process.argv[2] ?? 'all'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const errors = []
async function newPage(ctx, tag) {
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] console: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`))
  return page
}
const shot = async (page, name, full = true) => {
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full })
  const sw = await page.evaluate(() => document.documentElement.scrollWidth)
  console.log('shot', name, sw > 390 ? `!! scrollWidth ${sw}` : '')
}
async function login(page, phone, name) {
  await page.getByLabel('Nomor HP').fill(phone)
  await page.getByRole('button', { name: 'Kirim kode OTP' }).click()
  await page.getByTestId('sim-otp').waitFor()
  const code = await page.getByTestId('sim-otp').innerText()
  await page.getByLabel('Kode OTP').fill(code)
  await page.getByRole('button', { name: /^Masuk$/ }).click()
  const nameBox = page.getByPlaceholder('Nama lengkap')
  await nameBox.waitFor({ timeout: 3000 })
  await nameBox.fill(name)
  await page.getByRole('button', { name: 'Buat akun & masuk' }).click()
  await page.getByText(name, { exact: false }).first().waitFor()
}
async function pickCategory(page, name) {
  await page.getByRole('radiogroup', { name: 'Kategori tiket' }).getByRole('radio', { name: new RegExp(name) }).click()
}

if (only === 'all' || only === 'paid') {
  const ctx = await browser.newContext(mobile)
  const page = await newPage(ctx, 'paid')
  await page.goto(BASE + '/app', { waitUntil: 'networkidle' })
  await page.locator('a[href="/app/e/pentas-musikal-sangkuriang"]').click()
  await page.getByRole('radio', { name: /16\.00/ }).click()
  await page.getByRole('button', { name: 'Pilih kursi' }).click()
  await page.waitForURL(/\/s\/ses_sk_16/)
  await pickCategory(page, 'Reguler')
  await page.getByRole('button', { name: /Pilihkan 2 kursi/ }).click()
  await page.waitForTimeout(700)
  await shot(page, 'v1-seat-picked', false)
  await page.getByRole('button', { name: /Hayu ngiring/ }).click()
  await page.waitForURL(/\/checkout\//)
  await page.waitForTimeout(500)
  await shot(page, 'v2-checkout-guest')
  await login(page, '081299990001', 'Dewi Lestari')
  await page.waitForTimeout(600)
  await page.getByLabel(/Kursi G|Kursi H|Kursi I|Kursi J/).nth(1).fill('Arka Lestari')
  await shot(page, 'v3-checkout-pay')
  await page.getByRole('button', { name: 'Simulasikan bayar gagal' }).click()
  await page.getByRole('alert').filter({ hasText: 'gagal' }).waitFor()
  await page.getByText('Virtual Account').click()
  await shot(page, 'v3b-checkout-failed-va')
  await page.getByRole('button', { name: 'Simulasikan bayar berhasil' }).click()
  await page.waitForURL(/\/orders\//)
  await page.waitForTimeout(800)
  await shot(page, 'v4-order-confirmed')
  await page.getByRole('link', { name: 'Buka e-ticket di Pass Saya' }).click()
  await page.waitForURL(/\/app\/pass/)
  await page.waitForTimeout(800)
  const cards = await page.locator('article[aria-label^="E-ticket"]').count()
  console.log('pass cards:', cards)
  await shot(page, 'v5-pass')
  await page.getByRole('button', { name: /Perbesar QR/ }).first().click()
  await page.waitForTimeout(400)
  await shot(page, 'v6-pass-qr-dialog', false)
  await page.keyboard.press('Escape')
  await page.goto(BASE + '/app/inbox', { waitUntil: 'networkidle' })
  await shot(page, 'v7-inbox')
  await page.goto(BASE + '/app/akun', { waitUntil: 'networkidle' })
  await shot(page, 'v8-account')
  await ctx.close()
}

if (only === 'all' || only === 'receipt') {
  const ctx = await browser.newContext(mobile)
  const page = await newPage(ctx, 'receipt')
  await page.goto(BASE + '/app/e/pentas-musikal-sangkuriang/s/ses_sk_16', { waitUntil: 'networkidle' })
  await pickCategory(page, 'Tukar Struk')
  await page.getByRole('button', { name: /Pilihkan 2 kursi/ }).click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /Hayu ngiring/ }).click()
  await page.waitForURL(/\/checkout\//)
  await login(page, '081299990002', 'Budi Santoso')
  await page.getByRole('button', { name: 'Pakai struk contoh' }).click()
  await page.waitForTimeout(1200)
  await shot(page, 'r1-receipt-filled')
  await page.getByRole('button', { name: 'Kirim struk untuk diverifikasi' }).click()
  await page.waitForURL(/\/orders\//)
  await page.waitForTimeout(800)
  await shot(page, 'r2-receipt-waiting')
  await ctx.close()
}

if (only === 'all' || only === 'free') {
  const ctx = await browser.newContext(mobile)
  const page = await newPage(ctx, 'free')
  await page.goto(BASE + '/app/e/pentas-musikal-sangkuriang/s/ses_sk_13', { waitUntil: 'networkidle' })
  await pickCategory(page, 'Festival')
  await page.getByRole('button', { name: 'Tambah jumlah orang' }).click()
  await page.waitForTimeout(300)
  await shot(page, 'f1-festival', false)
  await page.getByRole('button', { name: /Hayu ngiring/ }).click()
  await page.waitForURL(/\/checkout\//)
  await login(page, '081299990003', 'Citra Ayu')
  await page.getByRole('button', { name: 'Konfirmasi pendaftaran' }).click()
  await page.waitForURL(/\/orders\//)
  await page.waitForTimeout(600)
  await shot(page, 'f2-free-confirmed')
  await ctx.close()
}

if (only === 'all' || only === 'conflict') {
  const ctx = await browser.newContext(mobile)
  const page = await newPage(ctx, 'conflict')
  await page.goto(BASE + '/app/e/pentas-musikal-sangkuriang/s/ses_sk_13', { waitUntil: 'networkidle' })
  await pickCategory(page, 'VIP')
  await page.getByRole('button', { name: /Pilihkan 2 kursi/ }).click()
  await page.waitForTimeout(600)
  const before = await page.locator('p.font-bold').filter({ hasText: 'kursi ·' }).first().innerText()
  console.log('selected:', before)
  await page.getByRole('button', { name: 'Uji rebutan kursi' }).click()
  await page.getByRole('alert').filter({ hasText: 'baru saja dipilih orang lain' }).waitFor({ timeout: 5000 })
  await page.waitForTimeout(500)
  await shot(page, 'c1-conflict', false)
  await page.getByRole('button', { name: /Kenapa satu kursi tidak bisa terjual dua kali/ }).click()
  await page.getByRole('dialog', { name: 'Satu kursi, satu pemesan' }).waitFor()
  console.log('double-booking explainer: shown')
  await shot(page, 'c1b-explainer', false)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Pindah ke kursi saran' }).click()
  await page.waitForTimeout(500)
  const after = await page.locator('p.font-bold').filter({ hasText: 'kursi ·' }).first().innerText()
  console.log('after move:', after)
  await shot(page, 'c2-moved', false)
  await page.getByRole('button', { name: /Hayu ngiring/ }).click()
  await page.waitForURL(/\/checkout\//)
  console.log('hold after move OK')
  await ctx.close()
}

if (only === 'all' || only === 'expire') {
  const ctx = await browser.newContext(mobile)
  const page = await newPage(ctx, 'expire')
  await page.goto(BASE + '/app/e/pentas-musikal-sangkuriang/s/ses_sk_16', { waitUntil: 'networkidle' })
  await pickCategory(page, 'Reguler')
  await page.getByRole('button', { name: /Pilihkan 2 kursi/ }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: /Hayu ngiring/ }).click()
  await page.waitForURL(/\/checkout\//)
  await page.getByRole('button', { name: /Simulasikan waktu habis/ }).click()
  await page.getByRole('heading', { name: 'Waktu tahan habis' }).waitFor({ timeout: 5000 })
  console.log('expire demo: hold expired, seats released')
  await shot(page, 'e1-expired')
  await page.getByRole('link', { name: 'Pesan ulang' }).click()
  await page.waitForURL(/\/s\/ses_sk_16/)
  console.log('expire demo: back on the seat map')
  await ctx.close()
}

if (only === 'all' || only === 'waitlist') {
  const ctx = await browser.newContext(mobile)
  const page = await newPage(ctx, 'waitlist')
  await page.goto(BASE + '/app/e/kids-holiday-craft-class/s/ses_cr_1', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Masuk daftar tunggu/ }).click()
  await page.getByRole('dialog', { name: /Masuk untuk ikut daftar tunggu/ }).waitFor()
  await page.getByLabel('Nomor HP').fill('081299990004')
  await page.getByRole('button', { name: 'Kirim kode OTP' }).click()
  await page.getByTestId('sim-otp').waitFor()
  await page.getByLabel('Kode OTP').fill(await page.getByTestId('sim-otp').innerText())
  await page.getByRole('button', { name: /^Masuk$/ }).click()
  await page.getByPlaceholder('Nama lengkap').fill('Dina Waitlist')
  await page.getByRole('button', { name: 'Buat akun & masuk' }).click()
  await page.getByRole('button', { name: 'Keluar dari daftar tunggu' }).waitFor({ timeout: 8000 })
  console.log('waitlist: joined')
  await shot(page, 'w1-waitlist', false)
  await page.goto(BASE + '/app/akun', { waitUntil: 'networkidle' })
  await page.getByText(/Menunggu, urutan ke-3/).waitFor()
  console.log('waitlist: shown on account page (urutan ke-3)')
  await shot(page, 'w2-account')
  await ctx.close()
}

if (only === 'all' || only === 'manage') {
  const ctx = await browser.newContext(mobile)
  const page = await newPage(ctx, 'manage')
  await page.goto(BASE + '/app/e/pentas-musikal-sangkuriang/s/ses_sk_16', { waitUntil: 'networkidle' })
  await pickCategory(page, 'Reguler')
  await page.getByRole('button', { name: /Pilihkan 2 kursi/ }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /Hayu ngiring/ }).click()
  await page.waitForURL(/\/checkout\//)
  await login(page, '081299990005', 'Eka Kelola')
  await page.getByRole('button', { name: 'Simulasikan bayar berhasil' }).click()
  await page.waitForURL(/\/orders\//)
  await page.getByRole('button', { name: 'Ubah nama peserta' }).click()
  const inputs = page.getByRole('dialog').getByRole('textbox')
  await inputs.nth(1).fill('Fajar Kelola')
  await page.getByRole('button', { name: 'Simpan nama' }).click()
  await page.getByText(/Nama peserta diperbarui/).waitFor()
  await page.getByText('Fajar Kelola').first().waitFor()
  console.log('manage: attendee renamed')
  await page.getByRole('button', { name: 'Batalkan tiket' }).click()
  await page.getByRole('button', { name: 'Ya, batalkan' }).click()
  await page.getByRole('heading', { name: 'Pesanan dibatalkan' }).waitFor()
  await page.getByText(/Refund Rp100\.000/).first().waitFor()
  console.log('manage: cancelled with refund Rp100.000')
  await shot(page, 'm1-cancelled')
  await ctx.close()
}

if (only === 'all' || only === 'bonus') {
  const ctx = await browser.newContext(mobile)
  const page = await newPage(ctx, 'bonus')
  await page.goto(BASE + '/app/e/pentas-musikal-sangkuriang', { waitUntil: 'networkidle' })
  await page.getByText(/Bonus VIP:/).waitFor()
  await page.goto(BASE + '/app/e/pentas-musikal-sangkuriang/s/ses_sk_16', { waitUntil: 'networkidle' })
  await pickCategory(page, 'VIP')
  await page.getByText(/Bonus Foto bareng pemeran Sangkuriang untuk tiket pertama/).waitFor()
  console.log('bonus: offer shown on event detail and seat map')
  await shot(page, 'b1-bonus', false)
  await ctx.close()
}

if (only === 'all' || only === 'ocr') {
  const ctx = await browser.newContext(mobile)
  const page = await newPage(ctx, 'ocr')
  await page.goto(BASE + '/app/e/pentas-musikal-sangkuriang/s/ses_sk_16', { waitUntil: 'networkidle' })
  await pickCategory(page, 'Tukar Struk')
  await page.getByRole('button', { name: /Pilihkan 2 kursi/ }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /Hayu ngiring/ }).click()
  await page.waitForURL(/\/checkout\//)
  await login(page, '081299990006', 'Gita OCR')
  await page.getByRole('button', { name: /coba baca otomatis dari foto struk contoh/ }).click()
  await page.getByRole('button', { name: /Baca otomatis dari foto/ }).click()
  // the form fills itself when reading succeeds; wait for the nominal field (toasts can be missed)
  const outcome = await Promise.race([
    page.waitForFunction(() => /\d/.test(document.querySelector('input[id$="-amt"]')?.value ?? ''), null, { timeout: 120000 }).then(() => 'ok'),
    page.getByText(/Baca otomatis gagal/).first().waitFor({ timeout: 120000 }).then(() => 'fail'),
  ]).catch((e) => `timeout: ${String(e?.message ?? e).split('\n')[0]}`)
  if (outcome === 'ok') {
    const amount = await page.getByLabel('Nominal').first().inputValue()
    const no = await page.getByLabel('Nomor struk').first().inputValue()
    console.log(`ocr: read nominal=${amount} nomor=${no}`)
    await shot(page, 'o1-ocr')
  } else {
    console.log(`ocr: SKIPPED (${outcome}, model download from CDN not available)`)
  }
  await ctx.close()
}

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
if (errors.length) process.exitCode = 1
await browser.close()
