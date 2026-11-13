// PT-07 scan offline, khusus backend: app di-build dengan VITE_API_URL, lalu
//   API_URL=https://alamat-backend/api BASE=https://alamat-app node e2e/offline.mjs
// Alur: HP petugas menyimpan daftar tiket → sinyal putus → Valid / Sudah digunakan / Tidak valid tetap jalan →
// sinyal kembali → antrean terkirim; tiket yang lebih dulu dipindai pintu lain muncul sebagai konflik.
import { chromium } from 'playwright-core'
import { signIn, skipIntro } from './skip-intro.mjs'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://localhost:5173'
const API = process.env.API_URL
if (!API) {
  console.log('SKIP offline: hanya untuk versi live (set API_URL)')
  process.exit(0)
}
const OUT = path.join(process.env.E2E_OUT || 'e2e/out', 'offline')
fs.mkdirSync(OUT, { recursive: true })
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const errors = []

const json = async (method, p, body, token) => {
  const r = await fetch(API + p, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Guest-Id': 'guest_e2eoffline1', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return r.json()
}

// Two ACTIVE tickets of the always-running demo session, straight from the API.
const rina = await json('POST', '/auth/demo-login', { role: 'VISITOR' })
const pass = await json('GET', '/me/tickets', null, rina.token)
const demo = pass.filter((p) => p.session.demoLive && p.ticket.status === 'ACTIVE')
if (demo.length < 2) throw new Error(`butuh 2 tiket aktif di sesi demo, ada ${demo.length}`)
const [a, b] = demo.map((p) => p.ticket)
const otherGate = await json('POST', '/auth/demo-login', { role: 'STAFF' })

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await skipIntro(ctx)
await ctx.grantPermissions(['camera'], { origin: BASE })
const page = await ctx.newPage()
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  // while the phone is offline the browser logs failed requests; those are the point of this test
  if (m.type() === 'error' && !/ERR_INTERNET_DISCONNECTED|Failed to fetch|Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`)
})

const result = async () => {
  const el = page.locator('section[data-result]')
  await el.waitFor({ timeout: 10_000 })
  return { result: await el.getAttribute('data-result'), offline: await page.getByTestId('offline-badge').count() }
}
const next = async () => {
  await page.locator('section[data-result] button', { hasText: /Scan berikutnya/ }).last().click()
  await page.locator('section[data-result]').waitFor({ state: 'detached' })
}
const paste = async (token) => {
  await page.locator('#paste-qr').fill(token)
  await page.getByRole('button', { name: 'Check-in', exact: true }).click()
}

await signIn(page, 'STAFF', BASE)
await page.goto(BASE + '/staff', { waitUntil: 'networkidle' })
await page.locator('[data-session="ses_sk_demo"]').getByRole('link', { name: 'Mulai scan' }).click()
await page.waitForURL('**/staff/scan/ses_sk_demo')
await page.waitForFunction(() => !!localStorage.getItem('summarevent:offline:manifest:ses_sk_demo'), null, { timeout: 10_000 })
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('summarevent:offline:manifest:ses_sk_demo')).tickets.length)
console.log(`manifest tersimpan: ${stored} tiket`)
await page.getByRole('button', { name: /Alat uji/ }).click()

await ctx.setOffline(true)
await page.getByTestId('offline-bar').waitFor()
console.log('offline bar:', (await page.getByTestId('offline-bar').textContent()).trim())

await paste(a.qrToken)
const r1 = await result()
console.log('offline tiket A →', r1.result, r1.offline ? '(badge offline)' : '')
await page.screenshot({ path: path.join(OUT, '01-offline-valid.png') })
await next()

await paste(a.qrToken)
const r2 = await result()
console.log('offline tiket A lagi →', r2.result)
await next()

await paste(a.qrToken.slice(0, -4) + 'abcd')
const r3 = await result()
console.log('offline QR palsu →', r3.result)
await next()

await paste(b.qrToken)
const r4 = await result()
console.log('offline tiket B →', r4.result)
await next()
console.log('antrean:', (await page.getByTestId('offline-bar').textContent()).trim())

// Meanwhile another gate (online) lets ticket B in first.
const gate = await json('POST', '/staff/checkins', { qr_token: b.qrToken, session_id: 'ses_sk_demo' }, otherGate.token)
console.log('pintu lain (online) tiket B →', gate.result)

await ctx.setOffline(false)
await page.getByTestId('offline-conflicts').waitFor({ timeout: 15_000 })
console.log('konflik:', (await page.getByTestId('offline-conflicts').textContent()).replace(/\s+/g, ' ').trim())
await page.screenshot({ path: path.join(OUT, '02-synced-conflict.png') })

const after = await json('GET', '/me/tickets', null, rina.token)
const statusA = after.find((p) => p.ticket.id === a.id).ticket.status
console.log('status tiket A di server:', statusA)

await browser.close()
const ok = r1.result === 'VALID' && r1.offline && r2.result === 'ALREADY_USED' && r3.result === 'INVALID' && r4.result === 'VALID' && gate.result === 'VALID' && statusA === 'USED'
if (!ok) errors.push('hasil tidak sesuai harapan')
if (errors.length) {
  console.log('ERRORS:\n' + errors.join('\n'))
  process.exit(1)
}
console.log('offline: semua cek lolos')
