// The first minute of each role: the splash (once for the web, once per role, named), the visitor's three-step
// onboarding and Daftar with the simulated OTP, then the panitia's and the petugas' onboarding and email sign-in.
// Usage: dev server running (npm run dev), then node e2e/onboarding.mjs
// Env: BASE (default http://localhost:5173), E2E_OUT (default e2e/out), CHROME_PATH (installed Chrome).
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { frontRole, skipIntro, toPoster } from './skip-intro.mjs'

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
  // a 4xx the flow provokes on purpose (the wrong password → 401 BAD_LOGIN) is the backend doing its job
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource: the server responded with a status of 4\d\d/.test(m.text()) && errors.push(`[${tag}] console: ${m.text()}`))
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`))
}
// a load in a browser tab never plays the motion: at most the plain cover in the page colour waits for the fonts
const quiet = (page) => page.evaluate(() => !document.getElementById('splash') || /\b(no-splash|web-start)\b/.test(document.documentElement.className))
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
// the splash names the role being entered; on a real network the name is written a moment after the splash paints
const roleNamed = (page, name) => page.locator('#splash .sp-role', { hasText: name }).waitFor({ timeout: 3000 }).then(() => true, () => false)

// 1. First visit in a browser tab: the page comes first, under a plain cover that lifts on its own
const ctx = await browser.newContext(phone)
const page = await ctx.newPage()
watch(page, 'visitor')
await page.goto(BASE + '/', { waitUntil: 'commit' })
const splash = page.locator('#splash')
check((await splash.count()) === 0 || (await quiet(page)), 'kunjungan pertama di browser memutar animasi splash')
await page.waitForTimeout(900)
await shot(page, '01-splash')
const gone = await splash.waitFor({ state: 'detached', timeout: 5000 }).then(() => true, () => false)
check(gone, 'splash tidak hilang sendiri dalam 5 detik')
await page.getByRole('button', { name: /Masuk sebagai pengunjung/ }).waitFor()
await page.reload({ waitUntil: 'domcontentloaded' })
check(await quiet(page), 'splash muncul lagi di sesi yang sama')
console.log('first visit: plain cover, then gone')

// 2. Daftar on the visitor poster plays that role's splash, named, then the three steps, then signing up
await page.getByRole('button', { name: 'Daftar sebagai pengunjung' }).click()
await splash.waitFor({ timeout: 3000 })
check(await roleNamed(page, 'Pengunjung'), 'splash pengunjung tidak menyebut perannya')
await page.waitForTimeout(900)
await shot(page, '02-splash-pengunjung')
await splash.waitFor({ state: 'detached', timeout: 5000 })
await page.waitForURL(/\/app\/mulai\?daftar=1/)
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
await page.getByRole('button', { name: /^Lanjut daftar/ }).click()

// 3. Daftar: name first, then the number and the simulated OTP, auto-filled
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
check(await quiet(page), 'splash pengunjung muncul lagi di sesi yang sama')
console.log('daftar: Sinta Maharani signed up and is on Beranda')
await ctx.close()

// 4. Panitia, straight to /admin: the page comes first (plain cover), their three steps, then the email sign-in
const adminCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
const admin = await adminCtx.newPage()
watch(admin, 'admin')
await admin.goto(BASE + '/admin', { waitUntil: 'commit' })
check(await quiet(admin), 'membuka /admin langsung memutar animasi splash')
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
check(await quiet(admin), 'splash panitia muncul lagi di sesi yang sama')
check(/\/admin$/.test(admin.url()), 'panitia diminta masuk lagi setelah memuat ulang')
console.log('panitia: splash, onboarding, sign-in (wrong password refused), dashboard')
await adminCtx.close()

// 5. Petugas, Masuk from the role picker: the splash named Petugas, straight to the sign-in (no pengenalan), their home
const staffCtx = await browser.newContext(phone)
const staff = await staffCtx.newPage()
watch(staff, 'staff')
await staff.goto(BASE + '/', { waitUntil: 'networkidle' })
await staff.locator('#splash').waitFor({ state: 'detached', timeout: 5000 })
// the petugas poster sits elsewhere in the fan: bring it to the centre, then press its action
await toPoster(staff, 'Petugas')
await staff.getByRole('button', { name: /Masuk sebagai petugas/ }).click()
await staff.locator('#splash').waitFor({ timeout: 3000 })
check(await roleNamed(staff, 'Petugas'), 'splash petugas tidak menyebut perannya')
await staff.locator('#splash').waitFor({ state: 'detached', timeout: 5000 })
await staff.waitForURL(/\/staff\/masuk$/)
await staff.getByRole('button', { name: 'Isi otomatis' }).click()
await staff.getByRole('button', { name: 'Masuk', exact: true }).click()
await staff.waitForURL(/\/staff$/)
await staff.getByText('Halo,').first().waitFor()
console.log('petugas: Masuk, splash, sign-in without the pengenalan, home')
await staffCtx.close()

// 5b. The sample account skips the visitor intro: Rina on the visitor sign-in, then Beranda, never the intro
const rinaCtx = await browser.newContext(phone)
const rina = await rinaCtx.newPage()
watch(rina, 'rina')
await rina.goto(BASE + '/app/masuk', { waitUntil: 'networkidle' })
await rina.locator('#splash').waitFor({ state: 'detached', timeout: 6000 }).catch(() => {})
await rina.getByRole('button', { name: /Masuk sebagai Rina/ }).filter({ visible: true }).first().click()
await rina.waitForURL((u) => /\/app(\/mulai)?$/.test(u.pathname))
await rina.waitForTimeout(600)
check(!/\/app\/mulai/.test(rina.url()), 'masuk sebagai Rina lalu Beranda malah membuka pengenalan')
console.log('rina: sign-in sample account → Beranda without the intro')
await rinaCtx.close()

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

// 7. The team slide: a poster per member that the arrows move between, still one screen without scrolling
const timCtx = await browser.newContext(phone)
await skipIntro(timCtx)
const tim = await timCtx.newPage()
watch(tim, 'tim')
await tim.goto(BASE + '/', { waitUntil: 'networkidle' })
await tim.locator('#splash').waitFor({ state: 'detached', timeout: 6000 })
await tim.getByRole('tab', { name: 'Tim' }).click()
await tim.locator('.cc-root[data-ready]').waitFor({ timeout: 30000 })
const ruler = tim.getByRole('slider', { name: 'Anggota tim' })
check(/^Haikal/.test(await ruler.getAttribute('aria-valuetext')), 'slide tim tidak dibuka di poster pertama')
await tim.getByRole('button', { name: 'Anggota berikutnya', exact: true }).click()
await tim.locator('.cc-name', { hasText: 'Bintang' }).waitFor({ timeout: 5000 })
check(/^Bintang/.test(await ruler.getAttribute('aria-valuetext')), 'penggaris tidak mengikuti poster')
await tim.getByRole('button', { name: 'Anggota sebelumnya' }).click()
await tim.locator('.cc-name', { hasText: 'Haikal' }).waitFor({ timeout: 5000 })
check(await tim.evaluate(() => document.documentElement.scrollHeight === window.innerHeight), 'slide tim butuh scroll')
await shot(tim, 'tim')
console.log('tim: posters open, the arrows move between members, no scroll')
await timCtx.close()

// 8. The fan: a hovered poster stays whole, a tap on the front poster's body does nothing, a tap on a side poster brings
// it to the front
for (const [width, height] of [[1680, 938], [1440, 780], [1280, 720], [360, 640]]) {
  const touch = width < 700
  const fanCtx = await browser.newContext(touch ? { ...phone, viewport: { width, height } } : { viewport: { width, height } })
  await skipIntro(fanCtx)
  const fan = await fanCtx.newPage()
  watch(fan, 'kipas')
  await fan.goto(BASE + '/', { waitUntil: 'networkidle' })
  await fan.locator('#splash').waitFor({ state: 'detached', timeout: 6000 })
  await fan.locator('.af-cartel').first().waitFor()
  await fan.waitForTimeout(1500)
  // how much room the poster on top leaves to the scene's top and bottom edges: below 0 it is cut
  const headroom = () =>
    fan.evaluate(() => {
      const front = [...document.querySelectorAll('.af-cartel')].find((c) => c.style.zIndex === '30')
      const scene = document.querySelector('.af-escena').getBoundingClientRect()
      const r = front?.getBoundingClientRect()
      return r ? Math.round(Math.min(r.top - scene.top, scene.bottom - r.bottom)) : null
    })
  const whole = (room, what) => check(room !== null && room >= 0, `kipas ${width}x${height}: poster ${what} ${room === null ? 'tidak maju' : `terpotong ${-room} px`}`)
  const scene = await fan.locator('.af-escena').boundingBox()
  const posterW = await fan.locator('.af-cartel').first().evaluate((c) => c.offsetWidth)
  const x = scene.x + scene.width / 2
  const y = scene.y + (scene.height - 64) / 2
  if (!touch) {
    for (const side of [0]) {
      await fan.mouse.move(x + side * posterW, y, { steps: 3 })
      await fan.waitForTimeout(600)
      whole(await headroom(), 'yang di-hover')
    }
  }
  {
    // a tap on the front poster's body does nothing: same size, same page
    const front = () => fan.evaluate(() => [...document.querySelectorAll('.af-cartel')].find((c) => c.style.zIndex === '30')?.getBoundingClientRect().toJSON())
    const before = await front()
    await fan.mouse.click(x, y - posterW * 0.3)
    await fan.waitForTimeout(600)
    const after = await front()
    check(after && Math.abs(after.width - before.width) < 1 && Math.abs(after.top - before.top) < 1 && new URL(fan.url()).pathname === '/', `kipas ${width}x${height}: ketuk badan poster depan mengubah sesuatu`)
    whole(await headroom(), 'depan setelah diketuk')
    // a tap on the right neighbour's edge brings it to the front, and the role buttons follow
    const right = await fan.evaluate(() => {
      const cards = [...document.querySelectorAll('.af-cartel')]
      const c = cards.find((k) => k.getBoundingClientRect().left > cards.find((f) => f.style.zIndex === '30').getBoundingClientRect().left)
      const r = c.getBoundingClientRect()
      return { role: c.querySelector('h2').textContent, x: r.right - 22, y: r.top + r.height * 0.4 }
    })
    await fan.mouse.click(right.x, right.y)
    await fan.waitForTimeout(700)
    const now = await frontRole(fan)
    check(now === right.role, `kipas ${width}x${height}: ketuk poster samping ${right.role}, depan ${now}`)
  }
  await fanCtx.close()
}
console.log('kipas: hovered posters stay whole, a tap on the front poster does nothing, a tap on a side poster brings it to the front')

// 9. The fan on a phone, with real touch: after every arrow press, swipe and press right after a swipe, the poster in
// front is the one the circle Panitia → Pengunjung → Petugas says, and its two neighbours are mirrored (same offset and
// turn, opposite sides, opaque)
{
  const swipeCtx = await browser.newContext({ ...phone, viewport: { width: 375, height: 812 } })
  await skipIntro(swipeCtx)
  const fan = await swipeCtx.newPage()
  watch(fan, 'kipas-geser')
  await fan.goto(BASE + '/', { waitUntil: 'networkidle' })
  await fan.locator('#splash').waitFor({ state: 'detached', timeout: 6000 })
  await fan.locator('.af-cartel').first().waitFor()
  await fan.waitForTimeout(800)
  const cdp = await swipeCtx.newCDPSession(fan)
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] })
  const ORDER = ['Panitia', 'Pengunjung', 'Petugas']
  const next = fan.getByRole('button', { name: 'Poster berikutnya' })
  const prev = fan.getByRole('button', { name: 'Poster sebelumnya' })
  const arranged = async (when) => {
    await fan.waitForTimeout(700)
    const r = await fan.evaluate(() => {
      const cards = [...document.querySelectorAll('.af-cartel')].map((c) => {
        const m = new DOMMatrix(getComputedStyle(c).transform)
        return { role: c.querySelector('h2').textContent, x: Math.round(m.e), r: Math.round(Math.atan2(m.b, m.a) * 573), z: c.style.zIndex, a: getComputedStyle(c).opacity }
      })
      return { cards }
    })
    const front = r.cards.find((c) => c.z === '30')
    const [left, right] = [r.cards.find((c) => c.x < 0), r.cards.find((c) => c.x > 0)]
    const opaque = r.cards.every((c) => c.a === '1')
    const order = left && right && front && ORDER.indexOf(left.role) === (ORDER.indexOf(front.role) + 2) % 3 && ORDER.indexOf(right.role) === (ORDER.indexOf(front.role) + 1) % 3
    const ok = front && front.x === 0 && front.r === 0 && order && left.x === -right.x && left.r === -right.r && opaque
    check(ok, `kipas ${when}: depan ${front?.role} (x ${front?.x}), kiri ${left?.role} ${left?.x}/${left?.r}, kanan ${right?.role} ${right?.x}/${right?.r}, opasitas ${r.cards.map((c) => c.a)}`)
    return front?.role
  }
  check((await arranged('saat dibuka')) === 'Pengunjung', 'kipas tidak dibuka di poster Pengunjung')
  for (const [arrow, expect] of [[next, 'Petugas'], [next, 'Panitia'], [prev, 'Petugas'], [prev, 'Pengunjung']]) {
    await arrow.click()
    check((await arranged(`setelah panah ke ${expect}`)) === expect, `kipas: panah tidak berhenti di ${expect}`)
  }
  const scene = await fan.locator('.af-escena').boundingBox()
  const w = await fan.locator('.af-cartel').first().evaluate((c) => c.offsetWidth)
  const x0 = scene.x + scene.width / 2 + w * 0.4
  const y0 = scene.y + scene.height / 2
  for (const [dx, moves] of [[-w * 0.8, 30], [w * 2.5, 50], [-w * 0.6, 3]]) {
    await touch('touchStart', x0, y0)
    for (let i = 1; i <= moves; i++) await touch('touchMove', x0 + (dx * i) / moves, y0)
    await touch('touchEnd', 0, 0)
    await arranged(`setelah geser ${Math.round(dx)} px`)
  }
  // dragged slowly until the next poster is in front, held, let go: it stays on that poster, no step further
  for (const dx of [-w * 0.7, w * 0.7, -w * 3]) {
    await touch('touchStart', x0, y0)
    for (let i = 1; i <= 40; i++) {
      await touch('touchMove', x0 + (dx * i) / 40, y0)
      await fan.waitForTimeout(10)
    }
    await fan.waitForTimeout(300)
    const shown = await frontRole(fan)
    await touch('touchEnd', 0, 0)
    const after = await arranged(`setelah ditahan lalu dilepas (${Math.round(dx)} px)`)
    check(after === shown, `kipas: dilepas saat ${shown} di depan, berhenti di ${after}`)
  }
  // an arrow pressed while the fan is still settling from a swipe
  await touch('touchStart', x0, y0)
  for (let i = 1; i <= 20; i++) await touch('touchMove', x0 - (w * 0.7 * i) / 20, y0)
  await touch('touchEnd', 0, 0)
  await fan.waitForTimeout(120)
  await next.click()
  await arranged('setelah panah di tengah geseran')
  await swipeCtx.close()
  console.log('kipas: arrows, swipes and a press mid-swipe end with one poster in front, neighbours mirrored')
}

// 10. Daftar sebagai panitia: the pengenalan, then the sign-in that says how a panitia account comes about
{
  const joinCtx = await browser.newContext(phone)
  await skipIntro(joinCtx)
  const join = await joinCtx.newPage()
  watch(join, 'daftar-panitia')
  await join.goto(BASE + '/', { waitUntil: 'networkidle' })
  await join.locator('#splash').waitFor({ state: 'detached', timeout: 6000 })
  await toPoster(join, 'Panitia')
  await join.getByRole('button', { name: 'Daftar sebagai panitia' }).click()
  await join.waitForURL(/\/admin\/mulai\?daftar=1/)
  for (let i = 0; i < 2; i++) await join.getByRole('button', { name: /^Lanjuts*$/ }).click()
  await join.getByRole('button', { name: /^Lanjut daftar/ }).click()
  await join.waitForURL(/\/admin\/masuk\?daftar=1/)
  check(await join.getByRole('heading', { name: 'Daftar panitia' }).waitFor({ timeout: 5000 }).then(() => true, () => false), 'Daftar sebagai panitia tidak berakhir di layar daftar panitia')
  await joinCtx.close()
  console.log('daftar panitia: pengenalan, then the panitia sign-up screen')
}

await browser.close()
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'onboarding: all checks passed')
process.exitCode = errors.length ? 1 : 0
