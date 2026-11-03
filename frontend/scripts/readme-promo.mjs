#!/usr/bin/env node
/**
 * Regenerates the four promo cards at the top of the README (docs/gambar/promo-*.webp), laid out like app store
 * screenshots: a kicker and a display headline on a brand colour, the running app inside a drawn phone (bezel, island,
 * side buttons, a status bar in the screen's own colours, cut off at the bottom), and one of the app's stickers
 * stepping out of the screen. The phone is drawn here, not taken from a maker's product images.
 *
 *   npm run dev                       # in another terminal
 *   node scripts/readme-promo.mjs     # needs cwebp (brew install webp)
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { signIn, skipIntro } from '../e2e/skip-intro.mjs'

const BASE = process.env.BASE || 'http://localhost:5173'
const OUT = path.resolve(import.meta.dirname, '../../docs/gambar')
const FONTS = path.resolve(import.meta.dirname, '../node_modules/@fontsource')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'summarevent-promo-'))
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})
// an iPhone-sized screen at its own pixel density, with the space the status bar and the home bar take
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }

async function capture(name, steps) {
  const ctx = await browser.newContext(phone)
  await skipIntro(ctx)
  await ctx.grantPermissions(['camera'], { origin: BASE })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34, left: 0, right: 0 } })
  await steps(page)
  // the demo switcher and the toasts are for judges, not for the poster
  await page.addStyleTag({ content: 'button[aria-label="Menu demo"], [data-sonner-toaster] { display: none !important; }' })
  await page.waitForTimeout(900)
  const file = path.join(tmp, `${name}.png`)
  await page.screenshot({ path: file })
  await ctx.close()
  return file
}

/** The app's stickers at their resting frame, drawn by the app's own kit onto a transparent canvas. */
async function stickers(names) {
  const page = await browser.newPage()
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  // imported inside the page, from the dev server, which compiles the kit on the fly
  const urls = await page.evaluate(async ({ list, dir }) => {
    const kit = await import(`${dir}/fun.ts`)
    const icons = await import(`${dir}/icons.ts`)
    return Object.fromEntries(
      list.map((n) => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1000
        const ctx = canvas.getContext('2d')
        ctx.scale(2, 2)
        kit.draw(ctx, icons[n], icons[n].still ?? 0, icons.SUMMA)
        return [n, canvas.toDataURL('image/png')]
      }),
    )
  }, { list: names, dir: '/src/components/stickers' })
  await page.close()
  return Object.fromEntries(
    Object.entries(urls).map(([n, url]) => {
      const file = path.join(tmp, `sticker-${n}.png`)
      fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'))
      return [n, file]
    }),
  )
}

const pickCategory = (page, name) => page.getByRole('radiogroup', { name: 'Kategori tiket' }).getByRole('radio', { name: new RegExp(name) }).click()

const cards = [
  {
    file: 'promo-1-denah',
    tone: 'green',
    kicker: 'Denah live',
    title: 'Pilih kursimu <em>sendiri</em>',
    sub: 'Ketuk kursi kosong, atau biar dipilihkan yang berdampingan.',
    sticker: { name: 'kursi', style: 'left:-6px;top:690px;transform:rotate(-9deg)' },
    alt: 'Pilih kursimu sendiri: denah Sangkuriang diperbesar ke kategori Reguler dengan dua kursi terpilih, di dalam HP',
    shot: () =>
      capture('denah', async (page) => {
        await page.goto(BASE + '/app/e/pentas-musikal-sangkuriang/s/ses_sk_16', { waitUntil: 'networkidle' })
        await pickCategory(page, 'Reguler')
        await page.getByRole('button', { name: /Pilihkan 2 kursi/ }).click()
      }),
  },
  {
    file: 'promo-2-rebutan',
    tone: 'orange',
    kicker: 'Anti pesan dobel',
    title: 'Satu kursi, <em>satu</em> pemesan',
    sub: 'Kalah rebutan sepersekian detik? Langsung ditawari kursi terdekat.',
    sticker: { name: 'padlock', style: 'right:-14px;top:640px;transform:rotate(10deg)' },
    alt: 'Satu kursi, satu pemesan: pesan bentrok kursi baru saja dipilih orang lain, dengan tombol pindah ke kursi saran',
    shot: () =>
      capture('rebutan', async (page) => {
        await page.goto(BASE + '/app/e/pentas-musikal-sangkuriang/s/ses_sk_13', { waitUntil: 'networkidle' })
        await pickCategory(page, 'VIP')
        await page.getByRole('button', { name: /Pilihkan 2 kursi/ }).click()
        await page.waitForTimeout(500)
        await page.getByRole('button', { name: 'Uji rebutan kursi' }).click()
        await page.getByRole('alert').filter({ hasText: 'baru saja dipilih orang lain' }).waitFor()
      }),
  },
  {
    file: 'promo-3-pass',
    tone: 'yellow',
    kicker: 'E-ticket',
    title: 'Satu QR untuk <em>tiap</em> kursi',
    sub: 'Tiket hitam dengan talon yang bisa disobek, tersimpan di Pass Saya.',
    sticker: { name: 'tiket', style: 'left:-16px;top:650px;transform:rotate(-10deg)' },
    alt: 'Satu QR untuk tiap kursi: e-ticket hitam kursi G5 dengan QR dan talon, di dalam HP',
    shot: () =>
      capture('tiket', async (page) => {
        await page.goto(BASE + '/', { waitUntil: 'networkidle' })
        await page.getByRole('button', { name: /masuk cepat sebagai Rina/ }).click()
        await page.locator('article[aria-label^="E-ticket"] a').first().click()
        await page.getByRole('button', { name: /Perbesar QR/ }).waitFor()
        await page.waitForTimeout(2600) // the QR assembles, then reads valid
      }),
  },
  {
    file: 'promo-4-scan',
    tone: 'ink',
    kicker: 'Petugas',
    title: 'Scan, <em>terbaca</em> dari jauh',
    sub: 'Valid, Sudah digunakan, atau Tidak valid, dengan bunyi dan getar berbeda.',
    sticker: { name: 'camera', style: 'right:-10px;top:680px;transform:rotate(9deg)' },
    alt: 'Scan di pintu: layar petugas hijau Valid dengan nomor kursi besar, di dalam HP',
    shot: () =>
      capture('scan', async (page) => {
        await signIn(page, 'STAFF', BASE)
        await page.goto(BASE + '/staff/scan/ses_sk_demo', { waitUntil: 'networkidle' })
        // the sample ticket is picked at random; a seat number reads better on a poster than "Tanpa nomor kursi"
        for (let i = 0; i < 8; i++) {
          const sample = page.getByRole('button', { name: 'Ambil tiket contoh' })
          if (!(await sample.isVisible())) await page.getByRole('button', { name: /Alat bantu demo/ }).click()
          await sample.click()
          const result = page.locator('section[data-result]')
          await result.waitFor()
          if (!(await result.getByText('Tanpa nomor kursi').count())) break
          await result.locator('button', { hasText: /Scan berikutnya/ }).last().click()
          await result.waitFor({ state: 'detached' })
        }
      }),
  },
]

const TONES = {
  green: { bg: '#006426', fg: '#fff6e6', em: 'color:#fedc01', pill: 'rgba(255,246,230,.14)', glow: 'rgba(255,255,255,.2)' },
  orange: { bg: '#f26f22', fg: '#231f20', em: 'color:#fff6e6', pill: 'rgba(35,31,32,.12)', glow: 'rgba(255,240,220,.35)' },
  yellow: { bg: '#fedc01', fg: '#231f20', em: 'color:#006426', pill: 'rgba(35,31,32,.1)', glow: 'rgba(255,255,255,.45)' },
  ink: { bg: '#231f20', fg: '#fff6e6', em: 'color:#2fb36d', pill: 'rgba(255,246,230,.12)', glow: 'rgba(47,179,109,.22)' },
}

const card = (c, shot, sticker) => {
  const t = TONES[c.tone]
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'PJS'; src: url('file://${FONTS}-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2') format('woff2'); font-weight: 200 800; }
@font-face { font-family: 'Anton'; src: url('file://${FONTS}/anton/files/anton-latin-400-normal.woff2') format('woff2'); }
* { margin: 0; box-sizing: border-box; }
body { width: 540px; height: 960px; overflow: hidden; position: relative; background: ${t.bg}; color: ${t.fg}; font-family: 'PJS', sans-serif; }
.dots { position: absolute; inset: 0; background-image: radial-gradient(circle, currentColor 1.6px, transparent 2.2px); background-size: 22px 22px; opacity: .09; }
.glow { position: absolute; left: 50%; top: 640px; width: 760px; height: 760px; translate: -50% -50%; border-radius: 50%; background: radial-gradient(closest-side, ${t.glow}, transparent); }
header { position: relative; padding: 50px 38px 0; text-align: center; }
.kicker { display: inline-block; padding: 9px 15px 8px; border-radius: 999px; background: ${t.pill}; font-size: 12px; font-weight: 800; letter-spacing: .22em; text-transform: uppercase; }
h1 { margin-top: 16px; font-family: 'Anton', sans-serif; font-weight: 400; font-size: 64px; line-height: .94; text-transform: uppercase; text-wrap: balance; }
h1 em { font-style: normal; ${t.em}; }
p { margin: 14px auto 0; max-width: 390px; font-size: 18px; line-height: 1.4; font-weight: 500; opacity: .86; text-wrap: balance; }
.phone { position: absolute; left: 50%; top: 318px; width: 330px; height: 679px; translate: -50% 0; }
.frame { position: absolute; inset: 0; border-radius: 58px; padding: 5px; background: linear-gradient(150deg, #5b5b60, #1d1d1f 32%, #3c3c40 58%, #141416 80%, #4a4a4e);
  box-shadow: 0 50px 90px -24px rgba(0,0,0,.55), 0 18px 34px -18px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.12); }
.bezel { position: absolute; inset: 5px; border-radius: 53px; background: #050505; }
.screen { position: absolute; inset: 15px; border-radius: 43px; overflow: hidden; background: #000; }
.screen img { display: block; width: 100%; }
.island { position: absolute; top: 11px; left: 50%; translate: -50% 0; width: 98px; height: 29px; border-radius: 20px; background: #000; }
.status { position: absolute; inset: 0 0 auto; height: 46px; display: flex; align-items: center; justify-content: space-between; padding: 4px 26px 0 36px; font-size: 15px; font-weight: 700; }
.status svg { display: block; }
.btn { position: absolute; width: 4px; border-radius: 3px; background: linear-gradient(90deg, #232325, #6a6a6f); }
.sticker { position: absolute; width: 196px; filter: drop-shadow(0 20px 22px rgba(0,0,0,.32)); }
</style></head><body>
<div class="dots"></div><div class="glow"></div>
<header><span class="kicker">${c.kicker}</span><h1>${c.title}</h1><p>${c.sub}</p></header>
<div class="phone">
  <span class="btn" style="left:-3px;top:112px;height:30px"></span>
  <span class="btn" style="left:-3px;top:162px;height:54px"></span>
  <span class="btn" style="left:-3px;top:226px;height:54px"></span>
  <span class="btn" style="right:-3px;top:190px;height:88px;transform:scaleX(-1)"></span>
  <div class="frame"><div class="bezel"></div></div>
  <div class="screen">
    <img src="data:image/png;base64,${fs.readFileSync(shot).toString('base64')}">
    <div class="status" id="status">
      <span>9.41</span>
      <span style="display:flex;gap:6px;align-items:center">
        <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor"><path d="M8 2.2c2.4 0 4.6.9 6.2 2.5l1.3-1.3A10.6 10.6 0 0 0 8 .4C5.1.4 2.5 1.5.5 3.4l1.3 1.3A8.8 8.8 0 0 1 8 2.2Zm0 3.6c1.4 0 2.7.5 3.6 1.4l1.3-1.3A7 7 0 0 0 8 4c-1.9 0-3.6.7-4.9 1.9l1.3 1.3c1-.9 2.2-1.4 3.6-1.4Zm0 3.6c-.5 0-1 .2-1.3.5L8 11.6l1.3-1.7c-.3-.3-.8-.5-1.3-.5Z"/></svg>
        <svg width="27" height="13" viewBox="0 0 27 13" fill="none"><rect x=".5" y=".5" width="23" height="12" rx="3.5" stroke="currentColor" opacity=".45"/><rect x="2" y="2" width="19" height="9" rx="2" fill="currentColor"/><path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill="currentColor" opacity=".5"/></svg>
      </span>
    </div>
    <div class="island"></div>
  </div>
</div>
<img class="sticker" style="${c.sticker.style}" src="file://${sticker}">
<script>
  // the status bar takes the colour that suits the top of the screen, as iOS does (inlined, so it can be read)
  const img = document.querySelector('.screen img')
  img.decode().then(() => {
    const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = 120
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, cv.width, cv.height).data
    let sum = 0
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
    document.getElementById('status').style.color = sum / (d.length / 4) < 140 ? '#fff' : '#000'
    document.body.dataset.ready = '1'
  })
</script>
</body></html>`
}

const art = await stickers([...new Set(cards.map((c) => c.sticker.name))])
const render = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 })
for (const c of cards) {
  const shot = await c.shot()
  const html = path.join(tmp, `${c.file}.html`)
  fs.writeFileSync(html, card(c, shot, art[c.sticker.name]))
  await render.goto('file://' + html)
  await render.evaluate(() => document.fonts.ready)
  await render.locator('body[data-ready]').waitFor()
  const png = path.join(tmp, `${c.file}.png`)
  await render.screenshot({ path: png })
  execFileSync('cwebp', ['-quiet', '-q', '82', png, '-o', path.join(OUT, `${c.file}.webp`)])
  console.log(`docs/gambar/${c.file}.webp  ·  alt: ${c.alt}`)
}
await browser.close()
fs.rmSync(tmp, { recursive: true, force: true })
