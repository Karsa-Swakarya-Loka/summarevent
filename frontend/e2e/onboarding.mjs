// The first minute of each role: the splash (once for the web, once per role, named), the visitor's three-step
// onboarding and Daftar with the simulated OTP, then the panitia's and the petugas' onboarding and email sign-in.
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
// the splash names the role being entered; on a real network the name is written a moment after the splash paints
const roleNamed = (page, name) => page.locator('#splash .sp-role', { hasText: name }).waitFor({ timeout: 3000 }).then(() => true, () => false)

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

// 2. Entering a role from the role picker plays that role's splash, named; a new visitor then gets three steps
await page.getByRole('button', { name: /Masuk sebagai pengunjung/ }).click()
await splash.waitFor({ timeout: 3000 })
check(await roleNamed(page, 'Pengunjung'), 'splash pengunjung tidak menyebut perannya')
await page.waitForTimeout(900)
await shot(page, '02-splash-pengunjung')
await splash.waitFor({ state: 'detached', timeout: 5000 })
await page.waitForURL(/\/app\/mulai/)
const titles = []
for (let i = 0; i < 3; i++) {
  const h = page.getByRole('heading', { level: 1 })
  // the text itself, not its rendering: titles are set in uppercase display type
  titles.push(((await h.textContent()) ?? '').trim())
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
check((await splash.count()) === 0, 'splash pengunjung muncul lagi di sesi yang sama')
console.log('daftar: Sinta Maharani signed up and is on Beranda')
await ctx.close()

// 4. Panitia, straight to /admin: the splash named Panitia, their three steps, then the email sign-in
const adminCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
const admin = await adminCtx.newPage()
watch(admin, 'admin')
await admin.goto(BASE + '/admin', { waitUntil: 'commit' })
await admin.locator('#splash').waitFor({ timeout: 3000 })
check(await roleNamed(admin, 'Panitia'), 'splash panitia tidak menyebut perannya')
await admin.locator('#splash').waitFor({ state: 'detached', timeout: 5000 })
await admin.waitForURL(/\/admin\/mulai/)
const adminTitles = []
for (let i = 0; i < 3; i++) {
  adminTitles.push(((await admin.getByRole('heading', { level: 1 }).textContent()) ?? '').trim())
  if (i < 2) await admin.getByRole('button', { name: /^Lanjut/ }).click()
}
console.log('panitia onboarding:', adminTitles.join(' → '))
check(new Set(adminTitles).size === 3, `judul onboarding panitia: ${adminTitles.join(' | ')}`)
await admin.getByRole('button', { name: 'Masuk sebagai panitia' }).click()
await admin.waitForURL(/\/admin\/masuk/)
await shot(admin, '05-admin-masuk')
await admin.getByLabel('Email').fill('panitia@summarevent.test')
await admin.getByLabel('Kata sandi', { exact: true }).fill('salah123')
await admin.getByRole('button', { name: 'Masuk', exact: true }).click()
const refused = await admin.getByRole('alert').filter({ hasText: 'Email atau kata sandi salah' }).waitFor({ timeout: 3000 }).then(() => true, () => false)
check(refused, 'kata sandi yang salah tidak ditolak')
// forgot the password: the form answers the same for any email, and in the demo shows the link the email would carry
await admin.getByRole('link', { name: 'Lupa kata sandi?' }).click()
await admin.waitForURL(/\/lupa-sandi/)
await admin.getByRole('heading', { name: 'Lupa kata sandi' }).waitFor()
await admin.getByLabel('Email').fill('panitia@summarevent.test')
await admin.getByRole('button', { name: 'Kirim link reset' }).click()
await admin.getByText(/Cek email panitia@summarevent.test/).waitFor()
await shot(admin, '05b-lupa-sandi')
const resetLink = admin.getByRole('link', { name: 'Buka link reset' })
if (await resetLink.count()) {
  await resetLink.click()
  await admin.waitForURL(/\/reset\?token=/)
  await admin.getByLabel('Kata sandi baru').fill('pendek')
  await admin.getByLabel('Ulangi kata sandi').fill('pendek')
  await admin.getByRole('button', { name: 'Simpan dan masuk' }).click()
  check(await admin.getByRole('alert').filter({ hasText: 'minimal 8' }).waitFor({ timeout: 3000 }).then(() => true, () => false), 'sandi 6 huruf tidak ditolak')
  await admin.getByLabel('Kata sandi baru').fill('sandi-baru-panitia')
  await admin.getByLabel('Ulangi kata sandi').fill('sandi-baru-panitia')
  await admin.getByRole('button', { name: 'Simpan dan masuk' }).click()
  await admin.waitForURL(/\/admin$/)
  await admin.getByRole('heading', { name: /^Selamat datang/ }).waitFor()
  console.log('panitia: forgot → reset link → new password → signed in')
  // the new password works and the old one is gone; the demo button on the sign-in still fills the demo account
  await admin.goto(BASE + '/admin/masuk', { waitUntil: 'networkidle' })
  await admin.getByLabel('Email').fill('panitia@summarevent.test')
  await admin.getByLabel('Kata sandi', { exact: true }).fill('sandi-baru-panitia')
  await admin.getByRole('button', { name: 'Masuk', exact: true }).click()
  await admin.waitForURL(/\/admin$/)
} else {
  // a real backend sends the email instead of showing the link: sign in with the demo account
  console.log('panitia: forgot answered without a link (live), signing in with the demo account')
  await admin.goto(BASE + '/admin/masuk', { waitUntil: 'networkidle' })
  await admin.getByRole('button', { name: 'Isi otomatis' }).click()
  await admin.getByRole('button', { name: 'Masuk', exact: true }).click()
  await admin.waitForURL(/\/admin$/)
}
await admin.getByRole('heading', { name: /^Selamat datang/ }).waitFor()
await admin.reload({ waitUntil: 'networkidle' })
check((await admin.locator('#splash').count()) === 0, 'splash panitia muncul lagi di sesi yang sama')
check(/\/admin$/.test(admin.url()), 'panitia diminta masuk lagi setelah memuat ulang')
console.log('panitia: splash, onboarding, sign-in (wrong password refused), dashboard')
await adminCtx.close()

// 5. Petugas, from the role picker: the splash named Petugas, the onboarding skipped, the sign-in, their home
const staffCtx = await browser.newContext(phone)
const staff = await staffCtx.newPage()
watch(staff, 'staff')
await staff.goto(BASE + '/', { waitUntil: 'networkidle' })
await staff.locator('#splash').waitFor({ state: 'detached', timeout: 5000 })
await staff.getByRole('button', { name: /Masuk sebagai petugas/ }).click()
await staff.locator('#splash').waitFor({ timeout: 3000 })
check(await roleNamed(staff, 'Petugas'), 'splash petugas tidak menyebut perannya')
await staff.locator('#splash').waitFor({ state: 'detached', timeout: 5000 })
await staff.waitForURL(/\/staff\/mulai/)
await staff.getByRole('button', { name: 'Lewati' }).click()
await staff.waitForURL(/\/staff\/masuk/)
await staff.getByRole('button', { name: 'Isi otomatis' }).click()
await staff.getByRole('button', { name: 'Masuk', exact: true }).click()
await staff.waitForURL(/\/staff$/)
await staff.getByText('Halo,').first().waitFor()
console.log('petugas: splash, onboarding skipped, sign-in, home')
await staffCtx.close()

// 6. Reduced motion: the splash is a still frame and leaves quickly
const calmCtx = await browser.newContext({ ...phone, reducedMotion: 'reduce' })
const calm = await calmCtx.newPage()
watch(calm, 'reduced-motion')
// timed from the page's first byte, so a slow answer from the server does not count against the splash
await calm.addInitScript(() => {
  new MutationObserver(() => {
    if (document.getElementById('splash')) window.__splashSeen = true
    else if (window.__splashSeen && !window.__splashGoneAt) window.__splashGoneAt = performance.now()
  }).observe(document, { subtree: true, childList: true })
})
await calm.goto(BASE + '/', { waitUntil: 'commit' })
await calm.locator('#splash').waitFor({ state: 'detached', timeout: 5000 })
const ms = await calm.evaluate(() => Math.round((window.__splashGoneAt ?? performance.now()) - performance.getEntriesByType('navigation')[0].responseStart))
console.log(`reduced motion: splash gone ${ms} ms after the page arrived`)
check(ms < 2000, `splash dengan reduced motion bertahan ${ms} ms`)
await calmCtx.close()

await browser.close()
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'onboarding: all checks passed')
process.exitCode = errors.length ? 1 : 0
