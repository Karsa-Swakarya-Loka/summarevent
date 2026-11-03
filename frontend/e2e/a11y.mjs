// Aksesibilitas: axe-core (WCAG 2.1 A + AA) di layar utama ketiga peran, plus target sentuh kursi.
// Usage: dev server running (npm run dev), then node e2e/a11y.mjs
// Env: BASE (default http://localhost:5173), CHROME_PATH (installed Chrome).
import { createRequire } from 'node:module'
import { chromium } from 'playwright-core'

const BASE = process.env.BASE || 'http://localhost:5173'
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js')
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
const laptop = { viewport: { width: 1366, height: 900 } }
const errors = []

const pickReguler = async (page) => {
  await page.getByRole('radiogroup', { name: 'Kategori tiket' }).getByRole('radio', { name: /Reguler/ }).click()
  await page.getByRole('button', { name: /Pilihkan 2 kursi/ }).click()
}
const toCheckout = async (page) => {
  await pickReguler(page)
  await page.getByRole('button', { name: /Hayu ngiring/ }).click()
  await page.waitForURL(/\/checkout\//)
}

// After a category is picked the map zooms in: every seat must be a 44 px touch target (PRD §13–14).
const seatTarget = async (page) => {
  await pickReguler(page)
  await page.waitForTimeout(700)
  const px = await page.evaluate(() => {
    const seat = [...document.querySelectorAll('svg[aria-label="Denah kursi"] g[role="button"]')][0]
    return seat ? Math.round(seat.querySelector('rect:last-of-type').getBoundingClientRect().width) : 0
  })
  console.log(`seat touch target after zoom: ${px} px`)
  if (px < 44) errors.push(`seat touch target ${px} px < 44 px`)
}

const screens = [
  [phone, '/'],
  [phone, '/app'],
  [phone, '/app/e/pentas-musikal-sangkuriang'],
  [phone, '/app/e/kids-holiday-craft-class'],
  [phone, '/app/e/pentas-musikal-sangkuriang/s/ses_sk_16', seatTarget],
  [phone, '/app/e/pentas-musikal-sangkuriang/s/ses_sk_16', toCheckout],
  [phone, '/app/pass'],
  [phone, '/app/inbox'],
  [phone, '/app/akun'],
  [phone, '/staff'],
  [phone, '/staff/scan/ses_sk_demo'],
  [phone, '/staff/search/ses_sk_demo'],
  [laptop, '/admin'],
  [laptop, '/admin/events'],
  [laptop, '/admin/events/new'],
  [laptop, '/admin/live'],
  [laptop, '/admin/orders'],
  [laptop, '/admin/receipts'],
]

for (const [device, path, prep] of screens) {
  const ctx = await browser.newContext(device)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${path}: ${e.message}`))
  await page.goto(BASE + path, { waitUntil: 'networkidle' })
  if (prep) await prep(page)
  await page.waitForTimeout(600)
  await page.addScriptTag({ path: AXE })
  const violations = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
    return r.violations.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes[0]?.target.join(' ')}`)
  })
  const label = `${path}${prep ? ` (${prep.name})` : ''}`
  console.log(`${violations.length ? '!!' : 'ok'} ${label}${violations.length ? `: ${violations.length} violation(s)` : ''}`)
  for (const v of violations) errors.push(`${label}: ${v}`)
  await ctx.close()
}

await browser.close()
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : `${screens.length} screens, 0 WCAG 2.1 AA violations`)
process.exitCode = errors.length ? 1 : 0
