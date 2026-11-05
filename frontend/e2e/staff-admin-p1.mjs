// Panitia "Petugas" page (AD-13), petugas desk receipt check (PT-06) and account switcher.
// Usage: dev server running (npm run dev), then node e2e/staff-admin-p1.mjs
// Env: BASE (default http://localhost:5173), E2E_OUT (default e2e/out), CHROME_PATH (installed Chrome).
import { chromium } from 'playwright-core'
import { signIn, skipIntro } from './skip-intro.mjs'
import fs from 'node:fs'
import path from 'node:path'
const OUT = path.join(process.env.E2E_OUT || 'e2e/out', 'p1')
const BASE = process.env.BASE || 'http://localhost:5173'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const errors = []
const watch = (page, tag) => {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] console: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`))
}
// one context = one mock database, shared by panitia and petugas tabs
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
await skipIntro(ctx)
const admin = await ctx.newPage()
watch(admin, 'admin')
await signIn(admin, 'ADMIN', BASE)
await admin.goto(BASE + '/admin/staff', { waitUntil: 'networkidle' })
await admin.getByLabel('Nama').fill('Petugas Pintu Selatan')
await admin.getByLabel('Nomor HP').fill('0812 7777 0101')
await admin.getByLabel('Email').fill('pintu.selatan@summarevent.test')
await admin.getByRole('button', { name: 'Tambah petugas' }).click()
await admin.getByText(/Akun Petugas Pintu Selatan dibuat/).waitFor()
console.log('staff: account created')
const row = admin.getByRole('listitem').filter({ hasText: 'Petugas Pintu Selatan' })
await row.getByRole('button', { name: 'Nonaktifkan' }).click()
await admin.getByText(/dinonaktifkan/).first().waitFor()
await row.getByRole('button', { name: 'Aktifkan' }).waitFor()
console.log('staff: deactivated and can be re-activated')
await admin.screenshot({ path: path.join(OUT, 'admin-staff.png'), fullPage: true })

const phone = await ctx.newPage()
await phone.setViewportSize({ width: 390, height: 844 })
watch(phone, 'staff')
await signIn(phone, 'STAFF', BASE)
await phone.goto(BASE + '/staff', { waitUntil: 'networkidle' })
await phone.getByRole('link', { name: /Verifikasi struk/ }).click()
await phone.waitForURL(/\/staff\/receipts/)
await phone.getByRole('list', { name: 'Antrean struk' }).getByRole('button').first().click()
await phone.getByRole('button', { name: 'Setujui' }).click()
await phone.waitForTimeout(400)
if (await phone.getByRole('button', { name: 'Tetap setujui' }).count()) await phone.getByRole('button', { name: 'Tetap setujui' }).click()
await phone.getByText(/Struk disetujui/).waitFor()
console.log('desk: receipt approved by petugas')
await phone.screenshot({ path: path.join(OUT, 'staff-desk.png'), fullPage: true })
await phone.goto(BASE + '/staff', { waitUntil: 'networkidle' })
await phone.getByLabel('Ganti akun petugas').selectOption({ label: 'Petugas Pintu Utara (demo)' })
await phone.getByText('Halo, Petugas Pintu Utara').waitFor()
console.log('staff: switched account to Petugas Pintu Utara')
await browser.close()
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
if (errors.length) process.exitCode = 1
