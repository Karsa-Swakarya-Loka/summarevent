// A new visitor's first minute: the splash, the three-step onboarding, then Daftar with the simulated OTP.
// Usage: dev server running (npm run dev), then node e2e/onboarding.mjs
// Env: BASE (default http://localhost:5173), E2E_OUT (default e2e/out), CHROME_PATH (installed Chrome).
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'

const BASE = process.env.BASE || 'http://localhost:5173'
const OUT = path.join(process.env.E2E_OUT || 'e2e/out', 'onboarding')
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const phone = { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const errors = []
const check = (ok, msg) => {
  if (!ok) errors.push(msg)
}
const watch = (page, tag) => {
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${tag}] console: ${m.text()}`))
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`))
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })

// 1. Splash: shows on the first visit, fades out on its own, and stays away for the rest of the session
const ctx = await browser.newContext(phone)
const page = await ctx.newPage()
watch(page, 'visitor')
await page.goto(BASE + '/', { waitUntil: 'commit' })
const splash = page.locator('#splash')
check((await splash.count()) === 1, 'splash tidak muncul di kunjungan pertama')
await page.waitForTimeout(900)
await shot(page, '01-splash')
const gone = await splash.waitFor({ state: 'detached', timeout: 5000 }).then(() => true, () => false)
check(gone, 'splash tidak hilang sendiri dalam 5 detik')
await page.getByRole('button', { name: /Masuk sebagai pengunjung/ }).waitFor()
await page.reload({ waitUntil: 'domcontentloaded' })
check((await splash.count()) === 0, 'splash muncul lagi di sesi yang sama')
console.log('splash: shown once, then gone')

// 2. Onboarding: the first visit to the visitor app goes through three steps
await page.goto(BASE + '/app', { waitUntil: 'networkidle' })
await page.waitForURL(/\/app\/mulai/)
const titles = []
for (let i = 0; i < 3; i++) {
  const h = page.getByRole('heading', { level: 1 })
  titles.push((await h.innerText()).trim())
  await shot(page, `02-onboarding-${i + 1}`)
  if (i < 2) await page.getByRole('button', { name: /^Lanjut/ }).click()
}
console.log('onboarding:', titles.join(' → '))
check(titles.join('|') === 'Pilih kursimu sendiri|Bayar, gratis, atau tukar struk|Satu QR untuk masuk', `judul onboarding: ${titles.join(' | ')}`)
await page.getByRole('button', { name: 'Masuk atau daftar' }).click()
await page.waitForURL(/\/app\/masuk/)

// 3. Daftar: name first, then the number and the simulated OTP, auto-filled
await page.getByRole('link', { name: 'Daftar' }).click()
await page.waitForURL(/\/app\/daftar/)
await page.getByLabel('Nama lengkap').fill('Sinta Maharani')
await page.getByLabel('Nomor HP').fill('0812 9999 5555')
await page.getByRole('button', { name: 'Kirim kode OTP' }).click()
await page.getByTestId('sim-otp').waitFor()
await shot(page, '03-daftar-otp')
await page.getByRole('button', { name: 'Isi otomatis' }).click()
await page.waitForURL(/\/app$/)
const chip = page.getByRole('link', { name: 'Akun Sinta Maharani' })
check(await chip.waitFor({ timeout: 5000 }).then(() => true, () => false), 'setelah daftar, Beranda tidak menampilkan akun Sinta Maharani')
await shot(page, '04-home-after-signup')
await page.goto(BASE + '/app', { waitUntil: 'networkidle' })
check(!/\/app\/mulai/.test(page.url()), 'onboarding muncul lagi setelah selesai')
console.log('daftar: Sinta Maharani signed up and is on Beranda')
await ctx.close()

// 4. Never on the panitia side: hidden from the first parsed byte (no flash on a slow network), gone once parsed
const adminCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
const admin = await adminCtx.newPage()
watch(admin, 'admin')
await admin.goto(BASE + '/admin', { waitUntil: 'commit' })
check(!(await admin.locator('#splash').isVisible()), 'splash terlihat sekilas di halaman panitia')
await admin.waitForLoadState('domcontentloaded')
check((await admin.locator('#splash').count()) === 0, 'splash muncul di halaman panitia')
await adminCtx.close()

// 5. Reduced motion: the splash is a still frame and leaves quickly
const calmCtx = await browser.newContext({ ...phone, reducedMotion: 'reduce' })
const calm = await calmCtx.newPage()
watch(calm, 'reduced-motion')
const t0 = Date.now()
await calm.goto(BASE + '/', { waitUntil: 'commit' })
await calm.locator('#splash').waitFor({ state: 'detached', timeout: 5000 })
const ms = Date.now() - t0
console.log(`reduced motion: splash gone after ${ms} ms`)
check(ms < 2000, `splash dengan reduced motion bertahan ${ms} ms`)
await calmCtx.close()

await browser.close()
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'onboarding: all checks passed')
process.exitCode = errors.length ? 1 : 0
