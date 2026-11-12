/**
 * The splash plays once per session for the web and for each role, and every role has a first-run onboarding. Suites
 * and screenshot scripts about something else start past them; e2e/onboarding.mjs tests them on purpose.
 */
export const skipIntro = (ctx) =>
  ctx.addInitScript(() => {
    for (const scope of ['', ':app', ':admin', ':staff']) sessionStorage.setItem(`summarevent:splash${scope}`, '1')
    for (const role of ['', ':admin', ':staff']) localStorage.setItem(`summarevent:onboarding${role}`, 'done')
  })

/**
 * Panitia and petugas sign in before their pages open: through the sign-in screen with its demo account, so the same
 * step works against the mock and against a backend.
 */
export async function signIn(page, role, base = process.env.BASE || 'http://localhost:5173') {
  const area = role === 'ADMIN' ? 'admin' : 'staff'
  await page.goto(`${base}/${area}/masuk`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Isi otomatis' }).click()
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await page.waitForURL((url) => url.pathname.startsWith(`/${area}`) && !url.pathname.endsWith('/masuk'))
}

/** Rina, the visitor persona with tickets: the sample account on the visitor's sign-in, straight on to Pass Saya. */
export async function asRina(page) {
  const base = new URL(page.url()).origin
  await page.goto(`${base}/app/masuk?next=${encodeURIComponent('/app/pass')}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Masuk sebagai Rina/ }).filter({ visible: true }).first().click()
  await page.waitForURL(/\/app\/pass/)
}

/** The role picker's fan: the poster in front is the one with the highest stacking order. */
export const frontRole = (page) => page.evaluate(() => [...document.querySelectorAll('.af-cartel')].find((c) => c.style.zIndex === '30')?.querySelector('h2')?.textContent)

/**
 * The role picker is a fan of posters where only the one in front is whole: a suite brings the poster it wants to the
 * front with the arrows before pressing an action printed on it.
 */
export async function toPoster(page, title) {
  for (let i = 0; i < 3 && (await frontRole(page)) !== title; i++) {
    await page.getByRole('button', { name: 'Poster berikutnya' }).click()
    // the fan settles before the next press
    await page.waitForTimeout(550)
  }
}
