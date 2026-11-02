#!/usr/bin/env node
// Staff (petugas) QA walk-through. Usage: node scripts/tmp/staff-qa.mjs [outDir]
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://localhost:5173'
const OUT = process.argv[2] || path.join(process.env.E2E_OUT || 'e2e/out', 'staff')
fs.mkdirSync(OUT, { recursive: true })
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const logs = []
function watch(page, tag) {
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${tag}][console.${m.type()}] ${m.text()}`)
  })
  page.on('pageerror', (e) => logs.push(`[${tag}][pageerror] ${e.message}`))
}
const shot = async (page, name) => {
  const file = path.join(OUT, name + '.png')
  await page.screenshot({ path: file })
  console.log('saved', file)
}
const resultOf = async (page) => {
  const el = page.locator('section[data-result]')
  await el.waitFor({ timeout: 10_000 })
  return el.getAttribute('data-result')
}
const next = async (page) => {
  await page.locator('section[data-result] button', { hasText: /Scan berikutnya|Kembali ke pencarian/ }).last().click()
  await page.locator('section[data-result]').waitFor({ state: 'detached' })
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await ctx.grantPermissions(['camera'], { origin: BASE })
const page = await ctx.newPage()
watch(page, 'main')

// 1. Home
await page.goto(BASE + '/staff', { waitUntil: 'networkidle' })
await page.getByText('Halo,').waitFor()
await page.locator('[data-session="ses_sk_demo"]').waitFor()
await page.waitForTimeout(500)
await page.screenshot({ path: path.join(OUT, '01-home.png'), fullPage: true })
console.log('saved 01-home (full page)')

// 2. Scanner with fake camera
await page.locator('[data-session="ses_sk_demo"]').getByRole('link', { name: 'Mulai scan' }).click()
await page.waitForURL('**/staff/scan/ses_sk_demo')
const live = await page.getByText('Arahkan QR e-ticket ke kotak').waitFor({ timeout: 12_000 }).then(() => true, () => false)
console.log('camera live:', live)
await page.waitForTimeout(800)
await shot(page, '02-scanner')

// 3. Demo tools: sample ticket → VALID
await page.getByRole('button', { name: /Alat bantu demo/ }).click()
await shot(page, '03-scanner-demo-open')
await page.getByRole('button', { name: 'Ambil tiket contoh' }).click()
console.log('sample →', await resultOf(page), '|', await page.getByTestId('demo-note').textContent())
await shot(page, '04-valid')
const hasGroup = await page.getByRole('button', { name: /Masukkan juga/ }).count()
console.log('group offer:', hasGroup)
await next(page)

// 4. Same ticket again → ALREADY_USED
await page.getByRole('button', { name: 'Scan ulang tiket tadi' }).click()
console.log('repeat →', await resultOf(page))
await shot(page, '05-already-used')
await next(page)

// 5. Fake QR → INVALID
await page.getByRole('button', { name: 'QR palsu' }).click()
console.log('fake →', await resultOf(page))
await shot(page, '06-invalid')
await next(page)

// 6. Ticket from another session → WRONG_SESSION
await page.getByRole('button', { name: 'Tiket sesi lain' }).click()
console.log('other session →', await resultOf(page), '|', await page.getByTestId('demo-note').textContent())
await shot(page, '07-wrong-session')
await next(page)
console.log('attendance:', await page.getByTestId('attendance').textContent())

// 7. VALID auto-dismiss check (pick until a VALID without group shows, then wait)
// 8. Manual search for Rina → check-in
await page.goto(BASE + '/staff/search/ses_sk_demo', { waitUntil: 'networkidle' })
await page.getByLabel('Kode tiket, kode pesanan, nomor HP, atau nama').fill('Rina')
await page.locator('li[data-ticket]').first().waitFor()
await page.waitForTimeout(400)
await page.screenshot({ path: path.join(OUT, '08-search-rina.png'), fullPage: true })
console.log('saved 08-search-rina (full page)')
const ready = page.locator('li[data-ticket]').filter({ has: page.getByRole('button', { name: 'Check-in', exact: true }) })
const target = (await ready.count()) ? ready.first() : page.locator('li[data-ticket]').first()
await target.getByRole('button').click()
const manualRes = await resultOf(page)
console.log('manual →', manualRes)
await page.waitForTimeout(300)
await shot(page, '09-manual-result')
if (await page.getByRole('button', { name: /Masukkan juga/ }).count()) {
  await page.getByRole('button', { name: /Masukkan juga/ }).click()
  await page.getByText(/Total \d+ orang masuk/).waitFor()
  await shot(page, '10-group-done')
}
await next(page)
await page.waitForTimeout(500)
await page.screenshot({ path: path.join(OUT, '11-search-after.png'), fullPage: true })

// 9. Zero results
await page.getByLabel('Kode tiket, kode pesanan, nomor HP, atau nama').fill('zzqx')
await page.getByText(/Tidak ada tiket/).waitFor()
await shot(page, '12-search-empty')

// 10. Session not open yet → OUTSIDE_WINDOW
await page.goto(BASE + '/staff/scan/ses_sk_13', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
const demoBtn = page.getByRole('button', { name: 'Ambil tiket contoh' })
if (!(await demoBtn.count())) await page.getByRole('button', { name: /Alat bantu demo/ }).click()
await page.getByRole('button', { name: 'Ambil tiket contoh' }).click()
console.log('ses_sk_13 →', await resultOf(page))
await shot(page, '13-outside-window')
await next(page)
await shot(page, '14-scanner-not-open-banner')

// 11. VALID auto-dismiss
await page.goto(BASE + '/staff/scan/ses_sk_demo', { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
for (let i = 0; i < 6; i++) {
  await page.getByRole('button', { name: 'Ambil tiket contoh' }).click()
  const r = await resultOf(page)
  const group = await page.getByRole('button', { name: /Masukkan juga/ }).count()
  if (r === 'VALID' && !group) {
    const t0 = Date.now()
    await page.locator('section[data-result]').waitFor({ state: 'detached', timeout: 8000 })
    console.log('auto-dismissed after', Date.now() - t0, 'ms')
    break
  }
  await next(page)
}
await ctx.close()

// 12. No camera at all → fallback panel
const browser2 = await chromium.launch({ executablePath: CHROME, headless: true })
const ctx2 = await browser2.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page2 = await ctx2.newPage()
watch(page2, 'nocam')
await page2.goto(BASE + '/staff/scan/ses_sk_demo', { waitUntil: 'networkidle' })
await page2.getByText('Tempel kode QR').first().waitFor({ timeout: 12_000 }).catch(() => undefined)
await page2.waitForTimeout(500)
await shot(page2, '15-camera-fallback')
await browser2.close()
await browser.close()

console.log('\n--- console / page errors ---')
for (const l of logs) console.log(l)
console.log(logs.length ? `ERRORS: ${logs.length}` : 'no console errors')
if (logs.length) process.exitCode = 1
