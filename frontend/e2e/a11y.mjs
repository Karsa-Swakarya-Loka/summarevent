// Aksesibilitas: axe-core (WCAG 2.1 A + AA) di layar utama ketiga peran. Di HP 360 px, setiap target sentuh
// minimal 44 px (AGENTS.md §3), dan kursi diukur setelah denah di-zoom ke kategori (PRD §13–14).
// Usage: dev server running (npm run dev), then node e2e/a11y.mjs
// Env: BASE (default http://localhost:5173), CHROME_PATH (installed Chrome).
import { createRequire } from 'node:module'
import { chromium } from 'playwright-core'

const BASE = process.env.BASE || 'http://localhost:5173'
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js')
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
// The narrowest phone the app supports. A touch screen, so `pointer: coarse` styles apply.
const phone = { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true }
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

const openDemoMenu = async (page) => {
  await page.getByRole('button', { name: 'Menu demo' }).click()
  await page.getByRole('menu').waitFor()
}

// Tukar Struk checkout after the OTP login: the receipt form with its live checklist.
const receiptForm = async (page) => {
  await page.getByRole('radiogroup', { name: 'Kategori tiket' }).getByRole('radio', { name: /Tukar Struk/ }).click()
  await page.getByRole('button', { name: /Pilihkan 2 kursi/ }).click()
  await page.getByRole('button', { name: /Hayu ngiring/ }).click()
  await page.waitForURL(/\/checkout\//)
  await page.getByLabel('Nomor HP').fill('081299990077')
  await page.getByRole('button', { name: 'Kirim kode OTP' }).click()
  await page.getByTestId('sim-otp').waitFor()
  await page.getByLabel('Kode OTP').fill(await page.getByTestId('sim-otp').innerText())
  await page.getByRole('button', { name: /^Masuk$/ }).click()
  await page.getByPlaceholder('Nama lengkap').fill('Sari Lestari')
  await page.getByRole('button', { name: 'Buat akun & masuk' }).click()
  await page.getByRole('button', { name: 'Pakai struk contoh' }).click()
  await page.waitForTimeout(800)
}

const scanResult = async (page) => {
  await page.getByRole('button', { name: /Alat bantu demo/ }).click()
  await page.getByRole('button', { name: 'Ambil tiket contoh' }).click()
  await page.locator('section[data-result]').waitFor()
}

// Rina's ticket goes through the gate, then her own Pass Saya says "Hatur nuhun!".
const rinaAfterCheckin = async (page) => {
  await page.getByLabel('Kode tiket, kode pesanan, nomor HP, atau nama').fill('Rina')
  await page.locator('li[data-ticket]').getByRole('button', { name: 'Check-in', exact: true }).first().click()
  await page.locator('section[data-result]').waitFor()
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /masuk cepat sebagai Rina/ }).click()
  await page.getByRole('region', { name: 'Sudah check-in' }).waitFor()
}

const wizardCategories = async (page) => {
  await page.getByRole('textbox', { name: 'Judul event' }).fill('Dongeng Sore Si Kancil')
  await page.getByRole('textbox', { name: 'Deskripsi' }).fill('Dongeng interaktif 30 menit untuk anak.')
  await page.getByRole('button', { name: /^Lanjut/ }).click()
  await page.getByRole('textbox', { name: 'Nama kategori' }).first().waitFor()
}

const orderDetail = async (page) => {
  await page.getByRole('list', { name: 'Daftar pesanan' }).getByRole('button').first().click()
  await page.getByRole('dialog').waitFor()
}

const receiptReview = async (page) => {
  await page.getByRole('list', { name: 'Antrean struk' }).getByRole('listitem').first().getByRole('button').click()
  await page.waitForTimeout(600)
}

/** Interactive elements under 44 px on a touch screen. Links inside a sentence are exempt (WCAG 2.5.5). */
const smallTargets = (page) =>
  page.evaluate(() => {
    const sel = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=radio], [role=checkbox], [role=switch], [role=menuitem], [role=option], summary'
    const small = []
    for (const el of document.querySelectorAll(sel)) {
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.display === 'inline') continue
      if (el.closest('[aria-hidden="true"], [inert], svg[aria-label="Denah kursi"]')) continue
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      // a control's own label is part of its target
      const lab = el.closest('label') || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`))
      const lr = lab ? lab.getBoundingClientRect() : r
      const w = Math.max(r.width, lr.width)
      const h = Math.max(r.height, lr.height)
      if (Math.min(w, h) >= 43.5) continue
      const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40)
      small.push(`"${name}" ${Math.round(w)}×${Math.round(h)} px`)
    }
    return [...new Set(small)]
  })

const screens = [
  [phone, '/'],
  [phone, '/app'],
  [phone, '/app', openDemoMenu],
  [phone, '/app/e/pentas-musikal-sangkuriang'],
  [phone, '/app/e/kids-holiday-craft-class'],
  [phone, '/app/e/pentas-musikal-sangkuriang/s/ses_sk_16', seatTarget],
  [phone, '/app/e/pentas-musikal-sangkuriang/s/ses_sk_16', toCheckout],
  [phone, '/app/e/pentas-musikal-sangkuriang/s/ses_sk_16', receiptForm],
  [phone, '/app/pass'],
  [phone, '/app/inbox'],
  [phone, '/app/akun'],
  [phone, '/staff'],
  [phone, '/staff/scan/ses_sk_demo'],
  [phone, '/staff/scan/ses_sk_demo', scanResult],
  [phone, '/staff/search/ses_sk_demo'],
  [phone, '/staff/search/ses_sk_demo', rinaAfterCheckin],
  [phone, '/staff/receipts'],
  [phone, '/admin'],
  [phone, '/admin/events'],
  [phone, '/admin/events/new', wizardCategories],
  [phone, '/admin/live'],
  [phone, '/admin/orders', orderDetail],
  [phone, '/admin/receipts', receiptReview],
  [phone, '/admin/staff'],
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
  const small = device === phone ? await smallTargets(page) : []
  const label = `${device === phone ? '360' : '1366'} ${path}${prep ? ` (${prep.name})` : ''}`
  const issues = violations.length + small.length
  console.log(`${issues ? '!!' : 'ok'} ${label}${violations.length ? ` · ${violations.length} WCAG violation(s)` : ''}${small.length ? ` · ${small.length} small target(s)` : ''}`)
  for (const v of violations) errors.push(`${label}: ${v}`)
  for (const t of small) errors.push(`${label}: target sentuh ${t} < 44 px`)
  await ctx.close()
}

await browser.close()
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : `${screens.length} screens, 0 WCAG 2.1 AA violations, every phone touch target ≥ 44 px`)
process.exitCode = errors.length ? 1 : 0
