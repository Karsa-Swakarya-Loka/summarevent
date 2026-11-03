#!/usr/bin/env node
/**
 * Screenshot helper (uses the installed Google Chrome via playwright-core).
 *   node scripts/shot.mjs [--base http://localhost:5173] [--desktop] [--out shots] /app /app/pass ...
 * Prints console errors / page errors so broken pages are caught.
 * Note: each run is a fresh browser profile → the mock seeds fresh demo data. The splash and the first-run onboarding
 * are skipped (open /app/mulai, /admin/mulai or /staff/mulai to capture one), and panitia and petugas pages are opened
 * signed in with the demo account.
 */
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
import { signIn, skipIntro } from '../e2e/skip-intro.mjs'

const args = process.argv.slice(2)
let base = 'http://localhost:5173'
let out = 'shots'
let desktop = false
const paths = []
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--base') base = args[++i]
  else if (a === '--out') out = args[++i]
  else if (a === '--desktop') desktop = true
  else paths.push(a)
}
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const ctx = await browser.newContext(
  desktop ? { viewport: { width: 1366, height: 900 } } : { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
)
await skipIntro(ctx)
const page = await ctx.newPage()
page.on('console', (m) => { if (m.type() === 'error') console.log(`[console.error] ${m.text()}`) })
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`))
const signedIn = new Set()
for (const p of paths) {
  const role = /^\/admin(\/|$)/.test(p) ? 'ADMIN' : /^\/staff(\/|$)/.test(p) ? 'STAFF' : null
  if (role && !signedIn.has(role) && !/\/(masuk|mulai)\/?$/.test(p)) {
    await signIn(page, role, base)
    signedIn.add(role)
  }
  await page.goto(base + p, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const file = path.join(out, (desktop ? 'd' : 'm') + (p.replace(/[^a-z0-9]+/gi, '_') || '_root') + '.png')
  await page.screenshot({ path: file, fullPage: true })
  console.log('saved', file)
}
await browser.close()
